import assert from 'node:assert/strict';
import { suite, test } from 'node:test';
import { aboveScreen, BUBBLE_ROOM, bubbleTask, capsuleWidth, combinedActivity, ConversationDigest, conversationsToShow, DIGEST_STALE_MS, IDLE, IslandActivity, islandPlace, islandView, islandWidth, liveWindows, MAX_WIDTH, OUTSIDE_HEIGHT, OUTSIDE_TOP, outsideRect, panelRect, panelSummary, PANEL_MAX_HEIGHT, PANEL_MIN_HEIGHT, PANEL_WIDTH, replyExcerpt, REST_WIDTH, formatElapsed, WindowDigest } from '../src/logic';
import { ISLAND_STRINGS, islandStrings } from '../src/strings';

const en = islandStrings('en');
const working = (over: Partial<Extract<IslandActivity['agent'], { kind: 'working' }>> = {}): IslandActivity => ({
	agent: { kind: 'working', conversationId: 'c1', step: { kind: 'thinking' }, conversations: 1, startedAt: 1000, ...over },
});

suite('what the island shows', () => {
	test('nothing at rest: the title shows', () => {
		assert.equal(islandView(IDLE, en), undefined);
	});

	test('working: the step in words, the model or a sparkle, the wave and the clock', () => {
		const view = islandView(working({ step: { kind: 'editing', file: 'app.ts' }, model: { provider: 'anthropic', name: 'claude' } }), en)!;
		assert.equal(view.words, 'Editing app.ts');
		assert.deepEqual(view.parts.map(p => p.kind), ['glyph', 'text', 'fill', 'wave', 'clock']);
		assert.deepEqual(view.parts[0], { kind: 'glyph', glyph: 'model', tone: 'accent' });
		assert.deepEqual(islandView(working(), en)!.parts[0], { kind: 'glyph', glyph: 'sparkle', tone: 'accent' });
		assert.equal(islandView(working({ step: { kind: 'reading' } }), en)!.words, 'Reading files');
	});

	test('from one step to the next only the words change; another conversation or model builds anew', () => {
		const a = islandView(working({ step: { kind: 'thinking' } }), en)!;
		const b = islandView(working({ step: { kind: 'searching' } }), en)!;
		assert.equal(a.key, b.key);
		assert.notEqual(a.words, b.words);
		assert.notEqual(islandView(working({ conversationId: 'c2' }), en)!.key, a.key);
		assert.notEqual(islandView(working({ model: { provider: 'x', name: 'y' } }), en)!.key, a.key);
	});

	test('other conversations at work show as +n', () => {
		const view = islandView(working({ conversations: 3 }), en)!;
		assert.ok(view.parts.some(p => p.kind === 'dim' && p.text === '+2'));
	});

	test('waiting on the user, finished and failed', () => {
		const waiting = islandView({ agent: { kind: 'awaitingUser', conversationId: 'c', conversations: 2 } }, en)!;
		assert.equal(waiting.words, '2 chats waiting for you');
		assert.ok(waiting.parts.some(p => p.kind === 'chip' && p.reveal === 'agent'));
		assert.equal(islandView({ agent: { kind: 'awaitingUser', conversationId: 'c', conversations: 1 } }, en)!.words, 'Waiting for you');
		const done = islandView({ agent: { kind: 'finished', conversationId: 'c', elapsedMs: 75_000 } }, en)!;
		assert.equal(done.words, 'Done');
		assert.ok(done.parts.some(p => p.kind === 'dim' && p.text === 'took 1:15'));
		const failed = islandView({ agent: { kind: 'failed', conversationId: 'c' } }, en)!;
		assert.equal(failed.words, 'Something went wrong');
		assert.ok(failed.parts.some(p => p.kind === 'chip' && p.tone === 'error'));
	});

	test('a task, when the agent is idle; its terminal behind View when it failed', () => {
		const running = islandView({ agent: { kind: 'idle' }, task: { kind: 'running', name: 'build', startedAt: 5, others: 1 } }, en)!;
		assert.equal(running.words, 'build');
		assert.ok(running.parts.some(p => p.kind === 'dim' && p.text === '+1'));
		assert.ok(running.parts.some(p => p.kind === 'clock' && p.since === 5));
		assert.equal(islandView({ agent: { kind: 'idle' }, task: { kind: 'succeeded', name: 'test', elapsedMs: 3000 } }, en)!.words, 'test succeeded');
		const failed = islandView({ agent: { kind: 'idle' }, task: { kind: 'failed', name: 'lint', exitCode: 2 } }, en)!;
		assert.equal(failed.words, 'lint failed');
		assert.ok(failed.parts.some(p => p.kind === 'dim' && p.text === 'exit code 2'));
		assert.ok(failed.parts.some(p => p.kind === 'chip' && p.reveal === 'task'));
	});

	test('the agent comes first; a task beside it goes to the bubble', () => {
		const both: IslandActivity = { ...working(), task: { kind: 'running', name: 'build', startedAt: 1, others: 0 } };
		assert.equal(islandView(both, en)!.words, 'Thinking');
		assert.equal(bubbleTask(both)?.name, 'build');
		assert.equal(bubbleTask({ agent: { kind: 'idle' }, task: { kind: 'running', name: 'build', startedAt: 1, others: 0 } }), undefined, 'alone, the task is the capsule');
		assert.equal(bubbleTask(working()), undefined);
	});

	test('the clock reads minutes and seconds', () => {
		assert.equal(formatElapsed(0), '0:00');
		assert.equal(formatElapsed(59_999), '0:59');
		assert.equal(formatElapsed(61_000), '1:01');
		assert.equal(formatElapsed(-5), '0:00');
	});
});

suite('sizes and places', () => {
	test('the capsule is as wide as what it shows, between rest and the most', () => {
		assert.equal(capsuleWidth(undefined), REST_WIDTH);
		assert.equal(capsuleWidth(10), REST_WIDTH);
		assert.equal(capsuleWidth(300.2), 301);
		assert.equal(capsuleWidth(9999), MAX_WIDTH);
		assert.equal(islandWidth(250, false), 250);
		assert.equal(islandWidth(250, true), 250 + BUBBLE_ROOM);
	});

	test('outside, at the top of the screen in the middle; or just above it', () => {
		const area = { x: 1920, y: 40, width: 2560, height: 1400 };
		assert.deepEqual(outsideRect(area, 260), { x: 1920 + 1150, y: 40 + OUTSIDE_TOP, width: 260, height: OUTSIDE_HEIGHT });
		const above = aboveScreen(area, 260);
		assert.ok(above.y + above.height <= area.y, 'entirely above the work area');
		assert.equal(above.x, outsideRect(area, 260).x);
	});

	test('out only when the user left Breezell from this window, and it can float', () => {
		assert.equal(islandPlace({ editorFocused: true, lastUsed: true }, true), 'inside');
		assert.equal(islandPlace({ editorFocused: false, lastUsed: true }, true), 'outside');
		assert.equal(islandPlace({ editorFocused: false, lastUsed: false }, true), 'inside', 'another window was used last: its island goes out');
		assert.equal(islandPlace({ editorFocused: false, lastUsed: true }, false), 'inside', 'Wayland, turned off, or not allowed');
	});
});

suite('the strings', () => {
	test('every language has every string, with its placeholders', () => {
		const keys = Object.keys(ISLAND_STRINGS.en) as (keyof typeof ISLAND_STRINGS.en)[];
		for (const [language, strings] of Object.entries(ISLAND_STRINGS)) {
			assert.deepEqual(Object.keys(strings).sort(), [...keys].sort(), language);
			for (const key of keys) {
				assert.ok(strings[key].trim(), `${language}.${key}`);
				assert.equal(strings[key].includes('{0}'), ISLAND_STRINGS.en[key].includes('{0}'), `${language}.${key} keeps {0}`);
			}
		}
	});

	test('Breezell\'s languages, and English for any other', () => {
		assert.deepEqual(Object.keys(ISLAND_STRINGS).sort(), ['en', 'es', 'ja', 'ko', 'pt-BR', 'ru', 'zh-CN', 'zh-TW']);
		assert.equal(islandStrings('zh-TW').finished, '已完成');
		assert.equal(islandStrings('xx').finished, 'Done');
		assert.equal(islandStrings(undefined).finished, 'Done');
	});
});

const win = (windowId: number, activity: IslandActivity, at = 0): WindowDigest => ({ windowId, title: `w${windowId}`, activity, conversations: [], readsChat: false, at });

suite('several windows at once', () => {
	test('the most pressing agent activity of any window; the chats of that kind counted together', () => {
		const a = win(1, working({ conversations: 2 }));
		const b = win(2, { agent: { kind: 'working', conversationId: 'x', step: { kind: 'writing' }, conversations: 1, startedAt: 9 } }, 5);
		const c = win(3, { agent: { kind: 'finished', conversationId: 'y', elapsedMs: 1 } });
		const both = combinedActivity([a, b, c]);
		assert.equal(both.agent.kind, 'working');
		assert.equal((both.agent as { conversations: number }).conversations, 3);
		assert.equal((both.agent as { conversationId: string }).conversationId, 'x', 'the one heard from last');
		const waiting = combinedActivity([a, win(4, { agent: { kind: 'awaitingUser', conversationId: 'z', conversations: 1 } })]);
		assert.equal(waiting.agent.kind, 'awaitingUser');
		assert.deepEqual(combinedActivity([]), IDLE);
	});

	test('the task of any window, a running one first', () => {
		const t = combinedActivity([win(1, { agent: { kind: 'idle' }, task: { kind: 'succeeded', name: 'a', elapsedMs: 1 } }), win(2, { agent: { kind: 'idle' }, task: { kind: 'running', name: 'b', startedAt: 1, others: 0 } })]);
		assert.equal(t.task?.name, 'b');
	});

	test('windows that went quiet drop out; the one used last comes first', () => {
		const now = 100_000;
		const list = liveWindows([win(3, IDLE, now), win(1, IDLE, now - DIGEST_STALE_MS - 1), win(2, IDLE, now), win(5, IDLE, now)], now, 5);
		assert.deepEqual(list.map(w => w.windowId), [5, 2, 3]);
	});

	test('the panel\'s headline: all quiet, or who waits and how many run', () => {
		assert.equal(panelSummary([win(1, IDLE)], en), 'All quiet');
		assert.equal(panelSummary([win(1, working({ conversations: 2 })), win(2, { agent: { kind: 'awaitingUser', conversationId: 'a', conversations: 1 } })], en), 'Waiting for you · 2 running');
		assert.equal(panelSummary([win(1, { agent: { kind: 'idle' }, task: { kind: 'running', name: 'build', startedAt: 1, others: 0 } })], en), 'build');
		assert.equal(panelSummary([win(1, IDLE)], islandStrings('zh-TW')), '相安無事');
	});
});

suite('the panel\'s lists', () => {
	const conv = (id: string, state: ConversationDigest['state'], updatedAt: number): ConversationDigest => ({ id, title: id, state, updatedAt });

	test('busy conversations first (one waiting on the user at the top), then the latest finished ones', () => {
		const now = 10_000_000;
		const list = conversationsToShow([conv('done-old', 'idle', now - 60 * 60_000), conv('done', 'idle', now - 1000), conv('writing', 'writing', now - 5), conv('asks', 'awaitingApproval', now - 50), conv('done2', 'idle', now - 2000), conv('done3', 'idle', now - 3000)], now);
		assert.deepEqual(list.map(c => c.id), ['asks', 'writing', 'done', 'done2']);
	});

	test('a reply\'s last words, without code or markup', () => {
		assert.equal(replyExcerpt('**Done.** See `parse()` in [the file](a.ts).'), 'Done. See parse() in the file.');
		assert.equal(replyExcerpt('Before\n```ts\nconst x = 1;\n```\nAfter'), 'Before After');
		assert.equal(replyExcerpt('# Title\n- one\n- two'), 'Title one two');
		assert.equal(replyExcerpt(''), undefined);
		assert.equal(replyExcerpt('```\nonly code'), undefined, 'an unfinished code block is still code');
		const long = replyExcerpt('word '.repeat(100), 40)!;
		assert.ok(long.startsWith('…') && long.length <= 40, long);
	});

	test('the panel opens at the top of the screen, as tall as it lists, within bounds', () => {
		const area = { x: 0, y: 0, width: 1000, height: 800 };
		assert.deepEqual(panelRect(area, 200), { x: 290, y: OUTSIDE_TOP, width: PANEL_WIDTH, height: 200 });
		assert.equal(panelRect(area, 5).height, PANEL_MIN_HEIGHT);
		assert.equal(panelRect(area, 5000).height, PANEL_MAX_HEIGHT);
	});
});
