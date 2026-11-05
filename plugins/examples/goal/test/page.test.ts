import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { suite, test } from 'node:test';
import { JSDOM } from 'jsdom';

const root = join(__dirname, '..', '..');
const html = readFileSync(join(root, 'ui', 'goal.html'), 'utf8').replace(/<script[^>]*><\/script>/, '').replace(/<link[^>]*>/, '');
const script = readFileSync(join(__dirname, 'page.js'), 'utf8');

function page() {
	const posted: Record<string, unknown>[] = [];
	const dom = new JSDOM(html, { runScripts: 'outside-only', pretendToBeVisual: true });
	(dom.window as unknown as { acquireVsCodeApi: unknown }).acquireVsCodeApi = () => ({ postMessage: (message: Record<string, unknown>) => posted.push(JSON.parse(JSON.stringify(message))) });
	dom.window.eval(script);
	const send = (view: unknown) => dom.window.dispatchEvent(new dom.window.MessageEvent('message', { data: { type: 'state', view } }));
	const root = dom.window.document.getElementById('goal') as HTMLElement;
	const heights = () => posted.filter(message => '__breezellSurfaceHeight' in message).map(message => message.__breezellSurfaceHeight);
	return { dom, root, posted, send, heights };
}

const VIEW = {
	id: 'g', status: 'active', statusText: 'Working', condition: 'All tests pass', note: 'Two still fail.', progress: 'Round 3/20 · 12.3k tokens · 4 min', fractions: [0.15, 0.6],
	actions: [{ id: 'pause', label: 'Pause' }, { id: 'clear', label: 'Clear' }],
};

suite('the strip', () => {
	test('with no goal it takes no room, and it says it is listening', () => {
		const p = page();
		assert.equal(p.root.hidden, true);
		assert.deepEqual(p.heights(), [0]);
		assert.ok(p.posted.some(message => message.__breezellSurfaceReady === true));
		assert.ok(p.posted.some(message => message.hello === true));
		p.send(undefined);
		assert.equal(p.heights().at(-1), 0);
	});
	test('with a goal it says how it stands, and asks for room', () => {
		const p = page();
		p.send(VIEW);
		assert.equal(p.root.hidden, false);
		assert.ok((p.heights().at(-1) as number) > 0);
		assert.equal(p.root.dataset.status, 'active');
		assert.equal(p.root.querySelector('.status')?.textContent, 'Working');
		assert.equal(p.root.querySelector('.progress')?.textContent, VIEW.progress);
		assert.equal(p.root.querySelector('.condition')?.textContent, 'All tests pass');
		assert.equal(p.root.querySelector('.note')?.textContent, 'Two still fail.');
		assert.equal((p.root.querySelector('.fill') as HTMLElement).style.width, '60%', 'the limit nearest to running out');
	});
	test('when it goes, the room goes too', () => {
		const p = page();
		p.send(VIEW);
		p.send(undefined);
		assert.equal(p.root.hidden, true);
		assert.equal(p.heights().at(-1), 0);
		assert.equal(p.root.children.length, 0);
	});
	test('the buttons say what was pressed, nothing more', () => {
		const p = page();
		p.send(VIEW);
		(p.root.querySelector('.action.pause') as HTMLElement).click();
		(p.root.querySelector('.action.clear') as HTMLElement).click();
		assert.deepEqual(p.posted.filter(message => message.action), [{ action: 'pause' }, { action: 'clear' }]);
	});
	test('a goal over shows no bar, and buttons of its own', () => {
		const p = page();
		p.send({ ...VIEW, status: 'complete', statusText: 'Met', actions: [{ id: 'dismiss', label: 'Dismiss' }] });
		assert.equal(p.root.querySelector('.bar'), null);
		assert.deepEqual([...p.root.querySelectorAll('.action')].map(button => button.textContent), ['Dismiss']);
	});
	test('no note, no line for it', () => {
		const p = page();
		p.send({ ...VIEW, note: '' });
		assert.equal(p.root.querySelector('.note'), null);
	});
	test('what a goal says stays text', () => {
		const p = page();
		const evil = '<img src=x onerror=alert(1)>';
		p.send({ ...VIEW, condition: evil, note: evil, statusText: evil, progress: evil, actions: [{ id: 'pause', label: evil }] });
		assert.equal(p.root.querySelector('img'), null);
		assert.equal(p.root.querySelector('.condition')?.textContent, evil);
		assert.equal((p.root.querySelector('.condition') as HTMLElement).title, evil, 'all of it, on hover');
	});
	test('other messages change nothing', () => {
		const p = page();
		p.send(VIEW);
		p.dom.window.dispatchEvent(new p.dom.window.MessageEvent('message', { data: { type: 'breezell.surface.context', context: {} } }));
		assert.equal(p.root.hidden, false);
	});
});
