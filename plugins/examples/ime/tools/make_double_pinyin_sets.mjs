#!/usr/bin/env node
// Double pinyin test sets from the pinyin ones: each syllable typed as the scheme's two keys.
//
//   make_double_pinyin_sets.mjs <scheme> <in.jsonl> <out.jsonl>
import { readFileSync, writeFileSync } from 'node:fs';
import { doublePinyin } from '../engine/dist/engine/src/index.js';

const [scheme, inPath, outPath] = process.argv.slice(2);
const sp = doublePinyin(scheme);
let skipped = 0;
const out = [];
for (const line of readFileSync(inPath, 'utf8').split('\n')) {
	if (!line) continue;
	const item = JSON.parse(line);
	const codes = item.pinyin.split(' ').map(s => sp.code(s));
	if (codes.some(c => !c)) { skipped++; continue; }
	out.push(JSON.stringify({ ...item, id: `${item.id}-${scheme}`, input: codes.join('') }));
}
writeFileSync(outPath, out.join('\n') + '\n');
console.error(`${scheme}: ${out.length} items, ${skipped} without a code`);
