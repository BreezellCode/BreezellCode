import assert from 'node:assert/strict';
import { suite, test } from 'node:test';
import { Island, IslandApi, IslandHost, IslandSurface, IslandWindow } from '../src/island';
import { COLLAPSE_MS, ConversationState, DIGEST_STALE_MS, EXPAND_MS, FLY_IN_MS, FLY_OUT_MS, IDLE, IslandActivity, IslandFocus, MORPH_MS, OUTSIDE_HEIGHT, outsideRect, panelRect, Rect, WindowDigest } from '../src/logic';

/*
 * The island's choreography with stand-ins for Breezell that behave as it does: a move takes
 * its time and a new one stops the one under way; windows and pages answer as they would; other
 * editor windows are broadcasts. The clock is the test's.
 */

type Listener<T> = (value: T) => unknown;
class Emitter<T> {
	private readonly _listeners = new Set<Listener<T>>();
	readonly event = (listener: Listener<T>) => {
		this._listeners.add(listener);
		return { dispose: () => this._listeners.delete(listener) };
	};
	fire(value: T): void {
		for (const l of [...this._listeners]) {
			l(value);
		}
	}
}

const flush = async () => {
	for (let i = 0; i < 20; i++) {
		await new Promise(resolve => setImmediate(resolve));
	}
};

const AREA: Rect = { x: 0, y: 0, width: 1600, height: 900 };
const TITLEBAR_RECT: Rect = { x: 690, y: 4, width: 220, height: 26 };
const ME = 1;
const OTHER = 2;

class FakeOverlay implements IslandWindow {
	readonly calls: string[] = [];
	readonly sent: Record<string, unknown>[] = [];
	bounds: Rect | undefined;
	visible = false;
	closed = false;
	activated = 0;
	private _move: (() => void) | undefined;
	readonly messages = new Emitter<unknown>();
	readonly closes = new Emitter<void>();
	readonly deactivations = new Emitter<void>();
	readonly onDidReceiveMessage = this.messages.event;
	readonly onDidClose = this.closes.event;
	readonly onDidDeactivate = this.deactivations.event;
	async postMessage(message: unknown) { this.sent.push(message as Record<string, unknown>); return true; }
	setBounds(bounds: Rect, options?: { durationMs?: number }): Promise<void> {
		this._move?.();
		this._move = undefined;
		this.calls.push(`bounds ${bounds.x},${bounds.y},${bounds.width}x${bounds.height}${options?.durationMs ? ` in ${options.durationMs}` : ''}`);
		this.bounds = bounds;
		if (!options?.durationMs) {
			return Promise.resolve();
		}
		return new Promise(resolve => { this._move = resolve; });
	}
	/** The move under way reaches its end. */
	arrive(): void {
		this._move?.();
		this._move = undefined;
	}
	async show() { this.calls.push('show'); this.visible = true; }
	async hide() { this.calls.push('hide'); this.visible = false; }
	async close() { this.calls.push('close'); this.closed = true; this.closes.fire(); }
	async activate() { this.calls.push('activate'); this.activated++; }
	says(message: unknown): void { this.messages.fire(message); }
	/** The last state its page was told. */
	get state(): Record<string, unknown> {
		return [...this.sent].reverse().find(m => m.type === 'state')!;
	}
}

class FakeTitlebar implements IslandSurface {
	readonly surfaceId = 'titlebar';
	readonly sent: Record<string, unknown>[] = [];
	readonly messages = new Emitter<unknown>();
	readonly closes = new Emitter<void>();
	readonly onDidReceiveMessage = this.messages.event;
	readonly onDidClose = this.closes.event;
	rect: Rect | undefined = TITLEBAR_RECT;
	async postMessage(message: unknown) { this.sent.push(message as Record<string, unknown>); return true; }
	async screenRect() { return this.rect; }
	get away(): unknown {
		return [...this.sent].reverse().find(m => m.type === 'state')?.away;
	}
}

interface Options {
	supported?: boolean;
	overlay?: 'granted' | 'denied' | 'ask';
	chatRead?: 'granted' | 'denied' | 'ask';
	allow?: boolean;
	floatOutside?: boolean;
	reduceMotion?: boolean;
	focus?: Omit<IslandFocus, 'windowId'>;
	noTitlebar?: boolean;
	conversations?: { id: string; title: string; updatedAt: string; activity: ConversationState; reply?: string }[];
}

function harness(options: Options = {}) {
	const focus = new Emitter<IslandFocus>();
	const activity = new Emitter<IslandActivity>();
	const surfaces = new Emitter<IslandSurface>();
	const permissions = new Emitter<void>();
	const settings = new Emitter<void>();
	const looks = new Emitter<void>();
	const languages = new Emitter<string>();
	const broadcasts = new Emitter<{ fromWindow: number; message: unknown }>();
	const conversationChanges = new Emitter<{ conversationId: string; activity: ConversationState; streaming?: { text: string } }>();
	const grants: Record<string, 'granted' | 'denied' | 'ask'> = { 'ui.overlay': options.overlay ?? 'granted', 'chat.read': options.chatRead ?? 'denied' };
	let floatOutside = options.floatOutside ?? true;
	let currentFocus: IslandFocus = { ...(options.focus ?? { editorFocused: true, lastUsed: true }), windowId: ME };
	let clock = 1_000_000;
	let nextTimer = 1;
	const timers = new Map<number, { at: number; run: () => void }>();
	const log: string[] = [];
	const asked: string[] = [];
	const notes: string[] = [];
	const reveals: string[] = [];
	const icons: string[] = [];
	const focused: (number | undefined)[] = [];
	const shown: string[] = [];
	const said: Record<string, unknown>[] = [];
	const overlays: FakeOverlay[] = [];
	const memento = new Map<string, unknown>();
	const conversations = new Map((options.conversations ?? []).map(c => [c.id, c]));
	const api: IslandApi = {
		language: 'en',
		onDidChangeLanguage: languages.event,
		permissionState: async (p: string) => grants[p] ?? 'denied',
		requestPermission: async (p: string) => {
			asked.push(p);
			grants[p] = options.allow === false ? 'denied' : 'granted';
			return grants[p] === 'granted';
		},
		onDidChangePermissions: permissions.event,
		ui: { onDidOpenSurface: surfaces.event },
		app: { focus: async () => currentFocus, onDidChangeFocus: focus.event },
		activity: {
			current: async () => IDLE,
			onDidChange: activity.event,
			modelIcon: async m => { icons.push(`${m.provider}/${m.name}`); return '<svg/>'; },
			reveal: async t => { reveals.push(t ?? 'agent'); },
		},
		chat: {
			listConversations: async () => [...conversations.values()].map(({ reply: _reply, ...c }) => c),
			getConversation: async (id: string) => {
				const c = conversations.get(id)!;
				return { ...c, messages: [{ kind: 'user', text: 'hi' }, { kind: 'assistant', text: c.reply ?? '' }] };
			},
			onDidChangeConversation: conversationChanges.event,
			show: async (id: string) => { shown.push(id); },
		},
		windows: {
			open: async () => {
				if (grants['ui.overlay'] !== 'granted') {
					throw Object.assign(new Error('denied'), { name: 'BreezellPermissionDenied' });
				}
				const overlay = new FakeOverlay();
				overlays.push(overlay);
				// Its page says hello once loaded.
				setImmediate(() => overlay.says({ hello: true }));
				return overlay;
			},
			overlaySupported: async () => options.supported ?? true,
			workArea: async () => AREA,
			focusEditor: async (windowId?: number) => { focused.push(windowId); },
			broadcast: async (message: unknown) => { said.push(message as Record<string, unknown>); return true; },
			onDidReceiveBroadcast: broadcasts.event,
		},
	};
	const host: IslandHost = {
		api,
		floatOutside: () => floatOutside,
		onDidChangeSettings: settings.event,
		look: () => 'dark',
		onDidChangeLook: looks.event,
		title: () => 'my-project',
		reduceMotion: () => options.reduceMotion === true,
		memento: { get: <T>(key: string) => memento.get(key) as T | undefined, update: async (key: string, value: unknown) => { memento.set(key, value); } },
		note: text => notes.push(text),
		log: text => log.push(text),
		delay: () => Promise.resolve(),
		now: () => clock,
		later: (ms, run) => {
			const id = nextTimer++;
			timers.set(id, { at: clock + ms, run });
			return { dispose: () => timers.delete(id) };
		},
	};
	const island = new Island(host);
	const titlebar = new FakeTitlebar();
	return {
		island, titlebar, overlays, asked, notes, reveals, icons, log, memento, focused, shown, said, conversationChanges,
		/** Deleted in Breezell: no event, it is just no longer listed. */
		deleteConversation: (id: string) => conversations.delete(id),
		get overlay() { return overlays[overlays.length - 1]; },
		async start() {
			await island.start();
			if (!options.noTitlebar) {
				surfaces.fire(titlebar);
			}
			await flush();
		},
		/** The clock moves on; what was due runs. */
		async tick(ms: number) {
			const end = clock + ms;
			for (; ;) {
				// What is under way settles first: it may set timers of its own.
				await flush();
				const due = [...timers.entries()].filter(([, t]) => t.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
				if (!due) {
					break;
				}
				timers.delete(due[0]);
				clock = due[1].at;
				due[1].run();
				await flush();
			}
			clock = end;
			await flush();
		},
		async focus(next: Omit<IslandFocus, 'windowId'>) {
			currentFocus = { ...next, windowId: ME };
			focus.fire(currentFocus);
			await flush();
		},
		async activity(next: IslandActivity) {
			activity.fire(next);
			await flush();
		},
		async hear(fromWindow: number, message: unknown) {
			broadcasts.fire({ fromWindow, message });
			await flush();
		},
		async setFloatOutside(value: boolean) {
			floatOutside = value;
			settings.fire();
			await flush();
		},
		async revoke(permission = 'ui.overlay') {
			grants[permission] = 'denied';
			permissions.fire();
			await flush();
		},
	};
}

const LEFT = { editorFocused: false, lastUsed: true };
const BACK = { editorFocused: true, lastUsed: true };
const OUT = outsideRect(AREA, 220, OUTSIDE_HEIGHT);
const at = (r: Rect, ms?: number) => `bounds ${r.x},${r.y},${r.width}x${r.height}${ms ? ` in ${ms}` : ''}`;
const working = (conversationId = 'c', model?: { provider: string; name: string }): IslandActivity => ({ agent: { kind: 'working', conversationId, step: { kind: 'thinking' }, conversations: 1, startedAt: 1, ...(model ? { model } : {}) } });
const digest = (windowId: number, activity: IslandActivity, over: Partial<WindowDigest> = {}): WindowDigest => ({ windowId, title: `window ${windowId}`, activity, conversations: [], readsChat: false, at: 0, ...over });

/** Out, arrived, its page settled. */
async function outside(h: ReturnType<typeof harness>) {
	await h.start();
	await h.focus(LEFT);
	h.overlay.arrive();
	await flush();
}

suite('the island flies out of the window and back', () => {
	test('leaving Breezell: it starts on the title bar\'s island, covers it, and flies to the top of the screen', async () => {
		const h = harness();
		await h.start();
		assert.equal(h.overlays.length, 0, 'nothing opens while the user is in Breezell');
		await h.focus(LEFT);
		const o = h.overlay;
		assert.deepEqual(o.calls, [at(TITLEBAR_RECT), 'show', at(OUT, FLY_OUT_MS)]);
		assert.equal(h.titlebar.away, true, 'the title bar\'s island steps away under the overlay');
		assert.ok(o.sent.some(m => m.type === 'fly' && m.to === 'outside'));
		o.arrive();
		await flush();
		assert.equal(o.visible, true);
	});

	test('coming back: it flies onto the title bar, which shows again, and only then goes', async () => {
		const h = harness();
		await outside(h);
		await h.focus(BACK);
		const o = h.overlay;
		assert.equal(o.calls.at(-1), at(TITLEBAR_RECT, FLY_IN_MS));
		assert.equal(h.titlebar.away, true, 'still away while it flies');
		assert.equal(o.visible, true);
		o.arrive();
		await flush();
		assert.equal(h.titlebar.away, false);
		assert.equal(o.calls.at(-1), 'hide');
		assert.equal(o.visible, false);
		assert.equal(h.overlays.length, 1, 'the same overlay next time');
	});

	test('the window used last sends its island out; the others keep theirs', async () => {
		const h = harness();
		await h.start();
		await h.focus({ editorFocused: false, lastUsed: false });
		assert.equal(h.overlays.length, 0);
		await h.focus({ editorFocused: true, lastUsed: false });
		assert.equal(h.overlays.length, 0, 'another Breezell window has the focus: in');
	});

	test('in and out in quick succession: it ends where the user is, never stranded', async () => {
		const h = harness();
		await h.start();
		await h.focus(LEFT);
		await h.focus(BACK);
		await h.focus(LEFT);
		const o = h.overlay;
		assert.equal(o.visible, true);
		assert.equal(o.calls.at(-1), at(OUT, FLY_OUT_MS), 'it turns round from where it was, without jumping back to the title bar');
		assert.equal(h.titlebar.away, true);
		o.arrive();
		await h.focus(BACK);
		await h.focus(LEFT);
		await h.focus(BACK);
		o.arrive();
		await flush();
		assert.equal(o.visible, false);
		assert.equal(h.titlebar.away, false);
	});

	test('back before the overlay could even open: the title bar keeps its island', async () => {
		const h = harness();
		await h.start();
		const pending = h.focus(LEFT);
		await h.focus(BACK);
		await pending;
		await flush();
		for (const o of h.overlays) {
			assert.equal(o.visible, false);
		}
		assert.notEqual(h.titlebar.away, true);
	});

	test('without its page in the title bar, it comes down from above the screen and goes back up', async () => {
		const h = harness({ noTitlebar: true });
		await h.start();
		await h.focus(LEFT);
		const o = h.overlay;
		assert.ok(o.calls[0].startsWith('bounds 690,-'), o.calls[0]);
		h.overlay.arrive();
		await h.focus(BACK);
		assert.ok(/^bounds 690,-\d+,220x26 in /.test(o.calls.at(-1)!), o.calls.at(-1));
	});

	test('outside, it takes the width its page asks for, centred, with the morph', async () => {
		const h = harness();
		await outside(h);
		h.overlay.says({ width: 300 });
		await flush();
		assert.equal(h.overlay.calls.at(-1), at(outsideRect(AREA, 300, OUTSIDE_HEIGHT), MORPH_MS));
	});

	test('with reduce motion on, it goes at once', async () => {
		const h = harness({ reduceMotion: true });
		await h.start();
		await h.focus(LEFT);
		assert.deepEqual(h.overlay.calls, [at(TITLEBAR_RECT), 'show', at(OUT)]);
	});
});

suite('when it stays in', () => {
	test('on a Wayland session: never an overlay, and the user is told once', async () => {
		const h = harness({ supported: false });
		await h.start();
		await h.focus(LEFT);
		assert.equal(h.overlays.length, 0);
		assert.equal(h.notes.length, 1);
		assert.ok(h.notes[0].includes('Wayland'));
		const again = harness({ supported: false });
		(again.memento as Map<string, unknown>).set('island.waylandNoted', true);
		await again.start();
		assert.equal(again.notes.length, 0);
	});

	test('ui.overlay is asked for while the user is in Breezell, never after they left', async () => {
		const asked = harness({ overlay: 'ask' });
		await asked.start();
		assert.deepEqual(asked.asked, ['ui.overlay']);
		const away = harness({ overlay: 'ask', focus: LEFT });
		await away.start();
		assert.deepEqual(away.asked, [], 'started while away: asked later, when the user is back');
		assert.equal(away.overlays.length, 0);
		await away.focus(BACK);
		assert.deepEqual(away.asked, ['ui.overlay'], 'asked the moment the user is back');
		await away.focus(LEFT);
		assert.equal(away.overlays.length, 1, 'allowed: out it goes');
	});

	test('refused: it stays in, and reading the conversations is not asked for either', async () => {
		const h = harness({ overlay: 'ask', chatRead: 'ask', allow: false });
		await h.start();
		await h.focus(LEFT);
		assert.equal(h.overlays.length, 0);
		assert.notEqual(h.titlebar.away, true);
		assert.deepEqual(h.asked, ['ui.overlay']);
	});

	test('turned off while out, or the permission turned off: the overlay closes and the island is back', async () => {
		const h = harness();
		await outside(h);
		await h.setFloatOutside(false);
		assert.equal(h.overlay.closed, true);
		assert.equal(h.titlebar.away, false);
		await h.focus(BACK);
		await h.focus(LEFT);
		assert.equal(h.overlays.length, 1, 'off: no new overlay');

		const r = harness();
		await outside(r);
		await r.revoke();
		assert.equal(r.overlay.closed, true);
		assert.equal(r.titlebar.away, false);
	});

	test('the overlay closed by Breezell (the plugin blocked, its window gone): the island is back', async () => {
		const h = harness();
		await outside(h);
		await h.overlay.close();
		await flush();
		assert.equal(h.titlebar.away, false);
	});
});

suite('several Breezell windows', () => {
	test('each window tells the others what it does; a new one asks them first', async () => {
		const h = harness();
		await h.start();
		assert.deepEqual(h.said[0], { type: 'hello' });
		const mine = h.said.find(m => m.type === 'digest')!.digest as WindowDigest;
		assert.equal(mine.windowId, ME);
		assert.equal(mine.title, 'my-project');
		h.said.length = 0;
		await h.activity(working());
		assert.equal(h.said.length, 0, 'not at once: a moment later, together with what else changes');
		await h.tick(300);
		assert.equal((h.said.at(-1)!.digest as WindowDigest).activity.agent.kind, 'working');
		h.said.length = 0;
		await h.hear(OTHER, { type: 'hello' });
		assert.equal(h.said.at(-1)!.type, 'digest', 'a hello is answered');
	});

	test('the island outside shows every window: the most pressing first, the chats counted together', async () => {
		const h = harness();
		await outside(h);
		await h.activity(working('a'));
		await h.hear(OTHER, { type: 'digest', digest: digest(OTHER, { agent: { kind: 'working', conversationId: 'b', step: { kind: 'writing' }, conversations: 2, startedAt: 5 } }) });
		await h.tick(300);
		const state = h.overlay.state;
		assert.equal((state.activity as IslandActivity).agent.kind, 'working');
		assert.equal(((state.activity as IslandActivity).agent as { conversations: number }).conversations, 3);
		assert.deepEqual((state.windows as WindowDigest[]).map(w => w.windowId), [ME, OTHER], 'this window first');
		await h.hear(OTHER, { type: 'digest', digest: digest(OTHER, { agent: { kind: 'awaitingUser', conversationId: 'b', conversations: 1 } }) });
		assert.equal((h.overlay.state.activity as IslandActivity).agent.kind, 'awaitingUser', 'waiting on the user wins, whichever window');
	});

	test('a window that says goodbye, or nothing for a long time, drops out', async () => {
		const h = harness();
		await outside(h);
		await h.hear(OTHER, { type: 'digest', digest: digest(OTHER, IDLE) });
		await h.hear(3, { type: 'digest', digest: digest(3, IDLE) });
		assert.equal((h.overlay.state.windows as WindowDigest[]).length, 3);
		await h.hear(3, { type: 'bye', windowId: 3 });
		assert.equal((h.overlay.state.windows as WindowDigest[]).length, 2);
		await h.tick(DIGEST_STALE_MS + 1000);
		assert.deepEqual((h.overlay.state.windows as WindowDigest[]).map(w => w.windowId), [ME]);
	});

	test('a digest that names another window than its sender is ignored', async () => {
		const h = harness();
		await outside(h);
		await h.hear(OTHER, { type: 'digest', digest: digest(5, IDLE) });
		await h.hear(OTHER, { type: 'nonsense' });
		await h.hear(OTHER, null);
		assert.deepEqual((h.overlay.state.windows as WindowDigest[]).map(w => w.windowId), [ME]);
	});
});

suite('the panel', () => {
	test('a click opens it at the top of the screen, and it takes the keyboard once open', async () => {
		const h = harness();
		await outside(h);
		h.overlay.says({ panelHeight: 220 });
		h.overlay.says({ expand: true });
		await flush();
		assert.equal(h.overlay.state.expanded, true);
		assert.equal(h.overlay.calls.at(-1), at(panelRect(AREA, 220), EXPAND_MS));
		assert.equal(h.overlay.activated, 0, 'not before it has opened');
		h.overlay.arrive();
		await flush();
		assert.equal(h.overlay.activated, 1);
	});

	test('a click elsewhere, or Escape, closes it back into the pill', async () => {
		const h = harness();
		await outside(h);
		h.overlay.says({ expand: true });
		await flush();
		h.overlay.arrive();
		await flush();
		h.overlay.deactivations.fire();
		await flush();
		assert.equal(h.overlay.state.expanded, false);
		assert.equal(h.overlay.calls.at(-1), at(OUT, COLLAPSE_MS));
		h.overlay.arrive();
		await flush();
		h.overlay.says({ expand: true });
		await flush();
		h.overlay.arrive();
		h.overlay.says({ collapse: true });
		await flush();
		assert.equal(h.overlay.state.expanded, false);
	});

	test('it follows what it lists: a taller list, a taller panel', async () => {
		const h = harness();
		await outside(h);
		h.overlay.says({ expand: true });
		await flush();
		h.overlay.arrive();
		await flush();
		h.overlay.says({ panelHeight: 300 });
		await flush();
		assert.equal(h.overlay.calls.at(-1), at(panelRect(AREA, 300), MORPH_MS));
	});

	test('not while it flies, nor in the title bar', async () => {
		const h = harness();
		await h.start();
		await h.focus(LEFT);
		h.overlay.says({ expand: true });
		await flush();
		assert.equal(h.overlay.state.expanded, false, 'still on its way out');
	});

	test('coming back closes it as it flies home', async () => {
		const h = harness();
		await outside(h);
		h.overlay.says({ expand: true });
		await flush();
		h.overlay.arrive();
		await flush();
		await h.focus(BACK);
		assert.equal(h.overlay.state.expanded, false);
		assert.equal(h.overlay.calls.at(-1), at(TITLEBAR_RECT, FLY_IN_MS));
	});

	test('its buttons: back to the editor, to another window, a conversation in either, a task', async () => {
		const h = harness({ chatRead: 'granted' });
		await outside(h);
		h.overlay.says({ back: true });
		h.overlay.says({ goWindow: OTHER });
		h.overlay.says({ openConversation: { windowId: ME, conversationId: 'mine' } });
		h.overlay.says({ openConversation: { windowId: OTHER, conversationId: 'theirs' } });
		h.overlay.says({ revealTask: OTHER });
		h.overlay.says({ revealTask: ME });
		await flush();
		assert.deepEqual(h.focused, [undefined, OTHER, ME, OTHER, OTHER]);
		assert.deepEqual(h.shown, ['mine']);
		assert.ok(h.said.some(m => m.type === 'show' && m.windowId === OTHER && m.conversationId === 'theirs'));
		assert.ok(h.said.some(m => m.type === 'revealTask' && m.windowId === OTHER));
		assert.deepEqual(h.reveals, ['task']);
	});

	test('another window asks this one to show its conversation or its task', async () => {
		const h = harness({ chatRead: 'granted' });
		await h.start();
		await h.hear(OTHER, { type: 'show', windowId: ME, conversationId: 'c7' });
		await h.hear(OTHER, { type: 'show', windowId: 9, conversationId: 'not-mine' });
		await h.hear(OTHER, { type: 'revealTask', windowId: ME });
		assert.deepEqual(h.shown, ['c7']);
		assert.deepEqual(h.reveals, ['task']);
	});
});

suite('the conversations (chat.read)', () => {
	const fresh = () => [
		{ id: 'old', title: 'Fix the parser', updatedAt: new Date(1_000_000 - 60_000).toISOString(), activity: 'idle' as const, reply: 'All **tests** pass now.' },
		{ id: 'busy', title: 'Write the docs', updatedAt: new Date(1_000_000).toISOString(), activity: 'writing' as ConversationState, reply: undefined as string | undefined },
	];

	test('asked for after the overlay, while the user is in Breezell', async () => {
		const h = harness({ overlay: 'ask', chatRead: 'ask' });
		await h.start();
		assert.deepEqual(h.asked, ['ui.overlay', 'chat.read']);
	});

	test('the busy ones first, then the latest; the end of each reply, without markup', async () => {
		const h = harness({ chatRead: 'granted', conversations: fresh() });
		await h.start();
		await h.tick(300);
		const mine = (h.said.filter(m => m.type === 'digest').at(-1)!.digest as WindowDigest);
		assert.equal(mine.readsChat, true);
		assert.deepEqual(mine.conversations.map(c => c.id), ['busy', 'old']);
		assert.equal(mine.conversations[1].reply, 'All tests pass now.');
	});

	test('a reply being written shows as it comes; once done, its last words', async () => {
		const conversations = fresh();
		const h = harness({ chatRead: 'granted', conversations });
		await h.start();
		h.conversationChanges.fire({ conversationId: 'busy', activity: 'writing', streaming: { text: 'Here is the first part of the docs' } });
		await h.tick(300);
		let busy = (h.said.filter(m => m.type === 'digest').at(-1)!.digest as WindowDigest).conversations.find(c => c.id === 'busy')!;
		assert.equal(busy.reply, 'Here is the first part of the docs');
		assert.ok(busy.since, 'its clock runs');
		Object.assign(conversations[1], { activity: 'idle', reply: 'Done: the docs are written.' });
		h.conversationChanges.fire({ conversationId: 'busy', activity: 'idle' });
		// Its state at once; its last words once read, told the next moment.
		await h.tick(600);
		busy = (h.said.filter(m => m.type === 'digest').at(-1)!.digest as WindowDigest).conversations.find(c => c.id === 'busy')!;
		assert.equal(busy.state, 'idle');
		assert.equal(busy.reply, 'Done: the docs are written.');
	});

	test('without it, none are read, and the pages are told so', async () => {
		const h = harness({ conversations: fresh() });
		await outside(h);
		await h.tick(300);
		assert.deepEqual((h.said.filter(m => m.type === 'digest').at(-1)!.digest as WindowDigest).conversations, []);
		assert.equal(h.overlay.state.readsChat, false);
	});

	test('a deleted conversation goes once the list is read again: when the panel opens, or a moment later', async () => {
		const conversations = fresh();
		const h = harness({ chatRead: 'granted', conversations });
		await outside(h);
		await h.tick(300);
		const ids = () => ((h.said.filter(m => m.type === 'digest').at(-1)!.digest as WindowDigest).conversations.map(c => c.id));
		assert.deepEqual(ids(), ['busy', 'old']);
		h.deleteConversation('busy');
		h.overlay.says({ expand: true });
		await h.tick(300);
		assert.deepEqual(ids(), ['old']);
		assert.ok(h.said.some(m => m.type === 'refresh'), 'the other windows read theirs again too');
		h.deleteConversation('old');
		await h.tick(16_000);
		assert.deepEqual(ids(), [], 'without the panel: at the next heartbeat');
	});

	test('another window\'s panel opened: this one reads its conversations again', async () => {
		const h = harness({ chatRead: 'granted', conversations: fresh() });
		await h.start();
		await h.tick(300);
		h.deleteConversation('old');
		await h.hear(OTHER, { type: 'refresh' });
		await h.tick(300);
		assert.deepEqual((h.said.filter(m => m.type === 'digest').at(-1)!.digest as WindowDigest).conversations.map(c => c.id), ['busy']);
	});

	test('turned off: what was read is forgotten', async () => {
		const h = harness({ chatRead: 'granted', conversations: fresh() });
		await h.start();
		await h.revoke('chat.read');
		await h.tick(300);
		const mine = h.said.filter(m => m.type === 'digest').at(-1)!.digest as WindowDigest;
		assert.equal(mine.readsChat, false);
		assert.deepEqual(mine.conversations, []);
	});
});

suite('what the pages hear and ask', () => {
	test('the title bar hears its window at once; the model\'s mark is asked for once per model', async () => {
		const h = harness();
		await outside(h);
		const busy = working('c', { provider: 'anthropic', name: 'claude' });
		await h.activity(busy);
		await h.activity({ agent: { ...busy.agent, step: { kind: 'writing' } } as IslandActivity['agent'] });
		assert.deepEqual(h.icons, ['anthropic/claude']);
		const last = [...h.titlebar.sent].reverse().find(m => m.type === 'state')!;
		assert.equal(last.modelIcon, '<svg/>');
		assert.equal(((last.activity as IslandActivity).agent as { step: { kind: string } }).step.kind, 'writing');
		await h.tick(300);
		assert.equal(h.overlay.state.modelIcon, '<svg/>');
	});

	test('View in the title bar opens what it is about', async () => {
		const h = harness();
		await h.start();
		h.titlebar.messages.fire({ reveal: 'agent' });
		h.titlebar.messages.fire({ reveal: 'elsewhere' });
		await flush();
		assert.deepEqual(h.reveals, ['agent']);
	});

	test('the title bar\'s page saying hello gets the state again', async () => {
		const h = harness();
		await h.start();
		const before = h.titlebar.sent.length;
		h.titlebar.messages.fire({ hello: true });
		await flush();
		assert.equal(h.titlebar.sent.length, before + 1);
	});

	test('gone: no more moves, the overlay closes, and the other windows hear goodbye', async () => {
		const h = harness();
		await outside(h);
		h.island.dispose();
		await flush();
		assert.equal(h.overlay.closed, true);
		assert.deepEqual(h.said.at(-1), { type: 'bye', windowId: ME });
		await h.focus(BACK);
		assert.equal(h.overlay.calls.includes(at(TITLEBAR_RECT, FLY_IN_MS)), false);
	});
});
