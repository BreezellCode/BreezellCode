#!/usr/bin/env node
// Word prediction benchmark (Korean 2-set, English): keystrokes a typist saves with the three
// suggestions above the keyboard. For each word of a held-out sentence, before every key (the
// first suggestion comes before any key: the next word), if the word is among the suggestions
// the typist takes it with one key (the word and its space); otherwise types on (each key, then
// a space). Keystroke saving rate KSR = 1 − keys with suggestions / keys without.
//
//   run-predict.mjs --lang ko|en --vocab <vocab> --lm <bzlm> --n 1000 --out <json> <held-out text files...>
//
// Rankers: "context" — the trigram model after the words before (ours); "frequency" — the most
// frequent words with these keys, as a plain word list does; with --rime "<harness command>"
// --schema <schema>, a Rime schema's first three candidates for the keys (no next word: Rime
// suggests nothing before a key).
import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { BOS, keysOf, loadNgramModel, PrefixPredictor, UNK } from '../engine/dist/engine/src/index.js';

const args = process.argv.slice(2);
const opt = (name, def) => { const i = args.indexOf(name); if (i < 0) return def; const v = args[i + 1]; args.splice(i, 2); return v; };
const lang = opt('--lang', 'ko');
const vocabPath = opt('--vocab');
const lmPath = opt('--lm');
const n = Number(opt('--n', '1000'));
const outPath = opt('--out', 'predict.json');
const k = Number(opt('--k', '3'));
const rimeCommand = opt('--rime');
const rimeSchema = opt('--schema', 'melt_eng');
const files = args;
let rime;
if (rimeCommand) {
	const proc = spawn('bash', ['-c', rimeCommand], { stdio: ['pipe', 'pipe', 'ignore'] });
	const lines = createInterface({ input: proc.stdout });
	const waiting = [];
	lines.on('line', l => waiting.shift()?.(JSON.parse(l)));
	rime = { proc, send: cmd => new Promise(r => { waiting.push(r); proc.stdin.write(cmd + '\n'); }) };
	await rime.send(`S ${rimeSchema}`);
}

const words = readFileSync(vocabPath, 'utf8').split('\n');
if (words[words.length - 1] === '') words.pop();
const keyOf = lang === 'ko' ? keysOf : w => w;
const typeable = lang === 'ko' ? w => /^[가-힣]+$/.test(w) : w => /^[a-z']+$/.test(w);
let first = 4, last = 4;
while (last < words.length && typeable(words[last])) last++;
const keys = words.map((w, i) => i >= first && i < last ? keyOf(w) : '');
const lm = loadNgramModel(new Uint8Array(readFileSync(lmPath)));
const predictor = new PrefixPredictor(words, keys, lm, first, last);
const idOf = new Map(words.map((w, i) => [w, i]));

function sentences(path) {
	const out = [];
	for (const line of readFileSync(path, 'utf8').split('\n')) {
		let text = line.split('\t')[0];
		if (lang === 'en') text = text.toLowerCase();
		const ws = text.split(/\s+/).map(w => w.replace(/^[^\p{L}\p{N}']+|[^\p{L}\p{N}']+$/gu, '')).filter(Boolean);
		if (ws.length >= 3 && ws.length <= 25 && ws.every(typeable)) out.push(ws);
	}
	let seed = 7;
	const rand = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
	for (let i = out.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [out[i], out[j]] = [out[j], out[i]]; }
	return out.slice(0, n);
}

async function runRime(set) {
	let full = 0, used = 0, wordsN = 0, within2 = 0;
	for (const sent of set) {
		for (const w of sent) {
			const kw = keyOf(w);
			full += kw.length + 1;
			wordsN++;
			let cost = kw.length + 1;
			for (let i = 1; i <= kw.length; i++) {
				const s = await rime.send(`K ${kw.slice(0, i)}`);
				if (s.cands.slice(0, k).some(c => c.toLowerCase() === w)) {
					cost = Math.min(cost, i + 1);
					if (i <= 2) within2++;
					break;
				}
			}
			used += cost;
		}
	}
	return { sentences: set.length, words: wordsN, ksr: 1 - used / full, keysPerWord: used / wordsN, nextWordTop3: 0, within2Keys: within2 / wordsN };
}

function run(set, contextFree) {
	let full = 0, used = 0, wordsN = 0, next3 = 0, within2 = 0, oov = 0;
	const t0 = performance.now();
	let calls = 0;
	for (const sent of set) {
		let h2 = BOS, h1 = BOS;
		for (const w of sent) {
			const kw = keyOf(w);
			full += kw.length + 1;
			wordsN++;
			let cost = kw.length + 1;
			const id = idOf.get(w) ?? UNK;
			if (id === UNK) oov++;
			for (let i = 0; i <= kw.length; i++) {
				calls++;
				const s = predictor.suggest(h2, h1, kw.slice(0, i), k, contextFree);
				if (s.some(p => p.id === id)) {
					cost = Math.min(cost, i + 1);
					if (i === 0) next3++;
					if (i <= 2) within2++;
					break;
				}
			}
			used += cost;
			h2 = h1;
			h1 = id;
		}
	}
	return {
		sentences: set.length, words: wordsN,
		ksr: 1 - used / full,
		keysPerWord: used / wordsN, keysPerWordWithout: full / wordsN,
		nextWordTop3: next3 / wordsN, within2Keys: within2 / wordsN, oov: oov / wordsN,
		msPerSuggestion: (performance.now() - t0) / calls,
	};
}

const result = { lang, k, sets: {} };
for (const f of files) {
	const set = sentences(f);
	const name = f.replace(/^.*\//, '').replace(/\.txt$/, '');
	result.sets[name] = { context: run(set, false), frequency: run(set, true), ...(rime ? { rime: await runRime(set) } : {}), none: { ksr: 0 } };
	console.error(name, JSON.stringify(result.sets[name]));
}
writeFileSync(outPath, JSON.stringify(result, null, '\t'));
if (rime) { rime.proc.stdin.write('Q\n'); rime.proc.stdin.end(); }
