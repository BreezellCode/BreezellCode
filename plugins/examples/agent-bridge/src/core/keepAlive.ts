/*
 * Keeping an agent's program between the turns of a conversation (off by default; the user sets how long it may stay
 * idle). Without it, each turn starts the agent anew and the agent reads the conversation back from its record. Kept,
 * the next turn of that conversation goes on in the same program.
 *
 * What it must never do: run two programs for one conversation, leave one running that nothing will close, close one
 * twice, or hand a turn a program that is not fit for it. So:
 * - A conversation has one slot at most: its program is either working for a turn ("busy") or waiting ("idle").
 * - A turn takes the idle program only when it was started the same way (its arguments, its folder, the tools it was
 *   given: `key`), is in the turn's session, still runs, and its record did not change since its last turn (something
 *   else went on in that conversation: its memory of it would be out of date). Otherwise that program is closed, and
 *   the turn starts a new one only once the old one is gone.
 * - A turn of a conversation whose program is busy (two at once) runs in a program of its own, which is not kept.
 * - Only a turn that ended well keeps its program (not one stopped, failed or stalled).
 * - The idle time counts from the end of its last turn. What the program says while idle that is work (its model, a
 *   question to the user) has no turn to go to: the program is closed. Anything else it says neither keeps it longer
 *   nor closes it.
 * - It is closed when its idle time is up, when keeping is turned off, and with everything when the tile is turned off,
 *   another install of the agent is found, or the plugin goes; a program that ended by itself is forgotten.
 */
import * as fs from 'node:fs';
import type { AgentChild } from './process';

/** The setting: how many minutes a conversation's program may stay idle; 0: not kept (the default). */
export const KEEP_ALIVE_SETTING = 'keepAlive.minutes';
export const KEEP_ALIVE_MAX_MINUTES = 240;

/** The setting's value as the time a program may stay idle; 0: off. */
export function keepAliveMs(minutes: unknown): number {
	return typeof minutes === 'number' && Number.isFinite(minutes) && minutes > 0 ? Math.round(Math.min(minutes, KEEP_ALIVE_MAX_MINUTES) * 60_000) : 0;
}

/** A program's arguments without one of them and its value (its session: a kept program goes on in its own). */
export function withoutArg(args: readonly string[], name: string): string[] {
	const at = args.indexOf(name);
	return at < 0 ? [...args] : [...args.slice(0, at), ...args.slice(at + 2)];
}

/** A conversation's program between its turns, and what the agent keeps with it (`extra`: agy's MCP route, say). */
export interface KeptProcess<E = unknown> {
	readonly agent: AgentChild;
	/** How it was started (its arguments, its folder, its tools), its session aside. */
	readonly key: string;
	/** The agent's session it works in; known once the agent said it. */
	session: string | undefined;
	/** What tells work from other things it says (its model's output, its questions), between turns. */
	readonly isWork: (message: Record<string, unknown>) => boolean;
	readonly extra?: E;
}

type Slot = {
	readonly kept: KeptProcess;
	state: 'busy' | 'idle';
	/** Its record (its size and time) when its last turn ended. */
	stamp?: string;
	timer?: ReturnType<typeof setTimeout>;
	idleSince?: number;
};

export interface KeptProcessesOptions {
	/** How long a program may stay idle now; 0: none is kept. */
	readonly idleMs: () => number;
	/** The kept programs changed (one kept, taken, closed): the tile's page says how many. */
	readonly onChange?: () => void;
	/** A record's stamp (its size and time); undefined when it cannot be told. Tests give their own. */
	readonly stamp?: (file: string) => Promise<string | undefined>;
	readonly now?: () => number;
	readonly log?: (line: string) => void;
}

/** What a turn finds for its conversation: the kept program to go on in, none (it starts one), or one busy with another turn. */
export type Taken = { readonly kept: KeptProcess; readonly busy: false } | { readonly kept?: undefined; readonly busy: boolean };

const fileStamp = async (file: string): Promise<string | undefined> => {
	try {
		const stat = await fs.promises.stat(file);
		return `${stat.size}:${stat.mtimeMs}`;
	} catch {
		return undefined;
	}
};

export class KeptProcesses {
	private readonly slots = new Map<string, Slot>();
	/** Programs being closed, until they are gone. */
	private readonly closing = new Set<AgentChild>();
	private disposed = false;

	constructor(private readonly options: KeptProcessesOptions) { }

	/** Whether programs are kept now. */
	get enabled(): boolean {
		return !this.disposed && this.options.idleMs() > 0;
	}

	/** How many programs are kept, working or waiting. */
	get size(): number {
		return this.slots.size;
	}

	/** Whether a program of this conversation is kept (tests, the page). */
	has(conversation: string): boolean {
		return this.slots.has(conversation);
	}

	/**
	 * The kept program a turn of this conversation goes on in: the idle one, when it is fit for the turn (started the
	 * same way, in the turn's session, its record unchanged). Taken, it is busy until released or closed. One that is
	 * not fit is closed, and this resolves once it is gone, so that the turn starts its own after it.
	 */
	async take(conversation: string, key: string, session: string | undefined, record?: string): Promise<Taken> {
		const slot = this.slots.get(conversation);
		if (!slot) {
			return { busy: false };
		}
		if (slot.state === 'busy') {
			return { busy: true };
		}
		this.clearTimer(slot);
		const { kept } = slot;
		if (!this.enabled || !kept.agent.alive || kept.key !== key || !session || kept.session !== session) {
			const why = !this.enabled ? 'not kept now' : !kept.agent.alive ? 'it ended' : kept.key !== key ? 'started otherwise' : 'another session';
			await this.retireSlot(conversation, slot, why);
			return { busy: false };
		}
		// Busy from here: a turn asking meanwhile runs in a program of its own.
		slot.state = 'busy';
		kept.agent.stray = undefined;
		if (record && slot.stamp !== undefined) {
			const now = await this.stampOf(record);
			if (this.slots.get(conversation) !== slot) {
				// Closed meanwhile (keeping turned off, the tile turned off).
				await kept.agent.whenExited();
				return { busy: false };
			}
			if (now !== slot.stamp) {
				await this.retireSlot(conversation, slot, 'its record changed');
				return { busy: false };
			}
		}
		this.changed();
		return { kept, busy: false };
	}

	/**
	 * A program started for a turn, kept as busy for its conversation. False when another is kept for it (a turn of it
	 * is under way there): then this one is the turn's own, and is not kept.
	 */
	adopt(conversation: string, kept: KeptProcess): boolean {
		if (!this.enabled) {
			return false;
		}
		const other = this.slots.get(conversation);
		if (other?.state === 'busy') {
			return false;
		}
		if (other) {
			void this.retireSlot(conversation, other, 'replaced');
		}
		const slot: Slot = { kept, state: 'busy' };
		this.slots.set(conversation, slot);
		kept.agent.onExit(() => {
			if (this.slots.get(conversation) === slot) {
				this.clearTimer(slot);
				this.slots.delete(conversation);
				this.log(`${conversation}: its program ended`);
				this.changed();
			}
		});
		this.changed();
		return true;
	}

	/** Whether this program is the one kept for the conversation. */
	holds(conversation: string, kept: KeptProcess): boolean {
		return this.slots.get(conversation)?.kept === kept;
	}

	/**
	 * Its turn ended well and it is at rest: idle from now (its record stamped), closed once its idle time is up. Closed
	 * at once when programs are no longer kept, or it is not the one kept.
	 */
	async release(conversation: string, kept: KeptProcess, record?: string): Promise<void> {
		const slot = this.slots.get(conversation);
		if (!slot || slot.kept !== kept || slot.state !== 'busy') {
			await kept.agent.close();
			return;
		}
		if (!this.enabled || !kept.agent.alive) {
			await this.retireSlot(conversation, slot, !this.enabled ? 'not kept now' : 'it ended');
			return;
		}
		const stamp = record ? await this.stampOf(record) : undefined;
		if (this.slots.get(conversation) !== slot) {
			return;
		}
		slot.stamp = stamp;
		slot.state = 'idle';
		slot.idleSince = this.now();
		// Work said between turns has no one to go to: the program is closed. Anything else is passed over.
		kept.agent.stray = message => {
			if (slot.state === 'idle' && this.slots.get(conversation) === slot && kept.isWork(message)) {
				void this.retireSlot(conversation, slot, `it went on by itself (${String(message.type ?? message.event ?? 'output')})`);
			}
		};
		this.arm(conversation, slot);
		this.changed();
	}

	/** Closed now (its turn was stopped or failed, or it is unfit): resolves once it is gone. */
	async retire(conversation: string, kept: KeptProcess, why: string): Promise<void> {
		const slot = this.slots.get(conversation);
		if (slot?.kept === kept) {
			await this.retireSlot(conversation, slot, why);
		} else {
			await this.closeAgent(kept.agent);
		}
	}

	/** The setting changed: off closes every idle program (a busy one closes when its turn ends); another time counts from each one's last turn. */
	configure(): void {
		for (const [conversation, slot] of [...this.slots]) {
			if (slot.state !== 'idle') {
				continue;
			}
			if (!this.enabled) {
				void this.retireSlot(conversation, slot, 'not kept now');
			} else {
				this.arm(conversation, slot);
			}
		}
	}

	/** Every program closed (the tile turned off, another install of the agent, the plugin going): resolves once all are gone. */
	async closeAll(why: string): Promise<void> {
		await Promise.all([...this.slots].map(([conversation, slot]) => this.retireSlot(conversation, slot, why)));
		await Promise.all([...this.closing].map(agent => agent.whenExited()));
	}

	dispose(): void {
		this.disposed = true;
		void this.closeAll('the plugin goes');
	}

	private arm(conversation: string, slot: Slot): void {
		this.clearTimer(slot);
		const idleMs = this.options.idleMs();
		const left = Math.max(0, (slot.idleSince ?? this.now()) + idleMs - this.now());
		slot.timer = setTimeout(() => {
			slot.timer = undefined;
			if (slot.state === 'idle' && this.slots.get(conversation) === slot) {
				void this.retireSlot(conversation, slot, `idle for ${idleMs >= 60_000 ? `${Math.round(idleMs / 60_000)} min` : `${Math.round(idleMs / 1000)} s`}`);
			}
		}, left);
		slot.timer.unref?.();
	}

	private clearTimer(slot: Slot): void {
		if (slot.timer) {
			clearTimeout(slot.timer);
			slot.timer = undefined;
		}
	}

	private async retireSlot(conversation: string, slot: Slot, why: string): Promise<void> {
		this.clearTimer(slot);
		if (this.slots.get(conversation) === slot) {
			this.slots.delete(conversation);
			this.log(`${conversation}: closed (${why})`);
			this.changed();
		}
		slot.kept.agent.stray = undefined;
		await this.closeAgent(slot.kept.agent);
	}

	private async closeAgent(agent: AgentChild): Promise<void> {
		if (agent.exited) {
			return;
		}
		this.closing.add(agent);
		try {
			await agent.close();
		} finally {
			this.closing.delete(agent);
		}
	}

	private stampOf(file: string): Promise<string | undefined> {
		return (this.options.stamp ?? fileStamp)(file);
	}

	private now(): number {
		return this.options.now ? this.options.now() : Date.now();
	}

	private changed(): void {
		try {
			this.options.onChange?.();
		} catch {
			// The page is told next time.
		}
	}

	private log(line: string): void {
		this.options.log?.(`[Agent Bridge] kept program of ${line}`);
	}
}
