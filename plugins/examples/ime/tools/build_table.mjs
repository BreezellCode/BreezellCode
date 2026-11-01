#!/usr/bin/env node
// A code table (.bztb) for the table engine (engine/src/table): Wubi, Cangjie, Zhengma… from
// Rime dict.yaml files (text<TAB>code<TAB>weight rows after the "..." line).
//
//   build_table.mjs <out.bztb> <lm vocab> <zh-seg.tsv> <dict.yaml...>
//
// Rows keep the order Rime gives them: by code, then weight (high first), then file order.
// Format (little endian):
//   "BZTB" u32 version=1, u32 n, u32 codeUnits, u32 textUnits, u32 tokenUnits
//   u32 codeOff[n+1], u8 code[codeUnits] (padded to 4)   ASCII codes, sorted
//   u32 textOff[n+1], u16 text[textUnits] (padded to 4)
//   u32 tokOff[n+1], u32 tok[tokenUnits]                  language model tokens
//   f32 weight[n]                                         ln of the row's weight over its code's top
import { readFileSync, writeFileSync } from 'node:fs';
import { makeTokenizer } from './lib/tokenize.mjs';

const [outPath, vocabPath, segPath, ...dicts] = process.argv.slice(2);
const tokensOf = makeTokenizer(vocabPath, segPath);
const rows = [];
for (const path of dicts) {
	let body = false;
	for (const line of readFileSync(path, 'utf8').split('\n')) {
		if (!body) { body = line.trim() === '...'; continue; }
		if (!line || line.startsWith('#')) continue;
		const [text, code, weight] = line.split('\t');
		if (!text || !code || !/^[a-z]+$/.test(code)) continue;
		rows.push({ text, code, w: Number(weight ?? 0) || 0, order: rows.length });
	}
}
rows.sort((a, b) => (a.code < b.code ? -1 : a.code > b.code ? 1 : 0) || b.w - a.w || a.order - b.order);
// One row per (code, text): imported tables may repeat the main one.
const seen = new Set();
const entries = rows.filter(r => { const k = `${r.code}\t${r.text}`; if (seen.has(k)) return false; seen.add(k); return true; });
const top = new Map();
for (const e of entries) top.set(e.code, Math.max(top.get(e.code) ?? 0, e.w));
const n = entries.length;
const toks = entries.map(e => tokensOf(e.text));
let codeUnits = 0, textUnits = 0, tokenUnits = 0;
for (let i = 0; i < n; i++) { codeUnits += entries[i].code.length; textUnits += entries[i].text.length; tokenUnits += toks[i].length; }
const pad4 = x => (x + 3) & ~3;
const size = 24 + 4 * (n + 1) + pad4(codeUnits) + 4 * (n + 1) + pad4(2 * textUnits) + 4 * (n + 1) + 4 * tokenUnits + 4 * n;
const buf = new ArrayBuffer(size);
const view = new DataView(buf);
let at = 0;
const u32 = x => { view.setUint32(at, x, true); at += 4; };
new Uint8Array(buf, 0, 4).set([66, 90, 84, 66]); at = 4;
u32(1); u32(n); u32(codeUnits); u32(textUnits); u32(tokenUnits);
let off = 0;
for (const e of entries) { u32(off); off += e.code.length; } u32(off);
for (const e of entries) for (let j = 0; j < e.code.length; j++) view.setUint8(at++, e.code.charCodeAt(j));
at = pad4(at);
off = 0;
for (const e of entries) { u32(off); off += e.text.length; } u32(off);
for (const e of entries) for (let j = 0; j < e.text.length; j++) { view.setUint16(at, e.text.charCodeAt(j), true); at += 2; }
at = pad4(at);
off = 0;
for (let i = 0; i < n; i++) { u32(off); off += toks[i].length; } u32(off);
for (const t of toks) for (const x of t) u32(x);
for (const e of entries) { view.setFloat32(at, Math.log((e.w + 1) / (top.get(e.code) + 1)), true); at += 4; }
if (at !== size) throw new Error(`size mismatch ${at} != ${size}`);
writeFileSync(outPath, new Uint8Array(buf));
console.error(`${n} rows, ${new Set(entries.map(e => e.code)).size} codes, ${(size / 1e6).toFixed(1)} MB`);
