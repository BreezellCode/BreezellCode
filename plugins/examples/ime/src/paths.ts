/**
 * Where the input method keeps its things, the same for the system input method's host and
 * Breezell's plugin, on Windows, macOS and Linux.
 *
 *   home  config.json, learned words, host.log (and the host's socket off Windows):
 *         Windows %APPDATA%\BreezellIME, macOS ~/Library/Application Support/BreezellIME,
 *         Linux $XDG_CONFIG_HOME/breezell-ime (~/.config/breezell-ime)
 *   data  the models: config.json's dataPath; else Windows %LOCALAPPDATA%\BreezellIME\data,
 *         macOS ~/Library/Application Support/BreezellIME/data, Linux $XDG_DATA_HOME/breezell-ime
 *         (~/.local/share/breezell-ime)
 *   pipe  the host's: BREEZELL_IME_PIPE (tests); Windows \\.\pipe\breezell-ime-<user>; else home/host.sock
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir, userInfo } from 'node:os';
import { join } from 'node:path';

const env = process.env;

export function imeHome(): string {
	if (process.platform === 'win32') {
		return join(env.APPDATA || join(homedir(), 'AppData', 'Roaming'), 'BreezellIME');
	}
	if (process.platform === 'darwin') {
		return join(homedir(), 'Library', 'Application Support', 'BreezellIME');
	}
	return join(env.XDG_CONFIG_HOME || join(homedir(), '.config'), 'breezell-ime');
}

/** Where the models go when nothing says otherwise. */
export function defaultDataDir(): string {
	if (process.platform === 'win32') {
		return join(env.LOCALAPPDATA || join(homedir(), 'AppData', 'Local'), 'BreezellIME', 'data');
	}
	if (process.platform === 'darwin') {
		return join(imeHome(), 'data');
	}
	return join(env.XDG_DATA_HOME || join(homedir(), '.local', 'share'), 'breezell-ime');
}

/** The models' folder as config.json says (the installer writes it), else the default. */
export function configuredDataDir(): string {
	const path = readSharedConfig().dataPath;
	return typeof path === 'string' && path ? path : defaultDataDir();
}

/** There once the plugin set itself up on this computer; it goes when the plugin is removed. */
export function setupMarker(): string {
	return join(imeHome(), 'plugin-set-up');
}

/** True the first time it is asked after the plugin is installed: one window does the setting up. */
export function claimSetup(): boolean {
	mkdirSync(imeHome(), { recursive: true });
	try {
		writeFileSync(setupMarker(), new Date().toISOString(), { flag: 'wx' });
		return true;
	} catch {
		return false;
	}
}

/** config.json, shared with the system input method's host. */
export function readSharedConfig(): Record<string, unknown> {
	try {
		const file = join(imeHome(), 'config.json');
		// A byte order mark: PowerShell's Set-Content wrote older ones.
		return existsSync(file) ? JSON.parse(readFileSync(file, 'utf8').replace(/^\uFEFF/, '')) as Record<string, unknown> : {};
	} catch {
		return {};
	}
}

/** Changes some of config.json's fields (the host reads it again when told: HostClient.reloadConfig). */
export function updateSharedConfig(patch: Record<string, unknown>): void {
	mkdirSync(imeHome(), { recursive: true });
	writeFileSync(join(imeHome(), 'config.json'), JSON.stringify({ ...readSharedConfig(), ...patch }, null, '\t'));
}

export function hostPipe(): string {
	if (env.BREEZELL_IME_PIPE) {
		return env.BREEZELL_IME_PIPE;
	}
	return process.platform === 'win32' ? `\\\\.\\pipe\\breezell-ime-${userInfo().username}` : join(imeHome(), 'host.sock');
}

/** The host script the installer put in place (Windows: %LOCALAPPDATA%\BreezellIME\host.cjs), if any. */
export function installedHostScript(): string | undefined {
	const dir = process.platform === 'win32' ? join(env.LOCALAPPDATA || join(homedir(), 'AppData', 'Local'), 'BreezellIME') : imeHome();
	const script = join(dir, 'host.cjs');
	return existsSync(script) ? script : undefined;
}
