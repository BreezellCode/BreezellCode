// Claude Code's session files, as this plugin reads them: a synthetic session in the shape Claude
// Code 2.1.330 writes (checked against a session of its own made for the purpose, not a user's).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { existsSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync, utimesSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const root = fileURLToPath(new URL('..', import.meta.url));
const require = createRequire(import.meta.url);
const esbuild = require('esbuild');
const out = mkdtempSync(join(tmpdir(), 'agent-bridge-sessions-'));
await esbuild.build({ entryPoints: [join(root, 'src/sessions.ts')], bundle: true, platform: 'node', format: 'cjs', outfile: join(out, 'sessions.cjs'), logLevel: 'silent' });
const sessions = require(join(out, 'sessions.cjs'));
rmSync(out, { recursive: true, force: true });

const CWD = '/home/u/proj';
const at = minute => `2026-11-21T10:${String(minute).padStart(2, '0')}:00.000Z`;
const user = (uuid, content, extra = {}) => ({ type: 'user', uuid, cwd: CWD, sessionId: 's', timestamp: at(1), isSidechain: false, message: { role: 'user', content }, ...extra });
const assistant = (uuid, content, extra = {}) => ({ type: 'assistant', uuid, cwd: CWD, sessionId: 's', timestamp: at(2), isSidechain: false, message: { role: 'assistant', model: 'claude-opus-5-5', content }, ...extra });
const lines = records => records.map(r => JSON.stringify(r)).join('\n') + '\n';
const titleOf = (name, input) => input?.command ?? input?.file_path;

const SESSION = [
	{ type: 'session-owner' }, { type: 'queue-operation', operation: 'enqueue' },
	user('u1', 'Fix the failing test\nin a.test.ts'),
	{ type: 'attachment', uuid: 'x1', cwd: CWD },
	assistant('a1', [{ type: 'thinking', thinking: 'Look first.' }]),
	assistant('a2', [{ type: 'text', text: 'Running it.' }]),
	assistant('a3', [{ type: 'tool_use', id: 't1', name: 'Bash', input: { command: 'npm test' } }]),
	user('u2', [{ type: 'tool_result', tool_use_id: 't1', content: [{ type: 'text', text: '1 failing' }], is_error: true }]),
	user('u3', '<command-name>/model</command-name>'),
	user('u4', '[Request interrupted by user]'),
	user('u5', 'meta', { isMeta: true }),
	assistant('a4', [{ type: 'text', text: 'From a subagent' }], { isSidechain: true }),
	user('u6', 'Elsewhere', { cwd: '/home/u/other' }),
	assistant('a5', [{ type: 'text', text: 'Fixed it.' }]),
	{ type: 'cost-state' }, 'not json',
];

test('a session\'s conversation: the user\'s words, the reply and its thinking, each call with its result; nothing else', () => {
	const read = sessions.parseSession('s-1', lines(SESSION), CWD, titleOf);
	assert.equal(read.id, 's-1');
	assert.equal(read.title, 'Fix the failing test');
	assert.equal(read.model, 'opus');
	assert.deepEqual(read.messages.map(m => [m.entry, m.role, m.text ?? '', m.reasoning ?? '', m.status ?? '', m.output ?? '', m.title ?? '']), [
		['u1', 'user', 'Fix the failing test\nin a.test.ts', '', '', '', ''],
		['a1', 'assistant', '', 'Look first.', '', '', ''],
		['a2', 'assistant', 'Running it.', '', '', '', ''],
		['a3', 'tool', '', '', 'error', '1 failing', 'npm test'],
		['a5', 'assistant', 'Fixed it.', '', '', '', ''],
	]);
	assert.equal(read.messages[0].at, Date.parse(at(1)));
});

test('a call still waiting for its result ends the conversation there, until a later read', () => {
	const waiting = [...SESSION.slice(0, 7), assistant('a9', [{ type: 'text', text: 'after' }])];
	const read = sessions.parseSession('s-1', lines(waiting), CWD, titleOf);
	assert.deepEqual(read.messages.map(m => m.entry), ['u1', 'a1', 'a2']);
});

test('nothing to bring: no user words, or no reply yet, or another folder\'s', () => {
	assert.equal(sessions.parseSession('s', lines([user('u1', 'hello')]), CWD, titleOf), undefined);
	assert.equal(sessions.parseSession('s', lines([assistant('a1', [{ type: 'text', text: 'hi' }])]), CWD, titleOf), undefined);
	assert.equal(sessions.parseSession('s', lines(SESSION), '/home/u', titleOf), undefined);
});

test('a summary names it; a long first line is cut', () => {
	const summary = sessions.parseSession('s', lines([{ type: 'summary', summary: 'Test fix', leafUuid: 'a5' }, ...SESSION]), CWD, titleOf);
	assert.equal(summary.title, 'Test fix');
	const long = sessions.parseSession('s', lines([user('u1', 'x'.repeat(200)), assistant('a1', [{ type: 'text', text: 'ok' }])]), CWD, titleOf);
	assert.equal(long.title.length, sessions.SESSION_LIMITS.titleChars);
});

test('folders: Claude Code\'s name for them, and a Windows folder is the same whatever its case', () => {
	assert.equal(sessions.projectDirName('/home/u/my proj.v2'), '-home-u-my-proj-v2');
	assert.equal(sessions.projectDirName('C:\\Users\\u\\p'), 'C--Users-u-p');
	assert.equal(sessions.projectDirName('/mnt/c/中文'), '-mnt-c---');
	assert.ok(sessions.sameFolder('C:\\Users\\U\\p', 'c:\\users\\u\\p\\'));
	assert.ok(sessions.sameFolder('/home/u/p/', '/home/u/p'));
	assert.ok(!sessions.sameFolder('/home/u/P', '/home/u/p'), 'Linux folders keep their case');
	assert.equal(sessions.modelAlias('claude-sonnet-5-5[1m]'), 'sonnet');
	assert.equal(sessions.modelAlias('gpt'), undefined);
});

test('a project\'s session files: sessions only, newest first, too big ones left alone, none when there is no folder', async () => {
	const dir = mkdtempSync(join(tmpdir(), 'agent-bridge-project-'));
	try {
		const older = '11111111-1111-4111-8111-111111111111';
		const newer = '22222222-2222-4222-8222-222222222222';
		writeFileSync(join(dir, `${older}.jsonl`), lines(SESSION));
		writeFileSync(join(dir, `${newer}.jsonl`), lines(SESSION));
		writeFileSync(join(dir, 'notes.jsonl'), '');
		writeFileSync(join(dir, `${newer}.json`), '');
		utimesSync(join(dir, `${older}.jsonl`), new Date(2026, 1, 1), new Date(2026, 1, 1));
		const files = await sessions.listSessionFiles(dir);
		assert.deepEqual(files.map(f => f.id), [newer, older]);
		assert.deepEqual(await sessions.listSessionFiles(join(dir, 'missing')), []);
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});

test('deleting a session: its file and its folder go, links in it are not followed, the rest of the project stays', async () => {
	const root = mkdtempSync(join(tmpdir(), 'agent-bridge-delete-'));
	try {
		const session = '33333333-3333-4333-8333-333333333333';
		const other = '44444444-4444-4444-8444-444444444444';
		const project = join(root, 'projects', sessions.projectDirName('/home/u/proj'));
		const outside = join(root, 'outside');
		mkdirSync(join(project, session, 'subagents'), { recursive: true });
		mkdirSync(join(project, 'memory'), { recursive: true });
		mkdirSync(outside);
		writeFileSync(join(outside, 'keep.txt'), 'keep');
		writeFileSync(join(project, `${session}.jsonl`), '{}');
		writeFileSync(join(project, session, 'subagents', 'agent-a.jsonl'), '{}');
		symlinkSync(outside, join(project, session, 'link'));
		writeFileSync(join(project, `${other}.jsonl`), '{}');
		writeFileSync(join(project, 'memory', 'MEMORY.md'), 'm');
		assert.equal(await sessions.deleteSession(root, '/home/u/proj', session), true);
		assert.ok(!existsSync(join(project, `${session}.jsonl`)) && !existsSync(join(project, session)), 'its file and folder');
		assert.ok(existsSync(join(outside, 'keep.txt')), 'what a link pointed at is left alone');
		assert.ok(existsSync(join(project, `${other}.jsonl`)) && existsSync(join(project, 'memory', 'MEMORY.md')), 'other sessions and the memory stay');
		assert.equal(await sessions.deleteSession(root, '/home/u/proj', session), false, 'nothing left to delete');
		assert.equal(await sessions.deleteSession(root, '/home/u/proj', '../memory'), false, 'only a session id');
		assert.equal(await sessions.deleteSession(root, undefined, other), true, 'found in whichever project has it');
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test('a session\'s calls as Breezell draws its own: from Claude Code\'s record of each result, its files as Breezell opens them; its tool lookups not at all', () => {
	const records = [
		user('u1', 'Fix the sum'),
		assistant('a1', [{ type: 'tool_use', id: 'ts', name: 'ToolSearch', input: { query: 'select:Edit' } }]),
		user('u2', [{ type: 'tool_result', tool_use_id: 'ts', content: 'found' }], { toolUseResult: { matches: ['Edit'] } }),
		assistant('a2', [{ type: 'tool_use', id: 'e1', name: 'Edit', input: { file_path: '/home/u/proj/math.js', old_string: 'a - b', new_string: 'a + b' } }]),
		user('u3', [{ type: 'tool_result', tool_use_id: 'e1', content: 'updated' }], { toolUseResult: { filePath: '/home/u/proj/math.js', oldString: 'a - b', newString: 'a + b', originalFile: 'return a - b', replaceAll: false } }),
		assistant('a3', [{ type: 'tool_use', id: 't1', name: 'Agent', input: { description: 'Check', prompt: 'Check it' } }]),
		user('u4', [{ type: 'tool_result', tool_use_id: 't1', content: [{ type: 'text', text: '[Subagent hand-back] framed' }] }], { toolUseResult: { status: 'completed', content: [{ type: 'text', text: 'All fine.' }] } }),
		assistant('a4', [{ type: 'text', text: 'Fixed.' }]),
	];
	const read = sessions.parseSession('s', lines(records), CWD, titleOf, path => `file://${path}`);
	const tools = read.messages.filter(m => m.role === 'tool');
	assert.deepEqual(tools.map(m => m.id), ['e1', 't1'], 'its tool lookups are not shown, nor waited for');
	assert.deepEqual(tools[0].view, { kind: 'edit', path: '/home/u/proj/math.js', edits: [{ oldString: 'a - b', newString: 'a + b' }], uri: 'file:///home/u/proj/math.js' });
	assert.equal(tools[1].output, 'All fine.', 'a subagent\'s report, not the frame around it');
	assert.equal(tools[1].view.report, 'All fine.');
});

test('a long session\'s diffs: the newest keep theirs; past the budget, older calls show what they were without them', () => {
	// 30 edits of 150,000 characters each (Claude Code's record of each): 26 fit in the budget.
	const piece = 'x'.repeat(150_000);
	const edit = n => [
		assistant(`a${n}`, [{ type: 'tool_use', id: `e${n}`, name: 'Edit', input: { file_path: '/home/u/proj/f.txt', old_string: 'q', new_string: 'y' } }]),
		user(`u${n}`, [{ type: 'tool_result', tool_use_id: `e${n}`, content: 'updated' }], { toolUseResult: { filePath: '/home/u/proj/f.txt', oldString: piece, newString: 'y', replaceAll: false } }),
	];
	const records = [user('u0', 'go'), ...Array.from({ length: 30 }, (_, n) => edit(n)).flat(), assistant('a99', [{ type: 'text', text: 'done' }])];
	const read = sessions.parseSession('s', lines(records), CWD, titleOf, path => `file://${path}`);
	const views = read.messages.filter(m => m.role === 'tool').map(m => m.view.edits ? 'diff' : 'none');
	assert.deepEqual(views, [...Array(4).fill('none'), ...Array(26).fill('diff')]);
	assert.ok(read.messages.filter(m => m.role === 'tool').every(m => m.view.uri === 'file:///home/u/proj/f.txt'), 'each still names its file');
});

test('a subagent\'s own file: its records (all sidechain ones) read as a conversation, its task first; the session names that file by its call', () => {
	const sidechain = { isSidechain: true, agentId: 'a3aba15845776c61c' };
	const sub = [
		user('s0', 'Read README.md and reply with its first line.', sidechain),
		assistant('s1', [{ type: 'tool_use', id: 'r1', name: 'Read', input: { file_path: '/home/u/proj/README.md' } }], sidechain),
		user('s2', [{ type: 'tool_result', tool_use_id: 'r1', content: '1\t# Demo' }], sidechain),
		assistant('s3', [{ type: 'text', text: 'The first line is # Demo.' }], sidechain),
	];
	const read = sessions.parseSubagent(lines(sub), CWD, titleOf, path => `file://${path}`);
	assert.deepEqual(read.map(m => [m.role, m.text ?? m.name]), [['user', 'Read README.md and reply with its first line.'], ['tool', 'Read'], ['assistant', 'The first line is # Demo.']]);
	assert.equal(read[1].view.uri, 'file:///home/u/proj/README.md');
	assert.equal(sessions.parseSession('s', lines(sub), CWD, titleOf), undefined, 'a session reads none of them');
	const main = [
		user('u1', 'Check the README'),
		assistant('a1', [{ type: 'tool_use', id: 't1', name: 'Agent', input: { description: 'Check', prompt: 'Read README.md' } }]),
		user('u2', [{ type: 'tool_result', tool_use_id: 't1', content: 'framed' }], { toolUseResult: { status: 'completed', agentId: 'a3aba15845776c61c', content: [{ type: 'text', text: 'It is # Demo.' }] } }),
		assistant('a2', [{ type: 'text', text: 'Done.' }]),
	];
	const session = sessions.parseSession('s', lines(main), CWD, titleOf);
	assert.equal(session.messages.find(m => m.id === 't1').agentId, 'a3aba15845776c61c');
});
