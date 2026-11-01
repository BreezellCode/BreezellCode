#!/usr/bin/env node
// The benchmark's line protocol (bench/engine-harness.ts) over Mozc, through Ubuntu's
// mozc_emacs_helper (its S-expression protocol): K types the romaji and converts with Space, the
// conversion (every segment's first candidate) is the answer; nothing is committed, so Mozc does
// not learn between items (Escape takes it back).
//
//   mozc-harness.mjs <mozc-helper.sh>
import { spawn } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { createInterface } from 'node:readline';

/**
 * Stops servers a previous run left: the helper starts mozc_server detached inside its namespace,
 * and a later client in another namespace refuses it. No real /usr/lib/mozc exists here, so a
 * process run as /usr/lib/mozc/mozc_server is one of ours.
 */
function stopOurServers() {
	for (const pid of readdirSync('/proc').filter(p => /^\d+$/.test(p))) {
		try {
			if (readFileSync(`/proc/${pid}/cmdline`, 'utf8').startsWith('/usr/lib/mozc/mozc_server')) {
				process.kill(Number(pid));
			}
		} catch { /* gone */ }
	}
}
stopOurServers();
const helper = spawn(process.argv[2], [], { stdio: ['pipe', 'pipe', 'ignore'] });
const lines = createInterface({ input: helper.stdout });
const waiting = [];
lines.on('line', l => waiting.shift()?.(l));
let id = 0;
const call = sexp => new Promise(resolve => { waiting.push(resolve); helper.stdin.write(`(${++id} ${sexp})\n`); });
await new Promise(resolve => waiting.push(resolve));  // the greeting
const created = await call('CreateSession');
const session = Number(/emacs-session-id \. (\d+)/.exec(created)?.[1] ?? 1);

function conversion(out) {
	const at = out.indexOf('(preedit .');
	if (at < 0) return '';
	let end = out.length;
	for (const mark of ['(status .', '(candidates .', '(all-candidate-words .', '(highlighted-position .']) {
		const i = out.indexOf(mark, at);
		if (i > at && i < end) end = i;
	}
	const part = out.slice(at, end);
	const values = [...part.matchAll(/\(value \. "((?:[^"\\]|\\.)*)"\)/g)].map(m => m[1].replace(/\\(.)/g, '$1'));
	return values.join('');
}

async function clear() {
	for (let i = 0; i < 4; i++) {
		const out = await call(`SendKey ${session} escape`);
		if (!out.includes('(preedit .')) break;
	}
}

const rl = createInterface({ input: process.stdin, crlfDelay: Infinity });
for await (const line of rl) {
	const arg = line.slice(2);
	let cands = [];
	switch (line[0]) {
		case 'K': {
			await clear();
			for (const ch of arg) await call(`SendKey ${session} ${ch.charCodeAt(0)}`);
			const out = await call(`SendKey ${session} space`);
			const text = conversion(out);
			if (text) cands = [text];
			break;
		}
		case 'C': await clear(); break;
		case 'Q': await call(`DeleteSession ${session}`); helper.kill(); stopOurServers(); process.exit(0);
	}
	process.stdout.write(JSON.stringify({ commit: '', preedit: '', cands }) + '\n');
}
