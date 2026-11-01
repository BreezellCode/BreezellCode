/**
 * Logic tests that need no downloaded data: spellers and syllable graphs, script conversion,
 * romaji, Hangul, code tables, the user model, prediction and correction on small made-up models.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
	AdaptiveModel, BOS, composeKeys, dachenOf, DOUBLE_PINYIN_SCHEMES, doublePinyin, EdgeKind, HangulComposer, keysOf, loadCodeTable, NgramModel,
	PrefixPredictor, RomajiComposer, RomajiTable, ScriptConverter, SpellCorrector, syllableGraph, syllableId, SYLLABLES, syllableOf, TableSession,
	slipsOf, toRomaji, zhuyinGraph, zhuyinOf, ZHUYIN,
} from '../src/index.js';

/** Every way the graph spells the whole input as syllables (full edges only), as strings. */
function readings(graph: ReturnType<typeof syllableGraph>, n: number, fullOnly = true): string[] {
	const out: string[] = [];
	const walk = (pos: number, acc: string[]) => {
		if (pos === n) {
			out.push(acc.join(' '));
			return;
		}
		for (const e of graph[pos] ?? []) {
			if (fullOnly && e.kind !== EdgeKind.Full) {
				continue;
			}
			for (let id = e.lo; id <= e.hi; id++) {
				walk(e.end, [...acc, syllableOf(id)]);
			}
		}
	};
	walk(0, []);
	return out;
}

test('pinyin: whole syllables, apostrophes, ü spellings', () => {
	assert.ok(readings(syllableGraph('nihao'), 5).includes('ni hao'));
	assert.ok(readings(syllableGraph('xian'), 4).includes('xian'));
	assert.ok(readings(syllableGraph('xian'), 4).includes('xi an'));
	assert.deepEqual(readings(syllableGraph('xi\'an'), 5), ['xi an']);
	assert.ok(readings(syllableGraph('lve'), 3).includes('lve'));
	assert.ok(readings(syllableGraph('lue'), 3).includes('lve'));  // typed lue, the lexicon's lve
	assert.equal(syllableOf(syllableId('zhuang')), 'zhuang');
});

test('pinyin: initials only where no whole syllable starts, the last syllable may be cut short', () => {
	const g = syllableGraph('bj');
	assert.ok(g[0].some(e => e.kind === EdgeKind.Initial));
	assert.ok(g[1].some(e => e.kind === EdgeKind.Partial));
	// "fengjiangjun": where jiang starts, j is not read as an initial alone.
	const f = syllableGraph('fengjiangjun');
	assert.ok(f[4].some(e => e.kind === EdgeKind.Full && syllableOf(e.lo) === 'jiang'));
	assert.ok(!f[4].some(e => e.kind === EdgeKind.Initial));
	const z = syllableGraph('zho');
	assert.ok(z[0].some(e => e.kind === EdgeKind.Partial && syllableOf(e.lo) <= 'zhong' && syllableOf(e.hi) >= 'zhou'));
});

test('zhuyin: every syllable has a spelling, the keys read back, tones ride on edges', () => {
	const missing = SYLLABLES.filter(s => !zhuyinOf(s));
	assert.ok(missing.length <= 12, `syllables without zhuyin: ${missing.join(' ')}`);
	for (const s of SYLLABLES) {
		const keys = dachenOf(s);
		if (!keys) {
			continue;
		}
		const g = zhuyinGraph(keys + '3');
		const ids = g[0].filter(e => e.kind === EdgeKind.Full && e.end === keys.length + 1).map(e => e.lo);
		assert.ok(ids.includes(syllableId(s)), `${s} ${keys}`);
		assert.ok(g[0].filter(e => e.end === keys.length + 1).every(e => e.tone === 3));
	}
	// 你好 = ㄋㄧˇ ㄏㄠˇ: s u 3 c l 3
	const g = zhuyinGraph('su3cl3');
	assert.ok(g[0].some(e => syllableOf(e.lo) === 'ni' && e.end === 3 && e.tone === 3));
	assert.ok(g[3].some(e => syllableOf(e.lo) === 'hao' && e.end === 6));
	assert.equal(ZHUYIN.accept('Su3-x!'), 'su3-x');
	assert.ok(ZHUYIN.skips('3') && !ZHUYIN.skips('s'));
});

test('double pinyin: every scheme codes every syllable, codes read back', () => {
	for (const scheme of Object.keys(DOUBLE_PINYIN_SCHEMES)) {
		const sp = doublePinyin(scheme);
		for (const s of SYLLABLES) {
			const code = sp.code(s);
			assert.equal(code.length, 2, `${scheme} ${s}`);
			const g = sp.graph(code);
			assert.ok(g[0].some(e => e.kind === EdgeKind.Full && syllableId(s) >= e.lo && syllableId(s) <= e.hi), `${scheme} ${s} ${code}`);
		}
	}
	assert.equal(doublePinyin('flypy').code('shuang'), 'ul');
	assert.equal(doublePinyin('flypy').code('ang'), 'ah');
	// A single key at the end stands for the syllables it starts.
	const g = doublePinyin('flypy').graph('nihcx');
	assert.ok(g[4].some(e => e.kind === EdgeKind.Partial));
});

test('script conversion: longest phrase first, stages in order, a character\'s alternatives', () => {
	const conv = new ScriptConverter('头发\t頭髮\n发\t發 髮\n后\t後 后\n里\t裏 裡\n@stage\n裏\t裡\n');
	assert.equal(conv.convert('头发后'), '頭髮後');
	assert.equal(conv.convert('这里'), '这裡');  // stage 2 maps 裏 to 裡
	assert.deepEqual(conv.alternatives('发'), ['發', '髮']);
	assert.deepEqual(conv.alternatives('里'), ['裡']);  // both forms end as 裡 after stage 2
	assert.equal(conv.convert(''), '');
});

const ROMAJI = ['a\tあ', 'i\tい', 'u\tう', 'ka\tか', 'ki\tき', 'kya\tきゃ', 'n\tん', 'nn\tん', 'na\tな', 'ni\tに', 'kk\tっ\tk', 'tt\tっ\tt', 'ta\tた', 'te\tて', 'xtu\tっ', '-\tー', 'si\tし', 'shi\tし', 'su\tす'].join('\n');

test('romaji: waiting keys, ん before a consonant, doubled consonants, flush', () => {
	const table = new RomajiTable(ROMAJI);
	const c = new RomajiComposer(table);
	c.type('ka');
	assert.equal(c.text, 'か');
	c.type('n');
	assert.equal(c.waiting, 'n');
	c.type('ki');
	assert.equal(c.text, 'かんき');
	c.type('tte');
	assert.equal(c.text, 'かんきって');
	c.type('n');
	assert.equal(c.flush(), 'かんきってん');
	c.clear();
	c.type('kyaa-');
	assert.equal(c.flush(), 'きゃあー');
	// The generated romaji types back to its kana.
	for (const kana of ['かんき', 'きって', 'なにか', 'しすい', 'あっ']) {
		const r = toRomaji(kana, table);
		const d = new RomajiComposer(table);
		d.type(r);
		assert.equal(d.flush(), kana, `${kana} ${r}`);
	}
});

test('hangul: syllables, pairs, a final moving on, backspace by jamo', () => {
	assert.equal(composeKeys('dkssudgktpdy'), '안녕하세요');
	assert.equal(composeKeys('rkqt'), '값');
	assert.equal(composeKeys('rkqtdl'), '값이');
	assert.equal(composeKeys('ekfrk'), '달가');  // 닭 + ㅏ: the second part of ㄺ moves
	assert.equal(composeKeys('rhk'), '과');
	assert.equal(composeKeys('rt'), 'ㄳ');  // lone pair, as libhangul
	assert.equal(composeKeys('rtk'), 'ㄱ사');
	assert.equal(composeKeys('rk<'), 'ㄱ');
	assert.equal(composeKeys('rk <'), '가');
	assert.equal(composeKeys('Rk'), '까');
	const c = new HangulComposer();
	for (const k of 'gks') {
		c.key(k);
	}
	assert.equal(c.preedit, '한');
	c.backspace();
	assert.equal(c.preedit, '하');
	for (const text of ['대한민국', '괜찮아요', '읽었습니다', '닭볶음탕', '없어요']) {
		assert.equal(composeKeys(keysOf(text)), text);
	}
});

/** A .bztb in memory (the layout tools/build_table.mjs writes). */
function makeTable(rows: [string, string, number, number[]][]): Uint8Array {
	rows.sort((a, b) => (a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0) || b[2] - a[2]);
	const n = rows.length;
	const pad4 = (x: number) => (x + 3) & ~3;
	const codeUnits = rows.reduce((a, r) => a + r[1].length, 0);
	const textUnits = rows.reduce((a, r) => a + r[0].length, 0);
	const tokUnits = rows.reduce((a, r) => a + r[3].length, 0);
	const size = 24 + 4 * (n + 1) + pad4(codeUnits) + 4 * (n + 1) + pad4(2 * textUnits) + 4 * (n + 1) + 4 * tokUnits + 4 * n;
	const buf = new ArrayBuffer(size);
	const v = new DataView(buf);
	let at = 0;
	const u32 = (x: number) => { v.setUint32(at, x, true); at += 4; };
	new Uint8Array(buf, 0, 4).set([66, 90, 84, 66]);
	at = 4;
	u32(1); u32(n); u32(codeUnits); u32(textUnits); u32(tokUnits);
	let off = 0;
	for (const r of rows) { u32(off); off += r[1].length; } u32(off);
	for (const r of rows) { for (const ch of r[1]) { v.setUint8(at++, ch.charCodeAt(0)); } }
	at = pad4(at);
	off = 0;
	for (const r of rows) { u32(off); off += r[0].length; } u32(off);
	for (const r of rows) { for (let i = 0; i < r[0].length; i++) { v.setUint16(at, r[0].charCodeAt(i), true); at += 2; } }
	at = pad4(at);
	off = 0;
	for (const r of rows) { u32(off); off += r[3].length; } u32(off);
	for (const r of rows) { for (const t of r[3]) { u32(t); } }
	const top = new Map<string, number>();
	for (const r of rows) { top.set(r[1], Math.max(top.get(r[1]) ?? 0, r[2])); }
	for (const r of rows) { v.setFloat32(at, Math.log((r[2] + 1) / (top.get(r[1])! + 1)), true); at += 4; }
	return new Uint8Array(buf);
}

/** A model that knows a few pairs: logProb from a table, unigrams for the rest. */
function fakeModel(uni: Record<number, number>, pairs: Record<string, number> = {}): NgramModel {
	return {
		vocabSize: 100,
		order: 2,
		unigram: w => uni[w] ?? -20,
		logProb: (_h2, h1, w) => pairs[`${h1},${w}`] ?? (uni[w] ?? -20) - 2,
		followers: (_h2, h1, lo, hi) => Object.keys(pairs).filter(k => k.startsWith(`${h1},`)).map(k => Number(k.split(',')[1])).filter(w => w >= lo && w < hi),
		topFollowers: (_h2, h1) => Object.keys(pairs).filter(k => k.startsWith(`${h1},`)).map(k => Number(k.split(',')[1])),
	};
}

test('code table: exact rows in table order, completion, auto select, a key past a full code', () => {
	const table = loadCodeTable(makeTable([
		['工', 'a', 20, [10]], ['戈', 'a', 10, [11]], ['式', 'aa', 20, [12]], ['工作', 'aawt', 10, [10, 13]], ['的', 'r', 20, [14]], ['白', 'r', 10, [15]],
		['花', 'awxb', 10, [16]],
	]));
	assert.deepEqual(table.exact('a').map(x => x), [0, 2]);
	assert.deepEqual(table.codesOf('工'), ['a']);
	const s = new TableSession(table, undefined, undefined, {});
	s.type('a');
	let st = s.state();
	assert.deepEqual(st.candidates.slice(0, 3).map(c => c.text), ['工', '戈', '式']);
	s.clearInput();
	s.type('aawt');  // unique full code: commits on its own
	st = s.state();
	assert.equal(st.commit, '工作');
	s.type('awxbr');  // a key past a full code commits its first and starts the next code
	st = s.state();
	assert.equal(st.commit, '花');
	assert.equal(st.preedit, 'r');
	// Smart order: the model after 白 (15) prefers 戈 (11) clearly; fixed order keeps 工.
	const lm = fakeModel({ 10: -5, 11: -6 }, { '14,11': -1 });
	const smart = new TableSession(table, lm, undefined, { smart: true, margin: 1, tableWeight: 1 });
	smart.type('r');
	smart.select(0);  // 的 (14)
	smart.state();
	smart.type('a');
	assert.equal(smart.state().candidates[0].text, '戈');
});

test('user model: picks rise, counts fade, snapshot round trip', () => {
	const m = new AdaptiveModel({ halfLife: 10 });
	assert.equal(m.bonus('你好'), 0);
	m.learnPick('你好');
	assert.ok(m.bonus('你好') > 0);
	m.learnTokens([5, 6, 7]);
	const adj = m.adjust(BOS, 5, 6, -10);
	assert.ok(adj > 0);
	m.learnTokens(Array.from({ length: 100 }, () => 9));  // many other tokens: 6 fades
	assert.ok(m.adjust(BOS, 5, 6, -10) < adj);
	m.setContext('我们用 TypeScript 写引擎');
	assert.ok(m.bonus('引擎') > 0);
	const back = AdaptiveModel.fromJSON(JSON.parse(JSON.stringify(m.toJSON())));
	assert.ok(back.bonus('你好') > 0);
	back.clear();
	assert.equal(back.bonus('你好'), 0);
});

test('prediction: the prefix range, context over frequency', () => {
	const words = ['<s>', '</s>', '<unk>', '<x>', 'apple', 'apply', 'banana', 'band', 'bandit'];
	const lm = fakeModel({ 4: -3, 5: -4, 6: -5, 7: -3, 8: -6 }, { '4,6': -0.5 });
	const p = new PrefixPredictor(words, words, lm, 4, words.length);
	assert.deepEqual(p.range('ban'), [6, 9]);
	assert.deepEqual(p.range('appl'), [4, 6]);
	assert.deepEqual(p.range('z'), [9, 9]);
	assert.equal(p.suggest(BOS, BOS, 'ban', 1, true)[0].word, 'band');  // frequency
	assert.equal(p.suggest(BOS, 4, 'ban', 1)[0].word, 'banana');      // after "apple"
});

test('correction: slips back to words, words left alone, capitals kept', () => {
	const words = new Map([['the', 4], ['form', 5], ['from', 6], ['cat', 7]]);
	const lm = fakeModel({ 4: -2, 5: -9, 6: -5, 7: -6 }, { '7,6': -1 });
	const c = new SpellCorrector(words, lm);
	assert.equal(c.correct(BOS, BOS, 'teh'), 'the');
	assert.equal(c.correct(BOS, BOS, 'Teh'), 'The');
	assert.equal(c.correct(BOS, BOS, 'cat'), 'cat');
	assert.equal(c.correct(BOS, BOS, 'xqzw'), 'xqzw');  // nothing close: stays
	assert.ok(c.candidates(BOS, 7, 'form', 3).some(x => x.word === 'from'));
});

test('pinyin slips: keys swapped, a final\'s long form, a neighbouring key, one too many, one left out', () => {
	const of = (s: string) => slipsOf(s).map(syllableOf).sort();
	assert.ok(of('jain').includes('jian'));
	assert.ok(of('zhogn').includes('zhong'));
	assert.ok(of('xeu').includes('xue'));
	assert.ok(of('guei').includes('gui'));
	assert.ok(of('liou').includes('liu'));
	assert.ok(of('jisn').includes('jian'));     // the key next to a
	assert.ok(of('jiaan').includes('jian'));    // a key too many
	assert.ok(of('jan').includes('jian'));      // a key left out
	// In the graph, a slip is a corrected edge, and only where the letters are no syllable themselves.
	const g = syllableGraph('henjaindan');
	assert.ok(g[3].some(e => e.corrected && e.end === 7 && syllableOf(e.lo) === 'jian'));
	assert.ok(!syllableGraph('jiandan')[0].some(e => e.corrected));
	assert.ok(!syllableGraph('xian')[0].some(e => e.corrected));  // xian is a syllable: no xain/xina guesses
});

test('user model: another one merged in counts as learned here', () => {
	const a = new AdaptiveModel(), b = new AdaptiveModel();
	a.learnTokens([10, 11, 12]);
	a.learnPick('你好');
	for (let i = 0; i < 50; i++) {
		b.learnTokens([20, 21]);
	}
	b.learnPick('你好');
	b.learnPick('世界');
	b.learnWord('陳小明', [1, 2, 3], [30]);
	const before = a.toJSON();
	a.merge(b.toJSON());
	const after = a.toJSON();
	const uni = new Map(after.uni), bi = new Map(after.bi), picks = new Map(after.picks);
	assert.ok((uni.get(20) ?? 0) > 0 && (uni.get(10) ?? 0) === new Map(before.uni).get(10));
	assert.ok((bi.get('20,21') ?? 0) > 0);
	assert.equal(picks.get('你好'), 2);
	assert.equal(picks.get('世界'), 1);
	assert.equal(after.words.length, 1);
	a.merge(b.toJSON());
	assert.equal(a.toJSON().words[0].count, 2);
	a.merge({ version: 2 } as never);  // not a snapshot it knows: nothing
	assert.equal(a.toJSON().words.length, 1);
});
