/**
 * The download of the languages (src/data.ts), from a small server on this computer that can cut
 * a connection, ignore ranges, redirect and send wrong bytes.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createServer, IncomingMessage, Server, ServerResponse } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { DataError, DataManifest, downloadPack, hasPack, packOfLayout, packSize, packState, removePack } from '../../src/data.js';

const body = (n: number, seed: number) => Buffer.from(Array.from({ length: n }, (_, i) => (i * seed) & 0xff));
const FILES: Record<string, Buffer> = { 'a.bin': body(70000, 7), 'b.bin': body(30000, 11), 'shared.bin': body(100, 13), 'k.bin': body(500, 17) };
const sha = (b: Buffer) => createHash('sha256').update(b).digest('hex');
const entry = (name: string) => ({ name, size: FILES[name].length, sha256: sha(FILES[name]) });

interface Behaviour {
	/** Requests seen, with their Range. */
	seen: { url: string; range?: string }[];
	cutFirstAfter?: number;
	noRanges?: boolean;
	corruptOnce?: boolean;
	alwaysCorrupt?: boolean;
	status?: number;
}

function serve(b: Behaviour): Promise<{ server: Server; base: string }> {
	const server = createServer((req: IncomingMessage, res: ServerResponse) => {
		const name = decodeURIComponent((req.url ?? '').replace(/^\/(files|redirect)\//, ''));
		b.seen.push({ url: req.url ?? '', range: req.headers.range });
		if (b.status) {
			res.writeHead(b.status).end();
			return;
		}
		if (req.url?.startsWith('/redirect/')) {
			res.writeHead(302, { Location: `/files/${name}` }).end();
			return;
		}
		let data = FILES[name];
		if (!data) {
			res.writeHead(404).end();
			return;
		}
		if (b.alwaysCorrupt || b.corruptOnce) {
			b.corruptOnce = false;
			data = Buffer.from(data);
			data[data.length - 1] ^= 0xff;
		}
		const from = !b.noRanges && req.headers.range ? Number(/bytes=(\d+)-/.exec(req.headers.range)?.[1]) : 0;
		res.writeHead(from ? 206 : 200, { 'Content-Length': String(data.length - from) });
		const rest = data.subarray(from);
		if (b.cutFirstAfter !== undefined) {
			const cut = b.cutFirstAfter;
			b.cutFirstAfter = undefined;
			res.write(rest.subarray(0, cut), () => setTimeout(() => res.destroy(), 40));
			return;
		}
		res.end(rest);
	});
	return new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve({ server, base: `http://127.0.0.1:${(server.address() as { port: number }).port}/files` })));
}

const manifestOf = (base: string): DataManifest => ({
	version: 1, base,
	packs: [
		{ id: 'chinese', files: [entry('a.bin'), entry('b.bin'), entry('shared.bin')] },
		{ id: 'korean', files: [entry('k.bin'), entry('shared.bin')] },
	],
});
const FAST = { backoffMs: 1, idleMs: 2000 };

async function withServer(b: Partial<Behaviour>, fn: (m: DataManifest, dir: string, behaviour: Behaviour) => Promise<void>): Promise<void> {
	const behaviour: Behaviour = { seen: [], ...b };
	const { server, base } = await serve(behaviour);
	const dir = mkdtempSync(join(tmpdir(), 'ime-data-'));
	try {
		await fn(manifestOf(base), dir, behaviour);
	} finally {
		server.closeAllConnections();
		server.close();
		rmSync(dir, { recursive: true, force: true });
	}
}

test('data: a pack comes down, checked, and is then ready', async () => {
	await withServer({}, async (m, dir) => {
		assert.equal(hasPack(m, dir, 'chinese'), false);
		assert.equal(await packState(m, dir, 'chinese'), 'missing');
		const seen: number[] = [];
		await downloadPack(m, 'chinese', dir, { ...FAST, onProgress: p => seen.push(p.received) });
		assert.equal(hasPack(m, dir, 'chinese'), true);
		assert.equal(await packState(m, dir, 'chinese'), 'ready');
		assert.equal(seen.at(-1), packSize(m.packs[0]));
		assert.ok(seen.every((n, i) => i === 0 || n >= seen[i - 1]), 'progress never goes back');
		assert.equal(sha(readFileSync(join(dir, 'a.bin'))), sha(FILES['a.bin']));
		assert.equal(existsSync(join(dir, 'a.bin.part')), false);
	});
});

test('data: a cut connection goes on from where it stopped', async () => {
	await withServer({ cutFirstAfter: 20000 }, async (m, dir, b) => {
		await downloadPack(m, 'chinese', dir, FAST);
		assert.equal(await packState(m, dir, 'chinese'), 'ready');
		const resumed = b.seen.filter(r => r.url.endsWith('a.bin')).map(r => r.range);
		assert.equal(resumed[0], undefined);
		assert.match(resumed[1] ?? '', /^bytes=\d+-$/, 'the second try asks for the rest');
	});
});

test('data: a server that ignores ranges: the file starts over, and is still right', async () => {
	await withServer({ cutFirstAfter: 20000, noRanges: true }, async (m, dir) => {
		await downloadPack(m, 'chinese', dir, FAST);
		assert.equal(await packState(m, dir, 'chinese'), 'ready');
	});
});

test('data: a bad copy is fetched once more; bad twice, it stops and nothing goes in place', async () => {
	await withServer({ corruptOnce: true }, async (m, dir) => {
		await downloadPack(m, 'chinese', dir, FAST);
		assert.equal(await packState(m, dir, 'chinese'), 'ready');
	});
	await withServer({ alwaysCorrupt: true }, async (m, dir) => {
		await assert.rejects(downloadPack(m, 'chinese', dir, FAST), (e: DataError) => e.kind === 'checksum');
		assert.equal(existsSync(join(dir, 'a.bin')), false);
		assert.equal(existsSync(join(dir, 'a.bin.part')), false);
	});
});

test('data: redirects are followed; an http address that is not this computer is refused', async () => {
	await withServer({}, async (m, dir) => {
		await downloadPack(m, 'korean', dir, { ...FAST, base: m.base.replace('/files', '/redirect') });
		assert.equal(await packState(m, dir, 'korean'), 'ready');
		await assert.rejects(downloadPack(m, 'chinese', dir, { ...FAST, base: 'http://example.com/files' }), (e: DataError) => e.kind === 'address');
		await assert.rejects(downloadPack(m, 'chinese', dir, { ...FAST, base: 'not an address' }), (e: DataError) => e.kind === 'address');
	});
});

test('data: a server error stops after the tries, what came in stays', async () => {
	await withServer({ status: 503 }, async (m, dir, b) => {
		await assert.rejects(downloadPack(m, 'korean', dir, { ...FAST, attempts: 3 }), (e: DataError) => e.kind === 'network');
		assert.equal(b.seen.length, 3);
	});
});

test('data: cancelling keeps the part for later, and the next download uses it', async () => {
	await withServer({ cutFirstAfter: 20000 }, async (m, dir, b) => {
		const controller = new AbortController();
		// The connection is cut after a while; then it waits to try again, and the user cancels.
		const stopped = downloadPack(m, 'chinese', dir, { ...FAST, backoffMs: 60000, signal: controller.signal });
		setTimeout(() => controller.abort(), 300);
		await assert.rejects(stopped, (e: DataError) => e.kind === 'cancelled');
		assert.ok(statSync(join(dir, 'a.bin.part')).size > 0);
		await downloadPack(m, 'chinese', dir, FAST);
		assert.equal(await packState(m, dir, 'chinese'), 'ready');
		assert.ok(b.seen.some(r => r.range), 'it went on from the part');
	});
});

test('data: a file of another version shows as outdated, and the update replaces it', async () => {
	await withServer({}, async (m, dir) => {
		await downloadPack(m, 'chinese', dir, FAST);
		writeFileSync(join(dir, 'a.bin'), 'older model');
		assert.equal(hasPack(m, dir, 'chinese'), true, 'an older model can still compose');
		assert.equal(await packState(m, dir, 'chinese'), 'outdated');
		await downloadPack(m, 'chinese', dir, FAST);
		assert.equal(await packState(m, dir, 'chinese'), 'ready');
		// The same size but other bytes.
		const same = Buffer.from(FILES['b.bin']);
		same[0] ^= 1;
		writeFileSync(join(dir, 'b.bin'), same);
		assert.equal(await packState(m, dir, 'chinese'), 'outdated');
	});
});

test('data: removing a pack leaves what another pack shares and other files', async () => {
	await withServer({}, async (m, dir) => {
		await downloadPack(m, 'chinese', dir, FAST);
		await downloadPack(m, 'korean', dir, FAST);
		writeFileSync(join(dir, 'notes.txt'), 'mine');
		removePack(m, 'chinese', dir);
		assert.equal(existsSync(join(dir, 'a.bin')), false);
		assert.equal(existsSync(join(dir, 'shared.bin')), true);
		assert.equal(existsSync(join(dir, 'notes.txt')), true);
		assert.equal(await packState(m, dir, 'korean'), 'ready');
		assert.equal(await packState(m, dir, 'chinese'), 'missing');
	});
});

test('data: which pack a layout needs', () => {
	assert.equal(packOfLayout('pinyin'), 'chinese');
	assert.equal(packOfLayout('wubi'), 'chinese');
	assert.equal(packOfLayout('zhuyin'), 'chinese');
	assert.equal(packOfLayout('japanese'), 'japanese');
	assert.equal(packOfLayout('korean'), 'korean');
});
