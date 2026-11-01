/**
 * The system input method's host, from Breezell's plugin: its models, loaded once for the system
 * and every Breezell window, and its user model, so what is learned in Breezell and outside it is
 * one (Z requests); where this window's focus is, so the text service leaves the editor and the
 * chat to the plugin (B); the system's native / English state (EV events). One connection; the
 * protocol: system/host/host.ts.
 */
import { spawn } from 'node:child_process';
import { connect, Socket } from 'node:net';
import { AsyncComposer, ImeState, keyRule } from './composers.js';
import { hostPipe, installedHostScript } from './paths.js';

type Reply = { value?: unknown; state?: { composing: boolean; preedit: string; candidates: string[]; commit: string }; error?: string };

/** What the host tells the plugin unasked. */
export interface HostEvent {
	/** The system's state: native or English. */
	readonly mode?: 'n' | 'e';
	/** The system input method is no longer on in this Breezell (another keyboard picked). */
	readonly tipGone?: boolean;
}

/** Where this window's focus is: its editor or chat, the window focused, the plugin on. */
export interface Focus {
	readonly internal: boolean;
	readonly focused: boolean;
	readonly enabled: boolean;
}

export class HostClient {
	private socket?: Socket;
	private connecting?: Promise<boolean>;
	private buffer = '';
	private waiting: { resolve: (line: string) => void; reject: (e: Error) => void; timer: NodeJS.Timeout }[] = [];
	private nextId = 1;
	private started = false;
	private retry?: NodeJS.Timeout;
	private sentFocus = '';
	private disposed = false;
	/** Bumps when the connection is new: compositions opened on an older one must be opened again. */
	generation = 0;

	/**
	 * `focus`: report where this window's focus is (and keep the link up, retrying every 5 s), for
	 * the text service of this process; undefined: connect only to compose.
	 */
	constructor(
		private readonly log: (msg: string) => void,
		private readonly onEvent: (e: HostEvent) => void,
		private readonly focus?: () => Focus,
	) {
		if (focus) {
			void this.connect(false);
		}
	}

	get connected(): boolean {
		return !!this.socket;
	}

	/**
	 * Connects; with `start`, starts the host once when it is installed but not running. False
	 * when there is none.
	 */
	connect(start = true): Promise<boolean> {
		if (this.socket) {
			return Promise.resolve(true);
		}
		const attempt = this.connecting ??= this.open(start).finally(() => { this.connecting = undefined; });
		// One already under way that would not start the host: then this one may.
		return start ? attempt.then(ok => ok || this.open(true)) : attempt;
	}

	private async open(start: boolean): Promise<boolean> {
		if (await this.tryConnect()) {
			return true;
		}
		const script = installedHostScript();
		if (!start || this.started || !script) {
			return false;
		}
		// Installed but not running: Breezell's own runtime runs it, as the text service would, in
		// an environment without what Breezell's extension host leaves in it.
		this.started = true;
		const env: NodeJS.ProcessEnv = {};
		for (const [k, v] of Object.entries(process.env)) {
			if (!/^(ELECTRON_|VSCODE_|CHROME_CRASHPAD)/i.test(k) && k.toUpperCase() !== 'NODE_OPTIONS') {
				env[k] = v;
			}
		}
		env.ELECTRON_RUN_AS_NODE = '1';
		spawn(process.execPath, [script], { detached: true, stdio: 'ignore', windowsHide: true, env }).unref();
		this.log(`started the system input method's host (${script})`);
		for (let i = 0; i < 40; i++) {
			await new Promise(r => setTimeout(r, 250));
			if (await this.tryConnect()) {
				return true;
			}
		}
		return false;
	}

	private tryConnect(): Promise<boolean> {
		return new Promise(resolve => {
			const s = connect(hostPipe());
			s.setEncoding('utf8');
			s.once('connect', () => {
				this.socket = s;
				this.buffer = '';
				this.sentFocus = '';
				this.generation++;
				this.log('system input method host: connected');
				resolve(true);
				this.updateFocus();
			});
			s.on('data', (chunk: string) => this.received(chunk));
			s.on('error', () => resolve(false));
			s.on('close', () => {
				if (this.socket === s) {
					this.socket = undefined;
					this.log('system input method host: disconnected');
				}
				for (const w of this.waiting.splice(0)) {
					clearTimeout(w.timer);
					w.reject(new Error('the input method host went away'));
				}
				this.keepUp();
			});
		});
	}

	/** Reporting focus: the link comes back by itself (the host may start later, or restart). */
	private keepUp(): void {
		if (this.focus && !this.disposed && !this.retry) {
			this.retry = setTimeout(() => { this.retry = undefined; void this.connect(false); }, 5000);
		}
	}

	private received(chunk: string): void {
		this.buffer += chunk;
		let nl: number;
		while ((nl = this.buffer.indexOf('\n')) >= 0) {
			const line = this.buffer.slice(0, nl).replace(/\r$/, '');
			this.buffer = this.buffer.slice(nl + 1);
			if (line.startsWith('EV\t')) {
				const f = line.split('\t');
				if (f[1] === 'mode' && (f[2] === 'n' || f[2] === 'e')) {
					this.onEvent({ mode: f[2] });
				} else if (f[1] === 'tip' && f[2] === '0') {
					this.onEvent({ tipGone: true });
				}
				continue;
			}
			const w = this.waiting.shift();
			if (w) {
				clearTimeout(w.timer);
				w.resolve(line);
			}
		}
	}

	/** A line, then its reply. */
	private send(line: string, timeoutMs: number): Promise<string> {
		const s = this.socket;
		if (!s) {
			return Promise.reject(new Error('not connected to the input method host'));
		}
		return new Promise((resolve, reject) => {
			const timer = setTimeout(() => {
				// A host that does not answer: the link goes (the next request opens a new one).
				s.destroy();
				reject(new Error('the input method host did not answer'));
			}, timeoutMs);
			this.waiting.push({ resolve, reject, timer });
			s.write(line + '\n');
		});
	}

	/** A request about composition `id` (0: none in particular). */
	async request(op: string, id: number, arg?: unknown, timeoutMs = 4000): Promise<Reply> {
		const line = await this.send(`Z\t${JSON.stringify({ op, id, arg })}`, timeoutMs);
		return JSON.parse(line) as Reply;
	}

	/** config.json changed, or (`models`) the model files did: the host reads them again. */
	async reloadConfig(models = false): Promise<void> {
		if (this.socket) {
			await this.send(models ? 'C\tdata' : 'C', 30000);
		}
	}

	/** Says where this window's focus is, when it changed. */
	updateFocus(): void {
		const f = this.focus?.();
		if (!f || !this.socket) {
			return;
		}
		// The text service runs in Breezell's main process: this extension host's parent.
		const line = `B\t${process.ppid}\t${f.internal ? 1 : 0}\t${f.focused ? 1 : 0}\t${f.enabled ? 1 : 0}`;
		if (line !== this.sentFocus) {
			this.sentFocus = line;
			this.send(line, 4000).catch(() => { this.sentFocus = ''; });
		}
	}

	newId(): number {
		return this.nextId++;
	}

	dispose(): void {
		this.disposed = true;
		clearTimeout(this.retry);
		this.socket?.destroy();
	}
}

/** A composition in the host; this side keeps what it last answered. */
export class RemoteComposer implements AsyncComposer {
	private mirror = { composing: false, preedit: '', candidates: [] as string[] };
	private pending = '';
	private readonly rule: (key: string, composing: boolean) => boolean;
	private openedOn = -1;
	private readonly id: number;

	constructor(private readonly engine: HostClient, readonly layout: string, private readonly traditional: boolean, private readonly smart: boolean) {
		this.rule = keyRule(layout);
		this.id = engine.newId();
	}

	/** Opens it in the host (again after the host restarted). */
	async open(): Promise<void> {
		if (this.openedOn === this.engine.generation && this.engine.connected) {
			return;
		}
		if (!(await this.engine.connect())) {
			throw new Error('no input method host');
		}
		const r = await this.engine.request('open', this.id, { layout: this.layout, traditional: this.traditional, smart: this.smart }, 20000);
		if (r.error) {
			throw new Error(r.error);
		}
		this.openedOn = this.engine.generation;
	}

	private async op(name: string, arg?: unknown): Promise<unknown> {
		try {
			await this.open();
			const r = await this.engine.request(name, this.id, arg);
			if (r.error) {
				throw new Error(r.error);
			}
			if (r.state) {
				this.mirror = { composing: r.state.composing, preedit: r.state.preedit, candidates: r.state.candidates };
				this.pending += r.state.commit ?? '';
			}
			return r.value;
		} catch (e) {
			// The host went away mid-composition: what was being composed is dropped.
			this.mirror = { composing: false, preedit: '', candidates: [] };
			throw e;
		}
	}

	get composing(): boolean { return this.mirror.composing; }
	takes(key: string, composing: boolean): boolean { return this.rule(key, composing); }
	async type(key: string): Promise<void> { await this.op('type', key); }
	async space(): Promise<boolean> { return !!(await this.op('space')); }
	async backspace(): Promise<boolean> { return !!(await this.op('backspace')); }
	async select(index: number): Promise<void> { await this.op('select', index); }
	async enter(): Promise<void> { await this.op('enter'); }
	async cancel(): Promise<void> {
		this.mirror = { composing: false, preedit: '', candidates: [] };
		await this.op('cancel');
	}
	state(): ImeState {
		const commit = this.pending;
		this.pending = '';
		return { preedit: this.mirror.preedit, candidates: this.mirror.candidates, commit };
	}
	async setContext(text: string): Promise<void> { await this.op('context', text); }
	async forget(): Promise<void> { await this.op('forget'); }
	async afterOther(): Promise<void> { await this.op('other'); }
	async undoLastCommit(): Promise<void> { await this.op('undo'); }
	async reading(index: number): Promise<string> {
		const v = await this.op('reading', index);
		return typeof v === 'string' ? v : '';
	}
	async predictions(count: number): Promise<string[]> {
		const v = await this.op('predict', count);
		return Array.isArray(v) ? v.map(String) : [];
	}
	async takePrediction(index: number): Promise<void> { await this.op('takePrediction', index); }
	async suggestions(wordBefore: string, previousWords: string[]): Promise<string[]> {
		const v = await this.op('suggest', { wordBefore, previousWords });
		return Array.isArray(v) ? v.map(String) : [];
	}
}
