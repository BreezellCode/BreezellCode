/*
 * Finding the Claude Code the user installed and asking it, through its own commands, whether it is
 * signed in and to which account. Nothing here reads Claude Code's files or its credentials: the
 * answers are what `claude --version` and `claude auth status` print, as a person would see them.
 *
 * Where it is looked for (Anthropic's install guide: the native installer puts it in ~/.local/bin on
 * macOS, Linux and WSL and in %USERPROFILE%\.local\bin on Windows; Homebrew, WinGet, npm and Linux
 * packages put it on PATH): PATH first, then the folders each way of installing uses, for an editor
 * started before PATH knew about them. On Windows, the Claude Code inside WSL is asked through
 * wsl.exe, and comes first in a window that is itself in WSL.
 */
import * as path from 'node:path';
import type { UsageLine } from '../../core/limits';
import { askVersion, installOf, locateProgram, messageOf, programCandidates, wslFindScript, findProgramInWsl, defaultIsFile, type Env, type Install, type LocateOptions, type ProgramSpec, type Runner, type Starter, type Target } from '../../core/cli';

// What other parts of the plugin (and its tests) know from here: the program-running half is core/cli.ts, shared
// with the other agents.
export { resetInstant, type UsageLine } from '../../core/limits';
export { RUN_TIMEOUT_MS, WSL_TIMEOUT_MS, createRunner, createStarter, decodeOutput, envValue, nativeTarget, parseVersion, withFolderOnPath, wslArgs, wslExe, wslPathOf, wslRunScript, wslUncPath } from '../../core/cli';
export type { RunOptions, RunResult, Runner, Starter, Target } from '../../core/cli';

/** Claude Code's config folder on this computer: CLAUDE_CONFIG_DIR when set, else .claude in the home folder. */
export const nativeConfigDir = (env: Env, home: string, platform: string): string => env.CLAUDE_CONFIG_DIR || (platform === 'win32' ? path.win32 : path.posix).join(home, '.claude');

/** Claude Code's program: claude (claude.exe, or npm's claude.cmd, on Windows); an old local install in ~/.claude/local. */
export const CLAUDE_PROGRAM: ProgramSpec = {
	windowsNames: ['claude.exe', 'claude.cmd'],
	names: ['claude'],
	homeFolders: [['.claude', 'local']],
	wslHomeFolders: ['$HOME/.claude/local'],
	wslConfigDir: '${CLAUDE_CONFIG_DIR:-$HOME/.claude}',
};

/** What was found out, before it is put into words. */
export type Check =
	| { readonly kind: 'notInstalled'; readonly lookedInWsl: boolean }
	| (Install & { readonly kind: 'notSignedIn'; readonly version?: string })
	| (Install & { readonly kind: 'tooOld'; readonly version?: string })
	| (Install & { readonly kind: 'signedIn'; readonly version?: string; readonly email?: string; readonly organization?: string; readonly plan?: string; readonly authMethod?: string })
	| ({ readonly kind: 'failed'; readonly message: string } & Partial<Install>);

/** Every place Claude Code may be on this computer, in the order they are tried. */
export function candidates(env: Env, platform: string, home: string, listDir?: (dir: string) => string[]): string[] {
	return programCandidates(CLAUDE_PROGRAM, env, platform, home, listDir);
}

/** The first candidate that is a file. */
export function findClaude(env: Env, platform: string, home: string, isFile: (file: string) => boolean = defaultIsFile, listDir?: (dir: string) => string[]): string | undefined {
	return candidates(env, platform, home, listDir).find(isFile);
}

/** Finds Claude Code inside WSL (see wslFindScript). */
export const WSL_FIND_SCRIPT = wslFindScript(CLAUDE_PROGRAM);

/** Claude Code inside WSL, as a target; undefined when WSL or Claude Code in it is not there. */
export function findInWsl(run: Runner, env: Env, distro?: string, start?: Starter): Promise<Target | undefined> {
	return findProgramInWsl(CLAUDE_PROGRAM, run, env, distro, start);
}

/** The fields of `claude auth status --json` this plugin shows; undefined when the output is not that. */
export function parseAuthStatus(stdout: string): { loggedIn: boolean; authMethod?: string; email?: string; orgName?: string; subscriptionType?: string; planTier?: string } | undefined {
	const start = stdout.indexOf('{');
	const end = stdout.lastIndexOf('}');
	if (start < 0 || end <= start) {
		return undefined;
	}
	let raw: unknown;
	try {
		raw = JSON.parse(stdout.slice(start, end + 1));
	} catch {
		return undefined;
	}
	if (!raw || typeof raw !== 'object' || typeof (raw as { loggedIn?: unknown }).loggedIn !== 'boolean') {
		return undefined;
	}
	const r = raw as Record<string, unknown>;
	const text = (value: unknown) => typeof value === 'string' && value.trim() ? value.trim() : undefined;
	return { loggedIn: r.loggedIn as boolean, authMethod: text(r.authMethod), email: text(r.email), orgName: text(r.orgName), subscriptionType: text(r.subscriptionType), planTier: text(r.planTier) };
}

/** `Login method: Claude Max account` from `claude auth status --text`: Claude Code's own words for the plan. */
export function parseLoginMethod(stdout: string): string | undefined {
	return /^\s*Login method:\s*(.+?)\s*$/m.exec(stdout)?.[1];
}

/**
 * The plan's name: Claude Code's own words first (`Claude Ultra account` → `Ultra`), else what the JSON
 * says (`max_20x` → `Max 20x`, `pro` → `Pro`); undefined for an API key, which has no plan.
 */
export function parsePlan(loginMethod: string | undefined, subscriptionType?: string, planTier?: string): string | undefined {
	const named = loginMethod ? /^Claude\s+(.+?)\s+account$/i.exec(loginMethod.trim())?.[1] : undefined;
	if (named) {
		return named;
	}
	const raw = planTier ?? subscriptionType;
	if (!raw) {
		return undefined;
	}
	return raw.split('_').map(word => word ? word[0].toUpperCase() + word.slice(1) : word).join(' ');
}


/**
 * The limits in what `claude -p /usage` prints for a subscription: `Current session: 12% used · resets
 * Nov 22, 12:49am (America/Los_Angeles)`. An API key's printout has none.
 */
export function parseUsage(stdout: string): UsageLine[] {
	const out: UsageLine[] = [];
	for (const line of stdout.split(/\r?\n/)) {
		const m = /^\s*(Current\s[^:]+?):\s*(\d+(?:\.\d+)?)%\s+used(?:\s*[·•|-]\s*resets\s+(.+?))?\s*$/i.exec(line);
		if (m) {
			out.push({ name: m[1], percent: Number(m[2]), ...(m[3] ? { resets: m[3] } : {}) });
		}
	}
	return out;
}

/**
 * The limits of a signed-in Claude Code, through its own `/usage` command in print mode: Claude Code
 * answers it itself (no model is asked and nothing is used), and `--no-session-persistence` keeps it
 * out of the session history. Undefined when it could not be asked.
 */
export async function fetchUsage(target: Target): Promise<UsageLine[] | undefined> {
	try {
		const result = await target.ask(['-p', '/usage', '--no-session-persistence']);
		return result.code === 0 ? parseUsage(result.stdout) : undefined;
	} catch {
		return undefined;
	}
}

/**
 * What `auth status --json` said last, per install, and the plan `--text` named then: while the account says the same,
 * its plan is the same, and `--text` (another start of Claude Code) is not run again.
 */
const statusSeen = new WeakMap<Target, { readonly json: string; readonly loginMethod?: string }>();

/**
 * Asks one Claude Code: its version, whether it is signed in, and to what. `version`: its version when it is known
 * already (its program unchanged since it was asked), so that it is not asked again.
 */
export async function inspect(target: Target, known?: { readonly version?: string }): Promise<Check> {
	const found = installOf(target);
	const asked = known?.version ? { version: known.version } : await askVersion(target);
	if (!('version' in asked)) {
		return { kind: 'failed', ...found, message: asked.message };
	}
	const { version } = asked;
	let status: ReturnType<typeof parseAuthStatus>;
	let json: string;
	try {
		json = (await target.ask(['auth', 'status', '--json'])).stdout;
		status = parseAuthStatus(json);
	} catch (error) {
		return { kind: 'failed', ...found, message: messageOf(error) };
	}
	if (!status) {
		return { kind: 'tooOld', ...found, version };
	}
	if (!status.loggedIn) {
		statusSeen.delete(target);
		return { kind: 'notSignedIn', ...found, version };
	}
	// The plan in Claude Code's own words; the sign-in stands without it.
	const seen = statusSeen.get(target);
	let loginMethod: string | undefined;
	if (seen?.json === json) {
		loginMethod = seen.loginMethod;
	} else {
		try {
			loginMethod = parseLoginMethod((await target.ask(['auth', 'status', '--text'])).stdout);
		} catch {
			loginMethod = undefined;
		}
		statusSeen.set(target, { json, ...(loginMethod ? { loginMethod } : {}) });
	}
	return { kind: 'signedIn', ...found, version, email: status.email, organization: status.orgName, plan: parsePlan(loginMethod, status.subscriptionType, status.planTier), authMethod: status.authMethod };
}

export type DetectOptions = LocateOptions;

/** Finds Claude Code. On Windows, both this computer and WSL are looked at. */
export function locate(options: DetectOptions): Promise<Target | undefined> {
	return locateProgram(CLAUDE_PROGRAM, options, nativeConfigDir(options.env, options.home, options.platform));
}

/** Finds Claude Code and asks it. */
export async function detect(options: DetectOptions): Promise<{ check: Check; target?: Target }> {
	const target = await locate(options);
	return target ? { check: await inspect(target), target } : { check: notInstalled(options.platform) };
}

/** What a check says when no Claude Code was found (on Windows, WSL was looked in too). */
export const notInstalled = (platform: string): Check => ({ kind: 'notInstalled', lookedInWsl: platform === 'win32' });
