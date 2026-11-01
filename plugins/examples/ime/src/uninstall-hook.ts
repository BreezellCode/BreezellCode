/**
 * Runs when the plugin is removed (vscode:uninstall; Breezell stops it after 5 seconds, then deletes
 * the plugin's folder). The plugin set the system input method up by itself, so it takes it away by
 * itself: off the user's list, the host stopped, the default input method back. It waits for
 * PowerShell, which takes a second or two: a process left running on its own did not survive this
 * one's end. The languages it downloaded go too, from the default folder only: a folder the user
 * chose is theirs. What it learned stays. The text service's files in Program Files stay registered,
 * unused: removing those needs an administrator.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { loadManifest, removePack } from './data.js';
import { configuredDataDir, defaultDataDir, setupMarker } from './paths.js';

rmSync(setupMarker(), { force: true });

try {
	const dir = configuredDataDir();
	if (dir === defaultDataDir()) {
		const manifest = loadManifest(join(__dirname, '..', '..', 'media', 'data-manifest.json'));
		for (const pack of manifest.packs) {
			removePack(manifest, pack.id, dir);
		}
	}
} catch {
	// Nothing to remove, or a file in use: it stays.
}

if (process.platform === 'win32') {
	const script = join(__dirname, 'uninstall.ps1');
	if (existsSync(script)) {
		spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', script, '-Part', 'user'], { stdio: 'ignore', windowsHide: true });
	}
}
