/**
 * Zhuyin (bopomofo) on the standard Dachen (大千) keyboard: the keys, each syllable's zhuyin
 * spelling, and the syllable graph of what was typed. A tone key (space ˉ, 6 ˊ, 3 ˇ, 4 ˋ, 7 ˙)
 * closes a syllable; tones may also be left out, as with pinyin the syllables are then found.
 */
import { EdgeKind, SYLLABLES, SyllableEdge } from './pinyin.js';
import { ZhSpeller } from './speller.js';

/** Dachen key → zhuyin symbol. */
export const DACHEN: Readonly<Record<string, string>> = {
	'1': 'ㄅ', q: 'ㄆ', a: 'ㄇ', z: 'ㄈ', '2': 'ㄉ', w: 'ㄊ', s: 'ㄋ', x: 'ㄌ', e: 'ㄍ', d: 'ㄎ', c: 'ㄏ',
	r: 'ㄐ', f: 'ㄑ', v: 'ㄒ', '5': 'ㄓ', t: 'ㄔ', g: 'ㄕ', b: 'ㄖ', y: 'ㄗ', h: 'ㄘ', n: 'ㄙ',
	u: 'ㄧ', j: 'ㄨ', m: 'ㄩ', '8': 'ㄚ', i: 'ㄛ', k: 'ㄜ', ',': 'ㄝ', '9': 'ㄞ', o: 'ㄟ', l: 'ㄠ',
	'.': 'ㄡ', '0': 'ㄢ', p: 'ㄣ', ';': 'ㄤ', '/': 'ㄥ', '-': 'ㄦ',
};
/** Tone keys and their marks. */
export const TONES: Readonly<Record<string, string>> = { ' ': 'ˉ', '6': 'ˊ', '3': 'ˇ', '4': 'ˋ', '7': '˙' };
const TONE_NUMBER: Readonly<Record<string, number>> = { ' ': 1, '6': 2, '3': 3, '4': 4, '7': 5 };

const INITIAL: Readonly<Record<string, string>> = {
	b: 'ㄅ', p: 'ㄆ', m: 'ㄇ', f: 'ㄈ', d: 'ㄉ', t: 'ㄊ', n: 'ㄋ', l: 'ㄌ', g: 'ㄍ', k: 'ㄎ', h: 'ㄏ',
	j: 'ㄐ', q: 'ㄑ', x: 'ㄒ', zh: 'ㄓ', ch: 'ㄔ', sh: 'ㄕ', r: 'ㄖ', z: 'ㄗ', c: 'ㄘ', s: 'ㄙ',
};
const FINAL: Readonly<Record<string, string>> = {
	a: 'ㄚ', o: 'ㄛ', e: 'ㄜ', ai: 'ㄞ', ei: 'ㄟ', ao: 'ㄠ', ou: 'ㄡ', an: 'ㄢ', en: 'ㄣ', ang: 'ㄤ', eng: 'ㄥ', er: 'ㄦ', ong: 'ㄨㄥ',
	i: 'ㄧ', ia: 'ㄧㄚ', ie: 'ㄧㄝ', iao: 'ㄧㄠ', iu: 'ㄧㄡ', ian: 'ㄧㄢ', in: 'ㄧㄣ', iang: 'ㄧㄤ', ing: 'ㄧㄥ', iong: 'ㄩㄥ',
	u: 'ㄨ', ua: 'ㄨㄚ', uo: 'ㄨㄛ', uai: 'ㄨㄞ', ui: 'ㄨㄟ', uan: 'ㄨㄢ', un: 'ㄨㄣ', uang: 'ㄨㄤ',
	v: 'ㄩ', ve: 'ㄩㄝ', van: 'ㄩㄢ', vn: 'ㄩㄣ',
};
const ZERO: Readonly<Record<string, string>> = {
	a: 'ㄚ', o: 'ㄛ', e: 'ㄜ', ai: 'ㄞ', ei: 'ㄟ', ao: 'ㄠ', ou: 'ㄡ', an: 'ㄢ', en: 'ㄣ', ang: 'ㄤ', eng: 'ㄥ', er: 'ㄦ',
	yi: 'ㄧ', ya: 'ㄧㄚ', yo: 'ㄧㄛ', ye: 'ㄧㄝ', yao: 'ㄧㄠ', you: 'ㄧㄡ', yan: 'ㄧㄢ', yin: 'ㄧㄣ', yang: 'ㄧㄤ', ying: 'ㄧㄥ', yong: 'ㄩㄥ',
	yu: 'ㄩ', yue: 'ㄩㄝ', yuan: 'ㄩㄢ', yun: 'ㄩㄣ',
	wu: 'ㄨ', wa: 'ㄨㄚ', wo: 'ㄨㄛ', wai: 'ㄨㄞ', wei: 'ㄨㄟ', wan: 'ㄨㄢ', wen: 'ㄨㄣ', wang: 'ㄨㄤ', weng: 'ㄨㄥ',
};

/** The zhuyin of a pinyin syllable (ü written v), '' when it has none. */
export function zhuyinOf(pinyin: string): string {
	if (ZERO[pinyin]) {
		return ZERO[pinyin];
	}
	const initial = ['zh', 'ch', 'sh'].find(i => pinyin.startsWith(i)) ?? pinyin[0];
	const ini = INITIAL[initial];
	if (!ini) {
		return '';
	}
	let rest = pinyin.slice(initial.length);
	if (['zh', 'ch', 'sh', 'r', 'z', 'c', 's'].includes(initial) && rest === 'i') {
		return ini;  // zhi, chi, shi, ri, zi, ci, si: the initial alone
	}
	if (['j', 'q', 'x'].includes(initial) && rest.startsWith('u')) {
		rest = 'v' + rest.slice(1);  // ju = jü
	}
	if (rest === 'lve' || rest === 've') {
		rest = 've';
	}
	const fin = FINAL[rest];
	return fin === undefined ? '' : ini + fin;
}

/** Zhuyin spelling → syllable id, for every syllable that has one. */
const BY_SPELLING = new Map<string, number>();
SYLLABLES.forEach((s, i) => {
	const z = zhuyinOf(s);
	if (z && !BY_SPELLING.has(z)) {
		BY_SPELLING.set(z, i + 1);
	}
});
const SPELLINGS = [...BY_SPELLING.keys()];
const ZHUYIN_INITIALS = new Set(Object.values(INITIAL));

/** The zhuyin symbols the keys stand for, tones as their marks. */
export function keysToZhuyin(keys: string): string {
	return [...keys].map(k => DACHEN[k] ?? TONES[k] ?? k).join('');
}

/** Dachen keys of a pinyin syllable; '' when it has no zhuyin. */
export function dachenOf(pinyin: string): string {
	const z = zhuyinOf(pinyin);
	if (!z) {
		return '';
	}
	const back = new Map(Object.entries(DACHEN).map(([k, v]) => [v, k]));
	return [...z].map(c => back.get(c)!).join('');
}

/** Groups sorted ids into runs of consecutive ids: one edge per run. */
function runs(ids: number[]): [number, number][] {
	ids.sort((a, b) => a - b);
	const out: [number, number][] = [];
	for (const id of ids) {
		const last = out[out.length - 1];
		if (last && last[1] === id - 1) {
			last[1] = id;
		} else {
			out.push([id, id]);
		}
	}
	return out;
}

/**
 * The edges leaving each key position. A syllable's keys may be followed by a tone key, which
 * the edge takes in; at the end, keys that begin syllables stand for all of them (still being
 * typed); an initial alone (ㄋㄏ for 你好) counts where no whole syllable starts.
 */
export function zhuyinGraph(keys: string): SyllableEdge[][] {
	const n = keys.length;
	const symbols = [...keys].map(k => DACHEN[k] ?? '');
	const graph: SyllableEdge[][] = Array.from({ length: n + 1 }, () => []);
	const toneAt = (p: number) => p < n ? TONE_NUMBER[keys[p]] ?? 0 : 0;
	const afterTone = (p: number) => toneAt(p) ? p + 1 : p;
	for (let i = 0; i < n; i++) {
		if (!symbols[i]) {
			continue;
		}
		const out = graph[i];
		let sawFull = false;
		for (let len = 1; len <= 4 && i + len <= n; len++) {
			const spelling = symbols.slice(i, i + len).join('');
			if (symbols.slice(i, i + len).some(s => !s)) {
				break;
			}
			const end = i + len;
			const id = BY_SPELLING.get(spelling);
			if (id) {
				out.push({ start: i, end: afterTone(end), lo: id, hi: id, kind: EdgeKind.Full, tone: toneAt(end) });
				sawFull = true;
			} else if (end === n) {
				const ids = SPELLINGS.filter(s => s.startsWith(spelling)).map(s => BY_SPELLING.get(s)!);
				for (const [lo, hi] of runs(ids)) {
					out.push({ start: i, end, lo, hi, kind: EdgeKind.Partial });
				}
			}
		}
		if (!sawFull && ZHUYIN_INITIALS.has(symbols[i]) && i + 1 < n) {
			const ids = SPELLINGS.filter(s => s.startsWith(symbols[i])).map(s => BY_SPELLING.get(s)!);
			const end = afterTone(i + 1);
			const tone = toneAt(i + 1);
			for (const [lo, hi] of runs(ids)) {
				out.push({ start: i, end, lo, hi, kind: EdgeKind.Initial, tone });
			}
		}
	}
	return graph;
}

export const ZHUYIN: ZhSpeller = {
	name: 'zhuyin',
	accept: typed => [...typed.toLowerCase()].filter(k => DACHEN[k] !== undefined || TONES[k] !== undefined).join(''),
	graph: zhuyinGraph,
	skips: key => TONES[key] !== undefined,
};
