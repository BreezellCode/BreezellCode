/**
 * A keyboard layout for Chinese: which keys it takes and the syllables they spell. The decoder
 * works on syllable graphs, so every layout (pinyin, zhuyin, double pinyin…) shares the lexicon,
 * the language model and what the engine learns.
 */
import { SyllableEdge, syllableGraph } from './pinyin.js';

export interface ZhSpeller {
	readonly name: string;
	/** What of `typed` the layout keeps (pinyin: letters and apostrophes). */
	accept(typed: string): string;
	graph(input: string): SyllableEdge[][];
	/** A key no word starts on (a separator: an apostrophe; a tone key with no syllable before it). */
	skips(key: string): boolean;
}

export const PINYIN: ZhSpeller = {
	name: 'pinyin',
	accept: typed => typed.toLowerCase().replace(/[^a-z']/g, ''),
	graph: syllableGraph,
	skips: key => key === '\'',
};
