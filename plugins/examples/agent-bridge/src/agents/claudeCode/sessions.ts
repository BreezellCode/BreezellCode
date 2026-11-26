/*
 * Claude Code's own conversations, as its session files keep them: one file per session under
 * <config folder>/projects/<the folder, each character but a letter or digit made "-">/<session>.jsonl,
 * one JSON record a line. Only the records that are the conversation are read (the user's words,
 * Claude's words and thinking, its tool calls and their results), only those made in the folder
 * itself (each record names it), and none of a subagent's. These files are the user's own
 * conversations: they are read when the user lets the plugin, and only to show them in Breezell.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { removeTree } from '../../core/files';
import { isSubagentTool, UNSHOWN_TOOLS, viewOfResult, viewOfUse, withUri, type ToolView } from './views';

/** One message of a session, with the id of the record it comes from (vscode.breezell.AgentConversationMessage). */
export type SessionMessage =
	| { entry: string; role: 'user'; text: string; at?: number }
	| { entry: string; role: 'assistant'; text: string; reasoning?: string; at?: number }
	| {
		entry: string; role: 'tool'; id: string; name: string; title?: string; input?: Record<string, unknown>; status: 'done' | 'error'; output?: string; view?: ToolView; at?: number;
		/** A subagent call's subagent as its file keeps it (SessionSync adds it); `agentId` names that file. */
		subagent?: { messages: SessionMessage[] }; agentId?: string;
	};

export interface Session {
	readonly id: string;
	readonly title?: string;
	/** The model it last answered with, as Claude Code's model aliases name it (opus, sonnet, ...). */
	readonly model?: string;
	readonly messages: SessionMessage[];
}

export const SESSION_LIMITS = {
	/** The newest sessions of a folder read at a time. */
	sessions: 200,
	/** A session file larger than this is not read. */
	fileBytes: 64 * 1024 * 1024,
	messages: 2000,
	textChars: 100_000,
	toolOutputChars: 20_000,
	toolInputChars: 50_000,
	titleChars: 80,
	/** The edits and new files' text a conversation's calls show, all together, the newest first: older ones beyond it show without their diff. */
	viewChars: 4_000_000,
} as const;

/** How much text a view carries: an edit's replacements, a new file's content. */
const viewSize = (view: ToolView | undefined): number => view?.kind === 'edit' ? (view.edits ?? []).reduce((sum, e) => sum + e.oldString.length + e.newString.length, 0) : view?.kind === 'create' ? view.content?.length ?? 0 : 0;

/** The view without its text: the call still shows what it is, without its diff. */
const withoutText = (view: ToolView): ToolView => view.kind === 'edit' ? { kind: 'edit', path: view.path, ...(view.uri ? { uri: view.uri } : {}) } : view.kind === 'create' ? { kind: 'create', path: view.path, ...(view.uri ? { uri: view.uri } : {}) } : view;

/** The folder of a project's sessions, as Claude Code names it. */
export const projectDirName = (cwd: string): string => cwd.replace(/[^A-Za-z0-9]/g, '-');

/** Windows folders are the same whatever their case (C:\ or c:\); others are compared as they are. */
export function sameFolder(a: string, b: string): boolean {
	const windows = /^[A-Za-z]:[\\/]/;
	if (windows.test(a) || windows.test(b)) {
		const plain = (p: string) => p.replace(/\//g, '\\').replace(/\\+$/, '').toLowerCase();
		return plain(a) === plain(b);
	}
	return a.replace(/\/+$/, '') === b.replace(/\/+$/, '');
}

/** What Claude Code shows in its own terminal for local commands (/model, !ls): not the conversation. */
const LOCAL = /^\s*<(command-name|command-message|command-args|local-command-stdout|local-command-stderr|local-command-caveat|bash-input|bash-stdout|bash-stderr)>/;
const INTERRUPTED = /^\s*\[Request interrupted by user/;
/**
 * Claude Code telling its model that a task it ran in the background ended (a subagent, a command): it writes that as a
 * user message, marked by its origin (2.1.332), or known by its text alone (an older version, or its system label first).
 * Not the user's words.
 */
const TASK_NOTIFICATION = /^\s*(?:\[SYSTEM NOTIFICATION - NOT USER INPUT\]\s*)?<task-notification>/;
const isTaskNotification = (record: Record<string, any>, said: string): boolean =>
	record.origin?.kind === 'task-notification' || (record.origin === undefined && TASK_NOTIFICATION.test(said));
const tagOf = (text: string, tag: string): string | undefined => new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`).exec(text)?.[1]?.trim() || undefined;

const cut = (text: string, max: number) => text.length > max ? `${text.slice(0, max)}\n… (${text.length - max} more characters)` : text;

const textOf = (content: unknown): string => {
	if (typeof content === 'string') {
		return content;
	}
	if (!Array.isArray(content)) {
		return '';
	}
	return content.map(part => {
		const p = part as { type?: string; text?: string };
		return p?.type === 'text' && typeof p.text === 'string' ? p.text : p?.type === 'image' ? '[Image]' : '';
	}).filter(Boolean).join('\n');
};

/** Claude Code's model alias for a model it answered with: the one the model picker lists. */
export function modelAlias(model: unknown): string | undefined {
	const m = typeof model === 'string' ? model.toLowerCase() : '';
	return ['opus', 'sonnet', 'haiku', 'fable'].find(alias => m.includes(alias));
}

/** One line saying what a tool call does, as the chat shows it. */
type TitleOf = (name: string, input: Record<string, unknown> | undefined) => string | undefined;

/**
 * A session file's conversation in `cwd`; undefined when it holds none. A tool call still waiting for
 * its result ends it there: the rest comes with a later read, once the call is done.
 */
export function parseSession(id: string, text: string, cwd: string, titleOf: TitleOf, uriOf?: (path: string) => string | undefined): Session | undefined {
	const { messages: settled, summary, model } = readMessages(text, cwd, titleOf, uriOf, false);
	if (!settled.some(m => m.role === 'user') || !settled.some(m => m.role !== 'user')) {
		return undefined;
	}
	const first = settled.find((m): m is Extract<SessionMessage, { role: 'user' }> => m.role === 'user')!;
	const line = (summary ?? first.text).split(/\r?\n/).map(l => l.trim()).find(Boolean) ?? '';
	const title = line.length > SESSION_LIMITS.titleChars ? `${line.slice(0, SESSION_LIMITS.titleChars - 1)}…` : line;
	return { id, ...(title ? { title } : {}), ...(model ? { model } : {}), messages: withinViewBudget(settled.slice(-SESSION_LIMITS.messages)) };
}

/**
 * A subagent's messages as its file keeps them (<session>/subagents/agent-<id>.jsonl, every record a sidechain
 * one): its task first (the first user message), then what it wrote and did, its report last.
 */
export function parseSubagent(text: string, cwd: string, titleOf: TitleOf, uriOf?: (path: string) => string | undefined): SessionMessage[] {
	return withinViewBudget(readMessages(text, cwd, titleOf, uriOf, true).messages.slice(-SESSION_LIMITS.messages));
}

/** The records of a session file that are its conversation (`sidechain`: a subagent's file), in order. */
function readMessages(text: string, cwd: string, titleOf: TitleOf, uriOf: ((path: string) => string | undefined) | undefined, sidechain: boolean): { messages: SessionMessage[]; summary?: string; model?: string } {
	const messages: SessionMessage[] = [];
	const pending = new Map<string, Extract<SessionMessage, { role: 'tool' }>>();
	/** Subagent calls that returned at once, their subagent in the background: each ends with Claude Code's notification. */
	const background = new Map<string, Extract<SessionMessage, { role: 'tool' }>>();
	const hidden = new Set<string>();
	/** A background subagent's end, as Claude Code's notification tells it: done with its report, failed, or stopped. */
	const endInBackground = (notification: string) => {
		const id = tagOf(notification, 'tool-use-id');
		const call = id ? background.get(id) : undefined;
		if (!call || call.view?.kind !== 'subagent') {
			return;
		}
		const status = tagOf(notification, 'status');
		const done = status === 'completed';
		const summary = tagOf(notification, 'summary');
		const report = done ? tagOf(notification, 'result') ?? summary : undefined;
		call.status = done ? 'done' : 'error';
		const output = done ? report : summary;
		if (output) {
			call.output = cut(output, SESSION_LIMITS.toolOutputChars);
		}
		call.view = { ...call.view, ...(report ? { report } : {}), ...(status === 'stopped' || status === 'killed' ? { stopped: true } : {}) };
	};
	let summary: string | undefined;
	let model: string | undefined;
	for (const line of text.split('\n')) {
		if (!line.startsWith('{')) {
			continue;
		}
		let r: Record<string, any>;
		try {
			r = JSON.parse(line);
		} catch {
			continue;
		}
		if (r.type === 'summary' && typeof r.summary === 'string') {
			summary = r.summary;
			continue;
		}
		if ((r.type !== 'user' && r.type !== 'assistant') || (r.isSidechain === true) !== sidechain || r.isMeta || r.isCompactSummary || typeof r.uuid !== 'string' || typeof r.cwd !== 'string' || !sameFolder(r.cwd, cwd)) {
			continue;
		}
		const entry = r.uuid as string;
		const parsedAt = Date.parse(r.timestamp);
		const at = Number.isFinite(parsedAt) ? { at: parsedAt } : {};
		const content = r.message?.content;
		if (r.type === 'user') {
			const results = (Array.isArray(content) ? content : []).filter((part: { type?: string }) => part?.type === 'tool_result');
			for (const part of results) {
				if (typeof part.tool_use_id !== 'string' || hidden.delete(part.tool_use_id)) {
					continue;
				}
				const tool = pending.get(part.tool_use_id);
				if (tool) {
					tool.status = part.is_error ? 'error' : 'done';
					// What it was, from Claude Code's own record of the result (that of the record's one result).
					const view = withUri(part.is_error ? viewOfUse(tool.name, tool.input) : viewOfResult(tool.name, tool.input, results.length === 1 ? r.toolUseResult : undefined), path => uriOf?.(path));
					// A subagent sent to the background: its call returns at once with a note for the model (never shown).
					const launched = !part.is_error && isSubagentTool(tool.name) && results.length === 1 && (r.toolUseResult?.status === 'async_launched' || r.toolUseResult?.isAsync === true);
					if (view?.kind === 'subagent' && launched) {
						tool.view = { ...view, background: true };
						background.set(part.tool_use_id, tool);
					} else if (view) {
						tool.view = view;
					}
					const output = launched ? undefined : view?.kind === 'subagent' && view.report ? view.report : textOf(part.content);
					if (output) {
						tool.output = cut(output, SESSION_LIMITS.toolOutputChars);
					}
					// The file its subagent's own records are in.
					const agentId = view?.kind === 'subagent' && results.length === 1 ? r.toolUseResult?.agentId : undefined;
					if (typeof agentId === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(agentId)) {
						tool.agentId = agentId;
					}
					pending.delete(part.tool_use_id);
				}
			}
			const said = textOf(Array.isArray(content) ? content.filter((p: { type?: string }) => p?.type !== 'tool_result') : content);
			if (said.trim() && isTaskNotification(r, said)) {
				endInBackground(said);
			} else if (said.trim() && !LOCAL.test(said) && !INTERRUPTED.test(said)) {
				messages.push({ entry, role: 'user', text: cut(said, SESSION_LIMITS.textChars), ...at });
			}
			continue;
		}
		model = modelAlias(r.message?.model) ?? model;
		for (const part of Array.isArray(content) ? content : []) {
			if (part?.type === 'text' && typeof part.text === 'string' && part.text.trim()) {
				messages.push({ entry, role: 'assistant', text: cut(part.text, SESSION_LIMITS.textChars), ...at });
			} else if (part?.type === 'thinking' && typeof part.thinking === 'string' && part.thinking.trim()) {
				messages.push({ entry, role: 'assistant', text: '', reasoning: cut(part.thinking, SESSION_LIMITS.textChars), ...at });
			} else if (part?.type === 'tool_use' && typeof part.id === 'string' && typeof part.name === 'string' && UNSHOWN_TOOLS.has(part.name)) {
				// Claude Code looking up its own tools: not shown, nor waited for.
				hidden.add(part.id);
			} else if (part?.type === 'tool_use' && typeof part.id === 'string' && typeof part.name === 'string') {
				const input = part.input && typeof part.input === 'object' && JSON.stringify(part.input).length <= SESSION_LIMITS.toolInputChars ? part.input as Record<string, unknown> : undefined;
				const title = titleOf(part.name, part.input);
				// Done or failed once its result is read; until then it is what ends the conversation for now.
				const tool: Extract<SessionMessage, { role: 'tool' }> = { entry, role: 'tool', id: part.id, name: part.name, status: 'error', ...(title ? { title } : {}), ...(input ? { input } : {}), ...at };
				pending.set(part.id, tool);
				messages.push(tool);
			}
		}
	}
	const waiting = messages.findIndex(m => m.role === 'tool' && pending.has(m.id));
	return { messages: waiting >= 0 ? messages.slice(0, waiting) : messages, ...(summary ? { summary } : {}), ...(model ? { model } : {}) };
}

/** The newest calls keep their diffs: past the budget, older ones show what they were without them. */
function withinViewBudget(kept: SessionMessage[]): SessionMessage[] {
	let budget: number = SESSION_LIMITS.viewChars;
	for (let i = kept.length - 1; i >= 0; i--) {
		const m = kept[i];
		if (m.role !== 'tool' || !m.view) {
			continue;
		}
		const size = viewSize(m.view);
		if (size > budget) {
			m.view = withoutText(m.view);
		} else {
			budget -= size;
		}
	}
	return kept;
}

/** A session file of a project folder, newest first: its path, and when it last changed. */
export interface SessionFile {
	readonly id: string;
	readonly file: string;
	readonly mtimeMs: number;
	readonly size: number;
}

const SESSION_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SESSION_FILE = /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.jsonl$/i;

/**
 * Deletes one of Claude Code's conversations: its file (`<session>.jsonl`) and its folder (`<session>/`,
 * its subagents' records), in the folder of sessions of `cwd`, or of whichever project has it. Nothing
 * else of the project is touched (its memory, other sessions). False when there was nothing to delete.
 */
export async function deleteSession(root: string, cwd: string | undefined, session: string, join: (...parts: string[]) => string = path.join): Promise<boolean> {
	if (!SESSION_ID.test(session)) {
		return false;
	}
	const projects = join(root, 'projects');
	const has = async (dir: string) => fs.promises.lstat(join(dir, `${session}.jsonl`)).then(s => s.isFile(), () => false);
	let dir = cwd ? join(projects, projectDirName(cwd)) : undefined;
	if (!dir || !(await has(dir))) {
		dir = undefined;
		for (const name of await fs.promises.readdir(projects).catch(() => [] as string[])) {
			if (await has(join(projects, name))) {
				dir = join(projects, name);
				break;
			}
		}
	}
	if (!dir) {
		return false;
	}
	// A link inside is removed itself, never followed.
	const file = await removeTree(join(dir, `${session}.jsonl`), join, 'remove') === 'removed';
	const folder = await removeTree(join(dir, session), join, 'remove') === 'removed';
	return file || folder;
}

/** The newest session files of a project: `dir` is its folder of sessions (none when there is none yet). */
export async function listSessionFiles(dir: string, join: (...parts: string[]) => string = path.join): Promise<SessionFile[]> {
	let names: string[];
	try {
		names = await fs.promises.readdir(dir);
	} catch {
		return [];
	}
	const files: SessionFile[] = [];
	for (const name of names) {
		const id = SESSION_FILE.exec(name)?.[1];
		if (!id) {
			continue;
		}
		const file = join(dir, name);
		try {
			const stat = await fs.promises.stat(file);
			if (stat.isFile() && stat.size <= SESSION_LIMITS.fileBytes) {
				files.push({ id, file, mtimeMs: stat.mtimeMs, size: stat.size });
			}
		} catch {
			// gone meanwhile
		}
	}
	return files.sort((a, b) => b.mtimeMs - a.mtimeMs).slice(0, SESSION_LIMITS.sessions);
}
