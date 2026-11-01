/**
 * Cases users reported, with the real models: each must keep giving the expected first candidate.
 *   regress.ts <data dir with zh.bzlm zh.bzlx zh-tw.bzlx …>   (bundled by tools/build.mjs? no: run with esbuild, see package.json)
 */
import { AdaptiveModel } from '../engine/src/index.js';
import { ChineseComposer, ChineseData } from '../src/composers.js';
import { configuredDataDir } from '../src/paths.js';

const data = new ChineseData(process.argv[2] ?? configuredDataDir());
let failed = 0;
/** Types `pieces` one after another (each committed with its first candidate) then `last`; the first candidate must be `want`. */
function check(name: string, pieces: string[], last: string, want: string): void {
	const c = new ChineseComposer(data, 'pinyin', true, new AdaptiveModel());
	for (const p of pieces) {
		for (const k of p) c.type(k);
		c.select(0);
		c.state();
	}
	for (const k of last) c.type(k);
	const got = c.state().candidates[0] ?? '';
	const ok = got === want;
	if (!ok) failed++;
	console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}: ${[...pieces, last].join(' + ')} → ${got}${ok ? '' : ` (want ${want})`}`);
}
check('the words before count', ['xianzainixuyao'], 'zuo', '做');
check('one go', [], 'nihaoxianzainiyaozuodeshiqing', '你好現在你要做的事情');
check('a syllable still being typed', ['nihao', 'xianzai', 'niyao'], 'zuod', '做的');
check('closing the word before', ['nihao', 'xianzai', 'niyao', 'zuo'], 'd', '的');
check('closing the word before (whole syllable)', ['nihao', 'xianzai', 'niyao', 'zuo'], 'de', '的');
check('an initial alone', ['niyao'], 'd', '的');
check('two keys swapped (jain for jian)', ['nihaoxianzainiyaozuodeshiqing'], 'henjaindan', '很簡單');
check('two keys swapped (zhogn for zhong)', [], 'zhognguoren', '中國人');
check('eu for ue', [], 'woxiangxeuxi', '我想學習');
check('au for ua', [], 'mingtianqutushugaun', '明天去圖書館');
check('typing right still wins', [], 'jiandan', '簡單');

/**
 * With a user model taught by `history` (each entry typed, then the candidate whose text it names
 * picked, or the first), `last` typed after `pieces` must give `want` first.
 */
function learned(name: string, history: [string, string?][], pieces: string[], last: string, want: string): void {
	const m = new AdaptiveModel();
	const c = new ChineseComposer(data, 'pinyin', true, m);
	for (const [keys, pick] of history) {
		for (const k of keys) c.type(k);
		const cands = c.state().candidates;
		c.select(Math.max(0, pick ? cands.indexOf(pick) : 0));
		c.state();
		c.forget();
	}
	for (const p of pieces) { for (const k of p) c.type(k); c.select(0); c.state(); }
	for (const k of last) c.type(k);
	const got = c.state().candidates[0] ?? '';
	const ok = got === want;
	if (!ok) failed++;
	console.log(`${ok ? 'ok  ' : 'FAIL'} learning, ${name}: ${[...pieces, last].join(' + ')} → ${got}${ok ? '' : ` (want ${want})`}`);
}
// Words typed elsewhere must not pull a path of them over one word the model knows (正是 + 发布 over 正式发布).
learned('words typed elsewhere', [['zhezhengshiwoyaode'], ['xinbanbenfabule'], ['zhengshi', '正是'], ['fabu', '發布']], ['xianzai'], 'zhengshifabu', '正式發布');
// The opposite: what the user chose, again and again, comes first.
learned('chosen three times', [['zhengshifabu', '正是發布'], ['zhengshifabu', '正是發布'], ['zhengshifabu', '正是發布']], ['xianzai'], 'zhengshifabu', '正是發布');

/** English among the Chinese candidates: `keys` typed (after `context`), `want` at `at`, or nowhere (at -1). */
function english(name: string, keys: string, want: string, at: number, context = ''): void {
	const c = new ChineseComposer(data, 'pinyin', true, new AdaptiveModel());
	if (context) c.setContext(context);
	for (const k of keys) c.type(k);
	const cands = c.state().candidates;
	const got = cands.indexOf(want);
	const ok = got === at;
	if (!ok) failed++;
	console.log(`${ok ? 'ok  ' : 'FAIL'} english, ${name}: ${keys} → ${cands.slice(0, 5).join(' | ')}${ok ? '' : ` (want ${want} at ${at}, got ${got})`}`);
}
english('no clean pinyin: first', 'hello', 'hello', 0);
english('clean pinyin: after the sentences', 'women', 'women', 3);
english('clean pinyin: the Chinese first', 'women', '我們', 0);
english('not English: none', 'nihao', 'nihao', -1);
english('a word of the code around, as written', 'usestate', 'useState', 0, 'const [count, setCount] = useState(0);');
english('a capital that starts a sentence goes', 'hello', 'hello', 0, 'Hello there.');
english('a common-looking word read as a slip of pinyin: after the readings', 'jai', 'jai', 3);
english('a rare word the code around holds: first', 'jai', 'jai', 0, 'const jai = 1;');

/** The panel's top line for the first candidate: the syllables as read, after any slip was fixed. */
function reading(name: string, layout: string, keys: string, want: string): void {
	const c = new ChineseComposer(data, layout, true, new AdaptiveModel());
	for (const k of keys) c.type(k);
	c.state();
	const got = c.reading(0);
	const ok = got === want;
	if (!ok) failed++;
	console.log(`${ok ? 'ok  ' : 'FAIL'} reading, ${name}: ${keys} → ${got}${ok ? '' : ` (want ${want})`}`);
}
reading('a slip shows fixed', 'pinyin', 'henjaindan', 'hen jian dan');
reading('initials show whole (這個人)', 'pinyin', 'zgr', 'zhe ge ren');
reading('double pinyin shows pinyin', 'flypy', 'jmdj', 'jian dan');
reading('zhuyin shows symbols', 'zhuyin', 'ru04', 'ㄐㄧㄢ');
process.exit(failed ? 1 : 0);
