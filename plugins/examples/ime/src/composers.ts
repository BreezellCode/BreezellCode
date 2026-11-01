/**
 * One composer per input method, all behind the same small interface the editor side drives:
 * keys in, the text being composed and its candidates out, and what got committed.
 */
import {
	AdaptiveModel, BOS, combineLexicons, DACHEN, doublePinyin, PINYIN, HangulComposer, JaConverter, keysOf, loadCodeTable, loadJaLexicon, loadNgramModel,
	loadToneTable, loadZhLexicon, NgramModel, PrefixPredictor, RomajiComposer, RomajiTable, ScriptConverter, syllableOf, TableSession, TONES, UNK, ZhDecoder,
	ZhCandidate, ZhLexicon, ZhSession, ZHUYIN, zhuyinOf,
} from '../engine/src/index.js';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export interface ImeState {
	/** What is being composed, as shown under the cursor. */
	readonly preedit: string;
	readonly candidates: readonly string[];
	/** Text to put in the document now. */
	readonly commit: string;
}

export interface Composer {
	/** Whether the key goes to the composer (it may start a composition). */
	takes(key: string, composing: boolean): boolean;
	type(key: string): void;
	/** Space while composing: false when the composer took it itself (zhuyin's first tone). */
	space(): boolean;
	backspace(): boolean;
	select(index: number): void;
	/** Enter: what to commit as typed (pinyin letters, kana). */
	enter(): void;
	cancel(): void;
	readonly composing: boolean;
	/** Takes the state (and its commit). */
	state(): ImeState;
	/** The text before the cursor, for the words it holds. */
	setContext(text: string): void;
	/** What comes next starts a sentence (punctuation went in, the caret moved, the text changed). */
	forget?(): void;
	/** Letters or digits went in past the input method. */
	afterOther?(): void;
	/** What was just committed got deleted at once: it was a wrong choice, not something to learn. */
	undoLastCommit?(): void;
	/** Saves what the composer learned. */
	snapshot?(): unknown;
	/** The top line of the candidate panel when candidate `index` is highlighted (its reading); the preedit when absent. */
	reading?(index: number): string;
	/** Words that may come next, after what was just committed (聯想); [] when none. */
	predictions?(count: number): string[];
	/** Takes the prediction `index` of the last predictions(): it is committed (state().commit). */
	takePrediction?(index: number): void;
}

/**
 * Whether a key goes to the input method of `layout` (it may start a composition): the same rule
 * as each composer's own, without its models (a composer running in the system input method's
 * host answers the rest).
 */
export function keyRule(layout: string): (key: string, composing: boolean) => boolean {
	if (layout === 'zhuyin') {
		return (key, composing) => DACHEN[key] !== undefined || (composing && TONES[key] !== undefined && key !== ' ');
	}
	if (layout === 'wubi') {
		return key => key >= 'a' && key <= 'y';
	}
	if (layout === 'japanese') {
		return (key, composing) => (key >= 'a' && key <= 'z') || (composing && (key === '-' || key === '\''));
	}
	if (layout === 'korean') {
		return key => /^[a-zA-Z]$/.test(key);
	}
	const speller = layout === 'pinyin' ? PINYIN : doublePinyin(layout);
	// Letters start a syllable; the scheme's other keys (an apostrophe, ;) only continue one.
	return (key, composing) => speller.accept(key) === key && ((key >= 'a' && key <= 'z') || composing);
}

/** A file's bytes as they were read (a view, not a copy: the models are hundreds of MB). */
const read = (dir: string, name: string) => {
	const b = readFileSync(join(dir, name));
	return new Uint8Array(b.buffer, b.byteOffset, b.byteLength);
};
const text = (dir: string, name: string) => readFileSync(join(dir, name), 'utf8');

/** The Chinese models, loaded once and shared by pinyin, zhuyin, double pinyin and Wubi. */
export class ChineseData {
	private lmCache?: NgramModel;
	private lexCache?: ZhLexicon;
	private wubiCache?: ReturnType<typeof loadCodeTable>;
	get wubi() { return this.wubiCache ??= loadCodeTable(read(this.dir, 'wubi86.bztb')); }
	private twCache?: { lex: ZhLexicon; tones: ReturnType<typeof loadToneTable>; s2tw: ScriptConverter; t2s: ScriptConverter };
	constructor(readonly dir: string) { }
	get lm(): NgramModel { return this.lmCache ??= loadNgramModel(read(this.dir, 'zh.bzlm')); }
	private englishCache?: Map<string, number> | null;
	/** English words offered among Chinese candidates, with their counts (en-words.tsv: tools/build_en_words.mjs); none without the file. */
	get english(): Map<string, number> | undefined {
		if (this.englishCache === undefined) {
			try {
				this.englishCache = new Map(text(this.dir, 'en-words.tsv').split('\n').filter(Boolean).map(l => {
					const [w, n] = l.split('\t');
					return [w, Number(n) || 0];
				}));
			} catch {
				this.englishCache = null;
			}
		}
		return this.englishCache ?? undefined;
	}
	get lex(): ZhLexicon { return this.lexCache ??= loadZhLexicon(read(this.dir, 'zh.bzlx')); }
	get tw() {
		return this.twCache ??= {
			lex: combineLexicons([this.lex, loadZhLexicon(read(this.dir, 'zh-tw.bzlx'))]),
			tones: loadToneTable(text(this.dir, 'zh-tones.tsv')),
			s2tw: new ScriptConverter(text(this.dir, 'zh-s2tw.txt')),
			t2s: new ScriptConverter(text(this.dir, 'zh-t2s.txt')),
		};
	}
}

/** Seen this many times in the English model's text: common enough to come before Chinese readings. */
const COMMON_ENGLISH = 100;

/** Pinyin, zhuyin and double pinyin: one decoder over the shared lexicon and model. */
export class ChineseComposer implements Composer {
	private readonly session: ZhSession;
	/** The last state: preedit as the session gives it (the open part as typed keys). */
	private last: { preedit: string; candidates: string[] } = { preedit: '', candidates: [] };
	private pendingCommit = '';
	/** The English word among the candidates (hello typed in pinyin), and where. */
	private english?: { index: number; text: string };
	/** Latin words of the context (the code or the conversation around the caret), by their lowercase. */
	private contextWords = new Map<string, string>();
	/** The last commit was an English word: no Chinese words follow it (聯想). */
	private afterEnglish = false;

	constructor(private readonly data: ChineseData, readonly layout: string, traditional: boolean, readonly adaptive: AdaptiveModel, private readonly mixEnglish = true) {
		const zhuyin = layout === 'zhuyin';
		const speller = zhuyin ? ZHUYIN : layout === 'pinyin' ? undefined : doublePinyin(layout);
		const tw = traditional || zhuyin ? data.tw : undefined;
		const decoder = new ZhDecoder(tw ? tw.lex : data.lex, data.lm, adaptive, zhuyin ? { speller: ZHUYIN, tones: tw!.tones } : speller ? { speller } : {});
		this.session = new ZhSession(decoder, undefined, undefined, tw ? { script: tw.s2tw, fold: tw.t2s } : {});
	}

	get composing(): boolean {
		return this.last.preedit.length > 0;
	}

	private rule?: (key: string, composing: boolean) => boolean;

	takes(key: string, composing: boolean): boolean {
		return (this.rule ??= keyRule(this.layout))(key, composing);
	}

	private refresh(): void {
		const s = this.session.state();
		this.pendingCommit += s.commit;
		const candidates = s.candidates.map(c => c.text);
		this.english = this.englishFor(s.preedit, s.candidates, s.lead);
		if (this.english) {
			candidates.splice(this.english.index, 0, this.english.text);
		}
		this.last = { preedit: s.preedit, candidates };
	}

	/**
	 * The English word the letters typed are (hello, github; a word of the context as written there:
	 * useState), and where it goes: first when the letters are no clean pinyin (hello is he l lo, an
	 * initial alone) and the word is common or the context's, else after the whole-sentence readings
	 * (men, can: 們, 參 first; jai, a name, is most likely pinyin being typed).
	 */
	private englishFor(preedit: string, cands: readonly ZhCandidate[], lead: number): { index: number; text: string } | undefined {
		// Pinyin and double pinyin, the whole input still open (nothing picked: no Chinese in the preedit).
		if (!this.mixEnglish || this.layout === 'zhuyin' || !/^[a-z']{2,}$/.test(preedit)) {
			return undefined;
		}
		const word = preedit.replace(/'/g, '');
		const fromContext = this.contextWords.get(word);
		const count = this.data.english?.get(word) ?? 0;
		const text = fromContext ?? (count ? word : undefined);
		if (!text) {
			return undefined;
		}
		// First: the letters are no clean pinyin, and the word is the context's, or common while the
		// best Chinese reading needs no slip fixed (jai read as 嗨 is pinyin typed wrong, not a name).
		const top = cands[0];
		const first = !(top?.sentence && top.exact) && (!!fromContext || (count >= COMMON_ENGLISH && !top?.slip));
		// Not first: after the whole-sentence readings, and after the first candidate at least.
		return { index: first ? 0 : Math.max(lead, Math.min(1, cands.length)), text };
	}

	type(key: string): void {
		this.afterEnglish = false;
		this.session.type(key);
		this.refresh();
	}

	space(): boolean {
		// Zhuyin: Space right after a zhuyin symbol is the first tone; after a tone it picks.
		const p = this.last.preedit;
		if (this.layout === 'zhuyin' && p && DACHEN[p[p.length - 1]] !== undefined) {
			this.type(' ');
			return false;
		}
		return true;
	}

	backspace(): boolean {
		if (!this.composing) {
			return false;
		}
		this.session.backspace();
		this.refresh();
		return true;
	}

	select(index: number): void {
		const e = this.english;
		if (e && index === e.index) {
			// The English word: the input is spent, and the model reads it as a Latin run (<x>).
			this.pendingCommit += e.text;
			this.session.clear();
			this.session.afterOther();
			this.afterEnglish = true;
			this.english = undefined;
			this.last = { preedit: '', candidates: [] };
			return;
		}
		this.session.select(e && index > e.index ? index - 1 : index);
		this.refresh();
	}

	enter(): void {
		if (this.layout === 'zhuyin') {
			if (this.last.candidates.length) {
				this.select(0);
			}
			return;
		}
		this.pendingCommit += this.last.preedit;
		this.cancel();
	}

	cancel(): void {
		this.session.clear();
		this.last = { preedit: '', candidates: [] };
	}

	state(): ImeState {
		const commit = this.pendingCommit;
		this.pendingCommit = '';
		const preedit = this.layout === 'zhuyin' ? this.last.preedit.replace(/[\x20-\x7e]/g, k => DACHEN[k] ?? (TONES[k] ? TONES[k] : k)) : this.last.preedit;
		return { preedit, candidates: this.last.candidates, commit };
	}

	setContext(text: string): void {
		this.session.setContext(text);
		// Its Latin words as written (useState, GitHub); a capital that only starts a sentence goes.
		this.contextWords = new Map();
		for (const m of text.matchAll(/[A-Za-z]{2,}/g)) {
			const w = m[0], lower = w.toLowerCase();
			const plain = w.slice(1) === lower.slice(1) && !!this.data.english?.has(lower);
			this.contextWords.set(lower, plain ? lower : w);
		}
	}

	forget(): void {
		this.session.forget();
	}

	afterOther(): void {
		this.session.afterOther();
	}

	undoLastCommit(): void {
		this.session.undoLastCommit();
	}

	private predicted: { text: string; base: string; token: number }[] = [];

	predictions(count: number): string[] {
		this.predicted = this.afterEnglish ? [] : this.session.predictions(count);
		return this.predicted.map(p => p.text);
	}

	takePrediction(index: number): void {
		const p = this.predicted[index];
		if (p) {
			this.session.takePrediction(p);
			this.pendingCommit += p.text;
		}
		this.predicted = [];
	}

	/** Pinyin (double pinyin too: the full spelling), or zhuyin symbols, syllable by syllable: hen jian dan. */
	reading(index: number): string {
		const e = this.english;
		if (e && index === e.index) {
			return e.text;
		}
		const r = this.session.reading(e && index > e.index ? index - 1 : index);
		const zhuyin = this.layout === 'zhuyin';
		const spelled = r.syllables.map(s => zhuyin ? zhuyinOf(syllableOf(s)) : syllableOf(s));
		const after = zhuyin ? r.after.replace(/[\x20-\x7e]/g, k => DACHEN[k] ?? (TONES[k] ? TONES[k] : k)) : r.after;
		return [r.picked, spelled.join(' '), after].filter(Boolean).join(' ');
	}
}

/** Wubi 86: the code table, fixed order or the model's. */
export class WubiComposer implements Composer {
	private readonly session: TableSession;
	private last: ImeState = { preedit: '', candidates: [], commit: '' };
	private pendingCommit = '';

	constructor(data: ChineseData, smart: boolean, adaptive: AdaptiveModel) {
		this.session = new TableSession(data.wubi, smart ? data.lm : undefined, smart ? adaptive : undefined, { smart });
	}

	get composing(): boolean {
		return this.last.preedit.length > 0;
	}

	private readonly rule = keyRule('wubi');

	takes(key: string, composing: boolean): boolean {
		return this.rule(key, composing);
	}

	private refresh(): void {
		const s = this.session.state();
		this.pendingCommit += s.commit;
		this.last = { preedit: s.preedit, candidates: s.candidates.map(c => c.text), commit: '' };
	}

	type(key: string): void { this.session.type(key); this.refresh(); }
	space(): boolean { return true; }
	backspace(): boolean {
		if (!this.composing) {
			return false;
		}
		this.session.backspace();
		this.refresh();
		return true;
	}
	select(index: number): void { this.session.select(index); this.refresh(); }
	enter(): void { this.pendingCommit += this.last.preedit; this.cancel(); }
	cancel(): void { this.session.clearInput(); this.last = { preedit: '', candidates: [], commit: '' }; }
	forget(): void { this.session.clear(); this.last = { preedit: '', candidates: [], commit: '' }; }
	state(): ImeState {
		const commit = this.pendingCommit;
		this.pendingCommit = '';
		return { ...this.last, commit };
	}
	setContext(): void { /* the model's history is what was committed */ }
}

/** The Japanese models, loaded once. */
export class JapaneseData {
	readonly lex: ReturnType<typeof loadJaLexicon>;
	readonly lm: NgramModel;
	readonly table: RomajiTable;
	constructor(dir: string) {
		this.lex = loadJaLexicon(read(dir, 'ja.bzja'));
		this.lm = loadNgramModel(read(dir, 'ja.bzlm'));
		this.table = new RomajiTable(text(dir, 'romanji-hiragana.tsv'));
	}
}

/** Japanese: romaji to kana, kana to the best conversions. */
export class JapaneseComposer implements Composer {
	private readonly converter: JaConverter;
	private readonly romaji: RomajiComposer;
	private candidates: { text: string; tokens: number[] }[] = [];
	private pendingCommit = '';
	private history: [number, number] = [BOS, BOS];

	constructor(data: JapaneseData, readonly adaptive: AdaptiveModel) {
		this.converter = new JaConverter(data.lex, data.lm, adaptive);
		this.romaji = new RomajiComposer(data.table);
	}

	get composing(): boolean {
		return this.romaji.text.length > 0;
	}

	private readonly rule = keyRule('japanese');

	takes(key: string, composing: boolean): boolean {
		return this.rule(key, composing);
	}

	private refresh(): void {
		const kana = this.romaji.converted;
		this.candidates = kana ? this.converter.convert(kana, { nbest: 9, history: this.history }).map(c => ({ text: c.text, tokens: c.segments.map(s => s.token) })) : [];
	}

	type(key: string): void { this.romaji.type(key); this.refresh(); }
	space(): boolean { return true; }
	backspace(): boolean {
		if (!this.composing) {
			return false;
		}
		this.romaji.backspace();
		this.refresh();
		return true;
	}
	select(index: number): void {
		const c = this.candidates[index];
		if (!c) {
			return;
		}
		// What waits (an "n", a "k") stays as the start of what comes next.
		const waiting = this.romaji.waiting;
		this.pendingCommit += c.text;
		this.adaptive.learnPick(c.text);
		this.adaptive.learnTokens(c.tokens);
		const t = c.tokens;
		this.history = [t.length > 1 ? t[t.length - 2] : this.history[1], t[t.length - 1] ?? this.history[1]];
		this.romaji.clear();
		if (waiting) {
			this.romaji.type(waiting);
		}
		this.refresh();
	}
	enter(): void { this.pendingCommit += this.romaji.flush(); this.cancel(); }
	cancel(): void { this.romaji.clear(); this.candidates = []; }
	forget(): void { this.history = [BOS, BOS]; }
	state(): ImeState {
		const commit = this.pendingCommit;
		this.pendingCommit = '';
		return { preedit: this.romaji.text, candidates: this.candidates.map(c => c.text), commit };
	}
	setContext(): void { /* not yet */ }
}

/** The Korean model and vocabulary, loaded once. */
export class KoreanData {
	readonly predictor: PrefixPredictor;
	readonly ids: Map<string, number>;
	constructor(dir: string) {
		const words = text(dir, 'ko.vocab').split('\n');
		let last = 4;
		while (last < words.length && /^[가-힣]+$/.test(words[last])) {
			last++;
		}
		const keys = words.map((w, i) => i >= 4 && i < last ? keysOf(w) : '');
		this.predictor = new PrefixPredictor(words, keys, loadNgramModel(read(dir, 'ko.bzlm')), 4, last);
		this.ids = new Map(words.map((w, i) => [w, i]));
	}
}

/** Korean: 2-set composition, the words a prefix can become offered after it. */
export class KoreanComposer implements Composer {
	private readonly composer = new HangulComposer();
	private readonly predictor: PrefixPredictor;
	private readonly ids: Map<string, number>;
	private pendingCommit = '';
	/** The word before the cursor, as the document holds it (set by the editor side). */
	wordBefore = '';
	previousWords: string[] = [];

	constructor(data: KoreanData) {
		this.predictor = data.predictor;
		this.ids = data.ids;
	}

	get composing(): boolean {
		return !this.composer.empty;
	}

	private readonly rule = keyRule('korean');

	takes(key: string, composing: boolean): boolean {
		return this.rule(key, composing);
	}

	type(key: string): void {
		this.composer.key(key);
		this.pendingCommit += this.composer.takeCommit();
	}
	space(): boolean { this.flush(); return true; }
	private flush(): void {
		this.composer.flush();
		this.pendingCommit += this.composer.takeCommit();
	}
	backspace(): boolean { return this.composer.backspace(); }
	select(): void { /* the editor side replaces the word with a suggestion */ }
	enter(): void { this.flush(); }
	cancel(): void { this.flush(); }

	/** Up to three words the word being typed may be, after the words before it. */
	suggestions(): string[] {
		const word = this.wordBefore + this.composer.preedit;
		if (!word) {
			return [];
		}
		// The words before: their ids, <unk> for one the model lacks, <s> where there is none.
		const prev = this.previousWords;
		const id = (back: number) => back <= prev.length ? this.ids.get(prev[prev.length - back]) ?? UNK : BOS;
		return this.predictor.suggest(id(2), id(1), keysOf(word), 3).map(p => p.word).filter(w => w !== word);
	}

	state(): ImeState {
		const commit = this.pendingCommit;
		this.pendingCommit = '';
		return { preedit: this.composer.preedit, candidates: [], commit };
	}
	setContext(): void { /* not used */ }
}

/**
 * What the editor side drives: a composer here (LocalComposer) or one in the system input
 * method's host (RemoteComposer, src/remote.ts). Every change is awaited; `composing`,
 * `takes` and `state` answer at once.
 */
export interface AsyncComposer {
	readonly composing: boolean;
	takes(key: string, composing: boolean): boolean;
	type(key: string): Promise<void>;
	/** Space while composing: false when the composer took it itself (zhuyin's first tone). */
	space(): Promise<boolean>;
	backspace(): Promise<boolean>;
	select(index: number): Promise<void>;
	enter(): Promise<void>;
	cancel(): Promise<void>;
	/** Takes the state (and its commit). */
	state(): ImeState;
	setContext(text: string): Promise<void>;
	forget(): Promise<void>;
	afterOther(): Promise<void>;
	undoLastCommit(): Promise<void>;
	/** The panel's top line for candidate `index`; '' when the input method has none (the preedit then). */
	reading(index: number): Promise<string>;
	/** Korean: what the word being typed may become, after the words before it. */
	suggestions(wordBefore: string, previousWords: string[]): Promise<string[]>;
	/** Words that may come next after what was just committed (聯想); [] when the input method has none. */
	predictions(count: number): Promise<string[]>;
	/** Commits prediction `index` of the last predictions(). */
	takePrediction(index: number): Promise<void>;
}

/** A composer of this process behind the AsyncComposer interface. */
export class LocalComposer implements AsyncComposer {
	constructor(readonly inner: Composer) { }
	get composing(): boolean { return this.inner.composing; }
	takes(key: string, composing: boolean): boolean { return this.inner.takes(key, composing); }
	async type(key: string): Promise<void> { this.inner.type(key); }
	async space(): Promise<boolean> { return this.inner.space(); }
	async backspace(): Promise<boolean> { return this.inner.backspace(); }
	async select(index: number): Promise<void> { this.inner.select(index); }
	async enter(): Promise<void> { this.inner.enter(); }
	async cancel(): Promise<void> { this.inner.cancel(); }
	state(): ImeState { return this.inner.state(); }
	async setContext(text: string): Promise<void> { this.inner.setContext(text); }
	async forget(): Promise<void> { this.inner.forget?.(); }
	async afterOther(): Promise<void> { this.inner.afterOther?.(); }
	async undoLastCommit(): Promise<void> { this.inner.undoLastCommit?.(); }
	async reading(index: number): Promise<string> { return this.inner.reading?.(index) ?? ''; }
	async predictions(count: number): Promise<string[]> { return this.inner.predictions?.(count) ?? []; }
	async takePrediction(index: number): Promise<void> { this.inner.takePrediction?.(index); }
	async suggestions(wordBefore: string, previousWords: string[]): Promise<string[]> {
		if (!(this.inner instanceof KoreanComposer)) {
			return [];
		}
		this.inner.wordBefore = wordBefore;
		this.inner.previousWords = previousWords;
		return this.inner.suggestions();
	}
}
