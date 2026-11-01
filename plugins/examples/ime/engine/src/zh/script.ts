/**
 * Simplified ⇄ Traditional the way OpenCC converts: in each stage the longest phrase of the table
 * that starts at a position wins, then the next position after it. The engine decodes in
 * Simplified (one lexicon and model for everyone) and converts what it shows and commits:
 * zh-s2tw.txt is OpenCC's s2tw with the forms Taiwan writes most (台灣, 了解; tools/zh_tw_data.py)
 * first; zh-t2s.txt folds Traditional text (a Taiwan user's editor) back for the context.
 *
 * Table text: one "key<TAB>value[ value…]" per line, a line "@stage" between stages.
 */
interface Stage {
	readonly table: Map<string, readonly string[]>;
	readonly maxLen: number;
}

export class ScriptConverter {
	private readonly stages: Stage[] = [];

	constructor(tableText: string) {
		let table = new Map<string, readonly string[]>();
		let maxLen = 1;
		const finish = () => {
			if (table.size) {
				this.stages.push({ table, maxLen });
			}
			table = new Map();
			maxLen = 1;
		};
		for (const line of tableText.split('\n')) {
			if (line === '@stage') {
				finish();
				continue;
			}
			const tab = line.indexOf('\t');
			if (tab <= 0) {
				continue;
			}
			const key = line.slice(0, tab);
			if (!table.has(key)) {
				table.set(key, line.slice(tab + 1).split(' ').filter(Boolean));
				maxLen = Math.max(maxLen, key.length);
			}
		}
		finish();
	}

	convert(text: string): string {
		for (const stage of this.stages) {
			text = convertStage(stage, text);
		}
		return text;
	}

	/** Every form one character may take, the one convert gives first. */
	alternatives(char: string): string[] {
		const first = this.stages[0]?.table.get(char) ?? [char];
		const out: string[] = [];
		for (let form of first) {
			for (const stage of this.stages.slice(1)) {
				form = convertStage(stage, form);
			}
			if (!out.includes(form)) {
				out.push(form);
			}
		}
		return out;
	}
}

function convertStage(stage: Stage, text: string): string {
	let out = '';
	for (let i = 0; i < text.length;) {
		let done = false;
		for (let len = Math.min(stage.maxLen, text.length - i); len >= 1; len--) {
			const v = stage.table.get(text.substr(i, len));
			if (v && v.length) {
				out += v[0];
				i += len;
				done = true;
				break;
			}
		}
		if (!done) {
			out += text[i];
			i++;
		}
	}
	return out;
}
