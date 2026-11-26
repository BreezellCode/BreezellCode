/*
 * Removing an agent's own files of a conversation (its record when the user deleted the conversation in Breezell,
 * and only then): a file or a folder with what is in it, never following a link (a symlink, or a Windows junction,
 * which lstat names a link too), so that nothing outside the folder is ever reached.
 */
import * as fs from 'node:fs';

/** How a removal went: nothing was there, it is gone, or part of it stayed (a link kept inside). */
export type Removed = 'missing' | 'removed' | 'kept';

/**
 * Removes `target` and what is in it. `links`: `remove`, a link inside is removed as a link (its target untouched);
 * `keep`, it stays, and so do the folders that hold it.
 */
export async function removeTree(target: string, join: (...parts: string[]) => string, links: 'remove' | 'keep'): Promise<Removed> {
	const stat = await fs.promises.lstat(target).catch(() => undefined);
	if (!stat) {
		return 'missing';
	}
	if (stat.isSymbolicLink() && links === 'keep') {
		return 'kept';
	}
	if (!stat.isDirectory() || stat.isSymbolicLink()) {
		await fs.promises.unlink(target);
		return 'removed';
	}
	let kept = false;
	for (const name of await fs.promises.readdir(target)) {
		kept = await removeTree(join(target, name), join, links) === 'kept' || kept;
	}
	if (kept) {
		return 'kept';
	}
	await fs.promises.rmdir(target);
	return 'removed';
}

/** The first line of a file (read from its first 256 KB); none when it is not there. */
export async function firstLineOf(file: string): Promise<string | undefined> {
	const handle = await fs.promises.open(file, 'r').catch(() => undefined);
	if (!handle) {
		return undefined;
	}
	try {
		const chunk = Buffer.alloc(256 * 1024);
		const { bytesRead } = await handle.read(chunk, 0, chunk.length, 0);
		const text = chunk.subarray(0, bytesRead).toString('utf8');
		const end = text.indexOf('\n');
		return end < 0 ? text : text.slice(0, end);
	} finally {
		await handle.close().catch(() => undefined);
	}
}
