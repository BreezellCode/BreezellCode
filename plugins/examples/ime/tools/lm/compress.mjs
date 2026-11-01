#!/usr/bin/env node
// A language model (.bzlm version 1) to version 2: bigram and trigram word ids in 3 bytes, their
// log probabilities and backoffs one byte each into a table of 256 values per array (1-D k-means
// on a sample). See engine/src/core/lm.ts for both layouts.
//   compress.mjs <in.bzlm> <out.bzlm>
import { readFileSync, writeFileSync } from 'node:fs';

const [inPath, outPath] = process.argv.slice(2);
const bytes = readFileSync(inPath);
const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
if (bytes.toString('latin1', 0, 4) !== 'BZLM' || view.getUint32(4, true) !== 1) throw new Error('not a version 1 .bzlm');
const V = view.getUint32(8, true), order = view.getUint32(12, true), n2 = view.getUint32(16, true), n3 = view.getUint32(20, true);
const buf = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
let at = 24;
const f32 = n => { const a = new Float32Array(buf, at, n); at += n * 4; return a; };
const u32 = n => { const a = new Uint32Array(buf, at, n); at += n * 4; return a; };
const uni = f32(V), bow1 = f32(V), off2 = u32(V + 1), w2 = u32(n2), p2 = f32(n2);
const bow2 = order >= 3 ? f32(n2) : null, off3 = order >= 3 ? u32(n2 + 1) : null;
const w3 = order >= 3 ? u32(n3) : null, p3 = order >= 3 ? f32(n3) : null;
for (const a of [w2, w3]) {
	if (a && a.some(x => x >= 1 << 24)) throw new Error('a word id needs more than 3 bytes');
}

/** 256 values for `values` (k-means on a sample, from its quantiles) and each value's nearest. */
function quantize(values) {
	const step = Math.max(1, Math.floor(values.length / 2_000_000));
	const sample = new Float32Array(Math.ceil(values.length / step));
	for (let i = 0, j = 0; i < values.length; i += step) sample[j++] = values[i];
	sample.sort();
	let centers = new Float64Array(256);
	for (let k = 0; k < 256; k++) centers[k] = sample[Math.min(sample.length - 1, Math.floor((k + 0.5) / 256 * sample.length))];
	const nearest = (x, c) => {
		// c is sorted: the boundary between neighbours is their midpoint.
		let lo = 0, hi = 255;
		while (lo < hi) {
			const mid = (lo + hi) >> 1;
			if (x > (c[mid] + c[mid + 1]) / 2) lo = mid + 1; else hi = mid;
		}
		return lo;
	};
	for (let iter = 0; iter < 12; iter++) {
		const sum = new Float64Array(256), cnt = new Float64Array(256);
		for (const x of sample) { const k = nearest(x, centers); sum[k] += x; cnt[k]++; }
		const next = new Float64Array(256);
		for (let k = 0; k < 256; k++) next[k] = cnt[k] ? sum[k] / cnt[k] : centers[k];
		next.sort();
		centers = next;
	}
	const table = new Float32Array(centers);
	const codes = new Uint8Array(values.length);
	let err = 0;
	for (let i = 0; i < values.length; i++) {
		const k = nearest(values[i], centers);
		codes[i] = k;
		err = Math.max(err, Math.abs(values[i] - table[k]));
	}
	return { table, codes, err };
}

const parts = [];
let size = 0;
const put = (u8) => { parts.push(u8); size += u8.length; const p = (4 - (size % 4)) % 4; if (p) { parts.push(new Uint8Array(p)); size += p; } };
const asBytes = a => new Uint8Array(a.buffer, a.byteOffset, a.byteLength);
const u24 = a => { const b = new Uint8Array(a.length * 3); for (let i = 0; i < a.length; i++) { const x = a[i]; b[3 * i] = x & 255; b[3 * i + 1] = (x >> 8) & 255; b[3 * i + 2] = (x >> 16) & 255; } return b; };
const header = new DataView(new ArrayBuffer(24));
[...'BZLM'].forEach((c, i) => header.setUint8(i, c.charCodeAt(0)));
header.setUint32(4, 2, true); header.setUint32(8, V, true); header.setUint32(12, order, true); header.setUint32(16, n2, true); header.setUint32(20, n3, true);
put(new Uint8Array(header.buffer));
put(asBytes(uni)); put(asBytes(bow1)); put(asBytes(off2));
put(u24(w2));
for (const [name, a] of [['p2', p2], ...(bow2 ? [['bow2', bow2]] : [])]) {
	const q = quantize(a);
	console.error(`${name}: largest error ${q.err.toFixed(4)}`);
	put(asBytes(q.table)); put(q.codes);
}
if (order >= 3) {
	// off3: a base per 32 entries and each entry's distance from it (16 bits); version 3 keeps
	// 4 bytes each when 32 bigrams have more trigrams than that.
	const base = new Uint32Array(Math.ceil((n2 + 1) / 32));
	const delta = new Uint16Array(n2 + 1);
	let fits = true;
	for (let i = 0; i <= n2 && fits; i++) {
		if (i % 32 === 0) base[i / 32] = off3[i];
		const d = off3[i] - base[i >>> 5];
		if (d > 65535) fits = false;
		delta[i] = d;
	}
	if (fits) {
		put(asBytes(base)); put(asBytes(delta));
	} else {
		new DataView(parts[0].buffer).setUint32(4, 3, true);
		put(asBytes(off3));
		console.error('version 3: trigram offsets kept in 4 bytes');
	}
	put(u24(w3));
	const q = quantize(p3);
	console.error(`p3: largest error ${q.err.toFixed(4)}`);
	put(asBytes(q.table)); put(q.codes);
}
const out = new Uint8Array(size);
let o = 0;
for (const p of parts) { out.set(p, o); o += p.length; }
writeFileSync(outPath, out);
console.error(`${inPath}: ${(bytes.length / 1e6).toFixed(1)} MB -> ${outPath}: ${(size / 1e6).toFixed(1)} MB`);
