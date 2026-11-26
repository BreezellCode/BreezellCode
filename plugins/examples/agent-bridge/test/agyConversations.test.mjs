// Deleting a conversation of agy's with its subagents' conversations, in a folder laid out as agy 1.5.17 keeps its own
// (`conversations/<id>.db` with its -wal and -shm, `brain/<id>/…/transcript_full.jsonl`, `presence/<id>.lock`):
// its subagents found from its transcript and confirmed by theirs, a conversation it only names left alone, a link
// inside a folder never followed nor deleted.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { existsSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const root = fileURLToPath(new URL('..', import.meta.url));
const require = createRequire(import.meta.url);
const esbuild = require('esbuild');
const out = mkdtempSync(join(tmpdir(), 'agent-bridge-agyconvs-'));
await esbuild.build({ entryPoints: [join(root, 'src/agents/antigravity/conversations.ts')], bundle: true, platform: 'node', format: 'cjs', outfile: join(out, 'agyconvs.cjs'), logLevel: 'silent' });
const convs = require(join(out, 'agyconvs.cjs'));
test.after(() => rmSync(out, { recursive: true, force: true }));

const LEAD = 'c57725ba-6ee2-4643-80a1-1e64838730ef';
const SUB_A = '2099a005-07fe-4e09-8dc2-dd5f6d144b97';
const SUB_B = '8834516b-52ec-440d-87df-c2f0f55b7b55';
const SUB_OF_A = '3006137b-4d29-4fa0-bad5-5ea0f004699f';
const NAMED = '11111111-2222-4333-8444-555555555555';
const OTHER = '99999999-8888-4777-8666-555555555555';
const line = step => `${JSON.stringify(step)}\n`;

/** agy's folder with these conversations: each one's record, lock and transcript (its first line as given). */
function agyFolder(conversations) {
	const dir = mkdtempSync(join(tmpdir(), 'agent-bridge-agyhome-'));
	mkdirSync(join(dir, 'conversations'));
	mkdirSync(join(dir, 'presence'));
	for (const [id, lines] of Object.entries(conversations)) {
		for (const end of ['', '-wal', '-shm']) {
			writeFileSync(join(dir, 'conversations', `${id}.db${end}`), 'x');
		}
		writeFileSync(join(dir, 'presence', `${id}.lock`), '');
		const logs = join(dir, 'brain', id, '.system_generated', 'logs');
		mkdirSync(logs, { recursive: true });
		mkdirSync(join(dir, 'brain', id, 'scratch'));
		writeFileSync(join(dir, 'brain', id, 'scratch', 'notes.md'), 'notes');
		writeFileSync(join(logs, 'transcript_full.jsonl'), lines.join(''));
	}
	return dir;
}
const there = (dir, id) => ['conversations/' + id + '.db', 'conversations/' + id + '.db-wal', 'conversations/' + id + '.db-shm', 'presence/' + id + '.lock', 'brain/' + id].filter(p => existsSync(join(dir, p)));

const conversations = () => ({
	[LEAD]: [
		line({ step_index: 0, type: 'USER_INPUT', source: 'USER_EXPLICIT', content: `Look at ${NAMED}` }),
		line({ step_index: 3, type: 'GENERIC', status: 'DONE', content: `Started subagents ${SUB_A} and ${SUB_B}.` }),
	],
	[SUB_A]: [
		line({ step_index: 0, type: 'SYSTEM_MESSAGE', source: 'SYSTEM', content: `You are a subagent of ${LEAD}. Your task: read.` }),
		line({ step_index: 2, type: 'GENERIC', status: 'DONE', content: `Started ${SUB_OF_A}.` }),
	],
	[SUB_B]: [line({ step_index: 0, type: 'SYSTEM_MESSAGE', source: 'SYSTEM', content: `Report to ${LEAD}.` })],
	[SUB_OF_A]: [line({ step_index: 0, type: 'SYSTEM_MESSAGE', source: 'SYSTEM', content: `Report to ${SUB_A}.` })],
	// Named in the lead's words, a conversation of its own: not a subagent of it.
	[NAMED]: [line({ step_index: 0, type: 'USER_INPUT', source: 'USER_EXPLICIT', content: 'Something else.' })],
	[OTHER]: [line({ step_index: 0, type: 'USER_INPUT', source: 'USER_EXPLICIT', content: 'Unrelated.' })],
});

test('a conversation\'s subagents: those its transcript names whose own transcript begins with their task from it', async () => {
	const dir = agyFolder(conversations());
	assert.deepEqual((await convs.agySubagentsOf(dir, LEAD)).sort(), [SUB_A, SUB_B].sort());
	assert.deepEqual(await convs.agySubagentsOf(dir, SUB_A), [SUB_OF_A]);
	assert.deepEqual(await convs.agySubagentsOf(dir, OTHER), []);
	assert.deepEqual(await convs.agySubagentsOf(dir, '../../etc'), [], 'not an id of agy\'s');
	rmSync(dir, { recursive: true, force: true });
});

test('deleted: the conversation and its subagents\' (theirs too), every file of each; a conversation it only names and others stay', async () => {
	const dir = agyFolder(conversations());
	const deleted = await convs.deleteAgyConversations(dir, [LEAD]);
	assert.deepEqual(deleted.sort(), [LEAD, SUB_A, SUB_B, SUB_OF_A].sort());
	for (const id of [LEAD, SUB_A, SUB_B, SUB_OF_A]) {
		assert.deepEqual(there(dir, id), [], `${id} gone`);
	}
	for (const id of [NAMED, OTHER]) {
		assert.equal(there(dir, id).length, 5, `${id} stays`);
	}
	// Deleting again, or a conversation agy no longer has: nothing to do.
	assert.deepEqual(await convs.deleteAgyConversations(dir, [LEAD]), [LEAD]);
	rmSync(dir, { recursive: true, force: true });
});

test('a link inside its folder (a symlink, a junction on Windows) is never followed nor deleted: what it points at stays, and so does the folder holding it', async () => {
	const dir = agyFolder({ [OTHER]: [line({ step_index: 0, type: 'USER_INPUT', content: 'x' })] });
	const elsewhere = mkdtempSync(join(tmpdir(), 'agent-bridge-agyelsewhere-'));
	writeFileSync(join(elsewhere, 'keep.txt'), 'keep');
	symlinkSync(elsewhere, join(dir, 'brain', OTHER, 'scratch', 'linked'), 'junction');
	await convs.deleteAgyConversation(dir, OTHER);
	assert.ok(existsSync(join(elsewhere, 'keep.txt')), 'what the link points at stays');
	assert.ok(existsSync(join(dir, 'brain', OTHER, 'scratch', 'linked')), 'the link stays');
	assert.ok(!existsSync(join(dir, 'brain', OTHER, 'scratch', 'notes.md')), 'the rest of the folder goes');
	assert.ok(!existsSync(join(dir, 'brain', OTHER, '.system_generated')));
	assert.ok(!existsSync(join(dir, 'conversations', `${OTHER}.db`)));
	// The link itself first: a folder holding a junction is never deleted as a whole.
	unlinkSync(join(dir, 'brain', OTHER, 'scratch', 'linked'));
	rmSync(dir, { recursive: true, force: true });
	rmSync(elsewhere, { recursive: true, force: true });
});
