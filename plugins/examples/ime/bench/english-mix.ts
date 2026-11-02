/**
 * English among Chinese candidates: what the first candidate should be when the letters typed spell
 * an English word as well as a Chinese reading. Writes one row per sample, for sweeping the ranking.
 *
 *   english     a Latin word as it stands among Chinese text (tech documents, wiki, subtitles)
 *   initials    a Chinese word typed by its initials (沒有 as my), where they spell an English word
 *   full        a Chinese word typed in full pinyin (們 as men), where that spells an English word
 *   slip        a Chinese word typed with two neighbouring keys swapped (加 as jai), where that spells one
 *
 *   english-mix.ts <data dir> <out.jsonl> <kind:file>...      kind: tech, wiki, chat (text) or zh (clauses)
 */
import { closeSync, openSync, readFileSync, readSync, statSync, writeFileSync } from 'node:fs';
import { AdaptiveModel, latinContextOf, latinOffers, LatinWords, loadNgramModel, loadZhLexicon, ZhDecoder, ZhSession } from '../engine/src/index.js';
import { LATIN_WORDS } from '../src/latinWords.js';

const [dir, out, ...sources] = process.argv.slice(2);
const lm = loadNgramModel(new Uint8Array(readFileSync(`${dir}/zh.bzlm`)));
const lex = loadZhLexicon(new Uint8Array(readFileSync(`${dir}/zh.bzlx`)));
const decoder = new ZhDecoder(lex, lm, new AdaptiveModel(), {});
const english = new Map(readFileSync(`${dir}/en-words.tsv`, 'utf8').split('\n').filter(Boolean).map(l => { const [w, c] = l.split('\t'); return [w, Number(c)] as [string, number]; }));
const englishTotal = [...english.values()].reduce((a, b) => a + b, 0);
const latin = new Map(LATIN_WORDS.split('\n').map(l => { const [w, c] = l.split('\t'); return [w.toLowerCase(), Number(c)] as [string, number]; }));
const words = new LatinWords(LATIN_WORDS, english);
const MAX_SAMPLES = Number(process.env.BENCH_MAX ?? 6000);
const rows: unknown[] = [];

function sample(kind: string, domain: string, letters: string, context: string, gold: string, extra: object = {}): void {
	const s = new ZhSession(decoder);
	s.setContext(context);
	s.type(letters);
	const st = s.state();
	const top = st.candidates[0];
	const before = context.trimEnd();
	const last = before.charCodeAt(before.length - 1);
	const ctx = !before ? 'none' : (last >= 0x3400 && last <= 0x9fff) ? 'han' : /[A-Za-z0-9]/.test(before[before.length - 1]) ? 'latin' : 'none';
	const hits = (context.toLowerCase().match(new RegExp(`(?<![a-z0-9_])${letters}(?![a-z0-9_])`, 'g')) ?? []).length;
	const here = new Map<string, { text: string; hits: number }>();
	for (const m of context.matchAll(/[A-Za-z]{2,}/g)) {
		const lower = m[0].toLowerCase();
		here.set(lower, { text: m[0], hits: (here.get(lower)?.hits ?? 0) + 1 });
	}
	// What the input method does with these letters.
	const offers = latinOffers({ letters, candidates: st.candidates, lead: st.lead, context: latinContextOf(context), here }, words, undefined);
	const place = offers.find(o => o.word === letters);
	rows.push({
		kind, domain, letters, gold, ctx, hits,
		en: english.has(letters) ? Math.log(english.get(letters)! / englishTotal) : null,
		count: english.get(letters) ?? 0,
		lz: latin.has(letters) ? Math.log(latin.get(letters)! / 1e6) : null,
		top: top?.score ?? null, topText: top?.text ?? null, exact: !!top?.exact, sentence: !!top?.sentence, slip: !!top?.slip, lead: st.lead,
		// Where the Chinese gold stands among the sentence readings and words.
		rank: st.candidates.findIndex(c => c.text === gold),
		// Where the word goes now: -1 not offered, 0 first.
		place: place ? place.index + offers.indexOf(place) : -1,
		firstWord: offers.find(o => o.index === 0)?.word ?? null,
		...extra,
	});
}

const shuffled = <T>(a: T[]): T[] => {
	let x = 12345;
	const r = () => (x = (x * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
	for (let i = a.length - 1; i > 0; i--) {
		const j = Math.floor(r() * (i + 1));
		[a[i], a[j]] = [a[j], a[i]];
	}
	return a;
};

for (const source of sources) {
	const colon = source.indexOf(':');
	const kind = source.slice(0, colon), file = source.slice(colon + 1);
	const before = rows.length;
	if (kind === 'zh') {
		const domain = file.match(/zh-(\w+?)[.-]/)?.[1] ?? 'zh';
		for (const line of readFileSync(file, 'utf8').split('\n').filter(Boolean)) {
			const r = JSON.parse(line);
			const syl: string[] = r.pinyin.split(' ');
			const chars = [...(r.text as string)];
			if (chars.length !== syl.length) {
				continue;
			}
			let at = 0;
			for (const w of decoder.segment(r.text)) {
				const n = w.text.length;
				const context = chars.slice(0, at).join('');
				const pinyin = syl.slice(at, at + n);
				at += n;
				const initials = pinyin.map(p => p[0]).join('');
				if (n >= 2 && n <= 4 && initials.length >= 2 && (english.has(initials) || latin.has(initials))) {
					sample('initials', domain, initials, context, w.text, { unigram: lm.unigram(w.token) });
				}
				const whole = pinyin.join('');
				if (english.has(whole) || latin.has(whole)) {
					sample('full', domain, whole, context, w.text, { unigram: lm.unigram(w.token) });
				}
				for (let i = 0; i + 1 < whole.length; i++) {
					const swapped = whole.slice(0, i) + whole[i + 1] + whole[i] + whole.slice(i + 2);
					if (swapped !== whole && (english.has(swapped) || latin.has(swapped))) {
						sample('slip', domain, swapped, context, w.text, { unigram: lm.unigram(w.token) });
					}
				}
			}
		}
	} else {
		// The start of the file: some are larger than a string can be.
		const buffer = Buffer.alloc(Math.min(statSync(file).size, 120_000_000));
		const fd = openSync(file, 'r');
		readSync(fd, buffer, 0, buffer.length, 0);
		closeSync(fd);
		const lines = buffer.toString('utf8').split('\n');
		const found: { line: number; word: string; index: number }[] = [];
		const word = /(?<![A-Za-z0-9_.\-/\\@#$%&=+:~'])[A-Za-z][A-Za-z]+(?![A-Za-z0-9_\-/\\@=(])/g;
		for (let i = 0; i < lines.length; i++) {
			if (!/[㐀-鿿]/.test(lines[i])) {
				continue;
			}
			for (const m of lines[i].matchAll(word)) {
				// Among Chinese: a Chinese character close before it, in the same clause.
				if (/[㐀-鿿]\s?$/.test(lines[i].slice(0, m.index))) {
					found.push({ line: i, word: m[0], index: m.index });
				}
			}
		}
		for (const f of shuffled(found).slice(0, MAX_SAMPLES)) {
			const context = [...lines.slice(Math.max(0, f.line - 3), f.line), lines[f.line].slice(0, f.index)].join('\n').slice(-4000);
			sample('english', kind, f.word.toLowerCase(), context, f.word);
		}
	}
	console.error(`${source}: ${rows.length - before} samples`);
}
writeFileSync(out, rows.map(r => JSON.stringify(r)).join('\n') + '\n');
