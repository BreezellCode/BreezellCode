/**
 * Spelling correction for words typed letter by letter (English): the vocabulary's words one or
 * two edits away from what was typed (a key next to the right one, a letter missed, one too many,
 * two swapped), each scored by the language model after the words before it and by how likely the
 * slip is, so "teh" becomes "the" and "form" stays "form" or becomes "from" as the sentence says.
 *
 * A word is changed only when the typed word is not a word, or a candidate fits the sentence far
 * better (the margin): correcting what was meant costs more than leaving a rare word alone.
 */
import { NgramModel } from './lm.js';

const ROWS = ['qwertyuiop', 'asdfghjkl', 'zxcvbnm'];
const POS = new Map<string, [number, number]>();
ROWS.forEach((row, r) => [...row].forEach((c, i) => POS.set(c, [r, i + r * 0.5])));

/** Two keys next to each other on a QWERTY keyboard. */
function adjacent(a: string, b: string): boolean {
	const p = POS.get(a), q = POS.get(b);
	return !!p && !!q && Math.abs(p[0] - q[0]) <= 1 && Math.abs(p[1] - q[1]) <= 1.01;
}

export interface CorrectorOptions {
	/** ln cost of one slip: an adjacent key, another key, a missing, an extra, a swapped letter. */
	readonly adjacentCost?: number;
	readonly otherCost?: number;
	readonly missCost?: number;
	readonly extraCost?: number;
	readonly swapCost?: number;
	/** How much better (ln) a candidate must fit than a typed word that is a word. */
	readonly margin?: number;
	/**
	 * For a typed word the vocabulary lacks (a slip, or a name): how much better than the model's
	 * <unk> the best candidate must fit; below it the word stays (names are left alone).
	 */
	readonly unknownMargin?: number;
}

export interface Correction {
	readonly word: string;
	readonly id: number;
	readonly score: number;
	readonly edits: number;
}

export class SpellCorrector {
	private readonly o: Required<CorrectorOptions>;
	private readonly alphabet = 'abcdefghijklmnopqrstuvwxyz\'';

	constructor(
		private readonly ids: ReadonlyMap<string, number>,
		private readonly lm: NgramModel,
		options: CorrectorOptions = {},
	) {
		this.o = {
			adjacentCost: options.adjacentCost ?? -3.5,
			otherCost: options.otherCost ?? -6.0,
			missCost: options.missCost ?? -4.5,
			extraCost: options.extraCost ?? -4.5,
			swapCost: options.swapCost ?? -4.0,
			margin: options.margin ?? 6.0,
			unknownMargin: options.unknownMargin ?? Number(process.env.BZ_UNKNOWN_MARGIN ?? -10),
		};
	}

	/** Words one edit from `w`, with the slip's cost. */
	private edits1(w: string, out: Map<string, number>, base: number): void {
		const add = (x: string, c: number) => {
			const old = out.get(x);
			if (old === undefined || old < base + c) {
				out.set(x, base + c);
			}
		};
		for (let i = 0; i <= w.length; i++) {
			const a = w.slice(0, i), b = w.slice(i);
			if (b) {
				add(a + b.slice(1), this.o.extraCost);  // the typist hit one key too many
				if (b.length > 1) {
					add(a + b[1] + b[0] + b.slice(2), this.o.swapCost);
				}
				for (const c of this.alphabet) {
					if (c !== b[0]) {
						add(a + c + b.slice(1), adjacent(c, b[0]) ? this.o.adjacentCost : this.o.otherCost);
					}
				}
			}
			for (const c of this.alphabet) {
				add(a + c + b, this.o.missCost);  // a key the typist missed
			}
		}
	}

	/** The best candidates for `typed` after (h2, h1), the typed word itself among them when it is a word. */
	candidates(h2: number, h1: number, typed: string, k = 3): Correction[] {
		const w = typed.toLowerCase();
		if (w.length > 24) {
			return [];  // not a word anyone slipped on: a URL, a hash, keys held down
		}
		const one = new Map<string, number>();
		this.edits1(w, one, 0);
		const pool = new Map<string, { cost: number; edits: number }>();
		const self = this.ids.get(w);
		if (self !== undefined) {
			pool.set(w, { cost: 0, edits: 0 });
		}
		for (const [x, c] of one) {
			if (this.ids.has(x) && !pool.has(x)) {
				pool.set(x, { cost: c, edits: 1 });
			}
		}
		// Two edits only for longer words that found nothing close (and not so long that the
		// second edits run into the millions: one word of 12 letters is about 400,000).
		if (w.length >= 5 && w.length <= 12 && pool.size <= (self !== undefined ? 1 : 0)) {
			for (const [x, c] of one) {
				const two = new Map<string, number>();
				this.edits1(x, two, c);
				for (const [y, c2] of two) {
					if (this.ids.has(y)) {
						const old = pool.get(y);
						if (!old || old.cost < c2) {
							pool.set(y, { cost: c2, edits: 2 });
						}
					}
				}
			}
		}
		const out: Correction[] = [];
		for (const [x, { cost, edits }] of pool) {
			const id = this.ids.get(x)!;
			out.push({ word: x, id, edits, score: this.lm.logProb(h2, h1, id) + cost });
		}
		out.sort((a, b) => b.score - a.score);
		return out.slice(0, k);
	}

	/** What to put in place of `typed` (itself when it should stay). */
	correct(h2: number, h1: number, typed: string): string {
		const w = typed.toLowerCase();
		const best = this.candidates(h2, h1, w, 3);
		if (!best.length) {
			return typed;
		}
		const isWord = this.ids.has(w);
		const top = best[0];
		if (top.word === w) {
			return typed;
		}
		if (isWord) {
			const selfScore = this.lm.logProb(h2, h1, this.ids.get(w)!);
			if (top.score - selfScore < this.o.margin) {
				return typed;
			}
		} else if (top.score - this.lm.logProb(h2, h1, 2) < this.o.unknownMargin) {
			return typed;
		}
		// Keep the typed capitals: "Teh" → "The".
		return typed[0] !== typed[0].toLowerCase() ? top.word[0].toUpperCase() + top.word.slice(1) : top.word;
	}
}
