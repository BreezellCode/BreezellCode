#!/usr/bin/env node
// Pinyin test sets with one slip per sentence, from the clean ones. The text stays the same: the
// input method should still give it.
//   swap (default): in a syllable of three or more letters two neighbouring letters are swapped
//     (jian → jain, zhong → zhogn) so that it is no longer a syllable.
//   mixed: as people slip, whatever comes out: two neighbouring keys swapped, the key next to the
//     one meant (QWERTY), a key pressed twice or a neighbouring key pressed too, a key left out
//     (not the first of a syllable). The result may be another syllable: nothing is chosen to suit
//     a corrector.
//
//   make_typo_testset.mjs <in.jsonl> <out.jsonl> [seed] [swap|mixed]
import { readFileSync, writeFileSync } from 'node:fs';
import { syllableId } from '../engine/dist/engine/src/index.js';

const [inPath, outPath, seedArg, kindArg] = process.argv.slice(2);
const mixed = kindArg === 'mixed';
const NEAR = {
	q: 'wa', w: 'qeas', e: 'wrsd', r: 'etdf', t: 'ryfg', y: 'tugh', u: 'yihj', i: 'uojk', o: 'ipkl', p: 'ol',
	a: 'qwsz', s: 'weadzx', d: 'ersfxc', f: 'rtdgcv', g: 'tyfhvb', h: 'yugjbn', j: 'uihknm', k: 'iojlm', l: 'opk',
	z: 'asx', x: 'sdzc', c: 'dfxv', v: 'fgcb', b: 'ghvn', n: 'hjbm', m: 'jkn',
};
let seed = Number(seedArg ?? 7) >>> 0 || 7;
/** xorshift32: the same sets on every run. */
const random = () => {
	seed ^= seed << 13; seed >>>= 0;
	seed ^= seed >>> 17;
	seed ^= seed << 5; seed >>>= 0;
	return seed / 0x100000000;
};

let skipped = 0;
const out = [];
for (const line of readFileSync(inPath, 'utf8').split('\n')) {
	if (!line) continue;
	const item = JSON.parse(line);
	const syllables = item.pinyin.split(' ');
	if (mixed) {
		const pick = arr => arr[Math.floor(random() * arr.length)];
		const which = syllables.map((s, i) => i).filter(i => syllables[i].length >= 2);
		if (!which.length) { skipped++; continue; }
		const i = pick(which), s = syllables[i];
		const kind = pick(['swap', 'near', 'extra', 'missing']);
		let typed = s;
		if (kind === 'swap') {
			const j = Math.floor(random() * (s.length - 1));
			typed = s.slice(0, j) + s[j + 1] + s[j] + s.slice(j + 2);
		} else if (kind === 'near') {
			const j = Math.floor(random() * s.length);
			typed = s.slice(0, j) + pick([...(NEAR[s[j]] ?? s[j])]) + s.slice(j + 1);
		} else if (kind === 'extra') {
			const j = Math.floor(random() * s.length);
			typed = s.slice(0, j + 1) + (random() < 0.5 ? s[j] : pick([...(NEAR[s[j]] ?? s[j])])) + s.slice(j + 1);
		} else {
			const j = 1 + Math.floor(random() * (s.length - 1));
			typed = s.slice(0, j) + s.slice(j + 1);
		}
		if (typed === s) { skipped++; continue; }
		const input = syllables.map((x, k) => k === i ? typed : x).join('');
		out.push(JSON.stringify({ ...item, id: `${item.id}-slip`, input, slip: `${s}→${typed}`, kind }));
		continue;
	}
	// Every (syllable, position) whose swap is not a syllable.
	const slips = [];
	syllables.forEach((s, i) => {
		if (s.length < 3) return;
		for (let j = 0; j + 1 < s.length; j++) {
			if (s[j] === s[j + 1]) continue;
			const swapped = s.slice(0, j) + s[j + 1] + s[j] + s.slice(j + 2);
			if (!syllableId(swapped)) slips.push({ i, swapped });
		}
	});
	if (!slips.length) { skipped++; continue; }
	const { i, swapped } = slips[Math.floor(random() * slips.length)];
	const typed = syllables.map((s, k) => k === i ? swapped : s).join('');
	out.push(JSON.stringify({ ...item, id: `${item.id}-slip`, input: typed, slip: `${syllables[i]}→${swapped}` }));
}
writeFileSync(outPath, out.join('\n') + '\n');
console.error(`${out.length} items, ${skipped} without a syllable to slip`);
