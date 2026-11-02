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
english('clean pinyin: below the readings it does not beat', 'women', 'women', 2);
english('clean pinyin: the Chinese first', 'women', '我們', 0);
english('not English: none', 'nihao', 'nihao', -1);
english('a word of the code around, as written', 'usestate', 'useState', 0, 'const [count, setCount] = useState(0);');
english('a capital that starts a sentence goes', 'hello', 'hello', 0, 'Hello there.');
english('a name that looks like a slip of pinyin: below the readings', 'jai', 'Jai', 3);
english('a rare word the code around holds: first', 'jai', 'jai', 0, 'const jai = 1; jai += jai; return jai;');

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

// ------------------------------------------------------------ English among Chinese, and the text before the cursor
const composer = (traditional = false) => new ChineseComposer(data, 'pinyin', traditional, new AdaptiveModel());
const typed = (c: ChineseComposer, letters: string) => { for (const k of letters) c.type(k); return c.state().candidates; };
const pick = (c: ChineseComposer, text: string) => { const i = c.state().candidates.indexOf(text); if (i < 0) throw new Error(`${text} not offered`); c.select(i); return c.state().commit; };
function firstIs(name: string, context: string, letters: string, want: string, c = composer()): void {
	if (context) c.setContext(context);
	const list = typed(c, letters);
	const ok = list[0] === want;
	if (!ok) failed++;
	console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}: ${context.slice(-12)} + ${letters} → ${list.slice(0, 4).join(' ')}${ok ? '' : ` (want ${want})`}`);
	c.cancel();
}
function offered(name: string, context: string, letters: string, want: string, c = composer()): void {
	if (context) c.setContext(context);
	const list = typed(c, letters);
	const ok = list.slice(0, 7).includes(want);
	if (!ok) failed++;
	console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}: ${letters} → ${list.slice(0, 7).join(' ')}${ok ? '' : ` (want ${want} on the page)`}`);
	c.cancel();
}
function notFirst(name: string, context: string, letters: string, word: string, c = composer()): void {
	if (context) c.setContext(context);
	const list = typed(c, letters);
	const ok = list[0]?.toLowerCase() !== word.toLowerCase() && list.slice(0, 7).some(x => x.toLowerCase() === word.toLowerCase());
	if (!ok) failed++;
	console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}: ${letters} → ${list.slice(0, 5).join(' ')}${ok ? '' : ` (want ${word} below the first, on the page)`}`);
	c.cancel();
}
// The user's case: after Chinese, the reading of the same letters comes first; the word stays on the page.
firstIs('my after Chinese', '不然沒有辦法根據已經輸入的字進行精準預測，', 'my', '没有');
offered('and my is still there', '不然沒有辦法根據已經輸入的字進行精準預測，', 'my', 'my');
firstIs('hello: no Chinese reading to speak of', '你好，', 'hello', 'hello');
firstIs('the', '然后是', 'the', 'the');
firstIs('API as written', '调用这个', 'api', 'API');
firstIs('GitHub as written', '放到', 'github', 'GitHub');
firstIs('a word no reading covers', '使用', 'kubeconfig', 'kubeconfig');
firstIs('the word before closes: 我 + men', '我', 'men', '们');
notFirst('full pinyin stays Chinese: men', '我和', 'men', 'men');
notFirst('initials stay Chinese: yes', '这', 'yes', 'yes');
notFirst('full pinyin stays Chinese: can', '我们', 'can', 'can');
notFirst('a slip of pinyin is no name: jai', '', 'jai', 'Jai');
firstIs('after English, English', 'this is ', 'my', 'my');
firstIs('after English, English', 'please do it ', 'by', 'by');
firstIs('a word of the context', 'const [count, setCount] = useState(0);\n// 這裡的', 'usestate', 'useState');
firstIs('a word of the context by its start', 'const [count, setCount] = useState(0);\n// 這裡的', 'usesta', 'useState');
firstIs('a common word by its start', '部署到', 'kubern', 'Kubernetes');
{
	// A word the user writes: once it may be a one-off; used twice it is found by its start.
	const c = composer();
	typed(c, 'breezell');
	c.enter();
	const once = c.state().commit;
	const ok = once === 'breezell';
	if (!ok) failed++;
	console.log(`${ok ? 'ok  ' : 'FAIL'} Enter commits it as typed: ${once}`);
	const early = typed(c, 'breezel');
	const not = !early.includes('breezell');
	if (!not) failed++;
	console.log(`${not ? 'ok  ' : 'FAIL'} used once, not yet found by its start: ${early.slice(0, 3).join(' ')}`);
	c.cancel();
	firstIs('used once, the whole word comes first', '', 'breezell', 'breezell', c);
	typed(c, 'breezell');
	pick(c, 'breezell');
	firstIs('used twice: breezel finds it', '我們的', 'breezel', 'breezell', c);
	firstIs('and breez does too', '我們的', 'breez', 'breezell', c);
	firstIs('its capital as last written', '', 'breezell', 'breezell', c);
	c.noteLatin('Breezell');
	firstIs('as last written', '', 'breezel', 'Breezell', c);
	const snap = JSON.parse(JSON.stringify(c.adaptive.toJSON()));
	const again = new ChineseComposer(data, 'pinyin', false, AdaptiveModel.fromJSON(snap));
	firstIs('remembered across restarts', '', 'breezel', 'Breezell', again);
}
{
	// What the user does moves it, both ways.
	const c = composer();
	const ctx = '不然';
	firstIs('my starts below 没有', ctx, 'my', '没有', c);
	for (let i = 0; i < 3; i++) { c.setContext(ctx); typed(c, 'my'); pick(c, 'my'); }
	firstIs('picked three times, my comes first', ctx, 'my', 'my', c);
	for (let i = 0; i < 6; i++) { c.setContext(ctx); typed(c, 'my'); pick(c, '没有'); }
	firstIs('then 没有 six times, it gives way', ctx, 'my', '没有', c);
}
{
	const c = composer();
	typed(c, 'abcdef');
	c.enter();
	c.state();
	c.undoLastCommit();
	const gone = !c.adaptive.latinWord('abcdef');
	if (!gone) failed++;
	console.log(`${gone ? 'ok  ' : 'FAIL'} deleted at once, it is not remembered`);
}
// The words before the cursor, whoever typed them.
firstIs('the text before the cursor counts', '现在你要', 'zuo', '做');
firstIs('a clause cut anywhere', '我们需要', 'jiejue', '解决');
firstIs('punctuation starts afresh', '我们需要。', 'hao', '好');
firstIs('Traditional context', '現在你要', 'zuo', '做', composer(true));

process.exit(failed ? 1 : 0);
