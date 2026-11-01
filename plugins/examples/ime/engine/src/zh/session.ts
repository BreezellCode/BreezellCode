/**
 * One composition in a pinyin (or zhuyin, double pinyin…) layout: the typed input, the pieces
 * already picked, and the candidates for the rest. Picking a candidate that covers only the start
 * of the input keeps the rest open, with the picked words as the language model's history.
 */
import { BOS, OTHER } from '../core/lm.js';
import { ZhCandidate, ZhDecoder } from './decoder.js';
import { ScriptConverter } from './script.js';

export interface ZhSessionOptions {
	/** Converts what is shown and committed (Simplified → Traditional for Taiwan). */
	readonly script?: ScriptConverter;
	/** Folds the context back to the lexicon's script (Traditional → Simplified). */
	readonly fold?: ScriptConverter;
	/**
	 * How many whole-sentence readings come before the words (the rest come after them; 3 by
	 * default: the right sentence is among the first three far more often than first), and how
	 * much lower (ln) than the best a second or third one may score to be among them.
	 */
	readonly leadingSentences?: number;
	readonly sentenceGap?: number;
}

export interface ZhSessionState {
	/** Text committed by the last action (the whole composition was picked). */
	readonly commit: string;
	/** Picked text, then the input still open. */
	readonly preedit: string;
	readonly candidates: readonly ZhCandidate[];
	/** How many whole-sentence readings come first in the candidates (the words follow them). */
	readonly lead: number;
}

/** Told about every finished composition: the entries picked, in order, with the lexicon's text; `previous` is the word before it. */
export type LearnListener = (pieces: readonly { entries: readonly number[]; text: string }[], previous?: number, chosen?: boolean) => void;

export class ZhSession {
	private input = '';
	/** Picked pieces: the lexicon's text (learning) and what was shown (preedit, commit). */
	private picked: { entries: readonly number[]; text: string; shown: string; end: number; first: boolean }[] = [];
	private history: [number, number] = [BOS, BOS];
	private candidates: ZhCandidate[] = [];
	private lead = 0;
	private lastCommit = '';
	/**
	 * The model's history where the next composition starts: the words just committed, so a sentence
	 * typed in pieces reads as one (需要 then zuo: 做, not 左). Null: the start of a sentence.
	 */
	private carry: [number, number] | null = null;
	/** The last word committed and the history before it (the input may close it: 做 + 的). */
	private carryJoin: { entry: number; h2: number; h1: number } | null = null;
	/** The last commit, so it can be taken back (unlearned) when the user deletes it at once. */
	private lastLearned: { pieces: { entries: readonly number[]; text: string }[]; previous: number; weight: number } | null = null;

	constructor(
		private readonly decoder: ZhDecoder,
		private readonly onLearn: LearnListener = (pieces, previous, chosen) => learnFrom(decoder, pieces, previous, chosen),
		/** Tokens of the text before the cursor, so the first word fits what precedes it. */
		private readonly contextHistory: () => [number, number] = () => [BOS, BOS],
		private readonly options: ZhSessionOptions = {},
	) { }

	/** What comes next starts a sentence: after punctuation, when the caret moved or the text changed. */
	forget(): void {
		this.carry = null;
		this.carryJoin = null;
		this.lastLearned = null;
	}

	/** The last of `entries` and the model's history just before it (from `start`). */
	private joinAfter(entries: readonly number[], start: [number, number]): { entry: number; h2: number; h1: number } | undefined {
		if (!entries.length) {
			return undefined;
		}
		let [h2, h1] = start;
		for (let i = 0; i < entries.length - 1; i++) {
			const toks = this.decoder.tokens(entries[i]);
			for (let k = 0; k < toks.length; k++) {
				h2 = h1;
				h1 = toks[k];
			}
		}
		return { entry: entries[entries.length - 1], h2, h1 };
	}

	/** The user deleted what was just committed: it was not what they meant, so it is not learned. */
	undoLastCommit(): void {
		const last = this.lastLearned;
		const adaptive = this.decoder.adaptive;
		this.lastLearned = null;
		this.carry = null;
		this.carryJoin = null;
		if (!last || !adaptive) {
			return;
		}
		let previous = last.previous;
		for (const p of last.pieces) {
			const tokens: number[] = [];
			for (const e of p.entries) {
				tokens.push(...Array.from(this.decoder.tokens(e)));
			}
			adaptive.unlearn(p.text, tokens, previous, last.weight);
			previous = tokens[tokens.length - 1] ?? previous;
		}
	}

	/** Letters or digits went in past the input method: the model's <x> follows the words before. */
	afterOther(): void {
		const [, h1] = this.startHistory();
		this.carry = [h1, OTHER];
		this.carryJoin = null;
	}

	private startHistory(): [number, number] {
		return this.carry ?? this.contextHistory();
	}

	/** The text around the cursor (editor, chat), for the words it holds. */
	setContext(text: string): void {
		this.decoder.adaptive?.setContext(this.options.fold ? this.options.fold.convert(text) : text);
	}

	private get consumed(): number {
		return this.picked.length ? this.picked[this.picked.length - 1].end : 0;
	}

	private refresh(): void {
		const rest = this.input.slice(this.consumed);
		if (!rest) {
			this.candidates = [];
			this.lead = 0;
			return;
		}
		const join = this.picked.length ? this.joinAfter(this.picked.flatMap(p => p.entries), this.startHistory()) : this.carryJoin ?? undefined;
		const { sentences, words } = this.decoder.decode(rest, { history: this.picked.length ? this.history : this.startHistory(), join });
		const seen = new Set<string>();
		const list: ZhCandidate[] = [];
		const add = (c: ZhCandidate) => {
			if (!seen.has(c.text)) {
				seen.add(c.text);
				list.push(c);
			}
		};
		const script = this.options.script;
		const gap = this.options.sentenceGap ?? Infinity;
		let lead = 1;
		while (lead < Math.min(this.options.leadingSentences ?? 3, sentences.length) && sentences[0].score - sentences[lead].score <= gap) {
			lead++;
		}
		this.lead = lead;
		for (const c of [...sentences.slice(0, lead), ...words, ...sentences.slice(lead)]) {
			if (!script) {
				add(c);
				continue;
			}
			add({ ...c, text: script.convert(c.text), base: c.text });
			// One character may stand for several (发: 發 髮): each is offered after the first.
			if (!c.sentence && c.text.length === 1) {
				for (const form of script.alternatives(c.text).slice(1)) {
					add({ ...c, text: form, base: c.text });
				}
			}
		}
		this.candidates = list;
	}

	state(): ZhSessionState {
		const commit = this.lastCommit;
		this.lastCommit = '';
		return { commit, preedit: this.picked.map(p => p.shown).join('') + this.input.slice(this.consumed), candidates: this.candidates, lead: this.candidates.length ? Math.min(this.lead, this.candidates.length) : 0 };
	}

	/**
	 * Words that may come next, after what was just committed (none at the start of a sentence:
	 * after punctuation, a moved caret, or before anything was typed), in the output's script.
	 */
	predictions(count: number): { text: string; base: string; token: number }[] {
		if (this.input || !this.carry) {
			return [];
		}
		const [h2, h1] = this.carry;
		const script = this.options.script;
		const seen = new Set<string>();
		const out: { text: string; base: string; token: number }[] = [];
		for (const p of this.decoder.predict(h2, h1, count * 2)) {
			const text = script ? script.convert(p.text) : p.text;
			if (!seen.has(text)) {
				seen.add(text);
				out.push({ text, base: p.text, token: p.token });
			}
		}
		return out.slice(0, count);
	}

	/** A prediction was taken: it is learned, and what comes next follows it. */
	takePrediction(p: { base: string; token: number }): void {
		if (!this.carry) {
			return;
		}
		const h1 = this.carry[1];
		this.decoder.adaptive?.learnTokens([p.token], h1);
		this.decoder.adaptive?.learnPick(p.base);
		this.carry = [h1, p.token];
		this.carryJoin = null;
		this.lastLearned = null;
	}

	/**
	 * How candidate `index` reads: the text already picked, the syllables of its words (after any
	 * slip was fixed: jain read as jian) and the keys past it, still open.
	 */
	reading(index: number): { picked: string; syllables: number[]; after: string } {
		const picked = this.picked.map(p => p.shown).join('');
		const rest = this.input.slice(this.consumed);
		const c = this.candidates[index];
		if (!c) {
			return { picked, syllables: [], after: rest };
		}
		const syllables: number[] = [];
		for (const e of c.entries) {
			syllables.push(...Array.from(this.decoder.syllables(e)));
		}
		return { picked, syllables, after: rest.slice(c.end).replace(/^'+/, '') };
	}

	type(keys: string): void {
		this.input += this.decoder.speller.accept(keys);
		this.refresh();
	}

	backspace(): void {
		if (this.input.length > this.consumed) {
			this.input = this.input.slice(0, -1);
		} else if (this.picked.length) {
			this.picked.pop();
			this.recomputeHistory();
		}
		this.refresh();
	}

	clear(): void {
		this.input = '';
		this.picked = [];
		this.history = [BOS, BOS];
		this.candidates = [];
	}

	/** Picks candidate `index`; commits when nothing of the input is left. */
	select(index: number): void {
		const c = this.candidates[index];
		if (!c) {
			return;
		}
		this.picked.push({ entries: c.entries, text: c.base ?? c.text, shown: c.text, end: this.consumed + c.end, first: index === 0 });
		this.recomputeHistory();
		if (this.consumed >= this.input.length) {
			this.lastCommit = this.picked.map(p => p.shown).join('');
			const pieces = this.picked.map(p => ({ entries: p.entries, text: p.text }));
			const previous = this.startHistory()[1];
			this.carryJoin = this.joinAfter(this.picked.flatMap(p => p.entries), this.startHistory()) ?? null;
			// Taken as offered (every piece the first candidate) or chosen: the user's own choice
			// teaches more than accepting what the model already put first.
			const chosen = this.picked.some(p => !p.first);
			this.onLearn(pieces, previous, chosen);
			this.lastLearned = { pieces, previous, weight: chosen ? 1 : DEFAULT_LEARN };
			// The next composition goes on from these words.
			this.carry = this.history;
			this.input = '';
			this.picked = [];
			this.history = [BOS, BOS];
			this.candidates = [];
			return;
		}
		this.refresh();
	}

	private recomputeHistory(): void {
		let [h2, h1] = this.startHistory();
		for (const p of this.picked) {
			for (const e of p.entries) {
				const toks = this.decoder.tokens(e);
				for (let i = 0; i < toks.length; i++) {
					h2 = h1;
					h1 = toks[i];
				}
			}
		}
		this.history = [h2, h1];
	}
}

/**
 * What a finished composition teaches the user model: its tokens in order, each piece picked,
 * and — when it was picked in pieces with a single character among them (a name, a term the
 * lexicon lacks) — the whole as a new word with its syllables.
 */
/** How much a commit taken as offered teaches, against one the user chose (BZ_DEFAULT_LEARN, tuning). */
const DEFAULT_LEARN = Number((typeof process !== 'undefined' && process.env?.BZ_DEFAULT_LEARN) || 0.5);

export function learnFrom(decoder: ZhDecoder, pieces: readonly { entries: readonly number[]; text: string }[], previous = -1, chosen = true): void {
	const adaptive = decoder.adaptive;
	if (!adaptive) {
		return;
	}
	const tokens: number[] = [];
	const syllables: number[] = [];
	for (const p of pieces) {
		for (const e of p.entries) {
			tokens.push(...Array.from(decoder.tokens(e)));
			syllables.push(...Array.from(decoder.syllables(e)));
		}
		adaptive.learnPick(p.text);
	}
	adaptive.learnTokens(tokens, previous, chosen ? 1 : DEFAULT_LEARN);
	const text = pieces.map(p => p.text).join('');
	if (pieces.length >= 2 && text.length <= 8 && pieces.some(p => p.text.length === 1)) {
		adaptive.learnWord(text, syllables, tokens);
	}
}
