/**
 * Word prediction for languages typed word by word (Korean, English…): the words the keys typed
 * so far can still become, ranked by the language model after the words before them, so the one
 * meant is offered after a key or two, or before any (the next word).
 *
 * The vocabulary's suggestible words [first, last) are sorted by their keys, so a key prefix is one
 * id range; within it the candidates are the words the model has seen after this history
 * (followers) and the range's most frequent words, each scored with the full model.
 */
import { NgramModel } from './lm.js';

export interface Prediction {
	readonly id: number;
	readonly word: string;
	readonly score: number;
}

export class PrefixPredictor {
	private readonly topCache = new Map<string, number[]>();

	constructor(
		readonly words: readonly string[],
		/** The keys of each word, for ids in [first, last); sorted. */
		private readonly keys: readonly string[],
		private readonly lm: NgramModel,
		private readonly first: number,
		private readonly last: number,
		/** The context-free part: how many of a range's most frequent words are always candidates. */
		private readonly topCount = 48,
	) { }

	/** Ids [lo, hi) of the words whose keys start with `prefix`. */
	range(prefix: string): [number, number] {
		const find = (key: string, after: boolean) => {
			let lo = this.first, hi = this.last;
			while (lo < hi) {
				const mid = (lo + hi) >>> 1;
				const k = this.keys[mid];
				if (k < key || (after && k.startsWith(key))) {
					lo = mid + 1;
				} else {
					hi = mid;
				}
			}
			return lo;
		};
		return prefix ? [find(prefix, false), find(prefix, true)] : [this.first, this.last];
	}

	private top(prefix: string, lo: number, hi: number): number[] {
		let t = this.topCache.get(prefix);
		if (!t) {
			const best: number[] = [];
			for (let id = lo; id < hi; id++) {
				const u = this.lm.unigram(id);
				if (best.length < this.topCount || u > this.lm.unigram(best[best.length - 1])) {
					let i = best.length;
					while (i > 0 && this.lm.unigram(best[i - 1]) < u) {
						i--;
					}
					best.splice(i, 0, id);
					if (best.length > this.topCount) {
						best.pop();
					}
				}
			}
			t = best;
			if (prefix.length <= 3) {
				this.topCache.set(prefix, t);
			}
		}
		return t;
	}

	/** The `k` best words for the keys typed so far after (h2, h1); `contextFree` ranks by frequency alone. */
	suggest(h2: number, h1: number, prefix: string, k = 3, contextFree = false): Prediction[] {
		const [lo, hi] = this.range(prefix);
		if (lo >= hi) {
			return [];
		}
		const ids = new Set<number>(this.top(prefix, lo, hi));
		if (!contextFree) {
			if (hi - lo > 4096) {
				// A wide range (no key or one typed): the likeliest followers that fall in it.
				for (const id of this.lm.topFollowers(h2, h1, 400)) {
					if (id >= lo && id < hi) {
						ids.add(id);
					}
				}
			} else {
				for (const id of this.lm.followers(h2, h1, lo, hi)) {
					ids.add(id);
				}
			}
		}
		const scored: Prediction[] = [];
		for (const id of ids) {
			scored.push({ id, word: this.words[id], score: contextFree ? this.lm.unigram(id) : this.lm.logProb(h2, h1, id) });
		}
		scored.sort((a, b) => b.score - a.score);
		return scored.slice(0, k);
	}
}
