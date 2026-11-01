/**
 * The dictionaries and language models: what each language needs (media/data-manifest.json, made
 * by tools/make_data_manifest.mjs), what this computer has, and the download from the plugin's
 * GitHub release. A download resumes where it stopped and goes in place only after its SHA-256 is
 * right. Nothing here runs what it downloads: these files are data, read by the engine.
 */
import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream, existsSync, mkdirSync, promises as fsp, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
// 'http' and 'https' without "node:": Breezell's extension host applies the user's proxy to these.
import * as http from 'http';
import * as https from 'https';
import { join } from 'node:path';
import { pipeline } from 'node:stream/promises';

export type PackId = 'chinese' | 'japanese' | 'korean';

export interface DataFile {
	readonly name: string;
	readonly size: number;
	readonly sha256: string;
}

export interface DataPack {
	readonly id: PackId;
	readonly files: readonly DataFile[];
}

export interface DataManifest {
	readonly version: number;
	/** Where the files are: <base>/<file name>. */
	readonly base: string;
	readonly packs: readonly DataPack[];
}

export function loadManifest(file: string): DataManifest {
	return JSON.parse(readFileSync(file, 'utf8')) as DataManifest;
}

/** The pack a layout composes with. */
export function packOfLayout(layout: string): PackId {
	return layout === 'japanese' ? 'japanese' : layout === 'korean' ? 'korean' : 'chinese';
}

export const packSize = (pack: DataPack): number => pack.files.reduce((n, f) => n + f.size, 0);

/**
 * Whether a pack's files are there at all, so the engine can compose (an older version of a model
 * still works; the settings page offers the update).
 */
export function hasPack(manifest: DataManifest, dir: string, id: PackId): boolean {
	const pack = manifest.packs.find(p => p.id === id);
	return !!pack && pack.files.every(f => existsSync(join(dir, f.name)));
}

/** ready: the manifest's files. outdated: there, but others. missing: some are not there. */
export type PackState = 'ready' | 'outdated' | 'missing';

/** What was hashed already: the name's size, time and SHA-256 (hashing 300 MB once is enough). */
type Verified = Record<string, { size: number; mtimeMs: number; sha256: string }>;
const VERIFIED_FILE = '.verified.json';

function readVerified(dir: string): Verified {
	try {
		return JSON.parse(readFileSync(join(dir, VERIFIED_FILE), 'utf8')) as Verified;
	} catch {
		return {};
	}
}

function writeVerified(dir: string, verified: Verified): void {
	try {
		writeFileSync(join(dir, VERIFIED_FILE), JSON.stringify(verified, null, '\t'));
	} catch {
		// hashed again next time
	}
}

export async function sha256OfFile(file: string, signal?: AbortSignal): Promise<string> {
	const hash = createHash('sha256');
	await pipeline(createReadStream(file), hash, { signal });
	return hash.digest('hex');
}

/** Sizes first, then the hash of what was not hashed before. */
export async function packState(manifest: DataManifest, dir: string, id: PackId, signal?: AbortSignal): Promise<PackState> {
	const pack = manifest.packs.find(p => p.id === id);
	if (!pack || !hasPack(manifest, dir, id)) {
		return 'missing';
	}
	const verified = readVerified(dir);
	let state: PackState = 'ready';
	let changed = false;
	for (const f of pack.files) {
		const path = join(dir, f.name);
		const st = statSync(path);
		if (st.size !== f.size) {
			state = 'outdated';
			continue;
		}
		const known = verified[f.name];
		let sha = known?.size === st.size && known.mtimeMs === st.mtimeMs ? known.sha256 : undefined;
		if (!sha) {
			sha = await sha256OfFile(path, signal);
			verified[f.name] = { size: st.size, mtimeMs: st.mtimeMs, sha256: sha };
			changed = true;
		}
		if (sha !== f.sha256) {
			state = 'outdated';
		}
	}
	if (changed) {
		writeVerified(dir, verified);
	}
	return state;
}

export type DataErrorKind = 'network' | 'checksum' | 'space' | 'address' | 'cancelled';

export class DataError extends Error {
	constructor(readonly kind: DataErrorKind, message: string) {
		super(message);
		this.name = 'DataError';
	}
}

export interface DownloadProgress {
	readonly pack: PackId;
	readonly file: string;
	/** Bytes of the pack there so far, and all of them. */
	readonly received: number;
	readonly total: number;
	readonly bytesPerSecond: number;
}

export interface DownloadOptions {
	/** Another address for the files (a mirror): https only, loopback aside (tests). */
	readonly base?: string;
	readonly onProgress?: (p: DownloadProgress) => void;
	readonly signal?: AbortSignal;
	/** Attempts per file, each going on from where the last stopped. */
	readonly attempts?: number;
	/** No bytes for this long: the connection is given up. */
	readonly idleMs?: number;
	/** First wait between attempts; doubles after each. */
	readonly backoffMs?: number;
}

const isLoopback = (u: URL) => u.hostname === '127.0.0.1' || u.hostname === 'localhost';

function checkedUrl(address: string): URL {
	let url: URL;
	try {
		url = new URL(address);
	} catch {
		throw new DataError('address', `not an address: ${address}`);
	}
	if (url.protocol !== 'https:' && !(url.protocol === 'http:' && isLoopback(url))) {
		throw new DataError('address', `not an https address: ${address}`);
	}
	return url;
}

/** Gets `address` from byte `from` on (following redirects); the response, and whether it starts at `from`. */
function open(address: string, from: number, idleMs: number, signal: AbortSignal | undefined, hops = 0): Promise<{ response: http.IncomingMessage; resumed: boolean }> {
	return new Promise((resolve, reject) => {
		const url = checkedUrl(address);
		const headers: Record<string, string> = { 'User-Agent': 'BreezellIME', 'Accept': 'application/octet-stream' };
		if (from > 0) {
			headers.Range = `bytes=${from}-`;
		}
		const request = (url.protocol === 'https:' ? https : http).get(url, { headers, signal }, response => {
			const status = response.statusCode ?? 0;
			if (status >= 300 && status < 400 && response.headers.location) {
				response.resume();
				if (hops >= 5) {
					reject(new DataError('network', 'too many redirects'));
					return;
				}
				open(new URL(response.headers.location, url).href, from, idleMs, signal, hops + 1).then(resolve, reject);
				return;
			}
			if (status === 206 || status === 200) {
				resolve({ response, resumed: status === 206 });
				return;
			}
			response.resume();
			reject(new DataError('network', `the server answered ${status} for ${url.pathname}`));
		});
		request.setTimeout(idleMs, () => request.destroy(new DataError('network', 'the connection stalled')));
		request.on('error', reject);
	});
}

const delay = (ms: number, signal?: AbortSignal) => new Promise<void>((resolve, reject) => {
	const timer = setTimeout(resolve, ms);
	signal?.addEventListener('abort', () => { clearTimeout(timer); reject(new DataError('cancelled', 'cancelled')); }, { once: true });
});

/** The pack's files into `dir`. Throws DataError; what came in stays as <name>.part for the next try. */
export async function downloadPack(manifest: DataManifest, id: PackId, dir: string, options: DownloadOptions = {}): Promise<void> {
	const pack = manifest.packs.find(p => p.id === id);
	if (!pack) {
		throw new DataError('address', `no pack ${id}`);
	}
	const base = (options.base || manifest.base).replace(/\/+$/, '');
	checkedUrl(base);
	mkdirSync(dir, { recursive: true });
	const idleMs = options.idleMs ?? 30000;
	const attempts = options.attempts ?? 8;
	const verified = readVerified(dir);
	const total = packSize(pack);

	// What is in place already, and whether the rest fits.
	const done = new Set<string>();
	for (const f of pack.files) {
		const path = join(dir, f.name);
		if (existsSync(path) && statSync(path).size === f.size) {
			const st = statSync(path);
			const known = verified[f.name];
			const sha = known?.size === st.size && known.mtimeMs === st.mtimeMs ? known.sha256 : await sha256OfFile(path, options.signal);
			if (sha === f.sha256) {
				verified[f.name] = { size: st.size, mtimeMs: st.mtimeMs, sha256: sha };
				done.add(f.name);
			}
		}
	}
	const partSize = (f: DataFile) => {
		const part = join(dir, `${f.name}.part`);
		return existsSync(part) ? Math.min(statSync(part).size, f.size) : 0;
	};
	let received = pack.files.reduce((n, f) => n + (done.has(f.name) ? f.size : partSize(f)), 0);
	try {
		const { bavail, bsize } = await fsp.statfs(dir);
		const needed = total - received;
		if (Number(bavail) * Number(bsize) < needed + 64 * 1024 * 1024) {
			throw new DataError('space', `${needed} bytes are needed in ${dir}`);
		}
	} catch (e) {
		if (e instanceof DataError) {
			throw e;
		}
		// No statfs here: the write itself will say.
	}

	const t0 = Date.now();
	const startBytes = received;
	let lastReport = 0;
	const report = (file: string, force = false) => {
		const now = Date.now();
		if (force || now - lastReport >= 200) {
			lastReport = now;
			options.onProgress?.({ pack: id, file, received, total, bytesPerSecond: (received - startBytes) / Math.max(0.001, (now - t0) / 1000) });
		}
	};
	report(pack.files[0]?.name ?? '', true);

	for (const f of pack.files) {
		if (done.has(f.name)) {
			continue;
		}
		const path = join(dir, f.name);
		const part = `${path}.part`;
		let wait = options.backoffMs ?? 1000;
		let badHash = false;
		for (let attempt = 1; ; attempt++) {
			try {
				let from = existsSync(part) ? statSync(part).size : 0;
				if (from > f.size) {
					rmSync(part, { force: true });
					received -= f.size;
					from = 0;
				}
				if (from < f.size) {
					const { response, resumed } = await open(`${base}/${encodeURIComponent(f.name)}`, from, idleMs, options.signal);
					if (from > 0 && !resumed) {
						// The server sends it all again: start over.
						received -= from;
						from = 0;
						rmSync(part, { force: true });
					}
					response.setTimeout(idleMs, () => response.destroy(new DataError('network', 'the connection stalled')));
					response.on('data', (chunk: Buffer) => {
						received += chunk.length;
						report(f.name);
					});
					await pipeline(response, createWriteStream(part, { flags: from > 0 ? 'a' : 'w' }), { signal: options.signal });
				}
				const size = statSync(part).size;
				if (size !== f.size) {
					throw new DataError('network', `${f.name} stopped at ${size} of ${f.size} bytes`);
				}
				const sha = await sha256OfFile(part, options.signal);
				if (sha !== f.sha256) {
					// A bad byte somewhere: only a whole new copy can fix it, and only once.
					rmSync(part, { force: true });
					received -= size;
					if (badHash) {
						throw new DataError('checksum', `${f.name} does not match its SHA-256`);
					}
					badHash = true;
					continue;
				}
				renameSync(part, path);
				const st = statSync(path);
				verified[f.name] = { size: st.size, mtimeMs: st.mtimeMs, sha256: sha };
				writeVerified(dir, verified);
				report(f.name, true);
				break;
			} catch (e) {
				if (options.signal?.aborted) {
					throw new DataError('cancelled', 'cancelled');
				}
				if (e instanceof DataError && e.kind !== 'network') {
					throw e;
				}
				const failure = e as Error;
				// A disk error is not a network's: trying again will not help.
				if ((e as NodeJS.ErrnoException).code === 'ENOSPC') {
					throw new DataError('space', failure.message);
				}
				if (attempt >= attempts) {
					throw new DataError('network', failure.message);
				}
				// What came in counts as it stands on disk.
				received = pack.files.reduce((n, g) => n + (g === f || !done.has(g.name) ? 0 : g.size), 0)
					+ pack.files.reduce((n, g) => n + (!done.has(g.name) ? partSize(g) : 0), 0);
				await delay(wait, options.signal);
				wait = Math.min(wait * 2, 30000);
			}
		}
		done.add(f.name);
	}
	writeVerified(dir, verified);
}

/** The pack's files go (and any unfinished ones). A file another pack lists stays. */
export function removePack(manifest: DataManifest, id: PackId, dir: string): void {
	const pack = manifest.packs.find(p => p.id === id);
	if (!pack) {
		return;
	}
	const others = new Set(manifest.packs.filter(p => p.id !== id).flatMap(p => p.files.map(f => f.name)));
	const verified = readVerified(dir);
	for (const f of pack.files) {
		if (!others.has(f.name)) {
			rmSync(join(dir, f.name), { force: true });
			rmSync(join(dir, `${f.name}.part`), { force: true });
			delete verified[f.name];
		}
	}
	writeVerified(dir, verified);
}
