#!/usr/bin/env node
// The host's line protocol, end to end: a real host (dist/system/host.cjs) on a socket in a
// scratch home, a fake text service and a fake Breezell plugin. Checks the panel's fields, page
// turning, that a Breezell window whose editor has the focus gets its keys left alone while other
// programs keep the input method, and that native / English is one state that Breezell's plugin
// follows (and sets).
//
//   host-protocol.mjs <scratch dir> <data dir>
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { connect } from 'node:net';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const [scratch, data] = process.argv.slice(2);
const here = dirname(fileURLToPath(import.meta.url));
const home = join(scratch, 'host-home');
const conf = join(home, '.config', 'breezell-ime');
mkdirSync(conf, { recursive: true });
writeFileSync(join(conf, 'config.json'), JSON.stringify({ zhLayout: 'pinyin', dataPath: data, pageSize: 5, learning: false }));
// A Unix socket path must be short: the socket is named relative to the scratch home.
const sock = 'host.sock';
process.chdir(conf);

const host = spawn(process.execPath, [join(here, '..', 'dist', 'system', 'host.cjs')], { cwd: conf, env: { ...process.env, HOME: home, APPDATA: '', XDG_CONFIG_HOME: '', XDG_DATA_HOME: '', BREEZELL_IME_PIPE: sock }, stdio: 'inherit' });
let failed = 0;
const check = (name, ok, got) => { if (!ok) failed++; console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : `: ${got}`}`); };

/** A connection that sends a line and waits for the reply; other lines (events) are kept. */
function client() {
	return new Promise((resolve, reject) => {
		const s = connect(sock);
		let buf = '';
		const waiting = [];
		const events = [];
		s.setEncoding('utf8');
		s.on('data', d => {
			buf += d;
			let nl;
			while ((nl = buf.indexOf('\n')) >= 0) {
				const line = buf.slice(0, nl);
				buf = buf.slice(nl + 1);
				if (line.startsWith('EV\t')) events.push(line);
				else waiting.shift()?.(line);
			}
		});
		s.on('connect', () => resolve({
			send: line => new Promise(r => { waiting.push(r); s.write(line + '\n'); }),
			events,
			close: () => s.destroy(),
		}));
		s.on('error', reject);
	});
}

const fields = line => {
	const f = line.split('\t');
	return { eaten: f[1], composing: f[2], mode: f[3], highlight: Number(f[4]), more: f[6], commit: f[7], preedit: f[8], candidates: f[9] ? f[9].split('\x1e') : [], reading: f[10], prev: f[11], badge: f[12], quiet: f[13] };
};
const key = async (c, ch) => fields(await c.send(`K\t${ch.toUpperCase().charCodeAt(0)}\t${ch.charCodeAt(0)}\t0`));

try {
	for (let i = 0; i < 100; i++) {
		try { (await client()).close(); break; } catch { await new Promise(r => setTimeout(r, 200)); }
	}
	const BREEZELL = 4242, OTHER = 5151;
	const tip = await client();
	await tip.send(`H\tBreezell.exe\t${0x0404}\t${BREEZELL}\t5`);
	let s;
	for (const ch of 'henjaindan') s = await key(tip, ch);
	check('composing: the panel has the fixed reading', s.reading === 'hen jian dan', s.reading);
	check('the badge says Traditional Chinese', s.badge === '中 · 繁', s.badge);
	check('first page: no page before', s.prev === '0', s.prev);
	const next = fields(await tip.send('G\t1'));
	check('› turns to the next page', next.prev === '1' && next.highlight === 0 && next.candidates[0] !== s.candidates[0], JSON.stringify(next));
	const back = fields(await tip.send('G\t-1'));
	check('‹ turns back', back.prev === '0' && back.candidates[0] === s.candidates[0], JSON.stringify(back));
	await tip.send('R');

	// After a commit: the words that may come next (聯想), a digit takes one, another key and they go.
	for (const ch of 'nihao') await key(tip, ch);
	const committed = fields(await tip.send('K\t32\t32\t0'));
	check('a commit offers the words that may come next', committed.commit === '你好' && committed.composing === '0' && committed.candidates.length > 0 && committed.highlight === -1 && committed.reading === '聯想', JSON.stringify(committed));
	check('a digit is taken while they show', (await tip.send('T\t49\t49\t0')) === 'E\t1');
	const picked = fields(await tip.send('K\t49\t49\t0'));
	check('the digit commits the first of them, and offers more', picked.commit === committed.candidates[0] && picked.candidates.length > 0, JSON.stringify(picked));
	check('another key (a program\'s) and they go: a digit is the program\'s again', (await tip.send('T\t37\t0\t0')) === 'E\t0' && (await tip.send('T\t49\t49\t0')) === 'E\t0');
	await tip.send('R');
	// An older text service (build 4) never shows them: none offered, its digits stay digits.
	const older = await client();
	await older.send(`H\tQQ.exe\t${0x0404}\t777\t4`);
	for (const ch of 'nihao') await key(older, ch);
	const olderCommit = fields(await older.send('K\t32\t32\t0'));
	check('a build 4 text service is offered nothing after a commit', olderCommit.commit === '你好' && olderCommit.candidates.length === 0 && (await older.send('T\t49\t49\t0')) === 'E\t0', JSON.stringify(olderCommit));
	older.close();

	// Breezell's plugin (off): its editor has the focus.
	const wait = () => new Promise(r => setTimeout(r, 60));
	const plugin = await client();
	check('the plugin is heard', (await plugin.send(`B\t${BREEZELL}\t1\t1\t0`)) === 'OK');
	await wait();
	check('it is told the system state (native: on)', plugin.events.at(-1) === 'EV\tmode\tn', plugin.events);
	await plugin.send(`B\t${BREEZELL}\t1\t1\t1`);
	check('the text service steps aside in that Breezell', (await tip.send('T\t72\t104\t0')) === 'E\t0');
	const k = await key(tip, 'h');
	check('a key there is not eaten', k.eaten === '0' && k.composing === '0', JSON.stringify(k));
	const m = fields(await tip.send('M'));
	await wait();
	check('Shift there: English, Breezell shows it (quiet)', m.quiet === '1' && m.mode === 'e' && plugin.events.at(-1) === 'EV\tmode\te', JSON.stringify(m) + plugin.events);
	await plugin.send(`B\t${BREEZELL}\t1\t1\t0`);  // the plugin follows (its echo changes nothing)

	// Another program: English there too, then Shift there brings native back everywhere.
	const other = await client();
	await other.send(`H\tnotepad.exe\t${0x0404}\t${OTHER}`);
	check('English in another program too', (await other.send('T\t72\t104\t0')) === 'E\t0');
	const m2 = fields(await other.send('M'));
	await wait();
	check('Shift there: native, shown by the text service, Breezell follows', m2.mode === 'n' && m2.quiet === '0' && plugin.events.at(-1) === 'EV\tmode\tn', JSON.stringify(m2) + plugin.events);
	await plugin.send(`B\t${BREEZELL}\t1\t1\t1`);
	check('another program gets the keys', (await other.send('T\t72\t104\t0')) === 'E\t1');
	// Breezell's own shortcut turns its plugin off: the system goes English.
	await plugin.send(`B\t${BREEZELL}\t1\t1\t0`);
	check('switched in Breezell: English everywhere', (await other.send('T\t72\t104\t0')) === 'E\t0');
	await plugin.send(`B\t${BREEZELL}\t1\t1\t1`);
	check('and back', (await other.send('T\t72\t104\t0')) === 'E\t1');

	// The chat loses the focus (a search box, the terminal): the text service takes the keys again.
	await plugin.send(`B\t${BREEZELL}\t0\t1\t1`);
	check('outside the editor and chat it is back', (await tip.send('T\t72\t104\t0')) === 'E\t1');
	// The window loses the focus.
	await plugin.send(`B\t${BREEZELL}\t1\t0\t1`);
	check('an unfocused Breezell window does not count', (await tip.send('T\t72\t104\t0')) === 'E\t1');
	// The text service in that Breezell goes (another keyboard picked): the plugin is told.
	const before = plugin.events.length;
	tip.close();
	await new Promise(r => setTimeout(r, 1700));
	check('when the system input method goes from Breezell, its plugin hears it', plugin.events.slice(before).includes('EV\ttip\t0'), plugin.events);
	const tip2 = await client();
	await tip2.send(`H\tBreezell.exe\t${0x0404}\t${BREEZELL}`);
	await wait();
	check('and the mode when it comes back', plugin.events.at(-1) === 'EV\tmode\tn', plugin.events);
	// The plugin goes away.
	await plugin.send(`B\t${BREEZELL}\t1\t1\t1`);
	plugin.close();
	await new Promise(r => setTimeout(r, 100));
	check('when the plugin is gone the text service takes over', (await tip2.send('T\t72\t104\t0')) === 'E\t1');

	// An older text service (no pid in its hello) is never stepped aside.
	const old = await client();
	await old.send(`H\tBreezell.exe\t${0x0404}`);
	const plugin2 = await client();
	await plugin2.send(`B\t0\t1\t1\t1`);
	check('a hello without a pid keeps the input method', (await old.send('T\t72\t104\t0')) === 'E\t1');
	for (const c of [tip2, other, old, plugin2]) c.close();
} finally {
	host.kill();
}
console.log(failed ? `${failed} failed` : 'all passed');
process.exit(failed ? 1 : 0);
