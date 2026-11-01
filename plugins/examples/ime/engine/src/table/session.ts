/**
 * Typing with a code table (Wubi, Cangjie…): the code typed so far, its candidates, commits.
 *
 * - Fixed order (the default): candidates come in the table's order, every time: Wubi typists
 *   know where a word sits under its code and press its key without looking.
 * - Smart order (an option): the rows of the typed code are ranked by the language model after
 *   the text committed before them and by what the user picked, so the 重碼 that fits the
 *   sentence comes first. The table's first keeps its place unless another fits clearly better
 *   (the margin), so positions stay mostly where the hands expect them.
 *
 * As Rime's table translator with jidian's settings: the code is at most maxCode keys; a full
 * code with a single candidate commits it (auto select); a key past a full code commits its
 * first candidate and starts the next code; candidates whose code continues the input follow
 * the exact ones (completion).
 */
import { AdaptiveModel } from '../core/adaptive.js';
import { BOS, NgramModel, UNK } from '../core/lm.js';
import { CodeTable } from './table.js';

export interface TableOptions {
	readonly maxCode?: number;
	readonly autoSelect?: boolean;
	readonly completion?: boolean;
	readonly smart?: boolean;
	/** Smart order: how much better (ln) another row must fit to go before the table's first. */
	readonly margin?: number;
	/** Smart order: weight of the table's own weights next to the model. */
	readonly tableWeight?: number;
	/** Most completions listed. */
	readonly maxCompletions?: number;
}

export interface TableCandidate {
	readonly text: string;
	readonly code: string;
	readonly row: number;
	/** The row's code is the code typed (not a completion). */
	readonly exact: boolean;
}

export interface TableState {
	readonly commit: string;
	readonly preedit: string;
	readonly candidates: readonly TableCandidate[];
}

export class TableSession {
	private input = '';
	private candidates: TableCandidate[] = [];
	private committed = '';
	private h2 = BOS;
	private h1 = BOS;
	private readonly keys: Set<string>;
	private readonly o: Required<TableOptions>;

	constructor(
		private readonly table: CodeTable,
		private readonly lm?: NgramModel,
		readonly adaptive?: AdaptiveModel,
		options: TableOptions = {},
		/** The letters codes are made of. */
		alphabet = 'abcdefghijklmnopqrstuvwxy',
	) {
		this.keys = new Set(alphabet);
		this.o = {
			maxCode: options.maxCode ?? 4,
			autoSelect: options.autoSelect ?? true,
			completion: options.completion ?? true,
			smart: options.smart ?? false,
			margin: options.margin ?? 1.0,
			tableWeight: options.tableWeight ?? 3.0,
			maxCompletions: options.maxCompletions ?? 60,
		};
	}

	state(): TableState {
		const commit = this.committed;
		this.committed = '';
		return { commit, preedit: this.input, candidates: this.candidates };
	}

	type(keys: string): void {
		for (const k of keys.toLowerCase()) {
			if (!this.keys.has(k)) {
				continue;
			}
			if (this.input.length >= this.o.maxCode) {
				// A key past a full code: the code's first candidate goes, the key starts the next.
				this.select(0);
				this.input = '';
			}
			this.input += k;
			this.refresh();
			if (this.o.autoSelect && this.input.length === this.o.maxCode && this.candidates.length === 1) {
				this.select(0);
			}
		}
	}

	backspace(): void {
		this.input = this.input.slice(0, -1);
		this.refresh();
	}

	/** Drops the code being typed (what was committed before stays the model's history). */
	clearInput(): void {
		this.input = '';
		this.candidates = [];
	}

	/** Drops everything: the code and the history (a new text). */
	clear(): void {
		this.clearInput();
		this.h2 = this.h1 = BOS;
	}

	select(index: number): void {
		const c = this.candidates[index];
		if (!c) {
			return;
		}
		this.committed += c.text;
		const tokens = this.table.tokens(c.row);
		for (let i = 0; i < tokens.length; i++) {
			this.h2 = this.h1;
			this.h1 = tokens[i];
		}
		if (this.adaptive) {
			this.adaptive.learnPick(c.text);
			this.adaptive.learnTokens(Array.from(tokens));
		}
		this.input = '';
		this.candidates = [];
	}

	private score(row: number): number {
		let s = this.o.tableWeight * this.table.weight(row);
		if (this.lm) {
			let h2 = this.h2, h1 = this.h1;
			const tokens = this.table.tokens(row);
			for (let i = 0; i < tokens.length; i++) {
				const t = tokens[i];
				const base = this.lm.logProb(h2, h1, t) + (t === UNK ? -11 : 0);
				s += this.adaptive ? base + this.adaptive.adjust(h2, h1, t, base, this.lm.unigram(t)) : base;
				h2 = h1;
				h1 = t;
			}
		}
		if (this.adaptive) {
			s += this.adaptive.bonus(this.table.text(row));
		}
		return s;
	}

	private refresh(): void {
		this.candidates = [];
		if (!this.input) {
			return;
		}
		const [lo, hi] = this.table.exact(this.input);
		let exact: number[] = [];
		for (let r = lo; r < hi; r++) {
			exact.push(r);
		}
		if (this.o.smart && exact.length > 1) {
			const scored = exact.map(r => ({ r, s: this.score(r) }));
			const first = scored[0];
			scored.sort((a, b) => b.s - a.s);
			// The table's first stays first unless the best fits clearly better.
			if (scored[0] !== first && scored[0].s - first.s < this.o.margin) {
				scored.splice(scored.indexOf(first), 1);
				scored.unshift(first);
			}
			exact = scored.map(x => x.r);
		}
		const seen = new Set<string>();
		for (const r of exact) {
			const text = this.table.text(r);
			if (!seen.has(text)) {
				seen.add(text);
				this.candidates.push({ text, code: this.input, row: r, exact: true });
			}
		}
		if (this.o.completion && this.input.length < this.o.maxCode) {
			const [plo, phi] = this.table.prefix(this.input);
			const more: number[] = [];
			for (let r = plo; r < phi; r++) {
				if (r < lo || r >= hi) {
					more.push(r);
				}
			}
			// Shorter codes first (the next key away), then the table's order.
			more.sort((a, b) => (this.table.codeLength(a) - this.table.codeLength(b)) || (this.table.weight(b) - this.table.weight(a)) || a - b);
			for (const r of more.slice(0, this.o.maxCompletions * 2)) {
				const text = this.table.text(r);
				if (!seen.has(text) && this.candidates.length < exact.length + this.o.maxCompletions) {
					seen.add(text);
					this.candidates.push({ text, code: this.table.code(r), row: r, exact: false });
				}
			}
		}
	}
}
