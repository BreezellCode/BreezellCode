// Breezell's tools on the loopback for an agent that reaches MCP servers itself: a real HTTP server on 127.0.0.1,
// one path and token a turn, plain JSON answers; and the relay an agent in WSL runs, here with this Node.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const root = fileURLToPath(new URL('..', import.meta.url));
const require = createRequire(import.meta.url);
const esbuild = require('esbuild');
const out = mkdtempSync(join(tmpdir(), 'agent-bridge-mcp-'));
await esbuild.build({ entryPoints: [join(root, 'src/core/mcpHttp.ts')], bundle: true, platform: 'node', format: 'cjs', outfile: join(out, 'mcp.cjs'), logLevel: 'silent' });
const mcp = require(join(out, 'mcp.cjs'));

const post = (url, token, body) => fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) });

test('a turn\'s path answers its requests with plain JSON, only with its token; notifications are taken; nothing else is served', async () => {
	const server = new mcp.McpHttpServer();
	const seen = [];
	const endpoint = await server.open(async rpc => { seen.push(rpc.method); return { jsonrpc: '2.0', id: rpc.id, result: { echo: rpc.method } }; });
	assert.match(endpoint.url, /^http:\/\/127\.0\.0\.1:\d+\/mcp\/[0-9a-f]{24}$/);

	const answered = await post(endpoint.url, endpoint.token, { jsonrpc: '2.0', id: 1, method: 'tools/list' });
	assert.equal(answered.status, 200);
	assert.equal(answered.headers.get('content-type'), 'application/json');
	assert.deepEqual(await answered.json(), { jsonrpc: '2.0', id: 1, result: { echo: 'tools/list' } });

	assert.equal((await post(endpoint.url, endpoint.token, { jsonrpc: '2.0', method: 'notifications/initialized' })).status, 202);
	assert.equal((await post(endpoint.url, 'wrong', { jsonrpc: '2.0', id: 2, method: 'tools/list' })).status, 401);
	assert.equal((await post(endpoint.url, undefined, { jsonrpc: '2.0', id: 2, method: 'tools/list' })).status, 401);
	assert.equal((await post(endpoint.url.replace(/[0-9a-f]{24}$/, '0'.repeat(24)), endpoint.token, { jsonrpc: '2.0', id: 3, method: 'x' })).status, 404);
	assert.equal((await fetch(endpoint.url, { headers: { authorization: `Bearer ${endpoint.token}` } })).status, 405, 'no stream to open');
	const batch = await post(endpoint.url, endpoint.token, [{ jsonrpc: '2.0', id: 4, method: 'a' }, { jsonrpc: '2.0', method: 'notified' }, { jsonrpc: '2.0', id: 5, method: 'b' }]);
	assert.deepEqual((await batch.json()).map(a => a.id), [4, 5]);
	const bad = await fetch(endpoint.url, { method: 'POST', headers: { authorization: `Bearer ${endpoint.token}` }, body: '{not json' });
	assert.equal(bad.status, 400);
	assert.deepEqual(seen, ['tools/list', 'a', 'b'], 'notifications and refused requests never reach the tools');

	// a second turn has a path of its own; the first one's goes with it, and the server with the last
	const other = await server.open(async rpc => ({ jsonrpc: '2.0', id: rpc.id, result: 'other' }));
	assert.notEqual(other.url, endpoint.url);
	endpoint.dispose();
	assert.equal((await post(endpoint.url, endpoint.token, { jsonrpc: '2.0', id: 6, method: 'x' })).status, 404);
	assert.equal((await (await post(other.url, other.token, { jsonrpc: '2.0', id: 7, method: 'x' })).json()).result, 'other');
	other.dispose();
	await assert.rejects(post(other.url, other.token, { jsonrpc: '2.0', id: 8, method: 'x' }), 'closed');
});

test('a tool that throws is an error answer, not a dropped connection', async () => {
	const server = new mcp.McpHttpServer();
	const endpoint = await server.open(async () => { throw new Error('boom'); });
	assert.deepEqual(await (await post(endpoint.url, endpoint.token, { jsonrpc: '2.0', id: 9, method: 'tools/call' })).json(), { jsonrpc: '2.0', id: 9, error: { code: -32603, message: 'boom' } });
	endpoint.dispose();
});

test('the relay: each message it reads goes to the turn\'s path, each answer comes back as a line; a slow call holds up no other', async () => {
	const server = new mcp.McpHttpServer();
	let release;
	const endpoint = await server.open(async rpc => {
		if (rpc.method === 'slow') {
			await new Promise(resolve => { release = resolve; });
		}
		return { jsonrpc: '2.0', id: rpc.id, result: rpc.method };
	});
	const script = join(out, 'relay.js');
	writeFileSync(script, mcp.MCP_RELAY_SCRIPT);
	const relay = spawn(process.execPath, [script], { env: { ...process.env, BREEZELL_MCP_URL: endpoint.url, BREEZELL_MCP_TOKEN: endpoint.token }, stdio: ['pipe', 'pipe', 'pipe'] });
	const lines = [];
	let buffer = '';
	relay.stdout.setEncoding('utf8');
	relay.stdout.on('data', d => { buffer += d; for (let i = buffer.indexOf('\n'); i >= 0; i = buffer.indexOf('\n')) { lines.push(JSON.parse(buffer.slice(0, i))); buffer = buffer.slice(i + 1); } });
	const until = async count => { for (let i = 0; i < 200 && lines.length < count; i++) { await new Promise(r => setTimeout(r, 10)); } };
	relay.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'slow' })}\n`);
	relay.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' })}\n`);
	relay.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'fast' })}\n`);
	await until(1);
	assert.deepEqual(lines, [{ jsonrpc: '2.0', id: 2, result: 'fast' }], 'the fast one first; the notification has no answer');
	release();
	await until(2);
	assert.deepEqual(lines[1], { jsonrpc: '2.0', id: 1, result: 'slow' });
	endpoint.dispose();
	// Breezell gone: a request is answered with an error, never left waiting
	relay.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id: 3, method: 'after' })}\n`);
	await until(3);
	assert.equal(lines[2].id, 3);
	assert.match(lines[2].error.message, /not reachable|answered/);
	const ended = new Promise(resolve => relay.on('close', resolve));
	relay.stdin.end();
	assert.equal(await ended, 0, 'its input closed, it ends');
});

test.after(() => rmSync(out, { recursive: true, force: true }));
