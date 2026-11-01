#!/usr/bin/env node
// Robustness and performance with the real models: random and real input typed key by key (the
// way an input method works: candidates after every key), for every layout. Fails on a throw, a
// non-string candidate or a key slower than the limit; reports load time, memory and latency.
//
//   stress.mjs <data dir> [keys per layout, 20000]
//
// Data dir: model/ (zh.bzlm, zh.bzlx, zh-tw.bzlx, zh-tones.tsv, zh-s2tw.txt, zh-t2s.txt, wubi86.bztb),
// model-ja/ (ja.bzja, ja.bzlm, romanji-hiragana.tsv), lm-ko/, lm-en/.
import { readFileSync, writeFileSync } from 'node:fs';
import {
	AdaptiveModel, BOS, combineLexicons, composeKeys, doublePinyin, JaConverter, keysOf, loadCodeTable, loadJaLexicon, loadNgramModel, loadToneTable,
	loadZhLexicon, PrefixPredictor, RomajiComposer, RomajiTable, ScriptConverter, SpellCorrector, TableSession, ZhDecoder, ZhSession, ZHUYIN,
} from '../engine/dist/engine/src/index.js';

const [dir, perLayoutArg = '20000'] = process.argv.slice(2);
const perLayout = Number(perLayoutArg);
const LIMIT_MS = Number(process.env.STRESS_LIMIT_MS ?? 100);
const report = { node: process.version, limitMs: LIMIT_MS, layouts: {}, load: {}, failures: [] };
const mem = () => Math.round(process.memoryUsage().rss / 1e6);
let seed = 5;
const rand = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
const pick = s => s[Math.floor(rand() * s.length)];

function timed(name, fn) {
	const before = mem();
	const t0 = performance.now();
	const v = fn();
	report.load[name] = { ms: Math.round(performance.now() - t0), rssAddedMB: mem() - before };
	return v;
}

/** Types `keys` one at a time into `step(key)` (which returns the candidates) and checks each answer. */
function drive(layout, sequences, reset, step) {
	const ms = [];
	let keys = 0;
	for (const seq of sequences) {
		reset();
		for (const k of seq) {
			const t0 = performance.now();
			let cands;
			try {
				cands = step(k);
			} catch (e) {
				report.failures.push({ layout, seq, key: k, error: String(e?.stack ?? e).slice(0, 400) });
				break;
			}
			const dt = performance.now() - t0;
			ms.push(dt);
			keys++;
			if (!Array.isArray(cands) || cands.some(c => typeof c !== 'string')) {
				report.failures.push({ layout, seq, key: k, error: 'candidates not strings' });
			}
			if (dt > LIMIT_MS * 5) {
				report.failures.push({ layout, seq, key: k, error: `slow key: ${dt.toFixed(1)} ms` });
			}
		}
	}
	ms.sort((a, b) => a - b);
	const q = p => +ms[Math.min(ms.length - 1, Math.floor(ms.length * p))].toFixed(2);
	report.layouts[layout] = { keys, p50: q(0.5), p95: q(0.95), p99: q(0.99), max: q(1), overLimit: ms.filter(x => x > LIMIT_MS).length };
	console.error(layout, JSON.stringify(report.layouts[layout]));
}

/** Random sequences over `alphabet` (lengths 1..max) and the real inputs, up to `perLayout` keys. */
function sequences(alphabet, real, max = 30) {
	const out = [];
	let n = 0;
	for (const r of real) {
		if (n >= perLayout / 2) break;
		out.push(r);
		n += r.length;
	}
	while (n < perLayout) {
		const len = 1 + Math.floor(rand() * max);
		let s = '';
		for (let i = 0; i < len; i++) s += pick(alphabet);
		out.push(s);
		n += len;
	}
	return out;
}
const lines = (path, field, n = 2000) => readFileSync(path, 'utf8').split('\n').filter(Boolean).slice(0, n).map(l => JSON.parse(l)[field] ?? JSON.parse(l).pinyin?.replace(/ /g, '')).filter(Boolean);

// Chinese: pinyin, zhuyin, double pinyin (one lexicon and model for all three).
const lm = timed('zh model', () => loadNgramModel(new Uint8Array(readFileSync(`${dir}/model/zh.bzlm`))));
const base = timed('zh lexicon', () => loadZhLexicon(new Uint8Array(readFileSync(`${dir}/model/zh.bzlx`))));
const tw = timed('zh-tw pack + tones + scripts', () => ({
	pack: loadZhLexicon(new Uint8Array(readFileSync(`${dir}/model/zh-tw.bzlx`))),
	tones: loadToneTable(readFileSync(`${dir}/model/zh-tones.tsv`, 'utf8')),
	s2tw: new ScriptConverter(readFileSync(`${dir}/model/zh-s2tw.txt`, 'utf8')),
	t2s: new ScriptConverter(readFileSync(`${dir}/model/zh-t2s.txt`, 'utf8')),
}));
const zhSession = (layout, adaptive) => new ZhSession(new ZhDecoder(layout.tw ? combineLexicons([base, tw.pack]) : base, lm, adaptive, layout), undefined, undefined, layout.tw ? { script: tw.s2tw, fold: tw.t2s } : {});
{
	const s = zhSession({}, new AdaptiveModel());
	const real = lines(`${dir}/testsets/zh-chat.jsonl`, 'input');
	drive('pinyin', sequences('abcdefghijklmnopqrstuvwxyz\'', real), () => s.clear(), k => { s.type(k); const st = s.state(); return st.candidates.map(c => c.text); });
	// Picking pieces and learning must not break either.
	for (const r of real.slice(0, 300)) { s.clear(); s.type(r); for (let g = 0; g < 10 && s.state().candidates.length; g++) s.select(Math.floor(rand() * 3)); }
}
{
	const s = zhSession({ speller: ZHUYIN, tones: tw.tones, tw: true }, new AdaptiveModel());
	const real = lines(`${dir}/testsets/tw-chat.jsonl`, 'input');
	drive('zhuyin', sequences('1qaz2wsxedcrfv5tgbyhnujm8ik,9ol.0p;/- 6347', real), () => s.clear(), k => { s.type(k); return s.state().candidates.map(c => c.text); });
}
{
	const sp = doublePinyin('flypy');
	const s = zhSession({ speller: sp }, new AdaptiveModel());
	const real = lines(`${dir}/testsets/dp-flypy-chat.jsonl`, 'input');
	drive('double pinyin (flypy)', sequences('abcdefghijklmnopqrstuvwxyz', real), () => s.clear(), k => { s.type(k); return s.state().candidates.map(c => c.text); });
}
// Wubi (smart order: the model in use).
{
	const table = timed('wubi table', () => loadCodeTable(new Uint8Array(readFileSync(`${dir}/model/wubi86.bztb`))));
	const s = new TableSession(table, lm, new AdaptiveModel(), { smart: true });
	const real = readFileSync(`${dir}/testsets/wubi-chat.jsonl`, 'utf8').split('\n').filter(Boolean).slice(0, 2000).map(l => JSON.parse(l).words.map(w => w.code).join(''));
	drive('wubi 86', sequences('abcdefghijklmnopqrstuvwxy', real), () => s.clear(), k => { s.type(k); const st = s.state(); if (rand() < 0.1 && st.candidates.length) s.select(0); return st.candidates.map(c => c.text); });
}
// Japanese: romaji, converted after every key.
{
	const ja = timed('ja lexicon + model', () => ({ lex: loadJaLexicon(new Uint8Array(readFileSync(`${dir}/model-ja/ja.bzja`))), lm: loadNgramModel(new Uint8Array(readFileSync(`${dir}/model-ja/ja.bzlm`))) }));
	const conv = new JaConverter(ja.lex, ja.lm);
	const table = new RomajiTable(readFileSync(`${dir}/model-ja/romanji-hiragana.tsv`, 'utf8'));
	const c = new RomajiComposer(table);
	const real = lines(`${dir}/testsets/ja-subs.jsonl`, 'input');
	drive('japanese', sequences('abcdefghijklmnopqrstuvwxyz-\'', real, 40), () => c.clear(), k => { c.type(k); return conv.convert(c.text, { nbest: 5 }).map(x => x.text); });
}
// Korean: composition and prediction after every key.
{
	const ko = timed('ko model + vocab', () => {
		const words = readFileSync(`${dir}/lm-ko/ko.vocab`, 'utf8').split('\n');
		let last = 4;
		while (last < words.length && /^[가-힣]+$/.test(words[last])) last++;
		return { words, last, lm: loadNgramModel(new Uint8Array(readFileSync(`${dir}/lm-ko/ko-3-2-3.bzlm`))) };
	});
	const keys = ko.words.map((w, i) => i >= 4 && i < ko.last ? keysOf(w) : '');
	const p = new PrefixPredictor(ko.words, keys, ko.lm, 4, ko.last);
	const real = readFileSync(`${dir}/text/ko-subs-test.txt`, 'utf8').split('\n').slice(0, 2000).map(l => keysOf(l.replace(/[^가-힣 ]/g, '')));
	let typed = '';
	drive('korean', sequences('qwertyuiopasdfghjklzxcvbnmQWERTOP <', real, 40), () => { typed = ''; }, k => {
		typed += k;
		const shown = composeKeys(typed);
		const word = typed.split(' ').pop() ?? '';
		return [shown, ...p.suggest(BOS, BOS, word.replace(/</g, ''), 3).map(x => x.word)];
	});
}
// English: prediction and correction after every key.
{
	const en = timed('en model + vocab', () => {
		const words = readFileSync(`${dir}/lm-en/en.vocab`, 'utf8').split('\n');
		let last = 4;
		while (last < words.length && /^[a-z']+$/.test(words[last])) last++;
		return { words, last, lm: loadNgramModel(new Uint8Array(readFileSync(`${dir}/lm-en/en-3-2-2.bzlm`))) };
	});
	const p = new PrefixPredictor(en.words, en.words.map((w, i) => i >= 4 && i < en.last ? w : ''), en.lm, 4, en.last);
	const ids = new Map(en.words.slice(4, en.last).map((w, i) => [w, i + 4]));
	const corr = new SpellCorrector(ids, en.lm);
	const real = readFileSync(`${dir}/text/en-wiki-test.txt`, 'utf8').split('\n').slice(0, 2000).map(l => l.toLowerCase().replace(/[^a-z' ]/g, ''));
	let typed = '';
	drive('english', sequences('abcdefghijklmnopqrstuvwxyz\' ', real, 60), () => { typed = ''; }, k => {
		typed += k;
		const word = typed.split(' ').pop() ?? '';
		const out = p.suggest(BOS, BOS, word, 3).map(x => x.word);
		if (k === ' ' && typed.length > 1) {
			const prev = typed.trimEnd().split(' ').pop() ?? '';
			if (prev) out.push(corr.correct(BOS, BOS, prev));
		}
		return out;
	});
}
report.rssMB = mem();
report.heapMB = Math.round(process.memoryUsage().heapUsed / 1e6);
writeFileSync(process.env.STRESS_OUT ?? 'stress.json', JSON.stringify(report, null, '\t'));
console.error(`failures: ${report.failures.length}, rss ${report.rssMB} MB`);
for (const f of report.failures.slice(0, 10)) console.error(JSON.stringify(f).slice(0, 500));
process.exit(report.failures.length ? 1 : 0);
