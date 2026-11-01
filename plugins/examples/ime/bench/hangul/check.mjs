#!/usr/bin/env node
// Checks the 2-set composer (engine/src/ko/hangul.ts) against libhangul on the keys of real
// Korean text and on random key sequences (shifted letters, spaces, Backspace), and reports the
// sequences where they differ.
//
//   check.mjs <hangul-check binary> <keyboards dir> <Korean text file> [random count]
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { composeKeys, keysOf } from '../../engine/dist/engine/src/index.js';

const [bin, keyboards, textPath, randomCount = '20000'] = process.argv.slice(2);
const cases = [];
for (const line of readFileSync(textPath, 'utf8').split('\n').slice(0, 20000)) {
	const text = line.split('\t')[0].replace(/[^가-힣 ]/g, '').trim();
	if (text) cases.push({ kind: 'text', keys: keysOf(text), text });
}
let seed = 11;
const rand = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
const letters = 'qwertyuiopasdfghjklzxcvbnmQWERTOP';
for (let i = 0; i < Number(randomCount); i++) {
	let keys = '';
	const len = 1 + Math.floor(rand() * 24);
	for (let j = 0; j < len; j++) {
		const r = rand();
		keys += r < 0.08 ? ' ' : r < 0.16 ? '<' : letters[Math.floor(rand() * letters.length)];
	}
	cases.push({ kind: 'random', keys });
}
const ref = execFileSync(bin, [], { input: cases.map(c => c.keys).join('\n') + '\n', env: { ...process.env, HANGUL_KEYBOARD_PATH: keyboards }, maxBuffer: 1 << 28 }).toString('utf8').split('\n');
const diffs = { text: [], random: [] };
let roundTrip = 0;
cases.forEach((c, i) => {
	const ours = composeKeys(c.keys);
	if (ours !== ref[i]) diffs[c.kind].push({ keys: c.keys, ours, libhangul: ref[i] });
	if (c.kind === 'text' && ours !== c.text) roundTrip++;
});
const count = k => cases.filter(c => c.kind === k).length;
console.log(JSON.stringify({
	text: { cases: count('text'), differ: diffs.text.length, notBackToText: roundTrip },
	random: { cases: count('random'), differ: diffs.random.length },
	examples: [...diffs.text.slice(0, 5), ...diffs.random.slice(0, 10)],
}, null, 1));
