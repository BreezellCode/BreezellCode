#!/usr/bin/env node
// The accuracy benchmark: drives each engine through the same line protocol (engine-harness /
// rime-harness) on the same test sets, and writes the numbers as JSON.
//
//   run.mjs --out result.json --engine "name=command args..." [--engine ...] sets/*.jsonl
//
// For every item ({text, pinyin}) the input is the pinyin without spaces, as people type it.
//   top1        the first candidate is the whole text
//   top3 / top5 the whole text is among the first 3 / 5 candidates
//   charAcc     characters of the first candidate that match the text (edit distance), when the
//               first candidate is a whole sentence
//   picks       picking candidates the way a user would: each time the longest candidate on the
//               page that starts what is left of the text; how many picks until it is all
//               committed (1 = the first sentence was right or one pick did it)
//   selectKeys  keys spent on picking: 1 for a candidate on the first page of 9, 2 on the next…
//   failed      no candidate on the first 30 continues the text
//   ms          time per conversion (type the whole input)
import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline';

const args = process.argv.slice(2);
const engines = [];
const sets = [];
let out = 'result.json';
let schema = 'rime_ice';
let fold;
for (let i = 0; i < args.length; i++) {
	if (args[i] === '--engine') {
		const spec = args[++i];
		const eq = spec.indexOf('=');
		engines.push({ name: spec.slice(0, eq), command: spec.slice(eq + 1) });
	} else if (args[i] === '--out') {
		out = args[++i];
	} else if (args[i] === '--schema') {
		schema = args[++i];
	} else if (args[i] === '--fold') {
		// A Traditional → Simplified table (zh-t2s.txt): also score ignoring the script.
		const { ScriptConverter } = await import('../engine/dist/engine/src/index.js');
		fold = new ScriptConverter(readFileSync(args[++i], 'utf8'));
	} else {
		sets.push(args[i]);
	}
}
// Which field holds the keys to type: input (zhuyin with tones), inputToneless, or the pinyin.
const inputField = process.env.BENCH_INPUT ?? 'input';

const PAGE = 9;

class Harness {
	constructor(command) {
		this.proc = spawn('bash', ['-c', command], { stdio: ['pipe', 'pipe', 'inherit'] });
		this.lines = createInterface({ input: this.proc.stdout });
		this.waiting = [];
		this.lines.on('line', line => this.waiting.shift()?.(JSON.parse(line)));
	}
	send(cmd) {
		return new Promise(resolve => { this.waiting.push(resolve); this.proc.stdin.write(cmd + '\n'); });
	}
	close() { this.proc.stdin.end(); }
}

function editDistance(a, b) {
	const x = [...a], y = [...b];
	let prev = Array.from({ length: y.length + 1 }, (_, i) => i);
	for (let i = 1; i <= x.length; i++) {
		const cur = [i];
		for (let j = 1; j <= y.length; j++) {
			cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (x[i - 1] === y[j - 1] ? 0 : 1));
		}
		prev = cur;
	}
	return prev[y.length];
}

const useContext = process.env.BENCH_CONTEXT === '1';

async function evaluate(h, item, rime) {
	let input = item[inputField] ?? item.pinyin.replace(/ /g, '');
	if (rime) {
		input = input.replace(/ /g, '{space}');  // Rime's key sequence syntax
	}
	if (useContext) {
		await h.send(`X ${(item.context ?? '').replace(/\n/g, '\\n')}`);
	}
	const t0 = performance.now();
	let s = await h.send(`K ${input}`);
	const ms = performance.now() - t0;
	const text = item.text;
	const first = s.cands[0] ?? '';
	const r = {
		top1: first === text,
		top3: s.cands.slice(0, 3).includes(text),
		top5: s.cands.slice(0, 5).includes(text),
		charAcc: [...first].length >= [...text].length - 2 ? Math.max(0, 1 - editDistance(first, text) / [...text].length) : null,
		ms,
		first,
	};
	if (fold) {
		const goal = item.simp ?? fold.convert(text);
		const f = fold.convert(first);
		r.top1Fold = f === goal;
		r.charAccFold = [...f].length >= [...goal].length - 2 ? Math.max(0, 1 - editDistance(f, goal) / [...goal].length) : null;
	}
	// Pick pieces until the text is committed.
	let committed = '', picks = 0, keys = 0, failed = false;
	for (let guard = 0; guard < 40; guard++) {
		if (s.commit) {
			committed += s.commit;
		}
		if (committed.length >= text.length) {
			break;
		}
		const left = text.slice(committed.length + (s.preedit && !s.commit ? 0 : 0));
		// The preedit shows picked text first; what is left to match starts after it.
		const pickedSoFar = pickedPrefix(s.preedit, text.slice(committed.length));
		const rest = text.slice(committed.length + pickedSoFar.length);
		if (!rest && !s.commit && rime) {
			// All of it picked, nothing committed: an editor that waits for Enter (Rime's
			// fluency_editor in bopomofo). Enter is the key a user presses there.
			s = await h.send('A {Return}');
			keys++;
			continue;
		}
		let best = -1, bestLen = 0;
		s.cands.forEach((c, i) => {
			if (c && rest.startsWith(c) && c.length > bestLen) { best = i; bestLen = c.length; }
		});
		if (best < 0 || !rest) {
			failed = true;
			r.failInfo = { rest, preedit: s.preedit, cands: s.cands.slice(0, 12) };
			break;
		}
		picks++;
		keys += Math.floor(best / PAGE) + 1;
		s = await h.send(`P ${best}`);
		void left;
	}
	if (s.commit && committed.length < text.length) {
		committed += s.commit;
	}
	await h.send('C');
	r.picks = picks;
	r.selectKeys = keys;
	r.failed = failed || committed !== text;
	return r;
}

/** The part of the preedit that is already picked text (Chinese) rather than open pinyin. */
function pickedPrefix(preedit, expected) {
	let i = 0;
	while (i < preedit.length && i < expected.length && preedit[i] === expected[i]) {
		i++;
	}
	return expected.slice(0, i);
}

function summarize(rows) {
	const n = rows.length;
	const mean = f => rows.reduce((a, r) => a + f(r), 0) / n;
	const accRows = rows.filter(r => r.charAcc !== null);
	const ms = rows.map(r => r.ms).sort((a, b) => a - b);
	return {
		n,
		top1: mean(r => r.top1 ? 1 : 0),
		...(rows[0]?.top1Fold !== undefined ? {
			top1Fold: mean(r => r.top1Fold ? 1 : 0),
			charAccFold: rows.filter(r => r.charAccFold !== null).reduce((a, r) => a + r.charAccFold, 0) / Math.max(1, rows.filter(r => r.charAccFold !== null).length),
		} : {}),
		top3: mean(r => r.top3 ? 1 : 0),
		top5: mean(r => r.top5 ? 1 : 0),
		charAcc: accRows.reduce((a, r) => a + r.charAcc, 0) / Math.max(1, accRows.length),
		onePick: mean(r => !r.failed && r.picks <= 1 ? 1 : 0),
		picks: mean(r => r.picks),
		selectKeys: mean(r => r.selectKeys),
		failed: mean(r => r.failed ? 1 : 0),
		// The first choice in five blocks of the set, in order: a user model learning shows as a rise.
		blocks: n >= 500 ? [0, 1, 2, 3, 4].map(b => { const part = rows.slice(Math.floor(b * n / 5), Math.floor((b + 1) * n / 5)); return part.filter(r => r.top1).length / part.length; }) : undefined,
		msP50: ms[Math.floor(n * 0.5)],
		msP99: ms[Math.min(n - 1, Math.floor(n * 0.99))],
	};
}

const result = { date: new Date().toISOString(), sets: {}, examples: {} };
for (const engine of engines) {
	const h = new Harness(engine.command);
	await h.send(`S ${schema}`);
	const rime = engine.command.includes('rime');
	for (const set of sets) {
		const items = readFileSync(set, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l));
		const rows = [];
		for (const item of items) {
			rows.push({ ...(await evaluate(h, item, rime)), id: item.id, text: item.text });
		}
		const name = set.replace(/^.*\//, '').replace(/\.jsonl$/, '');
		(result.sets[name] ??= {})[engine.name] = summarize(rows);
		(result.examples[name] ??= {})[engine.name] = {
			wrong: rows.filter(r => !r.top1).slice(0, 40).map(r => ({ id: r.id, text: r.text, first: r.first })),
			failed: rows.filter(r => r.failInfo).slice(0, 30).map(r => ({ id: r.id, text: r.text, ...r.failInfo })),
		};
		console.error(`${engine.name} ${name}: ${JSON.stringify(result.sets[name][engine.name])}`);
	}
	h.proc.stdin.write('Q\n');
	h.close();
	await new Promise(resolve => h.proc.on('exit', resolve));
}
writeFileSync(out, JSON.stringify(result, null, '\t'));
