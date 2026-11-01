#!/usr/bin/env node
// The script tables the engine converts with (engine/src/zh/script.ts), from OpenCC's
// dictionaries (Apache-2.0) and Taiwan's preferred forms (zh-tw-script.tsv, tools/zh_tw_data.py).
//
//   build_zh_script.mjs <opencc data/dictionary> <zh-tw-script.tsv> <out dir>
//
// zh-s2tw.txt   stage 1: Taiwan's forms first, then STPhrases, then STCharacters (a key's values
//               merged, the preferred first); stage 2: TWVariantsPhrases, TWVariants
// zh-t2s.txt    TSPhrases, TSCharacters
import { readFileSync, writeFileSync } from 'node:fs';

const [opencc, twScript, outDir] = process.argv.slice(2);

function read(path) {
	const rows = [];
	for (const line of readFileSync(path, 'utf8').split('\n')) {
		if (!line || line.startsWith('#')) continue;
		const tab = line.indexOf('\t');
		rows.push([line.slice(0, tab), line.slice(tab + 1).split(' ').filter(Boolean)]);
	}
	return rows;
}

function merge(...tables) {
	const out = new Map();
	for (const rows of tables) {
		for (const [k, values] of rows) {
			const have = out.get(k) ?? [];
			for (const v of values) if (!have.includes(v)) have.push(v);
			out.set(k, have);
		}
	}
	return [...out].map(([k, v]) => `${k}\t${v.join(' ')}`).join('\n');
}

const s2tw = [
	merge(read(twScript), read(`${opencc}/STPhrases.txt`), read(`${opencc}/STCharacters.txt`)),
	'@stage',
	merge(read(`${opencc}/TWVariantsPhrases.txt`), read(`${opencc}/TWVariants.txt`)),
].join('\n') + '\n';
writeFileSync(`${outDir}/zh-s2tw.txt`, s2tw);
const t2s = merge(read(`${opencc}/TSPhrases.txt`), read(`${opencc}/TSCharacters.txt`)) + '\n';
writeFileSync(`${outDir}/zh-t2s.txt`, t2s);
console.error(`zh-s2tw.txt ${(s2tw.length / 1e6).toFixed(2)} M chars, zh-t2s.txt ${(t2s.length / 1e6).toFixed(2)} M chars`);
