/**
 * Chinese next-word prediction (聯想), offline: in each test sentence the engine reads right (its
 * first reading is the text), after each word, are the next words among the first k offered? A
 * hit saves typing that word's pinyin (one key picks it): saved letters / all letters.
 *   predict-zh.ts <model dir> <set.jsonl>...
 */
import { readFileSync } from 'node:fs';
import { BOS, loadNgramModel, loadZhLexicon, combineLexicons, ZhDecoder } from '../engine/src/index.js';

const [dir, ...sets] = process.argv.slice(2);
const read = (f: string) => { const b = readFileSync(`${dir}/${f}`); return new Uint8Array(b.buffer, b.byteOffset, b.byteLength); };
const decoder = new ZhDecoder(combineLexicons([loadZhLexicon(read('zh.bzlx'))]), loadNgramModel(read('zh.bzlm')), undefined, {});
for (const set of sets) {
	const items = readFileSync(set, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l));
	let used = 0, chances = 0, hit1 = 0, hit3 = 0, hit5 = 0, letters = 0, saved = 0;
	for (const it of items) {
		const best = decoder.decode(it.pinyin.replace(/ /g, ''), { sentences: 1 }).sentences[0];
		if (!best || best.text !== it.text) continue;
		used++;
		const syl = it.pinyin.split(' ');
		let h2 = BOS, h1 = BOS, at = 0;
		best.entries.forEach((e, i) => {
			const text = decoder.text(e), toks = decoder.tokens(e);
			const n = [...text].length;
			const keys = syl.slice(at, at + n).join('').length;
			letters += keys;
			if (i > 0) {
				chances++;
				const r = decoder.predict(h2, h1, 5).findIndex(p => p.text === text);
				if (r === 0) hit1++;
				if (r >= 0 && r < 3) hit3++;
				if (r >= 0) { hit5++; saved += Math.max(0, keys - 1); }
			}
			for (let k = 0; k < toks.length; k++) { h2 = h1; h1 = toks[k]; }
			at += n;
		});
	}
	const p = (x: number, of: number) => (100 * x / Math.max(1, of)).toFixed(1);
	console.log(`${set.replace(/^.*\//, '')}: ${used} sentences, ${chances} next words: first ${p(hit1, chances)}%, top 3 ${p(hit3, chances)}%, top 5 ${p(hit5, chances)}%; letters saved ${p(saved, letters)}%`);
}
