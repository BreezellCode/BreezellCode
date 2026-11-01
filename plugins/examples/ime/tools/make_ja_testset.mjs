#!/usr/bin/env node
// Japanese test sets: clauses (4 to 30 characters of kanji and kana) with the kana people type for
// them and that kana as romaji.
//
//   make_ja_testset.mjs ita <out.jsonl> <ITA *_ruby_utf8.txt...>
//       the ITA corpus (public domain): readings from its furigana, 漢字(かんじ)
//   make_ja_testset.mjs annotate <out.jsonl> <domain> <n> <jaseg> <dictionary_oss> <romanji-hiragana.tsv> <test files...>
//       held-out text, read by tools/ja/jaseg annotate (Mozc's dictionary), a random <n> clauses
//
// Romaji: the shortest spelling in Mozc's romanji-hiragana.tsv, っ as the doubled consonant, ん as nn;
// every input is checked to type back to its kana.
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { RomajiComposer, RomajiTable, toRomaji } from '../engine/dist/engine/src/index.js';

const [mode, outPath, ...rest] = process.argv.slice(2);
const SPLIT = /[、。！？!?「」『』（）…・，．,.\s　"“”‘’〜~：:；;]+/;
const OK = /^[ぁ-ゖァ-ヺー一-鿿々]{4,30}$/;
const kataToHira = s => s.replace(/[ァ-ヶ]/g, c => String.fromCharCode(c.charCodeAt(0) - 0x60));
const rows = [];

if (mode === 'ita') {
	const reverse = new RomajiTable(readFileSync(`${process.env.HOME}/.cache/breezell-ime-data/model-ja/romanji-hiragana.tsv`, 'utf8'));
	for (const path of rest) {
		for (const line of readFileSync(path, 'utf8').split('\n')) {
			const m = /^([A-Z0-9_]+):([^,]*),/.exec(line);
			if (!m) continue;
			// Pieces between punctuation, each "base(reading)" pair resolved.
			for (const piece of m[2].split(SPLIT)) {
				const text = piece.replace(/\(([^)]*)\)/g, '');
				const kana = kataToHira(piece.replace(/([一-鿿々ヶヵ]+)\(([^)]*)\)/g, '$2'));
				if (!OK.test(text) || !/^[ぁ-ゖー]+$/.test(kana)) continue;
				rows.push({ id: `ita-${rows.length}`, domain: 'ita', text, kana, input: toRomaji(kana, reverse) });
			}
		}
	}
} else if (mode === 'annotate') {
	const [domain, n, jaseg, dict, tablePath, ...files] = rest;
	const reverse = new RomajiTable(readFileSync(tablePath, 'utf8'));
	const clauses = [];
	const seen = new Set();
	for (const path of files) {
		for (const line of readFileSync(path, 'utf8').split('\n')) {
			for (const c of line.split('\t')[0].split(SPLIT)) {
				if (OK.test(c) && !seen.has(c)) { seen.add(c); clauses.push(c); }
			}
		}
	}
	// A fixed shuffle (mulberry32), then the first n that read cleanly.
	let seed = 7;
	const rand = () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
	for (let i = clauses.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [clauses[i], clauses[j]] = [clauses[j], clauses[i]]; }
	const pick = clauses.slice(0, Number(n) * 2);
	const out = execFileSync(jaseg, ['annotate', dict], { input: pick.join('\n') + '\n', maxBuffer: 1 << 28 }).toString('utf8');
	const blocks = out.split('\n\n');
	pick.forEach((text, i) => {
		if (rows.length >= Number(n)) return;
		const words = (blocks[i] ?? '').split('\n').filter(Boolean).map(l => l.split('\t'));
		if (!words.length || words.some(w => w[2])) return;  // a word the dictionary lacks
		const kana = kataToHira(words.map(w => w[1]).join(''));
		if (!/^[ぁ-ゖー]+$/.test(kana) || words.map(w => w[0]).join('') !== text) return;
		rows.push({ id: `${domain}-${rows.length}`, domain, text, kana, input: toRomaji(kana, reverse) });
	});
}
// Every input must type back to its kana (the romaji is right for the table).
const check = new RomajiTable(readFileSync(`${process.env.HOME}/.cache/breezell-ime-data/model-ja/romanji-hiragana.tsv`, 'utf8'));
const bad = rows.filter(r => { const c = new RomajiComposer(check); c.type(r.input); return c.flush() !== r.kana; });
if (bad.length) console.error(`${bad.length} inputs do not type back, e.g. ${bad.slice(0, 3).map(r => r.kana + ' ' + r.input).join(' | ')}`);
writeFileSync(outPath, rows.filter(r => !bad.includes(r)).map(r => JSON.stringify(r)).join('\n') + '\n');
console.error(`${outPath}: ${rows.length} clauses`);
