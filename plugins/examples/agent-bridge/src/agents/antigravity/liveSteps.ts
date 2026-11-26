/*
 * agy's model steps as they are written. Its stream says nothing while its model thinks, and its transcript holds a
 * step only once the step is done; its own record of the conversation (`conversations/<id>.db`, SQLite in WAL mode)
 * holds each model step while it is written: its thought (field 20.3 of the step's payload) and its words (20.1),
 * longer each time agy writes. Only those two are read, and never written: agy's database is opened read-only.
 *
 * It is read every few hundred milliseconds while agy's model works, so a read does no more than what changed asks:
 * nothing at all while agy wrote nothing; otherwise each step's size first (SQLite tells it without loading the
 * step), and only the steps whose size changed are loaded and decoded.
 *
 * An agy in WSL, read from Windows (`\\wsl$\…`), cannot be opened where it is (SQLite's locks do not cross over to
 * Windows: "database is locked"): it is read from a copy of this computer's. The database is copied once; then agy's
 * log (`-wal`, where every change is written first) is followed frame by frame as SQLite's file format lays it out,
 * each committed frame's page written into the copy, checked by the log's own checksums. A log begun again (after
 * agy's checkpoints, over its old frames, the file no shorter) is followed from its start; only when frames may have
 * been missed (a log cut short, or begun again past where it was read) is the database copied again.
 */
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { isAgentId, joinFor } from '../../core/paths';

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

/** Where agy keeps its record of a conversation, in its own folder (program.ts agyConfigDir); none for an id it would not give. */
export function agyDatabasePath(configDir: string, conversation: string): string | undefined {
	return isAgentId(conversation) ? joinFor(configDir)(configDir, 'conversations', `${conversation}.db`) : undefined;
}

type Statement = { all(...values: unknown[]): Record<string, unknown>[]; get(...values: unknown[]): Record<string, unknown> | undefined };
type Database = { prepare(sql: string): Statement; close(): void };
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

/** Each step's size, without loading it (SQLite answers length() of a blob from its record's header). */
const SIZES_FROM = 'select idx, length(step_payload) as size from steps where idx >= ? order by idx';
const STEP_AT = 'select step_payload from steps where idx = ?';

/**
 * The steps read so far, and the size each had then: a step is loaded again only once its size changed. agy writes a
 * model step anew, longer, each time its thought or its words grow, so a thought that grew is always a step whose size
 * changed. (A step written back to a size it had before, with another text, would be loaded again once its size
 * changes again: agy does not write steps so, and a thought is told only as it grows.)
 */
class StepCache {
	private readonly sizes = new Map<number, unknown>();
	private readonly steps = new Map<number, AgyModelStep>();
	private order: number[] = [];

	/** Reads what changed of the steps from `from` on (through an open database's statements). */
	refresh(statements: { readonly sizes: Statement; readonly step: Statement }, from: number): void {
		const rows = statements.sizes.all(from);
		const order: number[] = [];
		for (const row of rows) {
			const idx = row.idx;
			if (typeof idx !== 'number') {
				continue;
			}
			order.push(idx);
			if (this.sizes.has(idx) && this.sizes.get(idx) === row.size) {
				continue;
			}
			const payload = statements.step.get(idx)?.step_payload;
			const step = payload instanceof Uint8Array ? agyModelStepOf(payload) : undefined;
			this.sizes.set(idx, row.size);
			if (step) {
				this.steps.set(idx, step);
			} else {
				this.steps.delete(idx);
			}
		}
		// Steps no longer there (from `from` on) are forgotten.
		const there = new Set(order);
		for (const idx of [...this.sizes.keys()]) {
			if (idx >= from && !there.has(idx)) {
				this.sizes.delete(idx);
				this.steps.delete(idx);
			}
		}
		this.order = order;
	}

	/** The model steps from `from` on, in their order. */
	view(from: number): Map<number, AgyModelStep> {
		const out = new Map<number, AgyModelStep>();
		for (const idx of this.order) {
			const step = idx >= from ? this.steps.get(idx) : undefined;
			if (step) {
				out.set(idx, step);
			}
		}
		return out;
	}
}

/**
 * Read where it is (agy on this computer), through one connection kept open for the turn: SQLite's data_version says
 * whether another connection (agy's) committed anything since the last read, and nothing is read while it did not.
 */
class OpenedDatabase implements AgyLiveSteps {
	private db: { readonly db: Database; readonly sizes: Statement; readonly step: Statement; readonly version: Statement } | undefined;
	private readonly cache = new StepCache();
	private seen: { readonly version: unknown; readonly from: number } | undefined;

	constructor(private readonly sql: Sqlite, private readonly file: string) { }

	async read(from: number): Promise<Map<number, AgyModelStep> | undefined> {
		try {
			const open = this.db ??= this.open();
			const version = open.version.get()?.data_version;
			if (!this.seen || this.seen.version !== version || this.seen.from !== from) {
				this.cache.refresh(open, from);
				this.seen = { version, from };
			}
			return this.cache.view(from);
		} catch {
			// Not there yet, being written, or not one of agy's: nothing now; opened again next time.
			this.close();
			return undefined;
		}
	}

	dispose(): void {
		this.close();
	}

	private open() {
		const db = new this.sql.DatabaseSync(this.file, { readOnly: true });
		try {
			return { db, sizes: db.prepare(SIZES_FROM), step: db.prepare(STEP_AT), version: db.prepare('pragma data_version') };
		} catch (error) {
			db.close();
			throw error;
		}
	}

	private close(): void {
		const open = this.db;
		this.db = undefined;
		this.seen = undefined;
		try {
			open?.db.close();
		} catch {
			// Closed already.
		}
	}
}

/** A database larger than this is not copied: its thoughts come once each step is done. */
const COPY_MAX_BYTES = 64 * 1024 * 1024;
/** After a copy could not be made (the database and its log moving under it), how long until the next try. */
const COPY_RETRY_MS = 2_000;
const WAL_HEADER_BYTES = 32;
const FRAME_HEADER_BYTES = 24;
/** How much of the log is read at a time: a few frames, more only while they are valid. */
const LOG_READ_BYTES = 256 * 1024;

/** A log's header, as SQLite writes it: its byte order of checksums, its page size, its salts and its checksum. */
type LogHeader = { readonly bigEndian: boolean; readonly pageSize: number; readonly salt1: number; readonly salt2: number; readonly sum1: number; readonly sum2: number };

/** SQLite's WAL checksum of `bytes`, going on from (s1, s2): 32-bit words in the log's byte order, two at a time. */
function walChecksum(bytes: Buffer, bigEndian: boolean, s1: number, s2: number): [number, number] {
	for (let at = 0; at + 8 <= bytes.length; at += 8) {
		const x0 = bigEndian ? bytes.readUInt32BE(at) : bytes.readUInt32LE(at);
		const x1 = bigEndian ? bytes.readUInt32BE(at + 4) : bytes.readUInt32LE(at + 4);
		s1 = (s1 + x0 + s2) >>> 0;
		s2 = (s2 + x1 + s1) >>> 0;
	}
	return [s1, s2];
}

/** A log's header when it is one (its magic, a page size, its own checksum right); none otherwise (not begun yet). */
function logHeaderOf(bytes: Buffer): LogHeader | undefined {
	if (bytes.length < WAL_HEADER_BYTES) {
		return undefined;
	}
	const magic = bytes.readUInt32BE(0);
	if (magic !== 0x377f0682 && magic !== 0x377f0683) {
		return undefined;
	}
	const bigEndian = magic === 0x377f0683;
	const pageSize = bytes.readUInt32BE(8);
	if (pageSize < 512 || pageSize > 65536 || (pageSize & (pageSize - 1)) !== 0) {
		return undefined;
	}
	const [sum1, sum2] = walChecksum(bytes.subarray(0, 24), bigEndian, 0, 0);
	if (sum1 !== bytes.readUInt32BE(24) || sum2 !== bytes.readUInt32BE(28)) {
		return undefined;
	}
	return { bigEndian, pageSize, salt1: bytes.readUInt32BE(16), salt2: bytes.readUInt32BE(20), sum1, sum2 };
}

/** How far a log of one generation (its header) was followed: to the end of its last commit, with its checksum there. */
type Followed = { readonly header: LogHeader; offset: number; sum1: number; sum2: number };

/** The bytes of a database's header that say it keeps a log (2, 2): a copy says 1, 1, so SQLite reads it as it is. */
const FORMAT_VERSIONS_AT = 18;
const ROLLBACK_FORMAT = Buffer.from([1, 1]);

/**
 * Read from a copy kept here: the database copied once, then agy's log followed and written into it, a committed
 * transaction at a time. The copy keeps no log of its own: SQLite reads it as a plain database.
 */
class CopiedDatabase implements AgyLiveSteps {
	private folder: string | undefined;
	private copy: fs.promises.FileHandle | undefined;
	/** The log as followed (none: there was none to follow when the database was copied). */
	private log: Followed | undefined;
	/** The log file as it was at the last read (its size and time): unchanged, nothing was written. */
	private logStamp: string | undefined;
	/** Its largest size seen: a log shorter than that was cut (a checkpoint that truncated it). */
	private logSize = 0;
	/** The copy holds the database as agy has committed it, up to `log`. */
	private copied = false;
	/** The copy changed since its steps were last read. */
	private changed = true;
	private readonly cache = new StepCache();
	private lastFrom: number | undefined;
	private copyFailedAt: number | undefined;
	private disposed = false;

	constructor(private readonly sql: Sqlite, private readonly file: string) { }

	async read(from: number): Promise<Map<number, AgyModelStep> | undefined> {
		try {
			if (!await this.update()) {
				return undefined;
			}
		} catch {
			// Being written as it was read: the database copied again next time.
			this.copied = false;
			return undefined;
		}
		try {
			if (this.changed || this.lastFrom !== from) {
				const db = new this.sql.DatabaseSync(this.copyPath(), { readOnly: true });
				try {
					this.cache.refresh({ sizes: db.prepare(SIZES_FROM), step: db.prepare(STEP_AT) }, from);
				} finally {
					db.close();
				}
				this.changed = false;
				this.lastFrom = from;
			}
			return this.cache.view(from);
		} catch {
			// Not one of agy's records yet (no steps written): read again once agy wrote more.
			return undefined;
		}
	}

	dispose(): void {
		this.disposed = true;
		void this.copy?.close().catch(() => undefined);
		this.copy = undefined;
		if (this.folder) {
			fs.rmSync(this.folder, { recursive: true, force: true });
		}
	}

	private copyPath(): string {
		return path.join(this.folder!, 'conversation.db');
	}

	private get logFile(): string {
		return `${this.file}-wal`;
	}

	/** Brings the copy up to what agy committed; false when it cannot be now (no database, too big, or given up). */
	private async update(): Promise<boolean> {
		if (this.disposed) {
			return false;
		}
		const stat = await fs.promises.stat(this.logFile).catch(() => undefined);
		const stamp = stat ? `${stat.size}:${stat.mtimeMs}` : 'none';
		if (this.copied && stamp === this.logStamp) {
			return true;
		}
		if (!this.copied || !stat || stat.size < this.logSize) {
			// The first read; its log gone (agy closed the conversation: all of it is in the database now); or its log
			// cut short (what it held may be in the database only).
			return this.copyAll();
		}
		const log = await fs.promises.open(this.logFile, 'r').catch(() => undefined);
		if (!log) {
			return this.copyAll();
		}
		try {
			this.logSize = stat.size;
			const header = logHeaderOf(await readAt(log, 0, WAL_HEADER_BYTES));
			if (!header) {
				// Begun again and not written yet.
				this.logStamp = stamp;
				return true;
			}
			const followed = this.log;
			if (!followed) {
				// There was no log when the database was copied: what it held since may be in the database already.
				return this.copyAll();
			}
			if (followed.header.salt1 !== header.salt1 || followed.header.salt2 !== header.salt2) {
				// Begun again (agy's checkpoint wrote it into the database first). What the one before held after where it
				// was read is still there, unless the new one was written over it: read first. Then the new one, from its start.
				const stop = await this.follow(log, followed);
				if (stop && ((stop.salt1 === header.salt1 && stop.salt2 === header.salt2) || (stop.salt1 === followed.header.salt1 && stop.salt2 === followed.header.salt2))) {
					// Written over (the new one has reached it), or not whole: what it held is in the database only.
					await log.close().catch(() => undefined);
					return this.copyAll();
				}
				this.log = { header, offset: WAL_HEADER_BYTES, sum1: header.sum1, sum2: header.sum2 };
			}
			this.logStamp = stamp;
			await this.follow(log, this.log!);
			return true;
		} finally {
			await log.close().catch(() => undefined);
		}
	}

	/** The database copied anew, then its log followed from its start; the log looked at again after, so neither moved meanwhile. */
	private async copyAll(): Promise<boolean> {
		// One that could not be made is not tried again at once (while agy keeps writing, a copy every read is its whole size each time).
		if (this.copyFailedAt !== undefined && Date.now() - this.copyFailedAt < COPY_RETRY_MS) {
			return false;
		}
		this.copyFailedAt = undefined;
		for (let attempt = 0; attempt < 3 && !this.disposed; attempt++) {
			const before = await fs.promises.stat(this.logFile).catch(() => undefined);
			const stat = await fs.promises.stat(this.file).catch(() => undefined);
			if (!stat || stat.size > COPY_MAX_BYTES) {
				return false;
			}
			this.folder ??= await fs.promises.mkdtemp(path.join(os.tmpdir(), 'agent-bridge-agydb-'));
			await this.copy?.close().catch(() => undefined);
			this.copy = undefined;
			const log = before ? await fs.promises.open(this.logFile, 'r').catch(() => undefined) : undefined;
			try {
				const header = log ? logHeaderOf(await readAt(log, 0, WAL_HEADER_BYTES)) : undefined;
				await fs.promises.copyFile(this.file, this.copyPath());
				this.copy = await fs.promises.open(this.copyPath(), 'r+');
				await this.copy.write(ROLLBACK_FORMAT, 0, ROLLBACK_FORMAT.length, FORMAT_VERSIONS_AT);
				this.log = header ? { header, offset: WAL_HEADER_BYTES, sum1: header.sum1, sum2: header.sum2 } : undefined;
				if (log && this.log) {
					await this.follow(log, this.log);
				}
				const still = log ? logHeaderOf(await readAt(log, 0, WAL_HEADER_BYTES)) : undefined;
				if ((!header && !still) || (header && still && header.salt1 === still.salt1 && header.salt2 === still.salt2)) {
					this.copied = true;
					this.changed = true;
					this.logStamp = before ? `${before.size}:${before.mtimeMs}` : 'none';
					this.logSize = before?.size ?? 0;
					return true;
				}
			} finally {
				await log?.close().catch(() => undefined);
			}
		}
		this.copied = false;
		this.copyFailedAt = Date.now();
		return false;
	}

	/**
	 * Reads the log on from where it was followed: each frame of its generation (its salts) with its checksum right,
	 * gathered until a commit frame, whose transaction is then written into the copy. A frame that is not one of them
	 * ends it for now (being written, or left over from before): what ended it is told back (its salts), none at the
	 * log's end.
	 */
	private async follow(log: fs.promises.FileHandle, followed: Followed): Promise<{ readonly salt1: number; readonly salt2: number } | undefined> {
		const { pageSize, bigEndian, salt1, salt2 } = followed.header;
		const frameBytes = FRAME_HEADER_BYTES + pageSize;
		const chunkBytes = Math.max(1, Math.floor(LOG_READ_BYTES / frameBytes)) * frameBytes;
		const pending = new Map<number, Buffer>();
		let offset = followed.offset;
		let [sum1, sum2] = [followed.sum1, followed.sum2];
		for (; ;) {
			const chunk = await readAt(log, offset, chunkBytes);
			let at = 0;
			for (; at + frameBytes <= chunk.length; at += frameBytes) {
				const frame = chunk.subarray(at, at + frameBytes);
				const salts = { salt1: frame.readUInt32BE(8), salt2: frame.readUInt32BE(12) };
				if (salts.salt1 !== salt1 || salts.salt2 !== salt2) {
					return salts;
				}
				[sum1, sum2] = walChecksum(frame.subarray(FRAME_HEADER_BYTES), bigEndian, ...walChecksum(frame.subarray(0, 8), bigEndian, sum1, sum2));
				if (sum1 !== frame.readUInt32BE(16) || sum2 !== frame.readUInt32BE(20)) {
					return salts;
				}
				pending.set(frame.readUInt32BE(0), Buffer.from(frame.subarray(FRAME_HEADER_BYTES)));
				const pages = frame.readUInt32BE(4);
				if (pages > 0) {
					await this.commit(pending, pageSize, pages);
					followed.offset = offset + at + frameBytes;
					followed.sum1 = sum1;
					followed.sum2 = sum2;
				}
			}
			if (at === 0 || at < chunk.length || chunk.length < chunkBytes) {
				return undefined;
			}
			offset += at;
		}
	}

	/** A committed transaction's pages into the copy, the copy as long as the database now is. */
	private async commit(pages: Map<number, Buffer>, pageSize: number, size: number): Promise<void> {
		for (const [page, bytes] of pages) {
			await this.copy!.write(bytes, 0, bytes.length, (page - 1) * pageSize);
		}
		if (pages.has(1)) {
			await this.copy!.write(ROLLBACK_FORMAT, 0, ROLLBACK_FORMAT.length, FORMAT_VERSIONS_AT);
		}
		await this.copy!.truncate(size * pageSize);
		pages.clear();
		this.changed = true;
	}
}

/** `length` bytes of a file from `position` (fewer at its end). */
async function readAt(handle: fs.promises.FileHandle, position: number, length: number): Promise<Buffer> {
	const bytes = Buffer.alloc(length);
	let got = 0;
	while (got < length) {
		const { bytesRead } = await handle.read(bytes, got, length - got, position + got);
		if (!bytesRead) {
			break;
		}
		got += bytesRead;
	}
	return bytes.subarray(0, got);
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
