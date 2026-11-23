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
import { ChildProcess, execFile, spawn } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';

/** A program's output. `code` is null when it was stopped (a timeout). */
export interface RunResult {
	readonly code: number | null;
	readonly stdout: string;
	readonly stderr: string;
}

export interface RunOptions {
	readonly timeoutMs?: number;
}

/** Runs one program with fixed arguments; rejects when it cannot be started or takes too long. */
export type Runner = (file: string, args: readonly string[], options?: RunOptions) => Promise<RunResult>;

/** One Claude Code to ask: where it is, and how its commands are run. */
export interface Target {
	readonly where: 'native' | 'wsl';
	/** The program: a path on this computer, or inside the WSL distribution. */
	readonly path: string;
	/** The WSL distribution it is in. */
	readonly distro?: string;
	readonly ask: (args: readonly string[]) => Promise<RunResult>;
	/** Starts it with its input and output open, in `cwd` (a path where it runs: inside WSL for a WSL one). */
	readonly start: (args: readonly string[], cwd: string | undefined) => ChildProcess;
	/** Its config folder (where its sessions are), as this computer reaches it; undefined when it cannot be told. */
	readonly configDir: () => Promise<string | undefined>;
}

/** A folder inside WSL as this computer reaches it: /home/u/.claude in Ubuntu is \\wsl$\Ubuntu\home\u\.claude. */
export const wslUncPath = (distro: string, linuxPath: string): string => `\\\\wsl$\\${distro}${linuxPath.replace(/\//g, '\\')}`;

/** Claude Code's config folder on this computer: CLAUDE_CONFIG_DIR when set, else .claude in the home folder. */
export const nativeConfigDir = (env: Env, home: string, platform: string): string => env.CLAUDE_CONFIG_DIR || (platform === 'win32' ? path.win32 : path.posix).join(home, '.claude');

/** Starts a program with pipes, as createRunner runs one: no window, its own folder first on PATH, a .cmd through cmd.exe. */
export type Starter = (file: string, args: readonly string[], options: { readonly cwd?: string; readonly batch?: boolean }) => ChildProcess;

export function createStarter(env: NodeJS.ProcessEnv = process.env, platform: string = process.platform): Starter {
	return (file, args, options) => {
		const win = platform === 'win32';
		const batch = win && /\.(cmd|bat)$/i.test(file);
		const command = batch ? (envValue(env, 'ComSpec') || 'cmd.exe') : file;
		const commandArgs = batch ? ['/d', '/s', '/c', `"${[`"${file}"`, ...args].join(' ')}"`] : [...args];
		return spawn(command, commandArgs, {
			cwd: options.cwd || undefined,
			env: withFolderOnPath(env, (win ? path.win32 : path.posix).dirname(file), win),
			windowsHide: true,
			windowsVerbatimArguments: batch,
			stdio: ['pipe', 'pipe', 'pipe'],
		});
	};
}

type Found = { readonly where: 'native' | 'wsl'; readonly location: string; readonly distro?: string };

/** What was found out, before it is put into words. */
export type Check =
	| { readonly kind: 'notInstalled'; readonly lookedInWsl: boolean }
	| (Found & { readonly kind: 'notSignedIn'; readonly version?: string })
	| (Found & { readonly kind: 'tooOld'; readonly version?: string })
	| (Found & { readonly kind: 'signedIn'; readonly version?: string; readonly email?: string; readonly organization?: string; readonly plan?: string; readonly authMethod?: string })
	| ({ readonly kind: 'failed'; readonly message: string } & Partial<Found>);

/** How long one call to Claude Code may take: its first start on Windows can be slow. */
export const RUN_TIMEOUT_MS = 20_000;
/** A call into WSL may have to start its virtual machine first. */
export const WSL_TIMEOUT_MS = 45_000;

type Env = Readonly<Record<string, string | undefined>>;

/** An environment variable, whatever the case of its name (Windows names are case-insensitive). */
export function envValue(env: Env, name: string): string | undefined {
	if (env[name] !== undefined) {
		return env[name];
	}
	const key = Object.keys(env).find(k => k.toLowerCase() === name.toLowerCase());
	return key ? env[key] : undefined;
}

/** Folders where a package manager keeps one folder per Node.js version, each with its own `bin`. */
function versionedBins(root: string, listDir: (dir: string) => string[], join: (...parts: string[]) => string, bin: string[]): string[] {
	const versions = listDir(root).filter(name => /^v?\d+(\.\d+)*$/.test(name));
	const numeric = (name: string) => name.replace(/^v/, '').split('.').map(Number);
	versions.sort((a, b) => {
		const x = numeric(a);
		const y = numeric(b);
		for (let i = 0; i < Math.max(x.length, y.length); i++) {
			if ((x[i] ?? 0) !== (y[i] ?? 0)) {
				return (y[i] ?? 0) - (x[i] ?? 0);
			}
		}
		return 0;
	});
	return versions.map(version => join(root, version, ...bin));
}

/** Every place Claude Code may be on this computer, in the order they are tried. */
export function candidates(env: Env, platform: string, home: string, listDir: (dir: string) => string[] = defaultListDir): string[] {
	const win = platform === 'win32';
	const join = win ? path.win32.join : path.posix.join;
	const folders = (envValue(env, 'PATH') ?? '').split(win ? ';' : ':').map(folder => folder.trim().replace(/^"(.*)"$/, '$1')).filter(Boolean);
	const add = (...parts: (string | undefined)[]) => {
		if (parts.every(p => p)) {
			folders.push(join(...parts as string[]));
		}
	};
	if (win) {
		const appData = envValue(env, 'APPDATA');
		const localAppData = envValue(env, 'LOCALAPPDATA');
		add(home, '.local', 'bin');                               // the native installer
		add(localAppData, 'Microsoft', 'WinGet', 'Links');        // WinGet
		add(appData, 'npm');                                      // npm
		add(localAppData, 'pnpm');
		add(home, 'scoop', 'shims');
		add(home, '.bun', 'bin');
		add(home, '.volta', 'bin');
		add(home, '.claude', 'local');                            // an old local install
	} else {
		add(home, '.local', 'bin');                               // the native installer
		if (platform === 'darwin') {
			folders.push('/opt/homebrew/bin', '/usr/local/bin');   // Homebrew (Apple silicon, Intel)
			add(home, 'Library', 'pnpm');
		} else {
			folders.push('/usr/local/bin', '/usr/bin', '/home/linuxbrew/.linuxbrew/bin', '/snap/bin');
			add(home, '.local', 'share', 'pnpm');
		}
		add(home, '.npm-global', 'bin');
		add(home, '.volta', 'bin');
		add(home, '.bun', 'bin');
		if (home) {
			folders.push(...versionedBins(join(home, '.nvm', 'versions', 'node'), listDir, join, ['bin']));
		}
		add(home, '.claude', 'local');
	}
	const names = win ? ['claude.exe', 'claude.cmd'] : ['claude'];
	const seen = new Set<string>();
	const out: string[] = [];
	for (const folder of folders) {
		for (const name of names) {
			const file = join(folder, name);
			const key = win ? file.toLowerCase() : file;
			if (!seen.has(key)) {
				seen.add(key);
				out.push(file);
			}
		}
	}
	return out;
}

/** The first candidate that is a file. */
export function findClaude(env: Env, platform: string, home: string, isFile: (file: string) => boolean = defaultIsFile, listDir?: (dir: string) => string[]): string | undefined {
	return candidates(env, platform, home, listDir).find(isFile);
}

function defaultIsFile(file: string): boolean {
	try {
		return fs.statSync(file).isFile();
	} catch {
		return false;
	}
}

function defaultListDir(dir: string): string[] {
	try {
		return fs.readdirSync(dir);
	} catch {
		return [];
	}
}

/** wsl.exe, where Windows keeps it. */
export function wslExe(env: Env): string {
	return path.win32.join(envValue(env, 'SystemRoot') ?? 'C:\\Windows', 'System32', 'wsl.exe');
}

/**
 * Finds Claude Code inside WSL: a login shell's PATH, then the native installer's ~/.local/bin and the
 * other usual folders. Prints the distribution's name and the path. No double quotes, so the script
 * reaches the shell unchanged through Windows' command line.
 */
export const WSL_FIND_SCRIPT = [
	'for f in $(command -v claude 2>/dev/null) $HOME/.local/bin/claude $HOME/.claude/local/claude /usr/local/bin/claude /usr/bin/claude'
	+ ' /home/linuxbrew/.linuxbrew/bin/claude $HOME/.npm-global/bin/claude $HOME/.volta/bin/claude $HOME/.bun/bin/claude'
	+ ' $HOME/.local/share/pnpm/claude $HOME/.nvm/versions/node/*/bin/claude',
	'do if [ -f $f ] && [ -x $f ]; then echo $WSL_DISTRO_NAME; echo $f; exit 0; fi',
	'done',
	'exit 3',
].join('; ');

/** A word for `sh`, in single quotes. */
const shQuote = (text: string): string => `'${text.replace(/'/g, `'\\''`)}'`;

/** Runs Claude Code at `file` inside WSL with its own folder first on PATH (npm puts node beside it). */
export function wslRunScript(file: string, args: readonly string[]): string {
	return `PATH=${shQuote(path.posix.dirname(file))}:$PATH exec ${[file, ...args].map(shQuote).join(' ')}`;
}

/** The arguments of wsl.exe that run `script` in the distribution (the default one when none is named), in `cwd` (the home folder by default). */
export function wslArgs(distro: string | undefined, script: string, login: boolean, cwd = '~'): string[] {
	return [...(distro ? ['-d', distro] : []), '--cd', cwd, '--exec', 'sh', login ? '-lc' : '-c', script];
}

/**
 * A folder of this computer as Claude Code in WSL sees it: `C:\\Users\\u\\p` → `/mnt/c/Users/u/p` (WSL's
 * default mount of Windows drives). A path already inside WSL stays as it is.
 */
export function wslPathOf(folder: string): string {
	const drive = /^([A-Za-z]):[\\/]?(.*)$/.exec(folder);
	return drive ? `/mnt/${drive[1].toLowerCase()}/${drive[2].replace(/\\/g, '/')}`.replace(/\/+$/, '') || '/' : folder;
}

/** Claude Code inside WSL, as a target; undefined when WSL or Claude Code in it is not there. */
export async function findInWsl(run: Runner, env: Env, distro?: string, start?: Starter): Promise<Target | undefined> {
	const exe = wslExe(env);
	let result: RunResult;
	try {
		result = await run(exe, wslArgs(distro, WSL_FIND_SCRIPT, true), { timeoutMs: WSL_TIMEOUT_MS });
	} catch {
		return undefined;
	}
	if (result.code !== 0) {
		return undefined;
	}
	const lines = result.stdout.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
	const file = lines.at(-1);
	if (!file?.startsWith('/')) {
		return undefined;
	}
	const named = lines.at(-2);
	const name = named && !named.startsWith('/') ? named : distro;
	const starter = start ?? createStarter(env as NodeJS.ProcessEnv);
	return {
		where: 'wsl',
		path: file,
		distro: name,
		ask: args => run(exe, wslArgs(distro ?? name, wslRunScript(file, args), false), { timeoutMs: WSL_TIMEOUT_MS }),
		start: (args, cwd) => starter(exe, wslArgs(distro ?? name, wslRunScript(file, args), false, cwd ? wslPathOf(cwd) : '~'), {}),
		// Asked of the distribution itself (no double quotes: see wslRunScript), then reached through \\wsl$.
		configDir: async () => {
			try {
				const found = await run(exe, wslArgs(distro ?? name, 'echo ${CLAUDE_CONFIG_DIR:-$HOME/.claude}', false), { timeoutMs: WSL_TIMEOUT_MS });
				const dir = found.stdout.trim().split(/\r?\n/).pop()?.trim();
				return found.code === 0 && name && dir?.startsWith('/') ? wslUncPath(name, dir) : undefined;
			} catch {
				return undefined;
			}
		},
	};
}

export function nativeTarget(file: string, run: Runner, start?: Starter, configDir?: string): Target {
	const starter = start ?? createStarter();
	return { where: 'native', path: file, ask: args => run(file, args, { timeoutMs: RUN_TIMEOUT_MS }), start: (args, cwd) => starter(file, args, { cwd }), configDir: async () => configDir };
}

/** `2.1.330 (Claude Code)` → `2.1.330`. */
export function parseVersion(stdout: string): string | undefined {
	return /(\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?)/.exec(stdout)?.[1];
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

/** A limit `/usage` reports: its name as Claude Code says it, how much is used, and when it resets. */
export interface UsageLine {
	readonly name: string;
	readonly percent: number;
	readonly resets?: string;
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

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

/** The wall clock of a time zone at an instant. */
function zoneParts(date: Date, zone: string): { year: number; month: number; day: number; hour: number; minute: number; second: number } {
	const parts: Record<string, string> = {};
	for (const part of new Intl.DateTimeFormat('en-US', { timeZone: zone, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric' }).formatToParts(date)) {
		parts[part.type] = part.value;
	}
	return { year: +parts.year, month: +parts.month, day: +parts.day, hour: +parts.hour % 24, minute: +parts.minute, second: +parts.second };
}

/** The instant a zone's wall clock shows this time (the earlier one in a repeated hour). */
function zonedInstant(year: number, month: number, day: number, hour: number, minute: number, zone: string): Date {
	const wall = Date.UTC(year, month - 1, day, hour, minute);
	const offsetAt = (t: number) => {
		const p = zoneParts(new Date(t), zone);
		return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(t / 1000) * 1000;
	};
	let t = wall - offsetAt(wall);
	t = wall - offsetAt(t);
	return new Date(t);
}

/**
 * When `Nov 22, 12:49am (America/Los_Angeles)` or `4pm (Europe/Paris)` is: Claude Code writes the time
 * of the zone it runs in, which may not be this computer's (Claude Code in WSL keeps its own). The
 * year and, with no date, the day are the next ones from now. Undefined when it reads otherwise.
 */
export function resetInstant(raw: string, now: Date): Date | undefined {
	const m = /^(?:([A-Za-z]{3})[a-z]*\.?\s+(\d{1,2}),?\s+(?:at\s+)?)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)\s*\(([^)]+)\)$/i.exec(raw.trim());
	if (!m) {
		return undefined;
	}
	const zone = m[6].trim();
	try {
		new Intl.DateTimeFormat('en-US', { timeZone: zone });
	} catch {
		return undefined;
	}
	const clock = Number(m[3]);
	const minute = m[4] ? Number(m[4]) : 0;
	// A 12-hour clock: 1 to 12.
	if (clock < 1 || clock > 12 || minute > 59) {
		return undefined;
	}
	const hour = (clock % 12) + (m[5].toLowerCase() === 'pm' ? 12 : 0);
	const today = zoneParts(now, zone);
	const options: Date[] = [];
	if (m[1]) {
		const month = MONTHS.indexOf(m[1].toLowerCase());
		const day = Number(m[2]);
		if (month < 0 || day < 1 || day > 31) {
			return undefined;
		}
		for (const year of [today.year, today.year + 1]) {
			options.push(zonedInstant(year, month + 1, day, hour, minute, zone));
		}
	} else {
		for (const ahead of [0, 1]) {
			const date = new Date(Date.UTC(today.year, today.month - 1, today.day + ahead));
			options.push(zonedInstant(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate(), hour, minute, zone));
		}
	}
	// A reset just passed still reads as itself; otherwise the first one ahead.
	return options.find(d => d.getTime() >= now.getTime() - 60 * 60 * 1000);
}

/** Asks one Claude Code: its version, whether it is signed in, and to what. */
export async function inspect(target: Target): Promise<Check> {
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
	let status: ReturnType<typeof parseAuthStatus>;
	try {
		status = parseAuthStatus((await target.ask(['auth', 'status', '--json'])).stdout);
	} catch (error) {
		return { kind: 'failed', ...found, message: messageOf(error) };
	}
	if (!status) {
		return { kind: 'tooOld', ...found, version };
	}
	if (!status.loggedIn) {
		return { kind: 'notSignedIn', ...found, version };
	}
	// The plan in Claude Code's own words; the sign-in stands without it.
	let loginMethod: string | undefined;
	try {
		loginMethod = parseLoginMethod((await target.ask(['auth', 'status', '--text'])).stdout);
	} catch {
		loginMethod = undefined;
	}
	return { kind: 'signedIn', ...found, version, email: status.email, organization: status.orgName, plan: parsePlan(loginMethod, status.subscriptionType, status.planTier), authMethod: status.authMethod };
}

export interface DetectOptions {
	readonly env: Env;
	readonly platform: string;
	readonly home: string;
	readonly run: Runner;
	readonly isFile?: (file: string) => boolean;
	readonly listDir?: (dir: string) => string[];
	/** Windows: the window is in WSL (this distribution, when known), so the Claude Code there comes first. */
	readonly wslWindow?: { readonly distro?: string };
	/** How a turn starts it (tests give their own). */
	readonly start?: Starter;
}

/** Finds Claude Code. On Windows, both this computer and WSL are looked at. */
export async function locate(options: DetectOptions): Promise<Target | undefined> {
	const native = async (): Promise<Target | undefined> => {
		const file = findClaude(options.env, options.platform, options.home, options.isFile, options.listDir);
		return file ? nativeTarget(file, options.run, options.start, nativeConfigDir(options.env, options.home, options.platform)) : undefined;
	};
	const wsl = async (): Promise<Target | undefined> => options.platform === 'win32' ? findInWsl(options.run, options.env, options.wslWindow?.distro, options.start) : undefined;
	for (const find of options.platform === 'win32' && options.wslWindow ? [wsl, native] : [native, wsl]) {
		const target = await find();
		if (target) {
			return target;
		}
	}
	return undefined;
}

/** Finds Claude Code and asks it. */
export async function detect(options: DetectOptions): Promise<{ check: Check; target?: Target }> {
	const target = await locate(options);
	return target ? { check: await inspect(target), target } : { check: { kind: 'notInstalled', lookedInWsl: options.platform === 'win32' } };
}

/**
 * Output as text. What wsl.exe says itself is UTF-16; what runs inside WSL, and everything else, is UTF-8.
 */
export function decodeOutput(buffer: Buffer | string): string {
	if (typeof buffer === 'string') {
		return buffer;
	}
	// UTF-8 from a program never holds a NUL; UTF-16 does for every ASCII character (line ends
	// included), and Chinese UTF-16 without any is not valid UTF-8 either.
	const bom = buffer.length >= 2 && buffer[0] === 0xff && buffer[1] === 0xfe;
	const utf16 = bom || (buffer.length % 2 === 0 && (buffer.includes(0) || buffer.toString('utf8').includes('\uFFFD')));
	return buffer.toString(utf16 ? 'utf16le' : 'utf8').replace(/^\uFEFF/, '');
}

/**
 * Runs a program without a window, in the home folder (so no project's settings are read), with the
 * user's environment and the program's own folder first on PATH (npm keeps node beside it). A `.cmd`
 * (npm's launcher on Windows) can only be run through cmd.exe.
 */
export function createRunner(home: string, env: NodeJS.ProcessEnv = process.env, platform: string = process.platform): Runner {
	return (file, args, options) => new Promise((resolve, reject) => {
		const win = platform === 'win32';
		const batch = win && /\.(cmd|bat)$/i.test(file);
		const command = batch ? (envValue(env, 'ComSpec') || 'cmd.exe') : file;
		const commandArgs = batch ? ['/d', '/s', '/c', `"${[`"${file}"`, ...args].join(' ')}"`] : [...args];
		const timeout = options?.timeoutMs ?? RUN_TIMEOUT_MS;
		execFile(command, commandArgs, {
			cwd: home || undefined,
			env: withFolderOnPath(env, (win ? path.win32 : path.posix).dirname(file), win),
			timeout,
			windowsHide: true,
			windowsVerbatimArguments: batch,
			maxBuffer: 1024 * 1024,
			encoding: 'buffer',
		}, (error, stdout, stderr) => {
			const err = error as (NodeJS.ErrnoException & { killed?: boolean; code?: number | string }) | null;
			if (err && (err.killed || typeof err.code === 'string')) {
				reject(err.killed ? new Error(`no answer within ${Math.round(timeout / 1000)} s`) : err);
				return;
			}
			resolve({ code: err ? (typeof err.code === 'number' ? err.code : 1) : 0, stdout: decodeOutput(stdout), stderr: decodeOutput(stderr) });
		});
	});
}

/** The environment with `folder` first on PATH, under the name PATH already has (Path on Windows). */
export function withFolderOnPath(env: NodeJS.ProcessEnv, folder: string, win: boolean): NodeJS.ProcessEnv {
	const out: NodeJS.ProcessEnv = { ...env };
	const key = Object.keys(out).find(k => k.toLowerCase() === 'path') ?? 'PATH';
	const current = out[key];
	if (folder && folder !== '.') {
		out[key] = current ? `${folder}${win ? ';' : ':'}${current}` : folder;
	}
	return out;
}

const firstLine = (text: string): string | undefined => text.split(/\r?\n/).map(line => line.trim()).find(Boolean)?.slice(0, 200);

const messageOf = (error: unknown): string => (error instanceof Error ? error.message : String(error)).split(/\r?\n/)[0].slice(0, 200);
