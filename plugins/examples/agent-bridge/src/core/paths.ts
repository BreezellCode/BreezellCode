/*
 * Paths as each side names them: an agent's (this computer's, or inside WSL), Windows' way of reaching a folder in
 * WSL (\\wsl.localhost), and the ids agents give their conversations. Nothing here needs the editor (workspace.ts
 * has what does), so every part of the plugin can use it.
 */
import * as path from 'node:path';
import type { Target } from './cli';

/** How paths under a folder are joined: Windows' way for C:\… or \\wsl$\…, POSIX otherwise. */
export const joinFor = (root: string): ((...parts: string[]) => string) => /^([A-Za-z]:|\\\\)/.test(root) ? path.win32.join : path.posix.join;

/** An id an agent gives a conversation (a UUID, or agy's own): never one that could name another file. */
const AGENT_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{7,80}$/;
export const isAgentId = (id: string): boolean => AGENT_ID.test(id);

/**
 * A path an agent names, as this computer reaches it: itself, or for an agent in WSL its drive (/mnt/c/… is C:\…)
 * or its distribution's files through \\wsl.localhost. Undefined when not absolute.
 */
export function localPathOf(path: string, target: Pick<Target, 'where' | 'distro'>): string | undefined {
	if (target.where !== 'wsl') {
		return /^([A-Za-z]:[\\/]|\\\\|\/)/.test(path) ? path : undefined;
	}
	if (!path.startsWith('/')) {
		return undefined;
	}
	const drive = /^\/mnt\/([a-z])(\/.*)?$/i.exec(path);
	if (drive) {
		return `${drive[1].toUpperCase()}:${(drive[2] ?? '/').replace(/\//g, '\\')}`;
	}
	return target.distro ? `\\\\wsl.localhost\\${target.distro}${path.replace(/\//g, '\\')}` : undefined;
}

/** A folder's last name, from its URI as text (`…/my%20app` → `my app`): what a window without its own name for it shows. */
export function folderName(folder: string): string {
	const last = folder.replace(/\/+$/, '').split('/').pop() ?? folder;
	try {
		return decodeURIComponent(last);
	} catch {
		return last;
	}
}

/**
 * A window that is in WSL (its folders are `vscode-remote://wsl+<distribution>/…`): the agent in that distribution
 * is the one asked first. This plugin itself runs on the Windows side.
 */
export function wslWindowOf(remoteName: string | undefined, folders: readonly { readonly uri: { readonly authority: string } }[] | undefined): { distro?: string } | undefined {
	if (remoteName !== 'wsl') {
		return undefined;
	}
	let authority = folders?.[0]?.uri.authority ?? '';
	try {
		authority = decodeURIComponent(authority);
	} catch {
		// as it is
	}
	const distro = authority.startsWith('wsl+') ? authority.slice('wsl+'.length) : '';
	return distro ? { distro } : {};
}
