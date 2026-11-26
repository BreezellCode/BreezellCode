/*
 * Finding a command-line agent the user installed (Claude Code, Antigravity CLI) and running it: on this
 * computer, or on Windows inside WSL through wsl.exe. What each agent is called and where its installers put
 * it is the agent's own (agents/<agent>/program.ts); how a program is looked for, run and asked its version is
 * the same.
 */
import { ChildProcess, execFile, spawn } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { firstLine } from './turn';

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

/** One installed agent to ask: where it is, and how its commands are run. */
export interface Target {
	readonly where: 'native' | 'wsl';
	/** The program: a path on this computer, or inside the WSL distribution. */
	readonly path: string;
	/** The WSL distribution it is in. */
	readonly distro?: string;
	readonly ask: (args: readonly string[]) => Promise<RunResult>;
	/** Starts it with its input and output open, in `cwd` (a path where it runs: inside WSL for a WSL one); `env`: variables of its own besides. */
	readonly start: (args: readonly string[], cwd: string | undefined, env?: Readonly<Record<string, string>>) => ChildProcess;
	/** Its config folder (where its sessions are), as this computer reaches it; undefined when it cannot be told. */
	readonly configDir: () => Promise<string | undefined>;
}

/** A folder inside WSL as this computer reaches it: /home/u/.claude in Ubuntu is \\wsl$\Ubuntu\home\u\.claude. */
export const wslUncPath = (distro: string, linuxPath: string): string => `\\\\wsl$\\${distro}${linuxPath.replace(/\//g, '\\')}`;

/** Starts a program with pipes, as createRunner runs one: no window, its own folder first on PATH, a .cmd through cmd.exe. */
export type Starter = (file: string, args: readonly string[], options: { readonly cwd?: string; readonly batch?: boolean; readonly env?: Readonly<Record<string, string>> }) => ChildProcess;

export function createStarter(env: NodeJS.ProcessEnv = process.env, platform: string = process.platform): Starter {
	return (file, args, options) => {
		const win = platform === 'win32';
		const batch = win && /\.(cmd|bat)$/i.test(file);
		const command = batch ? (envValue(env, 'ComSpec') || 'cmd.exe') : file;
		const commandArgs = batch ? ['/d', '/s', '/c', `"${[`"${file}"`, ...args].join(' ')}"`] : [...args];
		return spawn(command, commandArgs, {
			cwd: options.cwd || undefined,
			env: withFolderOnPath(options.env ? { ...env, ...options.env } : env, (win ? path.win32 : path.posix).dirname(file), win),
			windowsHide: true,
			windowsVerbatimArguments: batch,
			stdio: ['pipe', 'pipe', 'pipe'],
		});
	};
}

/** How long one call to an agent may take: its first start on Windows can be slow. */
export const RUN_TIMEOUT_MS = 20_000;
/** A call into WSL may have to start its virtual machine first. */
export const WSL_TIMEOUT_MS = 45_000;

export type Env = Readonly<Record<string, string | undefined>>;

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

/** What an agent's program is called, and the folders of its own its installers use besides the usual ones. */
export interface ProgramSpec {
	/** Its file names on Windows (claude.exe, claude.cmd) and elsewhere (claude). */
	readonly windowsNames: readonly string[];
	readonly names: readonly string[];
	/** Folders of its own under the home folder (['.claude', 'local']), looked at after the usual ones. */
	readonly homeFolders?: readonly (readonly string[])[];
	/** Its folder of its own inside WSL ($HOME/.claude/local), looked at after ~/.local/bin. */
	readonly wslHomeFolders?: readonly string[];
	/** A shell line inside WSL printing its config folder (Claude Code: ${CLAUDE_CONFIG_DIR:-$HOME/.claude}); none: not told. */
	readonly wslConfigDir?: string;
}

/** Every place the program may be on this computer, in the order they are tried. */
export function programCandidates(spec: ProgramSpec, env: Env, platform: string, home: string, listDir: (dir: string) => string[] = defaultListDir): string[] {
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
		add(home, '.local', 'bin');                               // the native installers
		add(localAppData, 'Microsoft', 'WinGet', 'Links');        // WinGet
		add(appData, 'npm');                                      // npm
		add(localAppData, 'pnpm');
		add(home, 'scoop', 'shims');
		add(home, '.bun', 'bin');
		add(home, '.volta', 'bin');
	} else {
		add(home, '.local', 'bin');                               // the native installers
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
	}
	for (const own of spec.homeFolders ?? []) {
		add(home, ...own);
	}
	const names = win ? spec.windowsNames : spec.names;
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

export function defaultIsFile(file: string): boolean {
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
 * Finds the program inside WSL: a login shell's PATH, then the native installers' ~/.local/bin and the other
 * usual folders. Prints the distribution's name and the path. No double quotes, so the script reaches the shell
 * unchanged through Windows' command line.
 */
export function wslFindScript(spec: Pick<ProgramSpec, 'names' | 'wslHomeFolders'>): string {
	const name = spec.names[0];
	const own = (spec.wslHomeFolders ?? []).map(folder => ` ${folder}/${name}`).join('');
	return [
		`for f in $(command -v ${name} 2>/dev/null) $HOME/.local/bin/${name}${own} /usr/local/bin/${name} /usr/bin/${name}`
		+ ` /home/linuxbrew/.linuxbrew/bin/${name} $HOME/.npm-global/bin/${name} $HOME/.volta/bin/${name} $HOME/.bun/bin/${name}`
		+ ` $HOME/.local/share/pnpm/${name} $HOME/.nvm/versions/node/*/bin/${name}`,
		'do if [ -f $f ] && [ -x $f ]; then echo $WSL_DISTRO_NAME; echo $f; exit 0; fi',
		'done',
		'exit 3',
	].join('; ');
}

/** A word for `sh`, in single quotes. */
export const shQuote = (text: string): string => `'${text.replace(/'/g, `'\\''`)}'`;

/** Runs the program at `file` inside WSL with its own folder first on PATH (npm puts node beside it); `env`: variables of its own besides. */
export function wslRunScript(file: string, args: readonly string[], env?: Readonly<Record<string, string>>): string {
	const own = Object.entries(env ?? {}).filter(([name]) => /^[A-Za-z_][A-Za-z0-9_]*$/.test(name)).map(([name, value]) => `${name}=${shQuote(value)} `).join('');
	return `${own}PATH=${shQuote(path.posix.dirname(file))}:$PATH exec ${[file, ...args].map(shQuote).join(' ')}`;
}

/** The arguments of wsl.exe that run `script` in the distribution (the default one when none is named), in `cwd` (the home folder by default). */
export function wslArgs(distro: string | undefined, script: string, login: boolean, cwd = '~'): string[] {
	return [...(distro ? ['-d', distro] : []), '--cd', cwd, '--exec', 'sh', login ? '-lc' : '-c', script];
}

/**
 * A folder of this computer as a program in WSL sees it: `C:\\Users\\u\\p` → `/mnt/c/Users/u/p` (WSL's
 * default mount of Windows drives). A path already inside WSL stays as it is.
 */
export function wslPathOf(folder: string): string {
	const drive = /^([A-Za-z]):[\\/]?(.*)$/.exec(folder);
	return drive ? `/mnt/${drive[1].toLowerCase()}/${drive[2].replace(/\\/g, '/')}`.replace(/\/+$/, '') || '/' : folder;
}

/** The program inside WSL, as a target; undefined when WSL or the program in it is not there. */
export async function findProgramInWsl(spec: ProgramSpec, run: Runner, env: Env, distro?: string, start?: Starter): Promise<Target | undefined> {
	let result: RunResult;
	try {
		result = await run(wslExe(env), wslArgs(distro, wslFindScript(spec), true), { timeoutMs: WSL_TIMEOUT_MS });
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
	return wslTarget(spec, file, named && !named.startsWith('/') ? named : distro, run, env, start, distro);
}

/** The program at `file` inside a WSL distribution (`distro`; `runIn`: the one to run it in, when asked for by name). */
export function wslTarget(spec: Pick<ProgramSpec, 'wslConfigDir'>, file: string, distro: string | undefined, run: Runner, env: Env, start?: Starter, runIn: string | undefined = distro): Target {
	const exe = wslExe(env);
	const starter = start ?? createStarter(env as NodeJS.ProcessEnv);
	const where = runIn ?? distro;
	return {
		where: 'wsl',
		path: file,
		distro,
		ask: args => run(exe, wslArgs(where, wslRunScript(file, args), false), { timeoutMs: WSL_TIMEOUT_MS }),
		start: (args, cwd, vars) => starter(exe, wslArgs(where, wslRunScript(file, args, vars), false, cwd ? wslPathOf(cwd) : '~'), {}),
		// Asked of the distribution itself (no double quotes: see wslRunScript), then reached through \\wsl$.
		configDir: async () => {
			if (!spec.wslConfigDir) {
				return undefined;
			}
			try {
				const found = await run(exe, wslArgs(where, `echo ${spec.wslConfigDir}`, false), { timeoutMs: WSL_TIMEOUT_MS });
				const dir = found.stdout.trim().split(/\r?\n/).pop()?.trim();
				return found.code === 0 && distro && dir?.startsWith('/') ? wslUncPath(distro, dir) : undefined;
			} catch {
				return undefined;
			}
		},
	};
}

export function nativeTarget(file: string, run: Runner, start?: Starter, configDir?: string): Target {
	const starter = start ?? createStarter();
	return { where: 'native', path: file, ask: args => run(file, args, { timeoutMs: RUN_TIMEOUT_MS }), start: (args, cwd, env) => starter(file, args, { cwd, ...(env ? { env } : {}) }), configDir: async () => configDir };
}

export interface LocateOptions {
	readonly env: Env;
	readonly platform: string;
	readonly home: string;
	readonly run: Runner;
	readonly isFile?: (file: string) => boolean;
	readonly listDir?: (dir: string) => string[];
	/** Windows: the window is in WSL (this distribution, when known), so the program there comes first. */
	readonly wslWindow?: { readonly distro?: string };
	/** How a turn starts it (tests give their own). */
	readonly start?: Starter;
}

/** Finds the program. On Windows, both this computer and WSL are looked at; `configDir`: its config folder here. */
export async function locateProgram(spec: ProgramSpec, options: LocateOptions, configDir?: string): Promise<Target | undefined> {
	const native = async (): Promise<Target | undefined> => {
		const file = programCandidates(spec, options.env, options.platform, options.home, options.listDir).find(options.isFile ?? defaultIsFile);
		return file ? nativeTarget(file, options.run, options.start, configDir) : undefined;
	};
	const wsl = async (): Promise<Target | undefined> => options.platform === 'win32' ? findProgramInWsl(spec, options.run, options.env, options.wslWindow?.distro, options.start) : undefined;
	for (const find of options.platform === 'win32' && options.wslWindow ? [wsl, native] : [native, wsl]) {
		const target = await find();
		if (target) {
			return target;
		}
	}
	return undefined;
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

/** `2.1.330 (Claude Code)` → `2.1.330`; `1.5.17` → `1.5.17`. */
export function parseVersion(stdout: string): string | undefined {
	return /(\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?)/.exec(stdout)?.[1];
}

/** Whether a version (as parseVersion reads it) is `least` or newer, by its numbers; a prerelease counts as its release. */
export function versionAtLeast(version: string, least: string): boolean {
	const numbers = (v: string) => (/^(\d+)\.(\d+)\.(\d+)/.exec(v) ?? []).slice(1).map(Number);
	const [a, b] = [numbers(version), numbers(least)];
	if (a.length !== 3 || b.length !== 3) {
		return false;
	}
	for (let i = 0; i < 3; i++) {
		if (a[i] !== b[i]) {
			return a[i] > b[i];
		}
	}
	return true;
}

export const messageOf = (error: unknown): string => (error instanceof Error ? error.message : String(error)).split(/\r?\n/)[0].slice(0, 200);

/** Where an install is: its program, and inside WSL its distribution (what a check found, as the page names it). */
export type Install = { readonly where: 'native' | 'wsl'; readonly location: string; readonly distro?: string };
export const installOf = (target: Pick<Target, 'where' | 'path' | 'distro'>): Install => ({ where: target.where, location: target.path, ...(target.distro ? { distro: target.distro } : {}) });

/** Its version (`--version`), or what it said instead. */
export async function askVersion(target: Target): Promise<{ readonly version: string } | { readonly message: string }> {
	try {
		const result = await target.ask(['--version']);
		const version = parseVersion(result.stdout);
		return version ? { version } : { message: firstLine(result.stderr, 200) ?? firstLine(result.stdout, 200) ?? `exit code ${result.code}` };
	} catch (error) {
		return { message: messageOf(error) };
	}
}

/**
 * The program file as it is now (its size and time), where this computer sees it (an install in WSL through
 * \\wsl$): the same stamp is the same program, whose version is known. Undefined when it cannot be seen so (a link
 * Windows cannot follow into WSL): then the program is asked.
 */
export async function programStamp(target: Pick<Target, 'where' | 'path' | 'distro'>): Promise<string | undefined> {
	const file = target.where === 'wsl' ? target.distro && target.path.startsWith('/') ? wslUncPath(target.distro, target.path) : undefined : target.path;
	if (!file) {
		return undefined;
	}
	try {
		const stat = await fs.promises.stat(file);
		return stat.isFile() ? `${stat.size}:${stat.mtimeMs}` : undefined;
	} catch {
		return undefined;
	}
}
