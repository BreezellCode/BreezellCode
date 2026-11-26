/*
 * What every agent's tile does, whichever agent it connects (Claude Code, Antigravity CLI): the framework an agent of
 * Agent Bridge is built on (agents/README.md). Breezell draws the tile on Box › Models › Sign in from package.json
 * (contributes.breezell.ui.signIns): its switch is a setting, which Breezell turns on only after the user agreed to
 * the tile's consent. While it is on, the bridge asks the user's own agent whether it is signed in and tells Breezell
 * (ui.setSignInStatus); signed in, it answers conversations on its models: a turn's folders, the files it names and
 * Breezell's tools it is offered are found here, the turn itself is the agent's (agents/<agent>/turn.ts). While it is
 * off, nothing of it runs the agent or reads anything.
 *
 * Checking costs the agent's own programs (each start of Claude Code or agy is a few hundred MB and up to seconds of
 * CPU), so a check asks no more than it must: coming back to Breezell, the program found before and its version (its
 * file unchanged) are taken as they were, and what another of Breezell's windows found moments ago is taken as it is
 * (checks.ts). "Check again" and turning the switch on always ask everything.
 */
import * as vscode from 'vscode';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { CheckCache, type SharedCheck } from './checks';
import { installOf, locateProgram, nativeTarget, programStamp, wslPathOf, wslTarget, type Install, type ProgramSpec, type Runner, type Starter, type Target } from './cli';
import { KEEP_ALIVE_SETTING, KeptProcesses, keepAliveMs } from './keepAlive';
import type { UsageLine } from './limits';
import { localPathOf, wslWindowOf } from './paths';
import { keepAliveRow, languageKey, type LanguageKey, type SignInStatus } from './texts';
import type { Reply, Turn, TurnControls, TurnFiles, TurnResult } from './turn';
import { folderFor, SameMachineHosts, textNow, uriOfPath } from './workspace';

export const SECTION = 'agentBridge';
/** Coming back to Breezell checks again, at most this often: a sign-in made in a terminal shows up by itself. */
export const FOCUS_RECHECK_MS = 30_000;
/**
 * An agent's `/usage` takes seconds of CPU (Claude Code's reads all of its local history): a quiet check asks it again
 * at most this often, by any of Breezell's windows; "Check again" always does.
 */
export const LIMITS_REFRESH_MS = 5 * 60_000;

export interface BridgeDeps {
	readonly run: Runner;
	readonly env: Readonly<Record<string, string | undefined>>;
	readonly platform: string;
	readonly home: string;
	readonly isFile?: (file: string) => boolean;
	readonly listDir?: (dir: string) => string[];
	readonly now?: () => number;
	readonly start?: Starter;
	/** The plugin's own folder (its global storage): where an agent works for a window without a folder, and what windows share. */
	readonly storageDir?: string;
	/** Where the plugin keeps small things between runs (its global state): each session's usage so far. */
	readonly memento?: Pick<vscode.Memento, 'get' | 'update'>;
	/** Where it keeps what is the window's project's own between runs (its workspace state): the sessions brought in. */
	readonly workspaceMemento?: Pick<vscode.Memento, 'get' | 'update'>;
	/** A file of this computer, as text (a distribution's through \\wsl.localhost): tests give their own. */
	readonly readLocal?: (file: string) => Promise<string>;
	/** A file of the window's remote (an SSH host), as text, read through the window: tests give their own. */
	readonly readRemote?: (uri: vscode.Uri) => Promise<string>;
	/** Breezell's own program (the extension host's): run as Node, it is the relay for an agent in WSL (mcpHttp.ts). */
	readonly execPath?: string;
	/** What windows share of their checks (checks.ts); none: each window asks its agent itself. */
	readonly shared?: (tile: string) => CheckCache | undefined;
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
 * A check, as it was asked for: `loud`, the page says it is checking meanwhile and everything is asked again (the
 * switch was just turned on, or "Check again" was pressed); `start`, the window just opened (the page says it is
 * checking, and what another window found moments ago is taken). Neither: coming back to Breezell, quietly.
 */
type CheckAsked = { readonly loud: boolean; readonly start?: boolean };

/** What one check came to: what was found out, the agent that answers turns (signed in), and its program then. */
type Found<C> = { readonly check: C; readonly target?: Target; readonly stamp?: string };

/** The program a check found, kept for the next quiet one (its version, while its file is unchanged). */
type Located = { readonly window: string; readonly target: Target; readonly stamp?: string; readonly version?: string; readonly signedIn: boolean };

/** Where an install is, as one string. */
const installKey = (install: Pick<Target, 'where' | 'path' | 'distro'>): string => `${install.where}:${install.distro ?? ''}:${install.path}`;

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
	/** A check asked for while one runs: one more runs after it, as loud as the loudest asked. */
	private queued: CheckAsked | undefined;
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
	/** The program the last check found, for the next quiet one. */
	private located: Located | undefined;
	/** SSH windows whose host is the agent's WSL distribution: their folders are its own. */
	protected readonly hosts: SameMachineHosts;
	/** What Breezell's windows share of this tile's checks. */
	private readonly shared: CheckCache | undefined;
	/** The agent's programs kept between their conversations' turns, while the user turned that on (keepAlive.ts). */
	protected readonly kept: KeptProcesses;
	protected disposed = false;

	constructor(protected readonly deps: BridgeDeps, protected readonly tile: string, private readonly enabledKey: string, private readonly ownFolderName: string) {
		this.hosts = new SameMachineHosts(
			deps.readLocal ?? (file => fs.promises.readFile(file, 'utf8')),
			deps.readRemote ?? (async uri => new TextDecoder().decode(await vscode.workspace.fs.readFile(uri))),
		);
		this.shared = deps.shared?.(tile);
		this.kept = new KeptProcesses({
			idleMs: () => this.enabled() ? keepAliveMs(vscode.workspace.getConfiguration(SECTION).get<number>(KEEP_ALIVE_SETTING, 0)) : 0,
			onChange: () => {
				if (!this.disposed && this.enabled()) {
					this.show();
				}
			},
			...(deps.now ? { now: deps.now } : {}),
			log: line => console.log(line),
		});
	}

	/** The agent's program: what it is called and where its installers put it. */
	protected abstract readonly program: ProgramSpec;
	/** Its config folder on this computer, for an install found here (its sessions, its records). */
	protected abstract nativeConfigDir(): string | undefined;
	/** Asks the agent found: whether it is signed in, and to what. `version`: known already (its program unchanged). */
	protected abstract inspect(target: Target, known: { readonly version?: string }): Promise<C>;
	/** What a check says when the agent is nowhere to be found. */
	protected abstract notInstalled(): C;
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
	/**
	 * Its models take a run of its program to list (Claude Code's `initialize`): the list another window was given by
	 * the same install is taken as it is (tookModels). An agent that lists them from its check has nothing to share.
	 */
	protected readonly sharesModels: boolean = false;
	/** The models another window was given, taken as this window's (sharesModels). */
	protected tookModels(_models: readonly vscode.breezell.AgentModel[]): void { }
	/**
	 * Where the agent keeps a session's record (`cwd`: the folder as the agent names it), as this computer reaches it:
	 * a kept program is not gone on with once that record changed by something else. None: not told.
	 */
	protected recordOf(_target: Target, _cwd: string): Promise<((session: string) => string | undefined) | undefined> {
		return Promise.resolve(undefined);
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
			// How long programs are kept: off closes the idle ones at once; another time counts from each one's last turn.
			if (e.affectsConfiguration(`${SECTION}.${KEEP_ALIVE_SETTING}`)) {
				this.kept.configure();
				if (this.enabled()) {
					this.show();
				}
			}
			if (e.affectsConfiguration(`${SECTION}.${this.enabledKey}`)) {
				if (this.enabled()) {
					void this.check(true);
				} else {
					this.lastCheck = undefined;
					this.lastTargetKey = undefined;
					this.target = undefined;
					this.located = undefined;
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
			void this.ask({ loud: true, start: true });
		}
	}

	/** The switch on the tile; off until the user turned it on and agreed. */
	enabled(): boolean {
		return vscode.workspace.getConfiguration(SECTION).get<boolean>(this.enabledKey, false) === true;
	}

	/**
	 * Asks the agent again. `loud`: the page says it is checking meanwhile, and everything is asked again (the switch
	 * was just turned on, or "Check again" was pressed); a quiet check after coming back to Breezell keeps what the page
	 * shows until the answer differs, and asks only what may have changed.
	 */
	check(loud: boolean): Promise<void> {
		return this.ask({ loud });
	}

	private ask(asked: CheckAsked): Promise<void> {
		if (!this.enabled() || this.disposed) {
			return Promise.resolve();
		}
		if (this.running) {
			const before = this.queued;
			this.queued = { loud: asked.loud || !!before?.loud, start: !!asked.start && (!before || !!before.start) };
			return this.running;
		}
		this.running = this.runChecks(asked).finally(() => { this.running = undefined; });
		return this.running;
	}

	private async runChecks(first: CheckAsked): Promise<void> {
		for (let next: CheckAsked | undefined = first; next && !this.disposed; next = this.takeQueued()) {
			this.lastCheckAt = this.now();
			if (next.loud) {
				this.report({ connected: false, busy: true });
			}
			const wslWindow = wslWindowOf(vscode.env.remoteName, vscode.workspace.workspaceFolders);
			const window = wslWindow ? `wsl:${wslWindow.distro ?? ''}` : 'local';
			// Another window's check of moments ago, unless everything is to be asked; else this window's own.
			const { check, target, stamp } = (next.loud && !next.start ? undefined : this.takeShared(window)) ?? await this.detect(wslWindow, window, next.loud);
			// Turned off while it ran: what was found is not to be shown.
			if (this.disposed || !this.enabled()) {
				return;
			}
			const key = target ? installKey(target) : undefined;
			const signedIn = this.isSignedIn(check);
			if (key !== this.lastTargetKey || !signedIn) {
				this.limits = undefined;
				this.forgetTarget();
				// Programs of another install (or of one no longer signed in) are not gone on with.
				void this.kept.closeAll(signedIn ? 'another install' : 'not signed in');
			}
			this.lastTargetKey = key;
			this.lastCheck = check;
			this.located = target ? { window, target, stamp, version: versionOf(check), signedIn } : undefined;
			this.show();
			// Signed in, it answers conversations; otherwise its models leave the picker.
			this.target = signedIn ? target : undefined;
			if (this.target) {
				await this.offerModels(this.target, check, `${key}:${this.modelsKey(check)}`, next.loud && !next.start);
				this.afterModels(next.loud);
			} else {
				this.dropAgent();
			}
			await this.refreshLimits(check, target, next.loud && !next.start);
		}
	}

	/**
	 * The agent, asked. A quiet check takes the program found before while it was signed in (its version too, its file
	 * unchanged); should that one say anything else now, it is looked for again, as a loud check does.
	 */
	private async detect(wslWindow: { distro?: string } | undefined, window: string, loud: boolean): Promise<Found<C>> {
		const before = !loud && this.located?.window === window && this.located.signedIn ? this.located : undefined;
		if (before) {
			const stamp = await this.stampOf(before.target);
			const check = await this.inspect(before.target, stamp !== undefined && stamp === before.stamp && before.version ? { version: before.version } : {});
			if (this.isSignedIn(check)) {
				this.publish(window, { check, target: before.target, stamp });
				return { check, target: before.target, stamp };
			}
		}
		const target = await locateProgram(this.program, { env: this.deps.env, platform: this.deps.platform, home: this.deps.home, run: this.deps.run, isFile: this.deps.isFile, listDir: this.deps.listDir, start: this.deps.start, wslWindow }, this.nativeConfigDir());
		const found: Found<C> = target ? { check: await this.inspect(target, {}), target, stamp: await this.stampOf(target) } : { check: this.notInstalled() };
		this.publish(window, found);
		return found;
	}

	/** The program file's stamp (cli.ts programStamp): at once for one on this computer, through \\wsl$ for one in WSL. */
	private async stampOf(target: Target): Promise<string | undefined> {
		if (target.where === 'native') {
			try {
				const stat = fs.statSync(target.path);
				return stat.isFile() ? `${stat.size}:${stat.mtimeMs}` : undefined;
			} catch {
				return undefined;
			}
		}
		return programStamp(target);
	}

	/** A check another window made moments ago of this kind of window, its agent ready to run here. */
	private takeShared(window: string): Found<C> | undefined {
		const shared = this.shared?.check<C>(window, FOCUS_RECHECK_MS);
		if (!shared?.check || typeof (shared.check as { kind?: unknown }).kind !== 'string') {
			return undefined;
		}
		const target = shared.install ? this.targetOf(shared.install) : undefined;
		// Signed in there, but its agent cannot be run from here the same way: asked here instead.
		if (this.isSignedIn(shared.check) && !target) {
			return undefined;
		}
		return { check: shared.check, ...(target ? { target } : {}), ...(shared.stamp ? { stamp: shared.stamp } : {}) };
	}

	private publish(window: string, found: Found<C>): void {
		const version = versionOf(found.check);
		this.shared?.putCheck<C>(window, { check: found.check, ...(found.target ? { install: installOf(found.target) } : {}), ...(found.stamp ? { stamp: found.stamp } : {}), ...(version ? { version } : {}) } satisfies Omit<SharedCheck<C>, 'at'>);
	}

	/** An install another window found, as a target here: run the same way, without looking for it again. */
	private targetOf(install: Install): Target | undefined {
		if (install.where === 'native') {
			return nativeTarget(install.location, this.deps.run, this.deps.start, this.nativeConfigDir());
		}
		return this.deps.platform === 'win32' && install.location.startsWith('/') ? wslTarget(this.program, install.location, install.distro, this.deps.run, this.deps.env, this.deps.start) : undefined;
	}

	/**
	 * Its limits come after the check was shown: the connection at once, its limits a few seconds later. Asked again
	 * at most every LIMITS_REFRESH_MS (by any of Breezell's windows), except on a loud check.
	 */
	private async refreshLimits(check: C, target: Target | undefined, loud: boolean): Promise<void> {
		if (!target || !this.isSignedIn(check)) {
			return;
		}
		const install = installKey(target);
		if (!loud) {
			const shared = this.shared?.limits(install, LIMITS_REFRESH_MS);
			if (shared && (!this.limits || this.limitsAt < this.now() - shared.ageMs)) {
				this.limits = shared.lines;
				this.limitsAt = this.now() - shared.ageMs;
				this.show();
				return;
			}
			if (this.limits && this.now() - this.limitsAt < LIMITS_REFRESH_MS) {
				return;
			}
		}
		const limits = await this.fetchLimits(target, check);
		if (this.disposed || !this.enabled() || this.lastCheck !== check) {
			return;
		}
		this.limitsAt = this.now();
		if (limits) {
			this.limits = limits;
			this.shared?.putLimits(install, limits);
			this.show();
		}
	}

	/** Breezell's plugin agents API; an older Breezell has none. */
	protected agentsApi(): typeof vscode.breezell.agents | undefined {
		return (vscode.breezell as unknown as { agents?: typeof vscode.breezell.agents } | undefined)?.agents;
	}

	/**
	 * Registers the agent once, and lists the models it offers: asked again on a loud check, or of another install. The
	 * models another window was given by the same install are taken as they are.
	 */
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
		const known = refresh || !this.sharesModels ? undefined : this.shared?.models(which) as readonly vscode.breezell.AgentModel[] | undefined;
		if (known?.length) {
			this.tookModels(known);
		}
		const models = known?.length ? known : await this.listModels(target, check);
		if (this.disposed || !this.agent || this.target !== target) {
			return;
		}
		this.modelsOf = which;
		if (!known?.length && this.sharesModels) {
			this.shared?.putModels(which, models);
		}
		await Promise.resolve(agents.setModels(this.tile, models)).catch(error => console.warn(`[Agent Bridge] the models were not taken: ${error?.message ?? error}`));
	}

	protected dropAgent(): void {
		this.agent?.dispose();
		this.agent = undefined;
		this.modelsOf = undefined;
		// No more turns: none of its programs is kept.
		void this.kept.closeAll('the agent is not offered now');
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
		// Its program kept between this conversation's turns, while the user turned that on.
		const agentCwd = target.where === 'wsl' ? wslPathOf(cwd) : cwd;
		const recordOf = this.kept.enabled ? await this.recordOf(target, agentCwd).catch(() => undefined) : undefined;
		const controls: TurnControls = {
			...this.controlsOf(),
			...(breezellTools.length ? { breezellTools, callBreezellTool: (...call: Parameters<NonNullable<typeof reply.callBreezellTool>>) => reply.callBreezellTool!(...call) } : {}),
			...(this.kept.enabled ? { keepAlive: { pool: this.kept, conversation: turn.conversationId, ...(recordOf ? { recordOf } : {}) } } : {}),
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

	private takeQueued(): CheckAsked | undefined {
		const queued = this.queued;
		this.queued = undefined;
		return queued;
	}

	protected now(): number {
		return this.deps.now ? this.deps.now() : Date.now();
	}

	/** The page as things are: what the agent's check found, and while connected whether its programs are kept. */
	protected show(): void {
		if (this.lastCheck) {
			const status = this.statusOf(this.lastCheck);
			this.report(status.connected ? { ...status, account: [...status.account ?? [], keepAliveRow(this.keepAliveMinutes(), this.kept.size, this.language())] } : status);
		}
	}

	/** How many minutes a program may stay idle, as the user set it; 0: not kept. */
	protected keepAliveMinutes(): number {
		return Math.round(keepAliveMs(vscode.workspace.getConfiguration(SECTION).get<number>(KEEP_ALIVE_SETTING, 0)) / 60_000);
	}

	/** The page's language. */
	protected language(): LanguageKey {
		return languageKey(vscode.breezell?.language || vscode.env.language);
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
		this.kept.dispose();
		this.listeners.forEach(l => l.dispose());
		this.listeners.length = 0;
	}
}

/** The version a check found, when it found the program. */
function versionOf(check: { readonly kind: string }): string | undefined {
	const version = (check as { version?: unknown }).version;
	return typeof version === 'string' && version ? version : undefined;
}

/** The reply, as the runners take it (the same shape as vscode.breezell.AgentReply). */
export const asReply = (reply: vscode.breezell.AgentReply): Reply => reply as Reply;

/** What windows share of each tile's checks, in the plugin's own folder (checks.ts). */
export const sharedChecksIn = (storageDir: string) => (tile: string): CheckCache => new CheckCache(path.join(storageDir, 'checks', `${tile}.json`));
