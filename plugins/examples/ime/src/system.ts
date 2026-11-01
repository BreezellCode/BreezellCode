/**
 * The input method for the whole computer. Windows: a TSF text service (DLLs in Program Files,
 * registered machine-wide: the administrator's prompt) that talks to the engine host, which runs in
 * the user's own folder. The plugin's package carries all of it (dist/system); nothing is
 * downloaded for it. Other systems: Breezell's editor and chat only, for now.
 */
import { execFile } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';

const env = process.env;
const programDir = () => join(env.ProgramFiles || 'C:\\Program Files', 'BreezellIME');
const userDir = () => join(env.LOCALAPPDATA || join(homedir(), 'AppData', 'Local'), 'BreezellIME');

export interface SystemState {
	/** This operating system has it. */
	readonly supported: boolean;
	readonly installed: boolean;
}

export function systemState(): SystemState {
	if (process.platform !== 'win32') {
		return { supported: false, installed: false };
	}
	return { supported: true, installed: existsSync(join(programDir(), 'BreezellIME64.dll')) && existsSync(join(userDir(), 'host.cjs')) };
}

/** Windows' language profile to add: the host writes Traditional under 0404 and Simplified under 0804. */
export function profileFor(layout: string, traditional: boolean): string {
	if (layout === 'japanese') {
		return '0411';
	}
	if (layout === 'korean') {
		return '0412';
	}
	return traditional || layout === 'zhuyin' ? '0404' : '0804';
}

function powershell(command: string): Promise<void> {
	return new Promise((resolve, reject) => {
		execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', command], { windowsHide: true, timeout: 5 * 60 * 1000 }, (error, _stdout, stderr) => {
			if (error) {
				reject(new Error(stderr.trim().split('\n')[0] || error.message));
			} else {
				resolve();
			}
		});
	});
}

const quoted = (s: string) => `'${s.replace(/'/g, "''")}'`;

/** The script as this user. */
const runScript = (script: string, args: string) => powershell(`& ${quoted(script)} ${args}`);

/** The script as administrator: Windows asks the user. Throws SystemCancelled when they say no. */
export class SystemCancelled extends Error { }

async function runElevated(script: string, args: string): Promise<void> {
	const inner = `-NoProfile -NonInteractive -ExecutionPolicy Bypass -File "${script}" ${args}`;
	const failure = join(env.TEMP || tmpdir(), 'BreezellIME-install.log');
	rmSync(failure, { force: true });
	try {
		await powershell(`$p = Start-Process -FilePath powershell.exe -Verb RunAs -WindowStyle Hidden -Wait -PassThru -ArgumentList ${quoted(inner)}; if ($p.ExitCode -ne 0) { throw "the installer stopped with code $($p.ExitCode)" }`);
	} catch (e) {
		// Start-Process: "The operation was canceled by the user" (its wording follows the system's language).
		if (/cancel|取消|キャンセル|취소|отмен/i.test((e as Error).message)) {
			throw new SystemCancelled();
		}
		// Why, as the elevated script wrote it.
		throw existsSync(failure) ? new Error(readFileSync(failure, 'utf8').trim()) : e;
	}
}

export interface InstallOptions {
	/** The plugin's folder (context.extensionPath). */
	readonly extensionPath: string;
	/** Breezell's executable, which runs the host. */
	readonly exe: string;
	readonly dataDir: string;
	/** Windows' language profile: profileFor. */
	readonly profile: string;
	/** The plugin's version: what system parts it installed. */
	readonly version: string;
}

export async function installSystem(o: InstallOptions): Promise<void> {
	const dir = join(o.extensionPath, 'dist', 'system');
	const script = join(dir, 'install.ps1');
	await runElevated(script, '-Part machine');
	await runScript(script, `-Part user -BreezellExe ${quoted(o.exe)} -Data ${quoted(o.dataDir)} -Lang ${o.profile}`);
	writeFileSync(join(userDir(), 'installed-by.txt'), o.version);
}

export async function uninstallSystem(extensionPath: string): Promise<void> {
	const script = join(extensionPath, 'dist', 'system', 'uninstall.ps1');
	await runScript(script, '-Part user');
	await runElevated(script, '-Part machine');
}

const stopHost = () => powershell(`Get-CimInstance Win32_Process -Filter "Name LIKE 'Breezell%'" | Where-Object { $_.CommandLine -like '*host.cjs*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }`);

/**
 * After the plugin updated: its host, and a newer text service build for programs to swap to,
 * without the administrator's prompt. The new host is in place before the old one stops: a text
 * service starts the host again within moments of its going. True when something changed.
 */
export async function refreshSystem(extensionPath: string, version: string, log: (message: string) => void): Promise<boolean> {
	if (!systemState().installed) {
		return false;
	}
	const stamp = join(userDir(), 'installed-by.txt');
	const was = existsSync(stamp) ? readFileSync(stamp, 'utf8').trim() : '';
	if (was === version) {
		return false;
	}
	const from = join(extensionPath, 'dist', 'system');
	copyFileSync(join(from, 'host.cjs'), join(userDir(), 'host.cjs'));
	const build = Number(readFileSync(join(from, 'tip-build.txt'), 'utf8').trim());
	const tip = join(userDir(), 'tip', String(build));
	mkdirSync(tip, { recursive: true });
	for (const name of ['BreezellIME64.dll', 'BreezellIME32.dll']) {
		const target = join(tip, name);
		if (!existsSync(target)) {
			copyFileSync(join(from, name), target);
		}
	}
	await powershell(`$k = 'HKCU:\\Software\\BreezellIME'; $now = (Get-ItemProperty -Path $k -Name TipVersion -ErrorAction SilentlyContinue).TipVersion; if (-not $now -or $now -lt ${build}) { Set-ItemProperty -Path $k -Name TipVersion -Value ${build} -Type DWord }`);
	await stopHost();
	writeFileSync(stamp, version);
	log(`system input method updated from ${was || 'an earlier version'} to ${version}`);
	return true;
}
