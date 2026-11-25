/*
 * Agent Bridge: the user's own command-line agents in Breezell's chat, each on a tile of its own on Box › Models ›
 * Sign in. Claude Code's tile (this file) and Antigravity CLI's (antigravityBridge.ts) share what every tile does
 * (bridge.ts); here is what is Claude Code's: its sign-in and plan, its usage limits, and bringing this window's
 * projects' Claude Code conversations into Breezell (sync.ts). While a tile's switch is off, nothing of it runs.
 */
import * as vscode from 'vscode';
import { Check, UsageLine, createRunner, detect, fetchUsage, wslPathOf } from './claudeCode';
import { fetchModels, runTurn, toolTitle, type ClaudeModel, type ModelUsage, type TurnControls } from './agent';
import { AgentBridge, SECTION, asReply, folderFor, folderName, uriOfPath, type BridgeDeps, type BridgeTexts } from './bridge';
import { AntigravityBridge, AGY_RECHECK_COMMAND } from './antigravityBridge';
import type { Target } from './cli';
import type { Turn, TurnFiles, TurnResult } from './turn';
import { SessionSync, type SyncState } from './sync';
import { deleteSession, joinFor } from './sessions';
import { TEXTS, languageKey, statusOf, syncNotice } from './texts';
import * as os from 'node:os';

// What the tests (and other parts) know from here.
export { FOCUS_RECHECK_MS, SECTION, SameMachineHosts, folderFor, folderName, localPathOf, uriOfPath, wslWindowOf, type BridgeDeps } from './bridge';

/** Where each session's usage so far is kept (ClaudeCodeBridge.usageTotals). */
const USAGE_KEY = 'claudeCode.usageTotals';
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

	protected detect(wslWindow: { distro?: string } | undefined): Promise<{ check: Check; target?: Target }> {
		return detect({ env: this.deps.env, platform: this.deps.platform, home: this.deps.home, run: this.deps.run, isFile: this.deps.isFile, listDir: this.deps.listDir, start: this.deps.start, wslWindow });
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

/** Both tiles' texts in the conversation are BridgeTexts. */
export type { BridgeTexts };

export function activate(context: vscode.ExtensionContext, deps?: Partial<BridgeDeps>): ClaudeCodeBridge {
	const home = deps?.home ?? os.homedir();
	const full: BridgeDeps = {
		run: deps?.run ?? createRunner(home),
		env: deps?.env ?? process.env,
		platform: deps?.platform ?? process.platform,
		home,
		isFile: deps?.isFile,
		listDir: deps?.listDir,
		now: deps?.now,
		start: deps?.start,
		storageDir: deps?.storageDir ?? context.globalStorageUri?.fsPath,
		memento: deps?.memento ?? context.globalState,
		execPath: deps?.execPath ?? process.execPath,
	};
	const bridge = new ClaudeCodeBridge(full);
	const antigravity = new AntigravityBridge(full);
	context.subscriptions.push(bridge, antigravity);
	context.subscriptions.push(vscode.commands.registerCommand(RECHECK_COMMAND, () => bridge.check(true)));
	context.subscriptions.push(vscode.commands.registerCommand(SYNC_COMMAND, () => bridge.syncNow()));
	context.subscriptions.push(vscode.commands.registerCommand(AGY_RECHECK_COMMAND, () => antigravity.check(true)));
	return bridge;
}

export function deactivate(): void {
	// The bridges go with the extension's subscriptions; Breezell forgets the tiles' status with the extension host.
}
