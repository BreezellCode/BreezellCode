/**
 * Pinyin syllables and the syllable graph of what the user typed.
 *
 * Syllables are numbered in alphabetical order from 1, so every spelling prefix ("zh", "zho",
 * "x") covers one contiguous id range: a full syllable is a range of one, an abbreviation (only
 * the initial typed) or the syllable being typed at the end is the range of its prefix.
 */

/** Every syllable the lexicon uses (ü written v), alphabetical. */
export const SYLLABLES: readonly string[] = (
	'a ai an ang ao ba bai ban bang bao bei ben beng bi bian biang biao bie bin bing bo bu ca cai can cang cao ce cei cen ceng ' +
	'cha chai chan chang chao che chen cheng chi chong chou chu chua chuai chuan chuang chui chun chuo ci cong cou cu cuan cui ' +
	'cun cuo da dai dan dang dao de dei den deng di dia dian diao die ding diu dong dou du duan dui dun duo e ei en eng er fa ' +
	'fan fang fei fen feng fiao fo fou fu ga gai gan gang gao ge gei gen geng gong gou gu gua guai guan guang gui gun guo ha ' +
	'hai han hang hao he hei hen heng hong hou hu hua huai huan huang hui hun huo ji jia jian jiang jiao jie jin jing jiong jiu ' +
	'ju juan jue jun ka kai kan kang kao ke kei ken keng kong kou ku kua kuai kuan kuang kui kun kuo la lai lan lang lao le ' +
	'lei leng li lia lian liang liao lie lin ling liu lo long lou lu luan lun luo lv lve ma mai man mang mao me mei men meng ' +
	'mi mian miao mie min ming miu mo mou mu na nai nan nang nao ne nei nen neng ni nian niang niao nie nin ning niu nong nou ' +
	'nu nuan nuo nv nve o ou pa pai pan pang pao pei pen peng pi pian piao pie pin ping po pou pu qi qia qian qiang qiao qie ' +
	'qin qing qiong qiu qu quan que qun ran rang rao re ren reng ri rong rou ru rua ruan rui run ruo sa sai san sang sao se ' +
	'sen seng sha shai shan shang shao she shei shen sheng shi shou shu shua shuai shuan shuang shui shun shuo si song sou su ' +
	'suan sui sun suo ta tai tan tang tao te tei teng ti tian tiao tie ting tong tou tu tuan tui tun tuo wa wai wan wang wei ' +
	'wen weng wo wu xi xia xian xiang xiao xie xin xing xiong xiu xu xuan xue xun ya yan yang yao ye yi yin ying yo yong you ' +
	'yu yuan yue yun za zai zan zang zao ze zei zen zeng zha zhai zhan zhang zhao zhe zhei zhen zheng zhi zhong zhou zhu zhua ' +
	'zhuai zhuan zhuang zhui zhun zhuo zi zong zou zu zuan zui zun zuo'
).split(' ');

const ID = new Map<string, number>(SYLLABLES.map((s, i) => [s, i + 1]));

/** Spellings people type for a syllable the lexicon writes otherwise. */
const ALIASES: ReadonlyMap<string, string> = new Map([
	['lue', 'lve'], ['nue', 'nve'], ['lüe', 'lve'], ['nüe', 'nve'], ['lü', 'lv'], ['nü', 'nv'],
	['jv', 'ju'], ['qv', 'qu'], ['xv', 'xu'], ['yv', 'yu'], ['jve', 'jue'], ['qve', 'que'], ['xve', 'xue'], ['yve', 'yue'],
	['jvan', 'juan'], ['qvan', 'quan'], ['xvan', 'xuan'], ['yvan', 'yuan'], ['jvn', 'jun'], ['qvn', 'qun'], ['xvn', 'xun'], ['yvn', 'yun'],
]);

const INITIALS = ['zh', 'ch', 'sh', 'b', 'p', 'm', 'f', 'd', 't', 'n', 'l', 'g', 'k', 'h', 'j', 'q', 'x', 'r', 'z', 'c', 's', 'y', 'w'];
const MAX_SPELLING = 6;

export function syllableId(spelling: string): number {
	return ID.get(spelling) ?? 0;
}

export function syllableOf(id: number): string {
	return SYLLABLES[id - 1] ?? '';
}

/** Ids [lo, hi] of the syllables starting with `prefix`, or undefined when none does. */
export function prefixRange(prefix: string): [number, number] | undefined {
	let lo = 0, hi = SYLLABLES.length;
	while (lo < hi) {
		const mid = (lo + hi) >>> 1;
		if (SYLLABLES[mid] < prefix) {
			lo = mid + 1;
		} else {
			hi = mid;
		}
	}
	if (lo >= SYLLABLES.length || !SYLLABLES[lo].startsWith(prefix)) {
		return undefined;
	}
	let end = lo;
	while (end + 1 < SYLLABLES.length && SYLLABLES[end + 1].startsWith(prefix)) {
		end++;
	}
	return [lo + 1, end + 1];
}

export const enum EdgeKind {
	/** A whole syllable. */
	Full = 0,
	/** Only the initial (zh, b, …) of a syllable, inside the input. */
	Initial = 1,
	/** The start of a syllable, at the end of the input: it is still being typed. */
	Partial = 2,
}

export interface SyllableEdge {
	readonly start: number;
	readonly end: number;
	/** Syllable ids this piece of input can stand for. */
	readonly lo: number;
	readonly hi: number;
	readonly kind: EdgeKind;
	/** The tone typed after the syllable (zhuyin: 1-4, 5 neutral), 0 or absent when none. */
	readonly tone?: number;
	/** The keys were not a syllable: read as one after fixing a slip (jain → jian), at this cost (ln). */
	readonly corrected?: boolean;
	readonly cost?: number;
}

/** Full spellings people type for a syllable written shorter (uei for ui): read as slips. */
const LONG_FORMS: readonly [string, string][] = [['uei', 'ui'], ['iou', 'iu'], ['uen', 'un']];

/** Neighbouring letters on a QWERTY keyboard: the key next to the one meant. */
const NEAR: Readonly<Record<string, string>> = {
	q: 'wa', w: 'qeas', e: 'wrsd', r: 'etdf', t: 'ryfg', y: 'tugh', u: 'yihj', i: 'uojk', o: 'ipkl', p: 'ol',
	a: 'qwsz', s: 'weadzx', d: 'ersfxc', f: 'rtdgcv', g: 'tyfhvb', h: 'yugjbn', j: 'uihknm', k: 'iojlm', l: 'opk',
	z: 'asx', x: 'sdzc', c: 'dfxv', v: 'fgcb', b: 'ghvn', n: 'hjbm', m: 'jkn',
};

/**
 * Which slips are read: two neighbouring keys swapped, a final's long form, the key next to the
 * one meant, a key too many, a key left out. BZ_SLIPS (a comma list) picks some, for tuning.
 */
const SLIP_KINDS = new Set((typeof process !== 'undefined' && process.env?.BZ_SLIPS) ? process.env.BZ_SLIPS.split(',') : ['swap', 'long', 'near', 'extra', 'missing']);

/**
 * What reading a slip costs (ln), by kind: a sentence that makes sense wins over the letters as
 * typed, typing right always wins. BZ_SLIP_COST ("near=5,extra=7") sets some, for tuning.
 */
const SLIP_COST: Record<string, number> = { swap: 4.5, long: 4.5, near: 5.5, extra: 6, missing: 6 };
if (typeof process !== 'undefined' && process.env?.BZ_SLIP_COST) {
	for (const part of process.env.BZ_SLIP_COST.split(',')) {
		const [k, v] = part.split('=');
		if (k in SLIP_COST && Number.isFinite(Number(v))) {
			SLIP_COST[k] = Number(v);
		}
	}
}

/**
 * Syllables a span that is no syllable may have been meant as: two neighbouring keys swapped
 * (jain jian, zhogn zhong), a full spelling of a short final (guei gui), a neighbouring key
 * (jisn jian), a key too many (jiaan jian), a key left out (jan jian).
 */
export function slipsOf(spelling: string): number[] {
	return [...slipCosts(spelling).keys()];
}

/** slipsOf with what reading each costs (the cheapest slip that gives it). */
export function slipCosts(spelling: string): Map<number, number> {
	const out = new Map<number, number>();
	const add = (s: string, kind: string) => {
		const id = ID.get(s) ?? ID.get(ALIASES.get(s) ?? '');
		if (id && !(SLIP_COST[kind] >= (out.get(id) ?? Infinity))) {
			out.set(id, SLIP_COST[kind]);
		}
	};
	const n = spelling.length;
	if (SLIP_KINDS.has('swap')) {
		for (let j = 0; j + 1 < n; j++) {
			if (spelling[j] !== spelling[j + 1]) {
				add(spelling.slice(0, j) + spelling[j + 1] + spelling[j] + spelling.slice(j + 2), 'swap');
			}
		}
	}
	if (SLIP_KINDS.has('long')) {
		for (const [long, short] of LONG_FORMS) {
			if (spelling.endsWith(long)) {
				add(spelling.slice(0, -long.length) + short, 'long');
			}
		}
	}
	if (SLIP_KINDS.has('near')) {
		for (let j = 0; j < n; j++) {
			for (const k of NEAR[spelling[j]] ?? '') {
				add(spelling.slice(0, j) + k + spelling.slice(j + 1), 'near');
			}
		}
	}
	if (SLIP_KINDS.has('extra') && n >= 4) {
		// A key pressed too is the one beside it pressed twice, or its neighbour on the keyboard
		// (jiaan, jianm); any other letter is a syllable of its own (the b of jiba is ji ba).
		const besides = (c: string, other: string | undefined) => other !== undefined && (c === other || (NEAR[other] ?? '').includes(c));
		for (let j = 0; j < n; j++) {
			if (besides(spelling[j], spelling[j - 1]) || besides(spelling[j], spelling[j + 1])) {
				add(spelling.slice(0, j) + spelling.slice(j + 1), 'extra');
			}
		}
	}
	if (SLIP_KINDS.has('missing') && n + 1 <= MAX_SPELLING) {
		for (let j = 1; j <= n; j++) {
			for (let c = 97; c <= 122; c++) {
				add(spelling.slice(0, j) + String.fromCharCode(c) + spelling.slice(j), 'missing');
			}
		}
	}
	return out;
}

/**
 * The edges leaving each input position. `input` is lowercase letters and apostrophes; an
 * apostrophe separates syllables: an edge before one ends after it, so words continue across.
 */
export function syllableGraph(input: string): SyllableEdge[][] {
	const n = input.length;
	const graph: SyllableEdge[][] = Array.from({ length: n + 1 }, () => []);
	const past = (p: number) => { while (p < n && input[p] === '\'') { p++; } return p; };
	for (let i = 0; i < n; i++) {
		if (input[i] === '\'') {
			continue;
		}
		const out = graph[i];
		let sawFull = false;
		for (let len = 1; len <= MAX_SPELLING && i + len <= n; len++) {
			const spelling = input.slice(i, i + len);
			if (spelling.includes('\'')) {
				break;
			}
			const end = i + len;
			const id = ID.get(spelling) ?? ID.get(ALIASES.get(spelling) ?? '');
			if (id) {
				out.push({ start: i, end: past(end), lo: id, hi: id, kind: EdgeKind.Full });
				sawFull = true;
			} else if (len >= 3) {
				// No syllable: maybe a slip of one (scored down, so typing right always wins).
				for (const [slip, cost] of slipCosts(spelling)) {
					out.push({ start: i, end: past(end), lo: slip, hi: slip, kind: EdgeKind.Full, corrected: true, cost });
				}
			}
			if (!id && (end === n || input[end] === '\'')) {
				// Still being typed: "zho" of zhong / zhou. Only at the end (or before a separator).
				const range = prefixRange(spelling);
				if (range && range[0] !== range[1] && end === n) {
					out.push({ start: i, end, lo: range[0], hi: range[1], kind: EdgeKind.Partial });
				}
			}
		}
		// The initial alone: "bj" for 北京. Inside the input only where no whole syllable starts
		// (who typed "fengjiangjun" meant 将军, not 封建割据 read as feng jian g j); at the end
		// always, the next syllable is being typed.
		for (const initial of INITIALS) {
			if (input.startsWith(initial, i)) {
				const end = i + initial.length;
				if (ID.get(initial) || (sawFull && end < n)) {
					break;
				}
				const range = prefixRange(initial)!;
				out.push({ start: i, end: past(end), lo: range[0], hi: range[1], kind: end === n ? EdgeKind.Partial : EdgeKind.Initial });
				break;  // "zh" before "z": the longer initial only
			}
		}
	}
	return graph;
}

/** The syllables of a spelled-out pinyin string ("ni hao" or "nihao" when unambiguous), as ids. */
export function syllableIds(spaced: string): number[] {
	return spaced.trim().split(/\s+/).map(s => ID.get(s) ?? ID.get(ALIASES.get(s) ?? '') ?? 0);
}
