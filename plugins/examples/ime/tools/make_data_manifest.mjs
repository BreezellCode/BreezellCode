#!/usr/bin/env node
// media/data-manifest.json: the files of each language, their sizes and SHA-256, from a folder that
// holds them. The plugin downloads <base>/<file> and checks each against this list.
//   make_data_manifest.mjs <data dir> <release tag> [out.json]
import { createHash } from 'node:crypto';
import { createReadStream, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const PACKS = {
	chinese: ['zh.bzlm', 'zh.bzlx', 'zh-tw.bzlx', 'zh-tones.tsv', 'zh-t2s.txt', 'zh-s2tw.txt', 'en-words.tsv', 'wubi86.bztb'],
	japanese: ['ja.bzlm', 'ja.bzja', 'romanji-hiragana.tsv'],
	korean: ['ko.bzlm', 'ko.vocab'],
};
const [dir, tag, out = join(dirname(fileURLToPath(import.meta.url)), '..', 'media', 'data-manifest.json')] = process.argv.slice(2);
if (!dir || !tag) {
	console.error('make_data_manifest.mjs <data dir> <release tag> [out.json]');
	process.exit(2);
}
const sha256 = file => new Promise((resolve, reject) => {
	const hash = createHash('sha256');
	createReadStream(file).on('data', d => hash.update(d)).on('end', () => resolve(hash.digest('hex'))).on('error', reject);
});
const packs = [];
for (const [id, names] of Object.entries(PACKS)) {
	const files = [];
	for (const name of names) {
		const file = join(dir, name);
		files.push({ name, size: statSync(file).size, sha256: await sha256(file) });
	}
	packs.push({ id, files });
}
writeFileSync(out, `${JSON.stringify({ version: 1, base: `https://github.com/BreezellCode/BreezellCode/releases/download/${tag}`, packs }, null, '\t')}\n`);
console.log(`${out}: ${packs.map(p => `${p.id} ${(p.files.reduce((n, f) => n + f.size, 0) / 1048576).toFixed(0)} MB`).join(', ')}`);
