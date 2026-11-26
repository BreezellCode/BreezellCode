/*
 * An agent's process, as every agent's turn handles it besides speaking the agent's own protocol.
 *
 * AgentChild is the program for as long as it runs: its output read a JSON line at a time and handed to the turn it
 * works for now, the last of what it says on stderr (for an exit that told nothing), its end. It works for one turn,
 * or, kept between turns (keepAlive.ts), for one turn after another: what it says while no turn listens is "stray".
 *
 * AgentProcess is one turn's hold on it: asking it to stop (the user's Stop, or a model that went silent) and ending
 * it when it does not within STOP_GRACE_MS, and the watch for that silence.
 */
import type { ChildProcess } from 'node:child_process';
import { onJsonLines } from './lines';
import { STOP_GRACE_MS, type Cancel } from './turn';

/** How much of what the agent says on stderr is kept: its last lines, for an error. */
const STDERR_KEPT = 4000;

/** The turn an agent's program works for now: its messages, and its end should it end meanwhile. */
export interface ChildListener {
	message(message: Record<string, unknown>): void;
	close(code: number | null): void;
	error(error: Error): void;
}

export class AgentChild {
	private errors = '';
	private listener: ChildListener | undefined;
	private readonly exitListeners: (() => void)[] = [];
	private killTimer: ReturnType<typeof setTimeout> | undefined;
	private exitedPromise: Promise<void> | undefined;
	private resolveExited: (() => void) | undefined;
	/** What it says while no turn listens (between a kept process's turns). */
	stray: ((message: Record<string, unknown>) => void) | undefined;
	/** It ended (its close, or an error starting it). */
	exited = false;

	constructor(readonly child: ChildProcess) {
		onJsonLines(child.stdout, message => this.listener ? this.listener.message(message) : this.stray?.(message));
		child.stderr?.setEncoding('utf8');
		child.stderr?.on('data', (data: string) => { this.errors = (this.errors + data).slice(-STDERR_KEPT); });
		child.on('error', error => {
			const listener = this.listener;
			// It could not be started (no process id): it never runs. An error of a running one (a signal it could not be sent) is no end.
			if (child.pid === undefined) {
				this.markExited();
			}
			listener?.error(error);
		});
		child.on('close', code => {
			const listener = this.listener;
			this.markExited();
			listener?.close(code);
		});
	}

	/** The turn it works for from now on. */
	listen(listener: ChildListener): void {
		this.listener = listener;
	}

	/** That turn is over: what it says from now on is stray until the next turn listens. */
	unlisten(listener: ChildListener): void {
		if (this.listener === listener) {
			this.listener = undefined;
		}
	}

	/** Told once it ended (at once when it has already). */
	onExit(listener: () => void): void {
		if (this.exited) {
			listener();
		} else {
			this.exitListeners.push(listener);
		}
	}

	/** Still running, and taking input. */
	get alive(): boolean {
		const input = this.child.stdin;
		return !this.exited && !this.child.killed && !!input && !input.destroyed && input.writable;
	}

	/** A JSON line to its input, while its input is open. */
	write(message: unknown): void {
		const input = this.child.stdin;
		if (input && !input.destroyed && input.writable) {
			input.write(`${JSON.stringify(message)}\n`);
		}
	}

	/** Its input closes: the agent ends once it is done. */
	endInput(): void {
		this.child.stdin?.end();
	}

	kill(signal?: NodeJS.Signals): void {
		if (!this.exited) {
			this.child.kill(signal);
		}
	}

	/** Its input closed (it ends by itself), ended if it has not within STOP_GRACE_MS; resolves once it is gone. */
	close(signal?: NodeJS.Signals): Promise<void> {
		this.endInput();
		if (!this.exited) {
			this.killTimer ??= setTimeout(() => this.kill(signal), STOP_GRACE_MS);
			this.killTimer.unref?.();
		}
		return this.whenExited();
	}

	/** Resolves once it ended. */
	whenExited(): Promise<void> {
		if (this.exited) {
			return Promise.resolve();
		}
		return this.exitedPromise ??= new Promise(resolve => { this.resolveExited = resolve; });
	}

	/** What it said last on stderr (its last lines). */
	get stderr(): string {
		return this.errors;
	}

	/** Its last line on stderr that says anything. */
	lastErrorLine(): string | undefined {
		return this.errors.split(/\r?\n/).map(line => line.trim()).filter(Boolean).pop();
	}

	private markExited(): void {
		if (this.exited) {
			return;
		}
		this.exited = true;
		if (this.killTimer) {
			clearTimeout(this.killTimer);
		}
		this.resolveExited?.();
		for (const listener of this.exitListeners.splice(0)) {
			listener();
		}
	}
}

export interface AgentProcessOptions {
	/** The user's Stop: the agent is asked to stop then. */
	readonly token: Cancel;
	/** How the agent is asked to stop, its own way (its interrupt request, Ctrl+C): for the user's Stop, or its model gone silent. */
	readonly askToStop: (why: 'stop' | 'stall') => void;
	/** The signal it is ended with when it did not stop in time (none: the platform's own). */
	readonly killSignal?: NodeJS.Signals;
	/**
	 * A model response silent this long is taken for a dead connection: `counts` says whether silence counts now (a
	 * response is coming, no call of Breezell's tools is under way…); `onStall` is told before the agent is asked to stop.
	 */
	readonly stall?: { readonly ms: number; readonly counts: () => boolean; readonly onStall: () => void };
}

export class AgentProcess {
	/** The model went silent (AgentProcessOptions.stall), and the agent was asked to stop for it. */
	stalled = false;
	/** The agent was asked to stop in this turn (the user's Stop, or a stalled model): it is not kept after it. */
	stopAsked = false;
	private lastHeardAt = Date.now();
	private killTimer: ReturnType<typeof setTimeout> | undefined;
	private readonly watchdog: ReturnType<typeof setInterval> | undefined;
	private readonly stopping: { dispose(): void };

	constructor(readonly agent: AgentChild, private readonly options: AgentProcessOptions) {
		this.stopping = options.token.onCancellationRequested(() => this.stop('stop'));
		const stall = options.stall;
		if (stall) {
			this.watchdog = setInterval(() => {
				if (this.stalled || options.token.isCancellationRequested || !stall.counts() || Date.now() - this.lastHeardAt < stall.ms) {
					return;
				}
				this.stalled = true;
				stall.onStall();
				this.stop('stall');
			}, Math.max(10, Math.min(5_000, Math.floor(stall.ms / 4))));
			this.watchdog.unref?.();
		}
	}

	/** The agent said something (or a call of Breezell's tools it made ended): it is not silent. */
	heard(): void {
		this.lastHeardAt = Date.now();
	}

	/** A JSON line to its input, while its input is open. */
	write(message: unknown): void {
		this.agent.write(message);
	}

	/** Its input closes: the agent ends once it is done. */
	endInput(): void {
		this.agent.endInput();
	}

	/** Asks it to stop, and ends it if it has not within STOP_GRACE_MS. */
	stop(why: 'stop' | 'stall'): void {
		this.stopAsked = true;
		this.options.askToStop(why);
		this.killTimer ??= setTimeout(() => this.agent.kill(this.options.killSignal), STOP_GRACE_MS);
	}

	/** What it said last on stderr (its last lines). */
	get stderr(): string {
		return this.agent.stderr;
	}

	/** Its last line on stderr that says anything. */
	lastErrorLine(): string | undefined {
		return this.agent.lastErrorLine();
	}

	/** What an exit that told nothing says: its code, and its last word on stderr. */
	exitError(name: string, code: number | null): string {
		const last = this.lastErrorLine();
		return `${name} exited with code ${code}${last ? `: ${last}` : ''}`;
	}

	/** The turn is over: nothing of it is left waiting. */
	dispose(): void {
		if (this.watchdog) {
			clearInterval(this.watchdog);
		}
		this.stopping.dispose();
		if (this.killTimer) {
			clearTimeout(this.killTimer);
		}
	}
}
