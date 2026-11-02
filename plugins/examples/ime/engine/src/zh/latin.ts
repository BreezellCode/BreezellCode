/**
 * English among Chinese candidates: which Latin words the letters typed may be, and where each goes
 * among the Chinese readings. Both are scored as ln of a probability, so nothing is decided per word:
 * hello goes first because its Chinese reading is nonsense, my goes after 沒有 because after Chinese
 * text the common reading of the same letters is likelier, and the user's own choices move either.
 *
 *   word   ln P(this word | a Latin word): how often it stands among Chinese (latinWords.ts), a little
 *          of how common it is in English, and the user's own share once they used it twice.
 *   lang   ln P(a Latin word comes next): from what precedes the cursor, raised for a user who
 *          writes much Latin.
 *   habit  what the user did when this word was on offer: took it, or took Chinese instead.
 *   here   how often the text around the cursor holds it.
 *
 * LATIN_PRIOR, EXACT_MARGIN and the rest were chosen on bench/english-mix.ts's development samples.
 */
import { AdaptiveModel } from '../core/adaptive.js';
import { ZhCandidate } from './decoder.js';

/** ln P(Latin next): after Chinese or at a start, and after a Latin word (half of the words there in technical text). */
export const LATIN_PRIOR = -6.5;
export const LATIN_PRIOR_AFTER_LATIN = -1;
/** A reading typed in full (men: 們) is evidence an initials-only one is not. */
export const EXACT_MARGIN = 2;
/** So is the likeliest slip of the keys: jai is jia mistyped far more often than the name. */
export const SLIP_MARGIN = 3;
/** Weight of how common the word is in English, against how often it stands among Chinese. */
const ENGLISH_WEIGHT = 0.1;
/** Weight of the user's own share of words, and the words of prior weight behind it. */
const OWN_WEIGHT = 0.5;
const OWN_PRIOR = 50;
/** Latin words of prior weight behind the share of Latin the user writes. */
const LANG_PRIOR_TOKENS = 300;
/** ln P for a word known only from the context or from one use. */
const FLOOR = -14;
/** Added per ln of occurrences in the text around the cursor (as for Chinese words: AdaptiveOptions.contextBonus). */
const CONTEXT_BONUS = 2.5;
/** Uses that count for the habit: a long-used word can still give way. */
const HABIT_CAP = 8;
/** Scales ln(letters typed / letters of the word) for a word offered before it is finished. */
const COMPLETION_POWER = 3;
/** Letters typed before a word is offered by its start: the user's and the context's words, the common ones. */
const MIN_PREFIX = 3;
const MIN_COMMON_PREFIX = 4;
/** Uses before the user's own word is offered by its start: once may be a one-off. */
const MIN_USES_TO_COMPLETE = 2;
const MAX_OFFERS = 3;

export type LatinContext = 'chinese' | 'latin' | 'none';

/** What precedes the cursor: its last character, a space aside. */
export function latinContextOf(text: string): LatinContext {
	const before = text.trimEnd();
	if (!before) {
		return 'none';
	}
	const c = before.charCodeAt(before.length - 1);
	if ((c >= 0x3400 && c <= 0x9fff) || (c >= 0xf900 && c <= 0xfaff)) {
		return 'chinese';
	}
	return (c >= 48 && c <= 57) || (c >= 65 && c <= 90) || (c >= 97 && c <= 122) ? 'latin' : 'none';
}

/** The words a Chinese input method knows: how often each stands among Chinese, as written, and how common it is in English. */
export class LatinWords {
	private readonly among = new Map<string, { written: string; logp: number }>();
	private readonly english: ReadonlyMap<string, number>;
	private readonly englishTotal: number;
	private sorted?: string[];

	/** `table`: word, tab, parts per million (latinWords.ts). `english`: word to count (en-words.tsv). */
	constructor(table: string, english?: ReadonlyMap<string, number>) {
		for (const line of table.split('\n')) {
			const tab = line.indexOf('\t');
			if (tab > 0) {
				const written = line.slice(0, tab);
				this.among.set(written.toLowerCase(), { written, logp: Math.log(Number(line.slice(tab + 1)) / 1e6) });
			}
		}
		this.english = english ?? new Map();
		let total = 0;
		for (const c of this.english.values()) {
			total += c;
		}
		this.englishTotal = total || 1;
	}

	has(word: string): boolean {
		return this.among.has(word) || this.english.has(word);
	}

	/** As it is usually written (API, GitHub), else as given. */
	written(word: string): string {
		return this.among.get(word)?.written ?? word;
	}

	/** P(word | a Latin word), 0 for a word it does not know. */
	probability(word: string): number {
		const among = this.among.get(word);
		const count = this.english.get(word);
		return (1 - ENGLISH_WEIGHT) * (among ? Math.exp(among.logp) : 0) + ENGLISH_WEIGHT * (count ? count / this.englishTotal : 0);
	}

	/** The word starting with `prefix` most often among Chinese, longer than it; undefined when none. */
	commonWithPrefix(prefix: string): string | undefined {
		const keys = this.sorted ??= [...this.among.keys()].sort();
		let lo = 0, hi = keys.length;
		while (lo < hi) {
			const mid = (lo + hi) >> 1;
			if (keys[mid] < prefix) {
				lo = mid + 1;
			} else {
				hi = mid;
			}
		}
		let best: string | undefined;
		let bestLogp = -Infinity;
		for (let i = lo; i < keys.length && keys[i].startsWith(prefix); i++) {
			const p = this.among.get(keys[i])!.logp;
			if (keys[i] !== prefix && p > bestLogp) {
				best = keys[i];
				bestLogp = p;
			}
		}
		return best;
	}
}

export interface LatinOffer {
	/** As it goes in. */
	readonly text: string;
	/** Its lowercase letters. */
	readonly word: string;
	/** Its place among the candidates (in the list with the Chinese readings, before this offer is added). */
	readonly index: number;
}

export interface LatinQuery {
	/** The letters typed, lowercase. */
	readonly letters: string;
	/** The Chinese candidates: the whole-input readings first. */
	readonly candidates: readonly ZhCandidate[];
	/** How many whole-input readings lead the candidates. */
	readonly lead: number;
	readonly context: LatinContext;
	/** Latin words of the text around the cursor, by their lowercase: as written there, and how often. */
	readonly here: ReadonlyMap<string, { readonly text: string; readonly hits: number }>;
}

/** ln P(a Latin word comes next). */
function langScore(context: LatinContext, adaptive: AdaptiveModel | undefined): number {
	const prior = context === 'latin' ? LATIN_PRIOR_AFTER_LATIN : LATIN_PRIOR;
	if (!adaptive?.latinTotal) {
		return prior;
	}
	// Only upwards: Latin typed past the input method is not counted, so little counted says little.
	const own = (adaptive.latinTotal + LANG_PRIOR_TOKENS * Math.exp(prior)) / (adaptive.latinTotal + adaptive.committedTotal + LANG_PRIOR_TOKENS);
	return Math.max(prior, Math.log(own));
}

/** The words `letters` may be, each with the score to set against the Chinese readings. */
function scored(query: LatinQuery, words: LatinWords | undefined, adaptive: AdaptiveModel | undefined): { word: string; text: string; score: number }[] {
	const { letters, here } = query;
	const lang = langScore(query.context, adaptive);
	const score = (word: string): number => {
		const own = adaptive?.latinWord(word);
		const uses = own?.uses ?? 0;
		const base = words?.probability(word) ?? 0;
		const share = uses >= MIN_USES_TO_COMPLETE ? (uses - 1) / ((adaptive?.latinTotal ?? 0) + OWN_PRIOR) : 0;
		const p = own ? (1 - OWN_WEIGHT) * base + OWN_WEIGHT * share : base;
		const hits = here.get(word)?.hits ?? 0;
		const habit = own ? Math.log((Math.min(uses, HABIT_CAP) + 1) / (own.skips + 1)) : 0;
		return Math.log(Math.max(p, Math.exp(FLOOR))) + lang + CONTEXT_BONUS * Math.log1p(hits) + habit
			+ COMPLETION_POWER * Math.log(letters.length / word.length);
	};
	const textOf = (word: string): string => adaptive?.latinWord(word)?.text ?? here.get(word)?.text ?? words?.written(word) ?? word;
	const found = new Set<string>();
	if (words?.has(letters) || here.has(letters) || adaptive?.latinWord(letters)) {
		found.add(letters);
	}
	if (letters.length >= MIN_PREFIX) {
		for (const w of here.keys()) {
			if (w.length > letters.length && w.startsWith(letters)) {
				found.add(w);
			}
		}
		for (const w of adaptive?.latinWithPrefix(letters, MAX_OFFERS, MIN_USES_TO_COMPLETE) ?? []) {
			if (w !== letters) {
				found.add(w);
			}
		}
	}
	// A common word by its start, unless the letters are a word already or a reading typed in full (she: 設, not shell).
	if (letters.length >= MIN_COMMON_PREFIX && !words?.has(letters) && !(query.candidates[0]?.sentence && query.candidates[0].exact)) {
		const common = words?.commonWithPrefix(letters);
		if (common) {
			found.add(common);
		}
	}
	return [...found].map(word => ({ word, text: textOf(word), score: score(word) })).sort((a, b) => b.score - a.score).slice(0, MAX_OFFERS);
}

/**
 * The Latin words to offer for the letters typed, and where: above the whole-input readings they
 * outscore, after those they do not. Words go after the readings at the most, so a page of Chinese
 * stays a page of Chinese.
 */
export function latinOffers(query: LatinQuery, words: LatinWords | undefined, adaptive: AdaptiveModel | undefined): LatinOffer[] {
	const readings = query.candidates.slice(0, query.lead).filter(c => c.sentence);
	const margin = (c: ZhCandidate) => c.score + (c.exact ? EXACT_MARGIN : c.slip ? SLIP_MARGIN : 0);
	const offers: LatinOffer[] = [];
	for (const s of scored(query, words, adaptive)) {
		let index = 0;
		while (index < readings.length && margin(readings[index]) >= s.score) {
			index++;
		}
		offers.push({ text: s.text, word: s.word, index });
	}
	return offers;
}
