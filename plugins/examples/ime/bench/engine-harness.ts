/**
 * The benchmark's line protocol (the same as bench/rime/rime-harness.c) over our engine:
 *
 *   S <scheme>   choose the input scheme (zh-pinyin)
 *   K <keys>     clear, then type <keys>
 *   A <keys>     type <keys> on top of the composition
 *   P <index>    pick candidate <index>
 *   C            clear
 *   X <text>     the text around the cursor (editor, chat); \n for line breaks
 *   Q            quit
 *
 * Each command answers {"commit":"...","preedit":"...","cands":["...",...]} (BENCH_CANDS, 10).
 * Usage: node engine-harness.js <data dir with zh.bzlm and zh.bzlx>
 *
 * BENCH_LAYOUT=zhuyin types Dachen zhuyin (tones as typed) and writes Taiwan Traditional: the
 * zh-tw.bzlx pack, zh-tones.tsv and zh-s2tw.txt / zh-t2s.txt from the data dir.
 * BENCH_LAYOUT=dp:<scheme> types double pinyin (flypy, mspy, ziranma, sogou, abc, ziguang, jiajia).
 * BENCH_LAYOUT=table:<file.bztb>[:smart] types codes of a table (Wubi…), fixed or smart order; K then
 * keeps what was committed before as the model's history, C starts a new text.
 * BENCH_LAYOUT=ja types romaji: ja.bzja, ja.bzlm and romanji-hiragana.tsv from the data dir; the
 * candidates are whole conversions (BENCH_JA_LM=0: Mozc's costs alone).
 */
import { existsSync, readFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
import {
	AdaptiveModel, combineLexicons, doublePinyin, JaConverter, loadCodeTable, loadJaLexicon, loadNgramModel, loadToneTable, loadZhLexicon, RomajiComposer,
	RomajiTable, ScriptConverter, TableSession, ZhDecoder, ZhSession, ZHUYIN,
} from '../engine/src/index.js';

const dir = process.argv[2];
const maxCands = Number(process.env.BENCH_CANDS ?? 10);
if (process.env.BENCH_LAYOUT === 'ja') {
	const jaLm = process.env.BENCH_JA_LM === '0' ? undefined : loadNgramModel(new Uint8Array(readFileSync(`${dir}/ja.bzlm`)));
	const converter = new JaConverter(loadJaLexicon(new Uint8Array(readFileSync(`${dir}/ja.bzja`))), jaLm);
	const table = new RomajiTable(readFileSync(`${dir}/romanji-hiragana.tsv`, 'utf8'));
	const composer = new RomajiComposer(table);
	let cands: string[] = [];
	let commit = '';
	const rlj = createInterface({ input: process.stdin, crlfDelay: Infinity });
	rlj.on('line', line => {
		const arg = line.slice(2);
		switch (line[0]) {
			case 'K': composer.clear(); composer.type(arg); cands = converter.convert(composer.flush(), { nbest: maxCands }).map(c => c.text); break;
			case 'P': commit = cands[Number(arg)] ?? ''; cands = []; composer.clear(); break;
			case 'C': composer.clear(); cands = []; break;
			case 'Q': process.exit(0);
		}
		process.stdout.write(JSON.stringify({ commit, preedit: composer.text, cands }) + '\n');
		commit = '';
	});
} else {
const zhuyin = process.env.BENCH_LAYOUT === 'zhuyin';
const file = (name: string) => `${dir}/${name}`;
const lm = loadNgramModel(new Uint8Array(readFileSync(file('zh.bzlm'))));
const lexicons = [loadZhLexicon(new Uint8Array(readFileSync(file('zh.bzlx'))))];
if (zhuyin && existsSync(file('zh-tw.bzlx')) && process.env.BENCH_TW_PACK !== '0') {
	lexicons.push(loadZhLexicon(new Uint8Array(readFileSync(file('zh-tw.bzlx')))));
}
const lex = combineLexicons(lexicons);
const tones = zhuyin && process.env.BENCH_TONES !== '0' ? loadToneTable(readFileSync(file('zh-tones.tsv'), 'utf8')) : undefined;
const script = zhuyin ? new ScriptConverter(readFileSync(file(process.env.BENCH_S2TW ?? 'zh-s2tw.txt'), 'utf8')) : undefined;
const fold = zhuyin ? new ScriptConverter(readFileSync(file('zh-t2s.txt'), 'utf8')) : undefined;
// BENCH_LEARN=0: no user model (the engine as installed, before any use).
const adaptive = process.env.BENCH_LEARN === '0' ? undefined : new AdaptiveModel({
	contextBonus: process.env.BZ_CTX_BONUS ? Number(process.env.BZ_CTX_BONUS) : undefined,
	cacheWeight: process.env.BZ_CACHE_WEIGHT ? Number(process.env.BZ_CACHE_WEIGHT) : undefined,
	pickBonus: process.env.BZ_PICK_BONUS ? Number(process.env.BZ_PICK_BONUS) : undefined,
	unigramCap: process.env.BZ_UNI_CAP ? Number(process.env.BZ_UNI_CAP) : undefined,
	pairDiscount: process.env.BZ_PAIR_DISCOUNT ? Number(process.env.BZ_PAIR_DISCOUNT) : undefined,
	priorTokens: process.env.BZ_PRIOR_TOKENS ? Number(process.env.BZ_PRIOR_TOKENS) : undefined,
});
const layout = process.env.BENCH_LAYOUT ?? '';
const decoder = new ZhDecoder(lex, lm, adaptive, zhuyin ? { speller: ZHUYIN, tones } : layout.startsWith('dp:') ? { speller: doublePinyin(layout.slice(3)) } : {});
const session = new ZhSession(decoder, undefined, undefined, {
	script, fold,
	leadingSentences: process.env.BZ_LEAD_SENTENCES ? Number(process.env.BZ_LEAD_SENTENCES) : undefined,
	sentenceGap: process.env.BZ_SENTENCE_GAP ? Number(process.env.BZ_SENTENCE_GAP) : undefined,
});

if (layout.startsWith('table:')) {
	const [, path, mode] = layout.split(':');
	const table = new TableSession(loadCodeTable(new Uint8Array(readFileSync(path))), lm, adaptive, {
		smart: mode === 'smart',
		margin: process.env.BZ_TABLE_MARGIN ? Number(process.env.BZ_TABLE_MARGIN) : undefined,
		tableWeight: process.env.BZ_TABLE_WEIGHT ? Number(process.env.BZ_TABLE_WEIGHT) : undefined,
	});
	const rlt = createInterface({ input: process.stdin, crlfDelay: Infinity });
	rlt.on('line', line => {
		const arg = line.slice(2);
		switch (line[0]) {
			case 'K': table.clearInput(); table.type(arg); break;
			case 'A': table.type(arg); break;
			case 'P': table.select(Number(arg)); break;
			case 'C': table.clear(); break;
			case 'Q': process.exit(0);
		}
		const s = table.state();
		process.stdout.write(JSON.stringify({ commit: s.commit, preedit: s.preedit, cands: s.candidates.slice(0, maxCands).map(c => c.text) }) + '\n');
	});
} else {
const rl = createInterface({ input: process.stdin, crlfDelay: Infinity });
rl.on('line', line => {
	const cmd = line[0];
	const arg = line.slice(2);
	switch (cmd) {
		// Every item is a sentence of its own: nothing carries over from the one before.
		case 'K': session.clear(); session.forget(); session.type(arg); break;
		case 'A': session.type(arg); break;
		case 'P': session.select(Number(arg)); break;
		case 'C': session.clear(); session.forget(); break;
		case 'X': session.setContext(arg.replace(/\\n/g, '\n')); break;  // context: the text around the cursor
		case 'Q': process.exit(0);
	}
	const s = session.state();
	process.stdout.write(JSON.stringify({ commit: s.commit, preedit: s.preedit, cands: s.candidates.slice(0, maxCands).map(c => c.text) }) + '\n');
});
}
}
