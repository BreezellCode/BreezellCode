#!/usr/bin/env node
// The engine's Chinese lexicon (.bzlx) from zh-lexicon.tsv, the model's vocabulary and the
// segmentation weights.
//
//   build_zh_lexicon.mjs <zh-lexicon.tsv> <lm vocab> <zh-seg.tsv> <out.bzlx> [reference.tsv...]
//
// A pack (Taiwan words…) names the base lexicon's TSV as a reference: a word's readings in both
// are weighed against each other (垃圾: la ji in the base, le se in the pack).
//
// Format (little endian):
//   "BZLX" u32 version=2, u32 n, u32 keyUnits, u32 textUnits, u32 tokenUnits
//   u32 keyOff[n+1], u16 key[keyUnits]       syllable ids (engine/src/zh/pinyin.ts), entries sorted by key
//   u32 textOff[n+1], u16 text[textUnits]    UTF-16
//   u32 tokOff[n+1], u32 tok[tokenUnits]     language model tokens of the entry
//   f32 weight[n]                            ln of the entry's share of rime-ice's weights
//   f32 reading[n]                           ln of the entry's weight over the weight of the word's
//                                            most used reading (和: he 0, hu -5.0, huo -7.3). Over
//                                            the most used, not the sum: rime-ice gives many
//                                            characters the same weight for every reading (地 de,
//                                            di), which says nothing, and costs neither.
// An entry the model has no word for is split into model words the way the training text was.
import { readFileSync, writeFileSync } from 'node:fs';
import { SYLLABLES } from '../engine/dist/engine/src/index.js';

const [lexPath, vocabPath, segPath, outPath, ...refPaths] = process.argv.slice(2);
const UNK = 2;

const vocab = new Map();
readFileSync(vocabPath, 'utf8').split('\n').forEach((w, i) => { if (w) vocab.set(w, i); });

const segLogp = new Map();
{
	let total = 0;
	const rows = readFileSync(segPath, 'utf8').split('\n').filter(Boolean).map(l => { const [w, c] = l.split('\t'); const n = Number(c) + 1; total += n; return [w, n]; });
	for (const [w, n] of rows) segLogp.set(w, Math.log(n / total));
}

function tokensOf(word) {
	const direct = vocab.get(word);
	if (direct !== undefined) return [direct];
	const chars = [...word];
	const n = chars.length;
	const best = new Array(n + 1).fill(-Infinity);
	const back = new Array(n + 1).fill(null);
	best[0] = 0;
	for (let i = 0; i < n; i++) {
		if (best[i] === -Infinity) continue;
		let single = false;
		for (let len = 1; len <= 16 && i + len <= n; len++) {
			const w = chars.slice(i, i + len).join('');
			const lp = segLogp.get(w);
			if (lp === undefined) continue;
			if (len === 1) single = true;
			if (best[i] + lp > best[i + len]) { best[i + len] = best[i] + lp; back[i + len] = [i, vocab.get(w) ?? UNK]; }
		}
		if (!single && best[i] - 25 > best[i + 1]) { best[i + 1] = best[i] - 25; back[i + 1] = [i, UNK]; }
	}
	const out = [];
	for (let i = n; i > 0; i = back[i][0]) out.push(back[i][1]);
	return out.reverse();
}

const sylId = new Map(SYLLABLES.map((s, i) => [s, i + 1]));
const entries = [];
let totalWeight = 0;
let skipped = 0;
for (const line of readFileSync(lexPath, 'utf8').split('\n')) {
	if (!line) continue;
	const [word, code, weight] = line.split('\t');
	const key = code.split(' ').map(s => sylId.get(s) ?? 0);
	if (key.some(k => !k)) { skipped++; continue; }
	const w = Number(weight) + 1;
	totalWeight += w;
	entries.push({ word, key, w });
}
// Each word's most used reading (this file and the references).
const wordTop = new Map();
for (const e of entries) wordTop.set(e.word, Math.max(wordTop.get(e.word) ?? 0, e.w));
for (const ref of refPaths) {
	for (const line of readFileSync(ref, 'utf8').split('\n')) {
		if (!line) continue;
		const [word, , weight] = line.split('\t');
		if (wordTop.has(word)) wordTop.set(word, Math.max(wordTop.get(word), Number(weight) + 1));
	}
}
entries.sort((a, b) => {
	const n = Math.min(a.key.length, b.key.length);
	for (let i = 0; i < n; i++) if (a.key[i] !== b.key[i]) return a.key[i] - b.key[i];
	return a.key.length - b.key.length || b.w - a.w;
});

const n = entries.length;
let keyUnits = 0, textUnits = 0, tokenUnits = 0;
const toks = entries.map(e => tokensOf(e.word));
for (let i = 0; i < n; i++) { keyUnits += entries[i].key.length; textUnits += entries[i].word.length; tokenUnits += toks[i].length; }
const size = 24 + 4 * (n + 1) + 2 * keyUnits + (keyUnits % 2 ? 2 : 0) + 4 * (n + 1) + 2 * textUnits + (textUnits % 2 ? 2 : 0) + 4 * (n + 1) + 4 * tokenUnits + 8 * n;
const buf = new ArrayBuffer(size);
const view = new DataView(buf);
let at = 0;
const u32 = x => { view.setUint32(at, x, true); at += 4; };
new Uint8Array(buf, 0, 4).set([66, 90, 76, 88]); at = 4;
u32(2); u32(n); u32(keyUnits); u32(textUnits); u32(tokenUnits);
let off = 0;
for (let i = 0; i < n; i++) { u32(off); off += entries[i].key.length; } u32(off);
for (const e of entries) for (const k of e.key) { view.setUint16(at, k, true); at += 2; }
if (keyUnits % 2) at += 2;
off = 0;
for (let i = 0; i < n; i++) { u32(off); off += entries[i].word.length; } u32(off);
for (const e of entries) for (let j = 0; j < e.word.length; j++) { view.setUint16(at, e.word.charCodeAt(j), true); at += 2; }
if (textUnits % 2) at += 2;
off = 0;
for (let i = 0; i < n; i++) { u32(off); off += toks[i].length; } u32(off);
for (const t of toks) for (const x of t) u32(x);
for (const e of entries) { view.setFloat32(at, Math.log(e.w / totalWeight), true); at += 4; }
for (const e of entries) { view.setFloat32(at, Math.log(e.w / wordTop.get(e.word)), true); at += 4; }
if (at !== size) throw new Error(`size mismatch ${at} != ${size}`);
writeFileSync(outPath, new Uint8Array(buf));
const oov = toks.filter(t => t.length > 1).length;
console.error(`${n} entries (${skipped} skipped), ${oov} split into several model words, ${(size / 1e6).toFixed(1)} MB`);
