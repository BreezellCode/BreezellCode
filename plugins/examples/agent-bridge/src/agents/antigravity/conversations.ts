/*
 * Deleting a conversation of agy's, with the conversations of its subagents. agy has no command for it: its files are
 * deleted, as agy keeps them in its own folder (program.ts agyConfigDir): its record (`conversations/<id>.db`,
 * with its `-wal` and `-shm`), its folder of notes and transcripts (`brain/<id>/`), its lock (`presence/<id>.lock`).
 * The lines of its history list (`conversation_summaries.db`) stay: from Windows, agy's databases in WSL cannot be
 * written safely (their locks do not cross over).
 *
 * Its subagents' conversations are found from its transcript: each id it names whose own transcript begins with the
 * message agy gave the subagent its task in (a SYSTEM_MESSAGE naming the lead). A link (a symlink or a junction)
 * inside a folder is never followed nor deleted: that folder stays.
 */
import * as fs from 'node:fs';
import { firstLineOf, removeTree } from '../../core/files';
import { isAgentId, joinFor } from '../../core/paths';
import { agyTranscriptPath } from './transcript';

const IDS_IN_TEXT = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g;
/** A transcript longer than this is not searched for its subagents. */
const TRANSCRIPT_MAX_BYTES = 64 * 1024 * 1024;
/** How far down subagents of subagents are looked for, and how many conversations one delete takes at most. */
const DEPTH_MAX = 4;
const CONVERSATIONS_MAX = 500;

/** The conversations of a conversation's subagents, as its transcript names them and theirs confirm. */
export async function agySubagentsOf(configDir: string, lead: string): Promise<string[]> {
	const file = agyTranscriptPath(configDir, lead);
	if (!file) {
		return [];
	}
	const size = await fs.promises.stat(file).then(stat => stat.size, () => 0);
	if (!size || size > TRANSCRIPT_MAX_BYTES) {
		return [];
	}
	const named = new Set((await fs.promises.readFile(file, 'utf8')).match(IDS_IN_TEXT) ?? []);
	named.delete(lead);
	const out: string[] = [];
	for (const id of named) {
		const transcript = agyTranscriptPath(configDir, id);
		const first = transcript ? await firstLineOf(transcript) : undefined;
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

/** Deletes one conversation's files; nothing for an id agy would not give. */
export async function deleteAgyConversation(configDir: string, id: string): Promise<void> {
	if (!isAgentId(id)) {
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
	// A link inside stays (never followed), and so does the folder holding it.
	await removeTree(join(configDir, 'brain', id), join, 'keep');
}

/** Deletes conversations with their subagents' (and theirs, a few levels down); says which it deleted. */
export async function deleteAgyConversations(configDir: string, leads: readonly string[]): Promise<string[]> {
	const found = new Set<string>();
	let level = leads.filter(isAgentId);
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
