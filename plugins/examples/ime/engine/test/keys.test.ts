/**
 * What a key does (src/keys.ts), shared by the system input method's host and Breezell's
 * editor and chat: on a made-up composer, no models.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { AsyncComposer, ImeState } from '../../src/composers.js';
import { badgeOf, Key, KeySession, KeySessionOptions } from '../../src/keys.js';
import { Punctuator } from '../../src/punctuation.js';

/** Letters compose; candidates are [INPUT, input·2, input·3 …] (as many as `count`); predictions after a commit: 甲 乙. */
class FakeComposer implements AsyncComposer {
	input = '';
	pending = '';
	calls: string[] = [];
	constructor(private readonly count = 2) { }
	get composing() { return this.input.length > 0; }
	takes(key: string) { return /^[a-z]$/.test(key); }
	private cands() { return this.input ? Array.from({ length: this.count }, (_, i) => i ? `${this.input}·${i + 1}` : this.input.toUpperCase()) : []; }
	async type(k: string) { this.input += k; }
	async space() { return true; }
	async backspace() { const was = this.composing; this.input = this.input.slice(0, -1); return was; }
	async select(i: number) { this.pending += this.cands()[i]; this.input = ''; }
	async enter() { this.pending += this.input; this.input = ''; }
	async cancel() { this.input = ''; }
	state(): ImeState { const commit = this.pending; this.pending = ''; return { preedit: this.input, candidates: this.cands(), commit }; }
	async setContext(t: string) { this.calls.push(`context:${t}`); }
	async forget() { this.calls.push('forget'); }
	async afterOther() { this.calls.push('other'); }
	async undoLastCommit() { this.calls.push('undo'); }
	async reading() { return this.input.split('').join(' '); }
	async suggestions() { return []; }
	async predictions() { return ['甲', '乙']; }
	async takePrediction(i: number) { this.pending += ['甲', '乙'][i]; }
}

const make = (opts: Partial<KeySessionOptions> = {}, count = 2) => {
	const c = new FakeComposer(count);
	const o: KeySessionOptions = { layout: 'pinyin', traditional: true, pageSize: 3, fullWidth: true, prediction: false, english: false, ...opts };
	return { c, s: new KeySession(c, () => o), o };
};
const type = async (s: KeySession, keys: string) => { let last; for (const k of keys) last = await s.key({ key: k }); return last!; };
const k = (key: string, more: Partial<Key> = {}): Key => ({ key, ...more });

test('keys: letters compose, Space and digits pick, Enter commits as typed, Escape drops', async () => {
	const { s } = make();
	await type(s, 'ni');
	assert.equal((await s.view()).candidates.join(), 'NI,ni·2');
	assert.deepEqual(await s.key(k(' ')), { eaten: true, commit: 'NI', typeKey: false });
	await type(s, 'ma');
	assert.equal((await s.key(k('2'))).commit, 'ma·2');
	await type(s, 'ab');
	assert.equal((await s.key(k('Enter'))).commit, 'ab');
	await type(s, 'x');
	assert.equal((await s.key(k('Escape'))).commit, '');
	assert.equal(s.composing, false);
});

test('keys: punctuation while composing: the highlighted goes in, then its mark (or the key as typed)', async () => {
	const { s } = make();
	await type(s, 'ni');
	assert.deepEqual(await s.key(k(',')), { eaten: true, commit: 'NI，', typeKey: false });
	await type(s, 'hao');
	assert.deepEqual(await s.key(k('@')), { eaten: true, commit: 'HAO', typeKey: true });
});

test('keys: not composing, a mark is eaten, letters and digits of the program follow the words before', async () => {
	const { s, c } = make();
	assert.equal(s.eats(k(',')), true);
	assert.equal((await s.key(k('.'))).commit, '。');
	assert.equal(c.calls.at(-1), 'forget');
	assert.equal((await s.key(k('1'))).eaten, false);
	assert.equal(c.calls.at(-1), 'other');
	assert.equal((await s.key(k('ArrowLeft'))).eaten, false);
	assert.equal(c.calls.at(-1), 'forget');
	assert.equal(s.eats(k('a', { command: true })), false);
	assert.equal(s.eats(k('a', { caps: true })), false);
});

test('keys: the context of a new composition is the caller\'s, else what went in lately', async () => {
	const { s, c } = make();
	await s.key(k('n'), 'the editor before');
	assert.ok(c.calls.includes('context:the editor before'));
	await s.key(k(' '));
	await s.key(k('h'));
	assert.ok(c.calls.includes('context:N'));
});

test('keys: Backspace right after a commit takes it back from what was learned; not after anything else', async () => {
	const { s, c } = make();
	await type(s, 'ni');
	await s.key(k(' '));
	await s.key(k('Backspace'));
	assert.equal(c.calls.filter(x => x === 'undo').length, 1);
	await s.key(k('Backspace'));
	assert.equal(c.calls.filter(x => x === 'undo').length, 1);
});

test('keys: the words offered after a commit: Tab takes the first, a click any, another key and they go', async () => {
	const { s } = make({ prediction: true });
	await type(s, 'ni');
	await s.key(k(' '));
	let v = await s.view();
	assert.equal(v.predicting, true);
	assert.equal(v.highlight, 0);  // what Tab takes
	assert.equal(v.labels, 'none');  // no key shown: digits do not pick them
	assert.equal(v.candidates.join(), '甲,乙');
	assert.equal(v.reading, '聯想  Tab ⇥');
	assert.equal(s.eats(k('Tab')), true);
	assert.equal(s.eats(k('Tab', { shift: true })), false);
	assert.equal((await s.key(k('Tab'))).commit, '甲');
	assert.equal((await s.view()).predicting, true);  // and more after it
	assert.equal(await s.pick(1), '乙');
	assert.equal((await s.view()).predicting, true);
	assert.equal((await s.key(k('ArrowRight'))).eaten, false);
	v = await s.view();
	assert.equal(v.predicting, false);
	assert.equal(s.eats(k('Tab')), false);  // Tab is the program's again
});

test('keys: a digit after text is a digit, whatever is offered, and what is offered goes', async () => {
	const { s, c } = make({ prediction: true });
	await type(s, 'ni');
	await s.key(k(' '));
	assert.equal((await s.view()).predicting, true);
	assert.equal(s.eats(k('1')), false);
	const typed = await s.key(k('1'));
	assert.deepEqual(typed, { eaten: false, commit: '' });  // the program types it
	assert.equal((await s.view()).predicting, false);
	assert.equal(c.calls.at(-1), 'other');  // what comes next follows a Latin run
	assert.equal((await s.key(k('2'))).eaten, false);
	// While composing a digit still picks.
	await type(s, 'ma');
	assert.equal((await s.key(k('1'))).commit, 'MA');
});

test('keys: zhuyin: Shift+digit after a commit is its mark, not a word offered', async () => {
	const { s } = make({ layout: 'zhuyin', prediction: true });
	await type(s, 'ni');
	await s.key(k(' '));
	assert.equal((await s.view()).predicting, true);
	const mark = await s.key(k('!', { shift: true, digit: 1 }));
	assert.equal(mark.commit, '！');
	assert.notEqual(mark.commit, '甲');
});

test('keys: pages of candidates, the highlight, ‹ ›', async () => {
	const { s } = make({}, 7);
	await type(s, 'ab');
	let v = await s.view();
	assert.deepEqual([v.candidates.length, v.more, v.prev, v.pageStart], [3, true, false, 0]);
	await s.key(k('PageDown'));
	v = await s.view();
	assert.deepEqual([v.highlight, v.prev, v.pageStart], [0, true, 3]);
	await s.key(k('ArrowDown'));
	assert.equal((await s.view()).highlight, 1);
	assert.equal((await s.key(k('1'))).commit, 'ab·4');  // a digit picks on the page shown
	await type(s, 'ab');
	s.page(1);
	s.page(1);
	assert.equal((await s.view()).pageStart, 6);
	s.page(1);  // no page past the last
	assert.equal((await s.view()).pageStart, 6);
	assert.equal(await s.pick(0), 'ab·7');
});

test('keys: zhuyin picks with Shift+digit (the digit key, or its character), its digits are keys', async () => {
	const { s } = make({ layout: 'zhuyin' }, 3);
	await type(s, 'ab');
	assert.equal((await s.key(k('@', { shift: true }))).commit, 'ab·2');
	await type(s, 'ab');
	assert.equal((await s.key(k('"', { shift: true, digit: 3 }))).commit, 'ab·3');  // another keyboard's Shift+3
});

test('keys: English mode leaves letters and marks to the program', async () => {
	const { s } = make({ english: true });
	assert.equal(s.eats(k('a')), false);
	assert.equal(s.eats(k(',')), false);
});

test('keys: Korean: another key or Enter puts the syllable in and the key goes on as typed', async () => {
	const { s } = make({ layout: 'korean' });
	await type(s, 'gk');
	assert.deepEqual(await s.key(k('?')), { eaten: true, commit: '', typeKey: true });
	await type(s, 'gk');
	assert.equal((await s.key(k('Enter'))).typeKey, true);
});

test('keys: flush and reset; the panel\'s sign', async () => {
	const { s } = make();
	await type(s, 'ni');
	assert.equal(await s.flush(), 'ni');
	await type(s, 'ni');
	await s.reset();
	assert.equal(s.composing, false);
	assert.equal(badgeOf('pinyin', true), '中 · 繁');
	assert.equal(badgeOf('wubi', true), '中 · 簡');
	assert.equal(badgeOf('zhuyin', false), '中 · 繁');
});

test('punctuation: quotes open and close in turn; a preview turns none', () => {
	const p = new Punctuator();
	assert.equal(p.preview('"', 'pinyin', true), '「');
	assert.equal(p.mark('"', 'pinyin', true), '「');
	assert.equal(p.mark('"', 'pinyin', true), '」');
	assert.equal(p.mark('"', 'pinyin', false), '“');
	assert.equal(p.mark('$', 'pinyin', false), '￥');
	assert.equal(p.mark('$', 'pinyin', true), '$');
	assert.equal(p.mark('<', 'zhuyin', true), '，');
	assert.equal(p.mark(',', 'korean', false), ',');
	assert.equal(p.mark('/', 'japanese', false), '・');
});

test('keys: the composer is told what comes next only when it changes (no request per caret move)', async () => {
	const { s, c } = make();
	for (const key of ['ArrowLeft', 'ArrowRight', 'Home']) await s.key(k(key));
	assert.equal(c.calls.filter(x => x === 'forget').length, 0);  // fresh already
	for (const key of 'abc') await s.passed(k(key.toUpperCase()));
	assert.equal(c.calls.filter(x => x === 'other').length, 1);  // one Latin run
	await s.key(k('ArrowLeft'));
	await s.key(k('ArrowLeft'));
	assert.equal(c.calls.filter(x => x === 'forget').length, 1);
	await type(s, 'ni');
	await s.key(k(' '));
	await s.key(k('ArrowLeft'));
	assert.equal(c.calls.filter(x => x === 'forget').length, 2);  // after a commit: told again
});
