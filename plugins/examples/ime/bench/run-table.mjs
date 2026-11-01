#!/usr/bin/env node
// The code table benchmark (Wubi…): every engine gets the same codes, word after word
// (tools/make_table_testset.mjs), and the clause is committed as a typist would: the word's code,
// then its candidate (space for the first, its digit, page keys beyond the first page) unless the
// code committed it on its own (a unique full code).
//
//   run-table.mjs --out result.json [--schema <rime schema>] --engine "name=command" ... sets/*.jsonl
//
//   first      words whose first candidate is the word (or that committed on their own)
//   sentence   clauses whose every word came first
//   keys/char  keys per character: code keys, selection keys
//   missed     words not on the first 30 candidates
import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline';

const args = process.argv.slice(2);
const engines = [];
const sets = [];
let out = 'result.json';
let schema = '';
for (let i = 0; i < args.length; i++) {
	if (args[i] === '--engine') { const s = args[++i]; const eq = s.indexOf('='); engines.push({ name: s.slice(0, eq), command: s.slice(eq + 1) }); }
	else if (args[i] === '--out') out = args[++i];
	else if (args[i] === '--schema') schema = args[++i];
	else sets.push(args[i]);
}
const PAGE = Number(process.env.BENCH_PAGE ?? 5);

class Harness {
	constructor(command) {
		this.proc = spawn('bash', ['-c', command], { stdio: ['pipe', 'pipe', 'inherit'] });
		this.lines = createInterface({ input: this.proc.stdout });
		this.waiting = [];
		this.lines.on('line', line => this.waiting.shift()?.(JSON.parse(line)));
	}
	send(cmd) { return new Promise(resolve => { this.waiting.push(resolve); this.proc.stdin.write(cmd + '\n'); }); }
}

async function evaluate(h, item) {
	let first = 0, keys = 0, missed = 0, ms = 0;
	const wrong = [];
	for (const w of item.words) {
		const t0 = performance.now();
		let s = await h.send(`K ${w.code}`);
		ms += performance.now() - t0;
		keys += w.code.length;
		if (s.commit) {
			if (s.commit === w.text) { first++; } else { wrong.push(`${w.code}:${s.commit}≠${w.text}`); missed++; }
			continue;
		}
		const at = s.cands.indexOf(w.text);
		if (at < 0) { missed++; wrong.push(`${w.code}:${s.cands[0] ?? ''}≠${w.text}`); await h.send('C'); continue; }
		if (at === 0) first++; else wrong.push(`${w.code}:${s.cands[0]}≠${w.text}@${at}`);
		keys += 1 + Math.floor(at / PAGE);
		s = await h.send(`P ${at}`);
	}
	await h.send('C');
	return { first, words: item.words.length, chars: item.text.length, keys, missed, ms, sentence: first === item.words.length, wrong };
}

const result = { date: new Date().toISOString(), page: PAGE, sets: {}, examples: {} };
for (const engine of engines) {
	const h = new Harness(engine.command);
	if (schema) await h.send(`S ${schema}`);
	for (const set of sets) {
		const items = readFileSync(set, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l));
		const rows = [];
		for (const item of items) rows.push({ id: item.id, text: item.text, ...(await evaluate(h, item)) });
		const sum = f => rows.reduce((a, r) => a + f(r), 0);
		const ms = rows.map(r => r.ms / r.words).sort((a, b) => a - b);
		const name = set.replace(/^.*\//, '').replace(/\.jsonl$/, '');
		(result.sets[name] ??= {})[engine.name] = {
			n: rows.length, words: sum(r => r.words),
			first: sum(r => r.first) / sum(r => r.words),
			sentence: sum(r => r.sentence ? 1 : 0) / rows.length,
			keysPerChar: sum(r => r.keys) / sum(r => r.chars),
			missed: sum(r => r.missed) / sum(r => r.words),
			msP50: ms[Math.floor(ms.length / 2)], msP99: ms[Math.floor(ms.length * 0.99)],
		};
		(result.examples[name] ??= {})[engine.name] = rows.filter(r => r.wrong.length).slice(0, 40).map(r => ({ id: r.id, text: r.text, wrong: r.wrong }));
		console.error(`${engine.name} ${name}: ${JSON.stringify(result.sets[name][engine.name])}`);
	}
	h.proc.stdin.write('Q\n');
	h.proc.stdin.end();
	await new Promise(resolve => h.proc.on('exit', resolve));
}
writeFileSync(out, JSON.stringify(result, null, '\t'));
