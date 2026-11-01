/**
 * How far a better ranking could go: for each test sentence, where the right text is among the
 * decoder's best whole-sentence readings (beam 24, 20 readings), and, when it is in none, whether
 * the lexicon can spell it at all. A reranker (a neural model over the n-best) can only fix the
 * first kind; the second needs words or a wider search.
 *   oracle.ts <model dir> <set.jsonl>...
 */
import { readFileSync } from 'node:fs';
import { loadNgramModel, loadZhLexicon, combineLexicons, ZhDecoder } from '../engine/src/index.js';

const [dir, ...sets] = process.argv.slice(2);
const lm = loadNgramModel(new Uint8Array(readFileSync(`${dir}/zh.bzlm`)));
const lex = combineLexicons([loadZhLexicon(new Uint8Array(readFileSync(`${dir}/zh.bzlx`)))]);
const decoder = new ZhDecoder(lex, lm, undefined, {});
for (const set of sets) {
	const items = readFileSync(set, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l));
	let first = 0, in3 = 0, in10 = 0, in20 = 0, wideOnly = 0, n = 0;
	for (const it of items) {
		const input = it.pinyin.replace(/ /g, '');
		n++;
		const texts = decoder.decode(input, { sentences: 20 }).sentences.map(s => s.text);
		const rank = texts.indexOf(it.text);
		if (rank === 0) first++;
		if (rank >= 0 && rank < 3) in3++;
		if (rank >= 0 && rank < 10) in10++;
		if (rank >= 0) in20++;
		else if (decoder.decode(input, { sentences: 50, beam: 96 }).sentences.some(s => s.text === it.text)) wideOnly++;
	}
	const p = (x: number) => (100 * x / n).toFixed(1);
	console.log(`${set.replace(/^.*\//, '')}: first ${p(first)}  in top3 ${p(in3)}  top10 ${p(in10)}  top20 ${p(in20)}  | only with a 4x wider search ${p(wideOnly)}  | never spelled ${p(n - in20 - wideOnly)}`);
}
