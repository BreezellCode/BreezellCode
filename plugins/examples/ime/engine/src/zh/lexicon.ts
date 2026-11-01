/**
 * The Chinese lexicon (.bzlx, tools/build_zh_lexicon.mjs): entries sorted by their syllable ids,
 * each with its text, language model tokens and weight. Looking words up walks the sorted keys
 * as a trie: at each depth a binary search narrows the range to the entries whose next syllable
 * is one the input allows.
 */
import { EdgeKind, SyllableEdge } from './pinyin.js';

export interface ZhLexicon {
	readonly size: number;
	text(entry: number): string;
	tokens(entry: number): Uint32Array;
	weight(entry: number): number;
	/** How much rarer the entry's reading is than its word's most used one, ln (和: he 0, hu -5). */
	readingLogp(entry: number): number;
	syllableCount(entry: number): number;
	syllables(entry: number): Uint16Array;
	/** Every entry spelled by a path of edges starting at `start` (see WordArc). */
	lookup(graph: readonly (readonly SyllableEdge[])[], start: number, limits?: LookupLimits): WordArc[];
	/** The entries whose key is exactly `key`, best weight first. */
	exact(key: readonly number[]): number[];
}

export interface WordArc {
	readonly entry: number;
	readonly start: number;
	readonly end: number;
	/** Syllables typed as an initial only (Initial edges). */
	readonly initials: number;
	/** The last syllable is still being typed (a Partial edge). */
	readonly partial: boolean;
	/** Syllables read after fixing a slip (jain as jian), and what those readings cost (ln). */
	readonly corrections?: number;
	readonly correctionCost?: number;
	/** The tones typed for its syllables: digit i in base 8 is syllable i's (0 none); 0 when no tone was typed. */
	readonly tones: number;
}

/** The tone typed for syllable `i` of an arc (0 none). */
export function arcTone(tones: number, i: number): number {
	return Math.floor(tones / Math.pow(8, i)) % 8;
}

export interface LookupLimits {
	/** Longest word in syllables. */
	readonly maxSyllables?: number;
	/** Most entries kept for one (start, end, kind of path); the best weights. */
	readonly perSpan?: number;
}

export function loadZhLexicon(bytes: Uint8Array): ZhLexicon {
	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	if (String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]) !== 'BZLX') {
		throw new Error('not a lexicon (.bzlx)');
	}
	const version = view.getUint32(4, true);
	const n = view.getUint32(8, true);
	const keyUnits = view.getUint32(12, true);
	const textUnits = view.getUint32(16, true);
	const tokenUnits = view.getUint32(20, true);
	const buffer = bytes.byteOffset % 4 === 0 ? bytes.buffer : bytes.slice().buffer;
	let at = (bytes.byteOffset % 4 === 0 ? bytes.byteOffset : 0) + 24;
	const u32 = (k: number) => { const a = new Uint32Array(buffer, at, k); at += 4 * k; return a; };
	const u16 = (k: number) => { const a = new Uint16Array(buffer, at, k); at += 2 * k; if (k % 2) { at += 2; } return a; };
	const keyOff = u32(n + 1);
	const key = u16(keyUnits);
	const textOff = u32(n + 1);
	const text = u16(textUnits);
	const tokOff = u32(n + 1);
	const tok = u32(tokenUnits);
	const weight = new Float32Array(buffer, at, n);
	at += 4 * n;
	const reading = version >= 2 ? new Float32Array(buffer, at, n) : undefined;
	const decoder = new TextDecoder('utf-16le');
	const textCache = new Map<number, string>();

	const keyLen = (e: number) => keyOff[e + 1] - keyOff[e];
	/** Syllable `depth` of entry e, 0 when its key is shorter. */
	const keyAt = (e: number, depth: number) => depth < keyLen(e) ? key[keyOff[e] + depth] : 0;
	/** First entry in [lo, hi) whose syllable at `depth` is >= x (the range shares the shorter prefix). */
	const lowerAt = (lo: number, hi: number, depth: number, x: number) => {
		while (lo < hi) {
			const mid = (lo + hi) >>> 1;
			if (keyAt(mid, depth) < x) {
				lo = mid + 1;
			} else {
				hi = mid;
			}
		}
		return lo;
	};

	const lex: ZhLexicon = {
		size: n,
		text(e) {
			let s = textCache.get(e);
			if (s === undefined) {
				s = decoder.decode(text.subarray(textOff[e], textOff[e + 1]));
				if (textCache.size > 200_000) {
					textCache.clear();
				}
				textCache.set(e, s);
			}
			return s;
		},
		tokens: e => tok.subarray(tokOff[e], tokOff[e + 1]),
		weight: e => weight[e],
		readingLogp: e => reading ? reading[e] : 0,
		syllableCount: keyLen,
		syllables: e => key.subarray(keyOff[e], keyOff[e + 1]),
		exact(k) {
			let lo = 0, hi = n;
			for (let d = 0; d < k.length; d++) {
				lo = lowerAt(lo, hi, d, k[d]);
				hi = lowerAt(lo, hi, d, k[d] + 1);
				if (lo >= hi) {
					return [];
				}
			}
			const out: number[] = [];
			for (let e = lo; e < hi && keyLen(e) === k.length; e++) {
				out.push(e);
			}
			return out;
		},
		lookup(graph, start, limits = {}) {
			const maxSyl = limits.maxSyllables ?? 12;
			const perSpan = limits.perSpan ?? 64;
			const arcs: WordArc[] = [];
			const walk = (depth: number, lo: number, hi: number, pos: number, initials: number, partial: boolean, tones: number, corrections: number, cost: number) => {
				if (depth > 0) {
					// Entries ending here are the first of the range (a shorter key sorts first).
					let count = 0;
					const multi = depth > 1;
					for (let e = lo; e < hi && keyLen(e) === depth; e++) {
						// A word made of initials only must have two syllables or more ("bj" 北京, not "b" 不);
						// a single syllable may be cut short only at the end of the input.
						if (!multi && initials > 0) {
							break;
						}
						if (count++ >= perSpan) {
							break;
						}
						arcs.push({ entry: e, start, end: pos, initials, partial, tones, corrections, correctionCost: cost });
					}
				}
				if (depth >= maxSyl || partial) {
					return;
				}
				for (const edge of graph[pos] ?? []) {
					const a = lowerAt(lo, hi, depth, edge.lo);
					const b = lowerAt(a, hi, depth, edge.hi + 1);
					if (a >= b) {
						continue;
					}
					const nextInitials = initials + (edge.kind === EdgeKind.Initial ? 1 : 0);
					// Only the initial typed for every syllable so far: no more than four of them.
					if (nextInitials > 4) {
						continue;
					}
					const nextPartial = edge.kind === EdgeKind.Partial;
					const nextTones = edge.tone ? tones + edge.tone * Math.pow(8, depth) : tones;
					const nextCorrections = corrections + (edge.corrected ? 1 : 0);
					const nextCost = cost + (edge.corrected ? edge.cost ?? 4.5 : 0);
					// One slip fixed per word: more is no longer what was typed.
					if (nextCorrections > 1) {
						continue;
					}
					if (edge.lo === edge.hi) {
						walk(depth + 1, a, b, edge.end, nextInitials, nextPartial, nextTones, nextCorrections, nextCost);
						continue;
					}
					// A range of syllables: one group per syllable (the deeper keys are sorted within each).
					for (let g = a; g < b;) {
						const s = keyAt(g, depth);
						const gEnd = lowerAt(g, b, depth, s + 1);
						walk(depth + 1, g, gEnd, edge.end, nextInitials, nextPartial, nextTones, nextCorrections, nextCost);
						g = gEnd;
					}
				}
			};
			walk(0, 0, n, start, 0, false, 0, 0, 0);
			return arcs;
		},
	};
	return lex;
}

/**
 * Several lexicons as one (the base and packs: Taiwan words, a domain's terms): entry ids run
 * through them in order.
 */
export function combineLexicons(parts: readonly ZhLexicon[]): ZhLexicon {
	if (parts.length === 1) {
		return parts[0];
	}
	const offsets: number[] = [];
	let size = 0;
	for (const p of parts) {
		offsets.push(size);
		size += p.size;
	}
	const part = (e: number) => {
		let i = parts.length - 1;
		while (offsets[i] > e) {
			i--;
		}
		return i;
	};
	return {
		size,
		text: e => { const i = part(e); return parts[i].text(e - offsets[i]); },
		tokens: e => { const i = part(e); return parts[i].tokens(e - offsets[i]); },
		weight: e => { const i = part(e); return parts[i].weight(e - offsets[i]); },
		readingLogp: e => { const i = part(e); return parts[i].readingLogp(e - offsets[i]); },
		syllableCount: e => { const i = part(e); return parts[i].syllableCount(e - offsets[i]); },
		syllables: e => { const i = part(e); return parts[i].syllables(e - offsets[i]); },
		lookup(graph, start, limits) {
			const arcs: WordArc[] = [];
			parts.forEach((p, i) => {
				for (const a of p.lookup(graph, start, limits)) {
					arcs.push(offsets[i] ? { ...a, entry: a.entry + offsets[i] } : a);
				}
			});
			return arcs;
		},
		exact: key => parts.flatMap((p, i) => p.exact(key).map(e => e + offsets[i])),
	};
}
