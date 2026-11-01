/**
 * A code table (.bztb, tools/build_table.mjs): rows sorted by code, each with its text, language
 * model tokens and weight. Wubi, Cangjie, Zhengma and the like are all looked up the same way:
 * the rows of a code are a contiguous range, so are the rows of every code a prefix starts.
 */
export interface CodeTable {
	readonly size: number;
	code(row: number): string;
	codeLength(row: number): number;
	text(row: number): string;
	tokens(row: number): Uint32Array;
	/** ln of the row's weight over the top weight of its code (0 for the first). */
	weight(row: number): number;
	/** Rows whose code is `code`: [lo, hi), in the table's order. */
	exact(code: string): [number, number];
	/** Rows whose code starts with `prefix`, the exact ones first. */
	prefix(prefix: string): [number, number];
	/** The codes of a text, shortest first (reverse lookup: what to type for it). */
	codesOf(text: string): string[];
}

export function loadCodeTable(bytes: Uint8Array): CodeTable {
	if (String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]) !== 'BZTB') {
		throw new Error('not a code table (.bztb)');
	}
	const buffer = bytes.byteOffset % 4 === 0 ? bytes.buffer : bytes.slice().buffer;
	const base = bytes.byteOffset % 4 === 0 ? bytes.byteOffset : 0;
	const view = new DataView(buffer, base);
	const n = view.getUint32(8, true);
	const codeUnits = view.getUint32(12, true);
	const textUnits = view.getUint32(16, true);
	const tokenUnits = view.getUint32(20, true);
	const pad4 = (x: number) => (x + 3) & ~3;
	let at = base + 24;
	const codeOff = new Uint32Array(buffer, at, n + 1); at += 4 * (n + 1);
	const codeBytes = new Uint8Array(buffer, at, codeUnits); at += pad4(codeUnits);
	const textOff = new Uint32Array(buffer, at, n + 1); at += 4 * (n + 1);
	const text = new Uint16Array(buffer, at, textUnits); at += pad4(2 * textUnits);
	const tokOff = new Uint32Array(buffer, at, n + 1); at += 4 * (n + 1);
	const tok = new Uint32Array(buffer, at, tokenUnits); at += 4 * tokenUnits;
	const weight = new Float32Array(buffer, at, n);
	const utf16 = new TextDecoder('utf-16le');

	/** Compares row r's code with `key` (as bytes): <0, 0, >0. With `prefix`, a longer code that starts with key is equal. */
	const compare = (r: number, key: string, prefix: boolean) => {
		const a = codeOff[r], len = codeOff[r + 1] - a;
		for (let i = 0; i < key.length; i++) {
			if (i >= len) {
				return -1;
			}
			const d = codeBytes[a + i] - key.charCodeAt(i);
			if (d) {
				return d;
			}
		}
		return prefix || len === key.length ? 0 : 1;
	};
	const lower = (key: string, prefix: boolean) => {
		let lo = 0, hi = n;
		while (lo < hi) {
			const mid = (lo + hi) >>> 1;
			if (compare(mid, key, prefix) < 0) {
				lo = mid + 1;
			} else {
				hi = mid;
			}
		}
		return lo;
	};
	const upper = (key: string, prefix: boolean) => {
		let lo = 0, hi = n;
		while (lo < hi) {
			const mid = (lo + hi) >>> 1;
			if (compare(mid, key, prefix) <= 0) {
				lo = mid + 1;
			} else {
				hi = mid;
			}
		}
		return lo;
	};
	let reverse: Map<string, string[]> | undefined;

	const table: CodeTable = {
		size: n,
		code: r => String.fromCharCode(...codeBytes.subarray(codeOff[r], codeOff[r + 1])),
		codeLength: r => codeOff[r + 1] - codeOff[r],
		text: r => utf16.decode(text.subarray(textOff[r], textOff[r + 1])),
		tokens: r => tok.subarray(tokOff[r], tokOff[r + 1]),
		weight: r => weight[r],
		exact: code => [lower(code, false), upper(code, false)],
		prefix: p => [lower(p, true), upper(p, true)],
		codesOf(t) {
			if (!reverse) {
				reverse = new Map();
				for (let r = 0; r < n; r++) {
					const k = table.text(r);
					(reverse.get(k) ?? reverse.set(k, []).get(k)!).push(table.code(r));
				}
				for (const codes of reverse.values()) {
					codes.sort((a, b) => a.length - b.length || (a < b ? -1 : 1));
				}
			}
			return reverse.get(t) ?? [];
		},
	};
	return table;
}
