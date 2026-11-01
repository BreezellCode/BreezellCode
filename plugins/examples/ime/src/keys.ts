/**
 * What a key does to a composition: the same in the system input method (the host), Breezell's
 * chat box and its editor. Picking (Space, digits; zhuyin: Shift+digits), the highlight and its
 * pages, full-width punctuation, the words offered after a commit (聯想), what comes next
 * following the words before, and taking back a commit deleted at once.
 *
 * Each caller only turns its own key events into a Key and puts the result in its text.
 */
import { AsyncComposer, ImeState } from './composers.js';
import { Punctuator } from './punctuation.js';

/** A key as typed. */
export interface Key {
	/** One character ('a', '!', ' ') or a named key: Backspace, Escape, Enter, ArrowUp, ArrowDown, ArrowLeft, ArrowRight, PageUp, PageDown, Tab. */
	readonly key: string;
	readonly shift?: boolean;
	/** Ctrl, Alt or Cmd held: a shortcut, the program's. */
	readonly command?: boolean;
	/** Caps Lock on: letters stay letters. */
	readonly caps?: boolean;
	/** The digit of a digit key (1–9), whatever Shift made of it: zhuyin picks with Shift+digit. */
	readonly digit?: number;
}

export interface KeyResult {
	/** The input method took the key. */
	readonly eaten: boolean;
	/** Text to put in. */
	readonly commit: string;
	/**
	 * After the commit the key itself goes in as typed (a mark that stays as it is): the editor
	 * types it its own way (auto-closing pairs); the others append it.
	 */
	readonly typeKey?: boolean;
}

/** What the candidate panel shows. */
export interface KeyView {
	readonly composing: boolean;
	readonly preedit: string;
	/** The page of candidates, or the words offered after a commit. */
	readonly candidates: readonly string[];
	/** The highlighted one's place on the page, -1 none (the words offered). */
	readonly highlight: number;
	readonly pageStart: number;
	readonly more: boolean;
	readonly prev: boolean;
	readonly reading: string;
	readonly badge: string;
	readonly lang: string;
	/** How the candidates are picked: digits, Shift+digits, or not by a key shown (the words offered after a commit: Tab, or a click). */
	readonly labels: 'digits' | 'shift' | 'none';
	readonly predicting: boolean;
}

export interface KeySessionOptions {
	readonly layout: string;
	readonly traditional: boolean;
	readonly pageSize: number;
	readonly fullWidth: boolean;
	/** Offer the words that may come next after a commit (the caller knows whether they can be shown). */
	readonly prediction: boolean;
	/** English mode: letters are the program's. */
	readonly english: boolean;
}

const COMPOSING_KEYS = new Set(['Backspace', 'Escape', 'Enter', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'PageUp', 'PageDown', 'Tab', ' ']);
const SHIFT_DIGITS = '!@#$%^&*(';

/** 中 · 繁, 中 · 簡, あ, 한: the panel's sign of an input method. */
export function badgeOf(layout: string, traditional: boolean): string {
	if (layout === 'japanese') {
		return 'あ';
	}
	if (layout === 'korean') {
		return '한';
	}
	return `中 · ${layout === 'zhuyin' || (traditional && layout !== 'wubi') ? '繁' : '簡'}`;
}

/** The candidates' language, for the panel's font: zh-TW, zh-CN, ja, ko. */
export function langOf(layout: string, traditional: boolean): string {
	if (layout === 'japanese') {
		return 'ja';
	}
	if (layout === 'korean') {
		return 'ko';
	}
	return layout === 'zhuyin' || (traditional && layout !== 'wubi') ? 'zh-TW' : 'zh-CN';
}

export class KeySession {
	private highlight = 0;
	private last: ImeState = { preedit: '', candidates: [], commit: '' };
	private predicted: string[] = [];
	private readonly punctuator = new Punctuator();
	/** What went in from the input method lately: the context of the next composition when the caller has none. */
	private recent = '';
	/** The last thing done was a commit of ours (deleting now takes it back). */
	private justCommitted = false;
	/**
	 * What the next composition follows: a commit, a Latin run, or nothing (a fresh start). Telling
	 * the composer the same again is skipped (it may be a request to the host per caret move).
	 */
	private after: 'commit' | 'other' | 'fresh' = 'fresh';

	constructor(readonly composer: AsyncComposer, private readonly options: () => KeySessionOptions) { }

	private get o(): KeySessionOptions {
		return this.options();
	}

	private get pageSize(): number {
		return Math.max(3, Math.min(9, this.o.pageSize));
	}

	/** Digits pick in every input method but zhuyin (its digits are keys; Shift+digit picks) and Korean. */
	private get digitsPick(): boolean {
		return this.o.layout !== 'zhuyin' && this.o.layout !== 'korean';
	}

	get composing(): boolean {
		return this.composer.composing;
	}

	get predicting(): boolean {
		return !this.composer.composing && this.predicted.length > 0;
	}

	/**
	 * Tab takes the first of the words offered after a commit. Digits do not: a digit typed after
	 * text is a digit (12 of 你好12), and Shift+digit its mark.
	 */
	private takesOffered(k: Key): boolean {
		return this.predicting && k.key === 'Tab' && !k.shift && !k.command;
	}

	/** Which candidate on the page a key picks: a digit, zhuyin's Shift+digit; -1 none. */
	private pickOnPage(k: Key): number {
		if (this.o.layout === 'zhuyin') {
			if (!k.shift) {
				return -1;
			}
			return k.digit ? k.digit - 1 : SHIFT_DIGITS.indexOf(k.key);
		}
		return this.digitsPick && /^[1-9]$/.test(k.key) ? Number(k.key) - 1 : -1;
	}

	private mark(ch: string): string {
		const o = this.o;
		return o.fullWidth && !o.english ? this.punctuator.mark(ch, o.layout, o.traditional) : ch;
	}

	/** Whether the input method takes the key (without doing it). */
	eats(k: Key): boolean {
		const c = this.composer;
		if (k.command) {
			return false;
		}
		if (this.takesOffered(k)) {
			return true;
		}
		if (c.composing) {
			return COMPOSING_KEYS.has(k.key) || k.key.length === 1;
		}
		if (this.o.english || k.key.length !== 1 || k.caps) {
			return false;
		}
		if (c.takes(k.key, false)) {
			return true;
		}
		// Punctuation that becomes a full-width mark.
		return this.o.fullWidth && this.punctuator.preview(k.key, this.o.layout, this.o.traditional) !== k.key;
	}

	/**
	 * A key the program takes (it was not eaten): the words offered go, and what comes next follows
	 * from it: letters and digits are a Latin run, Backspace right after a commit takes it back
	 * (it was not what the user meant), anything else (punctuation, Enter, the arrows) starts afresh.
	 */
	async passed(k: Key): Promise<void> {
		const modifierOnly = k.key === 'Shift' || k.key === 'Control' || k.key === 'Alt' || k.key === 'Meta' || k.key === 'CapsLock';
		if (modifierOnly) {
			return;
		}
		this.predicted = [];
		const c = this.composer;
		if (c.composing) {
			return;
		}
		if (k.key === 'Backspace' && this.justCommitted) {
			await c.undoLastCommit();
		}
		this.justCommitted = false;
		if (/^[0-9A-Za-z]$/.test(k.key) && !k.command) {
			if (this.after !== 'other') {
				await c.afterOther();
				this.after = 'other';
			}
		} else if (k.key !== ' ' && this.after !== 'fresh') {
			await c.forget();
			this.after = 'fresh';
		}
	}

	/**
	 * The key: what goes in. `context` is the text before the caret (the editor's, the chat's
	 * conversation) when the caller has it; else what went in lately is.
	 */
	async key(k: Key, context?: string): Promise<KeyResult> {
		const c = this.composer;
		if (!this.eats(k)) {
			await this.passed(k);
			return { eaten: false, commit: '' };
		}
		let commit = '';
		let marked = false;
		let typeKey = false;
		const take = () => { const s = c.state(); this.last = s; commit += s.commit; };
		const pickHighlighted = async () => {
			if (this.last.candidates.length) {
				await c.select(Math.min(this.highlight, this.last.candidates.length - 1));
			} else {
				await c.enter();
			}
			this.highlight = 0;
			take();
		};
		// The first word offered after the last commit.
		if (this.takesOffered(k)) {
			await c.takePrediction(0);
			take();
			return this.committed(commit, false);
		}
		this.predicted = [];
		const n = this.last.candidates.length;
		const page = Math.floor(this.highlight / this.pageSize) * this.pageSize;
		if (c.composing) {
			const pick = this.pickOnPage(k);
			switch (k.key) {
				case 'Backspace': await c.backspace(); this.highlight = 0; take(); break;
				case 'Escape': await c.cancel(); take(); break;
				// Korean: the syllable goes in and Enter does what it does (the editor types it).
				case 'Enter': await c.enter(); this.highlight = 0; take(); typeKey = this.o.layout === 'korean'; break;
				case 'ArrowUp': case 'ArrowLeft': this.highlight = Math.max(0, this.highlight - 1); break;
				case 'ArrowDown': case 'ArrowRight': case 'Tab': this.highlight = Math.min(Math.max(0, n - 1), this.highlight + 1); break;
				case 'PageUp': this.highlight = Math.max(0, this.highlight - this.pageSize); break;
				case 'PageDown': this.highlight = Math.min(Math.max(0, n - 1), this.highlight + this.pageSize); break;
				default:
					if (pick >= 0 && n) {
						if (page + pick < n) {
							await c.select(page + pick);
							this.highlight = 0;
							take();
						}
					} else if (k.key === ' ') {
						if (await c.space()) {
							if (this.o.layout === 'korean') {
								take();
								commit += ' ';
							} else {
								await pickHighlighted();
							}
						} else {
							take();  // zhuyin's first tone
						}
					} else if (c.takes(k.key, true)) {
						await c.type(k.key);
						take();
					} else if ((k.key === '-' || k.key === '=') && this.digitsPick && n) {
						this.highlight = k.key === '-' ? Math.max(0, this.highlight - this.pageSize) : Math.min(n - 1, this.highlight + this.pageSize);
					} else if (this.o.layout === 'korean') {
						// Another key: the syllable goes in, then the key as typed.
						await c.space();
						take();
						typeKey = true;
					} else {
						// Another key: the highlighted candidate goes in, then the key's mark.
						await pickHighlighted();
						const mark = this.mark(k.key);
						if (mark === k.key) {
							typeKey = true;
						} else {
							commit += mark;
						}
						marked = true;
					}
			}
		} else if (c.takes(k.key, false)) {
			this.highlight = 0;
			const ctx = context ?? this.recent;
			if (ctx) {
				await c.setContext(ctx);
			}
			await c.type(k.key);
			take();
		} else {
			commit += this.mark(k.key);
			marked = true;
		}
		if (marked) {
			await c.forget();  // punctuation ends the sentence, as in the text the model learned from
			this.after = 'fresh';
		}
		return this.committed(commit, marked, typeKey);
	}

	private async committed(commit: string, marked: boolean, typeKey = false): Promise<KeyResult> {
		const c = this.composer;
		if (commit) {
			this.recent = (this.recent + commit).slice(-300);
			if (!marked) {
				this.after = 'commit';
			}
		}
		this.justCommitted = !!commit && !marked && !c.composing;
		if (commit && !marked && !c.composing && this.o.prediction && !this.o.english) {
			this.predicted = await c.predictions(this.pageSize);
		}
		return { eaten: true, commit, typeKey };
	}

	/** What is being composed goes in as its highlighted candidate (pasted text, a key the editor takes itself). */
	async commitHighlighted(): Promise<string> {
		const c = this.composer;
		if (!c.composing) {
			return '';
		}
		if (this.last.candidates.length) {
			await c.select(Math.min(this.highlight, this.last.candidates.length - 1));
		} else {
			await c.enter();
		}
		this.highlight = 0;
		const s = c.state();
		this.last = s;
		return (await this.committed(s.commit, false)).commit;
	}

	/** A candidate of the page picked with the mouse (or a word offered after a commit). */
	async pick(indexOnPage: number): Promise<string> {
		const c = this.composer;
		if (this.predicting) {
			if (indexOnPage >= 0 && indexOnPage < this.predicted.length) {
				await c.takePrediction(indexOnPage);
				const commit = c.state().commit;
				return (await this.committed(commit, false)).commit;
			}
			return '';
		}
		const i = Math.floor(this.highlight / this.pageSize) * this.pageSize + indexOnPage;
		if (!c.composing || i < 0 || i >= this.last.candidates.length) {
			return '';
		}
		await c.select(i);
		this.highlight = 0;
		const s = c.state();
		this.last = s;
		return (await this.committed(s.commit, false)).commit;
	}

	/** The previous or next page (the panel's ‹ ›). */
	page(delta: -1 | 1): void {
		const n = this.last.candidates.length;
		if (this.composer.composing && n) {
			const to = Math.floor(this.highlight / this.pageSize) * this.pageSize + delta * this.pageSize;
			if (to >= 0 && to < n) {
				this.highlight = to;
			}
		}
	}

	/** The composition goes (focus moved); what comes next starts afresh. */
	async reset(): Promise<void> {
		this.predicted = [];
		this.highlight = 0;
		await this.composer.cancel();
		this.composer.state();
		await this.composer.forget();
		this.after = 'fresh';
		this.last = { preedit: '', candidates: [], commit: '' };
	}

	/** Native ⇄ English: what is being composed goes in as typed (pinyin letters, kana). */
	async flush(): Promise<string> {
		this.predicted = [];
		this.highlight = 0;
		if (!this.composer.composing) {
			return '';
		}
		await this.composer.enter();
		const commit = this.composer.state().commit;
		this.last = { preedit: '', candidates: [], commit: '' };
		return commit;
	}

	/** The words offered go (the caret moved, the text changed). */
	dropPredictions(): void {
		this.predicted = [];
	}

	/** A deletion right after a commit: it was not what the user meant, so it is not learned. */
	async deletedAfterCommit(): Promise<void> {
		if (this.justCommitted) {
			this.justCommitted = false;
			await this.composer.undoLastCommit();
		}
	}

	/** What the panel shows. */
	async view(): Promise<KeyView> {
		const o = this.o;
		const c = this.composer;
		const composing = c.composing;
		const s = this.last;
		const start = Math.floor(this.highlight / this.pageSize) * this.pageSize;
		const predicting = !composing && this.predicted.length > 0;
		return {
			composing,
			preedit: composing ? s.preedit : '',
			candidates: composing ? s.candidates.slice(start, start + this.pageSize) : this.predicted,
			// The first of the words offered is what Tab takes.
			highlight: predicting ? 0 : this.highlight - start,
			pageStart: composing ? start : 0,
			more: composing && s.candidates.length > start + this.pageSize,
			prev: composing && start > 0,
			reading: composing ? ((await c.reading(this.highlight)) || s.preedit) : predicting ? `${o.layout === 'zhuyin' || o.traditional ? '聯想' : '联想'}  Tab ⇥` : '',
			badge: badgeOf(o.layout, o.traditional),
			lang: langOf(o.layout, o.traditional),
			labels: predicting ? 'none' : o.layout === 'zhuyin' ? 'shift' : 'digits',
			predicting,
		};
	}
}
