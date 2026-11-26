/*
 * The window's folders as an agent reaches them, and the agent's paths as Breezell opens them (URIs): a folder of
 * this computer, one in WSL for an agent there, an SSH window whose host is that same WSL distribution.
 */
import * as vscode from 'vscode';
import * as fs from 'node:fs';
import type { Target } from './cli';
import { localPathOf } from './paths';

/**
 * Where a conversation's folder (a URI as text) is for the agent: a folder of this computer, or one inside WSL for
 * the agent there. Undefined when that agent cannot work in it.
 */
export function folderFor(uri: string | undefined, target: Pick<Target, 'where' | 'distro'>): string | undefined {
	if (!uri) {
		return undefined;
	}
	let parsed: vscode.Uri;
	try {
		parsed = vscode.Uri.parse(uri);
	} catch {
		return undefined;
	}
	if (parsed.scheme === 'file') {
		return parsed.fsPath;
	}
	let authority = parsed.authority;
	try {
		authority = decodeURIComponent(authority);
	} catch {
		// as it is
	}
	if (parsed.scheme !== 'vscode-remote' || !authority.startsWith('wsl+') || target.where !== 'wsl') {
		return undefined;
	}
	// The folder is in one distribution; an agent found in another cannot see it there.
	const distro = authority.slice('wsl+'.length);
	return !target.distro || !distro || distro.toLowerCase() === target.distro.toLowerCase() ? parsed.path : undefined;
}

/** A folder of an SSH window (`vscode-remote://ssh-remote+…/path`), parsed; undefined for any other. */
function sshFolder(uri: string | undefined): vscode.Uri | undefined {
	if (!uri) {
		return undefined;
	}
	try {
		const parsed = vscode.Uri.parse(uri);
		return parsed.scheme === 'vscode-remote' && decodeURIComponent(parsed.authority).startsWith('ssh-remote+') && parsed.path.startsWith('/') ? parsed : undefined;
	} catch {
		return undefined;
	}
}

/**
 * SSH windows whose host is the WSL distribution this agent runs in (an SSH server in WSL, reached through
 * localhost): their folders are the same files under the same paths. The machine says so itself: the host's
 * /etc/machine-id, read through the window, is the distribution's own. Each host is asked once. Another host, or one
 * that does not say, is not this one: the agent working there would change other files.
 */
export class SameMachineHosts {
	private readonly asked = new Map<string, Promise<boolean>>();
	private readonly answered = new Map<string, boolean>();

	constructor(private readonly readLocal: (file: string) => Promise<string>, private readonly readRemote: (uri: vscode.Uri) => Promise<string>) { }

	/** Where a folder of such a host is for this agent (its path); undefined for any other folder. */
	async folderFor(uri: string | undefined, target: Pick<Target, 'where' | 'distro'>): Promise<string | undefined> {
		const folder = sshFolder(uri);
		return folder && target.where === 'wsl' && await this.same(folder, target) ? folder.path : undefined;
	}

	/** As folderFor, from what was answered already: for what cannot wait (a sync's folders, a file's link). */
	knownFolderFor(uri: string | undefined, target: Pick<Target, 'where' | 'distro'>): string | undefined {
		const folder = sshFolder(uri);
		return folder && target.where === 'wsl' && this.answered.get(SameMachineHosts.key(folder, target)) === true ? folder.path : undefined;
	}

	/** Another agent install: asked again. */
	forget(): void {
		this.asked.clear();
		this.answered.clear();
	}

	private static key(folder: vscode.Uri, target: Pick<Target, 'distro'>): string {
		return `${folder.authority}\n${target.distro ?? ''}`;
	}

	private same(folder: vscode.Uri, target: Pick<Target, 'where' | 'distro'>): Promise<boolean> {
		const key = SameMachineHosts.key(folder, target);
		let asked = this.asked.get(key);
		if (!asked) {
			const idOf = (text: string) => text.trim().split(/\s+/)[0] ?? '';
			const here = localPathOf('/etc/machine-id', target);
			asked = (async () => {
				if (!here) {
					return false;
				}
				try {
					const [there, mine] = await Promise.all([this.readRemote(folder.with({ path: '/etc/machine-id', query: '', fragment: '' })), this.readLocal(here)]);
					return /^[0-9a-f]{16,}$/i.test(idOf(there)) && idOf(there) === idOf(mine);
				} catch {
					return false;
				}
			})();
			this.asked.set(key, asked);
			void asked.then(same => { this.answered.set(key, same); });
		}
		return asked;
	}
}

/**
 * A path an agent names, as Breezell opens it (a URI): in the distribution of a WSL window (the folder the
 * conversation is in tells), otherwise as this computer reaches it. Undefined when Breezell cannot.
 */
export function uriOfPath(path: string, folder: string | undefined, target: Pick<Target, 'where' | 'distro'>, sameMachine = false): string | undefined {
	let parsed: vscode.Uri | undefined;
	try {
		parsed = folder ? vscode.Uri.parse(folder) : undefined;
	} catch {
		parsed = undefined;
	}
	// A WSL window, or an SSH window whose host is that distribution (SameMachineHosts): the window opens its paths.
	if (parsed && parsed.scheme === 'vscode-remote') {
		return target.where === 'wsl' && (folderFor(folder, target) !== undefined || sameMachine) && path.startsWith('/') ? parsed.with({ path, query: '', fragment: '' }).toString() : undefined;
	}
	const local = localPathOf(path, target);
	return local ? vscode.Uri.file(local).toString() : undefined;
}

const WRITE_BEFORE_BYTES = 1024 * 1024;

/** A file's text as it is now, when it is there and not too big to show (a Write about to replace it). */
export async function textNow(file: string | undefined): Promise<string | undefined> {
	if (!file) {
		return undefined;
	}
	try {
		const stat = await fs.promises.stat(file);
		return stat.isFile() && stat.size <= WRITE_BEFORE_BYTES ? await fs.promises.readFile(file, 'utf8') : undefined;
	} catch {
		return undefined;
	}
}
