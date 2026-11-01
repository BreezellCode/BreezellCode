/**
 * Romaji to kana with a Mozc-style table (romanji-hiragana.tsv: input, output, pending): keys wait
 * while they may still start a longer entry ("k" of "ka"), an entry gives its kana and leaves its
 * pending keys ("kk" gives っ and leaves "k"), and keys that cannot continue give the longest entry
 * they start with ("n" before "k": ん) or pass through as they are.
 */
export interface RomajiRow {
	readonly output: string;
	readonly pending: string;
}

export class RomajiTable {
	private readonly rows = new Map<string, RomajiRow>();
	private readonly prefixes = new Set<string>();

	constructor(tsv: string) {
		for (const line of tsv.split('\n')) {
			const [input, output, pending = ''] = line.replace(/\r$/, '').split('\t');
			if (!input || output === undefined) {
				continue;
			}
			this.rows.set(input, { output, pending });
			for (let i = 1; i < input.length; i++) {
				this.prefixes.add(input.slice(0, i));
			}
		}
	}

	get(input: string): RomajiRow | undefined {
		return this.rows.get(input);
	}

	/** Whether a longer entry starts with `input`. */
	continues(input: string): boolean {
		return this.prefixes.has(input);
	}

	/** Every entry, for the reverse table. */
	entries(): IterableIterator<[string, RomajiRow]> {
		return this.rows.entries();
	}
}

export class RomajiComposer {
	private kana = '';
	private pending = '';

	constructor(private readonly table: RomajiTable) { }

	/** The kana so far and the keys still waiting. */
	get text(): string {
		return this.kana + this.pending;
	}

	get waiting(): string {
		return this.pending;
	}

	get converted(): string {
		return this.kana;
	}

	type(keys: string): void {
		for (const k of keys) {
			this.step(this.pending + k, false);
		}
	}

	/** Ends the input: what waits becomes kana if it can ("n" → ん), else stays as typed. */
	flush(): string {
		this.step(this.pending, true);
		return this.kana;
	}

	backspace(): void {
		if (this.pending) {
			this.pending = this.pending.slice(0, -1);
		} else {
			this.kana = this.kana.slice(0, -1);
		}
	}

	clear(): void {
		this.kana = '';
		this.pending = '';
	}

	private step(s: string, end: boolean): void {
		for (let guard = 0; s && guard < 64; guard++) {
			if (!end && this.table.continues(s)) {
				this.pending = s;
				return;
			}
			const row = this.table.get(s);
			if (row) {
				this.kana += row.output;
				s = row.pending;
				continue;
			}
			// The longest entry s starts with, or its first key as it is.
			let done = false;
			for (let len = s.length - 1; len >= 1; len--) {
				const r = this.table.get(s.slice(0, len));
				if (r) {
					this.kana += r.output;
					s = r.pending + s.slice(len);
					done = true;
					break;
				}
			}
			if (!done) {
				this.kana += s[0];
				s = s.slice(1);
			}
		}
		this.pending = end ? '' : s;
	}
}

/**
 * Hiragana to the romaji people type for it, from the forward table itself (so the keys type back
 * to the same kana): each kana or kana pair (きゃ) as its shortest spelling, small kana on their own
 * only where no pair has them, っ as the next consonant doubled, ん as nn.
 */
export function toRomaji(hiragana: string, table: RomajiTable): string {
	const spell = new Map<string, string>();
	for (const [input, row] of table.entries()) {
		if (row.pending || !row.output || !/^[a-z'-]+$/.test(input) || !/^[\u3041-\u3096\u30fc]{1,2}$/.test(row.output)) {
			continue;
		}
		const old = spell.get(row.output);
		// Shortest; between equals, not the x/l spelling of small kana.
		if (!old || input.length < old.length || input.length === old.length && /^[xl]/.test(old) && !/^[xl]/.test(input)) {
			spell.set(row.output, input);
		}
	}
	spell.set('ん', 'nn');
	const parts: string[] = [];
	const s = hiragana.normalize('NFC').replace(/\u3046\u309b/g, '\u3094');
	for (let i = 0; i < s.length;) {
		const two = spell.get(s.substr(i, 2));
		if (two && i + 2 <= s.length) {
			parts.push(two);
			i += 2;
			continue;
		}
		parts.push(spell.get(s[i]) ?? s[i]);
		i++;
	}
	const small = spell.get('っ') ?? 'xtu';
	for (let i = 0; i < parts.length; i++) {
		if (parts[i] === small && i + 1 < parts.length && /^[bcdfghjkmpqrstvwz]/.test(parts[i + 1])) {
			parts[i] = parts[i + 1][0];
		}
	}
	return parts.join('');
}
