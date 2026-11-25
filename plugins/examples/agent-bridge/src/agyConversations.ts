/*
 * Deleting a conversation of agy's, with the conversations of its subagents. agy has no command for it: its files are
 * deleted, as agy keeps them in its own folder (antigravity.ts agyConfigDir): its record (`conversations/<id>.db`,
 * with its `-wal` and `-shm`), its folder of notes and transcripts (`brain/<id>/`), its lock (`presence/<id>.lock`).
 * The lines of its history list (`conversation_summaries.db`) stay: from Windows, agy's databases in WSL cannot be
 * written safely (their locks do not cross over).
 *
 * Its subagents' conversations are found from its transcript: each id it names whose own transcript begins with the
 * message agy gave the subagent its task in (a SYSTEM_MESSAGE naming the lead). A link (a symlink or a junction)
 * inside a folder is never followed nor deleted: that folder stays.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

const ID = /^[A-Za-z0-9][A-Za-z0-9_-]{7,80}$/;
const IDS_IN_TEXT = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g;
/** A transcript longer than this is not searched for its subagents. */
const TRANSCRIPT_MAX_BYTES = 64 * 1024 * 1024;
/** How far down subagents of subagents are looked for, and how many conversations one delete takes at most. */
const DEPTH_MAX = 4;
const CONVERSATIONS_MAX = 500;

const joinFor = (configDir: string) => /^[A-Za-z]:[\\/]|^\\\\/.test(configDir) ? path.win32.join : path.posix.join;
const transcriptOf = (configDir: string, id: string) => joinFor(configDir)(configDir, 'brain', id, '.system_generated', 'logs', 'transcript_full.jsonl');

/** The first line of a file; none when it is not there. */
async function firstLineOf(file: string): Promise<string | undefined> {
	const handle = await fs.promises.open(file, 'r').catch(() => undefined);
	if (!handle) {
		return undefined;
	}
	try {
		const chunk = Buffer.alloc(256 * 1024);
		const { bytesRead } = await handle.read(chunk, 0, chunk.length, 0);
		const text = chunk.subarray(0, bytesRead).toString('utf8');
		const end = text.indexOf('\n');
		return end < 0 ? text : text.slice(0, end);
	} finally {
		await handle.close().catch(() => undefined);
	}
}

/** The conversations of a conversation's subagents, as its transcript names them and theirs confirm. */
export async function agySubagentsOf(configDir: string, lead: string): Promise<string[]> {
	if (!ID.test(lead)) {
		return [];
	}
	const file = transcriptOf(configDir, lead);
	const size = await fs.promises.stat(file).then(stat => stat.size, () => 0);
	if (!size || size > TRANSCRIPT_MAX_BYTES) {
		return [];
	}
	const named = new Set((await fs.promises.readFile(file, 'utf8')).match(IDS_IN_TEXT) ?? []);
	named.delete(lead);
	const out: string[] = [];
	for (const id of named) {
		const first = await firstLineOf(transcriptOf(configDir, id));
		try {
			const step = first ? JSON.parse(first) as { type?: unknown; step_index?: unknown } : undefined;
			if (step?.type === 'SYSTEM_MESSAGE' && step.step_index === 0 && first!.includes(lead)) {
				out.push(id);
			}
		} catch {
			// Not a transcript of agy's.
		}
	}
	return out;
}

/** Deletes a folder's files and folders, never following nor deleting a link; true when it is gone. */
async function removeTree(target: string, join: (...parts: string[]) => string): Promise<boolean> {
	const stat = await fs.promises.lstat(target).catch(() => undefined);
	if (!stat) {
		return true;
	}
	if (stat.isSymbolicLink()) {
		return false;
	}
	if (!stat.isDirectory()) {
		await fs.promises.unlink(target);
		return true;
	}
	let all = true;
	for (const name of await fs.promises.readdir(target)) {
		all = await removeTree(join(target, name), join) && all;
	}
	if (all) {
		await fs.promises.rmdir(target);
	}
	return all;
}

/** Deletes one conversation's files; nothing for an id agy would not give. */
export async function deleteAgyConversation(configDir: string, id: string): Promise<void> {
	if (!ID.test(id)) {
		return;
	}
	const join = joinFor(configDir);
	const record = join(configDir, 'conversations', `${id}.db`);
	for (const file of [record, `${record}-wal`, `${record}-shm`, join(configDir, 'presence', `${id}.lock`)]) {
		await fs.promises.unlink(file).catch(error => {
			if (error?.code !== 'ENOENT') {
				throw error;
			}
		});
	}
	await removeTree(join(configDir, 'brain', id), join);
}

/** Deletes conversations with their subagents' (and theirs, a few levels down); says which it deleted. */
export async function deleteAgyConversations(configDir: string, leads: readonly string[]): Promise<string[]> {
	const found = new Set<string>();
	let level = leads.filter(id => ID.test(id));
	for (let depth = 0; level.length && depth <= DEPTH_MAX && found.size < CONVERSATIONS_MAX; depth++) {
		const next: string[] = [];
		for (const id of level) {
			if (found.has(id) || found.size >= CONVERSATIONS_MAX) {
				continue;
			}
			found.add(id);
			// Found before it goes: its transcript names them.
			next.push(...await agySubagentsOf(configDir, id).catch(() => []));
		}
		level = next;
	}
	for (const id of found) {
		await deleteAgyConversation(configDir, id);
	}
	return [...found];
}
