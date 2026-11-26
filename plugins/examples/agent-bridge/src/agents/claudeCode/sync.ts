/*
 * Bringing the user's Claude Code conversations of this window's projects into Breezell
 * (vscode.breezell.agents.importConversation): each session of a project folder, as its file keeps it
 * (sessions.ts). Breezell decides what is new: a session it already shows gets only the messages
 * after the last record it shows, so turns made in Breezell are not brought in twice, and a
 * conversation the user deleted stays deleted. A file read once is read again only once it changed, and what was
 * settled is kept with the window's project (its workspace state): a window opening again (or opened by the Agents
 * page) reads only the session files that changed since, not all of them.
 */
import * as fs from 'node:fs';
import type { Target } from '../../core/cli';
import { joinFor } from '../../core/paths';
import { listSessionFiles, parseSession, parseSubagent, projectDirName, SESSION_LIMITS, type SessionFile } from './sessions';

export type SyncState =
	| { readonly kind: 'running'; readonly projects?: readonly string[] }
	| { readonly kind: 'done'; readonly found: number; readonly created: number; readonly updated: number; readonly at: number; readonly projects?: readonly string[] }
	| { readonly kind: 'noFolder' }
	| { readonly kind: 'failed'; readonly message: string };

type ImportStatus = 'created' | 'updated' | 'unchanged' | 'deleted' | 'busy' | 'elsewhere';
type Conversation = { session: string; folder: string; title?: string; model?: string; messages: unknown[] };

export interface SyncDeps {
	readonly target: () => Target | undefined;
	/** Breezell's importConversation for this plugin's tile; undefined while the agent is not registered. */
	readonly importer: () => ((conversation: Conversation) => PromiseLike<ImportStatus>) | undefined;
	/** The window's folders, URIs as text. */
	readonly folders: () => readonly string[];
	/** A folder's name as the window shows it: what the page and the notice say was synced. */
	readonly nameOf?: (folder: string) => string;
	/** A folder as that Claude Code names it (its records' `cwd`); undefined when it cannot work there. */
	readonly cwdOf: (folder: string, target: Target) => string | undefined;
	/** One line saying what a tool call does (turn.ts toolTitle). */
	readonly titleOf: (name: string, input: Record<string, unknown> | undefined) => string | undefined;
	/** A file Claude Code names in a session of `folder`, as Breezell opens it (a URI); none, its calls show without their files. */
	readonly uriOf?: (path: string, folder: string, target: Target) => string | undefined;
	readonly now: () => number;
	readonly changed: (state: SyncState) => void;
	/** Tests give their own. */
	readonly list?: (dir: string, join: (...parts: string[]) => string) => Promise<SessionFile[]>;
	readonly read?: (file: string) => Promise<string>;
	/** Where what a sync settled is kept between runs (the project's workspace state); none: read anew each run. */
	readonly kept?: { get(): unknown; set(value: unknown): void };
}

/** What a settled file was then: its time and size, whether it is a conversation, and whether it is kept between runs. */
type Settled = { readonly mtimeMs: number; readonly size: number; readonly counted: boolean; readonly keep: boolean };
/**
 * The shape of what is kept between runs. Raised when what a session file is brought in as changes (sessions.ts):
 * every file is then read again once.
 */
export const SYNC_KEPT_FORMAT = 1;
/** Files kept between runs at most (200 a folder, a few folders). */
const KEPT_FILES_MAX = 2000;
const targetKey = (target: Target): string => `${target.where}:${target.distro ?? ''}:${target.path}`;

export class SessionSync {
	private running: Promise<void> | undefined;
	private again: { loud: boolean } | undefined;
	/** Files whose import is settled, as they were then: unchanged, they are not read again. */
	private readonly settled = new Map<string, Settled>();
	/** Which Claude Code what was kept between runs was taken back for. */
	private restoredFor: string | undefined;
	/** When the last sync started; undefined before the first, and after forget(). */
	lastAt: number | undefined;

	constructor(private readonly deps: SyncDeps) { }

	/** Syncs now; one asked for while one runs makes one more after it. `loud`: the page says it is syncing. */
	run(loud: boolean): Promise<void> {
		if (this.running) {
			this.again = { loud: loud || !!this.again?.loud };
			return this.running;
		}
		this.running = (async () => {
			for (let next: { loud: boolean } | undefined = { loud }; next; next = this.takeAgain()) {
				await this.once(next.loud);
			}
		})().finally(() => { this.running = undefined; });
		return this.running;
	}

	/** Another Claude Code, signed out, or turned off: what was read is read again next time. */
	forget(): void {
		this.settled.clear();
		this.restoredFor = undefined;
		this.lastAt = undefined;
	}

	/** What an earlier run of this window's project settled, for this Claude Code. */
	private restore(target: Target): void {
		const key = targetKey(target);
		if (this.restoredFor === key) {
			return;
		}
		this.restoredFor = key;
		const kept = this.deps.kept?.get() as { format?: unknown; target?: unknown; files?: Record<string, { mtimeMs?: unknown; size?: unknown; counted?: unknown }> } | undefined;
		if (!kept || kept.format !== SYNC_KEPT_FORMAT || kept.target !== key || !kept.files || typeof kept.files !== 'object') {
			return;
		}
		for (const [file, was] of Object.entries(kept.files)) {
			if (typeof was?.mtimeMs === 'number' && typeof was.size === 'number' && !this.settled.has(file)) {
				this.settled.set(file, { mtimeMs: was.mtimeMs, size: was.size, counted: was.counted === true, keep: true });
			}
		}
	}

	/** What is settled now, kept for the next run (a conversation shown in another window is asked again then). */
	private keep(target: Target): void {
		if (!this.deps.kept) {
			return;
		}
		const files = [...this.settled].filter(([, settled]) => settled.keep).slice(-KEPT_FILES_MAX)
			.map(([file, settled]) => [file, { mtimeMs: settled.mtimeMs, size: settled.size, counted: settled.counted }] as const);
		this.deps.kept.set({ format: SYNC_KEPT_FORMAT, target: targetKey(target), files: Object.fromEntries(files) });
	}

	/** Whether an automatic sync is due: none yet, or the last at least `every` ms ago. */
	due(every: number): boolean {
		return this.lastAt === undefined || this.deps.now() - this.lastAt >= every;
	}

	private takeAgain(): { loud: boolean } | undefined {
		const again = this.again;
		this.again = undefined;
		return again;
	}

	private async once(loud: boolean): Promise<void> {
		const target = this.deps.target();
		const importConversation = this.deps.importer();
		if (!target || !importConversation) {
			return;
		}
		this.lastAt = this.deps.now();
		this.restore(target);
		const folders = this.deps.folders();
		if (folders.length === 0) {
			this.deps.changed({ kind: 'noFolder' });
			return;
		}
		const named = this.deps.nameOf;
		const projects = named ? { projects: folders.map(folder => named(folder)) } : {};
		if (loud) {
			this.deps.changed({ kind: 'running', ...projects });
		}
		try {
			const root = await target.configDir();
			if (!root) {
				throw new Error('Claude Code\'s folder of conversations was not found.');
			}
			const join = joinFor(root);
			const list = this.deps.list ?? listSessionFiles;
			const read = this.deps.read ?? (file => fs.promises.readFile(file, 'utf8'));
			let found = 0;
			let created = 0;
			let updated = 0;
			for (const folder of folders) {
				const cwd = this.deps.cwdOf(folder, target);
				if (!cwd) {
					continue;
				}
				for (const file of await list(join(root, 'projects', projectDirName(cwd)), join)) {
					if (this.deps.target() !== target) {
						return;
					}
					const known = this.settled.get(file.file);
					if (known && known.mtimeMs === file.mtimeMs && known.size === file.size) {
						found += known.counted ? 1 : 0;
						continue;
					}
					let text: string;
					try {
						text = await read(file.file);
					} catch {
						continue;
					}
					const session = parseSession(file.id, text, cwd, this.deps.titleOf, path => this.deps.uriOf?.(path, folder, target));
					if (!session) {
						this.settled.set(file.file, { mtimeMs: file.mtimeMs, size: file.size, counted: false, keep: true });
						continue;
					}
					found++;
					// Each subagent's own records, from its file beside the session's: Breezell gives it its own page.
					for (const message of session.messages) {
						if (message.role !== 'tool' || !message.agentId) {
							continue;
						}
						const subFile = join(root, 'projects', projectDirName(cwd), file.id, 'subagents', `agent-${message.agentId}.jsonl`);
						const subText = await read(subFile).catch(() => undefined);
						const subMessages = subText && subText.length <= SESSION_LIMITS.fileBytes ? parseSubagent(subText, cwd, this.deps.titleOf, path => this.deps.uriOf?.(path, folder, target)) : [];
						delete message.agentId;
						if (subMessages.length) {
							message.subagent = { messages: subMessages };
						}
					}
					const status = await importConversation({ session: session.id, folder, ...(session.title ? { title: session.title } : {}), ...(session.model ? { model: session.model } : {}), messages: session.messages });
					created += status === 'created' ? 1 : 0;
					updated += status === 'updated' ? 1 : 0;
					// A conversation running a turn now is read again next time; one shown in another window, next run.
					if (status !== 'busy') {
						this.settled.set(file.file, { mtimeMs: file.mtimeMs, size: file.size, counted: true, keep: status !== 'elsewhere' });
					}
				}
			}
			this.keep(target);
			this.deps.changed({ kind: 'done', found, created, updated, at: this.deps.now(), ...projects });
		} catch (error) {
			this.deps.changed({ kind: 'failed', message: error instanceof Error ? error.message : String(error) });
		}
	}
}
