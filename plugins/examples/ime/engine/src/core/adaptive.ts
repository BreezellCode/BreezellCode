/**
 * What the engine learns from its user, and what the text around the cursor tells it.
 *
 * - Committed text: counts of the language model tokens the user committed (and of pairs of
 *   them) form a cache model the base model is mixed with, so words and turns of phrase the
 *   user writes rise. Counts fade (half-life in committed tokens) so old habits give way.
 * - Picks: an entry the user picked rises on its own.
 * - New words: a composition picked in pieces (a name made of single characters, a term the
 *   lexicon lacks) is remembered as one word with its syllables, offered next time.
 * - Context: words of the lexicon that occur in the text around the cursor (the editor's code
 *   and comments, the AI chat) rise while that text is there.
 *
 * It holds nothing but counts, its own words and the current context; all of it can be saved,
 * cleared and exported (toJSON / fromJSON).
 */

export interface AdaptiveOptions {
	/** Weight of the cache model in the mix. */
	readonly cacheWeight?: number;
	/** Committed tokens after which a count is worth half. */
	readonly halfLife?: number;
	/** Score added per pick of an entry (log-scaled). */
	readonly pickBonus?: number;
	/** Score added for a word found in the context (log-scaled by occurrences). */
	readonly contextBonus?: number;
	/**
	 * Most a word's own count may add where the user never typed it after this word (ln): a word
	 * typed a few times must not outweigh the model where it is unlikely (发布 after 正是 over the
	 * one word 正式发布, which no count lifts).
	 */
	readonly unigramCap?: number;
	/** Taken off a pair's count: a pair seen once is weaker evidence than one seen twice. */
	readonly pairDiscount?: number;
	/**
	 * Tokens of prior weight behind a word's share of what the user typed: with few tokens learned,
	 * every word typed would seem the user's favourite (2 of 7 tokens); this many make it a share
	 * the evidence can carry.
	 */
	readonly priorTokens?: number;
}

export interface LearnedWord {
	readonly text: string;
	readonly syllables: readonly number[];
	readonly tokens: readonly number[];
	count: number;
	last: number;
}

export interface AdaptiveSnapshot {
	readonly version: 1;
	readonly clock: number;
	readonly uni: [number, number][];
	readonly bi: [string, number][];
	readonly picks: [string, number][];
	readonly words: LearnedWord[];
}

/** Tuning: mix a word's own count with the context's probability or the word's ("word"). */
const WORD_MIX = (typeof process !== 'undefined' && process.env?.BZ_WORD_MIX) || 'context';

export class AdaptiveModel {
	private readonly cacheWeight: number;
	private readonly halfLife: number;
	private readonly pickBonus: number;
	private readonly contextBonus: number;
	private readonly unigramCap: number;
	private readonly pairDiscount: number;
	private readonly priorTokens: number;
	/** Decayed counts are stored at clock 0 scale: value * 2^(clock / halfLife) at the time of adding. */
	private clock = 0;
	private uni = new Map<number, number>();
	private uniTotal = 0;
	private bi = new Map<string, number>();
	/** Picks by entry text (the same word picked through another reading counts too). */
	private picks = new Map<string, number>();
	private words: LearnedWord[] = [];
	private context = '';
	private readonly contextCache = new Map<string, number>();
	private version = 0;

	constructor(options: AdaptiveOptions = {}) {
		this.cacheWeight = options.cacheWeight ?? 0.08;
		this.halfLife = options.halfLife ?? 20000;
		this.pickBonus = options.pickBonus ?? 0.9;
		this.contextBonus = options.contextBonus ?? 2.5;
		this.unigramCap = options.unigramCap ?? 2;
		this.pairDiscount = options.pairDiscount ?? 0;
		this.priorTokens = options.priorTokens ?? Number((typeof process !== 'undefined' && process.env?.BZ_PRIOR_TOKENS) || 300);
	}

	/** Bumps when anything that changes scores changes (callers may cache per version). */
	get stamp(): number {
		return this.version;
	}

	get learnedWords(): readonly LearnedWord[] {
		return this.words;
	}

	private scale(): number {
		return Math.pow(2, this.clock / this.halfLife);
	}

	/** The counts in today's units. */
	private now(stored: number): number {
		return stored / this.scale();
	}

	/**
	 * Records committed tokens (a sentence or a piece), in order; `previous` is the word before
	 * them (the sentence typed in pieces), so the pair across the pieces is learned too.
	 */
	learnTokens(tokens: readonly number[], previous = -1, weight = 1): void {
		const s = this.scale() * weight;
		let prev = previous >= 4 ? previous : -1;
		for (const t of tokens) {
			this.uni.set(t, (this.uni.get(t) ?? 0) + s);
			this.uniTotal += s;
			if (prev >= 0) {
				const k = `${prev},${t}`;
				this.bi.set(k, (this.bi.get(k) ?? 0) + s);
			}
			prev = t;
			this.clock++;
		}
		this.version++;
	}

	learnPick(text: string): void {
		this.picks.set(text, (this.picks.get(text) ?? 0) + 1);
		this.version++;
	}

	/**
	 * Takes back what one commit taught (the user deleted it at once: it was not what they meant):
	 * the pick, and the tokens' counts as they were added.
	 */
	unlearn(text: string, tokens: readonly number[], previous = -1, weight = 1): void {
		const p = this.picks.get(text);
		if (p !== undefined) {
			if (p <= 1) {
				this.picks.delete(text);
			} else {
				this.picks.set(text, p - 1);
			}
		}
		const s = this.scale() * weight;
		const take = (map: Map<any, number>, key: any) => {
			const v = map.get(key);
			if (v === undefined) {
				return;
			}
			if (v <= s * 1.0001) {
				map.delete(key);
			} else {
				map.set(key, v - s);
			}
		};
		let prev = previous >= 4 ? previous : -1;
		for (const t of tokens) {
			if (this.uni.has(t)) {
				take(this.uni, t);
				this.uniTotal = Math.max(0, this.uniTotal - s);
			}
			if (prev >= 0) {
				take(this.bi, `${prev},${t}`);
			}
			prev = t;
		}
		this.version++;
	}

	/** Remembers a word made of the pieces picked for it. */
	learnWord(text: string, syllables: readonly number[], tokens: readonly number[]): void {
		const old = this.words.find(w => w.text === text && w.syllables.join() === syllables.join());
		if (old) {
			old.count++;
			old.last = this.clock;
		} else {
			this.words.push({ text, syllables: [...syllables], tokens: [...tokens], count: 1, last: this.clock });
			if (this.words.length > 20000) {
				// The least used and oldest go first.
				this.words.sort((a, b) => b.count - a.count || b.last - a.last);
				this.words.length = 15000;
			}
		}
		this.version++;
	}

	/** The text around the cursor (editor, chat); '' when there is none. */
	setContext(text: string): void {
		const next = text.length > 20000 ? text.slice(-20000) : text;
		if (next !== this.context) {
			this.context = next;
			this.contextCache.clear();
			this.version++;
		}
	}

	/**
	 * Added to ln P(token | h) of the base model: the cache model mixed in, the pair the user typed
	 * (h1, token) and the word's own share, each its own term. The word's share has a prior
	 * (priorTokens) and a cap (unigramCap): with few tokens learned, or where the model finds the
	 * word unlikely, a word typed twice would otherwise become near certain (发布 after 正是, over the
	 * one word 正式发布 that no count lifts). BZ_WORD_MIX=word mixes the share with the word's own
	 * frequency (`unigram`) instead (tuning; the dev sets chose the context).
	 */
	adjust(_h2: number, h1: number, token: number, base: number, unigram = base): number {
		const c = this.uni.get(token);
		if (!c || !this.uniTotal) {
			return 0;
		}
		const uni = this.now(c) / (this.now(this.uniTotal) + this.priorTokens);
		const pair = this.bi.get(`${h1},${token}`);
		const prevCount = this.uni.get(h1);
		const pairNow = pair ? this.now(pair) - this.pairDiscount : 0;
		const big = pairNow > 0 && prevCount ? pairNow / this.now(prevCount) : 0;
		// ln((1 - λ) P + λ cache) - ln P, without the (1 - λ) all paths share
		const pairPart = big > 0 ? Math.log1p(this.cacheWeight * 0.6 * big / Math.exp(base)) : 0;
		const wordPart = Math.min(this.unigramCap, Math.log1p(this.cacheWeight * 0.4 * uni / Math.exp(WORD_MIX === 'context' ? base : unigram)));
		return pairPart + wordPart;
	}

	/**
	 * Added to an entry chosen as a whole: picked before, or found in the context. A single
	 * character gets a third of the pick bonus: picked to fix one sentence, it should not jump
	 * ahead everywhere (左 picked after 需要 by mistake); the pair learned with it carries its context.
	 */
	bonus(text: string, pickWeight = 1): number {
		let b = 0;
		const picks = this.picks.get(text);
		if (picks && pickWeight) {
			b += pickWeight * this.pickBonus * Math.log1p(picks) * (text.length > 1 ? 1 : 0.3);
		}
		if (this.context && text.length >= 2) {
			let hits = this.contextCache.get(text);
			if (hits === undefined) {
				hits = 0;
				for (let i = this.context.indexOf(text); i >= 0 && hits < 20; i = this.context.indexOf(text, i + text.length)) {
					hits++;
				}
				this.contextCache.set(text, hits);
			}
			if (hits) {
				b += this.contextBonus * Math.log1p(hits);
			}
		}
		return b;
	}

	clear(): void {
		this.clock = 0;
		this.uni.clear();
		this.uniTotal = 0;
		this.bi.clear();
		this.picks.clear();
		this.words = [];
		this.version++;
	}

	/**
	 * Adds what another user model learned (Breezell's plugin's, joining the system input
	 * method's): its counts taken as of now (its clock lined up with this one), picks and words added.
	 */
	merge(other: AdaptiveSnapshot): void {
		if (other?.version !== 1) {
			return;
		}
		const k = this.scale() / Math.pow(2, other.clock / this.halfLife);
		for (const [t, v] of other.uni) {
			this.uni.set(t, (this.uni.get(t) ?? 0) + v * k);
			this.uniTotal += v * k;
		}
		for (const [key, v] of other.bi) {
			this.bi.set(key, (this.bi.get(key) ?? 0) + v * k);
		}
		for (const [text, n] of other.picks) {
			this.picks.set(text, (this.picks.get(text) ?? 0) + n);
		}
		for (const w of other.words) {
			const last = this.clock - (other.clock - w.last);
			const mine = this.words.find(x => x.text === w.text && x.syllables.join() === w.syllables.join());
			if (mine) {
				mine.count += w.count;
				mine.last = Math.max(mine.last, last);
			} else {
				this.words.push({ text: w.text, syllables: [...w.syllables], tokens: [...w.tokens], count: w.count, last });
			}
		}
		this.version++;
	}

	toJSON(): AdaptiveSnapshot {
		return { version: 1, clock: this.clock, uni: [...this.uni], bi: [...this.bi], picks: [...this.picks], words: this.words };
	}

	static fromJSON(snapshot: AdaptiveSnapshot, options?: AdaptiveOptions): AdaptiveModel {
		const m = new AdaptiveModel(options);
		if (snapshot?.version !== 1) {
			return m;
		}
		m.clock = snapshot.clock;
		m.uni = new Map(snapshot.uni);
		m.uniTotal = [...m.uni.values()].reduce((a, b) => a + b, 0);
		m.bi = new Map(snapshot.bi);
		m.picks = new Map(snapshot.picks);
		m.words = snapshot.words;
		return m;
	}
}
