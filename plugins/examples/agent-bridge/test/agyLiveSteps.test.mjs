// agy's record of a conversation, read while agy writes it: a real SQLite database in WAL mode (as agy 1.5.17 keeps
// `conversations/<id>.db`), written by another connection as agy would, read where it is and from a copy (as an agy in
// WSL is read from Windows). The payloads are protobuf as agy's: a model step's thought in field 20.3, its words in 20.1.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import * as fs from 'node:fs';
import { appendFileSync, mkdtempSync, rmSync, existsSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const root = fileURLToPath(new URL('..', import.meta.url));
const require = createRequire(import.meta.url);
const esbuild = require('esbuild');
const out = mkdtempSync(join(tmpdir(), 'agent-bridge-agylive-'));
await esbuild.build({ entryPoints: [join(root, 'src/agents/antigravity/liveSteps.ts')], bundle: true, platform: 'node', format: 'cjs', outfile: join(out, 'agylive.cjs'), logLevel: 'silent' });
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

/** A thought of `n` characters, its words none: a step agy writes again and again while its model thinks. */
const longThought = (word, n) => `${word} `.repeat(Math.ceil(n / (word.length + 1))).slice(0, n);

test('read from a copy: a log begun again over its old frames (agy\'s checkpoints, the file no shorter) is followed on, write after write', async () => {
	const agy = agyDatabase();
	const reader = live.agyLiveSteps(agy.file, { copy: true });
	// A long log first: big steps (a tool's output, a long thought), more frames than what comes after.
	for (let i = 0; i < 6; i++) {
		agy.put(i, Uint8Array.from(Buffer.alloc(20_000, i)), 3);
	}
	agy.put(10, modelStep('Starting.'));
	assert.equal((await reader.read(10)).get(10).thinking, 'Starting.');
	// agy's checkpoint: the log is begun again over its old frames at the next write; the file stays as long.
	agy.db.exec('pragma wal_checkpoint(restart)');
	agy.put(10, modelStep('Starting. Then'));
	assert.equal((await reader.read(10)).get(10).thinking, 'Starting. Then');
	// Each write after it lands inside the old file's length: each is read.
	agy.put(10, modelStep('Starting. Then the build.'));
	assert.equal((await reader.read(10)).get(10).thinking, 'Starting. Then the build.', 'a write within the log\'s old length is read');
	agy.put(10, modelStep('Starting. Then the build. Then the tests.'));
	assert.equal((await reader.read(10)).get(10).thinking, 'Starting. Then the build. Then the tests.');
	reader.dispose();
	agy.done();
});

test('read from a copy: writes it did not read before the log began again are not lost; a frame half written waits', async () => {
	const agy = agyDatabase();
	const reader = live.agyLiveSteps(agy.file, { copy: true });
	agy.put(1, modelStep('One.'));
	assert.equal((await reader.read(1)).get(1).thinking, 'One.');
	// Unread: more of the log, its checkpoint, the log begun again; one read after all of it.
	agy.put(1, modelStep('One. Two.'));
	agy.put(2, modelStep(longThought('three', 9000)));
	agy.db.exec('pragma wal_checkpoint(restart)');
	agy.put(3, modelStep('Four.'));
	const after = await reader.read(1);
	assert.equal(after.get(1).thinking, 'One. Two.');
	assert.equal(after.get(2).thinking.length, 9000);
	assert.equal(after.get(3).thinking, 'Four.');
	// A frame being written (its checksum not right yet): what was committed before it is what is read.
	appendFileSync(`${agy.file}-wal`, Buffer.alloc(4096 + 24, 7));
	assert.equal((await reader.read(1)).get(3).thinking, 'Four.');
	agy.put(3, modelStep('Four. Five.'));
	assert.equal((await reader.read(1)).get(3).thinking, 'Four. Five.', 'written over the half frame, the next commit is read');
	reader.dispose();
	agy.done();
});

for (const copy of [false, true]) {
	test(`a read with nothing written since does no work${copy ? ' (a copy: not even the log is opened)' : ' (one connection, its data_version)'}; a step is loaded again only once it grew`, async () => {
		const agy = agyDatabase();
		const reader = live.agyLiveSteps(agy.file, { copy });
		agy.put(0, toolStep(), 3);
		agy.put(1, modelStep('First.'));
		agy.put(2, modelStep('Second.'));
		await reader.read(0);
		const { StatementSync } = await import('node:sqlite');
		const counted = { all: 0, get: 0, opened: 0 };
		const all = StatementSync.prototype.all;
		const get = StatementSync.prototype.get;
		const open = fs.promises.open;
		StatementSync.prototype.all = function (...args) { counted.all++; return all.apply(this, args); };
		StatementSync.prototype.get = function (...args) { counted.get += /where idx = \?/.test(this.sourceSQL) ? 1 : 0; return get.apply(this, args); };
		fs.promises.open = function (file, ...args) { if (String(file).endsWith('-wal')) { counted.opened++; } return open.call(this, file, ...args); };
		try {
			for (let i = 0; i < 5; i++) {
				assert.equal((await reader.read(0)).get(2).thinking, 'Second.');
			}
			assert.equal(counted.all, 0, 'no step is listed while nothing was written');
			assert.equal(copy ? counted.opened : 0, 0, 'the log is not opened while it did not change');
			agy.put(2, modelStep('Second, longer.'));
			const read = await reader.read(0);
			assert.equal(read.get(2).thinking, 'Second, longer.');
			assert.equal(read.get(1).thinking, 'First.');
			assert.equal(counted.all, 1, 'the steps\' sizes, once');
			assert.equal(counted.get, 1, 'only the step that grew is loaded');
		} finally {
			StatementSync.prototype.all = all;
			StatementSync.prototype.get = get;
			fs.promises.open = open;
		}
		reader.dispose();
		agy.done();
	});
}

for (const copy of [false, true]) test(`read ${copy ? 'from a copy' : 'where it is'}, against SQLite itself: random writes as agy makes them, agy's checkpoints of every kind, reads at random moments; what is read is what the database says`, async () => {
	const agy = agyDatabase();
	const reader = live.agyLiveSteps(agy.file, { copy });
	const oracle = new DatabaseSync(agy.file, { readOnly: true });
	let seed = Number(process.env.AGY_ORACLE_SEED ?? 42);
	const rand = n => (seed = (seed * 1103515245 + 12345) % 2147483648) % n;
	const truth = () => new Map(oracle.prepare('select idx, step_payload from steps order by idx').all().flatMap(row => {
		const step = live.agyModelStepOf(row.step_payload);
		return step ? [[row.idx, step]] : [];
	}));
	// As agy writes them: the step its model is on is written anew as its thought (then its words) grows, a tool's step
	// once and once more when it is done (longer), each new step under the next index.
	let next = 0;
	const working = [];
	const steps = new Map();
	const ops = Number(process.env.AGY_ORACLE_OPS ?? 400);
	for (let op = 0; op < ops; op++) {
		const what = rand(20);
		if (what < 12) {
			if (!working.length || !rand(8)) {
				working.push(next++);
			}
			const idx = working[rand(working.length)];
			const step = steps.get(idx) ?? { thought: 0, said: '' };
			if (step.thought < 8_000 && rand(4)) {
				step.thought += 1 + rand(1500);
			} else {
				step.said += `Word ${op}. `;
			}
			steps.set(idx, step);
			agy.put(idx, modelStep(longThought(`w${idx}`, step.thought), step.said.trim()));
			if (step.said.length > 400) {
				working.splice(working.indexOf(idx), 1);
			}
		} else if (what < 14) {
			const idx = next++;
			const size = 1 + rand(8_000);
			agy.put(idx, Uint8Array.from(Buffer.alloc(size, op % 256)));
			agy.put(idx, Uint8Array.from(Buffer.alloc(size + 1 + rand(1000), op % 256)), 3);
		} else if (what === 14) {
			agy.db.exec('pragma wal_checkpoint(passive)');
		} else if (what === 15) {
			agy.db.exec('pragma wal_checkpoint(restart)');
		} else if (what === 16) {
			agy.db.exec('pragma wal_checkpoint(truncate)');
		} else {
			const read = await reader.read(0);
			assert.deepEqual(read && [...read], [...truth()], `after ${op + 1} steps (database ${(fs.statSync(agy.file).size / 1048576).toFixed(1)} MB)`);
		}
	}
	const last = await reader.read(0);
	assert.deepEqual(last && [...last], [...truth()]);
	oracle.close();
	reader.dispose();
	agy.done();
});
