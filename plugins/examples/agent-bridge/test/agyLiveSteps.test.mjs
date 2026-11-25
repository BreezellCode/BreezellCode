// agy's record of a conversation, read while agy writes it: a real SQLite database in WAL mode (as agy 1.5.17 keeps
// `conversations/<id>.db`), written by another connection as agy would, read where it is and from a copy (as an agy in
// WSL is read from Windows). The payloads are protobuf as agy's: a model step's thought in field 20.3, its words in 20.1.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { mkdtempSync, rmSync, existsSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const root = fileURLToPath(new URL('..', import.meta.url));
const require = createRequire(import.meta.url);
const esbuild = require('esbuild');
const out = mkdtempSync(join(tmpdir(), 'agent-bridge-agylive-'));
await esbuild.build({ entryPoints: [join(root, 'src/agyLiveSteps.ts')], bundle: true, platform: 'node', format: 'cjs', outfile: join(out, 'agylive.cjs'), logLevel: 'silent' });
const live = require(join(out, 'agylive.cjs'));
test.after(() => rmSync(out, { recursive: true, force: true }));

const varint = n => { const b = []; do { let c = n % 128; n = Math.floor(n / 128); if (n) c |= 0x80; b.push(c); } while (n); return b; };
const bytesField = (field, bytes) => [...varint(field * 8 + 2), ...varint(bytes.length), ...bytes];
const textField = (field, text) => bytesField(field, [...Buffer.from(text, 'utf8')]);
/** A model step's payload: other fields first (as agy's have), then its response. */
const modelStep = (thinking, text = '') => Uint8Array.from([...varint(1 * 8), ...varint(15), ...textField(2, 'step'), ...bytesField(20, [...varint(5 * 8 + 1), 1, 2, 3, 4, 5, 6, 7, 8, ...(text ? textField(1, text) : []), ...(thinking ? textField(3, thinking) : []), ...varint(11 * 8), ...varint(3_000_000_000)])]);
const toolStep = () => Uint8Array.from([...varint(1 * 8), ...varint(17), ...bytesField(31, [...textField(1, 'read_file')])]);

/** A database as agy keeps one, and a connection writing to it. */
function agyDatabase() {
	const dir = mkdtempSync(join(tmpdir(), 'agent-bridge-agydbsrc-'));
	const file = join(dir, 'c1.db');
	const db = new DatabaseSync(file);
	db.exec('pragma journal_mode = wal; pragma wal_autocheckpoint = 0; create table steps (idx integer primary key, status integer, step_payload blob)');
	const put = db.prepare('insert or replace into steps (idx, status, step_payload) values (?, ?, ?)');
	return { dir, file, db, put: (idx, payload, status = 8) => put.run(idx, status, payload), done: () => { db.close(); rmSync(dir, { recursive: true, force: true }); } };
}

for (const copy of [false, true]) {
	test(`its model steps as they are written, read ${copy ? 'from a copy (an agy in WSL)' : 'where it is'}: a thought growing, its words after, other steps passed over, the log begun again`, async () => {
		const agy = agyDatabase();
		const reader = live.agyLiveSteps(agy.file, { copy });
		assert.ok(reader, 'this Node has SQLite');
		agy.put(0, toolStep(), 3);
		agy.put(1, modelStep('An old thought.', 'Old words.'), 3);
		agy.put(2, toolStep(), 3);
		agy.put(3, modelStep('**Planning**\n\nFirst the'));
		assert.deepEqual([...(await reader.read(3))], [[3, { thinking: '**Planning**\n\nFirst the', text: '' }]], 'only from the step asked: the older ones are not this turn\'s');
		agy.put(3, modelStep('**Planning**\n\nFirst the files, then 數一數。'));
		assert.equal((await reader.read(3)).get(3).thinking, '**Planning**\n\nFirst the files, then 數一數。');
		agy.put(3, modelStep('**Planning**\n\nFirst the files, then 數一數。', 'Done'), 3);
		assert.deepEqual((await reader.read(2)).get(3), { thinking: '**Planning**\n\nFirst the files, then 數一數。', text: 'Done' });
		assert.ok(!(await reader.read(2)).has(2), 'a call\'s step is not a model step');
		// Its log written into the database and begun again (agy's checkpoints): what is there now.
		agy.db.exec('pragma wal_checkpoint(truncate)');
		agy.put(4, modelStep('Next.'));
		assert.equal((await reader.read(4)).get(4).thinking, 'Next.');
		agy.db.exec('pragma wal_checkpoint(restart)');
		agy.put(4, modelStep('Next, the tests.'));
		assert.equal((await reader.read(4)).get(4).thinking, 'Next, the tests.');
		// Never written to: agy's log is still its own.
		assert.ok(existsSync(`${agy.file}-wal`));
		reader.dispose();
		agy.done();
	});
}

test('a copy is kept in a folder of its own, gone once the turn is over; a database not there yet, then there', async () => {
	const dir = mkdtempSync(join(tmpdir(), 'agent-bridge-agydbsrc-'));
	const before = new Set(readdirSync(tmpdir()).filter(name => name.startsWith('agent-bridge-agydb-')));
	const reader = live.agyLiveSteps(join(dir, 'c1.db'), { copy: true });
	assert.equal(await reader.read(0), undefined, 'not there: nothing');
	const db = new DatabaseSync(join(dir, 'c1.db'));
	db.exec('pragma journal_mode = wal; create table steps (idx integer primary key, status integer, step_payload blob)');
	db.prepare('insert into steps values (?, ?, ?)').run(1, 8, modelStep('Reading.'));
	assert.equal((await reader.read(0)).get(1).thinking, 'Reading.');
	const made = readdirSync(tmpdir()).filter(name => name.startsWith('agent-bridge-agydb-') && !before.has(name));
	assert.equal(made.length, 1);
	reader.dispose();
	assert.ok(!existsSync(join(tmpdir(), made[0])));
	db.close();
	rmSync(dir, { recursive: true, force: true });
});

test('a payload that is not a model step, or not protobuf at all: none of it', () => {
	assert.equal(live.agyModelStepOf(toolStep()), undefined);
	assert.equal(live.agyModelStepOf(Uint8Array.from([0xff, 0xff, 0xff])), undefined);
	assert.equal(live.agyModelStepOf(Uint8Array.from(bytesField(20, [0x0a, 0x50, 0x41]))).text, '', 'a field longer than its message: not read');
	assert.deepEqual(live.agyModelStepOf(modelStep('', 'Only words.')), { thinking: '', text: 'Only words.' });
});

test('where agy keeps a conversation\'s record: in its folder, for its own ids only', () => {
	assert.equal(live.agyDatabasePath('/home/u/.gemini/antigravity-cli', '3954ac60-8fbf-4f7d-bf5d-058221625624'), '/home/u/.gemini/antigravity-cli/conversations/3954ac60-8fbf-4f7d-bf5d-058221625624.db');
	assert.equal(live.agyDatabasePath('\\\\wsl$\\Ubuntu\\home\\u\\.gemini\\antigravity-cli', 'c1aaaaaaaa'), '\\\\wsl$\\Ubuntu\\home\\u\\.gemini\\antigravity-cli\\conversations\\c1aaaaaaaa.db');
	assert.equal(live.agyDatabasePath('/x', '../../etc/passwd'), undefined);
});
