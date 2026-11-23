// Bringing a window's Claude Code conversations into Breezell, against fake session files and a fake
// importConversation: what is read, what is sent, what the page is told, and what is not read again.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, posix, win32 } from 'node:path';

const root = fileURLToPath(new URL('..', import.meta.url));
const require = createRequire(import.meta.url);
const esbuild = require('esbuild');
const out = mkdtempSync(join(tmpdir(), 'agent-bridge-sync-'));
await esbuild.build({ entryPoints: [join(root, 'src/sync.ts')], bundle: true, platform: 'node', format: 'cjs', outfile: join(out, 'sync.cjs'), logLevel: 'silent' });
const { SessionSync } = require(join(out, 'sync.cjs'));
rmSync(out, { recursive: true, force: true });
/** texts.ts, which says what a sync came to. */
const texts = async () => {
	const dir = mkdtempSync(join(tmpdir(), 'agent-bridge-texts-'));
	await esbuild.build({ entryPoints: [join(root, 'src/texts.ts')], bundle: true, platform: 'node', format: 'cjs', outfile: join(dir, 'texts.cjs'), logLevel: 'silent' });
	const tx = require(join(dir, 'texts.cjs'));
	rmSync(dir, { recursive: true, force: true });
	return tx;
};

const CWD = '/home/u/proj';
const record = (type, uuid, content) => JSON.stringify({ type, uuid, cwd: CWD, timestamp: '2026-11-21T10:00:00.000Z', message: { role: type, model: 'claude-sonnet-5-5', content } });
const SESSION = [record('user', 'u1', 'hello'), record('assistant', 'a1', [{ type: 'text', text: 'hi' }])].join('\n');

function setup({ folders = ['vscode-remote://wsl%2BUbuntu/home/u/proj'], configDir = '\\\\wsl$\\Ubuntu\\home\\u\\.claude', statuses = {}, nameOf } = {}) {
	const target = { where: 'wsl', distro: 'Ubuntu', configDir: async () => configDir ?? undefined };
	const states = [];
	const sent = [];
	const reads = [];
	const listed = [];
	const files = [{ id: 's-1', file: 'F1', mtimeMs: 1, size: 10 }, { id: 's-2', file: 'F2', mtimeMs: 1, size: 10 }];
	const texts = { F1: SESSION, F2: '' };
	let clock = 1000;
	const sync = new SessionSync({
		target: () => target,
		importer: () => async conversation => { sent.push(conversation); return statuses[conversation.session] ?? 'created'; },
		folders: () => folders,
		...(nameOf ? { nameOf } : {}),
		cwdOf: () => CWD,
		titleOf: () => undefined,
		now: () => clock,
		changed: state => states.push(state),
		list: async (dir, joinPath) => { listed.push([dir, joinPath === win32.join ? 'win32' : joinPath === posix.join ? 'posix' : '?']); return files; },
		read: async file => { reads.push(file); return texts[file]; },
	});
	return { sync, states, sent, reads, listed, files, texts, target, tick: ms => { clock += ms; } };
}

test('each session of the window\'s folder goes to Breezell with the folder as Breezell names it; the page is told how many', async () => {
	const s = setup();
	await s.sync.run(true);
	assert.deepEqual(s.listed, [['\\\\wsl$\\Ubuntu\\home\\u\\.claude\\projects\\-home-u-proj', 'win32']], 'Claude Code\'s folder of this project, reached from Windows');
	assert.deepEqual(s.sent.map(c => [c.session, c.folder, c.title, c.model, c.messages.map(m => m.entry)]), [['s-1', 'vscode-remote://wsl%2BUbuntu/home/u/proj', 'hello', 'sonnet', ['u1', 'a1']]]);
	assert.deepEqual(s.states.map(st => st.kind), ['running', 'done']);
	assert.deepEqual({ ...s.states[1], at: 0 }, { kind: 'done', found: 1, created: 1, updated: 0, at: 0 }, 'the empty file is no conversation');
});

test('a file read before is read again only once it changed; one running a turn in Breezell is read again', async () => {
	const s = setup({ statuses: { 's-1': 'busy' } });
	await s.sync.run(false);
	assert.deepEqual(s.states.map(st => st.kind), ['done'], 'a quiet sync does not say it runs');
	await s.sync.run(false);
	assert.deepEqual(s.reads, ['F1', 'F2', 'F1'], 'F2 settled (nothing in it), F1 busy: read again');
	const t = setup({ statuses: { 's-1': 'unchanged' } });
	await t.sync.run(false);
	await t.sync.run(false);
	assert.deepEqual(t.reads, ['F1', 'F2'], 'nothing read twice');
	assert.equal(t.states.at(-1).found, 1, 'still counted');
	t.files[0] = { ...t.files[0], mtimeMs: 2 };
	await t.sync.run(false);
	assert.deepEqual(t.reads, ['F1', 'F2', 'F1'], 'changed: read again');
	t.sync.forget();
	await t.sync.run(false);
	assert.equal(t.reads.length, 5, 'forgotten (another Claude Code, signed out): all read again');
});

test('due: before the first sync, then once the time has passed', async () => {
	const s = setup();
	assert.equal(s.sync.due(120_000), true);
	await s.sync.run(false);
	assert.equal(s.sync.due(120_000), false);
	s.tick(120_000);
	assert.equal(s.sync.due(120_000), true);
});

test('no folder open, its config folder not found, Breezell refusing: the page says so', async () => {
	const none = setup({ folders: [] });
	await none.sync.run(true);
	assert.deepEqual(none.states, [{ kind: 'noFolder' }]);
	const lost = setup({ configDir: null });
	await lost.sync.run(true);
	assert.equal(lost.states.at(-1).kind, 'failed');
	const refused = setup();
	const sync = new SessionSync({ ...refused.sync.deps, importer: () => async () => { throw new Error('not allowed'); } });
	await sync.run(true);
	assert.deepEqual(refused.states.at(-1), { kind: 'failed', message: 'not allowed' });
});

test('syncs asked for while one runs make one more after it, not one each', async () => {
	const s = setup();
	const first = s.sync.run(false);
	s.sync.run(false);
	s.sync.run(true);
	await first;
	await new Promise(resolve => setTimeout(resolve, 0));
	assert.equal(s.listed.length, 2);
	assert.ok(s.states.some(st => st.kind === 'running'), 'the second wanted to say it runs');
});

test('a subagent call goes with its subagent\'s own messages, read from its file beside the session\'s', async () => {
	const sidechain = (type, uuid, content) => JSON.stringify({ type, uuid, cwd: CWD, isSidechain: true, agentId: 'abc123', timestamp: '2026-11-21T10:00:00.000Z', message: { role: type, content } });
	const main = [
		record('user', 'u1', 'check it'),
		record('assistant', 'a1', [{ type: 'tool_use', id: 't1', name: 'Agent', input: { description: 'Check', prompt: 'Look' } }]),
		JSON.stringify({ type: 'user', uuid: 'u2', cwd: CWD, timestamp: '2026-11-21T10:00:00.000Z', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 't1', content: 'framed' }] }, toolUseResult: { agentId: 'abc123', content: [{ type: 'text', text: 'Fine.' }] } }),
		record('assistant', 'a2', [{ type: 'text', text: 'Done.' }]),
	].join('\n');
	const sub = [sidechain('user', 's0', 'Look'), sidechain('assistant', 's1', [{ type: 'text', text: 'Looked.' }])].join('\n');
	const s = setup();
	s.texts.F1 = main;
	const read = [];
	const sync = new SessionSync({ ...s.sync.deps, read: async file => { read.push(file); return file === 'F1' ? main : file === 'F2' ? '' : file.endsWith('\\s-1\\subagents\\agent-abc123.jsonl') ? sub : Promise.reject(new Error('missing')); } });
	await sync.run(true);
	const call = s.sent[0].messages.find(m => m.id === 't1');
	assert.deepEqual(call.subagent.messages.map(m => [m.role, m.text]), [['user', 'Look'], ['assistant', 'Looked.']]);
	assert.equal(call.agentId, undefined, 'the file\'s name is not sent');
	assert.ok(read.includes('\\\\wsl$\\Ubuntu\\home\\u\\.claude\\projects\\-home-u-proj\\s-1\\subagents\\agent-abc123.jsonl'), read.join(' | '));
});

test('what the page and the notice say: the projects synced, by the names the window gives them', async () => {
	const s = setup({ folders: ['vscode-remote://wsl%2BUbuntu/home/u/proj', 'file:///w/two'], nameOf: folder => folder.endsWith('/proj') ? 'Proj' : 'two' });
	await s.sync.run(true);
	assert.deepEqual(s.states.map(st => [st.kind, st.projects]), [['running', ['Proj', 'two']], ['done', ['Proj', 'two']]]);
	const tx = await texts();
	const tw = tx.TEXTS['zh-tw'];
	assert.match(tx.syncLine(s.states[1], tw), /^「Proj」、「two」有 2 個，新增 1 個，更新 0 個 · /);
	assert.deepEqual(tx.syncNotice(s.states[1], tw), { text: '已把「Proj」、「two」的 Claude Code 對話同步到它的對話清單：共 2 個，新增 1 個，更新 0 個。', warning: false });
	assert.match(tx.syncLine({ kind: 'done', found: 0, created: 0, updated: 0, at: 0 }, tx.TEXTS.en), /^this project has no Claude Code conversations yet · /, 'names unknown: this project');
	assert.equal(tx.syncNotice({ kind: 'running' }, tw), undefined, 'none while it runs');
	assert.deepEqual(tx.syncNotice({ kind: 'failed', message: 'boom' }, tw), { text: 'Claude Code 對話同步失敗：boom', warning: true });
	assert.equal(tx.syncNotice({ kind: 'noFolder' }, tx.TEXTS['zh-cn']).text, tx.TEXTS['zh-cn'].syncNoFolderNotice);
});
