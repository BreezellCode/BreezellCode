/*
 * What every agent's tile does, whichever agent it connects (Claude Code, Antigravity CLI). Breezell draws the tile
 * on Box › Models › Sign in from package.json (contributes.breezell.ui.signIns): its switch is a setting, which
 * Breezell turns on only after the user agreed to the tile's consent. While it is on, the bridge asks the user's own
 * agent whether it is signed in and tells Breezell (ui.setSignInStatus); signed in, it answers conversations on its
 * models: a turn's folders, the files it names and Breezell's tools it is offered are found here, the turn itself is
 * the agent's (agent.ts, antigravityAgent.ts). While it is off, nothing of it runs the agent or reads anything.
 */
import * as vscode from 'vscode';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { Runner, Starter, Target } from './cli';
import { wslPathOf } from './cli';
import type { UsageLine } from './limits';
import type { SignInStatus } from './texts';
import type { Reply, Turn, TurnControls, TurnFiles, TurnResult } from './turn';

export const SECTION = 'agentBridge';
/** Coming back to Breezell checks again, at most this often: a sign-in made in a terminal shows up by itself. */
export const FOCUS_RECHECK_MS = 30_000;
/** An agent's `/usage` takes several seconds: a quiet check asks it again at most this often ("Check again" always does). */
export const LIMITS_REFRESH_MS = 60_000;

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
		/** Where the plugin keeps small things between runs (its global state): each session's usage so far. */
		readonly memento?: Pick<vscode.Memento, 'get' | 'update'>;
		/** A file of this computer, as text (a distribution's through \\wsl.localhost): tests give their own. */
		readonly readLocal?: (file: string) => Promise<string>;
		/** A file of the window's remote (an SSH host), as text, read through the window: tests give their own. */
		readonly readRemote?: (uri: vscode.Uri) => Promise<string>;
		/** Breezell's own program (the extension host's): run as Node, it is the relay for an agent in WSL (mcpHttp.ts). */
		readonly execPath?: string;
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

/** How soon after Breezell says a turn started the agent's turn begins: the start that said the mode. */
const ENTANGLEMENT_NOTE_WINDOW_MS = 15_000;


/** What a tile's bridge says in the conversation (in Breezell's display language). */
export interface BridgeTexts {
	/** A conversation sent while the agent is not connected. */
	readonly notConnected: string;
	/** Said once at the top of a conversation's reply when the user picked Entanglement, which is Breezell's own models' mode. */
	readonly entanglementNote: string;
	/** A conversation whose folder the agent connected cannot work in: {folder}. */
	readonly folderUnreachable: string;
}

/**
 * One agent's tile: its switch, the checks of the agent (when switched on, on "Check again", on coming back to
 * Breezell), its models in Breezell's picker, and the turns of conversations on them. `C`: what a check found out.
 */
export abstract class AgentBridge<C extends { readonly kind: string }> implements vscode.Disposable {
	protected readonly listeners: vscode.Disposable[] = [];
	/**
	 * The chat mode of the last turn Breezell said started (chat.events), and when. A turn of the agent starts right
	 * after it: its mode as the user picked it (Entanglement included, which the turn itself carries as Agent).
	 */
	private lastTurnStart?: { readonly mode: string; readonly at: number };
	/** Conversations told, this run, that Entanglement does not apply to the agent. */
	private readonly entanglementTold = new Set<string>();
	private running: Promise<void> | undefined;
	/** A check asked for while one runs: one more runs after it, with its busy line if either wanted one. */
	private queued: { loud: boolean } | undefined;
	protected lastCheckAt = 0;
	protected lastCheck: C | undefined;
	/** Its usage limits as its own usage command printed them (fetchLimits): shown with the agent they were read of. */
	protected limits: UsageLine[] | undefined;
	private limitsAt = 0;
	protected lastTargetKey: string | undefined;
	/** The agent that answers turns: the one the last check found signed in. */
	protected target: Target | undefined;
	protected agent: vscode.Disposable | undefined;
	/** Turns under way, by the Breezell conversation they answer: how to stop one of their subagents. */
	protected readonly turns = new Map<string, TurnControls>();
	/** Which agent (where, path, version) the models offered are of. */
	private modelsOf: string | undefined;
	/** SSH windows whose host is the agent's WSL distribution: their folders are its own. */
	protected readonly hosts: SameMachineHosts;
	protected disposed = false;

	constructor(protected readonly deps: BridgeDeps, protected readonly tile: string, private readonly enabledKey: string, private readonly ownFolderName: string) {
		this.hosts = new SameMachineHosts(
			deps.readLocal ?? (file => fs.promises.readFile(file, 'utf8')),
			deps.readRemote ?? (async uri => new TextDecoder().decode(await vscode.workspace.fs.readFile(uri))),
		);
	}

	/** What a check finds: the agent, asked (`wslWindow`: the window is in WSL, so the agent there comes first). */
	protected abstract detect(wslWindow: { distro?: string } | undefined): Promise<{ check: C; target?: Target }>;
	protected abstract isSignedIn(check: C): boolean;
	/** What tells one install of the agent from another, for its models (its version, and what it said of them). */
	protected abstract modelsKey(check: C): string;
	/** Its models for Breezell's picker. */
	protected abstract listModels(target: Target, check: C): Promise<readonly vscode.breezell.AgentModel[]>;
	/** What the tile's page shows of a check. */
	protected abstract statusOf(check: C): SignInStatus;
	protected abstract texts(): BridgeTexts;
	/** Runs a turn on the agent, as found ready here (its folder, the paths as it names them, its controls). */
	protected abstract runOn(target: Target, turn: Turn, reply: vscode.breezell.AgentReply, token: vscode.CancellationToken, pathFor: (path: string) => string, files: TurnFiles, controls: TurnControls, conversationId: string): Promise<TurnResult>;

	/** Another agent was found, or none signed in: what was kept of the last one goes. */
	protected forgetTarget(): void { }
	/** After its models were offered. */
	protected afterModels(_loud: boolean): void { }
	/** Its usage limits, through its own usage command (no model request); undefined: it has none, or could not tell. */
	protected fetchLimits(_target: Target, _check: C): Promise<UsageLine[] | undefined> {
		return Promise.resolve(undefined);
	}
	/** The turn's controls of the agent's own, besides Breezell's tools. */
	protected controlsOf(): Partial<TurnControls> {
		return {};
	}

	/** Starts listening and checking: the last thing a bridge's constructor does. */
	protected start(): void {
		// The mode of each turn as the user picked it (no content): Entanglement is said once in the conversation.
		try {
			const started = (vscode as { breezell?: { chat?: { onDidStartTurn?: vscode.Event<{ readonly mode: string }> } } }).breezell?.chat?.onDidStartTurn;
			if (typeof started === 'function') {
				this.listeners.push(started(e => { this.lastTurnStart = { mode: String(e?.mode ?? ''), at: this.now() }; }));
			}
		} catch {
			// chat.events turned off by the user: nothing is said.
		}
		this.listeners.push(vscode.workspace.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(`${SECTION}.${this.enabledKey}`)) {
				if (this.enabled()) {
					void this.check(true);
				} else {
					this.lastCheck = undefined;
					this.lastTargetKey = undefined;
					this.target = undefined;
					this.limits = undefined;
					this.forgetTarget();
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
		return vscode.workspace.getConfiguration(SECTION).get<boolean>(this.enabledKey, false) === true;
	}

	/**
	 * Asks the agent again. `loud`: the page says it is checking meanwhile (the switch was just turned on, or "Check
	 * again" was pressed); a quiet check after coming back to Breezell keeps what the page shows until the answer differs.
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
			const { check, target } = await this.detect(wslWindowOf(vscode.env.remoteName, vscode.workspace.workspaceFolders));
			// Turned off while it ran: what was found is not to be shown.
			if (this.disposed || !this.enabled()) {
				return;
			}
			const key = target ? `${target.where}:${target.distro ?? ''}:${target.path}` : undefined;
			const signedIn = this.isSignedIn(check);
			if (key !== this.lastTargetKey || !signedIn) {
				this.limits = undefined;
				this.forgetTarget();
			}
			this.lastTargetKey = key;
			this.lastCheck = check;
			this.show();
			// Signed in, it answers conversations; otherwise its models leave the picker.
			this.target = signedIn ? target : undefined;
			if (this.target) {
				await this.offerModels(this.target, check, `${key}:${this.modelsKey(check)}`, next.loud);
				this.afterModels(next.loud);
			} else {
				this.dropAgent();
			}
			await this.refreshLimits(check, target, next.loud);
		}
	}

	/**
	 * Its limits come after the check was shown: the connection at once, its limits a few seconds later. Asked again
	 * at most every LIMITS_REFRESH_MS, except on a loud check.
	 */
	private async refreshLimits(check: C, target: Target | undefined, loud: boolean): Promise<void> {
		if (!target || !this.isSignedIn(check) || !(loud || !this.limits || this.now() - this.limitsAt >= LIMITS_REFRESH_MS)) {
			return;
		}
		const limits = await this.fetchLimits(target, check);
		if (this.disposed || !this.enabled() || this.lastCheck !== check) {
			return;
		}
		this.limitsAt = this.now();
		if (limits) {
			this.limits = limits;
			this.show();
		}
	}

	/** Breezell's plugin agents API; an older Breezell has none. */
	protected agentsApi(): typeof vscode.breezell.agents | undefined {
		return (vscode.breezell as unknown as { agents?: typeof vscode.breezell.agents } | undefined)?.agents;
	}

	/** Registers the agent once, and lists the models it offers: asked again on a loud check, or of another install. */
	private async offerModels(target: Target, check: C, which: string, refresh: boolean): Promise<void> {
		const agents = this.agentsApi();
		if (!agents || typeof agents.register !== 'function') {
			return;
		}
		if (!this.agent) {
			this.agent = agents.register(this.tile, {
				runTurn: (turn, reply, token) => this.answer(turn, reply, token),
				stopSubagent: (conversationId, toolId) => this.turns.get(conversationId)?.stopSubagent?.(toolId) ?? false,
			});
			this.modelsOf = undefined;
		}
		if (!refresh && this.modelsOf === which) {
			return;
		}
		const models = await this.listModels(target, check);
		if (this.disposed || !this.agent || this.target !== target) {
			return;
		}
		this.modelsOf = which;
		await Promise.resolve(agents.setModels(this.tile, models)).catch(error => console.warn(`[Agent Bridge] the models were not taken: ${error?.message ?? error}`));
	}

	protected dropAgent(): void {
		this.agent?.dispose();
		this.agent = undefined;
		this.modelsOf = undefined;
	}

	/** A turn of a Breezell conversation on one of its models: the agent answers it in the conversation's folder. */
	private async answer(turn: vscode.breezell.AgentTurn, reply: vscode.breezell.AgentReply, token: vscode.CancellationToken): Promise<TurnResult> {
		const target = this.target;
		if (!target || !this.enabled()) {
			throw new Error(this.texts().notConnected);
		}
		// The agent works in a folder: the conversation's own, or for a window without one a folder of the plugin's
		// own, never one this plugin happens to run in.
		const folder = turn.folders[0];
		// An SSH window whose host is this distribution (SameMachineHosts) is one of its folders too.
		const cwd = folder ? folderFor(folder, target) ?? await this.hosts.folderFor(folder, target) : await this.ownFolder();
		if (!cwd) {
			throw new Error(this.texts().folderUnreachable.replace('{folder}', folder));
		}
		// Entanglement picked: the agent works as in Agent mode, which the conversation says once, before its reply.
		const start = this.lastTurnStart;
		if (start?.mode === 'entanglement' && this.now() - start.at < ENTANGLEMENT_NOTE_WINDOW_MS && turn.text && !turn.continuing && !this.entanglementTold.has(turn.conversationId)) {
			this.entanglementTold.add(turn.conversationId);
			reply.text(`> ${this.texts().entanglementNote}\n\n`);
		}
		// The rest of the window's folders too: the agent works in the whole workspace (those it can reach).
		const others = await Promise.all(turn.folders.slice(1).map(async other => folderFor(other, target) ?? await this.hosts.folderFor(other, target)));
		const addDirs = others.filter((dir): dir is string => !!dir).map(dir => target.where === 'wsl' ? wslPathOf(dir) : dir);
		// The files it names, as Breezell opens them; a window without a folder works in this computer's own.
		const sameMachine = this.hosts.knownFolderFor(folder, target) !== undefined;
		// An agent in WSL on a folder of this computer names it /mnt/c/…: Breezell's tools take it as this computer's path.
		const localFolder = !folder || /^file:/i.test(folder);
		const files: TurnFiles = {
			uriOf: (path: string) => uriOfPath(path, folder, target, sameMachine),
			textOf: (path: string) => textNow(localPathOf(path, target)),
			...(target.where === 'wsl' && localFolder ? { toolPathOf: (path: string) => path.startsWith('/') ? localPathOf(path, target) : undefined } : {}),
		};
		// Breezell's own tools its agent may call (its memory lookup, its terminal, its edits…), offered in this turn.
		const breezellTools = typeof reply.breezellTools === 'function' && typeof reply.callBreezellTool === 'function'
			? await Promise.resolve(reply.breezellTools()).then(tools => tools, () => [])
			: [];
		// Breezell may stop one of its subagents (Stop on that subagent's page) while it runs.
		const controls: TurnControls = {
			...this.controlsOf(),
			...(breezellTools.length ? { breezellTools, callBreezellTool: (...call: Parameters<NonNullable<typeof reply.callBreezellTool>>) => reply.callBreezellTool!(...call) } : {}),
		};
		this.turns.set(turn.conversationId, controls);
		try {
			return await this.runOn(target, { model: turn.model, text: turn.text, attachments: turn.attachments, cwd, session: turn.session, history: turn.history, effort: turn.effort, addDirs, memories: turn.memories, continuing: turn.continuing, notices: turn.notices, rules: turn.rules, mode: turn.mode, ...(turn.compact ? { compact: true } : {}), ...(turn.autoApprove ? { autoApprove: { mcp: turn.autoApprove.mcp === true } } : {}) }, reply, token,
				path => target.where === 'wsl' ? wslPathOf(path) : path, files, controls, turn.conversationId);
		} finally {
			// What it wrote stays, an error shows after it, and the session goes on next time either way.
			if (this.turns.get(turn.conversationId) === controls) {
				this.turns.delete(turn.conversationId);
			}
		}
	}

	/** Where the agent works for a window without a folder: an empty folder of the plugin's own. */
	private async ownFolder(): Promise<string> {
		const dir = this.ownFolderPath();
		await fs.promises.mkdir(dir, { recursive: true });
		return dir;
	}

	protected ownFolderPath(): string {
		return path.join(this.storageRoot(), this.ownFolderName);
	}

	/** The plugin's own folder (its global storage). */
	protected storageRoot(): string {
		return this.deps.storageDir ?? path.join(this.deps.home, '.agent-bridge');
	}

	private takeQueued(): { loud: boolean } | undefined {
		const queued = this.queued;
		this.queued = undefined;
		return queued;
	}

	protected now(): number {
		return this.deps.now ? this.deps.now() : Date.now();
	}

	/** The page as things are. */
	protected show(): void {
		if (this.lastCheck) {
			this.report(this.statusOf(this.lastCheck));
		}
	}

	protected report(status: SignInStatus | undefined): void {
		const ui = vscode.breezell?.ui as BreezellUi | undefined;
		// An older Breezell has no sign-in tiles: there is nothing to tell.
		if (typeof ui?.setSignInStatus !== 'function') {
			return;
		}
		Promise.resolve(ui.setSignInStatus(this.tile, status)).catch(error => console.warn(`[Agent Bridge] the tile's status was not taken: ${error?.message ?? error}`));
	}

	dispose(): void {
		this.disposed = true;
		this.dropAgent();
		this.listeners.forEach(l => l.dispose());
		this.listeners.length = 0;
	}
}

/** The reply, as the runners take it (the same shape as vscode.breezell.AgentReply). */
export const asReply = (reply: vscode.breezell.AgentReply): Reply => reply as Reply;
