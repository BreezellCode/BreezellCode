/**
 * The tones a character takes in a syllable (zh-tones.tsv from tools/zh_tw_data.py: McBopomofo's
 * readings with mainland data for the characters it lacks). Zhuyin users type a tone after every
 * syllable; a word whose character cannot take the typed tone goes down (稅負 for ㄕㄨㄟˋ ㄈㄨˋ,
 * not 稅符), softly, since people's tones and the tables differ now and then.
 */
import { syllableId } from './pinyin.js';

export interface ToneTable {
	/** Bit t (1-4, 5 neutral) set when the character takes tone t in the syllable; 0 when unknown. */
	mask(char: number, syllable: number): number;
}

export function loadToneTable(tsv: string): ToneTable {
	const masks = new Map<number, number>();
	for (const line of tsv.split('\n')) {
		const [char, syllable, tones] = line.split('\t');
		const id = tones ? syllableId(syllable) : 0;
		if (!id) {
			continue;
		}
		let m = 0;
		for (const t of tones) {
			m |= 1 << Number(t);
		}
		const key = char.codePointAt(0)! * 512 + id;
		masks.set(key, (masks.get(key) ?? 0) | m);
	}
	return { mask: (char, syllable) => masks.get(char * 512 + syllable) ?? 0 };
}
