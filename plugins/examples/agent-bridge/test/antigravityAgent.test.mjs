// A turn of Antigravity CLI against a fake process: what goes in (its arguments, the rules of the run, the MCP
// server it is given, the message), what comes out of its stream (words as they are written, its tool calls and
// their results, what each model request used, the end), and Breezell's tools as it calls them (asked about on
// their row, run, refused). No real agy runs here; the event shapes are agy 1.5.17's own.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { appendFileSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fakeChild } from './fake-child.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const require = createRequire(import.meta.url);
const esbuild = require('esbuild');
const out = mkdtempSync(join(tmpdir(), 'agent-bridge-agyturn-'));
await esbuild.build({ entryPoints: [join(root, 'src/antigravityAgent.ts')], bundle: true, platform: 'node', format: 'cjs', outfile: join(out, 'agyturn.cjs'), logLevel: 'silent' });
const agy = require(join(out, 'agyturn.cjs'));
test.after(() => rmSync(out, { recursive: true, force: true }));

const schema = { type: 'object', properties: {}, required: [] };
const TOOLS = [
	{ name: 'run_terminal_cmd', inputSchema: schema, shell: 'linux | bash' },
	{ name: 'await', inputSchema: schema },
	{ name: 'edit_file', inputSchema: schema },
	{ name: 'write_to_file', inputSchema: schema },
	{ name: 'memories_recall', inputSchema: schema },
	{ name: 'ask_question', inputSchema: { type: 'object', properties: { questions: { type: 'array' } }, required: ['questions'] } },
	{ name: 'update_plan', inputSchema: schema },
	{ name: 'mcp_github_search', inputSchema: schema, mcpServer: 'github', mcpTool: 'search_issues', description: 'Search issues.' },
];

/**
 * A reply that keeps what it was told (`order`: all of it, in order), and answers approvals as the test says.
 * `told`: a Breezell that takes a thought told after (thinkingStarted).
 */
function recorder(approve = () => true, told = false) {
	const log = { text: [], tools: [], sessions: [], usage: [], approvals: [], order: [] };
	return {
		log,
		reply: {
			text: (t, parent) => { log.text.push(parent ? [t, parent] : t); log.order.push(`text ${t}${parent ? ` <${parent}>` : ''}`); },
			reasoning: (t, parent) => log.order.push(`reasoning ${t}${parent ? ` <${parent}>` : ''}`),
			thinking: tokens => log.order.push(`thinking ${tokens}`),
			...(told ? { thinkingStarted: () => log.order.push('thinkingStarted') } : {}),
			tool: t => { log.tools.push(JSON.parse(JSON.stringify(t))); log.order.push(`tool ${t.id} ${t.status}${t.parent ? ` <${t.parent}>` : ''}`); },
			session: id => log.sessions.push(id),
			usage: u => log.usage.push(u),
			approve: async request => { log.approvals.push(request); return approve(request); },
		},
	};
}

const token = () => {
	const listeners = [];
	return { isCancellationRequested: false, onCancellationRequested(l) { listeners.push(l); return { dispose() { } }; }, cancel() { this.isCancellationRequested = true; listeners.forEach(l => l()); } };
};

/** One turn against a fake agy: the process it starts, the arguments, what Breezell's tools were asked to run. */
function setup({ turn = {}, approve, tools = TOOLS, stallMs, toolPathOf, told, transcripts, thoughtWaitMs, followMs, modelIdOf, liveSteps, liveMs, ownMcpTold } = {}) {
	const dir = mkdtempSync(join(tmpdir(), 'agent-bridge-agyconv-'));
	const folders = { tools: { local: join(dir, 'tools'), agent: join(dir, 'tools') }, attachments: { local: join(dir, 'attachments'), agent: join(dir, 'attachments') } };
	const child = fakeChild();
	const started = [];
	const target = { where: 'native', path: '/home/u/.local/bin/agy', configDir: async () => undefined, ask: async () => ({ code: 0, stdout: '', stderr: '' }), start: (args, cwd) => { started.push({ args, cwd }); return child; } };
	const ran = [];
	const served = { answer: undefined, disposed: false };
	const run = {
		folders,
		model: 'gemini-4-hydrogen-high',
		serve: async answer => { served.answer = answer; return { entry: { serverUrl: 'http://127.0.0.1:1234/mcp/abc', headers: { Authorization: 'Bearer secret' } }, dispose: () => { served.disposed = true; } }; },
		...(transcripts ? { transcriptOf: conversation => transcripts[conversation] } : {}),
		...(thoughtWaitMs !== undefined ? { thoughtWaitMs } : {}),
		...(followMs !== undefined ? { followMs } : {}),
		...(modelIdOf ? { modelIdOf } : {}),
		...(liveSteps ? { liveStepsOf: conversation => liveSteps[conversation] } : {}),
		...(liveMs !== undefined ? { liveMs } : {}),
		...(ownMcpTold ? { ownMcpTold } : {}),
	};
	const controls = {
		breezellTools: tools,
		callBreezellTool: async (name, input, id) => { ran.push([name, input, id]); return name === 'ask_question' ? { text: 'The user answered: Tabs', answers: [{ question_id: 'q1', selected: ['Tabs'] }] } : name === 'memories_recall' ? { text: '2 memories', resultType: 'search', count: 2 } : { text: `${name} done` }; },
		...(stallMs ? { stallMs } : {}),
	};
	const { reply, log } = recorder(approve, told);
	const cancel = token();
	const files = { uriOf: p => `file://${p}`, textOf: async () => undefined, ...(toolPathOf ? { toolPathOf } : {}) };
	const t = { model: 'gemini-4-hydrogen', text: 'Fix the login bug', attachments: [], cwd: '/proj', ...turn };
	const done = agy.runAgyTurn(target, t, reply, cancel, p => p, run, files, controls);
	return { child, started, ran, served, log, cancel, done, folders, dir, config: () => JSON.parse(readFileSync(join(folders.tools.local, '.agents', 'mcp_config.json'), 'utf8')) };
}

const settle = () => new Promise(resolve => setTimeout(resolve, 0));
/** Until agy was started and given its message (the turn writes its folder first). */
const startedOf = async s => { for (let i = 0; i < 500 && !s.child.sent.length; i++) { await new Promise(resolve => setTimeout(resolve, 5)); } assert.ok(s.child.sent.length, 'agy started'); };
const step = (child, s) => child.say({ event: 'step_update', step_update: { conversation_id: 'c1', ...s } });

test('a new conversation: its arguments, the rules of the run, Breezell\'s MCP server in its own folder, and the message', async () => {
	const s = setup({ turn: { rules: 'Indent with tabs.' } });
	await startedOf(s);
	const [{ args, cwd }] = s.started;
	assert.equal(cwd, '/proj');
	assert.deepEqual(args.slice(0, 6), ['--input-format', 'stream-json', '--output-format', 'stream-json', '--print=', '--disable-slash-commands']);
	assert.deepEqual(args.slice(args.indexOf('--add-dir'), args.indexOf('--add-dir') + 2), ['--add-dir', s.folders.tools.agent]);
	assert.deepEqual(args.slice(args.indexOf('--model'), args.indexOf('--model') + 2), ['--model', 'gemini-4-hydrogen-high']);
	assert.ok(!args.includes('--conversation'), 'a new conversation');
	const settings = JSON.parse(args[args.indexOf('--settings') + 1]);
	assert.deepEqual(settings.permissions.deny.slice(0, 2), ['command(*)', 'write_file(*)'], 'its own writing and commands are Breezell\'s');
	assert.ok(settings.permissions.deny.includes(`read_file(${s.folders.tools.agent}/)`), 'its folder of Breezell\'s settings fenced off');
	assert.ok(settings.permissions.allow.includes('mcp(breezell/*)'));

	// the MCP server: in the conversation's own folder, no time limit (an approval may wait), Breezell's main tools loaded at the start
	const server = s.config().mcpServers.breezell;
	assert.deepEqual([server.serverUrl, server.headers, server.timeoutSeconds], ['http://127.0.0.1:1234/mcp/abc', { Authorization: 'Bearer secret' }, -1]);
	assert.deepEqual(Object.keys(server.tools).sort(), ['ask_question', 'await', 'edit_file', 'run_terminal_cmd', 'write_to_file']);
	assert.ok(Object.values(server.tools).every(t => t.eager === true));

	// the message: how it works in Breezell, the user's rules, then what the user wrote
	const [message] = s.child.sent;
	assert.equal(message.event, 'user');
	const content = message.message.content;
	assert.match(content, /^<breezell-session>\n/);
	assert.match(content, /run shell commands with the breezell tool run_terminal_cmd/);
	assert.match(content, new RegExp(`The folder ${s.folders.tools.agent.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} only holds Breezell's connection settings`));
	assert.match(content, /<breezell-rules>\nThe user set these rules in Breezell[^]*Indent with tabs\.\n<\/breezell-rules>/);
	assert.match(content, /Fix the login bug$/);

	// its stream: the session, its words as they come, its own reads as Breezell's, its own writes and commands never shown
	s.child.say({ event: 'init', conversation_id: 'c1', init: { cwd: '/proj', tools: ['view_file'], permission_mode: 'request-review' } });
	step(s.child, { step_index: 0, state: 'DONE', step_type: 'user_input' });
	step(s.child, { step_index: 1, state: 'ACTIVE', step_type: 'agent_response', text_delta: 'Looking at ' });
	step(s.child, { step_index: 1, state: 'ACTIVE', step_type: 'agent_response', text_delta: 'the code.' });
	step(s.child, { step_index: 1, state: 'DONE', step_type: 'agent_response', duration_seconds: 2.9, usage: { input_tokens: 12101, output_tokens: 91, thinking_tokens: 43, cache_read_tokens: 0, total_tokens: 12192 } });
	step(s.child, { step_index: 2, state: 'ACTIVE', step_type: 'tool', tool_name: 'read_file', tool_info: { name: 'read_file', parameters: { Path: '/proj/login.ts' } } });
	step(s.child, { step_index: 2, state: 'DONE', step_type: 'tool', tool_name: 'read_file', tool_info: { name: 'read_file', parameters: { Path: '/proj/login.ts' }, output: 'export const login = 1;' } });
	step(s.child, { step_index: 3, state: 'DONE', step_type: 'tool', tool_name: 'run_command', tool_info: { name: 'run_command', parameters: { CommandLine: 'ls' }, error: { type: 'TOOL_ERROR', message: 'Matches user-configured deny rule.' } } });
	step(s.child, { step_index: 4, state: 'DONE', step_type: 'agent_response', text_delta: 'Done.\n', usage: { input_tokens: 2182, output_tokens: 253, thinking_tokens: 166, cache_read_tokens: 11205, total_tokens: 2435 } });
	s.child.say({ event: 'result', result: { conversation_id: 'c1', status: 'SUCCESS', response: 'Done.\n', num_turns: 1 } });
	await settle();
	assert.ok(s.child.stdinEnded, 'the turn told, its input closes');
	s.child.end(0);
	assert.deepEqual(await s.done, { session: 'c1' });
	assert.deepEqual(s.log.sessions, ['c1']);
	assert.deepEqual(s.log.text, ['Looking at ', 'the code.', 'Done.\n']);
	assert.deepEqual(s.log.tools.map(t => [t.id, t.name, t.status, t.view?.kind, t.view?.uri, t.output]), [
		['c1:2', 'read_file', 'running', 'read', 'file:///proj/login.ts', undefined],
		['c1:2', 'read_file', 'done', 'read', 'file:///proj/login.ts', 'export const login = 1;'],
	], 'its refused command never shows');
	assert.deepEqual(s.log.usage, [
		{ context: { tokens: 12101 }, models: [{ model: 'gemini-4-hydrogen-high', inputTokens: 12101, outputTokens: 91, cacheReadTokens: 0, cacheWriteTokens: 0 }] },
		{ context: { tokens: 13387 }, models: [{ model: 'gemini-4-hydrogen-high', inputTokens: 2182, outputTokens: 253, cacheReadTokens: 11205, cacheWriteTokens: 0 }] },
	]);
	assert.ok(s.served.disposed, 'its MCP server closes with the turn');
	rmSync(s.dir, { recursive: true, force: true });
});

test('Breezell\'s tools as agy calls them: an edit asked about on its row then run, a refused one not run, a lookup and a question run without asking', async () => {
	const s = setup({ approve: request => request.input.uri !== '/proj/no.ts' });
	await startedOf(s);
	s.child.say({ event: 'init', conversation_id: 'c1', init: {} });
	const call = (id, name, args, stepIndex) => s.served.answer({ jsonrpc: '2.0', id, method: 'tools/call', params: { _meta: { 'antigravity.google/conversation_id': 'c1', progressToken: `0095fa79:${stepIndex}` }, name, arguments: args } });
	const listed = await s.served.answer({ jsonrpc: '2.0', id: 1, method: 'tools/list' });
	assert.deepEqual(listed.result.tools.map(t => t.name), ['run_terminal_cmd', 'await', 'edit_file', 'write_to_file', 'memories_recall', 'github__search_issues', 'ask_question']);
	assert.match(listed.result.tools[0].description, /Commands run in: linux \| bash\.$/);

	// the stream tells the call as it starts; the approval card goes with that row
	step(s.child, { step_index: 5, state: 'ACTIVE', step_type: 'tool', tool_name: 'mcp_breezell_edit_file', tool_info: { name: 'mcp_breezell_edit_file', parameters: { uri: '/proj/login.ts', old_string: 'a', new_string: 'b' } } });
	const edited = await call(2, 'edit_file', { uri: '/proj/login.ts', old_string: 'a', new_string: 'b' }, 5);
	assert.deepEqual(edited.result, { content: [{ type: 'text', text: 'edit_file done' }] });
	assert.deepEqual(s.log.approvals.map(a => [a.toolId, a.name, a.kind, a.view?.kind, a.view?.uri, a.title]), [['c1:5', 'mcp_breezell_edit_file', 'edit', 'edit', 'file:///proj/login.ts', '/proj/login.ts']]);
	assert.deepEqual(s.ran[0], ['edit_file', { uri: '/proj/login.ts', old_string: 'a', new_string: 'b' }, 'c1:5'], 'run with its row\'s id');

	const refused = await call(3, 'write_to_file', { uri: '/proj/no.ts', content: 'x' }, 6);
	assert.deepEqual(refused.result, { content: [{ type: 'text', text: 'The user did not allow this in Breezell.' }], isError: true });
	assert.equal(s.ran.length, 1, 'refused: not run');
	assert.deepEqual(s.log.tools.find(t => t.id === 'c1:6')?.status, 'running', 'told first, so its card has a row');

	await call(4, 'memories_recall', { query: 'login' }, 7);
	await call(5, 'ask_question', { questions: [{ id: 'q1', question: 'Tabs or spaces?', options: [{ id: 'a', label: 'Tabs' }, { id: 'b', label: 'Spaces' }], allow_multiple: false }] }, 8);
	const mcp = await call(6, 'github__search_issues', { q: 'bug' }, 9);
	assert.deepEqual(s.ran.slice(1).map(r => [r[0], r[2]]), [['memories_recall', 'c1:7'], ['ask_question', 'c1:8'], ['mcp_github_search', 'c1:9']]);
	assert.equal(mcp.result.content[0].text, 'mcp_github_search done');
	assert.deepEqual(s.log.approvals.slice(1).map(a => [a.toolId, a.kind, a.view]), [['c1:6', 'edit', { kind: 'create', path: '/proj/no.ts', uri: 'file:///proj/no.ts', content: 'x' }], ['c1:9', 'other', { kind: 'mcp', server: 'github', tool: 'search_issues' }]], 'a lookup and a question are not asked about');

	// the lookup's row says how many it found, as the call returned them
	step(s.child, { step_index: 7, state: 'DONE', step_type: 'tool', tool_name: 'mcp_breezell_memories_recall', tool_info: { name: 'mcp_breezell_memories_recall', parameters: { query: 'login' }, output: '2 memories' } });
	await settle();
	assert.deepEqual(s.log.tools.at(-1).view, { kind: 'memories', query: 'login', resultType: 'search', count: 2 });
	s.child.say({ event: 'result', result: { conversation_id: 'c1', status: 'SUCCESS' } });
	s.child.end(0);
	await s.done;
	rmSync(s.dir, { recursive: true, force: true });
});

test('Plan mode: the plan goes to Breezell\'s plan card, and the message says to plan and change nothing', async () => {
	const s = setup({ turn: { mode: 'plan' }, tools: TOOLS.filter(t => !['run_terminal_cmd', 'edit_file', 'write_to_file', 'await'].includes(t.name)) });
	await startedOf(s);
	assert.match(s.child.sent[0].message.content, /Breezell is in Plan mode for this message[^]*update_plan/);
	const listed = await s.served.answer({ jsonrpc: '2.0', id: 1, method: 'tools/list' });
	assert.ok(listed.result.tools.some(t => t.name === 'update_plan'));
	assert.ok(s.config().mcpServers.breezell.tools.update_plan.eager);
	const shown = await s.served.answer({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'update_plan', arguments: { markdown: '# Fix login\n\n1. Read the code\n2. Change the check' } } });
	assert.match(shown.result.content[0].text, /^Breezell shows your plan to the user as a plan card/);
	assert.deepEqual(s.ran, [['update_plan', { title: 'Fix login', markdown: '# Fix login\n\n1. Read the code\n2. Change the check', plan: [{ step: 'Read the code' }, { step: 'Change the check' }] }, undefined]]);
	s.child.say({ event: 'result', result: { status: 'SUCCESS' } });
	s.child.end(0);
	await s.done;
	rmSync(s.dir, { recursive: true, force: true });
});

test('going on in its conversation: --conversation, no session note again, changed rules told once', async () => {
	const s = setup({ turn: { session: 'c1', rules: 'Use spaces now.' } });
	await startedOf(s);
	const args = s.started[0].args;
	assert.deepEqual(args.slice(args.indexOf('--conversation'), args.indexOf('--conversation') + 2), ['--conversation', 'c1']);
	const content = s.child.sent[0].message.content;
	assert.doesNotMatch(content, /<breezell-session>/);
	assert.match(content, /The user changed their rules in Breezell[^]*Use spaces now\./);
	s.child.say({ event: 'result', result: { conversation_id: 'c1', status: 'SUCCESS' } });
	s.child.end(0);
	assert.deepEqual(await s.done, { session: 'c1' });
	rmSync(s.dir, { recursive: true, force: true });
});

test('a model error is one Breezell sends on; stopping is no error; a run that goes silent stops as stalled', async () => {
	const failed = setup();
	await startedOf(failed);
	failed.child.say({ event: 'init', conversation_id: 'c2', init: {} });
	failed.child.say({ event: 'result', result: { conversation_id: 'c2', status: 'ERROR', error: 'RESOURCE_EXHAUSTED: quota exceeded for model', finished_reason: 'error' } });
	failed.child.end(3);
	assert.deepEqual(await failed.done, { session: 'c2', error: 'RESOURCE_EXHAUSTED: quota exceeded for model', apiError: 'rate_limit' });

	const stopped = setup();
	await startedOf(stopped);
	const signals = [];
	stopped.child.kill = signal => { signals.push(signal); };
	stopped.child.say({ event: 'init', conversation_id: 'c3', init: {} });
	stopped.cancel.cancel();
	assert.deepEqual(signals, ['SIGINT'], 'asked to stop as Ctrl+C asks it');
	stopped.child.say({ event: 'result', result: { conversation_id: 'c3', status: 'INTERRUPTED' } });
	stopped.child.end(130);
	assert.deepEqual(await stopped.done, { session: 'c3' });

	const silent = setup({ stallMs: 40 });
	await startedOf(silent);
	silent.child.kill = () => { silent.child.end(1); };
	assert.deepEqual(await silent.done, { error: 'No answer from the model for 0 s.', apiError: 'stalled' });

	const broken = setup();
	await startedOf(broken);
	broken.child.stderr.write('error: failed to decode stream input: unexpected EOF\n');
	broken.child.end(1);
	assert.deepEqual(await broken.done, { error: 'Antigravity CLI exited with code 1: error: failed to decode stream input: unexpected EOF', apiError: 'unknown' });
	for (const each of [failed, stopped, silent, broken]) {
		rmSync(each.dir, { recursive: true, force: true });
	}
});

test('a picture attached in Breezell: saved where agy may read it, and named in the message as a file', async () => {
	const s = setup({ turn: { attachments: [{ name: 'screen shot.png', kind: 'image', data: { mimeType: 'image/png', base64: Buffer.from('png!').toString('base64') } }, { name: 'notes.md', kind: 'file', path: '/elsewhere/notes.md' }] } });
	await startedOf(s);
	const saved = join(s.folders.attachments.local, '1-screen_shot.png');
	assert.ok(existsSync(saved));
	assert.equal(readFileSync(saved, 'utf8'), 'png!');
	const content = s.child.sent[0].message.content;
	assert.match(content, new RegExp(`- File: ${saved.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`));
	assert.match(content, /- File: \/elsewhere\/notes\.md/);
	const settings = JSON.parse(s.started[0].args[s.started[0].args.indexOf('--settings') + 1]);
	assert.ok(settings.permissions.allow.includes(`read_file(${s.folders.attachments.agent}/)`));
	assert.ok(settings.permissions.allow.includes('read_file(/elsewhere/notes.md)'), 'a file attached from outside the project: readable');
	s.child.say({ event: 'result', result: { status: 'SUCCESS' } });
	s.child.end(0);
	await s.done;
	rmSync(s.dir, { recursive: true, force: true });
});

test('an agy in WSL on a folder of this computer: Breezell\'s tools get the file as this computer names it', async () => {
	const s = setup({ toolPathOf: p => p.startsWith('/mnt/c/') ? `C:\\${p.slice(7).replace(/\//g, '\\')}` : undefined });
	await startedOf(s);
	await s.served.answer({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'edit_file', arguments: { uri: '/mnt/c/proj/login.ts', old_string: 'a', new_string: 'b' } } });
	assert.deepEqual(s.ran[0][1], { uri: 'C:\\proj\\login.ts', old_string: 'a', new_string: 'b' });
	assert.equal(s.log.approvals[0].view.path, '/mnt/c/proj/login.ts', 'its row and card show the agent\'s own name of it');
	s.child.say({ event: 'result', result: { status: 'SUCCESS' } });
	s.child.end(0);
	await s.done;
	rmSync(s.dir, { recursive: true, force: true });
});

test('a call\'s id as its stream names its step; model errors by their words', () => {
	assert.equal(agy.agyCallIdOf({ _meta: { 'antigravity.google/conversation_id': 'c1', progressToken: '0095fa79-d144:4' } }), 'c1:4');
	assert.equal(agy.agyCallIdOf({ _meta: { progressToken: 'x:4' } }), undefined);
	assert.equal(agy.agyCallIdOf(undefined), undefined);
	assert.equal(agy.agyApiErrorOf('429 Too Many Requests'), 'rate_limit');
	assert.equal(agy.agyApiErrorOf('the model is overloaded, try again later'), 'overloaded');
	assert.equal(agy.agyApiErrorOf('connection reset by peer'), 'unknown');
	assert.equal(agy.agyApiErrorOf('stream input message is missing the "event" field'), undefined);
});

const transcriptLine = step => `${JSON.stringify(step)}\n`;
const later = ms => new Promise(resolve => setTimeout(resolve, ms));

test('its model\'s thoughts, where Breezell takes them told after: "Thinking" from each of its requests, the size before its calls, the text as agy writes it down', async () => {
	const dir = mkdtempSync(join(tmpdir(), 'agent-bridge-agytranscript-'));
	const file = join(dir, 'transcript_full.jsonl');
	// What the conversation's earlier turns left there is not this turn's.
	writeFileSync(file, transcriptLine({ step_index: 11, type: 'PLANNER_RESPONSE', status: 'DONE', thinking: 'An old thought.', content: '' }));
	const s = setup({ told: true, transcripts: { c1: file } });
	await startedOf(s);
	s.child.say({ event: 'init', conversation_id: 'c1', init: {} });
	await settle();
	step(s.child, { step_index: 10, state: 'DONE', step_type: 'user_input' });
	// A request that calls a tool: its size once it is done; its call waits for its text, written down a moment after.
	step(s.child, { step_index: 11, state: 'DONE', step_type: 'agent_response', usage: { input_tokens: 100, output_tokens: 50, thinking_tokens: 40 } });
	step(s.child, { step_index: 12, state: 'ACTIVE', step_type: 'tool', tool_name: 'read_file', tool_info: { name: 'read_file', parameters: { Path: '/proj/a.ts' } } });
	step(s.child, { step_index: 12, state: 'DONE', step_type: 'tool', tool_name: 'read_file', tool_info: { name: 'read_file', parameters: { Path: '/proj/a.ts' }, output: 'x' } });
	await later(80);
	assert.deepEqual(s.log.order, ['thinkingStarted', 'thinking 40'], 'its call waits for its thought');
	appendFileSync(file, transcriptLine({ step_index: 11, type: 'PLANNER_RESPONSE', status: 'DONE', thinking: '**Reading**\n\nThe file first.\n\n', content: '' }) + transcriptLine({ step_index: 12, type: 'GENERIC', status: 'DONE', content: 'x' }));
	// Its answer: its words, then its thought once the step is written down (in two writes, cut inside a character).
	step(s.child, { step_index: 13, state: 'ACTIVE', step_type: 'agent_response', text_delta: 'Done.' });
	step(s.child, { step_index: 13, state: 'DONE', step_type: 'agent_response', text_delta: '\n', usage: { input_tokens: 120, output_tokens: 30, thinking_tokens: 20 } });
	const last = Buffer.from(transcriptLine({ step_index: 13, type: 'PLANNER_RESPONSE', status: 'DONE', thinking: '數一數。', content: 'Done.\n' }));
	const cut = last.indexOf(Buffer.from('數')) + 1;
	await later(50);
	appendFileSync(file, last.subarray(0, cut));
	await later(60);
	appendFileSync(file, last.subarray(cut));
	s.child.say({ event: 'result', result: { conversation_id: 'c1', status: 'SUCCESS' } });
	s.child.end(0);
	assert.deepEqual(await s.done, { session: 'c1' });
	assert.deepEqual(s.log.order, [
		'thinkingStarted', 'thinking 40', 'reasoning **Reading**\n\nThe file first.',
		'tool c1:12 running', 'tool c1:12 done', 'thinkingStarted',
		'text Done.', 'text \n', 'reasoning 數一數。',
	]);
	rmSync(dir, { recursive: true, force: true });
	rmSync(s.dir, { recursive: true, force: true });
});

/** agy's record of a conversation as the turn reads it: its model steps as the test writes them, what was asked. */
function fakeRecord() {
	const record = { steps: new Map(), reads: [], disposed: false };
	record.read = async from => { record.reads.push(from); return new Map([...record.steps].filter(([index]) => index >= from)); };
	record.dispose = () => { record.disposed = true; };
	record.write = (index, thinking, text = '') => record.steps.set(index, { thinking, text });
	return record;
}

test('its model\'s thoughts as they are written (agy\'s record of the conversation): told as they grow, the transcript only the rest; not while a call runs; its words wait for what is written', async () => {
	const dir = mkdtempSync(join(tmpdir(), 'agent-bridge-agytranscript-'));
	const file = join(dir, 'transcript_full.jsonl');
	writeFileSync(file, '');
	const record = fakeRecord();
	// A step of the conversation's earlier turns: not this turn's.
	record.write(9, 'An old thought.');
	const s = setup({ told: true, transcripts: { c1: file }, liveSteps: { c1: record }, liveMs: 5 });
	await startedOf(s);
	s.child.say({ event: 'init', conversation_id: 'c1', init: {} });
	step(s.child, { step_index: 10, state: 'ACTIVE', step_type: 'user_input' });
	step(s.child, { step_index: 10, state: 'DONE', step_type: 'user_input' });
	await later(30);
	assert.ok(record.reads.length && record.reads.every(from => from === 11), 'only the steps after its message');
	record.write(11, '  **Reading**\n');
	await later(30);
	record.write(11, '  **Reading**\n\nThe file first.');
	await later(30);
	assert.deepEqual(s.log.order, ['thinkingStarted', 'reasoning **Reading**', 'reasoning \n\nThe file first.']);
	// Done: its transcript line says all of it; only what was not shown yet is told.
	appendFileSync(file, transcriptLine({ step_index: 11, type: 'PLANNER_RESPONSE', status: 'DONE', thinking: '**Reading**\n\nThe file first. Then b.ts.\n', content: '' }));
	step(s.child, { step_index: 11, state: 'DONE', step_type: 'agent_response', usage: { input_tokens: 100, output_tokens: 50, thinking_tokens: 40 } });
	step(s.child, { step_index: 12, state: 'ACTIVE', step_type: 'tool', tool_name: 'read_file', tool_info: { name: 'read_file', parameters: { Path: '/proj/a.ts' } } });
	await later(30);
	// Its call runs: not read meanwhile.
	const readsBefore = record.reads.length;
	await later(40);
	assert.equal(record.reads.length, readsBefore, 'not read while its call runs');
	step(s.child, { step_index: 12, state: 'DONE', step_type: 'tool', tool_name: 'read_file', tool_info: { name: 'read_file', parameters: { Path: '/proj/a.ts' }, output: 'x' } });
	await later(30);
	// Its words come at once: what is written of its thought is told before them.
	record.write(13, 'Counting');
	step(s.child, { step_index: 13, state: 'ACTIVE', step_type: 'agent_response', text_delta: 'Done.' });
	// Written down other than it was shown: not told again.
	appendFileSync(file, transcriptLine({ step_index: 13, type: 'PLANNER_RESPONSE', status: 'DONE', thinking: 'Count up.', content: 'Done.' }));
	step(s.child, { step_index: 13, state: 'DONE', step_type: 'agent_response', usage: { input_tokens: 120, output_tokens: 30, thinking_tokens: 20 } });
	s.child.say({ event: 'result', result: { conversation_id: 'c1', status: 'SUCCESS' } });
	s.child.end(0);
	assert.deepEqual(await s.done, { session: 'c1' });
	assert.deepEqual(s.log.order, [
		'thinkingStarted', 'reasoning **Reading**', 'reasoning \n\nThe file first.',
		'thinking 40', 'reasoning  Then b.ts.',
		'tool c1:12 running', 'tool c1:12 done', 'thinkingStarted',
		'reasoning Counting', 'text Done.',
	]);
	assert.ok(record.disposed, 'let go once the turn is over');
	rmSync(dir, { recursive: true, force: true });
	rmSync(s.dir, { recursive: true, force: true });
});

test('a step whose words were written with it (no thought apart from them): not told as a thought; a Breezell without "Thinking" told after: its record is not read', async () => {
	const record = fakeRecord();
	const s = setup({ told: true, liveSteps: { c1: record }, liveMs: 5 });
	await startedOf(s);
	s.child.say({ event: 'init', conversation_id: 'c1', init: {} });
	step(s.child, { step_index: 0, state: 'DONE', step_type: 'user_input' });
	record.write(1, '12:15', '12:15');
	await later(30);
	step(s.child, { step_index: 1, state: 'DONE', step_type: 'agent_response', text_delta: '12:15', usage: { input_tokens: 9, output_tokens: 5, thinking_tokens: 0 } });
	s.child.say({ event: 'result', result: { conversation_id: 'c1', status: 'SUCCESS' } });
	s.child.end(0);
	await s.done;
	assert.deepEqual(s.log.order, ['thinkingStarted', 'text 12:15']);
	rmSync(s.dir, { recursive: true, force: true });

	const unread = fakeRecord();
	const old = setup({ liveSteps: { c1: unread }, liveMs: 5 });
	await startedOf(old);
	old.child.say({ event: 'init', conversation_id: 'c1', init: {} });
	step(old.child, { step_index: 0, state: 'DONE', step_type: 'user_input' });
	unread.write(1, 'Thinking.');
	await later(30);
	old.child.say({ event: 'result', result: { conversation_id: 'c1', status: 'SUCCESS' } });
	old.child.end(0);
	await old.done;
	assert.deepEqual(unread.reads, []);
	assert.deepEqual(old.log.order, []);
	rmSync(old.dir, { recursive: true, force: true });
});

/** What each session was told of agy's own MCP servers, kept as the bridge keeps it. */
const toldStore = (start = {}) => {
	const told = new Map(Object.entries(start));
	return { told, get: session => told.get(session), set: (session, on) => told.set(session, on) };
};
const settingsOf = s => JSON.parse(s.started[0].args[s.started[0].args.indexOf('--settings') + 1]);
const OFF = 'Your own MCP servers (all but breezell) are turned off in this conversation';
const ON = 'Your own MCP servers are turned on in this conversation now';

test('agy\'s own MCP servers run only while the user auto-approves MCP tools: allowed then; otherwise refused, and its model told so when its session starts', async () => {
	for (const [autoApprove, allowed] of [[undefined, false], [{ mcp: false }, false], [{ mcp: true }, true]]) {
		const told = toldStore();
		const s = setup({ turn: autoApprove ? { autoApprove } : {}, ownMcpTold: told });
		await startedOf(s);
		const { allow } = settingsOf(s).permissions;
		assert.equal(allow.includes('mcp(*)'), allowed, `allowed: ${JSON.stringify(autoApprove)}`);
		assert.ok(allow.includes('mcp(breezell/*)'), 'Breezell\'s always');
		assert.equal(s.child.sent[0].message.content.includes(OFF), !allowed);
		s.child.say({ event: 'init', conversation_id: 'c1', init: {} });
		s.child.say({ event: 'result', result: { conversation_id: 'c1', status: 'SUCCESS' } });
		s.child.end(0);
		await s.done;
		assert.equal(told.told.get('c1'), allowed, 'what its session was told, kept');
		rmSync(s.dir, { recursive: true, force: true });
	}
});

test('a session going on: told of agy\'s own MCP servers only when that changed since it was last told (one told nothing had them on)', async () => {
	const cases = [
		{ told: { c1: false }, mcp: true, notice: ON },
		{ told: { c1: true }, mcp: false, notice: OFF },
		{ told: { c1: true }, mcp: true, notice: undefined },
		{ told: { c1: false }, mcp: false, notice: undefined },
		{ told: {}, mcp: false, notice: OFF },
		{ told: {}, mcp: true, notice: undefined },
	];
	for (const c of cases) {
		const told = toldStore(c.told);
		const s = setup({ turn: { session: 'c1', autoApprove: { mcp: c.mcp } }, ownMcpTold: told });
		await startedOf(s);
		const content = s.child.sent[0].message.content;
		const label = JSON.stringify(c);
		if (c.notice) {
			assert.match(content, /<breezell-notices>[^]*From Breezell, not from the user/, label);
			assert.ok(content.includes(c.notice), label);
		} else {
			assert.ok(!content.includes(ON) && !content.includes(OFF), label);
		}
		s.child.say({ event: 'init', conversation_id: 'c1', init: {} });
		s.child.say({ event: 'result', result: { conversation_id: 'c1', status: 'SUCCESS' } });
		s.child.end(0);
		await s.done;
		assert.equal(told.told.get('c1'), c.mcp, label);
		rmSync(s.dir, { recursive: true, force: true });
	}
});

test('a Breezell that does not take a thought told after: none of it, and agy\'s transcript is not read', async () => {
	const dir = mkdtempSync(join(tmpdir(), 'agent-bridge-agytranscript-'));
	const file = join(dir, 'transcript_full.jsonl');
	writeFileSync(file, transcriptLine({ step_index: 1, type: 'PLANNER_RESPONSE', status: 'DONE', thinking: 'Counting.', content: 'Done.' }));
	const s = setup({ transcripts: { c1: file } });
	await startedOf(s);
	s.child.say({ event: 'init', conversation_id: 'c1', init: {} });
	step(s.child, { step_index: 0, state: 'DONE', step_type: 'user_input' });
	step(s.child, { step_index: 1, state: 'DONE', step_type: 'agent_response', text_delta: 'Done.', usage: { input_tokens: 9, output_tokens: 9, thinking_tokens: 30 } });
	s.child.say({ event: 'result', result: { conversation_id: 'c1', status: 'SUCCESS' } });
	s.child.end(0);
	await s.done;
	assert.deepEqual(s.log.order, ['text Done.']);
	rmSync(dir, { recursive: true, force: true });
	rmSync(s.dir, { recursive: true, force: true });
});

test('no thought: a request its model did not think in, nothing waited for; a transcript that never comes, waited for once', async () => {
	const dir = mkdtempSync(join(tmpdir(), 'agent-bridge-agytranscript-'));
	const s = setup({ told: true, transcripts: { c1: join(dir, 'never.jsonl') }, thoughtWaitMs: 40 });
	await startedOf(s);
	s.child.say({ event: 'init', conversation_id: 'c1', init: {} });
	step(s.child, { step_index: 0, state: 'DONE', step_type: 'user_input' });
	// No thinking tokens (agy then writes its words as its thought): no thought.
	step(s.child, { step_index: 1, state: 'ACTIVE', step_type: 'agent_response', text_delta: '12:15' });
	step(s.child, { step_index: 1, state: 'DONE', step_type: 'agent_response', usage: { input_tokens: 9, output_tokens: 5, thinking_tokens: 0 } });
	step(s.child, { step_index: 2, state: 'DONE', step_type: 'tool', tool_name: 'read_file', tool_info: { name: 'read_file', parameters: { Path: '/proj/a.ts' }, output: 'x' } });
	// Thinking tokens, and no line comes: waited for once; the next step's not at all.
	step(s.child, { step_index: 3, state: 'DONE', step_type: 'agent_response', usage: { input_tokens: 9, output_tokens: 5, thinking_tokens: 25 } });
	step(s.child, { step_index: 4, state: 'DONE', step_type: 'tool', tool_name: 'read_file', tool_info: { name: 'read_file', parameters: { Path: '/proj/b.ts' }, output: 'y' } });
	step(s.child, { step_index: 5, state: 'DONE', step_type: 'agent_response', text_delta: 'Done.', usage: { input_tokens: 9, output_tokens: 5, thinking_tokens: 25 } });
	const sent = Date.now();
	s.child.say({ event: 'result', result: { conversation_id: 'c1', status: 'SUCCESS' } });
	s.child.end(0);
	await s.done;
	assert.ok(Date.now() - sent < 1000);
	assert.deepEqual(s.log.order, [
		'thinkingStarted', 'text 12:15', 'tool c1:2 done',
		'thinkingStarted', 'thinking 25', 'tool c1:4 done',
		'thinkingStarted', 'text Done.',
	]);
	rmSync(dir, { recursive: true, force: true });
	rmSync(s.dir, { recursive: true, force: true });
});

test('where agy writes a conversation down, and what of a step is a thought', () => {
	const id = 'bb58808c-39b0-4a7c-b705-3a5ded5115c4';
	assert.equal(agy.agyTranscriptPath('/home/u/.gemini/antigravity-cli', id), `/home/u/.gemini/antigravity-cli/brain/${id}/.system_generated/logs/transcript_full.jsonl`);
	assert.equal(agy.agyTranscriptPath('\\\\wsl$\\Ubuntu\\home\\u\\.gemini\\antigravity-cli', id), `\\\\wsl$\\Ubuntu\\home\\u\\.gemini\\antigravity-cli\\brain\\${id}\\.system_generated\\logs\\transcript_full.jsonl`);
	assert.equal(agy.agyTranscriptPath('C:\\Users\\u\\.gemini\\antigravity-cli', id), `C:\\Users\\u\\.gemini\\antigravity-cli\\brain\\${id}\\.system_generated\\logs\\transcript_full.jsonl`);
	for (const bad of ['../../etc/passwd', '', 'a b c d e f', '.hidden-name']) {
		assert.equal(agy.agyTranscriptPath('/h', bad), undefined, bad);
	}
	assert.equal(agy.agyThoughtOf({ thinking: 'Counting.\n\n', content: 'x' }, 30), 'Counting.');
	assert.equal(agy.agyThoughtOf({ thinking: '12:15', content: '12:15' }, 0), undefined, 'no thinking tokens: no thought');
	assert.equal(agy.agyThoughtOf({ thinking: '12:15', content: '12:15' }, 5), undefined, 'its words again: no thought');
	assert.equal(agy.agyThoughtOf({ thinking: ' \n ', content: '' }, 5), undefined);
	assert.equal(agy.agyThoughtOf(undefined, 5), undefined);
});

test('agy\'s transcript as it grows: whole lines only, its model\'s steps only, a file written anew read from its start', async () => {
	const dir = mkdtempSync(join(tmpdir(), 'agent-bridge-agytranscript-'));
	const file = join(dir, 't.jsonl');
	const t = new agy.AgyTranscript(file);
	await t.read();
	assert.equal(t.stepOf(1), undefined, 'not there yet: nothing');
	writeFileSync(file, `${transcriptLine({ step_index: 1, type: 'PLANNER_RESPONSE', thinking: 'A', content: '' })}{"step_index":2,"type":"PLANNER_RES`);
	await t.read();
	assert.deepEqual(t.stepOf(1), { thinking: 'A', content: '' });
	assert.equal(t.stepOf(2), undefined, 'half a line waits for its end');
	appendFileSync(file, 'PONSE","thinking":"B"}\n{"step_index":3,"type":"GENERIC","content":"PLANNER_RESPONSE"}\nnot json PLANNER_RESPONSE\n');
	await t.read();
	assert.deepEqual(t.stepOf(2), { thinking: 'B' });
	assert.equal(t.stepOf(3), undefined, 'not a model step');
	writeFileSync(file, transcriptLine({ step_index: 9, type: 'PLANNER_RESPONSE', thinking: 'C' }));
	await t.read();
	assert.deepEqual(t.stepOf(9), { thinking: 'C' }, 'written anew: read from its start');
	rmSync(dir, { recursive: true, force: true });
});

// What agy 1.5.17 wrote for a subagent: its call on the lead's stream (it returns at once), the subagent's own steps
// only in its transcript, its report a message to the lead.
const SUBAGENT = { type_name: 'research', role: 'Document Reader', initial_prompt: 'Read notes.txt and report how many plums there are.' };

test('its subagents as Breezell\'s: a row of each working in the background, its page following its transcript, its report what it sent the lead', async () => {
	const dir = mkdtempSync(join(tmpdir(), 'agent-bridge-agysub-'));
	const file = join(dir, 'sub.jsonl');
	const s = setup({ told: true, transcripts: { 'sub-1': file }, followMs: 15, modelIdOf: id => id.replace(/-(low|medium|high)$/, '') });
	await startedOf(s);
	s.child.say({ event: 'init', conversation_id: 'c1', init: {} });
	step(s.child, { step_index: 0, state: 'DONE', step_type: 'user_input' });
	step(s.child, { step_index: 2, state: 'ACTIVE', step_type: 'subagent', tool_name: 'invoke_subagent', subagent_info: { subagents: [SUBAGENT] } });
	step(s.child, { step_index: 2, state: 'DONE', step_type: 'subagent', tool_name: 'invoke_subagent', duration_seconds: 0.06, subagent_info: { subagents: [{ ...SUBAGENT, conversation_id: 'sub-1', log_uri: 'file:///home/u/.gemini/antigravity-cli/brain/sub-1/.system_generated/logs/transcript.jsonl' }] } });
	writeFileSync(file, [
		{ step_index: 0, source: 'SYSTEM', type: 'SYSTEM_MESSAGE', status: 'DONE', content: '<SYSTEM_MESSAGE>\n[Message] sender=c1 content=Read notes.txt and report how many plums there are.\n</SYSTEM_MESSAGE>' },
		{ step_index: 1, source: 'MODEL', type: 'PLANNER_RESPONSE', status: 'DONE', model: 'gemini-3.8-flash-medium', input_tokens: 4693, cache_read_tokens: 0, output_tokens: 254, tool_calls: [{ name: 'read_file', args: { Path: '/proj/notes.txt' } }] },
	].map(transcriptLine).join(''));
	await later(80);
	// A call of Breezell's it makes: asked about on its page.
	const edit = s.served.answer({ jsonrpc: '2.0', id: 9, method: 'tools/call', params: { _meta: { 'antigravity.google/conversation_id': 'sub-1', progressToken: 'x:9' }, name: 'edit_file', arguments: { uri: '/proj/notes.txt', old_string: '11', new_string: '12' } } });
	assert.deepEqual((await edit).result.content[0].text, 'edit_file done');
	appendFileSync(file, [
		{ step_index: 2, source: 'MODEL', type: 'GENERIC', status: 'DONE', content: 'Created At: 2026-11-25T04:08:37-08:00\nCompleted At: 2026-11-25T04:08:37-08:00\nCreated At: 2026-11-25T04:08:37-08:00\nCompleted At: 2026-11-25T04:08:37-08:00\nShowing lines 1-4 of 4\n4: - plums: 11' },
		{ step_index: 3, source: 'MODEL', type: 'PLANNER_RESPONSE', status: 'DONE', model: 'gemini-3.8-flash-medium', input_tokens: 2393, cache_read_tokens: 2666, output_tokens: 304, thinking: 'Plums are 11.\n\n\n', tool_calls: [{ name: 'send_message', args: { Message: 'There are 11 plums.', Recipient: 'c1' } }] },
		{ step_index: 4, source: 'MODEL', type: 'GENERIC', status: 'DONE', content: 'Created At: 2026-11-25T04:08:42-08:00\nMessage sent to "c1".' },
		{ step_index: 5, source: 'MODEL', type: 'PLANNER_RESPONSE', status: 'DONE', model: 'gemini-3.8-flash-medium', input_tokens: 2435, cache_read_tokens: 3039, output_tokens: 34, content: 'I reported back.' },
	].map(transcriptLine).join(''));
	await later(80);
	// Its report reaches the lead, which goes on.
	step(s.child, { step_index: 3, state: 'DONE', step_type: 'system_message' });
	step(s.child, { step_index: 4, state: 'DONE', step_type: 'agent_response', text_delta: 'There are 11 plums.', usage: { input_tokens: 2285, output_tokens: 360, thinking_tokens: 0, cache_read_tokens: 10433 } });
	s.child.say({ event: 'result', result: { conversation_id: 'c1', status: 'SUCCESS' } });
	s.child.end(0);
	assert.deepEqual(await s.done, { session: 'c1' });
	assert.deepEqual(s.log.order, [
		'thinkingStarted',
		'tool c1:2 running', 'thinkingStarted',
		'tool c1:2 running', 'tool sub-1:2 running <c1:2>', 'tool c1:2 running',
		'tool sub-1:9 running <c1:2>',
		'tool sub-1:2 done <c1:2>', 'reasoning Plums are 11. <c1:2>', 'text I reported back. <c1:2>', 'tool c1:2 done',
		'thinkingStarted', 'text There are 11 plums.',
	]);
	const rows = s.log.tools.filter(t => t.id === 'c1:2');
	assert.deepEqual(rows[0], { id: 'c1:2', name: 'invoke_subagent', title: 'Document Reader', input: { Role: 'Document Reader', TypeName: 'research', Prompt: SUBAGENT.initial_prompt }, status: 'running', view: { kind: 'subagent', description: 'Document Reader', prompt: SUBAGENT.initial_prompt, agentType: 'research', background: true } });
	assert.equal(rows[1].view.model, 'gemini-3.8-flash', 'the model it works on, as the picker names it');
	assert.deepEqual([rows[2].view.step, rows[2].view.model], ['Reading notes.txt', 'gemini-3.8-flash'], 'what it is on, under its row');
	assert.deepEqual([rows.at(-1).status, rows.at(-1).output, rows.at(-1).view.report, rows.at(-1).view.step, rows.at(-1).view.model], ['done', 'There are 11 plums.', 'There are 11 plums.', undefined, 'gemini-3.8-flash']);
	assert.equal(s.log.tools.find(t => t.id === 'sub-1:2' && t.status === 'done').output, 'Showing lines 1-4 of 4\n4: - plums: 11', 'its result without the times agy puts first');
	assert.deepEqual(s.log.approvals.map(a => [a.toolId, a.kind]), [['sub-1:9', 'edit']]);
	assert.deepEqual(s.log.usage.map(u => [u.context?.tokens, u.models[0].model, u.models[0].inputTokens]), [[undefined, 'gemini-3.8-flash-medium', 4693], [undefined, 'gemini-3.8-flash-medium', 2393], [undefined, 'gemini-3.8-flash-medium', 2435], [12718, 'gemini-4-hydrogen-high', 2285]], 'its requests in Breezell\'s usage too, the lead\'s context alone in the ring');
	rmSync(dir, { recursive: true, force: true });
	rmSync(s.dir, { recursive: true, force: true });
});

test('two subagents from one call, each a row of its own; the turn stopped while they work: each stopped', async () => {
	const s = setup({ told: true, followMs: 15 });
	await startedOf(s);
	s.child.say({ event: 'init', conversation_id: 'c1', init: {} });
	const two = [{ ...SUBAGENT, role: 'Reader A' }, { ...SUBAGENT, role: 'Reader B' }];
	step(s.child, { step_index: 2, state: 'ACTIVE', step_type: 'subagent', tool_name: 'invoke_subagent', subagent_info: { subagents: two } });
	step(s.child, { step_index: 2, state: 'DONE', step_type: 'subagent', tool_name: 'invoke_subagent', subagent_info: { subagents: two.map((sub, i) => ({ ...sub, conversation_id: `sub-${i}` })) } });
	await settle();
	s.cancel.cancel();
	s.child.end(null);
	await s.done;
	const ends = s.log.tools.filter(t => t.status !== 'running');
	assert.deepEqual(ends.map(t => [t.id, t.status, t.view.description, t.view.stopped]), [['c1:2/0', 'error', 'Reader A', true], ['c1:2/1', 'error', 'Reader B', true]]);
	rmSync(s.dir, { recursive: true, force: true });
});
