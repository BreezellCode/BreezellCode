/**
 * Full-width punctuation for the native languages: the mark a key becomes, and quotes that open
 * and close in turn. One table for the system input method and Breezell's editor and chat.
 */

const ZH: Record<string, string> = {
	',': '，', '.': '。', '?': '？', '!': '！', ':': '：', ';': '；', '\\': '、', '(': '（', ')': '）', '[': '【', ']': '】', '<': '《', '>': '》',
	'~': '～', '^': '……', '_': '——', '$': '￥',
};
/** Taiwan: corner brackets for quotes and brackets, the dollar sign kept. */
const TW: Record<string, string> = { ...ZH, '[': '「', ']': '」', '{': '『', '}': '』', '$': '$' };
/** Zhuyin: , . ; / - are keys; the marks come with Shift. */
const ZHUYIN: Record<string, string> = { '<': '，', '>': '。', '?': '？', ':': '：', '!': '！', '(': '（', ')': '）', '[': '「', ']': '」', '{': '『', '}': '』', '"': '、', '~': '～', '_': '——' };
const JA: Record<string, string> = { ',': '、', '.': '。', '?': '？', '!': '！', '[': '「', ']': '」', '~': '〜', '/': '・' };

export class Punctuator {
	private open = { double: false, single: false };

	/** The mark `ch` becomes in `layout` (Korean and English: itself); quotes alternate open and close. */
	mark(ch: string, layout: string, traditional: boolean): string {
		if (layout === 'japanese') {
			return JA[ch] ?? ch;
		}
		if (layout === 'korean') {
			return ch;
		}
		const tw = layout === 'zhuyin' || traditional;
		if (layout !== 'zhuyin' && ch === '"') {
			this.open.double = !this.open.double;
			return tw ? (this.open.double ? '「' : '」') : (this.open.double ? '“' : '”');
		}
		if (layout !== 'zhuyin' && ch === '\'') {
			this.open.single = !this.open.single;
			return tw ? (this.open.single ? '『' : '』') : (this.open.single ? '‘' : '’');
		}
		return (layout === 'zhuyin' ? ZHUYIN : tw ? TW : ZH)[ch] ?? ch;
	}

	/** The mark without turning a quote. */
	preview(ch: string, layout: string, traditional: boolean): string {
		const saved = { ...this.open };
		const m = this.mark(ch, layout, traditional);
		this.open = saved;
		return m;
	}
}
