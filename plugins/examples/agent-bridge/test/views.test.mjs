// What each of Claude Code's calls is (src/views.ts), from inputs and structured results in the shapes
// Claude Code 2.1.330 writes them (checked against a session made for the purpose, not a user's).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const root = fileURLToPath(new URL('..', import.meta.url));
const require = createRequire(import.meta.url);
const esbuild = require('esbuild');
const out = mkdtempSync(join(tmpdir(), 'agent-bridge-views-'));
await esbuild.build({ entryPoints: [join(root, 'src/views.ts')], bundle: true, platform: 'node', format: 'cjs', outfile: join(out, 'views.cjs'), logLevel: 'silent' });
const views = require(join(out, 'views.cjs'));
rmSync(out, { recursive: true, force: true });

test('from the input: a read\'s lines, an edit\'s replacements, a new file, a command, a search, the to-do list, a subagent', () => {
	assert.deepEqual(views.viewOfUse('Read', { file_path: '/p/a.ts', offset: 10, limit: 5 }), { kind: 'read', path: '/p/a.ts', startLine: 10, endLine: 14 });
	assert.deepEqual(views.viewOfUse('Edit', { file_path: '/p/a.ts', old_string: 'x', new_string: 'y', replace_all: true }), { kind: 'edit', path: '/p/a.ts', edits: [{ oldString: 'x', newString: 'y', replaceAll: true }] });
	assert.deepEqual(views.viewOfUse('MultiEdit', { file_path: '/p/a.ts', edits: [{ old_string: 'a', new_string: 'b' }, { bad: 1 }] }).edits, [{ oldString: 'a', newString: 'b' }]);
	assert.deepEqual(views.viewOfUse('Write', { file_path: '/p/n.ts', content: 'hi' }), { kind: 'create', path: '/p/n.ts', content: 'hi' });
	assert.deepEqual(views.viewOfUse('Bash', { command: 'ls', run_in_background: true }), { kind: 'command', command: 'ls', background: true });
	assert.deepEqual(views.viewOfUse('Grep', { pattern: 'TODO', path: 'src' }), { kind: 'search', query: 'TODO', path: 'src' });
	assert.deepEqual(views.viewOfUse('Glob', { pattern: '**/*.ts' }), { kind: 'files', pattern: '**/*.ts' });
	assert.deepEqual(views.viewOfUse('WebFetch', { url: 'https://example.com' }), { kind: 'fetch', url: 'https://example.com' });
	assert.deepEqual(views.viewOfUse('WebSearch', { query: 'q' }), { kind: 'webSearch', query: 'q' });
	assert.deepEqual(views.viewOfUse('TodoWrite', { todos: [{ content: 'A', status: 'completed' }, { content: 'B', status: 'odd' }] }), { kind: 'todos', items: [{ text: 'A', status: 'completed' }] });
	assert.deepEqual(views.viewOfUse('Task', { description: 'Look', prompt: 'Find it', subagent_type: 'Explore' }), { kind: 'subagent', description: 'Look', prompt: 'Find it', agentType: 'Explore' });
	assert.equal(views.viewOfUse('mcp__x__y', {}), undefined, 'one Breezell has no tool for: none');
	assert.equal(views.viewOfUse('Read', {}), undefined);
});

test('from the result: the lines read, the replacement recorded, created or replaced, what a command printed, the files found, the report', () => {
	assert.deepEqual(views.viewOfResult('Read', { file_path: '/p/a.js' }, { type: 'text', file: { filePath: '/p/a.js', numLines: 4, startLine: 1, totalLines: 4 } }), { kind: 'read', path: '/p/a.js', startLine: 1, endLine: 4, totalLines: 4 });
	assert.deepEqual(views.viewOfResult('Edit', { file_path: '/p/a.js', old_string: 'q', new_string: 'r' }, { filePath: '/p/a.js', oldString: 'a - b', newString: 'a + b', originalFile: 'x', replaceAll: false }).edits, [{ oldString: 'a - b', newString: 'a + b' }]);
	assert.deepEqual(views.viewOfResult('Write', { file_path: '/p/n.js', content: 'new' }, { type: 'create', filePath: '/p/n.js', content: 'new', originalFile: null }), { kind: 'create', path: '/p/n.js', content: 'new' });
	assert.deepEqual(views.viewOfResult('Write', { file_path: '/p/o.js', content: '1\n2x\n3' }, { type: 'update', filePath: '/p/o.js', content: '1\n2x\n3', originalFile: '1\n2\n3' }), { kind: 'edit', path: '/p/o.js', edits: [{ oldString: '2', newString: '2x' }] });
	assert.deepEqual(views.viewOfResult('Bash', { command: 'make' }, { stdout: 'built', stderr: 'warn', interrupted: false }), { kind: 'command', command: 'make', output: 'built\nwarn' });
	assert.deepEqual(views.viewOfResult('Glob', { pattern: '*.md' }, { filenames: ['/p/a.md', 2], numFiles: 1 }), { kind: 'files', pattern: '*.md', files: ['/p/a.md'] });
	assert.deepEqual(views.viewOfResult('TodoWrite', { todos: [] }, { oldTodos: [], newTodos: [{ content: 'Do', status: 'in_progress' }] }), { kind: 'todos', items: [{ text: 'Do', status: 'in_progress' }] });
	assert.equal(views.viewOfResult('Agent', { description: 'Look' }, { status: 'completed', content: [{ type: 'text', text: 'Found.' }] }).report, 'Found.');
	assert.deepEqual(views.viewOfResult('Read', { file_path: '/p/a.js' }, undefined), { kind: 'read', path: '/p/a.js' }, 'no structured result (a subagent\'s): the input\'s');
});

test('the place two texts differ, in whole lines, with a line beside an insertion; too big: no replacements, the card shows the file', () => {
	assert.deepEqual(views.changedLines('a\nb\nc', 'a\nB\nc'), { oldString: 'b', newString: 'B' });
	assert.deepEqual(views.changedLines('a\nc', 'a\nb\nc'), { oldString: 'a', newString: 'a\nb' });
	assert.deepEqual(views.changedLines('b\nc', 'a\nb\nc'), { oldString: 'b', newString: 'a\nb' });
	assert.deepEqual(views.changedLines('', 'x'), { oldString: '', newString: 'x' });
	assert.equal(views.changedLines('same', 'same'), undefined);
	assert.deepEqual(views.viewOfWrite({ file_path: '/p/o', content: 'a\nB' }, 'a\nb'), { kind: 'edit', path: '/p/o', edits: [{ oldString: 'b', newString: 'B' }] });
	assert.deepEqual(views.viewOfWrite({ file_path: '/p/n', content: 'x' }, undefined), { kind: 'create', path: '/p/n', content: 'x' }, 'not there: a new file');
	const big = 'x'.repeat(views.VIEW_LIMITS.editChars);
	assert.deepEqual(views.viewOfUse('Edit', { file_path: '/p/a', old_string: big, new_string: 'y' }), { kind: 'edit', path: '/p/a' });
});

test('a file named as Breezell opens it, when it can be; other views as they are', () => {
	assert.deepEqual(views.withUri({ kind: 'read', path: '/p/a' }, p => `file://${p}`), { kind: 'read', path: '/p/a', uri: 'file:///p/a' });
	assert.deepEqual(views.withUri({ kind: 'edit', path: 'rel' }, () => undefined), { kind: 'edit', path: 'rel' });
	assert.deepEqual(views.withUri({ kind: 'command', command: 'ls' }, () => 'file:///x'), { kind: 'command', command: 'ls' });
	assert.ok(views.UNSHOWN_TOOLS.has('ToolSearch') && views.isSubagentTool('Agent') && views.isSubagentTool('Task'));
});

test('a call\'s input while it is written: the JSON so far, closed where it stops; nothing while it does not read yet', () => {
	assert.equal(views.partialInput(''), undefined);
	assert.deepEqual(views.partialInput('{"file_pa'), {}, 'a key not given its value yet: nothing of it');
	assert.deepEqual(views.partialInput('{"file_path":"/w/poem.txt","content":"Rivers run\\nto the s'), { file_path: '/w/poem.txt', content: 'Rivers run\nto the s' });
	assert.deepEqual(views.partialInput('{"file_path":"/w/a","content":"x\\'), { file_path: '/w/a', content: 'x' }, 'an escape cut in two waits for the rest');
	assert.deepEqual(views.partialInput('{"file_path":"/w/a","content":"\\u4e2'), { file_path: '/w/a', content: '' });
	assert.deepEqual(views.partialInput('{"file_path":"/w/a",'), { file_path: '/w/a' });
	assert.deepEqual(views.partialInput('{"file_path":"/w/a","con'), { file_path: '/w/a' });
	assert.deepEqual(views.partialInput('{"edits":[{"old_string":"a","new_string":"b"},{"old_str'), { edits: [{ old_string: 'a', new_string: 'b' }, {}] });
	assert.deepEqual(views.partialInput('{"command":"npm test","run_in_background":'), { command: 'npm test', run_in_background: null });
});

test('Breezell\'s memory lookup, as Claude Code names it: a lookup of Breezell\'s memories, with what it asked for', () => {
	assert.deepEqual(views.viewOfUse('mcp__breezell__memories_recall', { query: 'tests', ids: ['m1', 2, 'm3'] }), { kind: 'memories', query: 'tests', ids: ['m1', 'm3'] });
	assert.deepEqual(views.viewOfUse('mcp__breezell__memories_recall', { ids: 'm1, m2' }), { kind: 'memories', ids: ['m1', 'm2'] });
	assert.deepEqual(views.viewOfUse('mcp__breezell__memories_recall', undefined), { kind: 'memories' });
});
