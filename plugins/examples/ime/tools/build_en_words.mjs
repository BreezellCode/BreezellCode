#!/usr/bin/env node
// The English words a Chinese input method offers among its candidates (hello typed in pinyin):
// the English model's words seen 20 times or more, lowercase, two letters or more.
//   build_en_words.mjs <en.counts> <out en-words.tsv>
import { readFileSync, writeFileSync } from 'node:fs';
const [inPath, outPath] = process.argv.slice(2);
const out = [];
for (const line of readFileSync(inPath, 'utf8').split('\n')) {
	const [word, count] = line.split('\t');
	if (word && Number(count) >= 20 && /^[a-z]{2,}$/.test(word)) {
		out.push(`${word}\t${count}`);
	}
}
writeFileSync(outPath, out.join('\n') + '\n');
console.error(`${out.length} words`);
