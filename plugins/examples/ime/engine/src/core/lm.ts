/**
 * An n-gram language model in the trainer's format (tools/lm/lmtrain.cpp, ".bzlm"): unigram,
 * bigram and trigram log probabilities (natural log) with backoff weights, read in place from
 * the file's bytes. Token ids: 0 <s>, 1 </s>, 2 <unk>, 3 <x>, then words.
 */

export const BOS = 0;
export const EOS = 1;
export const UNK = 2;
/** A run of digits or Latin letters inside a sentence (tools/lm/lmtrain.cpp segments them so). */
export const OTHER = 3;

export interface NgramModel {
	readonly vocabSize: number;
	readonly order: number;
	/** ln P(w | h2 h1); h2 / h1 are BOS at the start of a sentence. */
	logProb(h2: number, h1: number, w: number): number;
	/** ln P(w) of the unigram model. */
	unigram(w: number): number;
	/** Words in [lo, hi) the model has seen after (h2, h1) or after h1: what may come next. */
	followers(h2: number, h1: number, lo: number, hi: number): number[];
	/** The `count` likeliest words seen after h1 (and after h2 h1), likeliest first. */
	topFollowers(h2: number, h1: number, count: number): number[];
}

/** First index in [lo, hi) whose value (`at`) is >= x. */
function lowerBound(at: (i: number) => number, lo: number, hi: number, x: number): number {
	while (lo < hi) {
		const mid = (lo + hi) >>> 1;
		if (at(mid) < x) {
			lo = mid + 1;
		} else {
			hi = mid;
		}
	}
	return lo;
}

/**
 * Version 1: every word id a 4-byte integer, every log probability and backoff a 4-byte float.
 * Version 2 (tools/lm/compress.mjs): word ids of bigrams and trigrams in 3 bytes, their log
 * probabilities and backoffs as one byte each into a table of 256 values per array (quantized).
 *   header (24 bytes): "BZLM", version, V, order, n2, n3
 *   v1: uni f32[V], bow1 f32[V], off2 u32[V+1], w2 u32[n2], p2 f32[n2], bow2 f32[n2], off3 u32[n2+1], w3 u32[n3], p3 f32[n3]
 *   v2: uni f32[V], bow1 f32[V], off2 u32[V+1], w2 u24[n2], p2 (f32[256], u8[n2]), bow2 (f32[256], u8[n2]),
 *       off3 (u32 base per 32 entries [ceil((n2+1)/32)], u16 from its base [n2+1]), w3 u24[n3], p3 (f32[256], u8[n3]);
 *       every array padded to 4 bytes
 *   v3: as v2 but off3 u32[n2+1] (a model where 32 bigrams have more than 65535 trigrams)
 */
export function loadNgramModel(bytes: Uint8Array): NgramModel {
	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	const magic = String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]);
	if (magic !== 'BZLM') {
		throw new Error('not a language model (.bzlm)');
	}
	const version = view.getUint32(4, true);
	if (version < 1 || version > 3) {
		throw new Error(`language model version ${version} is not supported`);
	}
	const V = view.getUint32(8, true);
	const order = view.getUint32(12, true);
	const n2 = view.getUint32(16, true);
	const n3 = view.getUint32(20, true);
	// The arrays are 4-byte aligned after a 24-byte header: aligned when the bytes start aligned.
	const buffer = bytes.byteOffset % 4 === 0 ? bytes.buffer : bytes.slice().buffer;
	let at = (bytes.byteOffset % 4 === 0 ? bytes.byteOffset : 0) + 24;
	const pad = () => { at = (at + 3) & ~3; };
	const f32 = (n: number) => { const a = new Float32Array(buffer, at, n); at += n * 4; return a; };
	const u32 = (n: number) => { const a = new Uint32Array(buffer, at, n); at += n * 4; return a; };
	/** Word ids: 4 bytes (v1) or 3 (v2). */
	const ids = (n: number): (i: number) => number => {
		if (version === 1) {
			const a = u32(n);
			return i => a[i];
		}
		const b = new Uint8Array(buffer, at, n * 3);
		at += n * 3;
		pad();
		return i => b[3 * i] | (b[3 * i + 1] << 8) | (b[3 * i + 2] << 16);
	};
	/** Log probabilities / backoffs: floats (v1) or bytes into a table of 256 (v2). */
	const values = (n: number): (i: number) => number => {
		if (version === 1) {
			const a = f32(n);
			return i => a[i];
		}
		const table = f32(256);
		const b = new Uint8Array(buffer, at, n);
		at += n;
		pad();
		return i => table[b[i]];
	};
	const uni = f32(V);
	const bow1 = f32(V);
	const off2 = u32(V + 1);
	const w2 = ids(n2);
	const p2 = values(n2);
	const bow2 = order >= 3 ? values(n2) : () => 0;
	/** Where bigram i's trigrams start (and end: i + 1). */
	const off3: (i: number) => number = (() => {
		if (order < 3) {
			return () => 0;
		}
		if (version !== 2) {
			const a = u32(n2 + 1);
			return i => a[i];
		}
		const base = u32(Math.ceil((n2 + 1) / 32));
		const delta = new Uint16Array(buffer, at, n2 + 1);
		at += (n2 + 1) * 2;
		pad();
		return i => base[i >>> 5] + delta[i];
	})();
	const w3 = order >= 3 ? ids(n3) : () => 0;
	const p3 = order >= 3 ? values(n3) : () => 0;

	const bigramIndex = (v: number, w: number): number => {
		const lo = off2[v], hi = off2[v + 1];
		if (lo === hi) {
			return -1;
		}
		const i = lowerBound(w2, lo, hi, w);
		return i < hi && w2(i) === w ? i : -1;
	};
	const bigram = (v: number, w: number): number => {
		const i = bigramIndex(v, w);
		return i >= 0 ? p2(i) : bow1[v] + uni[w];
	};

	const topCache = new Map<number, number[]>();
	/** The `count` entries of [a, b) with the highest probs, highest first. */
	const topOf = (wordAt: (i: number) => number, probAt: (i: number) => number, a: number, b: number, count: number): number[] => {
		const idx: number[] = [];
		for (let i = a; i < b; i++) {
			idx.push(i);
		}
		idx.sort((x, y) => probAt(y) - probAt(x));
		if (idx.length > count) {
			idx.length = count;
		}
		return idx.map(i => wordAt(i));
	};

	return {
		vocabSize: V,
		order,
		unigram: w => uni[w],
		topFollowers(h2, h1, count) {
			const key = h1 * 4096 + Math.min(count, 4095);
			let bi = topCache.get(key);
			if (!bi) {
				bi = topOf(w2, p2, h1 < V ? off2[h1] : 0, h1 < V ? off2[h1 + 1] : 0, count);
				if (topCache.size > 4096) {
					topCache.clear();
				}
				topCache.set(key, bi);
			}
			if (order < 3 || h1 === BOS) {
				return bi;
			}
			const ctx = bigramIndex(h2, h1);
			if (ctx < 0 || off3(ctx) === off3(ctx + 1)) {
				return bi;
			}
			const tri = topOf(w3, p3, off3(ctx), off3(ctx + 1), count);
			const seen = new Set(tri);
			return [...tri, ...bi.filter(w => !seen.has(w))];
		},
		followers(h2, h1, lo, hi) {
			const out: number[] = [];
			const take = (word: (i: number) => number, a: number, b: number) => {
				for (let i = lowerBound(word, a, b, lo); i < b && word(i) < hi; i++) {
					out.push(word(i));
				}
			};
			if (h1 < V) {
				take(w2, off2[h1], off2[h1 + 1]);
				if (order >= 3 && h1 !== BOS) {
					const ctx = bigramIndex(h2, h1);
					if (ctx >= 0) {
						take(w3, off3(ctx), off3(ctx + 1));
					}
				}
			}
			return out;
		},
		logProb(h2, h1, w) {
			if (w >= V) {
				return uni[UNK];
			}
			if (order >= 3 && h1 !== BOS) {
				const ctx = bigramIndex(h2, h1);
				if (ctx >= 0) {
					const lo = off3(ctx), hi = off3(ctx + 1);
					if (lo < hi) {
						const i = lowerBound(w3, lo, hi, w);
						if (i < hi && w3(i) === w) {
							return p3(i);
						}
					}
					return bow2(ctx) + bigram(h1, w);
				}
			}
			return bigram(h1, w);
		},
	};
}
