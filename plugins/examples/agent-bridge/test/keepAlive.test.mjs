// Keeping an agent's program between a conversation's turns (core/keepAlive.ts), against fake programs: one program a
// conversation at most, taken again only when it is fit for the turn, the old one gone before a new one starts, a turn
// meanwhile in a program of its own, closed once idle for the time set (counted from its last turn), work said between
// turns closes it, the setting turned off or the tile going closes them all. Then a random run of all of that at once,
// checking after every step that no program is left running that nothing will close, and none is started twice.
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
const out = mkdtempSync(join(tmpdir(), 'agent-bridge-keepalive-'));
await esbuild.build({ stdin: { contents: "export * from './src/core/keepAlive'; export * from './src/core/process';", resolveDir: root, loader: 'ts' }, bundle: true, platform: 'node', format: 'cjs', outfile: join(out, 'ka.cjs'), logLevel: 'silent' });
const ka = require(join(out, 'ka.cjs'));
rmSync(out, { recursive: true, force: true });

const flush = async () => { for (let i = 0; i < 6; i++) { await new Promise(resolve => setImmediate(resolve)); } };

/** A program as the agents' are: it ends once its input closes, and when killed. */
function programs() {
	const all = [];
	const start = () => {
		const child = fakeChild();
		child.stdin.on('finish', () => setImmediate(() => { if (child.exitCode === null) { child.end(0); } }));
		child.kill = () => { child.killed = true; if (child.exitCode === null) { child.end(137); } };
		const agent = new ka.AgentChild(child);
		all.push({ child, agent });
		return agent;
	};
	return { all, start, alive: () => all.filter(p => !p.agent.exited) };
}

/** A turn as the agents' turns do it: the kept program when fit, else one of its own (kept unless busy); at its end released when it went well, else closed. */
async function turn(pool, progs, conversation, { key = 'k', session = 's1', record } = {}) {
	const taken = await pool.take(conversation, key, session, record);
	let kept = taken.kept;
	let agent;
	if (kept) {
		agent = kept.agent;
		assert.ok(agent.alive, 'a kept program handed to a turn is running');
	} else {
		agent = progs.start();
		if (!taken.busy) {
			const candidate = { agent, key, session: undefined, isWork: m => m.type === 'work' };
			kept = pool.adopt(conversation, candidate) ? candidate : undefined;
		}
	}
	return {
		agent, kept, busy: taken.busy, reused: !!taken.kept,
		async end(wentWell = true) {
			if (wentWell && kept && pool.holds(conversation, kept) && agent.alive) {
				kept.session = session;
				await pool.release(conversation, kept, record);
			} else {
				await agent.close();
			}
		},
	};
}

const poolOf = (options = {}) => new ka.KeptProcesses({ idleMs: () => options.idle ?? 60_000, ...options });

test('one program a conversation: its next turn goes on in it; another session or another start closes it, and it is gone before the next one starts', async () => {
	const progs = programs();
	const pool = poolOf();
	const t1 = await turn(pool, progs, 'c1');
	await t1.end();
	const t2 = await turn(pool, progs, 'c1');
	assert.equal(t2.reused, true);
	assert.equal(progs.all.length, 1, 'one program for two turns');
	await t2.end();
	const otherSession = await turn(pool, progs, 'c1', { session: 's2' });
	assert.equal(otherSession.reused, false);
	assert.equal(progs.all[0].agent.exited, true, 'the old one is gone before the new one starts');
	assert.equal(progs.all.length, 2);
	await otherSession.end();
	const otherStart = await turn(pool, progs, 'c1', { session: 's2', key: 'model changed' });
	assert.equal(progs.all[1].agent.exited, true);
	assert.equal(progs.all.length, 3);
	await otherStart.end();
	// A new session (none to go on with): never in a kept one.
	const fresh = await turn(pool, progs, 'c1', { session: undefined, key: 'model changed' });
	assert.equal(fresh.reused, false);
	assert.equal(progs.all[2].agent.exited, true);
	await fresh.end();
	assert.equal(pool.size, 1);
	await pool.closeAll('test');
	await flush();
	assert.deepEqual(progs.alive(), []);
});

test('a turn while another of the conversation works: told busy, it runs in a program of its own, which is not kept', async () => {
	const progs = programs();
	const pool = poolOf();
	const a = await turn(pool, progs, 'c1');
	const b = await turn(pool, progs, 'c1');
	assert.equal(b.busy, true);
	assert.equal(b.kept, undefined, 'not kept');
	await b.end();
	assert.equal(b.agent.exited, true, 'its own program ends with it');
	await a.end();
	assert.equal(a.agent.exited, false, 'the kept one stays');
	assert.equal(pool.size, 1);
	// Two turns that both find nothing kept: the first to start keeps its program, the other's is its own.
	const progs2 = programs();
	const pool2 = poolOf();
	const [x, y] = await Promise.all([turn(pool2, progs2, 'c9'), turn(pool2, progs2, 'c9')]);
	assert.equal([x, y].filter(t => t.kept).length, 1, 'only one of them is kept');
	await Promise.all([x.end(), y.end()]);
	await flush();
	assert.equal(progs2.alive().length, 1);
	await pool.closeAll('test');
	await pool2.closeAll('test');
});

test('closed once idle for the time set, counted from its last turn, exactly once; a turn just before takes it instead', async t => {
	t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
	const progs = programs();
	const closed = [];
	const pool = poolOf({ idle: 10 * 60_000, log: line => closed.push(line) });
	const t1 = await turn(pool, progs, 'c1');
	t.mock.timers.tick(30 * 60_000);
	await flush();
	assert.equal(progs.all[0].agent.exited, false, 'never while its turn works, however long');
	await t1.end();
	t.mock.timers.tick(9 * 60_000);
	await flush();
	const t2 = await turn(pool, progs, 'c1');
	assert.equal(t2.reused, true, 'taken a minute before its time');
	t.mock.timers.tick(5 * 60_000);
	await flush();
	assert.equal(progs.all[0].agent.exited, false, 'its timer went with it');
	await t2.end();
	t.mock.timers.tick(10 * 60_000 - 1);
	await flush();
	assert.equal(progs.all[0].agent.exited, false);
	t.mock.timers.tick(1);
	await flush();
	assert.equal(progs.all[0].agent.exited, true, 'closed once idle for the time set');
	assert.equal(pool.size, 0);
	assert.equal(closed.filter(line => /closed/.test(line)).length, 1, 'once');
	const t3 = await turn(pool, progs, 'c1');
	assert.equal(t3.reused, false);
	assert.equal(progs.all.length, 2, 'the next turn starts one');
	await t3.end();
	await pool.closeAll('test');
});

test('between turns: work it says closes it (no turn to go to); anything else is passed over and does not keep it longer', async t => {
	t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
	const progs = programs();
	const pool = poolOf({ idle: 60_000 });
	await (await turn(pool, progs, 'c1')).end();
	const { child, agent } = progs.all[0];
	t.mock.timers.tick(50_000);
	child.say({ type: 'keep_alive' });
	await flush();
	assert.equal(agent.exited, false, 'not work: passed over');
	t.mock.timers.tick(10_000);
	await flush();
	assert.equal(agent.exited, true, 'and it did not keep it longer');
	await (await turn(pool, progs, 'c2')).end();
	progs.all[1].child.say({ type: 'work' });
	await flush();
	assert.equal(progs.all[1].agent.exited, true, 'work between turns: closed');
	assert.equal(pool.has('c2'), false);
});

test('a program that ends by itself is forgotten (idle or at work); its record changed since its last turn: not gone on with', async () => {
	const progs = programs();
	const pool = poolOf();
	await (await turn(pool, progs, 'c1')).end();
	progs.all[0].child.end(1);
	await flush();
	assert.equal(pool.has('c1'), false);
	const t2 = await turn(pool, progs, 'c1');
	assert.equal(t2.reused, false);
	progs.all[1].child.end(1);
	await flush();
	assert.equal(pool.has('c1'), false, 'one that ends at work too');
	await t2.end();
	// Its record: as it was when the last turn ended, else something else went on in the conversation.
	let stamp = 'a';
	const recorded = poolOf({ stamp: async () => stamp });
	const r1 = await turn(recorded, progs, 'c1', { record: '/r' });
	await r1.end();
	const r2 = await turn(recorded, progs, 'c1', { record: '/r' });
	assert.equal(r2.reused, true, 'unchanged');
	stamp = 'b';
	await r2.end();
	stamp = 'c';
	const r3 = await turn(recorded, progs, 'c1', { record: '/r' });
	assert.equal(r3.reused, false, 'changed since its last turn');
	assert.equal(r2.agent.exited, true);
	await r3.end();
	await recorded.closeAll('test');
});

test('turned off: the idle ones closed at once, a working one when its turn ends; another time counts from each one\'s last turn; closing everything waits for each', async t => {
	t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
	let idle = 10 * 60_000;
	const progs = programs();
	const pool = poolOf({ idle: undefined, idleMs: () => idle });
	await (await turn(pool, progs, 'c1')).end();
	const working = await turn(pool, progs, 'c2');
	idle = 0;
	pool.configure();
	await flush();
	assert.equal(progs.all[0].agent.exited, true, 'idle: closed at once');
	assert.equal(progs.all[1].agent.exited, false, 'working: left to its turn');
	await working.end();
	await flush();
	assert.equal(progs.all[1].agent.exited, true, 'closed when its turn ended');
	assert.equal(pool.size, 0);
	const notKept = await turn(pool, progs, 'c3');
	assert.equal(notKept.kept, undefined, 'off: nothing is kept');
	await notKept.end();
	// Another time: from its last turn on.
	idle = 10 * 60_000;
	await (await turn(pool, progs, 'c4')).end();
	t.mock.timers.tick(4 * 60_000);
	idle = 5 * 60_000;
	pool.configure();
	t.mock.timers.tick(60_000 - 1);
	await flush();
	assert.equal(pool.has('c4'), true);
	t.mock.timers.tick(1);
	await flush();
	assert.equal(pool.has('c4'), false, 'five minutes after its last turn');
	await (await turn(pool, progs, 'c5')).end();
	await (await turn(pool, progs, 'c6')).end();
	await pool.closeAll('the tile is turned off');
	assert.deepEqual(progs.alive(), [], 'all gone once closeAll resolved');
});

test('random turns, ends, deaths, idle time and the setting, all at once: never a program nothing will close, never two kept for one conversation, never a dead one handed out', async t => {
	t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
	const totals = { starts: 0, reuses: 0 };
	for (let run = 0; run < 25; run++) {
		// mulberry32: an even spread in 32-bit integer steps (a plain LCG in doubles loses its low bits).
		let seed = 1000 + run;
		const rand = n => {
			seed = (seed + 0x6D2B79F5) | 0;
			let x = Math.imul(seed ^ (seed >>> 15), 1 | seed);
			x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
			return ((x ^ (x >>> 14)) >>> 0) % n;
		};
		let idle = 5 * 60_000;
		const progs = programs();
		const pool = poolOf({ idle: undefined, idleMs: () => idle });
		const conversations = ['a', 'b', 'c'];
		/** Turns under way, and the kept program each conversation was last given (what the pool may hold). */
		const open = [];
		const lastKept = new Map();
		let starts = 0;
		let reuses = 0;
		for (let step = 0; step < 300; step++) {
			let what = rand(10);
			const conversation = conversations[rand(conversations.length)];
			// As in use, a conversation has one turn at a time; now and then a second one while the first works.
			if (what < 4 && open.some(o => o.conversation === conversation) && rand(8)) {
				what = 4;
			}
			if (what < 4) {
				const before = progs.all.length;
				// As in use: mostly the same model and session; at times another (a model changed, a new session).
				const t1 = await turn(pool, progs, conversation, { key: rand(10) ? 'k0' : 'k1', session: rand(10) ? 's0' : 's1' });
				t1.reused ? reuses++ : starts++;
				assert.equal(progs.all.length - before, t1.reused ? 0 : 1, 'a program is started only when none is taken');
				assert.ok(!open.some(o => o.agent === t1.agent), 'never one program for two turns at once');
				if (t1.kept) {
					lastKept.set(conversation, t1.kept);
				}
				open.push({ ...t1, conversation });
			} else if (what < 7 && open.length) {
				const [ending] = open.splice(rand(open.length), 1);
				await ending.end(rand(4) > 0);
			} else if (what === 7) {
				const victim = progs.alive()[rand(Math.max(1, progs.alive().length))];
				victim?.child.end(1);
			} else if (what === 8) {
				t.mock.timers.tick(rand(8) * 60_000);
			} else {
				idle = rand(3) ? 5 * 60_000 : 0;
				pool.configure();
				const idleOne = progs.alive().find(p => !open.some(o => o.agent === p.agent));
				idleOne?.child.say({ type: rand(2) ? 'work' : 'keep_alive' });
			}
			await flush();
			// Every running program is a turn's, or the one kept for its conversation: none left that nothing will close.
			const held = new Set(conversations.map(c => lastKept.get(c)).filter(k => k && pool.holds(conversations.find(c => lastKept.get(c) === k), k)).map(k => k.agent));
			for (const p of progs.alive()) {
				assert.ok(open.some(o => o.agent === p.agent) || held.has(p.agent), `run ${run} step ${step}: a program nothing will close`);
			}
			assert.ok(pool.size <= conversations.length);
		}
		for (const o of open.splice(0)) {
			await o.end();
		}
		await pool.closeAll('done');
		await flush();
		assert.deepEqual(progs.alive(), [], `run ${run}: all gone at the end`);
		totals.starts += starts;
		totals.reuses += reuses;
	}
	// Both happened, often: the runs went through programs kept and gone on in, not only new ones.
	t.diagnostic(`${totals.starts} programs started, ${totals.reuses} turns gone on in a kept one`);
	assert.ok(totals.reuses > 200 && totals.starts > 200, `${totals.starts} started, ${totals.reuses} gone on in`);
});

test('a program\'s arguments without its session, for what it was started with', () => {
	assert.deepEqual(ka.withoutArg(['-p', '--model', 'opus', '--resume', 's1', '--x'], '--resume'), ['-p', '--model', 'opus', '--x']);
	assert.deepEqual(ka.withoutArg(['-p'], '--resume'), ['-p']);
	assert.equal(ka.keepAliveMs(0), 0);
	assert.equal(ka.keepAliveMs(-5), 0);
	assert.equal(ka.keepAliveMs('10'), 0);
	assert.equal(ka.keepAliveMs(10), 600_000);
	assert.equal(ka.keepAliveMs(100_000), ka.KEEP_ALIVE_MAX_MINUTES * 60_000, 'at most the longest it takes');
});
