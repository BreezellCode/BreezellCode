// A turn of Claude Code against a fake process: what goes in (the arguments, the message, the answers
// to its asking), and what comes out of its stream-json lines (text as it is written, tool calls and
// their results, the session, the end). No real Claude Code runs here.
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
const out = mkdtempSync(join(tmpdir(), 'agent-bridge-agent-'));
await esbuild.build({ entryPoints: [join(root, 'src/agent.ts')], bundle: true, platform: 'node', format: 'cjs', outfile: join(out, 'agent.cjs'), logLevel: 'silent' });
const agent = require(join(out, 'agent.cjs'));
rmSync(out, { recursive: true, force: true });

const target = child => ({ where: 'native', path: '/bin/claude', start: (args, cwd) => { child.args = args; child.cwd = cwd; return child; } });
const token = () => { const listeners = []; return { isCancellationRequested: false, onCancellationRequested: l => { listeners.push(l); return { dispose() { } }; }, cancel() { this.isCancellationRequested = true; listeners.forEach(l => l()); } }; };
const replyLog = (approve = async () => true) => { const log = []; return { log, reply: { text: (t, parent) => log.push(parent ? ['text', t, parent] : ['text', t]), reasoning: (t, parent) => log.push(parent ? ['reasoning', t, parent] : ['reasoning', t]), tool: t => log.push(['tool', t.id, t.name, t.status, t.title ?? '', t.output ?? '']), session: id => log.push(['session', id]), approve: async r => { log.push(['approve', r.toolId, r.name, r.kind, r.title ?? '']); return approve(r); } } }; };
const tick = () => new Promise(r => setImmediate(r));

test('the arguments: print mode, stream-json both ways, the SDK\'s stdio permission channel, the model and the session', () => {
	assert.deepEqual(agent.turnArgs({ model: 'opus', session: 's-1', text: '', attachments: [] }), ['-p', '--output-format', 'stream-json', '--verbose', '--input-format', 'stream-json', '--include-partial-messages', '--permission-prompt-tool=stdio', '--thinking-display', 'summarized', '--model', 'opus', '--resume', 's-1']);
	assert.equal(agent.turnArgs({ model: 'opus', text: '', attachments: [] }, false).includes('--thinking-display'), false, 'without thinking summaries'); 
	assert.deepEqual(agent.turnArgs({ model: 'default', text: '', attachments: [] }).includes('--model'), false, 'the default model is Claude Code\'s own choice');
	assert.deepEqual(agent.turnArgs({ model: 'claude-opus-4-8', effort: 'max', text: '', attachments: [] }).slice(-4), ['--model', 'claude-opus-4-8', '--effort', 'max'], 'the effort picked in Breezell');
	assert.equal(agent.turnArgs({ model: 'opus', effort: 'ultra', text: '', attachments: [] }).includes('--effort'), false, 'a level --effort does not take is left out');
});

test('the message: what the user wrote, then the attachments where Claude Code can read them', () => {
	const turn = { model: 'opus', text: 'look at these', attachments: [{ name: 'a.ts', kind: 'file', path: 'C:\\p\\a.ts' }, { name: 'src', kind: 'folder', path: 'C:\\p\\src' }, { name: 'shot.png', kind: 'image' }] };
	assert.equal(agent.promptOf(turn, p => p.replace('C:\\p\\', '/mnt/c/p/').replace(/\\/g, '/')), 'look at these\n\nAttached in Breezell:\n- File: /mnt/c/p/a.ts\n- Folder: /mnt/c/p/src\n- shot.png (image, not passed on)');
	assert.equal(agent.promptOf({ ...turn, attachments: [] }, p => p), 'look at these');
	assert.equal(agent.promptOf({ ...turn, attachments: [], history: [{ role: 'user', text: 'and GPT?' }, { role: 'assistant', text: 'GPT says hi.' }] }, p => p),
		'Earlier in this Breezell conversation, in messages you have not seen (oldest first):\n\n[User]\nand GPT?\n\n[Assistant]\nGPT says hi.\n\n---\nThe user\'s new message:\n\nlook at these');
});

test('which auto-approve setting decides a tool, and one line saying what a call does', () => {
	assert.equal(agent.toolKind('Write'), 'edit');
	assert.equal(agent.toolKind('MultiEdit'), 'edit');
	assert.equal(agent.toolKind('Bash'), 'command');
	assert.equal(agent.toolKind('WebFetch'), 'other');
	assert.equal(agent.toolTitle('Bash', { command: 'npm test\nand more' }), 'npm test');
	assert.equal(agent.toolTitle('Edit', { file_path: '/w/a.ts' }), '/w/a.ts');
	assert.equal(agent.toolTitle('Grep', { pattern: 'TODO' }), 'TODO');
	assert.equal(agent.toolTitle('mcp__x__y', { description: 'Something' }), 'Something');
	assert.equal(agent.toolTitle('Bash', { command: 'x'.repeat(300) }).length, 160);
});

test('the models of /model, as this Claude Code prints them: the default first, named after the current model', () => {
	const printed = 'Current model: `Opus 5.5` (effort: high)\nUsage: /model <name>. Available: sonnet, opus, haiku, fable, best, sonnet[1m], opus[1m], fable[1m], opusplan, default, or a full model ID.\n';
	const claude = models => models.map(([id, title]) => ({ id, title, family: 'claude' }));
	assert.deepEqual(agent.parseModels(printed), claude([
		['default', 'Default (Opus 5.5)'], ['sonnet', 'Sonnet'], ['opus', 'Opus'], ['haiku', 'Haiku'], ['fable', 'Fable'],
		['best', 'Best'], ['sonnet[1m]', 'Sonnet 1M'], ['opus[1m]', 'Opus 1M'], ['fable[1m]', 'Fable 1M'], ['opusplan', 'Opus Plan'],
	]), 'each one Claude\'s, so the picker shows Breezell\'s Claude icon');
	assert.deepEqual(agent.parseModels('nothing'), claude([['default', 'Default']]));
});

test('the models Claude Code offers: asked with initialize alone (no message, so no model is asked), named as its picker names them', async () => {
	const offered = [
		{ value: 'default', resolvedModel: 'claude-opus-5-5', displayName: 'Default (recommended)', description: 'Opus 5.5 · Best for everyday, complex tasks' },
		{ value: 'opus', resolvedModel: 'claude-opus-5-5', displayName: 'Opus 5.5', description: 'For complex work and everyday tasks' },
		{ value: 'claude-opus-4-8', resolvedModel: 'claude-opus-4-8', displayName: 'Opus 4.8' },
		{ value: 'claude-haiku-4-5-20251001', resolvedModel: 'claude-haiku-4-5-20251001', displayName: 'Haiku 4.5' },
		{ displayName: 'no value' }, 'junk',
	];
	assert.deepEqual(agent.modelsOfInitialize(offered), [
		{ id: 'default', title: 'Default (Opus 5.5)', description: 'Opus 5.5 · Best for everyday, complex tasks', family: 'claude', resolved: 'claude-opus-5-5' },
		{ id: 'opus', title: 'Opus 5.5', description: 'For complex work and everyday tasks', family: 'claude', resolved: 'claude-opus-5-5' },
		{ id: 'claude-opus-4-8', title: 'Opus 4.8', family: 'claude', resolved: 'claude-opus-4-8' },
		{ id: 'claude-haiku-4-5-20251001', title: 'Haiku 4.5', family: 'claude', resolved: 'claude-haiku-4-5-20251001' },
	]);
	assert.deepEqual(agent.modelsOfInitialize([{ value: 'default', resolvedModel: 'x', displayName: 'Default (recommended)' }]).map(m => m.title), ['Default (recommended)'], 'its own name when the model it stands for is not listed');
	// The levels each takes, as Claude Code 2.1.330 lists them: Opus 4.6 has no xhigh, Haiku 4.5 no effort at all.
	assert.deepEqual(agent.modelsOfInitialize([
		{ value: 'opus', displayName: 'Opus 5.5', supportsEffort: true, supportedEffortLevels: ['low', 'medium', 'high', 'xhigh', 'max'] },
		{ value: 'claude-opus-4-6', displayName: 'Opus 4.6', supportsEffort: true, supportedEffortLevels: ['low', 'medium', 'high', 'max'] },
		{ value: 'claude-haiku-4-5-20251001', displayName: 'Haiku 4.5', supportsThinkingOff: true },
		{ value: 'odd', displayName: 'Odd', supportsEffort: true, supportedEffortLevels: ['max', 'turbo'] },
	]).map(m => [m.id, m.efforts]), [['opus', ['low', 'medium', 'high', 'xhigh', 'max']], ['claude-opus-4-6', ['low', 'medium', 'high', 'max']], ['claude-haiku-4-5-20251001', undefined], ['odd', ['max']]]);
	const child = fakeChild().offers(offered);
	const models = await agent.initializeModels(target(child));
	assert.deepEqual(models.map(m => m.id), ['default', 'opus', 'claude-opus-4-8', 'claude-haiku-4-5-20251001']);
	assert.deepEqual(child.sent.map(m => m.request?.subtype ?? m.type), ['initialize'], 'nothing but initialize');
	assert.ok(child.args.includes('--no-session-persistence') && !child.args.includes('--model'));
	await tick();
	assert.equal(child.stdinEnded, true, 'answered, its input closes');
	const silent = fakeChild();
	const asked = agent.initializeModels(target(silent));
	await tick();
	silent.end(1);
	assert.equal(await asked, undefined, 'one that ends without answering: none');
});

test('a turn: text as it is written (not again when the message is whole), tool calls and results, asking answered, the session', async () => {
	const child = fakeChild();
	const { log, reply } = replyLog(async r => r.name === 'Write');
	const running = agent.runTurn(target(child), { model: 'opus', text: 'go', attachments: [], cwd: '/w' }, reply, token());
	await tick();
	assert.deepEqual(child.sent[0], { type: 'user', message: { role: 'user', content: 'go' }, parent_tool_use_id: null });
	assert.equal(child.cwd, '/w');
	child.say({ type: 'system', subtype: 'init', session_id: 's-1' });
	child.say({ type: 'stream_event', event: { type: 'message_start', message: { id: 'm1' } } });
	child.say({ type: 'stream_event', event: { type: 'content_block_delta', delta: { type: 'thinking_delta', thinking: 'Hmm.' } } });
	child.say({ type: 'stream_event', event: { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Wri' } } });
	child.say({ type: 'stream_event', event: { type: 'content_block_delta', delta: { type: 'text_delta', text: 'ting.' } } });
	child.say({ type: 'assistant', uuid: 'r1', message: { id: 'm1', content: [{ type: 'text', text: 'Writing.' }, { type: 'tool_use', id: 'tu1', name: 'Write', input: { file_path: '/w/a.txt', content: 'hi' } }] } });
	child.say({ type: 'control_request', request_id: 'r1', request: { subtype: 'can_use_tool', tool_name: 'Write', input: { file_path: '/w/a.txt', content: 'hi' }, tool_use_id: 'tu1' } });
	child.say({ type: 'control_request', request_id: 'r2', request: { subtype: 'can_use_tool', tool_name: 'Bash', input: { command: 'rm -rf /' }, tool_use_id: 'tu2', decision_reason: 'Dangerous' } });
	child.say({ type: 'control_request', request_id: 'r3', request: { subtype: 'mcp_message' } });
	// A subagent's words and calls come under its call (Breezell keeps its words out of the reply); its words never twice.
	child.say({ type: 'stream_event', parent_tool_use_id: 'task1', event: { type: 'content_block_delta', delta: { type: 'text_delta', text: 'sub words' } } });
	child.say({ type: 'assistant', parent_tool_use_id: 'task1', uuid: 'sub-1', message: { id: 's1', content: [{ type: 'text', text: 'sub words' }, { type: 'tool_use', id: 'g1', name: 'Grep', input: { pattern: 'TODO' } }] } });
	child.say({ type: 'keep_alive' });
	await tick(); await tick();
	child.say({ type: 'user', uuid: 'r2', message: { content: [{ type: 'tool_result', tool_use_id: 'tu1', content: [{ type: 'text', text: 'Created' }] }] } });
	child.say({ type: 'assistant', uuid: 'r3', message: { id: 'm2', content: [{ type: 'thinking', thinking: 'All good.' }, { type: 'text', text: 'Done.' }] } });
	child.say({ type: 'result', subtype: 'success', session_id: 's-1', result: 'Done.' });
	await tick();
	assert.equal(child.stdinEnded, true, 'told the end, its input closes');
	child.end(0);
	assert.deepEqual(await running, { session: 's-1', entry: 'r3' }, 'the last record of the session it made; a subagent\'s is not one');
	assert.deepEqual(log, [
		['session', 's-1'], ['reasoning', 'Hmm.'], ['text', 'Wri'], ['text', 'ting.'],
		['tool', 'tu1', 'Write', 'running', '/w/a.txt', ''],
		// Asking waits a moment (a Write's file is looked at first): what came meanwhile is told first.
		['text', 'sub words', 'task1'], ['tool', 'g1', 'Grep', 'running', 'TODO', ''],
		['approve', 'tu1', 'Write', 'edit', '/w/a.txt'], ['approve', 'tu2', 'Bash', 'command', 'rm -rf /'],
		['tool', 'tu1', 'Write', 'done', '/w/a.txt', 'Created'], ['reasoning', 'All good.'], ['text', 'Done.'],
	]);
	const answers = child.sent.filter(m => m.type === 'control_response').map(m => [m.response.request_id, m.response.subtype, m.response.response?.behavior ?? m.response.error]);
	assert.deepEqual(answers, [['r3', 'error', 'Breezell does not answer mcp_message.'], ['r1', 'success', 'allow'], ['r2', 'success', 'deny']]);
	assert.deepEqual(child.sent.find(m => m.response?.request_id === 'r1').response.response.updatedInput, { file_path: '/w/a.txt', content: 'hi' });
});

test('Stop: asked to interrupt as the SDK does, its input closes, and the process is ended if it stays', async () => {
	const child = fakeChild();
	const t = token();
	const { reply } = replyLog();
	const running = agent.runTurn(target(child), { model: 'opus', text: 'go', attachments: [] }, reply, t);
	await tick();
	t.cancel();
	await tick();
	assert.equal(child.sent.at(-1).type, 'control_request');
	assert.equal(child.sent.at(-1).request.subtype, 'interrupt');
	assert.equal(child.stdinEnded, true);
	assert.equal(child.killed, false, 'given its grace period first');
	// What the real Claude Code says after an interrupt (seen live with 2.1.330).
	child.say({ type: 'result', subtype: 'error_during_execution', is_error: true, session_id: 's-3' });
	child.end(0);
	assert.deepEqual(await running, { session: 's-3' }, 'a stop is no error; the session goes on');
});

test('it ends badly: the error it says, or its exit code and last error line; it cannot start: the turn fails', async () => {
	const said = fakeChild();
	const r1 = agent.runTurn(target(said), { model: 'opus', text: 'go', attachments: [] }, replyLog().reply, token());
	said.say({ type: 'result', subtype: 'error_max_turns', is_error: true, session_id: 's-2', result: 'Reached the turn limit' });
	said.end(1);
	assert.deepEqual(await r1, { session: 's-2', error: 'Reached the turn limit' });
	const crashed = fakeChild();
	const r2 = agent.runTurn(target(crashed), { model: 'opus', text: 'go', attachments: [] }, replyLog().reply, token());
	crashed.stderr.write('warning\nError: not logged in\n');
	await tick();
	crashed.end(1);
	assert.deepEqual(await r2, { error: 'Claude Code exited with code 1: Error: not logged in' });
	await assert.rejects(agent.runTurn({ where: 'native', path: '/x', start: () => { throw new Error('spawn ENOENT'); } }, { model: 'opus', text: 'go', attachments: [] }, replyLog().reply, token()), /ENOENT/);
	const gone = fakeChild();
	const r3 = agent.runTurn(target(gone), { model: 'opus', text: 'go', attachments: [], session: 'old-1' }, replyLog().reply, token());
	gone.stderr.write('No conversation found with session ID: old-1\n');
	await tick();
	gone.end(1);
	assert.deepEqual(await r3, { error: 'Claude Code exited with code 1: No conversation found with session ID: old-1' }, 'a session it could not go on with is not given back');
});

test('an install of Claude Code without the thinking summary flag: once more without it, and without it from then on', async () => {
	const children = [];
	const install = { where: 'native', path: '/old/claude', start: args => { const child = fakeChild(); child.args = args; children.push(child); return child; } };
	const log = replyLog();
	const run = agent.runTurn(install, { model: 'opus', text: 'go', attachments: [] }, log.reply, token());
	assert.equal(children[0].args.includes('--thinking-display'), true);
	children[0].stderr.write("error: unknown option '--thinking-display'\n");
	await tick();
	children[0].end(1);
	await tick(); await tick();
	assert.equal(children.length, 2, 'started once more');
	assert.equal(children[1].args.includes('--thinking-display'), false);
	assert.deepEqual(children[1].sent.map(m => m.type), ['user'], 'the message goes to the one that runs');
	children[1].say({ type: 'system', subtype: 'init', session_id: 's-old' });
	children[1].say({ type: 'result', subtype: 'success', is_error: false, session_id: 's-old', result: 'ok' });
	children[1].end(0);
	assert.deepEqual(await run, { session: 's-old' });
	const next = agent.runTurn(install, { model: 'opus', text: 'go', attachments: [] }, replyLog().reply, token());
	assert.equal(children[2].args.includes('--thinking-display'), false, 'that install is not asked again');
	children[2].end(1);
	await next;
	const other = fakeChild();
	const elsewhere = agent.runTurn(target(other), { model: 'opus', text: 'go', attachments: [] }, replyLog().reply, token());
	assert.equal(other.args.includes('--thinking-display'), true, 'another install still is');
	other.stderr.write("error: unknown option '--bogus'\n");
	await tick();
	other.end(1);
	assert.deepEqual(await elsewhere, { error: "Claude Code exited with code 1: error: unknown option '--bogus'" }, 'another refused option is the turn\'s error');
});

test('each call as Breezell draws its own: its view, its file as Breezell opens it, a subagent\'s steps and report; Claude Code\'s tool lookups not at all', async () => {
	const child = fakeChild();
	const tools = [];
	const approvals = [];
	const reply = { text() {}, reasoning() {}, session() {}, tool: t => tools.push(t), approve: async r => { approvals.push(r); return true; } };
	const files = { uriOf: path => `file://${path}`, textOf: async path => path === '/w/old.txt' ? 'a\nb\nc' : undefined };
	const running = agent.runTurn(target(child), { model: 'opus', text: 'go', attachments: [], cwd: '/w' }, reply, token(), p => p, files);
	await tick();
	const use = (id, name, input, parent) => child.say({ type: 'assistant', ...(parent ? { parent_tool_use_id: parent } : {}), message: { id: `m-${id}`, content: [{ type: 'tool_use', id, name, input }] } });
	const result = (id, text, structured, parent) => child.say({ type: 'user', ...(parent ? { parent_tool_use_id: parent } : {}), message: { content: [{ type: 'tool_result', tool_use_id: id, content: [{ type: 'text', text }] }] }, ...(structured ? { tool_use_result: structured } : {}) });
	use('ts', 'ToolSearch', { query: 'select:Write' });
	result('ts', 'found', { matches: ['Write'] });
	use('r1', 'Read', { file_path: '/w/a.js' });
	result('r1', '1\tx', { type: 'text', file: { filePath: '/w/a.js', content: 'x', numLines: 4, startLine: 1, totalLines: 4 } });
	use('e1', 'Edit', { file_path: '/w/a.js', old_string: 'a - b', new_string: 'a + b' });
	result('e1', 'updated', { filePath: '/w/a.js', oldString: 'a - b', newString: 'a + b', originalFile: 'return a - b', replaceAll: false, structuredPatch: [] });
	use('w1', 'Write', { file_path: '/w/old.txt', content: 'a\nB\nc' });
	child.say({ type: 'control_request', request_id: 'q1', request: { subtype: 'can_use_tool', tool_name: 'Write', input: { file_path: '/w/old.txt', content: 'a\nB\nc' }, tool_use_id: 'w1' } });
	await tick(); await tick();
	use('b1', 'Bash', { command: 'npm test', description: 'Run the tests' });
	result('b1', 'ok', { stdout: '3 passing', stderr: '', interrupted: false });
	use('t1', 'Agent', { description: 'Read README first line', prompt: 'Read README.md', subagent_type: 'general-purpose' });
	child.say({ type: 'system', subtype: 'task_progress', tool_use_id: 't1', description: 'Reading README.md' });
	use('s1', 'Read', { file_path: '/w/README.md' }, 't1');
	result('s1', '1\t# Demo', undefined, 't1');
	result('t1', '[Subagent hand-back] framed', { status: 'completed', content: [{ type: 'text', text: 'The first line is # Demo.' }] });
	child.say({ type: 'result', subtype: 'success', session_id: 's-9' });
	await tick();
	child.end(0);
	await running;
	assert.ok(!tools.some(t => t.id === 'ts'), 'its tool lookups are not shown');
	const last = id => tools.filter(t => t.id === id).at(-1);
	assert.deepEqual(last('r1').view, { kind: 'read', path: '/w/a.js', startLine: 1, endLine: 4, totalLines: 4, uri: 'file:///w/a.js' });
	assert.deepEqual(last('e1').view, { kind: 'edit', path: '/w/a.js', edits: [{ oldString: 'a - b', newString: 'a + b' }], uri: 'file:///w/a.js' });
	assert.deepEqual(approvals[0].view, { kind: 'edit', path: '/w/old.txt', edits: [{ oldString: 'b', newString: 'B' }], uri: 'file:///w/old.txt' }, 'a Write of a file that is there: what it changes');
	assert.deepEqual(last('b1').view, { kind: 'command', command: 'npm test', description: 'Run the tests', output: '3 passing' });
	const steps = tools.filter(t => t.id === 't1').map(t => [t.status, t.view?.step ?? '']);
	assert.deepEqual(steps, [['running', ''], ['running', 'Reading README.md'], ['done', '']]);
	assert.equal(last('s1').parent, 't1', 'the subagent\'s call, under its call');
	assert.equal(last('t1').output, 'The first line is # Demo.', 'its report, not the frame around it');
	assert.equal(last('t1').view.report, 'The first line is # Demo.');
});

test('one subagent stopped alone: stop_task for its task (as Claude Code 2.1.330 takes it in print mode), and its call ends as stopped, not failed', async () => {
	const child = fakeChild();
	const tools = [];
	const reply = { text() {}, reasoning() {}, session() {}, tool: t => tools.push(t), approve: async () => true };
	const controls = {};
	const running = agent.runTurn(target(child), { model: 'opus', text: 'go', attachments: [], cwd: '/w' }, reply, token(), p => p, undefined, controls);
	await tick();
	assert.equal(controls.stopSubagent('t1'), false, 'no such subagent yet');
	child.say({ type: 'assistant', message: { id: 'm1', content: [{ type: 'tool_use', id: 't1', name: 'Agent', input: { description: 'Ping', prompt: 'Run ping', run_in_background: true } }] } });
	child.say({ type: 'system', subtype: 'task_started', task_id: 'a57b431e1251a5967', tool_use_id: 't1', description: 'Ping' });
	await tick();
	assert.equal(controls.stopSubagent('t1'), true);
	assert.deepEqual(child.sent.at(-1).request, { subtype: 'stop_task', task_id: 'a57b431e1251a5967' });
	// What Claude Code says then (seen live): the task killed and stopped, then its call's error result.
	child.say({ type: 'system', subtype: 'task_updated', task_id: 'a57b431e1251a5967', patch: { status: 'killed' } });
	child.say({ type: 'system', subtype: 'task_notification', task_id: 'a57b431e1251a5967', tool_use_id: 't1', status: 'stopped' });
	child.say({ type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 't1', is_error: true, content: '[Request interrupted by user for tool use]' }] }, tool_use_result: 'Error: [Request interrupted by user for tool use]' });
	child.say({ type: 'result', subtype: 'success', session_id: 's-1' });
	await tick();
	child.end(0);
	await running;
	assert.equal(tools[0].view.background, true, 'one it runs in the background says so');
	const end = tools.filter(t => t.id === 't1').at(-1);
	assert.deepEqual([end.status, end.view.stopped], ['error', true]);
});

test('as Claude Code writes a call: shown from its first readable words, growing, at most every WRITING_TOLD_MS; then whole', async () => {
	const child = fakeChild();
	const tools = [];
	const reply = { text() {}, reasoning() {}, session() {}, tool: t => tools.push(t), approve: async () => true };
	const realNow = Date.now;
	let now = 1_000_000;
	Date.now = () => now;
	try {
		const running = agent.runTurn(target(child), { model: 'opus', text: 'go', attachments: [], cwd: '/w' }, reply, token(), p => p, { uriOf: p => `file://${p}`, textOf: async () => undefined });
		await tick();
		const delta = json => child.say({ type: 'stream_event', event: { type: 'content_block_delta', index: 1, delta: { type: 'input_json_delta', partial_json: json } } });
		child.say({ type: 'stream_event', event: { type: 'content_block_start', index: 1, content_block: { type: 'tool_use', id: 'w1', name: 'Write', input: {} } } });
		delta('{"file_pa');
		delta('th":"/w/poem.txt","content":"Rivers');
		now += 50;
		delta(' run\\nto');
		now += 200;
		delta(' the sea');
		child.say({ type: 'stream_event', event: { type: 'content_block_stop', index: 1 } });
		child.say({ type: 'assistant', message: { id: 'm1', content: [{ type: 'tool_use', id: 'w1', name: 'Write', input: { file_path: '/w/poem.txt', content: 'Rivers run\nto the sea' } }] } });
		child.say({ type: 'result', subtype: 'success', session_id: 's-1' });
		await tick();
		child.end(0);
		await running;
	} finally {
		Date.now = realNow;
	}
	assert.deepEqual(tools.map(t => t.view?.content), ['Rivers', 'Rivers run\nto the sea', 'Rivers run\nto the sea'], 'first words, then (150 ms on) what came since, then whole');
	assert.ok(tools.every(t => t.id === 'w1' && t.status === 'running' && t.view.uri === 'file:///w/poem.txt'));
});

test('a subagent Claude Code sends to the background: its note to the model never shown; it works on until its end comes; the input stays open meanwhile', async () => {
	const child = fakeChild();
	const tools = [];
	const thinking = [];
	const reply = { text() {}, reasoning() {}, session() {}, thinking: n => thinking.push(n), tool: t => tools.push(t), approve: async () => true };
	const running = agent.runTurn(target(child), { model: 'opus', text: 'go', attachments: [], cwd: '/w' }, reply, token());
	await tick();
	child.say({ type: 'system', subtype: 'thinking_tokens', estimated_tokens: 350, estimated_tokens_delta: 150 });
	child.say({ type: 'assistant', message: { id: 'm1', content: [{ type: 'tool_use', id: 't1', name: 'Agent', input: { description: 'Ping', prompt: 'Run ping' } }] } });
	child.say({ type: 'system', subtype: 'task_started', task_id: 'task-1', tool_use_id: 't1', is_backgrounded: true });
	// What Claude Code 2.1.330 answers at once (seen live): a note for the model, and status async_launched.
	child.say({ type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 't1', content: [{ type: 'text', text: 'Async agent launched successfully. (This tool result is internal metadata ...)' }] }] }, tool_use_result: { status: 'async_launched', isAsync: true, agentId: 'a1', outputFile: '/tmp/x.output' } });
	child.say({ type: 'result', subtype: 'success', session_id: 's-1', result: 'It runs in the background.' });
	await tick();
	assert.ok(!child.stdinEnded, 'the input stays open while the subagent works');
	assert.ok(!tools.some(t => t.id === 't1' && t.status !== 'running'), 'not ended by its call\'s quick return');
	assert.ok(!tools.some(t => String(t.output ?? '').includes('Async agent launched')), 'its note to the model is never shown');
	child.say({ type: 'system', subtype: 'task_notification', task_id: 'task-1', tool_use_id: 't1', status: 'completed', summary: 'Ping answered.' });
	child.say({ type: 'assistant', message: { id: 'm2', content: [{ type: 'text', text: 'It answered.' }] } });
	child.say({ type: 'result', subtype: 'success', session_id: 's-1', result: 'It answered.' });
	await tick();
	assert.equal(child.stdinEnded, true, 'closed with the turn after it');
	child.end(0);
	await running;
	const end = tools.filter(t => t.id === 't1').at(-1);
	assert.deepEqual([end.status, end.output, end.view.report, end.view.background], ['done', 'Ping answered.', 'Ping answered.', true]);
	assert.ok(tools.some(t => t.id === 't1' && t.status === 'running' && t.view?.background), 'told as one working in the background');
	assert.deepEqual(thinking, [350], 'a hidden thought\'s progress');
});

test('words of a new message with no call between start a new paragraph (Claude Code going on after a background subagent); after a call, a new reply as before', async () => {
	const child = fakeChild();
	const { log, reply } = replyLog();
	const running = agent.runTurn(target(child), { model: 'haiku', text: 'go', attachments: [], cwd: '/w' }, reply, token());
	await tick();
	const delta = (id, text) => [
		{ type: 'stream_event', event: { type: 'message_start', message: { id } } },
		{ type: 'stream_event', event: { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text } } },
	];
	child.say({ type: 'assistant', message: { id: 'm1', content: [{ type: 'tool_use', id: 't1', name: 'Agent', input: { description: 'Count', prompt: 'Count kiwis' } }] } });
	child.say({ type: 'system', subtype: 'task_started', task_id: 'task-1', tool_use_id: 't1', is_backgrounded: true });
	for (const line of delta('m2', 'It is still counting.')) child.say(line);
	child.say({ type: 'assistant', message: { id: 'm2', content: [{ type: 'text', text: 'It is still counting.' }] } });
	child.say({ type: 'result', subtype: 'success', session_id: 's-1', result: 'It is still counting.' });
	child.say({ type: 'system', subtype: 'task_notification', task_id: 'task-1', tool_use_id: 't1', status: 'completed', summary: '3 kiwis.' });
	for (const line of delta('m3', 'There are 3 kiwis.')) child.say(line);
	child.say({ type: 'assistant', message: { id: 'm3', content: [{ type: 'text', text: 'There are 3 kiwis.' }] } });
	// The control: a call between two messages' words; Breezell starts a new reply there by itself.
	child.say({ type: 'assistant', message: { id: 'm4', content: [{ type: 'tool_use', id: 't2', name: 'Read', input: { file_path: '/w/a.txt' } }] } });
	child.say({ type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 't2', content: 'x' }] } });
	for (const line of delta('m5', 'Read it.')) child.say(line);
	child.say({ type: 'result', subtype: 'success', session_id: 's-1', result: 'Read it.' });
	await tick();
	child.end(0);
	await running;
	assert.deepEqual(log.filter(l => l[0] === 'text'), [['text', 'It is still counting.'], ['text', '\n\nThere are 3 kiwis.'], ['text', 'Read it.']]);
});

test('the prompt: Breezell\'s memories after the message; going on after a failed request, a note to continue instead of the message', () => {
	const base = { model: 'opus', text: 'fix the test', attachments: [], cwd: '/w' };
	const withMemories = agent.promptOf({ ...base, memories: '- The tests run with npm test.\n' }, p => p);
	assert.ok(withMemories.startsWith('fix the test\n\n<breezell-memories>\n'), withMemories);
	assert.ok(withMemories.includes('- The tests run with npm test.\n</breezell-memories>'));
	assert.equal(agent.promptOf({ ...base, memories: '  ' }, p => p), 'fix the test', 'none: nothing added');
	const going = agent.promptOf({ ...base, memories: 'x', history: [{ role: 'user', text: 'earlier' }], continuing: { after: 'API Error: Connection dropped (ECONNRESET).\nmore' } }, p => p);
	assert.equal(going, 'Your previous request to the model failed before you finished (API Error: Connection dropped (ECONNRESET).). Continue the task from where you stopped. Do not start over, and do not repeat steps that are already done.');
});

test('Claude Code sending a failed request again by itself: told as retrying; one that failed for good: no reply of it, the error with its kind', async () => {
	const child = fakeChild();
	const { log, reply } = replyLog();
	const retries = [];
	reply.retrying = r => retries.push(r);
	const running = agent.runTurn(target(child), { model: 'opus', text: 'go', attachments: [], cwd: '/w' }, reply, token());
	await tick();
	child.say({ type: 'system', subtype: 'init', session_id: 's-1' });
	child.say({ type: 'system', subtype: 'api_retry', attempt: 1, max_retries: 10, retry_delay_ms: 2000, error_status: null, error: 'unknown' });
	child.say({ type: 'system', subtype: 'api_retry', attempt: 2, max_retries: 10, retry_delay_ms: 4000, error_status: 529, error: 'overloaded', parent_tool_use_id: 'a1' });
	child.say({ type: 'assistant', message: { id: 'm9', content: [{ type: 'text', text: 'API Error: Connection dropped (ECONNRESET). A VPN, firewall, or security software can cause this.' }] }, error: 'unknown' });
	child.say({ type: 'result', subtype: 'success', is_error: true, session_id: 's-1', result: 'API Error: Connection dropped (ECONNRESET). A VPN, firewall, or security software can cause this.' });
	child.end(0);
	const result = await running;
	assert.deepEqual(retries, [{ attempt: 1, maxAttempts: 10, delayMs: 2000, error: 'unknown' }], 'a subagent\'s own retries are not the turn\'s');
	assert.deepEqual(log.filter(l => l[0] === 'text'), [], 'the error message is no reply');
	assert.deepEqual(result, { session: 's-1', error: 'API Error: Connection dropped (ECONNRESET). A VPN, firewall, or security software can cause this.', apiError: 'unknown' });
	// The control: an error of another kind (Claude Code exited) carries no model kind.
	const other = fakeChild();
	const otherRun = agent.runTurn(target(other), { model: 'opus', text: 'go', attachments: [], cwd: '/w' }, replyLog().reply, token());
	await tick();
	other.say({ type: 'result', subtype: 'error_during_execution', is_error: true, session_id: 's-2', result: 'Something else broke.' });
	other.end(0);
	assert.deepEqual(await otherRun, { session: 's-2', error: 'Something else broke.' });
});

test('a model response that goes silent (MODEL_STALL_MS) stops the turn as a stalled model request, which Breezell sends on', async () => {
	const child = fakeChild();
	const { log, reply } = replyLog();
	const running = agent.runTurn(target(child), { model: 'opus', text: 'go', attachments: [], cwd: '/w' }, reply, token(), p => p, undefined, { stallMs: 60 });
	await tick();
	child.say({ type: 'system', subtype: 'init', session_id: 's-1' });
	child.say({ type: 'stream_event', event: { type: 'message_start', message: { id: 'm1' } } });
	child.say({ type: 'stream_event', event: { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'Looking' } } });
	await new Promise(resolve => setTimeout(resolve, 200));
	assert.ok(child.sent.some(m => m.type === 'control_request' && m.request?.subtype === 'interrupt'), 'asked to stop');
	// What the interruption ends with is not the error.
	child.say({ type: 'result', subtype: 'error_during_execution', is_error: true, session_id: 's-1', result: 'Interrupted.' });
	child.end(0);
	assert.deepEqual(await running, { session: 's-1', error: 'No answer from the model for 0 s.', apiError: 'stalled' });
	assert.deepEqual(log.filter(l => l[0] === 'text'), [['text', 'Looking']]);
	// The control: a turn between responses (a tool running) is not watched.
	const quiet = fakeChild();
	const quietRun = agent.runTurn(target(quiet), { model: 'opus', text: 'go', attachments: [], cwd: '/w' }, replyLog().reply, token(), p => p, undefined, { stallMs: 60 });
	await tick();
	quiet.say({ type: 'stream_event', event: { type: 'message_start', message: { id: 'm1' } } });
	quiet.say({ type: 'stream_event', event: { type: 'message_stop' } });
	await new Promise(resolve => setTimeout(resolve, 200));
	assert.ok(!quiet.sent.some(m => m.type === 'control_request' && m.request?.subtype === 'interrupt'), 'not stopped while no response is coming');
	quiet.say({ type: 'result', subtype: 'success', session_id: 's-3' });
	quiet.end(0);
	assert.deepEqual(await quietRun, { session: 's-3' });
});

test('Breezell\'s memory lookup offered to Claude Code: an MCP server of the plugin\'s, named at the start; its calls run in Breezell; its row says what was found', async () => {
	const child = fakeChild();
	const { log, reply } = replyLog();
	const tools = [];
	reply.tool = t => tools.push(t);
	const calls = [];
	const schema = { type: 'object', properties: { query: { type: 'string', description: 'What to look up' } }, required: [] };
	const controls = {
		breezellTools: [{ name: 'memories_recall', inputSchema: schema }, { name: 'something_else', inputSchema: schema }],
		callBreezellTool: async (name, input) => { calls.push([name, input]); return { text: '[id:m1] Tests run with npm test.', resultType: 'search', count: 1 }; },
	};
	const answers = [];
	child.onSent = message => { if (message.type === 'control_response') answers.push(message.response); };
	const running = agent.runTurn(target(child), { model: 'opus', text: 'go', attachments: [], cwd: '/w' }, reply, token(), p => p, undefined, controls);
	await tick();
	assert.ok(child.args.join(' ').includes('--allowedTools mcp__breezell__memories_recall'), 'it only reads memories: no asking');
	assert.deepEqual([child.sent[0].type, child.sent[0].request?.subtype, child.sent[0].request?.sdkMcpServers, child.sent[1].type], ['control_request', 'initialize', ['breezell'], 'user'], 'named before the message');
	const mcp = (id, message) => child.say({ type: 'control_request', request_id: id, request: { subtype: 'mcp_message', server_name: 'breezell', message } });
	mcp('r1', { jsonrpc: '2.0', id: 0, method: 'initialize', params: { protocolVersion: '2025-06-18' } });
	mcp('r2', { jsonrpc: '2.0', method: 'notifications/initialized' });
	mcp('r3', { jsonrpc: '2.0', id: 1, method: 'tools/list' });
	child.say({ type: 'assistant', message: { id: 'm1', content: [{ type: 'tool_use', id: 't1', name: 'mcp__breezell__memories_recall', input: { query: 'tests' } }] } });
	mcp('r4', { jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'memories_recall', arguments: { query: 'tests' } } });
	mcp('r5', { jsonrpc: '2.0', id: 3, method: 'resources/list' });
	child.say({ type: 'control_request', request_id: 'r6', request: { subtype: 'mcp_message', server_name: 'other', message: { jsonrpc: '2.0', id: 4, method: 'tools/list' } } });
	await new Promise(resolve => setTimeout(resolve, 20));
	child.say({ type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 't1', content: [{ type: 'text', text: '[id:m1] Tests run with npm test.' }] }] } });
	child.say({ type: 'result', subtype: 'success', session_id: 's-1' });
	child.end(0);
	await running;
	const byId = id => answers.find(r => r.request_id === id);
	assert.deepEqual(byId('r1').response.mcp_response.result.capabilities, { tools: {} });
	assert.deepEqual(byId('r2').response.mcp_response, { jsonrpc: '2.0', id: null, result: {} }, 'a notification: an empty result');
	const listed = byId('r3').response.mcp_response.result.tools;
	assert.deepEqual(listed.map(t => t.name), ['memories_recall'], 'only the tools it knows how to tell');
	assert.ok(listed[0].description.startsWith('Look up what Breezell remembers'));
	assert.deepEqual(listed[0].inputSchema, schema);
	assert.deepEqual(calls, [['memories_recall', { query: 'tests' }]]);
	assert.deepEqual(byId('r4').response.mcp_response.result, { content: [{ type: 'text', text: '[id:m1] Tests run with npm test.' }] });
	assert.equal(byId('r5').response.mcp_response.error.code, -32601);
	assert.deepEqual([byId('r6').subtype, /No MCP server named other/.test(byId('r6').error)], ['error', true]);
	const done = tools.filter(t => t.id === 't1').at(-1);
	assert.deepEqual([done.status, done.view], ['done', { kind: 'memories', query: 'tests', resultType: 'search', count: 1 }]);
	assert.deepEqual(log, [], 'nothing of it said as text');
	// The control: offered nothing, nothing is named and nothing allowed.
	const plain = fakeChild();
	const plainRun = agent.runTurn(target(plain), { model: 'opus', text: 'go', attachments: [], cwd: '/w' }, replyLog().reply, token());
	await tick();
	assert.ok(!plain.args.includes('--allowedTools'));
	assert.equal(plain.sent[0].type, 'user');
	plain.say({ type: 'result', subtype: 'success', session_id: 's-2' });
	plain.end(0);
	await plainRun;
});

test('Breezell\'s terminal offered to Claude Code: its own shell is off, a command is asked about as a command, the call names its row, the shell is told', async () => {
	const child = fakeChild();
	const { reply } = replyLog();
	const asked = [];
	reply.approve = async request => { asked.push(request); return true; };
	const calls = [];
	const schema = { type: 'object', properties: { command: { type: 'string', description: 'The command' } }, required: ['command'] };
	const controls = {
		breezellTools: [{ name: 'memories_recall', inputSchema: schema }, { name: 'run_terminal_cmd', inputSchema: schema, shell: 'windows | PowerShell' }, { name: 'await', inputSchema: schema }],
		callBreezellTool: async (name, input, toolUseId) => { calls.push([name, input, toolUseId]); return { text: 'hi\n(exit code 0)' }; },
	};
	const answers = [];
	child.onSent = message => { if (message.type === 'control_response') answers.push(message.response); };
	const running = agent.runTurn(target(child), { model: 'opus', text: 'go', attachments: [], cwd: '/w' }, reply, token(), p => p, undefined, controls);
	await tick();
	const arg = flag => child.args[child.args.indexOf(flag) + 1];
	assert.equal(arg('--allowedTools'), 'mcp__breezell__memories_recall,mcp__breezell__await', 'a lookup and a wait: no asking; a command: asked');
	assert.equal(arg('--disallowedTools'), 'Bash,Monitor', 'its own shell is off');
	const mcp = (id, message) => child.say({ type: 'control_request', request_id: id, request: { subtype: 'mcp_message', server_name: 'breezell', message } });
	mcp('r1', { jsonrpc: '2.0', id: 1, method: 'tools/list' });
	child.say({ type: 'control_request', request_id: 'p1', request: { subtype: 'can_use_tool', tool_name: 'mcp__breezell__run_terminal_cmd', tool_use_id: 't1', input: { command: 'echo hi', explanation: 'Say hi' } } });
	await tick();
	mcp('r2', { jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'run_terminal_cmd', arguments: { command: 'echo hi' }, _meta: { 'claudecode/toolUseId': 't1' } } });
	await new Promise(resolve => setTimeout(resolve, 20));
	child.say({ type: 'result', subtype: 'success', session_id: 's-1' });
	child.end(0);
	await running;
	const listed = answers.find(r => r.request_id === 'r1').response.mcp_response.result.tools;
	assert.deepEqual(listed.map(t => t.name), ['memories_recall', 'run_terminal_cmd', 'await']);
	assert.ok(listed[1].description.endsWith('Commands run in: windows | PowerShell.'), 'the shell its commands run in');
	assert.deepStrictEqual(listed.map(t => t._meta?.['anthropic/alwaysLoad'] === true), [false, true, true], 'the terminal tools loaded at the start, not behind its tool search');
	assert.deepEqual(asked.map(r => [r.toolId, r.kind, r.view]), [['t1', 'command', { kind: 'command', command: 'echo hi', description: 'Say hi' }]], 'Breezell\'s command card');
	assert.deepEqual(calls, [['run_terminal_cmd', { command: 'echo hi' }, 't1']], 'with the id of its call');
	// Offered no terminal: its own shell stays.
	const plain = fakeChild();
	const plainRun = agent.runTurn(target(plain), { model: 'opus', text: 'go', attachments: [], cwd: '/w' }, replyLog().reply, token(), p => p, undefined, { breezellTools: [{ name: 'memories_recall', inputSchema: schema }], callBreezellTool: async () => ({ text: '' }) });
	await tick();
	assert.equal(plain.args.includes('--disallowedTools'), false);
	plain.say({ type: 'result', subtype: 'success', session_id: 's-2' });
	plain.end(0);
	await plainRun;
});

test('Breezell\'s edit tools offered to Claude Code: its own Edit and Write are off, a change is asked about as a change, with what it changes', async () => {
	const child = fakeChild();
	const { reply } = replyLog();
	const asked = [];
	reply.approve = async request => { asked.push(request); return true; };
	const calls = [];
	const schema = { type: 'object', properties: { uri: { type: 'string', description: 'The path' } }, required: ['uri'] };
	const controls = {
		breezellTools: ['run_terminal_cmd', 'edit_file', 'write_to_file'].map(name => ({ name, inputSchema: schema })),
		callBreezellTool: async (name, input, toolUseId) => { calls.push([name, toolUseId]); return { text: 'ok' }; },
	};
	const answers = [];
	child.onSent = message => { if (message.type === 'control_response') answers.push(message.response); };
	const running = agent.runTurn(target(child), { model: 'opus', text: 'go', attachments: [], cwd: '/w' }, reply, token(), p => p, undefined, controls);
	await tick();
	const arg = flag => child.args[child.args.indexOf(flag) + 1];
	assert.equal(arg('--disallowedTools'), 'Bash,Monitor,Edit,MultiEdit,Write', 'its own shell and edits are off');
	assert.equal(child.args.includes('--allowedTools'), false, 'a command and a change are asked about');
	const mcp = (id, message) => child.say({ type: 'control_request', request_id: id, request: { subtype: 'mcp_message', server_name: 'breezell', message } });
	mcp('r1', { jsonrpc: '2.0', id: 1, method: 'tools/list' });
	const ask = (id, name, input, toolUseId) => child.say({ type: 'control_request', request_id: id, request: { subtype: 'can_use_tool', tool_name: name, tool_use_id: toolUseId, input } });
	ask('p1', 'mcp__breezell__edit_file', { uri: '/w/a.ts', old_string: 'a', new_string: 'b' }, 'e1');
	ask('p2', 'mcp__breezell__edit_file', { uri: '/w/a.ts', old_string: 'x', new_string: 'x', edits: [{ old_string: 'c', new_string: 'd' }, { old_string: 'e', new_string: 'f', replace_all: true }] }, 'e2');
	ask('p3', 'mcp__breezell__write_to_file', { uri: '/w/new.ts', content: 'export {}\n' }, 'w1');
	await tick();
	mcp('r2', { jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'edit_file', arguments: { uri: '/w/a.ts', old_string: 'a', new_string: 'b' }, _meta: { 'claudecode/toolUseId': 'e1' } } });
	await new Promise(resolve => setTimeout(resolve, 20));
	child.say({ type: 'result', subtype: 'success', session_id: 's-1' });
	child.end(0);
	await running;
	const listed = answers.find(r => r.request_id === 'r1').response.mcp_response.result.tools;
	assert.deepEqual(listed.map(t => [t.name, t._meta?.['anthropic/alwaysLoad'] === true]), [['run_terminal_cmd', true], ['edit_file', true], ['write_to_file', true]]);
	assert.ok(listed[1].description.includes('keep or undo'));
	assert.deepEqual(asked.map(r => [r.toolId, r.kind, r.view]), [
		['e1', 'edit', { kind: 'edit', path: '/w/a.ts', edits: [{ oldString: 'a', newString: 'b' }] }],
		['e2', 'edit', { kind: 'edit', path: '/w/a.ts', edits: [{ oldString: 'c', newString: 'd' }, { oldString: 'e', newString: 'f', replaceAll: true }] }],
		['w1', 'edit', { kind: 'create', path: '/w/new.ts', content: 'export {}\n' }],
	], 'Breezell\'s edit card, with the change (several: the batch, not the mirrored first)');
	assert.deepEqual(calls, [['edit_file', 'e1']]);
	// Offered the terminal alone: its edits stay its own.
	const shellOnly = fakeChild();
	const shellRun = agent.runTurn(target(shellOnly), { model: 'opus', text: 'go', attachments: [], cwd: '/w' }, replyLog().reply, token(), p => p, undefined, { breezellTools: [{ name: 'run_terminal_cmd', inputSchema: schema }], callBreezellTool: async () => ({ text: '' }) });
	await tick();
	assert.equal(shellOnly.args[shellOnly.args.indexOf('--disallowedTools') + 1], 'Bash,Monitor');
	shellOnly.say({ type: 'result', subtype: 'success', session_id: 's-2' });
	shellOnly.end(0);
	await shellRun;
});

test('Breezell\'s notices go with the message; with no message of the user\'s, they are the message', () => {
	const notices = ['[Background command finished] npm test exited 0'];
	const withMessage = agent.promptOf({ text: 'fix it', attachments: [], notices }, p => p);
	assert.ok(withMessage.startsWith('fix it\n\n<breezell-notices>\nFrom Breezell, not from the user:'));
	assert.ok(withMessage.includes('npm test exited 0'));
	const alone = agent.promptOf({ text: '', attachments: [], notices }, p => p);
	assert.ok(alone.startsWith('No new message from the user.'));
	assert.ok(alone.includes('<breezell-notices>'));
	assert.equal(agent.promptOf({ text: 'fix it', attachments: [] }, p => p), 'fix it', 'none: the message alone');
});

test('a subagent\'s call is not told half-written: its task names its page', async () => {
	const child = fakeChild();
	const tools = [];
	const reply = { text() {}, reasoning() {}, session() {}, tool: t => tools.push(t), approve: async () => true };
	const running = agent.runTurn(target(child), { model: 'opus', text: 'go', attachments: [], cwd: '/w' }, reply, token());
	await tick();
	child.say({ type: 'stream_event', event: { type: 'content_block_start', index: 0, content_block: { type: 'tool_use', id: 'a1', name: 'Agent', input: {} } } });
	child.say({ type: 'stream_event', event: { type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: '{"description":"Read the' } } });
	child.say({ type: 'stream_event', event: { type: 'content_block_stop', index: 0 } });
	child.say({ type: 'assistant', message: { id: 'm1', content: [{ type: 'tool_use', id: 'a1', name: 'Agent', input: { description: 'Read the README', prompt: 'Read README.md' } }] } });
	child.say({ type: 'result', subtype: 'success', session_id: 's-1' });
	await tick();
	child.end(0);
	await running;
	assert.deepEqual(tools.map(t => t.view?.description), ['Read the README']);
});

test('a subagent\'s first message names the model it runs on: told with its call, as one of the plugin\'s models', async () => {
	const child = fakeChild();
	const tools = [];
	const reply = { text() {}, reasoning() {}, session() {}, tool: t => tools.push(t), approve: async () => true };
	const controls = { modelIdOf: model => model === 'claude-haiku-5-5' ? 'haiku' : undefined };
	const running = agent.runTurn(target(child), { model: 'opus', text: 'go', attachments: [], cwd: '/w' }, reply, token(), p => p, undefined, controls);
	await tick();
	child.say({ type: 'assistant', message: { id: 'm1', model: 'claude-opus-5-5', content: [{ type: 'tool_use', id: 'a1', name: 'Agent', input: { description: 'Look', prompt: 'Look around' } }] } });
	child.say({ type: 'assistant', parent_tool_use_id: 'a1', message: { id: 's1', model: 'claude-haiku-5-5', content: [{ type: 'tool_use', id: 'r1', name: 'Read', input: { file_path: '/w/a' } }] } });
	child.say({ type: 'assistant', parent_tool_use_id: 'a1', message: { id: 's2', model: 'claude-haiku-5-5', content: [{ type: 'text', text: 'ok' }] } });
	child.say({ type: 'result', subtype: 'success', session_id: 's-1' });
	await tick();
	child.end(0);
	await running;
	const told = tools.filter(t => t.id === 'a1' && t.view?.model);
	assert.deepEqual(told.map(t => t.view.model), ['haiku'], 'once, by the plugin\'s own id for it');
	assert.deepEqual(agent.modelsOfInitialize([{ value: 'haiku', displayName: 'Haiku 5.5', resolvedModel: 'claude-haiku-5-5' }])[0].resolved, 'claude-haiku-5-5');
});
