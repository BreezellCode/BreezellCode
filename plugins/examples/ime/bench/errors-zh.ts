/**
 * Where the first candidate goes wrong (dev sets): the right sentence among the decoder's readings
 * but not first (ranking), or never read; for those, does each word of the text exist in the
 * lexicon with the reading the text has (a word missing, a reading missing), or are all there
 * (the search or the model lost it)?
 *   errors-zh.ts <model dir> <set.jsonl>...
 */
import { readFileSync } from 'node:fs';
import { loadNgramModel, loadZhLexicon, combineLexicons, ZhDecoder } from '../engine/src/index.js';
import { syllableIds } from '../engine/src/zh/pinyin.js';

const [dir, ...sets] = process.argv.slice(2);
const read = (f: string) => { const b = readFileSync(`${dir}/${f}`); return new Uint8Array(b.buffer, b.byteOffset, b.byteLength); };
const lex = combineLexicons([loadZhLexicon(read('zh.bzlx'))]);
const decoder = new ZhDecoder(lex, loadNgramModel(read('zh.bzlm')), undefined, {});
// Every lexicon text, and its readings (as syllable id lists).
const byText = new Map<string, string[]>();
for (let e = 0; e < lex.size; e++) {
	const t = lex.text(e);
	const r = Array.from(lex.syllables(e)).join(',');
	const list = byText.get(t);
	if (list) list.push(r); else byText.set(t, [r]);
}
for (const set of sets) {
	const items = readFileSync(set, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l));
	const tally = { right: 0, ranked: 0, charMissing: 0, readingMissing: 0, allThere: 0 };
	const samples: Record<string, string[]> = { ranked: [], charMissing: [], readingMissing: [], allThere: [] };
	for (const it of items) {
		const input = it.pinyin.replace(/ /g, '');
		const texts = decoder.decode(input, { sentences: 20 }).sentences.map(s => s.text);
		if (texts[0] === it.text) { tally.right++; continue; }
		if (texts.includes(it.text)) { tally.ranked++; samples.ranked.push(`${it.text} ← ${texts[0]}`); continue; }
		// Character by character: is each character in the lexicon with the text's reading?
		const syl = syllableIds(it.pinyin);
		const chars = [...it.text];
		let kind = 'allThere';
		for (let i = 0; i < chars.length; i++) {
			const readings = byText.get(chars[i]);
			if (!readings) { kind = 'charMissing'; break; }
			if (!readings.includes(String(syl[i]))) { kind = 'readingMissing'; samples.readingMissing.push(`${chars[i]} ${it.pinyin.split(' ')[i]} in ${it.text}`); break; }
		}
		(tally as any)[kind]++;
		if (kind !== 'readingMissing') samples[kind].push(`${it.text} ← ${texts[0]}`);
	}
	const n = items.length;
	const p = (x: number) => (100 * x / n).toFixed(1);
	console.log(`${set.replace(/^.*\//, '')}: right ${p(tally.right)}% | right in the readings, ranked lower ${p(tally.ranked)}% | never read: a character missing ${p(tally.charMissing)}%, a character's reading missing ${p(tally.readingMissing)}%, every character there ${p(tally.allThere)}%`);
	for (const [k, v] of Object.entries(samples)) console.log(`  ${k}: ${v.slice(0, 8).join(' ｜ ')}`);
}
