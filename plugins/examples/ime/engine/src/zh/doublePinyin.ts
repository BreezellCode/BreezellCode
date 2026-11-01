/**
 * Double pinyin (雙拼): every syllable is two keys, an initial key and a final key. The schemes are
 * rime-ice's (doublePinyinSchemes.ts), spelled by running their speller algebra on every syllable
 * the way librime does, so a code means here what it means in Rime.
 *
 * Rime's algebra, as far as these schemes use it: xform/a/b/ rewrites a spelling (regex, all
 * matches), derive/a/b/ adds the rewritten one and keeps the original, erase/a/ drops a spelling
 * that matches whole, xlit/abc/xyz/ maps characters one to one; fuzz counts as derive, abbrev is
 * left out (a code is always two keys).
 */
import { DOUBLE_PINYIN_SCHEMES } from './doublePinyinSchemes.js';
import { EdgeKind, SYLLABLES, SyllableEdge } from './pinyin.js';
import { ZhSpeller } from './speller.js';

interface Rule {
	readonly op: string;
	readonly pattern: RegExp;
	readonly replacement: string;
	readonly from: string;
	readonly to: string;
}

function parseRule(rule: string): Rule | undefined {
	const op = /^[a-z]+/.exec(rule)?.[0];
	if (!op) {
		return undefined;
	}
	const sep = rule[op.length];
	const [a = '', b = ''] = rule.slice(op.length + 1).split(sep);
	if (op === 'xlit') {
		return { op, pattern: /$^/, replacement: '', from: a, to: b };
	}
	return { op, pattern: new RegExp(a, 'gu'), replacement: b, from: '', to: '' };
}

/** The spellings the algebra gives a syllable; with `derive` false only the rewritten one. */
export function spell(algebra: readonly string[], syllable: string, derive = true): string[] {
	let spellings = [syllable];
	for (const text of algebra) {
		const rule = parseRule(text);
		if (!rule) {
			continue;
		}
		const next: string[] = [];
		for (const s of spellings) {
			switch (rule.op) {
				case 'xform': {
					next.push(s.replace(rule.pattern, rule.replacement));
					break;
				}
				case 'derive':
				case 'fuzz': {
					next.push(s);
					const d = s.replace(rule.pattern, rule.replacement);
					if (derive && d !== s) {
						next.push(d);
					}
					break;
				}
				case 'erase': {
					rule.pattern.lastIndex = 0;
					const m = new RegExp(`^(?:${rule.pattern.source})$`, 'u').test(s);
					if (!m) {
						next.push(s);
					}
					break;
				}
				case 'xlit': {
					const from = [...rule.from], to = [...rule.to];
					next.push([...s].map(c => { const i = from.indexOf(c); return i >= 0 ? to[i] : c; }).join(''));
					break;
				}
				default:
					next.push(s);  // abbrev and the rest: not for two-key codes
			}
		}
		spellings = [...new Set(next)];
	}
	return spellings;
}

function runs(ids: number[]): [number, number][] {
	const sorted = [...new Set(ids)].sort((a, b) => a - b);
	const out: [number, number][] = [];
	for (const id of sorted) {
		const last = out[out.length - 1];
		if (last && last[1] === id - 1) {
			last[1] = id;
		} else {
			out.push([id, id]);
		}
	}
	return out;
}

export interface DoublePinyinSpeller extends ZhSpeller {
	/** The two keys people type for a syllable in this scheme ('' when it has none). */
	code(syllable: string): string;
}

const built = new Map<string, DoublePinyinSpeller>();

/** A double pinyin scheme: ziranma, abc, flypy, jiajia, mspy, sogou, ziguang. */
export function doublePinyin(scheme: string): DoublePinyinSpeller {
	const cached = built.get(scheme);
	if (cached) {
		return cached;
	}
	const def = DOUBLE_PINYIN_SCHEMES[scheme];
	if (!def) {
		throw new Error(`unknown double pinyin scheme ${scheme}`);
	}
	const byCode = new Map<string, [number, number][]>();
	const byFirst = new Map<string, [number, number][]>();
	const primary = new Map<string, string>();
	const codes = new Map<string, number[]>();
	SYLLABLES.forEach((s, i) => {
		const all = spell(def.algebra, s).filter(c => c.length === 2);
		for (const c of all) {
			(codes.get(c) ?? codes.set(c, []).get(c)!).push(i + 1);
		}
		const main = spell(def.algebra, s, false).find(c => c.length === 2) ?? all[0];
		if (main) {
			primary.set(s, main);
		}
	});
	const first = new Map<string, number[]>();
	for (const [c, ids] of codes) {
		byCode.set(c, runs(ids));
		(first.get(c[0]) ?? first.set(c[0], []).get(c[0])!).push(...ids);
	}
	for (const [k, ids] of first) {
		byFirst.set(k, runs(ids));
	}
	const keys = new Set([...codes.keys()].join(''));
	const speller: DoublePinyinSpeller = {
		name: `double-pinyin-${scheme}`,
		accept: typed => [...typed.toLowerCase()].filter(k => keys.has(k) || k === '\'').join(''),
		skips: key => key === '\'',
		code: s => primary.get(s) ?? '',
		graph(input: string): SyllableEdge[][] {
			const n = input.length;
			const graph: SyllableEdge[][] = Array.from({ length: n + 1 }, () => []);
			const past = (p: number) => { while (p < n && input[p] === '\'') { p++; } return p; };
			for (let i = 0; i < n; i++) {
				if (input[i] === '\'') {
					continue;
				}
				if (i + 2 <= n && input[i + 1] !== '\'') {
					for (const [lo, hi] of byCode.get(input.substr(i, 2)) ?? []) {
						graph[i].push({ start: i, end: past(i + 2), lo, hi, kind: EdgeKind.Full });
					}
				} else if (i + 1 === n) {
					// The initial key of the syllable being typed.
					for (const [lo, hi] of byFirst.get(input[i]) ?? []) {
						graph[i].push({ start: i, end: n, lo, hi, kind: EdgeKind.Partial });
					}
				}
			}
			return graph;
		},
	};
	built.set(scheme, speller);
	return speller;
}
