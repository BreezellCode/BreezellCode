/**
 * Kana to kanji: the words of Mozc's dictionary that the reading spells form a lattice; a beam
 * search scores paths with Mozc's costs (each word's, and the connection between parts of speech)
 * and with the word n-gram model trained on Japanese text, which knows which words follow which
 * (今日は いい天気 rather than 京は 言い天気). A part of the reading no word spells becomes katakana
 * (a foreign word the dictionary lacks) or stays hiragana.
 */
import { AdaptiveModel } from '../core/adaptive.js';
import { BOS, EOS, NgramModel, UNK } from '../core/lm.js';
import { JaLexicon } from './lexicon.js';

/** Vocabulary ids of the word classes (tools/ja/jaseg.cpp writes them after <s> </s> <unk> <x>). */
export const KATA_TOKEN = 4;

export interface JaSegment {
	readonly reading: string;
	readonly surface: string;
	/** Dictionary entry, -1 for katakana or hiragana the dictionary lacks. */
	readonly entry: number;
	readonly token: number;
}

export interface JaCandidate {
	readonly text: string;
	readonly segments: readonly JaSegment[];
	readonly score: number;
}

export interface JaConvertOptions {
	readonly history?: readonly [number, number];
	readonly nbest?: number;
	readonly beam?: number;
	readonly perSpan?: number;
}

/** Weights: Mozc's costs (per 1000) and the model's ln P. */
export const COST_WEIGHT = 1.0;
export const LM_WEIGHT = 1.0;
const UNK_PENALTY = -11;
/** The model's <kata> holds every katakana word it was not given one by one: one of them gets a sliver. */
const KATA_PENALTY = -8;
/**
 * Per character of a word the dictionary lacks: spelling it out costs about what one more kana
 * costs (ln 1/60), so one long unknown word is no cheaper for the model than the words it covers.
 */
export const SPELL_PER_CHAR = -4.0;

interface State {
	readonly score: number;
	readonly h2: number;
	readonly h1: number;
	readonly rid: number;
	readonly seg: JaSegment | null;
	readonly prev: State | null;
}

interface Arc {
	readonly end: number;
	readonly lid: number;
	readonly rid: number;
	readonly cost: number;
	readonly seg: JaSegment;
	/** Added to the model's score: the spelling of a word it has no token for. */
	readonly spell: number;
}

export class JaConverter {
	private readonly costWeight = Number(process.env.BZ_JA_COST ?? COST_WEIGHT) / 1000;
	private readonly lmWeight = Number(process.env.BZ_JA_LM ?? LM_WEIGHT);
	private readonly spellPerChar = Number(process.env.BZ_JA_SPELL ?? SPELL_PER_CHAR);
	/** 名詞,一般 in Mozc's ids: what an unknown word is taken for. */
	private readonly nounId: number;

	constructor(
		readonly lex: JaLexicon,
		private readonly lm?: NgramModel,
		readonly adaptive?: AdaptiveModel,
		nounId = 1851,
	) {
		this.nounId = nounId;
	}

	private lmScore(h2: number, h1: number, t: number): number {
		if (!this.lm || !this.lmWeight) {
			return 0;
		}
		const base = this.lm.logProb(h2, h1, t) + (t === UNK ? UNK_PENALTY : t === KATA_TOKEN ? KATA_PENALTY : 0);
		return this.lmWeight * (this.adaptive ? base + this.adaptive.adjust(h2, h1, t, base, this.lm.unigram(t)) : base);
	}

	private arcsFrom(kana: string, pos: number, perSpan: number): Arc[] {
		const arcs: Arc[] = [];
		const lex = this.lex;
		for (const { entry, end } of lex.lookup(kana, pos, perSpan)) {
			const seg = { reading: kana.slice(pos, end), surface: lex.surface(entry), entry, token: lex.token(entry) };
			arcs.push({ end, lid: lex.lid(entry), rid: lex.rid(entry), cost: lex.cost(entry), seg, spell: 0 });
		}
		// Katakana for readings the dictionary may lack (foreign words), hiragana as typed.
		for (let len = 1; len <= 12 && pos + len <= kana.length; len++) {
			const reading = kana.slice(pos, pos + len);
			if (!/^[ぁ-ゖー]+$/.test(reading)) {
				break;
			}
			const kata = reading.replace(/[ぁ-ゖ]/g, c => String.fromCharCode(c.charCodeAt(0) + 0x60));
			// Costly per character: the dictionary's words go first unless they make no sense.
			arcs.push({ end: pos + len, lid: this.nounId, rid: this.nounId, cost: 4000 + 2500 * len, seg: { reading, surface: kata, entry: -1, token: KATA_TOKEN }, spell: this.spellPerChar * len });
			if (len <= 2) {
				arcs.push({ end: pos + len, lid: this.nounId, rid: this.nounId, cost: 14000 + 1000 * len, seg: { reading, surface: reading, entry: -1, token: UNK }, spell: this.spellPerChar * len });
			}
		}
		// Anything else (a letter, a mark) one by one, as it is.
		if (!arcs.length) {
			const c = kana[pos];
			arcs.push({ end: pos + 1, lid: this.nounId, rid: this.nounId, cost: 8000, seg: { reading: c, surface: c, entry: -1, token: UNK }, spell: this.spellPerChar });
		}
		return arcs;
	}

	convert(kana: string, options: JaConvertOptions = {}): JaCandidate[] {
		const n = kana.length;
		if (!n) {
			return [];
		}
		const beam = options.beam ?? 16;
		const perSpan = options.perSpan ?? 24;
		const [h2, h1] = options.history ?? [BOS, BOS];
		const states: State[][] = Array.from({ length: n + 1 }, () => []);
		states[0].push({ score: 0, h2, h1, rid: 0, seg: null, prev: null });
		for (let pos = 0; pos < n; pos++) {
			const here = states[pos];
			if (!here.length) {
				continue;
			}
			here.sort((a, b) => b.score - a.score);
			if (here.length > beam) {
				here.length = beam;
			}
			for (const arc of this.arcsFrom(kana, pos, perSpan)) {
				const bonus = this.adaptive && arc.seg.entry >= 0 ? this.adaptive.bonus(arc.seg.surface) : 0;
				for (const s of here) {
					const score = s.score - this.costWeight * (arc.cost + this.lex.connection(s.rid, arc.lid))
						+ this.lmScore(s.h2, s.h1, arc.seg.token) + (this.lm ? this.lmWeight * arc.spell : 0) + bonus;
					push(states[arc.end], { score, h2: s.h1, h1: arc.seg.token, rid: arc.rid, seg: arc.seg, prev: s }, beam);
				}
			}
		}
		const finals = states[n]
			.map(s => ({ s, score: s.score - this.costWeight * this.lex.connection(s.rid, 0) + this.lmScore(s.h2, s.h1, EOS) }))
			.sort((a, b) => b.score - a.score);
		const out: JaCandidate[] = [];
		const seen = new Set<string>();
		for (const { s, score } of finals) {
			if (out.length >= (options.nbest ?? 5)) {
				break;
			}
			const segments: JaSegment[] = [];
			for (let t: State | null = s; t && t.seg; t = t.prev) {
				segments.push(t.seg);
			}
			segments.reverse();
			const text = segments.map(g => g.surface).join('');
			if (!seen.has(text)) {
				seen.add(text);
				out.push({ text, segments, score });
			}
		}
		return out;
	}
}

function push(list: State[], state: State, beam: number): void {
	for (let i = 0; i < list.length; i++) {
		const o = list[i];
		if (o.h1 === state.h1 && o.h2 === state.h2 && o.rid === state.rid) {
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
