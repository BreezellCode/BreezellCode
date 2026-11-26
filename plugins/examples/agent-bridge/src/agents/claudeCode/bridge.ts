/*
 * Claude Code's tile: its switch is the setting `agentBridge.claudeCode.enabled`, which Breezell turns on only after
 * the user agreed to its consent. Here is what is Claude Code's beside what every tile does (core/bridge.ts): its
 * sign-in and plan, its usage limits, its models, and bringing this window's projects' Claude Code conversations
 * into Breezell (sync.ts). While its switch is off, nothing of it runs.
 */
import * as vscode from 'vscode';
import { AgentBridge, SECTION, asReply, type BridgeDeps } from '../../core/bridge';
import { wslPathOf, type Target } from '../../core/cli';
import type { UsageLine } from '../../core/limits';
import { folderName, joinFor } from '../../core/paths';
import { languageKey } from '../../core/texts';
import type { ModelUsage, Turn, TurnControls, TurnFiles, TurnResult } from '../../core/turn';
import { folderFor, uriOfPath } from '../../core/workspace';
import { fetchModels, type ClaudeModel } from './models';
import { CLAUDE_PROGRAM, fetchUsage, inspect, nativeConfigDir, notInstalled, type Check } from './program';
import { deleteSession, projectDirName } from './sessions';
import { SessionSync, type SyncState } from './sync';
import { TEXTS, statusOf, syncNotice } from './texts';
import { runTurn, toolTitle } from './turn';

/** Where each session's usage so far is kept (ClaudeCodeBridge.usageTotals). */
const USAGE_KEY = 'claudeCode.usageTotals';
/** Where the sessions this window's project brought in are kept between runs (its workspace state, sync.ts). */
const SYNC_KEPT_KEY = 'claudeCode.syncSettled';
export const ENABLED_KEY = 'claudeCode.enabled';
export const ENABLED_SETTING = `${SECTION}.${ENABLED_KEY}`;
export const TILE = 'claudeCode';
export const RECHECK_COMMAND = 'agentBridge.claudeCode.recheck';
/** The page's "Sync conversations" (the tile's action). */
export const SYNC_COMMAND = 'agentBridge.claudeCode.sync';
/** On: a conversation deleted in Breezell is deleted in Claude Code too (off by default; asked before it turns on). */
export const DELETE_SESSIONS_KEY = 'claudeCode.deleteSessions';
/** Claude Code's own MCP servers stay on beside Breezell's (on by default). */
export const OWN_MCP_SERVERS_KEY = 'claudeCode.ownMcpServers';
/** Its subagents work on the conversation's model and effort (on by default; off: Claude Code picks theirs). */
export const SUBAGENTS_FOLLOW_KEY = 'claudeCode.subagentsFollowModel';
/** A check that finds Claude Code signed in brings the conversations in, at most this often. */
export const AUTO_SYNC_MS = 120_000;
/** How many sessions' usage totals are kept (the most recent): one a conversation. */
const USAGE_SESSIONS_KEPT = 500;

export class ClaudeCodeBridge extends AgentBridge<Check> {
	protected readonly program = CLAUDE_PROGRAM;
	/** Its models take a start of Claude Code to list (initialize): another window's list of the same install is taken. */
	protected readonly sharesModels = true;
	/** Each session's usage so far, per model (TurnControls.usageTotals), kept between runs. */
	private readonly usageTotals: NonNullable<TurnControls['usageTotals']> = {
		of: session => this.deps.memento?.get<Record<string, { totals: Record<string, ModelUsage>; at: number }>>(USAGE_KEY)?.[session]?.totals,
		keep: (session, totals) => {
			const memento = this.deps.memento;
			if (!memento) {
				return;
			}
			const all = { ...(memento.get<Record<string, { totals: Record<string, ModelUsage>; at: number }>>(USAGE_KEY) ?? {}), [session]: { totals, at: Date.now() } };
			const kept = Object.entries(all).sort((a, b) => b[1].at - a[1].at).slice(0, USAGE_SESSIONS_KEPT);
			void memento.update(USAGE_KEY, Object.fromEntries(kept));
		},
	};
	/** The models offered last: a subagent's model is named as one of them. */
	private models: readonly ClaudeModel[] | undefined;
	private readonly sync: SessionSync;
	/** What the last sync came to, shown on the page. */
	private lastSync: SyncState | undefined;
	/** Each install's config folder (its sessions), as this computer reaches it: asked of WSL once. */
	private readonly configDirs = new WeakMap<Target, Promise<string | undefined>>();

	constructor(deps: BridgeDeps) {
		super(deps, TILE, ENABLED_KEY, 'claude-code');
		this.sync = new SessionSync({
			target: () => this.target,
			importer: () => {
				const agents = this.agentsApi();
				return this.agent && typeof agents?.importConversation === 'function' ? conversation => agents.importConversation(TILE, conversation as vscode.breezell.AgentConversation) : undefined;
			},
			folders: () => (vscode.workspace.workspaceFolders ?? []).map(folder => folder.uri.toString()),
			nameOf: folder => (vscode.workspace.workspaceFolders ?? []).find(f => f.uri.toString() === folder)?.name ?? folderName(folder),
			cwdOf: (folder, target) => {
				const cwd = folderFor(folder, target) ?? this.hosts.knownFolderFor(folder, target);
				return cwd && target.where === 'wsl' ? wslPathOf(cwd) : cwd;
			},
			titleOf: toolTitle,
			uriOf: (path, folder, target) => uriOfPath(path, folder, target, this.hosts.knownFolderFor(folder, target) !== undefined),
			now: () => this.now(),
			...(deps.workspaceMemento ? { kept: { get: () => deps.workspaceMemento!.get(SYNC_KEPT_KEY), set: value => { void deps.workspaceMemento!.update(SYNC_KEPT_KEY, value); } } } : {}),
			changed: state => {
				this.lastSync = state;
				this.show();
			},
		});
		const deleted = this.agentsApi()?.onDidDeleteConversations;
		if (typeof deleted === 'function') {
			this.listeners.push(deleted(e => { void this.deleteSessions(e); }));
		}
		this.listeners.push(vscode.workspace.onDidChangeWorkspaceFolders(() => {
			if (this.enabled() && this.target) {
				void this.syncRun(false);
			}
		}));
		this.start();
	}

	protected nativeConfigDir(): string {
		return nativeConfigDir(this.deps.env, this.deps.home, this.deps.platform);
	}

	protected inspect(target: Target, known: { readonly version?: string }): Promise<Check> {
		return inspect(target, known);
	}

	protected notInstalled(): Check {
		return notInstalled(this.deps.platform);
	}

	protected isSignedIn(check: Check): boolean {
		return check.kind === 'signedIn';
	}

	protected modelsKey(check: Check): string {
		return check.kind === 'signedIn' ? check.version ?? '' : '';
	}

	protected async listModels(target: Target): Promise<readonly vscode.breezell.AgentModel[]> {
		const models = await fetchModels(target);
		this.models = models;
		// Each compresses its context when asked (/compact): Breezell's Manual compress asks it.
		return models.map(model => ({ ...model, compacts: true }));
	}

	protected tookModels(models: readonly vscode.breezell.AgentModel[]): void {
		this.models = models as readonly (vscode.breezell.AgentModel & ClaudeModel)[];
	}

	protected statusOf(check: Check) {
		return statusOf(check, this.texts(), this.limits, undefined, this.lastSync);
	}

	protected texts() {
		return TEXTS[languageKey(vscode.breezell?.language || vscode.env.language)];
	}

	protected forgetTarget(): void {
		this.forgetSync();
	}

	protected afterModels(): void {
		if (this.target && this.agent && this.sync.due(AUTO_SYNC_MS)) {
			void this.syncRun(false);
		}
	}

	/** Its plan's limits, through its own `/usage`. */
	protected fetchLimits(target: Target): Promise<UsageLine[] | undefined> {
		return fetchUsage(target);
	}

	/** A session's file, in the folder of sessions of `cwd` (as Claude Code names it). */
	protected async recordOf(target: Target, cwd: string): Promise<((session: string) => string | undefined) | undefined> {
		let root = this.configDirs.get(target);
		if (!root) {
			root = target.configDir().catch(() => undefined);
			this.configDirs.set(target, root);
		}
		const dir = await root;
		if (!dir) {
			return undefined;
		}
		const join = joinFor(dir);
		return session => /^[0-9a-f-]{36}$/i.test(session) ? join(dir, 'projects', projectDirName(cwd), `${session}.jsonl`) : undefined;
	}

	protected controlsOf(): Partial<TurnControls> {
		return {
			usageTotals: this.usageTotals,
			ownMcpServers: vscode.workspace.getConfiguration(SECTION).get<boolean>(OWN_MCP_SERVERS_KEY, true) !== false,
			subagentsFollowModel: vscode.workspace.getConfiguration(SECTION).get<boolean>(SUBAGENTS_FOLLOW_KEY, true) !== false,
			modelIdOf: model => this.models?.find(m => m.id !== 'default' && (m.id === model || m.resolved === model))?.id,
		};
	}

	protected runOn(target: Target, turn: Turn, reply: vscode.breezell.AgentReply, token: vscode.CancellationToken, pathFor: (path: string) => string, files: TurnFiles, controls: TurnControls): Promise<TurnResult> {
		return runTurn(target, turn, asReply(reply), token, pathFor, files, controls);
	}

	/**
	 * "Sync conversations": brings this window's projects' conversations in now, saying so on the page, then in a
	 * notice: which project they went to, or (no project open here) that they go to the project they belong to.
	 */
	async syncNow(): Promise<void> {
		if (!this.enabled()) {
			return;
		}
		const before = this.lastSync;
		await this.syncRun(true);
		const after = this.lastSync;
		// Nothing ran (not connected): nothing to say.
		const notice = after && after !== before ? syncNotice(after, this.texts()) : undefined;
		if (notice) {
			void (notice.warning ? vscode.window.showWarningMessage(notice.text) : vscode.window.showInformationMessage(notice.text));
		}
	}

	private forgetSync(): void {
		this.sync.forget();
		this.lastSync = undefined;
		this.hosts.forget();
	}

	/** A sync, once the window's SSH folders are known to be this Claude Code's or not (SameMachineHosts). */
	private async syncRun(loud: boolean): Promise<void> {
		const target = this.target;
		if (target) {
			await Promise.all((vscode.workspace.workspaceFolders ?? []).map(folder => this.hosts.folderFor(folder.uri.toString(), target)));
		}
		await this.sync.run(loud);
	}

	/**
	 * Conversations the user deleted in Breezell: deleted in Claude Code too, only while the user turned that
	 * on (DELETE_SESSIONS_KEY); otherwise they stay there. Each is found in the folder of sessions of the
	 * folder it belonged to (this plugin's own for a window without one).
	 */
	async deleteSessions(e: vscode.breezell.AgentDeletedConversations): Promise<void> {
		const target = this.target;
		if (e.tileId !== TILE || !target || !this.enabled() || vscode.workspace.getConfiguration(SECTION).get<boolean>(DELETE_SESSIONS_KEY, false) !== true) {
			return;
		}
		const root = await target.configDir();
		if (!root) {
			return;
		}
		const join = joinFor(root);
		for (const conversation of e.conversations) {
			const at = conversation.folder ? folderFor(conversation.folder, target) ?? await this.hosts.folderFor(conversation.folder, target) : this.ownFolderPath();
			const cwd = at && target.where === 'wsl' ? wslPathOf(at) : at;
			await deleteSession(root, cwd, conversation.session, join).catch(error => console.warn(`[Agent Bridge] a Claude Code conversation was not deleted: ${error?.message ?? error}`));
		}
	}
}
