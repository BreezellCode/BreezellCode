/*
 * Agent Bridge. Breezell draws the Claude Code tile on Box › Models › Sign in from package.json
 * (contributes.breezell.ui.signIns): its switch is the setting `agentBridge.claudeCode.enabled`,
 * which Breezell turns on only after the user agreed to the consent. While it is on, this code asks
 * the user's own Claude Code whether it is signed in and tells Breezell (ui.setSignInStatus); signed
 * in, it answers conversations on its models (agent.ts) and brings this window's projects' Claude Code
 * conversations into Breezell (sync.ts). While it is off, nothing here runs Claude Code or reads anything.
 */
import * as vscode from 'vscode';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { Check, Runner, Target, UsageLine, createRunner, detect, fetchUsage, wslPathOf, type Starter } from './claudeCode';
import { fetchModels, runTurn, toolTitle, type ClaudeModel, type Reply, type TurnControls } from './agent';
import { SessionSync, type SyncState } from './sync';
import { deleteSession, joinFor } from './sessions';
import { TEXTS, languageKey, statusOf, syncNotice, type SignInStatus } from './texts';

export const SECTION = 'agentBridge';
export const ENABLED_KEY = 'claudeCode.enabled';
export const ENABLED_SETTING = `${SECTION}.${ENABLED_KEY}`;
export const TILE = 'claudeCode';
export const RECHECK_COMMAND = 'agentBridge.claudeCode.recheck';
/** The page's "Sync conversations" (the tile's action). */
export const SYNC_COMMAND = 'agentBridge.claudeCode.sync';
/** On: a conversation deleted in Breezell is deleted in Claude Code too (off by default; asked before it turns on). */
export const DELETE_SESSIONS_KEY = 'claudeCode.deleteSessions';
/** A check that finds Claude Code signed in brings the conversations in, at most this often. */
export const AUTO_SYNC_MS = 120_000;
/** Coming back to Breezell checks again, at most this often: a sign-in made in a terminal shows up by itself. */
export const FOCUS_RECHECK_MS = 30_000;
/** `/usage` takes several seconds: a quiet check asks it again at most this often ("Check again" always does). */
export const USAGE_REFRESH_MS = 60_000;

export interface BridgeDeps {
	readonly run: Runner;
	readonly env: Readonly<Record<string, string | undefined>>;
	readonly platform: string;
	readonly home: string;
	readonly isFile?: (file: string) => boolean;
	readonly listDir?: (dir: string) => string[];
		readonly now?: () => number;
		readonly start?: Starter;
		/** The plugin's own folder (its global storage): where Claude Code works for a window without a folder. */
		readonly storageDir?: string;
		/** A file of this computer, as text (a distribution's through \\wsl.localhost): tests give their own. */
		readonly readLocal?: (file: string) => Promise<string>;
		/** A file of the window's remote (an SSH host), as text, read through the window: tests give their own. */
		readonly readRemote?: (uri: vscode.Uri) => Promise<string>;
	}

/**
 * Where a conversation's folder (a URI as text) is for Claude Code: a folder of this computer, or one
 * inside WSL for the Claude Code there. Undefined when that Claude Code cannot work in it.
 */
export function folderFor(uri: string | undefined, target: Pick<Target, 'where' | 'distro'>): string | undefined {
	if (!uri) {
		return undefined;
	}
	let parsed: vscode.Uri;
	try {
		parsed = vscode.Uri.parse(uri);
	} catch {
		return undefined;
	}
	if (parsed.scheme === 'file') {
		return parsed.fsPath;
	}
	let authority = parsed.authority;
	try {
		authority = decodeURIComponent(authority);
	} catch {
		// as it is
	}
	if (parsed.scheme !== 'vscode-remote' || !authority.startsWith('wsl+') || target.where !== 'wsl') {
		return undefined;
	}
	// The folder is in one distribution; a Claude Code found in another cannot see it there.
	const distro = authority.slice('wsl+'.length);
	return !target.distro || !distro || distro.toLowerCase() === target.distro.toLowerCase() ? parsed.path : undefined;
}

/** A folder of an SSH window (`vscode-remote://ssh-remote+…/path`), parsed; undefined for any other. */
function sshFolder(uri: string | undefined): vscode.Uri | undefined {
	if (!uri) {
		return undefined;
	}
	try {
		const parsed = vscode.Uri.parse(uri);
		return parsed.scheme === 'vscode-remote' && decodeURIComponent(parsed.authority).startsWith('ssh-remote+') && parsed.path.startsWith('/') ? parsed : undefined;
	} catch {
		return undefined;
	}
}

/**
 * SSH windows whose host is the WSL distribution this Claude Code runs in (an SSH server in WSL, reached
 * through localhost): their folders are the same files under the same paths. The machine says so itself: the
 * host's /etc/machine-id, read through the window, is the distribution's own. Each host is asked once. Another
 * host, or one that does not say, is not this one: Claude Code working there would change other files.
 */
export class SameMachineHosts {
	private readonly asked = new Map<string, Promise<boolean>>();
	private readonly answered = new Map<string, boolean>();

	constructor(private readonly readLocal: (file: string) => Promise<string>, private readonly readRemote: (uri: vscode.Uri) => Promise<string>) { }

	/** Where a folder of such a host is for this Claude Code (its path); undefined for any other folder. */
	async folderFor(uri: string | undefined, target: Pick<Target, 'where' | 'distro'>): Promise<string | undefined> {
		const folder = sshFolder(uri);
		return folder && target.where === 'wsl' && await this.same(folder, target) ? folder.path : undefined;
	}

	/** As folderFor, from what was answered already: for what cannot wait (a sync's folders, a file's link). */
	knownFolderFor(uri: string | undefined, target: Pick<Target, 'where' | 'distro'>): string | undefined {
		const folder = sshFolder(uri);
		return folder && target.where === 'wsl' && this.answered.get(SameMachineHosts.key(folder, target)) === true ? folder.path : undefined;
	}

	/** Another Claude Code: asked again. */
	forget(): void {
		this.asked.clear();
		this.answered.clear();
	}

	private static key(folder: vscode.Uri, target: Pick<Target, 'distro'>): string {
		return `${folder.authority}\n${target.distro ?? ''}`;
	}

	private same(folder: vscode.Uri, target: Pick<Target, 'where' | 'distro'>): Promise<boolean> {
		const key = SameMachineHosts.key(folder, target);
		let asked = this.asked.get(key);
		if (!asked) {
			const idOf = (text: string) => text.trim().split(/\s+/)[0] ?? '';
			const here = localPathOf('/etc/machine-id', target);
			asked = (async () => {
				if (!here) {
					return false;
				}
				try {
					const [there, mine] = await Promise.all([this.readRemote(folder.with({ path: '/etc/machine-id', query: '', fragment: '' })), this.readLocal(here)]);
					return /^[0-9a-f]{16,}$/i.test(idOf(there)) && idOf(there) === idOf(mine);
				} catch {
					return false;
				}
			})();
			this.asked.set(key, asked);
			void asked.then(same => { this.answered.set(key, same); });
		}
		return asked;
	}
}

/**
 * A path Claude Code names, as this computer reaches it: itself, or for a Claude Code in WSL its drive
 * (/mnt/c/… is C:\…) or its distribution's files through \\wsl.localhost. Undefined when not absolute.
 */
export function localPathOf(path: string, target: Pick<Target, 'where' | 'distro'>): string | undefined {
	if (target.where !== 'wsl') {
		return /^([A-Za-z]:[\\/]|\\\\|\/)/.test(path) ? path : undefined;
	}
	if (!path.startsWith('/')) {
		return undefined;
	}
	const drive = /^\/mnt\/([a-z])(\/.*)?$/i.exec(path);
	if (drive) {
		return `${drive[1].toUpperCase()}:${(drive[2] ?? '/').replace(/\//g, '\\')}`;
	}
	return target.distro ? `\\\\wsl.localhost\\${target.distro}${path.replace(/\//g, '\\')}` : undefined;
}

/**
 * A path Claude Code names, as Breezell opens it (a URI): in the distribution of a WSL window (the folder
 * the conversation is in tells), otherwise as this computer reaches it. Undefined when Breezell cannot.
 */
export function uriOfPath(path: string, folder: string | undefined, target: Pick<Target, 'where' | 'distro'>, sameMachine = false): string | undefined {
	let parsed: vscode.Uri | undefined;
	try {
		parsed = folder ? vscode.Uri.parse(folder) : undefined;
	} catch {
		parsed = undefined;
	}
	// A WSL window, or an SSH window whose host is that distribution (SameMachineHosts): the window opens its paths.
	if (parsed && parsed.scheme === 'vscode-remote') {
		return target.where === 'wsl' && (folderFor(folder, target) !== undefined || sameMachine) && path.startsWith('/') ? parsed.with({ path, query: '', fragment: '' }).toString() : undefined;
	}
	const local = localPathOf(path, target);
	return local ? vscode.Uri.file(local).toString() : undefined;
}

/** A folder's last name, from its URI as text (`…/my%20app` → `my app`): what a window without its own name for it shows. */
export function folderName(folder: string): string {
	const last = folder.replace(/\/+$/, '').split('/').pop() ?? folder;
	try {
		return decodeURIComponent(last);
	} catch {
		return last;
	}
}

/** A file's text as it is now, when it is there and not too big to show (a Write about to replace it). */
async function textNow(file: string | undefined): Promise<string | undefined> {
	if (!file) {
		return undefined;
	}
	try {
		const stat = await fs.promises.stat(file);
		return stat.isFile() && stat.size <= WRITE_BEFORE_BYTES ? await fs.promises.readFile(file, 'utf8') : undefined;
	} catch {
		return undefined;
	}
}
const WRITE_BEFORE_BYTES = 1024 * 1024;

/**
 * A window that is in WSL (its folders are `vscode-remote://wsl+<distribution>/…`): the Claude Code in
 * that distribution is the one asked first. This plugin itself runs on the Windows side.
 */
export function wslWindowOf(remoteName: string | undefined, folders: readonly { readonly uri: { readonly authority: string } }[] | undefined): { distro?: string } | undefined {
	if (remoteName !== 'wsl') {
		return undefined;
	}
	let authority = folders?.[0]?.uri.authority ?? '';
	try {
		authority = decodeURIComponent(authority);
	} catch {
		// as it is
	}
	const distro = authority.startsWith('wsl+') ? authority.slice('wsl+'.length) : '';
	return distro ? { distro } : {};
}

type BreezellUi = { setSignInStatus?(tileId: string, status: SignInStatus | undefined): Thenable<void> };

export class ClaudeCodeBridge implements vscode.Disposable {
	private readonly listeners: vscode.Disposable[] = [];
	private running: Promise<void> | undefined;
	/** A check asked for while one runs: one more runs after it, with its busy line if either wanted one. */
	private queued: { loud: boolean } | undefined;
	private lastCheckAt = 0;
	private lastCheck: Check | undefined;
	/** The limits last read, and from which Claude Code: they are shown only with that one. */
	private lastUsage: UsageLine[] | undefined;
	private lastUsageAt = 0;
	private lastTargetKey: string | undefined;
	/** The Claude Code that answers turns: the one the last check found signed in. */
	private target: Target | undefined;
	private agent: vscode.Disposable | undefined;
	/** Turns under way, by the Breezell conversation they answer: how to stop one of their subagents. */
	private readonly turns = new Map<string, TurnControls>();
	/** The models offered last: a subagent's model is named as one of them. */
	private models: readonly ClaudeModel[] | undefined;
	/** Which Claude Code (where, path, version) the models offered are of. */
	private modelsOf: string | undefined;
	private readonly sync: SessionSync;
	/** SSH windows whose host is this Claude Code's WSL distribution: their folders are its own. */
	private readonly hosts: SameMachineHosts;
	/** What the last sync came to, shown on the page. */
	private lastSync: SyncState | undefined;
	private disposed = false;

	constructor(private readonly deps: BridgeDeps) {
		this.hosts = new SameMachineHosts(
			deps.readLocal ?? (file => fs.promises.readFile(file, 'utf8')),
			deps.readRemote ?? (async uri => new TextDecoder().decode(await vscode.workspace.fs.readFile(uri))),
		);
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
		this.listeners.push(vscode.workspace.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(ENABLED_SETTING)) {
				if (this.enabled()) {
					void this.check(true);
				} else {
					this.lastCheck = undefined;
					this.lastUsage = undefined;
					this.lastTargetKey = undefined;
					this.target = undefined;
					this.forgetSync();
					this.dropAgent();
					this.report(undefined);
				}
			}
		}));
		this.listeners.push(vscode.window.onDidChangeWindowState(state => {
			if (state.focused && this.enabled() && this.now() - this.lastCheckAt >= FOCUS_RECHECK_MS) {
				void this.check(false);
			}
		}));
		const languageChanged = vscode.breezell?.onDidChangeLanguage;
		if (languageChanged) {
			this.listeners.push(languageChanged(() => {
				if (this.enabled()) {
					this.show();
				}
			}));
		}
		if (this.enabled()) {
			void this.check(true);
		}
	}

	/** The switch on the tile; off until the user turned it on and agreed. */
	enabled(): boolean {
		return vscode.workspace.getConfiguration(SECTION).get<boolean>(ENABLED_KEY, false) === true;
	}

	/**
	 * Asks Claude Code again. `loud`: the page says it is checking meanwhile (the switch was just
	 * turned on, or "Check again" was pressed); a quiet check after coming back to Breezell keeps what
	 * the page shows until the answer differs.
	 */
	check(loud: boolean): Promise<void> {
		if (!this.enabled() || this.disposed) {
			return Promise.resolve();
		}
		if (this.running) {
			this.queued = { loud: loud || !!this.queued?.loud };
			return this.running;
		}
		this.running = this.runChecks(loud).finally(() => { this.running = undefined; });
		return this.running;
	}

	private async runChecks(loud: boolean): Promise<void> {
		for (let next: { loud: boolean } | undefined = { loud }; next && !this.disposed; next = this.takeQueued()) {
			this.lastCheckAt = this.now();
			if (next.loud) {
				this.report({ connected: false, busy: true });
			}
			const { check, target } = await detect({
				env: this.deps.env, platform: this.deps.platform, home: this.deps.home, run: this.deps.run, isFile: this.deps.isFile, listDir: this.deps.listDir, start: this.deps.start,
				wslWindow: wslWindowOf(vscode.env.remoteName, vscode.workspace.workspaceFolders),
			});
			// Turned off while it ran: what was found is not to be shown.
			if (this.disposed || !this.enabled()) {
				return;
			}
			const key = target ? `${target.where}:${target.distro ?? ''}:${target.path}` : undefined;
			if (key !== this.lastTargetKey || check.kind !== 'signedIn') {
				this.lastUsage = undefined;
				this.forgetSync();
			}
			this.lastTargetKey = key;
			this.lastCheck = check;
			this.show();
			// Signed in, it answers conversations and brings them in; otherwise its models leave the picker.
			this.target = check.kind === 'signedIn' ? target : undefined;
			if (this.target) {
				await this.offerModels(this.target, `${key}:${check.kind === 'signedIn' ? check.version ?? '' : ''}`, next.loud);
				if (this.target && this.agent && this.sync.due(AUTO_SYNC_MS)) {
					void this.syncRun(false);
				}
			} else {
				this.dropAgent();
			}
			// The limits come after: the connection shows at once, the usage a few seconds later.
			if (check.kind === 'signedIn' && target && (next.loud || !this.lastUsage || this.now() - this.lastUsageAt >= USAGE_REFRESH_MS)) {
				const usage = await fetchUsage(target);
				if (this.disposed || !this.enabled() || this.lastCheck !== check) {
					return;
				}
				this.lastUsageAt = this.now();
				if (usage) {
					this.lastUsage = usage;
					this.show();
				}
			}
		}
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

	/** Breezell's plugin agents API; an older Breezell has none. */
	private agentsApi(): typeof vscode.breezell.agents | undefined {
		return (vscode.breezell as unknown as { agents?: typeof vscode.breezell.agents } | undefined)?.agents;
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

	/** Registers the agent once, and lists the models this Claude Code offers: asked again on a loud check, or of another Claude Code. */
	private async offerModels(target: Target, which: string, refresh: boolean): Promise<void> {
		const agents = this.agentsApi();
		if (!agents || typeof agents.register !== 'function') {
			return;
		}
		if (!this.agent) {
			this.agent = agents.register(TILE, {
				runTurn: (turn, reply, token) => this.answer(turn, reply, token),
				stopSubagent: (conversationId, toolId) => this.turns.get(conversationId)?.stopSubagent?.(toolId) ?? false,
			});
			this.modelsOf = undefined;
		}
		if (!refresh && this.modelsOf === which) {
			return;
		}
		const models = await fetchModels(target);
		this.models = models;
		if (this.disposed || !this.agent || this.target !== target) {
			return;
		}
		this.modelsOf = which;
		await Promise.resolve(agents.setModels(TILE, models)).catch(error => console.warn(`[Agent Bridge] the models were not taken: ${error?.message ?? error}`));
	}

	private dropAgent(): void {
		this.agent?.dispose();
		this.agent = undefined;
		this.modelsOf = undefined;
	}

	/** A turn of a Breezell conversation on one of its models: Claude Code answers it in the conversation's folder. */
	private async answer(turn: vscode.breezell.AgentTurn, reply: vscode.breezell.AgentReply, token: vscode.CancellationToken): Promise<{ session?: string; error?: string; entry?: string; apiError?: string }> {
		const target = this.target;
		if (!target || !this.enabled()) {
			throw new Error(this.texts().notConnected);
		}
		// Claude Code works in a folder: the conversation's own, or for a window without one a folder of the
		// plugin's own, never one this plugin happens to run in.
		const folder = turn.folders[0];
		// An SSH window whose host is this distribution (SameMachineHosts) is one of its folders too.
		const cwd = folder ? folderFor(folder, target) ?? await this.hosts.folderFor(folder, target) : await this.ownFolder();
		if (!cwd) {
			throw new Error(this.texts().folderUnreachable.replace('{folder}', folder));
		}
		// The rest of the window's folders too: Claude Code works in the whole workspace (those it can reach).
		const others = await Promise.all(turn.folders.slice(1).map(async other => folderFor(other, target) ?? await this.hosts.folderFor(other, target)));
		const addDirs = others.filter((dir): dir is string => !!dir).map(dir => target.where === 'wsl' ? wslPathOf(dir) : dir);
		// The files it names, as Breezell opens them; a window without a folder works in this computer's own.
		const sameMachine = this.hosts.knownFolderFor(folder, target) !== undefined;
		const files = { uriOf: (path: string) => uriOfPath(path, folder, target, sameMachine), textOf: (path: string) => textNow(localPathOf(path, target)) };
		// Breezell may stop one of its subagents (Stop on that subagent's page) while it runs.
		// Breezell's own tools its agent may call (its memory lookup), offered to Claude Code in this turn.
		const breezellTools = typeof reply.breezellTools === 'function' && typeof reply.callBreezellTool === 'function'
			? await Promise.resolve(reply.breezellTools()).then(tools => tools, () => [])
			: [];
		const controls: TurnControls = {
			modelIdOf: model => this.models?.find(m => m.id !== 'default' && (m.id === model || m.resolved === model))?.id,
			...(breezellTools.length ? { breezellTools, callBreezellTool: (...call: Parameters<NonNullable<typeof reply.callBreezellTool>>) => reply.callBreezellTool!(...call) } : {}),
		};
		this.turns.set(turn.conversationId, controls);
		try {
			return await runTurn(target, { model: turn.model, text: turn.text, attachments: turn.attachments, cwd, session: turn.session, history: turn.history, effort: turn.effort, addDirs, memories: turn.memories, continuing: turn.continuing, notices: turn.notices }, reply as Reply, token,
				path => target.where === 'wsl' ? wslPathOf(path) : path, files, controls);
		} finally {
			// What it wrote stays, an error shows after it, and the session goes on next time either way.
			if (this.turns.get(turn.conversationId) === controls) {
				this.turns.delete(turn.conversationId);
			}
		}
	}

	/** Where Claude Code works for a window without a folder: an empty folder of the plugin's own. */
	private async ownFolder(): Promise<string> {
		const dir = this.ownFolderPath();
		await fs.promises.mkdir(dir, { recursive: true });
		return dir;
	}

	private ownFolderPath(): string {
		return path.join(this.deps.storageDir ?? path.join(this.deps.home, '.agent-bridge'), 'claude-code');
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

	private takeQueued(): { loud: boolean } | undefined {
		const queued = this.queued;
		this.queued = undefined;
		return queued;
	}

	private texts() {
		return TEXTS[languageKey(vscode.breezell?.language || vscode.env.language)];
	}

	private now(): number {
		return this.deps.now ? this.deps.now() : Date.now();
	}

	/** The page as things are: the connection, the account and the last sync, and the limits. */
	private show(): void {
		if (this.lastCheck) {
			this.report(statusOf(this.lastCheck, this.texts(), this.lastUsage, undefined, this.lastSync));
		}
	}

	private report(status: SignInStatus | undefined): void {
		const ui = vscode.breezell?.ui as BreezellUi | undefined;
		// An older Breezell has no sign-in tiles: there is nothing to tell.
		if (typeof ui?.setSignInStatus !== 'function') {
			return;
		}
		Promise.resolve(ui.setSignInStatus(TILE, status)).catch(error => console.warn(`[Agent Bridge] the tile's status was not taken: ${error?.message ?? error}`));
	}

	dispose(): void {
		this.disposed = true;
		this.dropAgent();
		this.listeners.forEach(l => l.dispose());
		this.listeners.length = 0;
	}
}

export function activate(context: vscode.ExtensionContext, deps?: Partial<BridgeDeps>): ClaudeCodeBridge {
	const home = deps?.home ?? os.homedir();
	const bridge = new ClaudeCodeBridge({
		run: deps?.run ?? createRunner(home),
		env: deps?.env ?? process.env,
		platform: deps?.platform ?? process.platform,
		home,
		isFile: deps?.isFile,
		listDir: deps?.listDir,
			now: deps?.now,
			start: deps?.start,
			storageDir: deps?.storageDir ?? context.globalStorageUri?.fsPath,
		});
	context.subscriptions.push(bridge);
	context.subscriptions.push(vscode.commands.registerCommand(RECHECK_COMMAND, () => bridge.check(true)));
	context.subscriptions.push(vscode.commands.registerCommand(SYNC_COMMAND, () => bridge.syncNow()));
	return bridge;
}

export function deactivate(): void {
	// The bridge goes with the extension's subscriptions; Breezell forgets the tile's status with the extension host.
}
