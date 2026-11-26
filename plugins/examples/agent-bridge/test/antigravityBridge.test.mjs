// Antigravity CLI's tile against a fake `vscode` and a fake agy: nothing runs while its switch is off; on, it asks
// agy and says what it found on the tile's page, puts agy's models in the picker (each Gemini model once, its effort
// levels in the menu), and answers a turn with agy, Breezell's tools served on the loopback for it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fakeChild } from './fake-child.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const require = createRequire(import.meta.url);
const esbuild = require('esbuild');

async function load() {
	const out = mkdtempSync(join(tmpdir(), 'agent-bridge-agyext-'));
	await esbuild.build({ entryPoints: [join(root, 'src/extension.ts')], bundle: true, platform: 'node', format: 'cjs', outfile: join(out, 'extension.cjs'), logLevel: 'silent', alias: { vscode: join(root, 'test/vscode-stub.cjs') } });
	const ext = require(join(out, 'extension.cjs'));
	rmSync(out, { recursive: true, force: true });
	return ext;
}

const emitter = () => {
	const listeners = [];
	const event = l => { listeners.push(l); return { dispose() { listeners.splice(listeners.indexOf(l), 1); } }; };
	event.fire = v => [...listeners].forEach(l => l(v));
	return event;
};
const uriOf = (scheme, authority, path) => ({ scheme, authority, path, fsPath: path, with: c => uriOf(c.scheme ?? scheme, c.authority ?? authority, c.path ?? path), toString: () => `${scheme}://${authority}${path}` });
const Uri = {
	parse: text => { const m = /^([a-zA-Z][\w+.-]*):\/\/([^/?#]*)([^?#]*)/.exec(text); return uriOf(m[1], decodeURIComponent(m[2]), decodeURIComponent(m[3] || '/')); },
	file: fsPath => uriOf('file', '', fsPath),
};

function fakeVscode(enabled) {
	const config = { 'antigravity.enabled': enabled };
	const configChanged = emitter();
	const commands = new Map();
	const reported = [];
	const agentLog = { agents: new Map(), models: [] };
	const api = {
		Uri,
		env: { language: 'en' },
		breezell: {
			language: 'zh-TW',
			onDidChangeLanguage: emitter(),
			chat: { onDidStartTurn: emitter() },
			ui: { setSignInStatus: async (tile, status) => { reported.push([tile, status === undefined ? undefined : JSON.parse(JSON.stringify(status))]); } },
			agents: {
				register: (tile, agent) => { agentLog.agents.set(tile, agent); return { dispose() { agentLog.agents.delete(tile); } }; },
				setModels: async (tile, models) => { agentLog.models.push([tile, models]); },
				importConversation: async () => 'created',
				onDidDeleteConversations: emitter(),
			},
		},
		commands: { registerCommand: (id, run) => { commands.set(id, run); return { dispose() { commands.delete(id); } }; } },
		workspace: {
			getConfiguration: section => ({ get: (key, fallback) => (section === 'agentBridge' && key in config ? config[key] : fallback) }),
			onDidChangeConfiguration: configChanged,
			onDidChangeWorkspaceFolders: emitter(),
			workspaceFolders: undefined,
		},
		window: { onDidChangeWindowState: emitter(), showInformationMessage: async () => { }, showWarningMessage: async () => { } },
	};
	const turnOn = () => { config['antigravity.enabled'] = true; configChanged.fire({ affectsConfiguration: name => name === 'agentBridge.antigravity.enabled' }); };
	return { api, commands, reported, agentLog, turnOn, config };
}

const MODELS = 'gemini-4-hydrogen-high\tGemini 4 Hydrogen (High)\ngemini-4-hydrogen-low\tGemini 4 Hydrogen (Low)\nclaude-sonnet-4-6\tClaude Sonnet 4.6 (Thinking)\n';
// What agy 1.5.17's `/usage` prints (its own command: no model request).
const USAGE = 'Gemini Models\tWeekly Limit Remaining\t97%\t2026-12-02T09:56:31Z\nGemini Models\tFive Hour Limit Remaining\t96%\t2026-11-25T14:56:31Z\nClaude and GPT models\tWeekly Limit Remaining\t100%\t2026-12-02T11:26:44Z\nClaude and GPT models\tFive Hour Limit Remaining\t100%\t2026-11-25T16:26:44Z\n';
const settle = () => new Promise(resolve => setTimeout(resolve, 0));

async function start(enabled, { home = '/home/u', memento } = {}) {
	const vs = fakeVscode(enabled);
	globalThis.__vscode = vs.api;
	const ext = await load();
	const calls = [];
	const run = async (file, args) => {
		calls.push([file, args.join(' ')]);
		if (file !== `${home}/.local/bin/agy`) {
			return { code: 127, stdout: '', stderr: '' };
		}
		return args[0] === '--version' ? { code: 0, stdout: '1.5.17\n', stderr: '' } : args[0] === '-p' ? { code: 0, stdout: USAGE, stderr: '' } : { code: 0, stdout: MODELS, stderr: 'Fetching available models...\n' };
	};
	const started = [];
	const storage = mkdtempSync(join(tmpdir(), 'agent-bridge-agystore-'));
	const context = { subscriptions: [] };
	ext.activate(context, { run, env: { PATH: '/bin' }, platform: 'linux', home, isFile: f => f === `${home}/.local/bin/agy`, storageDir: storage, ...(memento ? { memento } : {}), start: (file, args, options) => { const child = fakeChild(); started.push({ file, args, cwd: options.cwd, child }); return child; } });
	await settle();
	return { vs, calls, started, storage, context };
}

test('switched off: nothing of agy runs and nothing is said on its tile', async () => {
	const { vs, calls, context, storage } = await start(false);
	assert.deepEqual(calls, []);
	assert.deepEqual(vs.reported.filter(([tile]) => tile === 'antigravity'), []);
	assert.ok(vs.commands.has('agentBridge.antigravity.recheck'));
	context.subscriptions.forEach(s => s.dispose());
	assert.equal(vs.commands.size, 0);
	rmSync(storage, { recursive: true, force: true });
});

test('switched on: what agy says, on its page; its models in the picker; a turn answered by agy with Breezell\'s tools on the loopback', async () => {
	const { vs, calls, started, storage, context } = await start(false);
	vs.turnOn();
	const shownOf = () => vs.reported.filter(([tile]) => tile === 'antigravity').map(r => r[1]);
	for (let i = 0; i < 200 && !shownOf().at(-1)?.usage; i++) {
		await new Promise(resolve => setTimeout(resolve, 5));
	}
	assert.deepEqual(calls.map(c => c[1]), ['--version', 'models', '-p /usage'], 'its limits through its own /usage, after the check');
	const shown = shownOf();
	assert.deepEqual(shown[0], { connected: false, busy: true });
	const account = [{ label: '登入方式', value: 'Google 帳號' }, { label: 'Antigravity CLI 版本', value: '1.5.17' }, { label: '程式位置', value: '/home/u/.local/bin/agy' }, { label: '模型', value: '可用 3 個' }, { label: '常駐程序', value: '關閉' }];
	assert.deepEqual(shown.at(-2), { connected: true, account }, 'connected at once, its limits a moment later');
	const { usage, ...rest } = shown.at(-1);
	assert.deepEqual(rest, { connected: true, account });
	assert.deepEqual(usage.map(u => [u.label, u.percent]), [['5 小時限額（Gemini 模型）', 4], ['每週限額（Gemini 模型）', 3], ['5 小時限額（Claude 與 GPT 模型）', 0], ['每週限額（Claude 與 GPT 模型）', 0]], 'how much is used; five hours before the week');
	assert.ok(usage.every(u => /^重設時間：/.test(u.detail)), 'when each resets, in this computer\'s time');
	assert.deepEqual(vs.agentLog.models.at(-1), ['antigravity', [
		{ id: 'gemini-4-hydrogen', title: 'Gemini 4 Hydrogen', family: 'gemini', efforts: ['low', 'high'] },
		{ id: 'claude-sonnet-4-6', title: 'Claude Sonnet 4.6 (Thinking)', family: 'claude' },
	]]);

	// a turn: agy in the conversation's folder, at the level picked, Breezell's tools served for it on 127.0.0.1
	const agent = vs.agentLog.agents.get('antigravity');
	assert.ok(agent, 'registered for its tile');
	const ran = [];
	const reply = {
		text: () => { }, reasoning: () => { }, thinking: () => { }, tool: () => { }, session: () => { }, usage: () => { },
		approve: async () => true,
		breezellTools: async () => [{ name: 'run_terminal_cmd', inputSchema: { type: 'object', properties: {}, required: [] }, shell: 'linux | bash' }],
		callBreezellTool: async (name, input, id) => { ran.push([name, input, id]); return { text: 'exit 0' }; },
	};
	const token = { isCancellationRequested: false, onCancellationRequested: () => ({ dispose() { } }) };
	const turn = agent.runTurn({ conversationId: 'conv-1', model: 'gemini-4-hydrogen', effort: 'low', text: 'Run the tests', attachments: [], folders: ['file:///proj'] }, reply, token);
	for (let i = 0; i < 200 && !started.some(s => s.file === '/home/u/.local/bin/agy'); i++) {
		await new Promise(resolve => setTimeout(resolve, 5));
	}
	const agy = started.find(s => s.file === '/home/u/.local/bin/agy');
	assert.equal(agy.cwd, '/proj');
	assert.deepEqual(agy.args.slice(agy.args.indexOf('--model'), agy.args.indexOf('--model') + 2), ['--model', 'gemini-4-hydrogen-low']);
	const toolsFolder = agy.args[agy.args.indexOf('--add-dir') + 1];
	assert.ok(toolsFolder.startsWith(join(storage, 'antigravity', 'conversations')), 'a folder of the plugin\'s own, nothing in agy\'s settings');
	const server = JSON.parse(readFileSync(join(toolsFolder, '.agents', 'mcp_config.json'), 'utf8')).mcpServers.breezell;
	assert.match(server.serverUrl, /^http:\/\/127\.0\.0\.1:\d+\/mcp\/[0-9a-f]{24}$/);

	// as agy calls it: over HTTP, with the turn's token
	const post = body => fetch(server.serverUrl, { method: 'POST', headers: { 'content-type': 'application/json', ...server.headers }, body: JSON.stringify(body) }).then(r => r.json());
	assert.deepEqual((await post({ jsonrpc: '2.0', id: 1, method: 'tools/list' })).result.tools.map(t => t.name), ['run_terminal_cmd']);
	const called = await post({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'run_terminal_cmd', arguments: { command: 'npm test' }, _meta: { 'antigravity.google/conversation_id': 'c9', progressToken: 'x:3' } } });
	assert.equal(called.result.content[0].text, 'exit 0');
	assert.deepEqual(ran, [['run_terminal_cmd', { command: 'npm test' }, 'c9:3']]);

	agy.child.say({ event: 'init', conversation_id: 'c9', init: {} });
	agy.child.say({ event: 'result', result: { conversation_id: 'c9', status: 'SUCCESS' } });
	agy.child.end(0);
	assert.deepEqual(await turn, { session: 'c9' });
	await assert.rejects(fetch(server.serverUrl, { method: 'POST', headers: server.headers, body: '{}' }), 'the turn over: its server is gone');
	context.subscriptions.forEach(s => s.dispose());
	rmSync(storage, { recursive: true, force: true });
});

test('a conversation deleted in Breezell: deleted in agy with its subagents\' only while "Delete in Antigravity CLI too" is on; what the plugin kept of it goes either way', async () => {
	const home = mkdtempSync(join(tmpdir(), 'agent-bridge-agyhome-'));
	const agyHome = join(home, '.gemini', 'antigravity-cli');
	const LEAD = 'c57725ba-6ee2-4643-80a1-1e64838730ef';
	const SUB = '2099a005-07fe-4e09-8dc2-dd5f6d144b97';
	for (const [id, first] of [[LEAD, { step_index: 0, type: 'USER_INPUT', content: `Started ${SUB}` }], [SUB, { step_index: 0, type: 'SYSTEM_MESSAGE', content: `Report to ${LEAD}` }]]) {
		mkdirSync(join(agyHome, 'brain', id, '.system_generated', 'logs'), { recursive: true });
		writeFileSync(join(agyHome, 'brain', id, '.system_generated', 'logs', 'transcript_full.jsonl'), `${JSON.stringify(first)}\n`);
		mkdirSync(join(agyHome, 'conversations'), { recursive: true });
		writeFileSync(join(agyHome, 'conversations', `${id}.db`), 'x');
	}
	const kept = new Map([[`antigravity.ownMcpTold.${LEAD}`, true]]);
	const memento = { get: key => kept.get(key), update: async (key, value) => { if (value === undefined) kept.delete(key); else kept.set(key, value); } };
	const { vs, storage, context } = await start(true, { home, memento });
	for (let i = 0; i < 200 && !vs.agentLog.agents.get('antigravity'); i++) {
		await new Promise(resolve => setTimeout(resolve, 5));
	}
	const deleted = vs.api.breezell.agents.onDidDeleteConversations;
	const afterDelete = async e => { deleted.fire(e); for (let i = 0; i < 20; i++) await settle(); await new Promise(resolve => setTimeout(resolve, 30)); };
	// Off (the default): agy keeps them; the plugin's note of the session goes.
	await afterDelete({ tileId: 'antigravity', conversations: [{ session: LEAD }] });
	assert.ok(existsSync(join(agyHome, 'conversations', `${LEAD}.db`)) && existsSync(join(agyHome, 'brain', SUB)));
	assert.equal(kept.size, 0);
	// Another tile's conversations: none of agy's.
	vs.config['antigravity.deleteConversations'] = true;
	await afterDelete({ tileId: 'claudeCode', conversations: [{ session: LEAD }] });
	assert.ok(existsSync(join(agyHome, 'conversations', `${LEAD}.db`)));
	// On: it and its subagent's.
	await afterDelete({ tileId: 'antigravity', conversations: [{ session: LEAD }] });
	for (const id of [LEAD, SUB]) {
		assert.ok(!existsSync(join(agyHome, 'conversations', `${id}.db`)) && !existsSync(join(agyHome, 'brain', id)), `${id} gone`);
	}
	context.subscriptions.forEach(s => s.dispose());
	rmSync(storage, { recursive: true, force: true });
	rmSync(home, { recursive: true, force: true });
});
