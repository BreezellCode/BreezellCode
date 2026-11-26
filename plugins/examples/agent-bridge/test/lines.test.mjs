// What an agent writes a JSON object a line, read as it comes: whole lines only, however the output is cut into
// chunks (a line over many chunks, many lines in one, a character's bytes split), lines that are not JSON passed
// over, and a long line costing its length once. And lines out of bytes read a piece at a time (agy's transcripts).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PassThrough } from 'node:stream';

const root = fileURLToPath(new URL('..', import.meta.url));
const require = createRequire(import.meta.url);
const esbuild = require('esbuild');
const out = mkdtempSync(join(tmpdir(), 'agent-bridge-lines-'));
await esbuild.build({ entryPoints: [join(root, 'src/core/lines.ts')], bundle: true, platform: 'node', format: 'cjs', outfile: join(out, 'lines.cjs'), logLevel: 'silent' });
const lines = require(join(out, 'lines.cjs'));
test.after(() => rmSync(out, { recursive: true, force: true }));

/** Writes `chunks` to a stream read by onJsonLines; what it handed on. */
async function read(chunks) {
	const stream = new PassThrough();
	const got = [];
	lines.onJsonLines(stream, message => got.push(message));
	for (const chunk of chunks) {
		stream.write(chunk);
		await new Promise(resolve => setImmediate(resolve));
	}
	stream.end();
	await new Promise(resolve => stream.on('end', resolve).resume());
	return got;
}

test('whole JSON lines, however the output is cut: a line in pieces, lines together, a character split, CRLF, other lines passed over', async () => {
	const text = `{"a":1}\n{"b":"數一數"}\r\nnot json\n[1,2]\n{"c":{"d":[3]}}\n{"broken":\n{"e":true}\n`;
	const whole = Buffer.from(text, 'utf8');
	const want = [{ a: 1 }, { b: '數一數' }, { c: { d: [3] } }, { e: true }];
	assert.deepEqual(await read([whole]), want, 'all at once');
	const bytes = [...whole].map(b => Buffer.from([b]));
	assert.deepEqual(await read(bytes), want, 'a byte at a time (the Chinese characters cut in the middle)');
	assert.deepEqual(await read([whole.subarray(0, 5), whole.subarray(5, 30), whole.subarray(30)]), want, 'in a few pieces');
	assert.deepEqual(await read([Buffer.from('{"last":1}')]), [], 'a line its newline did not end yet is not read');
});

test('a long line in many chunks costs its length once, not once a chunk', async () => {
	const big = JSON.stringify({ type: 'user', content: 'x'.repeat(8 * 1024 * 1024) });
	const chunks = [];
	const piece = 64 * 1024;
	for (let at = 0; at < big.length; at += piece) {
		chunks.push(big.slice(at, at + piece));
	}
	chunks.push('\n');
	const stream = new PassThrough();
	let length = 0;
	lines.onJsonLines(stream, message => { length = message.content.length; });
	const started = process.hrtime.bigint();
	for (const chunk of chunks) {
		stream.write(chunk);
	}
	stream.end();
	await new Promise(resolve => stream.on('end', resolve).resume());
	const ms = Number(process.hrtime.bigint() - started) / 1e6;
	assert.equal(length, 8 * 1024 * 1024);
	// Gathered and joined once: well under a second (searching and copying it again at each of its 128 chunks took many times that).
	assert.ok(ms < 1500, `took ${ms.toFixed(0)} ms`);
});

test('lines out of bytes read a piece at a time: each whole one, what is left waits for its end, a line too long passed over to its end', () => {
	const splitter = new lines.LineSplitter(10);
	const got = [];
	const push = text => splitter.push(Buffer.from(text, 'utf8'), line => got.push(line.toString('utf8')));
	push('one\ntw');
	assert.deepEqual(got, ['one']);
	push('o\nthree\n');
	assert.deepEqual(got, ['one', 'two', 'three']);
	push('this line is far too long');
	push(' and goes on\nfour\n');
	assert.deepEqual(got, ['one', 'two', 'three', 'four'], 'the long one is passed over, up to its end');
	push('fi');
	splitter.reset();
	push('ve\n');
	assert.deepEqual(got.at(-1), 've', 'what was gathered goes with a reset (the file written anew)');
});
