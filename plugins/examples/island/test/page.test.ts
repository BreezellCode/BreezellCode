import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, suite, test } from 'node:test';
import { JSDOM } from 'jsdom';
import { IslandActivity, REST_WIDTH } from '../src/logic';

/*
 * The two pages as Breezell runs them (bundled, in a DOM): what they show, what they ask for.
 * Layout cannot be measured here, so widths are those of an island with nothing measured.
 */

const html = (name: string) => readFileSync(join(__dirname, '..', '..', 'ui', `${name}.html`), 'utf8').replace(/<link[^>]*>/g, '').replace(/<script[^>]*><\/script>/g, '');
const script = (name: string) => readFileSync(join(__dirname, `${name}.js`), 'utf8');

/** What a page sent, as an object of this realm (the page's has its own Object). */
const ours = (m: unknown): Record<string, unknown> => JSON.parse(JSON.stringify(m));

/** Open pages, closed after each test: their clocks would keep the run alive. */
const open: JSDOM[] = [];
afterEach(() => {
	for (const dom of open.splice(0)) {
		dom.window.close();
	}
});

function page(name: 'titlebar' | 'overlay') {
	const dom = new JSDOM(html(name), { runScripts: 'outside-only', pretendToBeVisual: true });
	open.push(dom);
	const window = dom.window as unknown as Window & typeof globalThis & { eval(code: string): unknown };
	const posted: Record<string, unknown>[] = [];
	let deliver: ((message: unknown) => void) | undefined;
	if (name === 'titlebar') {
		Object.assign(window, { acquireVsCodeApi: () => ({ postMessage: (m: Record<string, unknown>) => posted.push(ours(m)) }) });
	} else {
		Object.assign(window, {
			breezell: {
				connected: true,
				postMessage: async (m: Record<string, unknown>) => { posted.push(ours(m)); return true; },
				onMessage: (listener: (message: unknown) => void) => { deliver = listener; return () => undefined; },
			},
		});
	}
	window.eval(script(name));
	const doc = window.document;
	return {
		window, doc, posted,
		/** What the plugin's code (or Breezell) tells the page. */
		tell(message: unknown) {
			if (name === 'titlebar') {
				window.dispatchEvent(new window.MessageEvent('message', { data: message }));
			} else {
				deliver?.(message);
			}
		},
		click(selector: string) {
			doc.querySelector(selector)!.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
		},
		text: (selector: string) => doc.querySelector(selector)?.textContent ?? '',
	};
}

const working: IslandActivity = { agent: { kind: 'working', conversationId: 'c', step: { kind: 'editing', file: 'main.ts' }, conversations: 1, startedAt: Date.now() - 65_000, model: { provider: 'anthropic', name: 'claude' } } };

suite('the title bar\'s island', () => {
	test('says it is ready and asks for the rest width', () => {
		const p = page('titlebar');
		assert.ok(p.posted.some(m => m.__breezellSurfaceReady === true));
		assert.ok(p.posted.some(m => m.hello === true));
		assert.ok(p.posted.some(m => (m.__breezellTitlebar as { width?: number })?.width === REST_WIDTH));
	});

	test('at rest it is the search bar: the title Breezell gives, and a click opens the search', () => {
		const p = page('titlebar');
		p.tell({ type: 'breezell.surface.context', context: { title: 'my-project', windowFocused: true, language: 'en' } });
		assert.equal(p.text('#title'), 'my-project');
		assert.ok(p.doc.querySelector('#rest .search-icon'));
		p.click('#capsule');
		assert.ok(p.posted.some(m => (m.__breezellTitlebar as { openSearch?: boolean })?.openSearch === true));
		p.tell({ type: 'breezell.surface.context', context: { title: 'my-project', windowFocused: false } });
		assert.ok(p.doc.body.classList.contains('blurred'));
	});

	test('busy, it shows the step, the model\'s mark, the wave and the clock', () => {
		const p = page('titlebar');
		p.tell({ type: 'state', activity: working, language: 'en', look: 'light', modelIcon: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M0 0h24v24H0z"/></svg>' });
		assert.ok(p.doc.getElementById('capsule')!.classList.contains('live-active'));
		assert.equal(p.text('.live-content .words'), 'Editing main.ts');
		assert.ok(p.doc.querySelector('.live-content .model-mark'));
		assert.equal(p.doc.querySelectorAll('.live-content .wave > span').length, 5);
		assert.equal(p.text('.live-content .clock'), '1:05');
		assert.equal(p.doc.body.dataset.look, 'light');
	});

	test('the language Breezell uses', () => {
		const p = page('titlebar');
		p.tell({ type: 'state', activity: { agent: { kind: 'awaitingUser', conversationId: 'c', conversations: 1 } }, language: 'zh-TW' });
		assert.equal(p.text('.live-content .words'), '等你確認');
		assert.equal(p.text('.live-content .chip'), '查看');
	});

	test('View opens the conversation and does not open the search', () => {
		const p = page('titlebar');
		p.tell({ type: 'state', activity: { agent: { kind: 'failed', conversationId: 'c' } }, language: 'en' });
		const before = p.posted.length;
		p.click('.live-content .chip');
		assert.deepEqual(p.posted.slice(before), [{ reveal: 'agent' }]);
	});

	test('a task beside the agent splits off into the bubble, which opens the task', () => {
		const p = page('titlebar');
		p.tell({ type: 'state', activity: { ...working, task: { kind: 'running', name: 'build', startedAt: 1, others: 0 } }, language: 'en' });
		const bubble = p.doc.getElementById('bubble')!;
		assert.ok(bubble.classList.contains('bubble-shown'));
		assert.equal(bubble.getAttribute('aria-label'), 'Running build');
		assert.ok(p.posted.some(m => (m.__breezellTitlebar as { width?: number })?.width === REST_WIDTH + 32), 'room for the bubble is asked for');
		const before = p.posted.length;
		p.click('#bubble');
		assert.deepEqual(p.posted.slice(before), [{ reveal: 'task' }]);
	});

	test('it steps away while the island is out, and is back when told', () => {
		const p = page('titlebar');
		p.tell({ type: 'state', activity: { agent: { kind: 'idle' } }, language: 'en', away: true });
		assert.ok(p.doc.body.classList.contains('away'));
		p.tell({ type: 'state', activity: { agent: { kind: 'idle' } }, language: 'en', away: false });
		assert.ok(!p.doc.body.classList.contains('away'));
	});
});

const digest = (windowId: number, activity: IslandActivity, conversations: unknown[] = [], readsChat = true) => ({ windowId, title: `project-${windowId}`, activity, conversations, readsChat, at: 0 });

suite('the island outside the window', () => {
	test('says hello; at rest it says the workspace of the window used last; a click opens the panel', () => {
		const p = page('overlay');
		assert.ok(p.posted.some(m => m.hello === true));
		assert.equal(p.text('#title'), 'Breezell', 'before it is told of any window');
		p.tell({ type: 'state', activity: { agent: { kind: 'idle' } }, windows: [digest(2, { agent: { kind: 'idle' } }), digest(1, { agent: { kind: 'idle' } })], language: 'zh-TW' });
		assert.equal(p.text('#title'), 'project-2');
		assert.equal(p.doc.getElementById('capsule')!.getAttribute('aria-label'), 'project-2');
		p.click('#capsule');
		assert.ok(p.posted.some(m => m.expand === true));
		assert.ok(!p.posted.some(m => m.back === true), 'a click no longer leaves at once');
	});

	test('the panel lists the conversations with the end of each reply, and asks for its height', () => {
		const p = page('overlay');
		const conversations = [
			{ id: 'c1', title: 'Fix the parser', state: 'writing', reply: 'Changing the tokenizer now', updatedAt: 1, since: Date.now() - 5000 },
			{ id: 'c2', title: '', state: 'idle', reply: 'All tests pass.', updatedAt: 0 },
		];
		p.tell({ type: 'state', activity: working, windows: [digest(1, working, conversations)], windowId: 1, readsChat: true, expanded: true, language: 'en' });
		assert.ok(p.doc.body.classList.contains('expanded'));
		assert.equal(p.text('#panel-summary'), '1 running');
		assert.equal(p.text('#panel-back'), 'Back to editor');
		const rows = Array.from(p.doc.querySelectorAll('#panel-body .row.conversation'));
		assert.equal(rows.length, 2);
		assert.equal(rows[0].querySelector('.row-title')!.textContent, 'Fix the parser');
		assert.equal(rows[0].querySelector('.row-reply')!.textContent, 'Changing the tokenizer now');
		assert.equal(rows[1].querySelector('.row-title')!.textContent, 'New chat');
		assert.equal(p.doc.querySelector('.window-head'), null, 'one window: no window headings');
		assert.ok(p.doc.getElementById('panel-hint')!.hidden);
		assert.ok(p.posted.some(m => typeof m.panelHeight === 'number'));
		const before = p.posted.length;
		(rows[0] as HTMLElement).dispatchEvent(new p.window.MouseEvent('click', { bubbles: true }));
		p.click('#panel-back');
		assert.deepEqual(p.posted.slice(before), [{ openConversation: { windowId: 1, conversationId: 'c1' } }, { back: true }]);
	});

	test('several windows: a heading each, with a way to go there', () => {
		const p = page('overlay');
		p.tell({ type: 'state', activity: working, windows: [digest(1, working, []), digest(2, { agent: { kind: 'idle' }, task: { kind: 'failed', name: 'lint', exitCode: 1 } }, [])], windowId: 1, readsChat: true, expanded: true, language: 'en' });
		const heads = Array.from(p.doc.querySelectorAll('.window-head'));
		assert.deepEqual(heads.map(h => h.querySelector('.window-name')!.textContent), ['project-1', 'project-2']);
		const before = p.posted.length;
		(heads[1].querySelector('.chip') as HTMLElement).dispatchEvent(new p.window.MouseEvent('click', { bubbles: true }));
		(p.doc.querySelector('.row.task .chip') as HTMLElement).dispatchEvent(new p.window.MouseEvent('click', { bubbles: true }));
		assert.deepEqual(p.posted.slice(before), [{ goWindow: 2 }, { revealTask: 2 }]);
	});

	test('without reading the conversations: what each agent does, and how to allow more', () => {
		const p = page('overlay');
		p.tell({ type: 'state', activity: working, windows: [digest(1, working, [], false)], windowId: 1, readsChat: false, expanded: true, language: 'en' });
		assert.equal(p.text('#panel-body .row-title'), 'Editing main.ts');
		assert.ok(!p.doc.getElementById('panel-hint')!.hidden);
		assert.ok(p.text('#panel-hint').includes('Read your conversations'));
	});

	test('Escape closes the open panel', () => {
		const p = page('overlay');
		p.tell({ type: 'state', activity: working, windows: [digest(1, working)], expanded: true, language: 'en' });
		p.doc.dispatchEvent(new p.window.KeyboardEvent('keydown', { key: 'Escape' }));
		assert.ok(p.posted.some(m => m.collapse === true));
	});

	test('it turns into the dark pill on the way out, and back on the way in', () => {
		const p = page('overlay');
		p.tell({ type: 'fly', to: 'outside', durationMs: 500 });
		assert.ok(p.doc.body.classList.contains('outside'));
		assert.equal(p.doc.body.style.getPropertyValue('--fly-ms'), '350ms');
		p.tell({ type: 'fly', to: 'inside', durationMs: 400 });
		assert.ok(!p.doc.body.classList.contains('outside'));
	});

	test('a model\'s mark keeps nothing that could run', () => {
		const p = page('overlay');
		const markup = '<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)" viewBox="0 0 24 24"><script>alert(2)</script><a href="https://example.com"><path d="M0 0"/></a><path onclick="x()" d="M1 1"/><foreignObject><div>x</div></foreignObject></svg>';
		p.tell({ type: 'state', activity: working, language: 'en', modelIcon: markup });
		const mark = p.doc.querySelector('.model-mark')!;
		assert.ok(mark);
		assert.equal(mark.getAttribute('onload'), null);
		assert.equal(mark.querySelector('script'), null);
		assert.equal(mark.querySelector('a'), null);
		assert.equal(mark.querySelector('foreignObject'), null);
		assert.equal(mark.querySelector('[onclick]'), null);
	});

	test('markup that is not an SVG shows the sparkle instead', () => {
		const p = page('overlay');
		p.tell({ type: 'state', activity: working, language: 'en', modelIcon: '<div>not svg</div>' });
		assert.equal(p.doc.querySelector('.model-mark'), null);
		assert.ok(p.doc.querySelector('.live-content .glyph svg.icon'));
	});
});
