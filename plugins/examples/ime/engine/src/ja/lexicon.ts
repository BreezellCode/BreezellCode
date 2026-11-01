/**
 * The Japanese lexicon (.bzja, tools/build_ja_lexicon.mjs): Mozc's dictionary sorted by reading,
 * with each entry's surface, part-of-speech ids (left, right), cost and language model token, and
 * the connection costs between parts of speech. Readings are looked up from a position of the
 * input: a binary search per character narrows the range to the entries the input starts with.
 */
export interface JaLexicon {
	readonly size: number;
	readonly dim: number;
	reading(e: number): string;
	surface(e: number): string;
	lid(e: number): number;
	rid(e: number): number;
	cost(e: number): number;
	token(e: number): number;
	/** Cost from a word with right id `rid` to one with left id `lid`. */
	connection(rid: number, lid: number): number;
	/** Entries whose reading is kana[start, end) for every end, the cheapest `perSpan` of each. */
	lookup(kana: string, start: number, perSpan: number, maxLen?: number): { entry: number; end: number }[];
}

export function loadJaLexicon(bytes: Uint8Array): JaLexicon {
	if (String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]) !== 'BZJA') {
		throw new Error('not a Japanese lexicon (.bzja)');
	}
	const buffer = bytes.byteOffset % 4 === 0 ? bytes.buffer : bytes.slice().buffer;
	const base = bytes.byteOffset % 4 === 0 ? bytes.byteOffset : 0;
	const view = new DataView(buffer, base);
	const n = view.getUint32(8, true);
	const readUnits = view.getUint32(12, true);
	const surfUnits = view.getUint32(16, true);
	const dim = view.getUint32(20, true);
	const pad4 = (x: number) => (x + 3) & ~3;
	let at = base + 24;
	const readOff = new Uint32Array(buffer, at, n + 1); at += 4 * (n + 1);
	const read = new Uint16Array(buffer, at, readUnits); at += pad4(2 * readUnits);
	const surfOff = new Uint32Array(buffer, at, n + 1); at += 4 * (n + 1);
	const surf = new Uint16Array(buffer, at, surfUnits); at += pad4(2 * surfUnits);
	const lids = new Uint16Array(buffer, at, n); at += 2 * n;
	const rids = new Uint16Array(buffer, at, n); at += 2 * n; at = base + pad4(at - base);
	const costs = new Int16Array(buffer, at, n); at += pad4(2 * n);
	const tokens = new Uint32Array(buffer, at, n); at += 4 * n;
	const conn = new Int16Array(buffer, at, dim * dim);
	const utf16 = new TextDecoder('utf-16le');

	const len = (e: number) => readOff[e + 1] - readOff[e];
	const unitAt = (e: number, d: number) => d < len(e) ? read[readOff[e] + d] : 0;
	const lower = (lo: number, hi: number, d: number, x: number) => {
		while (lo < hi) {
			const mid = (lo + hi) >>> 1;
			if (unitAt(mid, d) < x) {
				lo = mid + 1;
			} else {
				hi = mid;
			}
		}
		return lo;
	};

	return {
		size: n,
		dim,
		reading: e => utf16.decode(read.subarray(readOff[e], readOff[e + 1])),
		surface: e => utf16.decode(surf.subarray(surfOff[e], surfOff[e + 1])),
		lid: e => lids[e],
		rid: e => rids[e],
		cost: e => costs[e],
		token: e => tokens[e],
		connection: (rid, lid) => conn[rid * dim + lid],
		lookup(kana, start, perSpan, maxLen = 24) {
			const out: { entry: number; end: number }[] = [];
			let lo = 0, hi = n;
			for (let d = 0; d < maxLen && start + d < kana.length; d++) {
				const c = kana.charCodeAt(start + d);
				lo = lower(lo, hi, d, c);
				hi = lower(lo, hi, d, c + 1);
				if (lo >= hi) {
					break;
				}
				// Entries whose reading ends here sort first in the range (cheapest first).
				let k = 0;
				for (let e = lo; e < hi && len(e) === d + 1 && k < perSpan; e++, k++) {
					out.push({ entry: e, end: start + d + 1 });
				}
			}
			return out;
		},
	};
}
