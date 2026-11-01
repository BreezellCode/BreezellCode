#!/usr/bin/env node
// Spelling correction benchmark (English): held-out sentences with slips put in (15% of words of
// three letters or more: an adjacent key 50%, a missing letter 20%, an extra adjacent key 15%,
// two letters swapped 15%; seeded), each word corrected after the words before it.
//
//   run-correct.mjs --vocab <vocab> --lm <bzlm> --n 1000 --out <json> <held-out text files...>
//
//   fixed      slipped words that come back as they were meant
//   broken     words typed right that the corrector changes (false corrections)
//   wordAcc    words right after correction (before: 1 − the slipped share)
//   suggestedTop3  slipped words whose meant word is among the three suggestions shown
// Rankers: context (the trigram model, ours) and frequency (unigram: a plain spell checker).
import { readFileSync, writeFileSync } from 'node:fs';
import { BOS, loadNgramModel, SpellCorrector, UNK } from '../engine/dist/engine/src/index.js';

const args = process.argv.slice(2);
const opt = (name, def) => { const i = args.indexOf(name); if (i < 0) return def; const v = args[i + 1]; args.splice(i, 2); return v; };
const vocabPath = opt('--vocab'), lmPath = opt('--lm'), n = Number(opt('--n', '1000')), outPath = opt('--out', 'correct.json');
const words = readFileSync(vocabPath, 'utf8').split('\n');
const ids = new Map();
words.forEach((w, i) => { if (i >= 4 && /^[a-z']+$/.test(w)) ids.set(w, i); });
const lm = loadNgramModel(new Uint8Array(readFileSync(lmPath)));
const unigramLm = { ...lm, logProb: (_h2, _h1, w) => lm.unigram(w) };
const ours = new SpellCorrector(ids, lm);
const plain = new SpellCorrector(ids, unigramLm);

const ROWS = ['qwertyuiop', 'asdfghjkl', 'zxcvbnm'];
const near = c => { for (let r = 0; r < 3; r++) { const i = ROWS[r].indexOf(c); if (i >= 0) { const out = []; for (let rr = Math.max(0, r - 1); rr <= Math.min(2, r + 1); rr++) for (let j = 0; j < ROWS[rr].length; j++) { const d = Math.abs((j + rr * 0.5) - (i + r * 0.5)); if (d <= 1.01 && !(rr === r && j === i)) out.push(ROWS[rr][j]); } return out; } } return []; };
let seed = 13;
const rand = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
function slip(w) {
	const r = rand(), i = Math.floor(rand() * w.length);
	if (r < 0.5) { const nb = near(w[i]); if (!nb.length) return w; return w.slice(0, i) + nb[Math.floor(rand() * nb.length)] + w.slice(i + 1); }
	if (r < 0.7) return w.slice(0, i) + w.slice(i + 1);
	if (r < 0.85) { const nb = near(w[i]); if (!nb.length) return w; return w.slice(0, i + 1) + nb[Math.floor(rand() * nb.length)] + w.slice(i + 1); }
	if (i + 1 >= w.length || w[i] === w[i + 1]) return w.slice(0, i) + w.slice(i + 1);
	return w.slice(0, i) + w[i + 1] + w[i] + w.slice(i + 2);
}
function sentences(path) {
	const out = [];
	for (const line of readFileSync(path, 'utf8').split('\n')) {
		const ws = line.toLowerCase().split(/\s+/).map(w => w.replace(/^[^a-z']+|[^a-z']+$/g, '')).filter(Boolean);
		if (ws.length >= 4 && ws.length <= 25 && ws.every(w => /^[a-z']+$/.test(w))) out.push(ws);
	}
	let s2 = 7;
	const r2 = () => { s2 = (s2 * 1103515245 + 12345) & 0x7fffffff; return s2 / 0x7fffffff; };
	for (let i = out.length - 1; i > 0; i--) { const j = Math.floor(r2() * (i + 1)); [out[i], out[j]] = [out[j], out[i]]; }
	return out.slice(0, n).map(ws => ws.map(w => ({ meant: w, typed: w.length >= 3 && rand() < 0.15 ? slip(w) : w })));
}
function run(set, corrector) {
	let slipped = 0, fixed = 0, clean = 0, broken = 0, right = 0, total = 0, realWord = 0, realFixed = 0, suggested = 0;
	const t0 = performance.now();
	for (const sent of set) {
		let h2 = BOS, h1 = BOS;
		for (const { meant, typed } of sent) {
			const out = corrector.correct(h2, h1, typed);
			total++;
			if (out === meant) right++;
			if (typed !== meant) {
				slipped++;
				if (out === meant) fixed++;
				if (corrector.candidates(h2, h1, typed, 3).some(c => c.word === meant)) suggested++;
				if (ids.has(typed)) { realWord++; if (out === meant) realFixed++; }
			} else {
				clean++;
				if (out !== meant) broken++;
			}
			h2 = h1;
			h1 = ids.get(out) ?? UNK;
		}
	}
	return { words: total, slipped: slipped / total, fixed: fixed / slipped, suggestedTop3: suggested / slipped, broken: broken / clean, wordAccBefore: 1 - slipped / total, wordAcc: right / total, realWordSlips: realWord / slipped, realWordFixed: realFixed / Math.max(1, realWord), msPerWord: (performance.now() - t0) / total };
}
const result = { sets: {} };
for (const f of args) {
	const set = sentences(f);
	const name = f.replace(/^.*\//, '').replace(/\.txt$/, '');
	result.sets[name] = { context: run(set, ours), frequency: run(set, plain) };
	console.error(name, JSON.stringify(result.sets[name]));
}
writeFileSync(outPath, JSON.stringify(result, null, '\t'));
