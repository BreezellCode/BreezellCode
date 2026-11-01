/**
 * Pinyin to Chinese: the words the input can spell form a lattice over input positions; a beam
 * search scores paths with the n-gram model (plus what the user model adds) and keeps the best.
 */
import { AdaptiveModel } from '../core/adaptive.js';
import { BOS, EOS, NgramModel, UNK } from '../core/lm.js';
import { arcTone, WordArc, ZhLexicon } from './lexicon.js';
import { EdgeKind, SyllableEdge } from './pinyin.js';
import { PINYIN, ZhSpeller } from './speller.js';
import { ToneTable } from './tones.js';

export interface DecodeOptions {
	/** Tokens before the input (committed text): (h2, h1). */
	readonly history?: readonly [number, number];
	readonly beam?: number;
	readonly sentences?: number;
	/** Most entries per syllable path span, best weights first. */
	readonly perSpan?: number;
	/**
	 * Weight of ln P(</s> | last words) added to whole sentences: the input usually ends a clause
	 * (the user types punctuation next), so 吗 fits the end better than 马. 0 turns it off.
	 */
	readonly endWeight?: number;
	/**
	 * The word just before the input (committed, or picked from this composition) and the history
	 * before that word: a first word of the input that makes one model word with it is scored as
	 * that word's ending (做 + 的: the model has 做的 as one word, so 的 alone after 做 is rare in it).
	 */
	readonly join?: { readonly entry: number; readonly h2: number; readonly h1: number };
}

export interface ZhCandidate {
	readonly text: string;
	/** Input characters this candidate spells (from the start of the input). */
	readonly end: number;
	readonly entries: readonly number[];
	readonly score: number;
	/** The whole input as a sentence. */
	readonly sentence: boolean;
	/** The lexicon's text when `text` was converted for display (Traditional output). */
	readonly base?: string;
	/** A whole sentence read as typed: every syllable whole, none fixed (no initial alone, no slip). */
	readonly exact?: boolean;
	/** Read only after fixing a slip of the keys (jai as jia, or as hai). */
	readonly slip?: boolean;
}

export interface ZhDecodeResult {
	readonly sentences: ZhCandidate[];
	/** Words spelled by the start of the input: longest first, then by score. */
	readonly words: ZhCandidate[];
}

/** Score added per syllable typed as an initial only, and for a last syllable cut short. */
export const INITIAL_PENALTY = -3.0;
export const PARTIAL_PENALTY = -0.7;
/** Score added per syllable whose typed tone (1-4) its character does not take. */
export const TONE_PENALTY = -10.0;
/** Weight of ln P(reading | word): the channel model's part next to the language model. */
export const READING_WEIGHT = 1.0;
/**
 * Added to the model's <unk> for a word it has no token for: <unk> holds the mass of every
 * unknown word together (it scores above 时 after <s>), one rare character gets a sliver of it.
 */
export const UNK_PENALTY = -11.0;

export interface ZhLayout {
	/** The keyboard layout (pinyin by default). */
	readonly speller?: ZhSpeller;
	/** Tones of characters, for layouts that type tones (zhuyin). */
	readonly tones?: ToneTable;
}

interface State {
	readonly score: number;
	readonly h2: number;
	readonly h1: number;
	readonly arc: WordArc | null;
	readonly prev: State | null;
}

/** For each model word, a lexicon entry that is that word alone, -1 none (built once per lexicon, when first needed). */
const wordEntryCache = new WeakMap<ZhLexicon, Int32Array>();
function wordEntries(lex: ZhLexicon, vocabSize: number): Int32Array {
	let map = wordEntryCache.get(lex);
	if (!map) {
		map = new Int32Array(vocabSize).fill(-1);
		for (let e = 0; e < lex.size; e++) {
			const t = lex.tokens(e);
			if (t.length === 1 && t[0] < vocabSize && map[t[0]] < 0) {
				map[t[0]] = e;
			}
		}
		wordEntryCache.set(lex, map);
	}
	return map;
}

export class ZhDecoder {
	readonly speller: ZhSpeller;
	private readonly tones?: ToneTable;
	private readonly tonePenaltyWeight = Number(process.env.BZ_TONE_PENALTY ?? TONE_PENALTY);
	/** Weight of ln P(reading | word) in an arc's score. */
	private readonly readingWeight = Number(process.env.BZ_READING_WEIGHT ?? READING_WEIGHT);
	/**
	 * Weight of the pick bonus in whole sentences (the words list always has it whole): none, the
	 * user model's pairs carry what was learned in context (tuned on dev sets with learning).
	 */
	private readonly sentencePickWeight = Number(process.env.BZ_SENTENCE_PICKS ?? 0);

	constructor(
		readonly lex: ZhLexicon,
		private readonly lm: NgramModel,
		readonly adaptive?: AdaptiveModel,
		layout: ZhLayout = {},
	) {
		this.speller = layout.speller ?? PINYIN;
		this.tones = layout.tones;
	}

	/** Text of an entry: the lexicon's, or (ids past it) a word the user model learned. */
	text(entry: number): string {
		return entry < this.lex.size ? this.lex.text(entry) : this.adaptive!.learnedWords[entry - this.lex.size].text;
	}

	tokens(entry: number): ArrayLike<number> {
		return entry < this.lex.size ? this.lex.tokens(entry) : this.adaptive!.learnedWords[entry - this.lex.size].tokens;
	}

	syllables(entry: number): ArrayLike<number> {
		return entry < this.lex.size ? this.lex.syllables(entry) : this.adaptive!.learnedWords[entry - this.lex.size].syllables;
	}

	/**
	 * Words likely to come next after (h2, h1), likeliest first: what to offer once a composition
	 * is committed (聯想). The model's likeliest followers that are lexicon words of one to four
	 * Chinese characters, ranked with what the user typed after h1 before.
	 */
	predict(h2: number, h1: number, count: number): { text: string; token: number }[] {
		const entries = wordEntries(this.lex, this.lm.vocabSize);
		const scored: { text: string; token: number; score: number }[] = [];
		for (const t of this.lm.topFollowers(h2, h1, count * 4)) {
			const e = t >= 4 ? entries[t] : -1;
			if (e < 0) {
				continue;
			}
			const text = this.lex.text(e);
			if (!/^[\u3400-\u9fff\uf900-\ufaff]{1,4}$/.test(text)) {
				continue;
			}
			const base = this.lm.logProb(h2, h1, t);
			scored.push({ text, token: t, score: this.adaptive ? base + this.adaptive.adjust(h2, h1, t, base, this.lm.unigram(t)) : base });
		}
		scored.sort((a, b) => b.score - a.score);
		return scored.slice(0, count).map(({ text, token }) => ({ text, token }));
	}

	/**
	 * Added per model word (ln): a word model charges every word of a sentence, so one long word
	 * (a name: 浙江, 傅祖鉴) pays once where the words it hides (这 将, 父 组件) pay each.
	 */
	private readonly tokenBonus = Number(process.env.BZ_TOKEN_BONUS ?? -1.5);
	private readonly sumSegmentations = process.env.BZ_SUM_SEGMENTATIONS !== '0';

	/** ln P of an entry's tokens after (h2, h1), and the history after it. */
	private arcScore(entry: number, h2: number, h1: number, bonus: number): [number, number, number] {
		let score = bonus + (entry < this.lex.size ? this.readingWeight * this.lex.readingLogp(entry) : 0);
		const toks = this.tokens(entry);
		score += this.tokenBonus * toks.length;
		for (let i = 0; i < toks.length; i++) {
			const t = toks[i];
			const base = this.lm.logProb(h2, h1, t) + (t === UNK ? UNK_PENALTY : 0);
			score += this.adaptive ? base + this.adaptive.adjust(h2, h1, t, base, this.lm.unigram(t)) : base;
			h2 = h1;
			h1 = t;
		}
		return [score, h2, h1];
	}

	/** Words the user model learned that a path of edges from `start` spells. */
	private learnedArcs(graph: readonly (readonly SyllableEdge[])[], start: number): WordArc[] {
		const words = this.adaptive?.learnedWords;
		if (!words?.length) {
			return [];
		}
		const arcs: WordArc[] = [];
		words.forEach((w, i) => {
			const walk = (pos: number, k: number, initials: number, partial: boolean, tones: number, corrections = 0, cost = 0): void => {
				if (k === w.syllables.length) {
					arcs.push({ entry: this.lex.size + i, start, end: pos, initials, partial, tones, corrections, correctionCost: cost });
					return;
				}
				if (partial) {
					return;
				}
				for (const e of graph[pos] ?? []) {
					if (w.syllables[k] >= e.lo && w.syllables[k] <= e.hi) {
						const fixes = corrections + (e.corrected ? 1 : 0);
						if (fixes <= 1) {
							walk(e.end, k + 1, initials + (e.kind === EdgeKind.Initial ? 1 : 0), e.kind === EdgeKind.Partial,
								e.tone ? tones + e.tone * Math.pow(8, k) : tones, fixes, cost + (e.corrected ? e.cost ?? 4.5 : 0));
						}
					}
				}
			};
			walk(start, 0, 0, false, 0);
		});
		return arcs;
	}

	private penalty(arc: WordArc): number {
		return arc.initials * INITIAL_PENALTY + (arc.partial ? PARTIAL_PENALTY : 0) + -(arc.correctionCost ?? 0) + this.tonePenalty(arc);
	}

	/** For each syllable typed with a tone (1-4) its character is not known to take. */
	private tonePenalty(arc: WordArc): number {
		if (!arc.tones || !this.tones) {
			return 0;
		}
		const text = this.text(arc.entry);
		const syllables = this.syllables(arc.entry);
		if (text.length !== syllables.length) {
			return 0;  // letters, a character outside the BMP: no character per syllable
		}
		let misses = 0;
		for (let i = 0; i < syllables.length; i++) {
			const t = arcTone(arc.tones, i);
			if (t >= 1 && t <= 4) {
				const mask = this.tones.mask(text.charCodeAt(i), syllables[i]);
				if (mask && !(mask & (1 << t))) {
					misses++;
				}
			}
		}
		return misses * this.tonePenaltyWeight;
	}

	decode(input: string, options: DecodeOptions = {}): ZhDecodeResult {
		const n = input.length;
		const beam = options.beam ?? Number(process.env.BZ_BEAM ?? 24);
		const [h2, h1] = options.history ?? [BOS, BOS];
		const graph = this.speller.graph(input);
		const skip = (p: number) => { while (p < n && this.speller.skips(input[p])) { p++; } return p; };
		const start = skip(0);
		const arcsFrom = new Map<number, WordArc[]>();
		const arcs = (pos: number) => {
			let a = arcsFrom.get(pos);
			if (!a) {
				a = this.lex.lookup(graph as SyllableEdge[][], pos, { perSpan: options.perSpan ?? Number(process.env.BZ_PER_SPAN ?? 48) });
				a.push(...this.learnedArcs(graph, pos));
				arcsFrom.set(pos, a);
			}
			return a;
		};
		// Words of the input that close the word before it (做 + 的 → 做的): their score as that ending.
		const join = options.join && options.join.entry < this.lex.size && this.lex.tokens(options.join.entry).length === 1 ? options.join : undefined;
		const joinedOf = new Map<number, { lp: number; token: number } | null>();
		const joined = (entry: number): { lp: number; token: number } | null => {
			if (!join || entry >= this.lex.size) {
				return null;
			}
			let j = joinedOf.get(entry);
			if (j === undefined) {
				j = null;
				const want = this.lex.text(join.entry) + this.lex.text(entry);
				for (const m of this.lex.exact([...Array.from(this.lex.syllables(join.entry)), ...Array.from(this.lex.syllables(entry))])) {
					const t = this.lex.tokens(m);
					if (t.length === 1 && this.lex.text(m) === want) {
						const before = this.lm.logProb(join.h2, join.h1, this.lex.tokens(join.entry)[0]);
						j = { lp: this.lm.logProb(join.h2, join.h1, t[0]) - before + this.readingWeight * this.lex.readingLogp(entry), token: t[0] };
						break;
					}
				}
				joinedOf.set(entry, j);
			}
			return j;
		};
		// Whole sentences: the context bonus, picks weighted (a word picked elsewhere must not pull a
		// path of its pieces over one word the model knows: 正是+发布 over 正式发布); the words: both.
		const bonusOf = new Map<number, number>(), wordBonusOf = new Map<number, number>();
		const bonus = (entry: number) => {
			if (!this.adaptive) {
				return 0;
			}
			let b = bonusOf.get(entry);
			if (b === undefined) {
				b = this.adaptive.bonus(this.text(entry), this.sentencePickWeight);
				bonusOf.set(entry, b);
			}
			return b;
		};
		const wordBonus = (entry: number) => {
			if (!this.adaptive) {
				return 0;
			}
			let b = wordBonusOf.get(entry);
			if (b === undefined) {
				b = this.adaptive.bonus(this.text(entry));
				wordBonusOf.set(entry, b);
			}
			return b;
		};

		const states: State[][] = Array.from({ length: n + 1 }, () => []);
		states[start].push({ score: 0, h2, h1, arc: null, prev: null });
		for (let pos = start; pos < n; pos++) {
			const here = states[pos];
			if (!here.length) {
				continue;
			}
			here.sort((a, b) => b.score - a.score);
			if (here.length > beam) {
				here.length = beam;
			}
			for (const arc of arcs(pos)) {
				const end = skip(arc.end);
				const pen = this.penalty(arc);
				const b = bonus(arc.entry);
				for (const s of here) {
					let [lp, nh2, nh1] = this.arcScore(arc.entry, s.h2, s.h1, b);
					if (join && !s.prev) {
						const j = joined(arc.entry);
						if (j && j.lp + b > lp) {
							lp = j.lp + b;
							nh2 = join.h1;
							nh1 = j.token;
						}
					}
					push(states[end], { score: s.score + lp + pen, h2: nh2, h1: nh1, arc, prev: s }, beam);
				}
			}
		}

		const endWeight = options.endWeight ?? Number(process.env.BZ_END_WEIGHT ?? 0.5);
		// The end of the input ends the clause, unless no reading of it ends on a whole syllable:
		// "zuod" is 做 and a syllable still being typed (的 rather than 帶, though 的 seldom ends a
		// sentence). Where one does ("zhuang"), every reading is scored as ending there.
		const typedOn = !states[n].some(s => s.arc && !s.arc.partial);
		const finals = states[n]
			.map(s => endWeight && !typedOn ? { ...s, score: s.score + endWeight * this.lm.logProb(s.h2, s.h1, EOS) } : s)
			.sort((a, b) => b.score - a.score);
		// A text's paths are its segmentations (可以使用 as one word, or 可以 + 使用: the model's
		// training text was cut one way or the other), so a text scores the sum of its paths' chances;
		// the best path gives its words.
		const byText = new Map<string, ZhCandidate>();
		for (const s of finals) {
			const entries: number[] = [];
			let exact = true, slip = false;
			for (let t: State | null = s; t && t.arc; t = t.prev) {
				entries.push(t.arc.entry);
				exact &&= !t.arc.initials && !t.arc.partial && !t.arc.corrections;
				slip ||= !!t.arc.corrections;
			}
			entries.reverse();
			const text = entries.map(e => this.text(e)).join('');
			const best = byText.get(text);
			if (!best) {
				byText.set(text, { text, end: n, entries, score: s.score, sentence: true, exact, slip });
			} else if (this.sumSegmentations) {
				byText.set(text, { ...best, score: logAdd(best.score, s.score) });
			}
		}
		const sentences = [...byText.values()].sort((a, b) => b.score - a.score).slice(0, options.sentences ?? 3);

		// The first words of the best sentences: the pieces a user most likely picks when the
		// sentence is not quite right (是 of 是藉由…, not the longer 世界遊).
		const leads = new Map<string, number>();
		for (const s of finals) {
			let t: State | null = s;
			while (t?.prev?.arc) {
				t = t.prev;
			}
			if (t?.arc) {
				const key = `${skip(t.arc.end)}\u0000${this.text(t.arc.entry)}`;
				if (!leads.has(key)) {
					leads.set(key, leads.size);
				}
			}
		}

		// Words at the start of the input, longest first: what the user picks a piece at a time with.
		const words: ZhCandidate[] = [];
		const best = new Map<string, ZhCandidate>();
		for (const arc of arcs(start)) {
			let [lp] = this.arcScore(arc.entry, h2, h1, wordBonus(arc.entry));
			const j = joined(arc.entry);
			if (j && j.lp + wordBonus(arc.entry) > lp) {
				lp = j.lp + wordBonus(arc.entry);
			}
			const text = this.text(arc.entry);
			const end = skip(arc.end);
			const key = `${end}\u0000${text}`;
			const score = lp + this.penalty(arc);
			const old = best.get(key);
			if (!old || old.score < score) {
				best.set(key, { text, end, entries: [arc.entry], score, sentence: end === n, slip: !!arc.corrections, initials: arc.initials + (arc.corrections ?? 0) } as ZhCandidate & { initials: number });
			}
		}
		words.push(...best.values());
		// Words typed in full before words read from initials (fengjiangjun: 冯将军 before 封建割据,
		// which takes the g alone as 割), then longest first, then by score.
		const initialsOf = (c: ZhCandidate) => (c as ZhCandidate & { initials: number }).initials > 0 ? 1 : 0;
		const leadOf = (c: ZhCandidate) => leads.get(`${c.end}\u0000${c.text}`) ?? Infinity;
		words.sort((a, b) => initialsOf(a) - initialsOf(b) || (leadOf(a) - leadOf(b) || 0) || b.end - a.end || b.score - a.score);
		return { sentences, words };
	}
}

/** ln(e^a + e^b). */
function logAdd(a: number, b: number): number {
	return a > b ? a + Math.log1p(Math.exp(b - a)) : b + Math.log1p(Math.exp(a - b));
}

/** Adds a state to a position's list, keeping one state per history (the better) and the list bounded. */
function push(list: State[], state: State, beam: number): void {
	for (let i = 0; i < list.length; i++) {
		const o = list[i];
		if (o.h1 === state.h1 && o.h2 === state.h2) {
			if (o.score < state.score) {
				list[i] = state;
			}
			return;
		}
	}
	list.push(state);
	if (list.length > beam * 4) {
		list.sort((a, b) => b.score - a.score);
		list.length = beam;
	}
}
