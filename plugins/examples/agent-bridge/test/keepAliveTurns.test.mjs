// Turns of Claude Code and of Antigravity CLI with their programs kept between turns, against fake programs that answer
// as the real ones did when tried (Claude Code 2.1.332: an init a turn; agy 1.5.18: an init only at the first turn):
// one program for a conversation's turns, Breezell's tools given once, nothing kept after a turn that was stopped or
// failed, a model changed starts a new one only once the old one is gone, a turn meanwhile runs in its own, and the
// program closes once idle for the time set.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fakeChild } from './fake-child.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const require = createRequire(import.meta.url);
const esbuild = require('esbuild');
const out = mkdtempSync(join(tmpdir(), 'agent-bridge-keptturns-'));
await esbuild.build({ stdin: { contents: "export * as claude from './src/agents/claudeCode/index'; export * as agy from './src/agents/antigravity/index'; export * from './src/core/keepAlive';", resolveDir: root, loader: 'ts' }, bundle: true, platform: 'node', format: 'cjs', outfile: join(out, 'kt.cjs'), logLevel: 'silent' });
const { claude, agy, KeptProcesses } = require(join(out, 'kt.cjs'));
test.after(() => rmSync(out, { recursive: true, force: true }));

const flush = async () => { for (let i = 0; i < 8; i++) { await new Promise(resolve => setImmediate(resolve)); } };
/** Until it holds, without timers (a test with mocked timers): what a turn does before it starts its program reads and writes files. */
const settled = async what => { for (let i = 0; i < 20_000 && !what(); i++) { await new Promise(resolve => setImmediate(resolve)); } assert.ok(what()); };
const until = async (what, label) => { for (let i = 0; i < 400 && !what(); i++) { await new Promise(resolve => setTimeout(resolve, 2)); } assert.ok(what(), label); };
const token = () => { const listeners = []; return { isCancellationRequested: false, onCancellationRequested: l => { listeners.push(l); return { dispose() { } }; }, cancel() { this.isCancellationRequested = true; listeners.forEach(l => l()); } }; };
const reply = () => { const log = []; return { log, reply: { text: t => log.push(['text', t]), reasoning: () => { }, tool: t => log.push(['tool', t.id, t.status]), session: id => log.push(['session', id]), approve: async () => true, usage: u => log.push(['usage', u.models.map(m => m.inputTokens)]) } }; };

/** Programs as the agents' are: each ends once its input closes. */
function launcher() {
	const started = [];
	const start = (args, cwd, env) => {
		const child = fakeChild();
		child.stdin.on('finish', () => setImmediate(() => { if (child.exitCode === null) { child.end(0); } }));
		Object.assign(child, { args, cwd, env });
		started.push(child);
		return child;
	};
	return { started, target: { where: 'native', path: '/bin/claude', configDir: async () => undefined, ask: async () => ({ code: 0, stdout: '', stderr: '' }), start } };
}
const userMessages = child => child.sent.filter(m => m.type === 'user' || m.event === 'user');
const memoryTool = [{ name: 'memories_recall', inputSchema: { type: 'object', properties: {} } }];

/** Claude Code answering a turn as 2.1.332 does: an init each turn, its words, its result. `program`: once it is started. */
async function claudeAnswers(program, n, session, { ok = true } = {}) {
	await until(() => program() && userMessages(program()).length >= n, `message ${n} given`);
	const child = program();
	child.say({ type: 'system', subtype: 'init', session_id: session });
	child.say({ type: 'assistant', uuid: `a${n}`, message: { id: `m${n}`, content: [{ type: 'text', text: `answer ${n}` }] } });
	child.say(ok ? { type: 'result', subtype: 'success', session_id: session, modelUsage: { 'claude-haiku-5-5': { inputTokens: 2 * n } } } : { type: 'result', subtype: 'error_during_execution', is_error: true, session_id: session, result: 'API Error' });
}

test('Claude Code kept: three turns in one program, its tools given once, each turn told its session; closed once idle', async () => {
	let idle = 60_000;
	const pool = new KeptProcesses({ idleMs: () => idle });
	const { started, target } = launcher();
	const controls = () => ({ keepAlive: { pool, conversation: 'conv' }, breezellTools: memoryTool, callBreezellTool: async () => ({ text: 'none' }) });
	const turnOf = (n, session) => claude.runTurn(target, { model: 'haiku', text: `msg ${n}`, attachments: [], cwd: '/w', ...(session ? { session } : {}) }, reply().reply, token(), p => p, undefined, controls());
	const first = turnOf(1);
	await claudeAnswers(() => started[0], 1, 's1');
	assert.deepEqual(await first, { session: 's1', entry: 'a1' });
	assert.equal(started[0].stdinEnded, undefined, 'kept: its input stays open');
	for (const n of [2, 3]) {
		const r = reply();
		const next = claude.runTurn(target, { model: 'haiku', text: `msg ${n}`, attachments: [], cwd: '/w', session: 's1' }, r.reply, token(), p => p, undefined, controls());
		await claudeAnswers(() => started[0], n, 's1');
		assert.deepEqual(await next, { session: 's1', entry: `a${n}` });
		assert.deepEqual(r.log.filter(([kind]) => kind === 'session'), [['session', 's1']], 'told its session');
		assert.deepEqual(r.log.filter(([kind]) => kind === 'text'), [['text', `answer ${n}`]], 'its own words only, none of the turn before');
	}
	assert.equal(started.length, 1, 'one program for three turns');
	assert.equal(started[0].sent.filter(m => m.request?.subtype === 'initialize').length, 1, 'Breezell\'s tools given once');
	assert.deepEqual(userMessages(started[0]).map(m => m.message.content), ['msg 1', 'msg 2', 'msg 3']);
	// Turned off: closed at once.
	idle = 0;
	pool.configure();
	await flush();
	assert.equal(started[0].stdinEnded, true);
	assert.equal(pool.size, 0);
});

test('Claude Code: a model changed starts another program once the old one is gone; a stopped or failed turn keeps none; a turn meanwhile runs in its own', async () => {
	const pool = new KeptProcesses({ idleMs: () => 60_000 });
	const { started, target } = launcher();
	const controls = () => ({ keepAlive: { pool, conversation: 'conv' } });
	const run = (model, n, session, t = token()) => claude.runTurn(target, { model, text: `msg ${n}`, attachments: [], cwd: '/w', ...(session ? { session } : {}) }, reply().reply, t, p => p, undefined, controls());
	const t1 = run('haiku', 1);
	await claudeAnswers(() => started[0], 1, 's1');
	await t1;
	const t2 = run('opus', 2, 's1');
	await until(() => started.length === 2, 'a new program for another model');
	assert.equal(started[0].exitCode, 0, 'the old one ended before the new one started');
	await claudeAnswers(() => started[1], 1, 's1');
	await t2;
	// Stopped: not kept.
	const stop = token();
	const t3 = run('opus', 3, 's1', stop);
	await until(() => userMessages(started[1]).length === 2, 'the kept one took it');
	stop.cancel();
	// What Claude Code says after an interrupt, before it ends.
	started[1].say({ type: 'system', subtype: 'init', session_id: 's1' });
	started[1].say({ type: 'result', subtype: 'error_during_execution', is_error: true, session_id: 's1' });
	assert.deepEqual(await t3, { session: 's1' });
	await flush();
	assert.equal(started[1].exitCode !== null, true, 'a stopped turn\'s program ends');
	assert.equal(pool.size, 0);
	// Failed: not kept.
	const t4 = run('opus', 4, 's1');
	await until(() => started.length === 3, 'started anew');
	await claudeAnswers(() => started[2], 1, 's1', { ok: false });
	assert.equal((await t4).error, 'API Error');
	await flush();
	assert.equal(pool.size, 0, 'a failed turn keeps none');
	// Two turns of one conversation at once: the second in its own program, which ends with it.
	const t5 = run('opus', 5, 's1');
	await until(() => started.length === 4, 'started');
	const t6 = run('opus', 6, 's1');
	await until(() => started.length === 5, 'a program of its own');
	await claudeAnswers(() => started[4], 1, 's1');
	await t6;
	await flush();
	assert.equal(started[4].stdinEnded, true, 'its own program is not kept');
	await claudeAnswers(() => started[3], 1, 's1');
	await t5;
	assert.equal(started[3].stdinEnded, undefined, 'the first one\'s is');
	assert.equal(pool.size, 1);
	await pool.closeAll('test');
});

test('Claude Code kept: work said between turns closes it; the next turn starts a new one and resumes the session', async () => {
	const pool = new KeptProcesses({ idleMs: () => 60_000 });
	const { started, target } = launcher();
	const controls = { keepAlive: { pool, conversation: 'conv' } };
	const t1 = claude.runTurn(target, { model: 'haiku', text: 'one', attachments: [], cwd: '/w' }, reply().reply, token(), p => p, undefined, controls);
	await claudeAnswers(() => started[0], 1, 's1');
	await t1;
	started[0].say({ type: 'rate_limit_event' });
	await flush();
	assert.equal(started[0].stdinEnded, undefined, 'not work: kept');
	started[0].say({ type: 'assistant', message: { id: 'x', content: [{ type: 'text', text: 'by itself' }] } });
	await flush();
	assert.equal(started[0].stdinEnded, true, 'work with no turn: closed');
	const t2 = claude.runTurn(target, { model: 'haiku', text: 'two', attachments: [], cwd: '/w', session: 's1' }, reply().reply, token(), p => p, undefined, controls);
	await until(() => started.length === 2, 'a new program');
	assert.deepEqual(started[1].args.slice(started[1].args.indexOf('--resume'), started[1].args.indexOf('--resume') + 2), ['--resume', 's1'], 'it resumes the session');
	await claudeAnswers(() => started[1], 1, 's1');
	await t2;
	await pool.closeAll('test');
});

test('Claude Code with keeping off: a program a turn, as before', async () => {
	const pool = new KeptProcesses({ idleMs: () => 0 });
	const { started, target } = launcher();
	const t1 = claude.runTurn(target, { model: 'haiku', text: 'one', attachments: [], cwd: '/w' }, reply().reply, token(), p => p, undefined, { keepAlive: { pool, conversation: 'conv' } });
	await claudeAnswers(() => started[0], 1, 's1');
	await flush();
	assert.equal(started[0].stdinEnded, true);
	assert.deepEqual(await t1, { session: 's1', entry: 'a1' });
	assert.equal(pool.size, 0);
});

/** One turn of agy against a fake program, as antigravityAgent.test.mjs drives it. */
function agyRun(dir) {
	const served = { opened: 0, disposed: 0, answers: [] };
	const run = {
		folders: { tools: { local: join(dir, 'tools'), agent: join(dir, 'tools') }, attachments: { local: join(dir, 'attachments'), agent: join(dir, 'attachments') } },
		model: 'gemini-3.8-flash-low',
		serve: async answer => { served.opened++; served.answers.push(answer); return { entry: { serverUrl: 'http://127.0.0.1:1/mcp/x', headers: {} }, dispose: () => { served.disposed++; } }; },
	};
	return { run, served };
}
/** agy answering a turn as 1.5.18 does: its init only at a program's first turn. */
async function agyAnswers(child, n, conversation, { init } = {}) {
	await until(() => userMessages(child).length >= n, `message ${n} given`);
	if (init) {
		child.say({ event: 'init', conversation_id: conversation });
	}
	child.say({ event: 'step_update', step_update: { conversation_id: conversation, step_index: n * 10, step_type: 'user_input', state: 'DONE' } });
	child.say({ event: 'step_update', step_update: { conversation_id: conversation, step_index: n * 10 + 1, step_type: 'agent_response', state: 'ACTIVE', text_delta: `agy ${n}` } });
	child.say({ event: 'step_update', step_update: { conversation_id: conversation, step_index: n * 10 + 1, step_type: 'agent_response', state: 'DONE', usage: { input_tokens: 100 * n } } });
	child.say({ event: 'result', result: { conversation_id: conversation, status: 'SUCCESS' } });
}

test('agy kept: its turns in one program and one MCP server, each told its conversation though agy says it once; a call between turns closes it, and its server goes with it', async () => {
	const dir = mkdtempSync(join(tmpdir(), 'agent-bridge-keptagy-'));
	const pool = new KeptProcesses({ idleMs: () => 60_000 });
	const { started, target } = launcher();
	const { run, served } = agyRun(dir);
	const controls = { keepAlive: { pool, conversation: 'conv' }, breezellTools: memoryTool, callBreezellTool: async () => ({ text: 'none' }) };
	const r1 = reply();
	const t1 = agy.runAgyTurn(target, { model: 'gemini-3.8-flash', text: 'one', attachments: [], cwd: '/w' }, r1.reply, token(), p => p, run, undefined, controls);
	await until(() => started.length === 1, 'started');
	await agyAnswers(started[0], 1, 'c1', { init: true });
	assert.deepEqual(await t1, { session: 'c1' });
	assert.equal(started[0].stdinEnded, undefined, 'kept');
	const r2 = reply();
	const t2 = agy.runAgyTurn(target, { model: 'gemini-3.8-flash', text: 'two', attachments: [], cwd: '/w', session: 'c1' }, r2.reply, token(), p => p, run, undefined, controls);
	await agyAnswers(started[0], 2, 'c1');
	assert.deepEqual(await t2, { session: 'c1' });
	assert.equal(started.length, 1, 'one program for both turns');
	assert.equal(served.opened, 1, 'one MCP server for both');
	assert.deepEqual(r2.log.filter(([kind]) => kind === 'session'), [['session', 'c1']], 'told its conversation though agy did not say it again');
	assert.deepEqual(r2.log.filter(([kind]) => kind === 'text'), [['text', 'agy 2']]);
	assert.ok(!started[0].args.includes('--conversation'), 'started on a new conversation; its later turns go on in it');
	assert.equal(served.disposed, 0, 'its server stays while it is kept');
	// agy calling Breezell's tools with no turn under way: no one to answer, and it is closed.
	const answer = await served.answers[0]({ jsonrpc: '2.0', id: 7, method: 'tools/list' });
	assert.match(answer.error.message, /No turn of this conversation/);
	await flush();
	assert.equal(started[0].stdinEnded, true);
	assert.equal(served.disposed >= 1, true, 'its server goes with it');
	assert.equal(pool.size, 0);
	rmSync(dir, { recursive: true, force: true });
});

test('agy kept: closed once idle for the time set; the next turn starts it on its conversation', async t => {
	t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
	const dir = mkdtempSync(join(tmpdir(), 'agent-bridge-keptagy-'));
	const pool = new KeptProcesses({ idleMs: () => 10 * 60_000 });
	const { started, target } = launcher();
	const { run } = agyRun(dir);
	const controls = { keepAlive: { pool, conversation: 'conv' } };
	const t1 = agy.runAgyTurn(target, { model: 'gemini-3.8-flash', text: 'one', attachments: [], cwd: '/w' }, reply().reply, token(), p => p, run, undefined, controls);
	await settled(() => started[0] && userMessages(started[0]).length);
	started[0].say({ event: 'init', conversation_id: 'c1' });
	started[0].say({ event: 'result', result: { conversation_id: 'c1', status: 'SUCCESS' } });
	assert.deepEqual(await t1, { session: 'c1' });
	assert.equal(started[0].stdinEnded, undefined, 'kept');
	t.mock.timers.tick(10 * 60_000);
	await flush();
	assert.equal(started[0].stdinEnded, true, 'closed once idle for the time set');
	const t2 = agy.runAgyTurn(target, { model: 'gemini-3.8-flash', text: 'two', attachments: [], cwd: '/w', session: 'c1' }, reply().reply, token(), p => p, run, undefined, controls);
	await settled(() => started.length === 2);
	assert.deepEqual(started[1].args.slice(started[1].args.indexOf('--conversation'), started[1].args.indexOf('--conversation') + 2), ['--conversation', 'c1']);
	await settled(() => userMessages(started[1]).length);
	started[1].say({ event: 'init', conversation_id: 'c1' });
	started[1].say({ event: 'result', result: { conversation_id: 'c1', status: 'SUCCESS' } });
	assert.deepEqual(await t2, { session: 'c1' });
	await pool.closeAll('test');
	rmSync(dir, { recursive: true, force: true });
});
