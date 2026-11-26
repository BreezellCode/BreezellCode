/*
 * What a tile's checks found, kept for Breezell's other windows. Each window runs this plugin in its extension host
 * of its own, and each checked the agent on its own: a window coming back to the front, opening, or opened hidden by
 * the Agents page started the agent's programs again (its version, its sign-in, its models, its usage), seconds after
 * another window had. Now a window takes what another found within the time a check holds; only one of them asks.
 *
 * A small file a tile in the plugin's own folder. What it keeps is what the tile's page shows (the account's email,
 * plan and usage, the program's place and version, the models): never a credential. A read never waits (a few
 * hundred bytes, read at once); a write is written beside and moved into place, so a window never reads half of one.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { Install } from './cli';
import type { UsageLine } from './limits';

/** A check another window made: what it found, where the agent was, and its program then. */
export interface SharedCheck<C> {
	/** When it was found (this computer's clock). */
	readonly at: number;
	readonly check: C;
	/** Where the agent was; none: not found. */
	readonly install?: Install;
	/** Its program file then (cli.ts programStamp). */
	readonly stamp?: string;
	readonly version?: string;
}

type Stored<T> = T & { readonly pid: number };
interface TileFile {
	/** By the kind of window that checked (`local`, `wsl:<distribution>`): each looks for the agent its own way. */
	checks?: Record<string, Stored<SharedCheck<unknown>>>;
	/** By install: its usage limits, and when they were read. */
	limits?: Record<string, Stored<{ at: number; lines: UsageLine[] }>>;
	/** By install and what tells its models apart (its version): the models it offers. */
	models?: Record<string, Stored<{ at: number; models: unknown[] }>>;
}

/** Entries of each kind kept in a file: the newest. */
const KEPT = 8;

export class CheckCache {
	private writing: Promise<void> = Promise.resolve();

	/** `pid`: this window's (what this process wrote is its own, known already); `clock`: tests give their own. */
	constructor(private readonly file: string, private readonly pid = process.pid, private readonly clock: () => number = Date.now) { }

	/** Another window's check of this kind of window, at most `maxAgeMs` old. */
	check<C>(window: string, maxAgeMs: number): SharedCheck<C> | undefined {
		return this.fresh(this.read().checks?.[window], maxAgeMs) as SharedCheck<C> | undefined;
	}

	/** Another window's reading of an install's usage limits, at most `maxAgeMs` old, and how old. */
	limits(install: string, maxAgeMs: number): { readonly ageMs: number; readonly lines: UsageLine[] } | undefined {
		const found = this.fresh(this.read().limits?.[install], maxAgeMs);
		return found && Array.isArray(found.lines) ? { ageMs: this.clock() - found.at, lines: found.lines } : undefined;
	}

	/** The models another window was offered by this install (of this version), whenever it was. */
	models(key: string): readonly unknown[] | undefined {
		const found = this.read().models?.[key];
		return found && found.pid !== this.pid && Array.isArray(found.models) ? found.models : undefined;
	}

	putCheck<C>(window: string, check: Omit<SharedCheck<C>, 'at'>): void {
		this.update(file => { file.checks = this.with(file.checks, window, { ...check, at: this.clock(), pid: this.pid }); });
	}

	putLimits(install: string, lines: UsageLine[]): void {
		this.update(file => { file.limits = this.with(file.limits, install, { at: this.clock(), lines, pid: this.pid }); });
	}

	putModels(key: string, models: readonly unknown[]): void {
		this.update(file => { file.models = this.with(file.models, key, { at: this.clock(), models: [...models], pid: this.pid }); });
	}

	/** What is being written is on disk (tests wait for it). */
	flushed(): Promise<void> {
		return this.writing;
	}

	private fresh<T extends { readonly at: number; readonly pid: number }>(entry: T | undefined, maxAgeMs: number): T | undefined {
		const age = entry && typeof entry.at === 'number' ? this.clock() - entry.at : Number.POSITIVE_INFINITY;
		return entry && entry.pid !== this.pid && age >= 0 && age < maxAgeMs ? entry : undefined;
	}

	private with<T extends { readonly at: number }>(entries: Record<string, T> | undefined, key: string, entry: T): Record<string, T> {
		const all = Object.entries({ ...entries, [key]: entry }).sort((a, b) => b[1].at - a[1].at).slice(0, KEPT);
		return Object.fromEntries(all);
	}

	private read(): TileFile {
		try {
			const parsed: unknown = JSON.parse(fs.readFileSync(this.file, 'utf8'));
			return parsed && typeof parsed === 'object' ? parsed as TileFile : {};
		} catch {
			return {};
		}
	}

	/** One write at a time from this window; read again just before, so another window's entries stay. */
	private update(change: (file: TileFile) => void): void {
		this.writing = this.writing.then(async () => {
			const file = this.read();
			change(file);
			const temp = `${this.file}.${this.pid}.tmp`;
			await fs.promises.mkdir(path.dirname(this.file), { recursive: true });
			await fs.promises.writeFile(temp, JSON.stringify(file), 'utf8');
			await fs.promises.rename(temp, this.file);
		}).catch(() => undefined);
	}
}
