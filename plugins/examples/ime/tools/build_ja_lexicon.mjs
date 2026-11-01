#!/usr/bin/env node
// The Japanese lexicon (.bzja) for engine/src/ja: Mozc's open dictionary (BSD-3) sorted by reading,
// each entry with its surface, part-of-speech ids, cost and language model token, then Mozc's
// connection costs between parts of speech.
//
//   build_ja_lexicon.mjs <dictionary_oss dir> <ja.vocab> <out.bzja>
//
// Format (little endian):
//   "BZJA" u32 version=1, u32 n, u32 readUnits, u32 surfUnits, u32 dim
//   u32 readOff[n+1], u16 read[readUnits] (padded to 4)    hiragana readings, sorted (UTF-16 order)
//   u32 surfOff[n+1], u16 surf[surfUnits] (padded to 4)
//   u16 lid[n], u16 rid[n] (padded to 4), i16 cost[n] (padded to 4), u32 token[n]
//   i16 conn[dim * dim] (padded to 4)                       cost from a word's rid to the next one's lid
import { readFileSync, writeFileSync } from 'node:fs';

const [dir, vocabPath, outPath] = process.argv.slice(2);
const vocab = new Map();
readFileSync(vocabPath, 'utf8').split('\n').forEach((w, i) => { if (w) vocab.set(w, i); });
const entries = [];
for (let k = 0; k < 10; k++) {
	for (const line of readFileSync(`${dir}/dictionary0${k}.txt`, 'utf8').split('\n')) {
		const p = line.split('\t');
		if (p.length < 5) continue;
		const [reading, lid, rid, cost, surface] = p;
		// Digits and letters are typed as they are, not converted to (に → 2, えー → A).
		if (!/[\u3041-\u3096\u30a1-\u30fa\u30fc\u3400-\u9fff\u3005\u3006\u30f6]/.test(surface)) continue;
		entries.push({ reading, surface, lid: +lid, rid: +rid, cost: Math.min(32767, +cost), token: vocab.get(`${surface}\t${reading}`) ?? 2 });
	}
}
entries.sort((a, b) => (a.reading < b.reading ? -1 : a.reading > b.reading ? 1 : 0) || a.cost - b.cost);
const connText = readFileSync(`${dir}/connection_single_column.txt`, 'utf8').split('\n');
const dim = Number(connText[0]);
const n = entries.length;
let readUnits = 0, surfUnits = 0;
for (const e of entries) { readUnits += e.reading.length; surfUnits += e.surface.length; }
const pad4 = x => (x + 3) & ~3;
const size = 24 + 4 * (n + 1) + pad4(2 * readUnits) + 4 * (n + 1) + pad4(2 * surfUnits) + pad4(4 * n) + pad4(2 * n) + 4 * n + pad4(2 * dim * dim);
const buf = new ArrayBuffer(size);
const view = new DataView(buf);
let at = 0;
const u32 = x => { view.setUint32(at, x, true); at += 4; };
new Uint8Array(buf, 0, 4).set([66, 90, 74, 65]); at = 4;
u32(1); u32(n); u32(readUnits); u32(surfUnits); u32(dim);
let off = 0;
for (const e of entries) { u32(off); off += e.reading.length; } u32(off);
for (const e of entries) for (let j = 0; j < e.reading.length; j++) { view.setUint16(at, e.reading.charCodeAt(j), true); at += 2; }
at = pad4(at);
off = 0;
for (const e of entries) { u32(off); off += e.surface.length; } u32(off);
for (const e of entries) for (let j = 0; j < e.surface.length; j++) { view.setUint16(at, e.surface.charCodeAt(j), true); at += 2; }
at = pad4(at);
for (const e of entries) { view.setUint16(at, e.lid, true); at += 2; }
for (const e of entries) { view.setUint16(at, e.rid, true); at += 2; }
at = pad4(at);
for (const e of entries) { view.setInt16(at, e.cost, true); at += 2; }
at = pad4(at);
for (const e of entries) u32(e.token);
for (let i = 0; i < dim * dim; i++) { view.setInt16(at, Math.max(-32768, Math.min(32767, Number(connText[i + 1]))), true); at += 2; }
at = pad4(at);
if (at !== size) throw new Error(`size mismatch ${at} != ${size}`);
writeFileSync(outPath, new Uint8Array(buf));
const unk = entries.filter(e => e.token === 2).length;
console.error(`${n} entries (${unk} without a model token), connection ${dim}x${dim}, ${(size / 1e6).toFixed(1)} MB`);
