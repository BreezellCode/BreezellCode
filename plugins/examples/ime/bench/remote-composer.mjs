#!/usr/bin/env node
// Breezell's plugin composing in the system input method's host (src/remote.ts), end to
// end: a real host on a socket in a scratch home, the plugin's RemoteComposer against it. Typing,
// the reading, picking, what is learned going into the host, Korean suggestions, and the host
// going away mid-composition (the composer fails cleanly, then works with a new host).
//   remote-composer.mjs <scratch dir> <data dir>
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, existsSync, readFileSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const [scratch, data] = process.argv.slice(2);
const here = dirname(fileURLToPath(import.meta.url));
const home = join(scratch, 'remote-home');
const conf = join(home, '.config', 'breezell-ime');
mkdirSync(conf, { recursive: true });
rmSync(join(conf, 'learned-zh.json'), { force: true });
writeFileSync(join(conf, 'config.json'), JSON.stringify({ zhLayout: 'pinyin', dataPath: data, pageSize: 5, learning: true }));
process.chdir(conf);
process.env.BREEZELL_IME_PIPE = 'host.sock';
const { HostClient, RemoteComposer } = await import(join(here, '..', 'engine', 'dist', 'remote.mjs'));

const startHost = () => spawn(process.execPath, [join(here, '..', 'dist', 'system', 'host.cjs')], { cwd: conf, env: { ...process.env, HOME: home, APPDATA: '', XDG_CONFIG_HOME: '', XDG_DATA_HOME: '' }, stdio: 'inherit' });
let failed = 0;
const check = (name, ok, got) => { if (!ok) failed++; console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : `: ${got}`}`); };
const wait = ms => new Promise(r => setTimeout(r, ms));

let host = startHost();
try {
	const engine = new HostClient(() => {}, () => {});
	for (let i = 0; i < 100 && !(await engine.connect()); i++) await wait(200);
	check('connects to the host', engine.connected);
	const zh = new RemoteComposer(engine, 'pinyin', true, false);
	check('the key rule is known without the host', zh.takes('h', false) && !zh.takes('1', false) && !zh.takes(';', false));
	for (const k of 'henjaindan') await zh.type(k);
	let s = zh.state();
	check('typing: composing, 很簡單 first', zh.composing && s.candidates[0] === '很簡單', JSON.stringify(s).slice(0, 120));
	check('the reading of the first', (await zh.reading(0)) === 'hen jian dan');
	await zh.select(0);
	s = zh.state();
	check('picking commits it', s.commit === '很簡單' && !zh.composing, JSON.stringify(s));
	check('the commit is taken once', zh.state().commit === '');
	// What the plugin learned before goes into the host's user model.
	const snapshot = { version: 1, clock: 10, uni: [], bi: [], picks: [['測試詞', 3]], words: [] };
	const r = await engine.request('merge', 0, { name: 'zh', snapshot });
	await wait(100);
	const saved = existsSync(join(conf, 'learned-zh.json')) ? JSON.parse(readFileSync(join(conf, 'learned-zh.json'), 'utf8')) : {};
	check('learning handed over is in the host\'s user model', !r.error && (saved.picks ?? []).some(([t, n]) => t === '測試詞' && n === 3), JSON.stringify(saved.picks ?? []).slice(0, 200));
	// Two compositions on one link are separate.
	const zy = new RemoteComposer(engine, 'zhuyin', true, false);
	for (const k of 'ru04') await zy.type(k);
	await zh.type('n');
	check('two compositions do not mix', zy.state().candidates.length > 0 && zh.state().preedit === 'n', `${zy.state().preedit} / ${zh.state().preedit}`);
	await zh.cancel();
	await zy.cancel();
	// Korean suggestions.
	const ko = new RemoteComposer(engine, 'korean', false, false);
	const sug = await ko.suggestions('안녕', []);
	check('Korean suggestions come from the host', Array.isArray(sug) && sug.length > 0, JSON.stringify(sug));
	// The host goes away mid-composition.
	await zh.type('n');
	await zh.type('i');
	host.kill('SIGKILL');
	await wait(300);
	let threw = false;
	try { await zh.type('h'); } catch { threw = true; }
	check('the host gone: the change fails, nothing stays composed', threw && !zh.composing);
	host = startHost();
	await wait(400);
	for (let i = 0; i < 100 && !(await engine.connect()); i++) await wait(200);
	for (const k of 'nihao') await zh.type(k);
	check('a new host: the same composer works again', zh.state().candidates[0] === '你好', JSON.stringify(zh.state()).slice(0, 100));
	engine.dispose();
} finally {
	host.kill();
}
console.log(failed ? `${failed} failed` : 'all passed');
process.exit(failed ? 1 : 0);
