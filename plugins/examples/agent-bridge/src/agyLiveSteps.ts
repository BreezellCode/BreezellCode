/*
 * agy's model steps as they are written. Its stream says nothing while its model thinks, and its transcript holds a
 * step only once the step is done; its own record of the conversation (`conversations/<id>.db`, SQLite in WAL mode)
 * holds each model step while it is written: its thought (field 20.3 of the step's payload) and its words (20.1),
 * longer each time agy writes. Only those two are read, and never written: the database is opened read-only.
 *
 * An agy in WSL, read from Windows (`\\wsl$\…`), cannot be opened where it is (SQLite's locks do not cross over to
 * Windows: "database is locked"): it is read from a copy of this computer's, the database copied again when it changes,
 * its log (`-wal`, where the steps being written are) taken as it grows.
 */
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

/** A model step as agy has written it so far. */
export interface AgyModelStep {
	readonly thinking: string;
	readonly text: string;
}

/** A conversation's record, read again each time. */
export interface AgyLiveSteps {
	/** Its model steps from this one on, as written now; none when it cannot be read now. */
	read(from: number): Promise<Map<number, AgyModelStep> | undefined>;
	dispose(): void;
}

/** Where agy keeps its record of a conversation, in its own folder (antigravity.ts agyConfigDir); none for an id it would not give. */
export function agyDatabasePath(configDir: string, conversation: string): string | undefined {
	if (!/^[A-Za-z0-9][A-Za-z0-9_-]{7,80}$/.test(conversation)) {
		return undefined;
	}
	const join = /^[A-Za-z]:[\\/]|^\\\\/.test(configDir) ? path.win32.join : path.posix.join;
	return join(configDir, 'conversations', `${conversation}.db`);
}

type Database = { prepare(sql: string): { all(...values: unknown[]): Record<string, unknown>[] }; close(): void };
type Sqlite = { DatabaseSync: new (file: string, options?: { readOnly?: boolean }) => Database };
let sqlite: Sqlite | null | undefined;
/** Node's own SQLite (Node 22.5 on): a Breezell whose Node has none reads no thoughts while they are written. */
function sqliteOf(): Sqlite | undefined {
	if (sqlite === undefined) {
		try {
			sqlite = require('node:sqlite') as Sqlite;
		} catch {
			sqlite = null;
		}
	}
	return sqlite ?? undefined;
}

/** A database of agy's in WSL, as Windows reaches it. */
const inWslShare = (file: string) => /^(?:\\\\|\/\/)wsl(?:\$|\.localhost)[\\/]/i.test(file);

/** Reads a conversation's record where it can be read; none when this Node has no SQLite. `copy`: from a copy of it (as an agy in WSL is); tests say. */
export function agyLiveSteps(file: string, options?: { readonly copy?: boolean }): AgyLiveSteps | undefined {
	const sql = sqliteOf();
	if (!sql) {
		return undefined;
	}
	return options?.copy ?? inWslShare(file) ? new CopiedDatabase(sql, file) : new OpenedDatabase(sql, file);
}

const STEPS_FROM = 'select idx, step_payload from steps where idx >= ? order by idx';

function stepsOf(sql: Sqlite, file: string, from: number): Map<number, AgyModelStep> | undefined {
	let db: Database | undefined;
	try {
		db = new sql.DatabaseSync(file, { readOnly: true });
		const out = new Map<number, AgyModelStep>();
		for (const row of db.prepare(STEPS_FROM).all(from)) {
			const payload = row.step_payload;
			const step = typeof row.idx === 'number' && payload instanceof Uint8Array ? agyModelStepOf(payload) : undefined;
			if (step) {
				out.set(row.idx as number, step);
			}
		}
		return out;
	} catch {
		// Not there yet, being written, or not one of agy's: nothing now.
		return undefined;
	} finally {
		try {
			db?.close();
		} catch {
			// Closed already.
		}
	}
}

/** Read where it is (agy on this computer). */
class OpenedDatabase implements AgyLiveSteps {
	constructor(private readonly sql: Sqlite, private readonly file: string) { }
	async read(from: number) {
		return stepsOf(this.sql, this.file, from);
	}
	dispose() { }
}

/** A database larger than this is not copied: its thoughts come once each step is done. */
const COPY_MAX_BYTES = 64 * 1024 * 1024;
/** The start of a WAL log: when it changes, the log was started again. */
const WAL_HEAD_BYTES = 32;

/** Read from a copy kept here: the database when it changed, its log as it grows. */
class CopiedDatabase implements AgyLiveSteps {
	private folder: string | undefined;
	private stamp = '';
	private walHead: Buffer | undefined;
	private walCopied = 0;
	private disposed = false;

	constructor(private readonly sql: Sqlite, private readonly file: string) { }

	async read(from: number) {
		try {
			const copy = await this.update();
			return copy ? stepsOf(this.sql, copy, from) : undefined;
		} catch {
			return undefined;
		}
	}

	private async update(): Promise<string | undefined> {
		const stat = await fs.promises.stat(this.file);
		if (stat.size > COPY_MAX_BYTES || this.disposed) {
			return undefined;
		}
		this.folder ??= await fs.promises.mkdtemp(path.join(os.tmpdir(), 'agent-bridge-agydb-'));
		const copy = path.join(this.folder, 'conversation.db');
		const stamp = `${stat.size}:${stat.mtimeMs}`;
		let fresh = false;
		if (stamp !== this.stamp) {
			await fs.promises.copyFile(this.file, copy);
			this.stamp = stamp;
			fresh = true;
		}
		const log = await fs.promises.open(`${this.file}-wal`, 'r').catch(() => undefined);
		try {
			const size = log ? (await log.stat()).size : 0;
			const head = Buffer.alloc(WAL_HEAD_BYTES);
			if (log && size >= WAL_HEAD_BYTES) {
				await log.read(head, 0, WAL_HEAD_BYTES, 0);
			}
			// Begun again, cut, or of an older copy of the database: copied from its start.
			if (fresh || !log || size < this.walCopied || !this.walHead?.equals(head)) {
				await fs.promises.writeFile(`${copy}-wal`, Buffer.alloc(0));
				this.walCopied = 0;
				this.walHead = head;
			}
			if (log && size > this.walCopied) {
				const more = Buffer.alloc(size - this.walCopied);
				const { bytesRead } = await log.read(more, 0, more.length, this.walCopied);
				await fs.promises.appendFile(`${copy}-wal`, more.subarray(0, bytesRead));
				this.walCopied += bytesRead;
			}
		} finally {
			await log?.close().catch(() => undefined);
		}
		// Its index is made again from the log as it is now.
		await fs.promises.rm(`${copy}-shm`, { force: true });
		return copy;
	}

	dispose() {
		this.disposed = true;
		if (this.folder) {
			fs.rmSync(this.folder, { recursive: true, force: true });
		}
	}
}

/** A protobuf varint at `at`: its value and where the next field begins; none past the end. */
function varintAt(bytes: Uint8Array, at: number): [number, number] | undefined {
	let value = 0;
	for (let shift = 0; at < bytes.length && shift < 64; shift += 7) {
		const byte = bytes[at++];
		value += (byte & 0x7f) * 2 ** shift;
		if (byte < 0x80) {
			return [value, at];
		}
	}
	return undefined;
}

/** The first length-delimited field `want` of a protobuf message; none when it has none or is not one. */
function fieldOf(bytes: Uint8Array, want: number): Uint8Array | undefined {
	let at = 0;
	while (at < bytes.length) {
		const key = varintAt(bytes, at);
		if (!key) {
			return undefined;
		}
		at = key[1];
		const field = Math.floor(key[0] / 8);
		switch (key[0] % 8) {
			case 0: {
				const skipped = varintAt(bytes, at);
				if (!skipped) {
					return undefined;
				}
				at = skipped[1];
				break;
			}
			case 1: at += 8; break;
			case 5: at += 4; break;
			case 2: {
				const length = varintAt(bytes, at);
				if (!length || length[1] + length[0] > bytes.length) {
					return undefined;
				}
				const value = bytes.subarray(length[1], length[1] + length[0]);
				if (field === want) {
					return value;
				}
				at = length[1] + length[0];
				break;
			}
			default: return undefined;
		}
	}
	return undefined;
}

const utf8 = new TextDecoder('utf-8');

/** A step's model response (payload field 20): its thought and words so far; none for a step of another kind. */
export function agyModelStepOf(payload: Uint8Array): AgyModelStep | undefined {
	const response = fieldOf(payload, 20);
	if (!response) {
		return undefined;
	}
	const thinking = fieldOf(response, 3);
	const text = fieldOf(response, 1);
	return { thinking: thinking ? utf8.decode(thinking) : '', text: text ? utf8.decode(text) : '' };
}
