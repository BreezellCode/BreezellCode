// A word's language model tokens: the model's own word when it has one, else the split of the
// text into model words the training text was segmented with (max probability over zh-seg.tsv),
// <unk> (2) for characters it lacks.
import { readFileSync } from 'node:fs';

export const UNK = 2;

export function makeTokenizer(vocabPath, segPath) {
	const vocab = new Map();
	readFileSync(vocabPath, 'utf8').split('\n').forEach((w, i) => { if (w) vocab.set(w, i); });
	const segLogp = new Map();
	let total = 0;
	const rows = readFileSync(segPath, 'utf8').split('\n').filter(Boolean).map(l => { const [w, c] = l.split('\t'); const n = Number(c) + 1; total += n; return [w, n]; });
	for (const [w, n] of rows) segLogp.set(w, Math.log(n / total));
	return function tokensOf(word) {
		const direct = vocab.get(word);
		if (direct !== undefined) return [direct];
		const chars = [...word];
		const n = chars.length;
		const best = new Array(n + 1).fill(-Infinity);
		const back = new Array(n + 1).fill(null);
		best[0] = 0;
		for (let i = 0; i < n; i++) {
			if (best[i] === -Infinity) continue;
			let single = false;
			for (let len = 1; len <= 16 && i + len <= n; len++) {
				const w = chars.slice(i, i + len).join('');
				const lp = segLogp.get(w);
				if (lp === undefined) continue;
				if (len === 1) single = true;
				if (best[i] + lp > best[i + len]) { best[i + len] = best[i] + lp; back[i + len] = [i, vocab.get(w) ?? UNK]; }
			}
			if (!single && best[i] - 25 > best[i + 1]) { best[i + 1] = best[i] - 25; back[i + 1] = [i, UNK]; }
		}
		const out = [];
		for (let i = n; i > 0; i = back[i][0]) out.push(back[i][1]);
		return out.reverse();
	};
}
