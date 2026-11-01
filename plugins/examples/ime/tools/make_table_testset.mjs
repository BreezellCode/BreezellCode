#!/usr/bin/env node
// Table (Wubi…) test sets from the Chinese ones: each clause split the way a typist who knows the
// table's words types it — the longest word of the table at each point (up to 4 characters) — and
// each word typed with its shortest code. The codes are the same for every engine.
//
//   make_table_testset.mjs <table.bztb> <in.jsonl> <out.jsonl> [name]
import { readFileSync, writeFileSync } from 'node:fs';
import { loadCodeTable } from '../engine/dist/engine/src/index.js';

const [tablePath, inPath, outPath, name = 'table'] = process.argv.slice(2);
const table = loadCodeTable(new Uint8Array(readFileSync(tablePath)));
const out = [];
let skipped = 0, words = 0, chars = 0;
for (const line of readFileSync(inPath, 'utf8').split('\n')) {
	if (!line) continue;
	const item = JSON.parse(line);
	const text = item.text;
	const seq = [];
	let ok = true;
	for (let i = 0; i < text.length;) {
		let done = false;
		for (let len = Math.min(4, text.length - i); len >= 1; len--) {
			const w = text.slice(i, i + len);
			const codes = table.codesOf(w);
			if (codes.length) { seq.push({ text: w, code: codes[0] }); i += len; done = true; break; }
		}
		if (!done) { ok = false; break; }
	}
	if (!ok) { skipped++; continue; }
	words += seq.length; chars += text.length;
	out.push(JSON.stringify({ id: `${item.id}-${name}`, domain: item.domain, text, words: seq }));
}
writeFileSync(outPath, out.join('\n') + '\n');
console.error(`${name}: ${out.length} items (${skipped} with a character the table lacks), ${(chars / words).toFixed(2)} characters per word, ${(seq => seq)(0)}`);
