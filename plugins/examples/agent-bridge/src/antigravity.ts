/*
 * Finding the Antigravity CLI (agy) the user installed and asking it, through its own commands, whether it is
 * signed in, which models it offers and how much of its plan's limits is used. Nothing here reads its files or its
 * credentials: the answers are what `agy --version`, `agy models` and its own `/usage` print, as a person would see
 * them (`agy models` answers only when signed in).
 *
 * Where it is looked for: Google's installer puts the program in ~/.local/bin on macOS, Linux and WSL
 * (antigravity.google/cli/install.sh); PATH first, then the usual folders (cli.ts). On Windows, the agy inside WSL
 * is asked through wsl.exe, and comes first in a window that is itself in WSL.
 */
import * as path from 'node:path';
import { firstLine, locateProgram, messageOf, parseVersion, versionAtLeast, type LocateOptions, type ProgramSpec, type Target } from './cli';
import type { UsageLine } from './limits';
import { EFFORTS, type Effort } from './turn';

/** Antigravity CLI's program: agy (agy.exe on Windows); its own folder (its conversations) is ~/.gemini/antigravity-cli. */
export const AGY_PROGRAM: ProgramSpec = { windowsNames: ['agy.exe', 'agy.cmd'], names: ['agy'], wslConfigDir: '$HOME/.gemini/antigravity-cli' };

/** agy's own folder on this computer (it names no variable that moves it). */
export const agyConfigDir = (home: string, platform: string): string => (platform === 'win32' ? path.win32 : path.posix).join(home, '.gemini', 'antigravity-cli');

type Found = { readonly where: 'native' | 'wsl'; readonly location: string; readonly distro?: string };

/** What was found out, before it is put into words. */
export type AgyCheck =
	| { readonly kind: 'notInstalled'; readonly lookedInWsl: boolean }
	| (Found & { readonly kind: 'notSignedIn'; readonly version?: string; readonly message?: string })
	| (Found & { readonly kind: 'signedIn'; readonly version?: string; readonly models: readonly AgyModelLine[] })
	| ({ readonly kind: 'failed'; readonly message: string } & Partial<Found>);

/** One line of `agy models`: the id `--model` takes, and its name (`gemini-4-hydrogen-high	Gemini 4 Hydrogen (High)`). */
export type AgyModelLine = { readonly id: string; readonly title: string };

/** The models `agy models` lists, one a line (its id, a tab, its name); its other lines ("Fetching available models...") are passed over. */
export function parseAgyModels(stdout: string): AgyModelLine[] {
	const out: AgyModelLine[] = [];
	for (const line of stdout.split(/\r?\n/)) {
		const m = /^\s*([A-Za-z0-9][A-Za-z0-9._:@+\-[\]]*)\t+(.+?)\s*$/.exec(line);
		if (m && !out.some(model => model.id === m[1])) {
			out.push({ id: m[1], title: m[2].slice(0, 60) });
		}
	}
	return out;
}

/** A model of agy's in Breezell's picker; `variants`: the agy id of each effort level it is offered at. */
export type AgyModel = { id: string; title: string; family?: 'claude' | 'gemini' | 'openai'; efforts?: Effort[]; variants?: Partial<Record<Effort, string>> };

/** Whose model it is, for the picker's icon of its maker (a Breezell that does not know the name shows its own). */
function familyOf(id: string): AgyModel['family'] {
	return /^gemini|^gemma/i.test(id) ? 'gemini' : /^claude/i.test(id) ? 'claude' : /^gpt/i.test(id) ? 'openai' : undefined;
}

/**
 * The models as Breezell's picker offers them: a model agy lists at several effort levels (`…-low` "(Low)", `…-high`
 * "(High)") is one model with those levels, which Breezell's model menu offers; any other is as agy names it.
 */
export function groupAgyModels(lines: readonly AgyModelLine[]): AgyModel[] {
	const levelOf = (line: AgyModelLine): { base: string; title: string; effort: Effort } | undefined => {
		const id = /^(.+)-(low|medium|high|xhigh|max)$/i.exec(line.id);
		const title = /^(.+?)\s*\((low|medium|high|xhigh|max)\)$/i.exec(line.title);
		return id && title && id[2].toLowerCase() === title[2].toLowerCase() ? { base: id[1], title: title[1], effort: id[2].toLowerCase() as Effort } : undefined;
	};
	const out: AgyModel[] = [];
	for (const line of lines) {
		const level = levelOf(line);
		const family = familyOf(line.id);
		if (!level) {
			out.push({ id: line.id, title: line.title, ...(family ? { family } : {}) });
			continue;
		}
		let model = out.find(m => m.id === level.base && m.variants);
		if (!model) {
			model = { id: level.base, title: level.title, ...(family ? { family } : {}), efforts: [], variants: {} };
			out.push(model);
		}
		model.variants![level.effort] = line.id;
		model.efforts = EFFORTS.filter(effort => model!.variants![effort]);
	}
	// One level alone is no choice: that model as agy names it.
	return out.map(m => m.variants && Object.keys(m.variants).length === 1 ? { id: Object.values(m.variants)[0]!, title: lines.find(l => l.id === Object.values(m.variants!)[0])?.title ?? m.title, ...(m.family ? { family: m.family } : {}) } : m);
}

/** The level a model runs at when the user picked none: high, else the nearest one below it, else its first. */
const DEFAULT_EFFORT_ORDER: readonly Effort[] = ['high', 'medium', 'xhigh', 'low', 'max'];

/** The id agy's `--model` takes for a Breezell model and the level picked; the model's own id for one without levels. */
export function agyModelId(models: readonly AgyModel[], model: string, effort: string | undefined): string {
	const found = models.find(m => m.id === model);
	if (!found?.variants) {
		return model;
	}
	const picked = effort && found.variants[effort as Effort];
	return picked || DEFAULT_EFFORT_ORDER.map(level => found.variants![level]).find(Boolean) || model;
}

/**
 * The first agy seen to answer `/usage` by itself (its table, no model request, no conversation kept). An older one
 * is not asked: a slash command an agy does not know goes to its model as a message.
 */
export const AGY_USAGE_SINCE = '1.5.17';

/**
 * The limits in what `agy -p /usage` prints, a line a limit: its models, its name, how much of it is left and when it
 * resets, between tabs (`Gemini Models	Five Hour Limit Remaining	96%	2026-11-25T14:56:31Z`). Each one as how much
 * is used; in each group of models its five-hour limit before its weekly one, as Claude Code's session before its week.
 */
export function parseAgyUsage(stdout: string): UsageLine[] {
	const out: { line: UsageLine; rank: number }[] = [];
	const groups: string[] = [];
	for (const raw of stdout.split(/\r?\n/)) {
		const cells = raw.split('\t').map(cell => cell.trim());
		const left = cells.length >= 3 ? /^(\d+(?:\.\d+)?)\s*%$/.exec(cells[2]) : null;
		if (!left || !cells[0] || !cells[1] || Number(left[1]) > 100) {
			continue;
		}
		if (!groups.includes(cells[0])) {
			groups.push(cells[0]);
		}
		const name = cells[1].replace(/\s+remaining$/i, '');
		const used = Math.round((100 - Number(left[1])) * 10) / 10;
		const kind = /^five[\s-]?hour\b|^5[\s-]?hour\b/i.test(name) ? 0 : /^week/i.test(name) ? 1 : 2;
		out.push({ line: { name, group: cells[0], percent: used, ...(cells[3] ? { resets: cells[3] } : {}) }, rank: groups.indexOf(cells[0]) * 3 + kind });
	}
	return out.sort((a, b) => a.rank - b.rank).map(entry => entry.line);
}

/** The limits of a signed-in agy, through its own `/usage`; undefined when it could not be asked, or is too old to be. */
export async function fetchAgyUsage(target: Target, version: string | undefined): Promise<UsageLine[] | undefined> {
	if (!version || !versionAtLeast(version, AGY_USAGE_SINCE)) {
		return undefined;
	}
	try {
		const result = await target.ask(['-p', '/usage']);
		return result.code === 0 ? parseAgyUsage(result.stdout) : undefined;
	} catch {
		return undefined;
	}
}

/** Asks one agy: its version, and (`agy models`, which needs the account) whether it is signed in. */
export async function inspectAgy(target: Target): Promise<AgyCheck> {
	const found: Found = { where: target.where, location: target.path, ...(target.distro ? { distro: target.distro } : {}) };
	let version: string | undefined;
	try {
		const result = await target.ask(['--version']);
		version = parseVersion(result.stdout);
		if (!version) {
			return { kind: 'failed', ...found, message: firstLine(result.stderr) ?? firstLine(result.stdout) ?? `exit code ${result.code}` };
		}
	} catch (error) {
		return { kind: 'failed', ...found, message: messageOf(error) };
	}
	try {
		const listed = await target.ask(['models']);
		const models = parseAgyModels(listed.stdout);
		if (listed.code === 0 && models.length) {
			return { kind: 'signedIn', ...found, version, models };
		}
		// Not signed in (or it could not reach Google): what it said, as it said it.
		const said = [listed.stderr, listed.stdout].map(text => text.split(/\r?\n/).map(line => line.trim()).filter(line => line && !/^Fetching available models/i.test(line)).join(' ')).find(Boolean);
		return { kind: 'notSignedIn', ...found, version, ...(said ? { message: said.slice(0, 200) } : {}) };
	} catch (error) {
		return { kind: 'failed', ...found, message: messageOf(error) };
	}
}

/** Finds agy and asks it. On Windows, both this computer and WSL are looked at. */
export async function detectAgy(options: LocateOptions): Promise<{ check: AgyCheck; target?: Target }> {
	const target = await locateProgram(AGY_PROGRAM, options, agyConfigDir(options.home, options.platform));
	return target ? { check: await inspectAgy(target), target } : { check: { kind: 'notInstalled', lookedInWsl: options.platform === 'win32' } };
}
