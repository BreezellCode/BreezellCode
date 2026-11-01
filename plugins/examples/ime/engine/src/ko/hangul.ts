/**
 * Hangul composition on the standard 2-set (두벌식) keyboard: keys give jamo, jamo make syllables.
 *
 *   - A syllable is an initial consonant (or none), a vowel and maybe a final consonant.
 *   - Two vowels combine (ㅗ+ㅏ ㅘ…), two finals combine (ㄱ+ㅅ ㄳ…).
 *   - A vowel after a final takes it as its own initial (각 + ㅏ → 가가; 닭 + ㅏ → 달가): the
 *     final (or the last of two) moves to the next syllable.
 *   - Backspace takes back the last jamo typed, not the whole syllable.
 *
 * Unicode: syllable = 0xAC00 + (initial × 21 + vowel) × 28 + final; lone jamo are the
 * compatibility letters (U+3131…) the way keyboards show them.
 */

/** 2-set key → compatibility jamo (Shift gives the doubled consonants and ㅒ ㅖ). */
export const DUBEOLSIK: Readonly<Record<string, string>> = {
	q: 'ㅂ', w: 'ㅈ', e: 'ㄷ', r: 'ㄱ', t: 'ㅅ', y: 'ㅛ', u: 'ㅕ', i: 'ㅑ', o: 'ㅐ', p: 'ㅔ',
	a: 'ㅁ', s: 'ㄴ', d: 'ㅇ', f: 'ㄹ', g: 'ㅎ', h: 'ㅗ', j: 'ㅓ', k: 'ㅏ', l: 'ㅣ',
	z: 'ㅋ', x: 'ㅌ', c: 'ㅊ', v: 'ㅍ', b: 'ㅠ', n: 'ㅜ', m: 'ㅡ',
	Q: 'ㅃ', W: 'ㅉ', E: 'ㄸ', R: 'ㄲ', T: 'ㅆ', O: 'ㅒ', P: 'ㅖ',
	Y: 'ㅛ', U: 'ㅕ', I: 'ㅑ', A: 'ㅁ', S: 'ㄴ', D: 'ㅇ', F: 'ㄹ', G: 'ㅎ', H: 'ㅗ', J: 'ㅓ', K: 'ㅏ', L: 'ㅣ',
	Z: 'ㅋ', X: 'ㅌ', C: 'ㅊ', V: 'ㅍ', B: 'ㅠ', N: 'ㅜ', M: 'ㅡ',
};

const INITIALS = 'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ';
const VOWELS = 'ㅏㅐㅑㅒㅓㅔㅕㅖㅗㅘㅙㅚㅛㅜㅝㅞㅟㅠㅡㅢㅣ';
/** Finals in Unicode order (index 0 = none). */
const FINALS = ['', 'ㄱ', 'ㄲ', 'ㄳ', 'ㄴ', 'ㄵ', 'ㄶ', 'ㄷ', 'ㄹ', 'ㄺ', 'ㄻ', 'ㄼ', 'ㄽ', 'ㄾ', 'ㄿ', 'ㅀ', 'ㅁ', 'ㅂ', 'ㅄ', 'ㅅ', 'ㅆ', 'ㅇ', 'ㅈ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ'];
const VOWEL_PAIRS: Readonly<Record<string, string>> = {
	'ㅗㅏ': 'ㅘ', 'ㅗㅐ': 'ㅙ', 'ㅗㅣ': 'ㅚ', 'ㅜㅓ': 'ㅝ', 'ㅜㅔ': 'ㅞ', 'ㅜㅣ': 'ㅟ', 'ㅡㅣ': 'ㅢ',
};
const FINAL_PAIRS: Readonly<Record<string, string>> = {
	'ㄱㅅ': 'ㄳ', 'ㄴㅈ': 'ㄵ', 'ㄴㅎ': 'ㄶ', 'ㄹㄱ': 'ㄺ', 'ㄹㅁ': 'ㄻ', 'ㄹㅂ': 'ㄼ', 'ㄹㅅ': 'ㄽ', 'ㄹㅌ': 'ㄾ', 'ㄹㅍ': 'ㄿ', 'ㄹㅎ': 'ㅀ', 'ㅂㅅ': 'ㅄ',
};
/** A compound final's two parts. */
const FINAL_SPLIT: Readonly<Record<string, [string, string]>> = Object.fromEntries(
	Object.entries(FINAL_PAIRS).map(([pair, f]) => [f, [pair[0], pair[1]]]),
);

export function isVowel(jamo: string): boolean {
	return VOWELS.includes(jamo);
}

export function isConsonant(jamo: string): boolean {
	return INITIALS.includes(jamo) || FINALS.includes(jamo) && jamo !== '';
}

/** The text of a syllable being built: a precomposed syllable, or the lone jamo typed so far. */
export function syllableText(initial: string, vowel: string, final: string): string {
	if (initial && vowel) {
		const l = INITIALS.indexOf(initial), v = VOWELS.indexOf(vowel), t = FINALS.indexOf(final);
		return String.fromCharCode(0xac00 + (l * 21 + v) * 28 + Math.max(0, t));
	}
	return initial + vowel + final;
}

interface Syllable {
	initial: string;
	vowel: string;
	final: string;
}

/**
 * The composer: jamo in, text out. `commit` collects finished syllables (and lone jamo that could
 * not join one); `preedit` is the syllable being built.
 */
export class HangulComposer {
	private cur: Syllable = { initial: '', vowel: '', final: '' };
	/** The jamo typed for the current syllable, for backspace (a moved final starts a new list). */
	private typed: string[] = [];
	private done = '';

	get preedit(): string {
		return syllableText(this.cur.initial, this.cur.vowel, this.cur.final);
	}

	/** Takes the text finished so far. */
	takeCommit(): string {
		const t = this.done;
		this.done = '';
		return t;
	}

	get empty(): boolean {
		return !this.cur.initial && !this.cur.vowel && !this.cur.final;
	}

	/** Finishes the syllable being built (a space, punctuation, a click elsewhere). */
	flush(): void {
		this.done += this.preedit;
		this.cur = { initial: '', vowel: '', final: '' };
		this.typed = [];
	}

	/** Types a key of the layout; false when it is not a letter of it. */
	key(k: string, layout: Readonly<Record<string, string>> = DUBEOLSIK): boolean {
		const jamo = layout[k];
		if (!jamo) {
			return false;
		}
		this.jamo(jamo);
		return true;
	}

	jamo(j: string): void {
		const c = this.cur;
		if (isVowel(j)) {
			if (c.final) {
				// The final goes to the next syllable as its initial (the last part of a pair).
				const split = FINAL_SPLIT[c.final];
				const moved = split ? split[1] : c.final;
				c.final = split ? split[0] : '';
				const keep = this.typed.slice(0, -1);
				this.typed = keep;
				this.flush();
				this.cur = { initial: moved, vowel: j, final: '' };
				this.typed = [moved, j];
				return;
			}
			if (c.vowel) {
				const pair = VOWEL_PAIRS[c.vowel + j];
				if (pair && this.typed[this.typed.length - 1] === c.vowel) {
					c.vowel = pair;
					this.typed.push(j);
					return;
				}
				this.flush();
				this.cur = { initial: '', vowel: j, final: '' };
				this.typed = [j];
				return;
			}
			c.vowel = j;
			this.typed.push(j);
			return;
		}
		// A consonant.
		if (c.initial && c.vowel) {
			if (!c.final) {
				if (FINALS.includes(j)) {
					c.final = j;
					this.typed.push(j);
					return;
				}
			} else {
				const pair = FINAL_PAIRS[c.final + j];
				if (pair) {
					c.final = pair;
					this.typed.push(j);
					return;
				}
			}
		}
		if (!c.initial && !c.vowel && !c.final) {
			c.initial = j;
			this.typed = [j];
			return;
		}
		// Two consonants alone that make a pair (ㄱ+ㅅ ㄳ, as in ㄳ for 감사): one jamo, as libhangul
		// does; a vowel after it takes the second (ㄳ + ㅏ → ㄱ사).
		if (c.initial && !c.vowel && !c.final && FINAL_PAIRS[c.initial + j]) {
			c.final = FINAL_PAIRS[c.initial + j];
			c.initial = '';
			this.typed.push(j);
			return;
		}
		this.flush();
		this.cur = { initial: j, vowel: '', final: '' };
		this.typed = [j];
	}

	/** Takes back the last jamo; false when there was nothing to take back. */
	backspace(): boolean {
		if (!this.typed.length) {
			return false;
		}
		const replay = this.typed.slice(0, -1);
		this.cur = { initial: '', vowel: '', final: '' };
		this.typed = [];
		const before = this.done;
		for (const j of replay) {
			this.jamo(j);
		}
		// Replaying a syllable's own jamo never finishes it, so nothing was committed meanwhile.
		this.done = before;
		return true;
	}

	reset(): void {
		this.cur = { initial: '', vowel: '', final: '' };
		this.typed = [];
		this.done = '';
	}
}

/**
 * Composes a whole key sequence as a text field shows it: spaces and other keys pass through, and
 * `backspace` (a key the layout lacks, '<' by default) takes back a jamo, or the last character
 * when no syllable is being built.
 */
export function composeKeys(keys: string, layout: Readonly<Record<string, string>> = DUBEOLSIK, backspace = '<'): string {
	const c = new HangulComposer();
	let out = '';
	for (const k of keys) {
		if (k === backspace) {
			if (!c.backspace()) {
				out = out.slice(0, -1);
			}
			continue;
		}
		if (!c.key(k, layout)) {
			c.flush();
			out += c.takeCommit() + k;
		} else {
			out += c.takeCommit();
		}
	}
	c.flush();
	return out + c.takeCommit();
}

let reverse: ((j: string) => string) | undefined;

/** The 2-set keys that type a text (the inverse of composeKeys for Hangul and spaces). */
export function keysOf(text: string): string {
	reverse ??= reverseLayout();
	const jamoKeys = reverse;
	let out = '';
	for (const ch of text) {
		const code = ch.charCodeAt(0) - 0xac00;
		if (code >= 0 && code < 11172) {
			const l = Math.floor(code / 588), v = Math.floor((code % 588) / 28), t = code % 28;
			out += jamoKeys(INITIALS[l]) + jamoKeys(VOWELS[v]) + (t ? jamoKeys(FINALS[t]) : '');
		} else {
			out += jamoKeys(ch) || ch;
		}
	}
	return out;
}

function reverseLayout(): (j: string) => string {
	const back = new Map<string, string>();
	for (const [k, j] of Object.entries(DUBEOLSIK)) {
		if (!back.has(j) || k === k.toLowerCase()) {
			back.set(j, k);
		}
	}
	// Doubled consonants and ㅒ ㅖ only come with Shift.
	for (const [k, j] of Object.entries(DUBEOLSIK)) {
		if (k !== k.toLowerCase() && !Object.entries(DUBEOLSIK).some(([k2, j2]) => j2 === j && k2 === k2.toLowerCase())) {
			back.set(j, k);
		}
	}
	const jamoKeys = (j: string) => {
		const vp = Object.entries(VOWEL_PAIRS).find(([, v]) => v === j);
		if (vp) {
			return back.get(vp[0][0])! + back.get(vp[0][1])!;
		}
		const fp = FINAL_SPLIT[j];
		if (fp) {
			return back.get(fp[0])! + back.get(fp[1])!;
		}
		return back.get(j) ?? '';
	};
	const cache = new Map<string, string>();
	return j => {
		let k = cache.get(j);
		if (k === undefined) {
			k = jamoKeys(j);
			cache.set(j, k);
		}
		return k;
	};
}
