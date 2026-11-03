import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { suite, test } from 'node:test';
import { JSDOM } from 'jsdom';
import { petFittedHeight, petFloatSteps, PET_HAIR_MARGIN, PET_HIT_SHARE, PET_LEVEL_XP, petLeft, PET_MARGIN, PET_POSE_MS, PET_SIZES, PET_POSES, PetPose, petWidth, restFrame } from '../src/logic';
import { PET_STRINGS } from '../src/strings';
import { petImageFor, petProps } from '../page/art';
import { PET_IMAGES } from '../page/images.generated';

const SCRIPT = readFileSync(join(__dirname, 'page.js'), 'utf8');
const HTML = readFileSync(join(__dirname, '..', '..', 'ui', 'pet.html'), 'utf8').replace(/<link[^>]*>/, '').replace(/<script[^>]*><\/script>/, '');
const CARD = { width: 150, height: 110 };
const BUBBLE = { width: 120, height: 24 };
const BOX = { boxWidth: 600, maxLift: 700, restricted: false };
/** Its usual frame at its usual size. */
const REST = restFrame(PET_SIZES.medium);
const WIDE = petWidth(PET_SIZES.medium);
const SIDE = (REST.width - WIDE) / 2;
/** Long enough for a fall from this high to have ended. */
const fallen = (height: number) => (petFloatSteps(height) + 1) * 16;

/** The page as Breezell runs it: only its clock and what cannot be measured here are made up. */
function page(options: { random?: number; stillHair?: boolean } = {}) {
	const dom = new JSDOM(HTML, { runScripts: 'outside-only', pretendToBeVisual: true });
	const window = dom.window as unknown as Window & typeof globalThis & { eval(code: string): unknown; acquireVsCodeApi(): unknown };
	let now = 1_800_000_000_000;
	let nextId = 1;
	const timers = new Map<number, { at: number; every?: number; run: () => void }>();
	Object.assign(window, {
		setTimeout: (run: () => void, ms = 0) => (timers.set(nextId, { at: now + ms, run }), nextId++),
		clearTimeout: (id: number) => void timers.delete(id),
		setInterval: (run: () => void, every: number) => (timers.set(nextId, { at: now + every, every, run }), nextId++),
	});
	window.Date.now = () => now;
	window.Math.random = () => options.random ?? 0.9;
	const tick = (ms: number) => {
		const end = now + ms;
		for (; ;) {
			let id: number | undefined;
			let at = Infinity;
			for (const [key, timer] of timers) {
				if (timer.at <= end && timer.at < at) {
					id = key;
					at = timer.at;
				}
			}
			if (id === undefined) {
				break;
			}
			const timer = timers.get(id)!;
			now = at;
			if (timer.every) {
				timer.at += timer.every;
			} else {
				timers.delete(id);
			}
			timer.run();
		}
		now = end;
	};
	// A canvas that remembers its last picture, and images that have loaded.
	const hair = { frames: 0, rows: [] as { y: number; x: number }[] };
	const context = {
		clearRect() {
			hair.frames++;
			hair.rows = [];
		},
		drawImage(_image: unknown, _sx: number, _sy: number, _sw: number, _sh: number, x: number, y: number) {
			hair.rows.push({ y, x });
		},
	};
	(window as any).HTMLCanvasElement.prototype.getContext = () => context;
	Object.defineProperty((window as any).HTMLImageElement.prototype, 'naturalWidth', { configurable: true, get: () => 420 });
	Object.defineProperty((window as any).HTMLImageElement.prototype, 'naturalHeight', { configurable: true, get: () => 464 });
	(window as any).requestAnimationFrame = (run: (now: number) => void) => (timers.set(nextId, { at: now + 16, run: () => run(now) }), nextId++);
	if (options.stillHair) {
		(window as any).matchMedia = () => ({ matches: true });
	}
	const measure = (name: 'offsetWidth' | 'offsetHeight', key: 'width' | 'height') => Object.defineProperty(window.HTMLElement.prototype, name, {
		configurable: true,
		get(this: HTMLElement) {
			// Nothing has a size until it is shown: asking first would be a wrong frame.
			return this.style.display === 'none' ? 0 : this.id === 'card' ? CARD[key] : this.id === 'bubble' ? BUBBLE[key] : 0;
		},
	});
	measure('offsetWidth', 'width');
	measure('offsetHeight', 'height');
	const send = (data: unknown) => window.dispatchEvent(new window.MessageEvent('message', { data }));
	const posted: Record<string, any>[] = [];
	// As in PluginCompanion: each request sets the time a move takes, and each move is answered with where it is now.
	const place = { left: 0, lift: 0, width: 96, height: 96 };
	let room = { ...BOX };
	const onMoved: (() => void)[] = [];
	window.acquireVsCodeApi = () => ({
		postMessage: (message: Record<string, any>) => {
			posted.push(message);
			const request = message.__breezellCompanion;
			if (request) {
				const before = JSON.stringify(place);
				for (const key of ['left', 'lift', 'width', 'height'] as const) {
					place[key] = request[key] ?? place[key];
				}
				if (JSON.stringify(place) !== before) {
					onMoved.push(() => send({ type: 'breezell.companion.layout', ...place, ...room }));
					queueMicrotaskLike();
				}
			}
		},
	});
	let answering = false;
	const queueMicrotaskLike = () => {
		if (answering) {
			return;
		}
		answering = true;
		while (onMoved.length) {
			onMoved.shift()!();
		}
		answering = false;
	};
	window.eval(SCRIPT);

	const $ = (id: string) => window.document.getElementById(id) as HTMLElement;
	const pointer = (type: string, init: PointerEventInit = {}, target: Element = $('pet')) => {
		const event = new window.MouseEvent(type, { bubbles: true, cancelable: true, button: 0, ...init });
		target.dispatchEvent(event);
		return event;
	};
	return {
		window, posted, tick, send, pointer, $, hair,
		asks: () => posted.flatMap(m => m.__breezellCompanion ? [m.__breezellCompanion] : []),
		lastAsk: () => posted.flatMap(m => m.__breezellCompanion ? [m.__breezellCompanion] : []).at(-1) as Record<string, any>,
		saves: () => posted.flatMap(m => m.save ? [m.save] : []),
		pose: () => $('pet').dataset.petPose as PetPose,
		saying: () => $('bubble').style.display === 'block' ? $('bubble').textContent : undefined,
		card: () => $('card').style.display === 'block',
		layout: (over: object = {}) => {
			room = { ...BOX, ...over };
			send({ type: 'breezell.companion.layout', ...place, ...room });
		},
		init: (over: object = {}) => send({ type: 'init', progress: undefined, settings: { visible: true, size: 'medium', speech: true }, greet: false, ...over }),
		chat: (activity: string, tool?: string) => send({ type: 'breezell.companion.chat', activity, tool }),
		turn: (outcome: string) => send({ type: 'breezell.companion.turn', outcome }),
	};
}

function ready(options: { progress?: object; settings?: object; layout?: object; random?: number; stillHair?: boolean } = {}) {
	const p = page({ random: options.random, stillHair: options.stillHair });
	p.layout(options.layout);
	p.init({ progress: options.progress, settings: { visible: true, size: 'medium', speech: true, ...options.settings } });
	return p;
}

type Page = ReturnType<typeof page>;
/** Taking hold of her at a point on the screen, moving there, and letting go there. */
const grab = (p: Page) => p.pointer('pointerdown', { screenX: 500, screenY: 500 });
const carry = (p: Page, screenX: number, screenY: number) => p.pointer('pointermove', { screenX, screenY });
const letGo = (p: Page, screenX: number, screenY: number) => p.pointer('pointerup', { screenX, screenY });

/** Past the first walk, which depends on when it starts: quiet from here. */
const quiet = 25_000;

suite('coming up', () => {
	test('it says it is there, and asks for no room until it knows the box and who it is', () => {
		const p = page();
		assert.ok(p.posted.some(m => m.__breezellSurfaceReady));
		assert.ok(p.posted.some(m => m.hello));
		assert.deepEqual(p.asks(), []);
		p.layout();
		assert.deepEqual(p.asks(), []);
		p.init();
		assert.equal(p.asks().length, 1);
	});
	test('knowing who it is first is just as good', () => {
		const p = page();
		p.init();
		assert.deepEqual(p.asks(), []);
		p.layout();
		assert.equal(p.asks().length, 1);
	});
	test('it asks to stand at its perch, with a frame for it and its jumps', () => {
		const ask = ready().lastAsk();
		assert.equal(ask.hidden, false);
		assert.equal(ask.width, REST.width);
		assert.equal(ask.height, REST.height);
		assert.equal(ask.lift, 0);
		assert.equal(ask.left, Math.round(petLeft(0.86, 600, WIDE) - SIDE));
	});
	test('the plugin\'s code can take seconds as a window opens: she does not show until it has said how she should', () => {
		const p = page();
		p.layout();
		p.tick(5000);
		assert.deepEqual(p.asks(), []);
		p.init({ settings: { visible: false }, progress: { perch: 0.1 } });
		assert.deepEqual(p.asks().map(ask => ask.hidden), [true]);
	});
	test('with that code broken she comes in the end, and does not wave', () => {
		const p = page();
		p.layout();
		p.tick(14_999);
		assert.deepEqual(p.asks(), []);
		p.tick(1);
		assert.equal(p.asks().length, 1);
		assert.notEqual(p.pose(), 'wave');
	});
	test('a late word from the plugin brings what it remembers', () => {
		const p = page();
		p.layout();
		p.tick(15_000);
		p.init({ progress: { xp: 40, perch: 0.1 } });
		assert.equal(p.lastAsk().left, Math.round(petLeft(0.1, 600, WIDE) - SIDE));
	});
	test('it waves and greets when it is told to', () => {
		const p = page();
		p.layout();
		p.init({ greet: true });
		assert.equal(p.pose(), 'wave');
		assert.ok(p.saying());
		p.tick(PET_POSE_MS.wave);
		assert.equal(p.pose(), 'idle');
		p.tick(3200);
		assert.equal(p.saying(), undefined);
	});
	test('a damaged record does not break it', () => {
		const p = ready({ progress: { xp: 'many', mood: {}, perch: 'x' } });
		assert.equal(p.pose(), 'idle');
		assert.equal(p.lastAsk().width, REST.width);
	});
	test('every size asks for its own frame', () => {
		for (const size of ['small', 'medium', 'large'] as const) {
			const p = ready({ settings: { size } });
			const px = PET_SIZES[size];
			assert.equal(p.lastAsk().width, restFrame(px).width);
			assert.equal(p.$('pet').style.height, `${px}px`);
			assert.equal(p.$('pet').style.width, `${petWidth(px)}px`);
		}
	});
});

suite('showing and hiding', () => {
	test('turned off it asks to be hidden and nothing else', () => {
		const p = ready({ settings: { visible: false } });
		assert.deepEqual(Object.keys(p.lastAsk()), ['hidden']);
		assert.equal(p.lastAsk().hidden, true);
	});
	test('turned on again it comes back', () => {
		const p = ready({ settings: { visible: false } });
		p.send({ type: 'settings', settings: { visible: true, size: 'medium', speech: true } });
		assert.equal(p.lastAsk().hidden, false);
		assert.equal(p.lastAsk().width, REST.width);
	});
	test('changing size from the settings changes the frame at once', () => {
		const p = ready();
		p.send({ type: 'settings', settings: { visible: true, size: 'large', speech: true } });
		assert.equal(p.lastAsk().width, restFrame(PET_SIZES.large).width);
	});
	test('hide on its card goes to the plugin', () => {
		const p = ready();
		p.pointer('contextmenu');
		(p.$('card').querySelector('[data-do="hide"]') as HTMLElement).click();
		assert.ok(p.posted.some(m => m.hide));
	});
	test('a page in the background pauses its animations', () => {
		const p = ready();
		const doc = p.window.document;
		Object.defineProperty(doc, 'visibilityState', { configurable: true, value: 'hidden' });
		doc.dispatchEvent(new p.window.Event('visibilitychange'));
		assert.ok(doc.documentElement.hasAttribute('data-paused'));
		Object.defineProperty(doc, 'visibilityState', { configurable: true, value: 'visible' });
		doc.dispatchEvent(new p.window.Event('visibilitychange'));
		assert.ok(!doc.documentElement.hasAttribute('data-paused'));
	});
	test('in the background it does not walk or fall asleep', () => {
		const p = ready();
		Object.defineProperty(p.window.document, 'visibilityState', { configurable: true, value: 'hidden' });
		const asks = p.asks().length;
		p.tick(10 * 60_000);
		assert.equal(p.asks().length, asks);
		assert.equal(p.pose(), 'idle');
	});
});

suite('following the chat', () => {
	test('a turn starting plays the send, then it thinks', () => {
		const p = ready();
		p.chat('thinking');
		assert.equal(p.pose(), 'send');
		p.tick(PET_POSE_MS.send);
		assert.equal(p.pose(), 'think');
	});
	test('it follows thinking, writing and working', () => {
		const p = ready();
		p.chat('thinking');
		p.tick(PET_POSE_MS.send);
		p.chat('writing');
		assert.equal(p.pose(), 'write');
		p.chat('working', 'terminal');
		assert.equal(p.pose(), 'work');
	});
	test('waiting on the user says so at once, and stops when answered', () => {
		const p = ready();
		p.chat('thinking');
		p.tick(PET_POSE_MS.send);
		p.chat('waiting');
		assert.equal(p.pose(), 'wait');
		assert.ok(PET_STRINGS.en.wait.includes(p.saying()!));
		p.chat('working', 'other');
		assert.equal(p.pose(), 'work');
		assert.equal(p.saying(), undefined);
	});
	test('a finished turn earns its experience, celebrates and is kept', () => {
		const p = ready();
		p.turn('done');
		assert.equal(p.saves().at(-1)?.xp, 1);
		assert.equal(p.saves().at(-1)?.turns, 1);
		assert.equal(p.pose(), 'celebrate');
		p.tick(PET_POSE_MS.celebrate);
		assert.equal(p.pose(), 'idle');
	});
	test('the turn that crosses a level is a bigger moment, and names the new title', () => {
		const p = ready({ progress: { xp: PET_LEVEL_XP[1] - 1 } });
		p.turn('done');
		assert.equal(p.pose(), 'levelup');
		assert.ok(p.saying()?.includes(PET_STRINGS.en.titles[1]));
	});
	test('a failed turn startles it, then it is sad, and it earns nothing', () => {
		const p = ready();
		p.turn('failed');
		assert.equal(p.pose(), 'startle');
		assert.equal(p.saves().at(-1)?.xp, 0);
		assert.ok(PET_STRINGS.en.failed.includes(p.saying()!));
		p.tick(PET_POSE_MS.startle);
		assert.equal(p.pose(), 'sad');
		p.tick(PET_POSE_MS.sad);
		assert.equal(p.pose(), 'idle');
	});
	test('turn after turn it does not chatter', () => {
		const p = ready();
		const lines = new Set<string>();
		for (let i = 0; i < 4; i++) {
			p.turn('done');
			lines.add(`${i}:${p.saying() ?? ''}`);
			p.tick(3300);
		}
		assert.equal([...lines].filter(line => !line.endsWith(':')).length, 1);
		assert.equal(p.saves().at(-1)?.turns, 4);
	});
	test('the user typing has it watch, then it stops', () => {
		const p = ready();
		p.send({ type: 'breezell.companion.typing' });
		assert.equal(p.pose(), 'watch');
		p.tick(1000);
		p.send({ type: 'breezell.companion.typing' });
		p.tick(1000);
		assert.equal(p.pose(), 'watch');
		p.tick(600);
		assert.equal(p.pose(), 'idle');
	});
});

suite('by itself', () => {
	test('it falls asleep after two minutes with nothing going on, and says so', () => {
		const p = ready({ random: 0.5 });
		p.tick(2 * 60_000 + 1000);
		assert.equal(p.pose(), 'sleep');
	});
	test('the chat wakes it', () => {
		const p = ready({ random: 0.5 });
		p.tick(2 * 60_000 + 1000);
		p.chat('thinking');
		assert.notEqual(p.pose(), 'sleep');
		p.tick(1000);
		assert.equal(p.pose(), 'think');
	});
	test('it does not sleep through a long turn', () => {
		const p = ready();
		p.chat('working', 'terminal');
		p.tick(10 * 60_000);
		assert.equal(p.pose(), 'work');
	});
	test('now and then it walks along the box, and stops', () => {
		const p = ready({ random: 0.1 });
		const start = p.lastAsk().left;
		p.tick(quiet);
		assert.equal(p.pose(), 'walk');
		const walk = p.lastAsk();
		assert.notEqual(walk.left, start);
		assert.ok(walk.ms > 0);
		p.tick(walk.ms);
		assert.equal(p.pose(), 'idle');
		assert.equal(p.lastAsk(), walk); // it is there: nothing more to ask
	});
	test('Breezell answering with where it is does not end the walk', () => {
		const p = ready({ random: 0.1 });
		const count = p.asks().length;
		p.tick(quiet);
		const walk = p.lastAsk();
		assert.equal(p.asks().length, count + 1);
		assert.ok(walk.ms > 1000, String(walk.ms));
		p.tick(walk.ms - 1);
		assert.equal(p.asks().length, count + 1);
	});
	test('what happens during a walk does not make it jump there', () => {
		const p = ready({ random: 0.1 });
		p.tick(quiet);
		const walk = p.lastAsk();
		p.tick(200);
		p.send({ type: 'breezell.companion.typing' });
		p.turn('done'); // a word: the frame changes, and the rest of the walk takes the rest of the time
		const during = p.lastAsk();
		assert.notEqual(during.height, walk.height);
		assert.equal(during.ms, walk.ms - 200);
	});
	test('taken hold of mid-walk, it stops where it is, under the pointer', () => {
		const p = ready({ random: 0 });
		const start = p.lastAsk().left;
		p.tick(quiet);
		const walk = p.lastAsk();
		assert.ok(walk.left < start);
		const half = Math.round(walk.ms / 2);
		p.tick(half);
		grab(p);
		const stopped = p.lastAsk();
		assert.equal(stopped.ms, 0);
		assert.ok(Math.abs(stopped.left - (start + walk.left) / 2) <= 2, `${start} ${walk.left} ${stopped.left}`);
		assert.notEqual(p.pose(), 'walk');
		letGo(p, 500, 500);
		p.tick(walk.ms);
		assert.equal(p.lastAsk().left, stopped.left);
	});
	test('walking it stays on the box', () => {
		for (const random of [0, 1]) {
			const p = ready({ random, progress: { perch: random } });
			p.tick(5 * 60_000);
			for (const ask of p.asks()) {
				assert.ok(ask.left >= 0 && ask.left + ask.width <= 600, JSON.stringify(ask));
			}
		}
	});
	test('it does not wander off during a turn, while being held, or with something waiting on the user', () => {
		const p = ready();
		p.chat('working', 'edit');
		const left = p.lastAsk().left;
		p.tick(5 * 60_000);
		assert.equal(p.lastAsk().left, left);
		const q = ready({ layout: { restricted: true } });
		const r = q.asks().at(-1)!.left;
		q.tick(60_000);
		assert.equal(q.lastAsk().left, r);
	});
	test('walking does not forget its perch', () => {
		const p = ready({ random: 0.1 });
		p.tick(quiet);
		assert.deepEqual(p.saves(), []);
	});
	test('in a low mood it says so now and then, not all the time', () => {
		const p = ready({ progress: { mood: 20, moodAt: 1_800_000_000_000 }, random: 0.5 });
		const heard: string[] = [];
		for (let i = 0; i < 12; i++) {
			p.tick(60_000);
			const line = p.saying();
			if (line) {
				heard.push(line);
			}
			p.send({ type: 'breezell.companion.typing' }); // keeps it awake
			p.tick(1700);
		}
		assert.ok(heard.length <= 2, heard.join());
	});
});

suite('the mouse', () => {
	test('pressing on her takes nothing from the chat: no focus and no selection', () => {
		const p = ready();
		for (const type of ['mousedown', 'selectstart', 'dragstart']) {
			const event = p.pointer(type);
			assert.equal(event.defaultPrevented, true, type);
		}
	});
	test('the buttons on her card still work with that', () => {
		const p = ready();
		p.pointer('contextmenu');
		const button = p.$('card').querySelector('[data-do="play"]') as HTMLElement;
		p.pointer('mousedown', {}, button);
		button.click();
		assert.equal(p.pose(), 'play');
	});
	test('a click pats it, which is kept', () => {
		const p = ready();
		p.pointer('pointerdown', { screenX: 10, screenY: 10 });
		letGo(p, 10, 10);
		assert.equal(p.pose(), 'joy');
		assert.equal(p.saves().at(-1)?.mood, 72);
	});
	test('a shake of the hand is still a click', () => {
		const p = ready();
		const asks = p.asks().length;
		p.pointer('pointerdown', { screenX: 10, screenY: 10 });
		carry(p, 12, 11);
		letGo(p, 12, 11);
		assert.equal(p.pose(), 'joy');
		assert.equal(p.asks().filter(a => a.lift).length, 0);
		assert.ok(p.asks().length <= asks + 1);
	});
	test('dragging moves its frame with the pointer, at once', () => {
		const p = ready();
		const start = p.lastAsk().left;
		grab(p);
		carry(p, 400, 450);
		assert.equal(p.pose(), 'drag');
		assert.equal(p.lastAsk().left, start - 100);
		assert.equal(p.lastAsk().lift, 50);
		assert.equal(p.lastAsk().ms, 0);
	});
	test('the pointer is on the screen: the frame moving under it changes nothing', () => {
		const p = ready();
		const start = p.lastAsk().left;
		p.pointer('pointerdown', { screenX: 500, screenY: 500, clientX: 40, clientY: 40 });
		p.pointer('pointermove', { screenX: 480, screenY: 500, clientX: 40, clientY: 40 });
		p.pointer('pointermove', { screenX: 460, screenY: 500, clientX: 40, clientY: 40 });
		assert.equal(p.lastAsk().left, start - 40);
	});
	test('it stays on the box and under the top of the panel, however far it is dragged', () => {
		const p = ready();
		grab(p);
		carry(p, -9000, -9000);
		assert.equal(p.lastAsk().left, 0);
		assert.equal(p.lastAsk().lift, BOX.maxLift - REST.height);
		carry(p, 9000, 9000);
		assert.equal(p.lastAsk().left + REST.width, 600);
		assert.equal(p.lastAsk().lift, 0);
	});
	test('dropped, it falls back to the box, lands and stays where it was put', () => {
		const p = ready();
		grab(p);
		carry(p, 300, 400);
		const at = p.lastAsk().left;
		letGo(p, 300, 400);
		assert.ok(p.saves().at(-1)!.perch < 0.86);
		assert.equal(p.pose(), 'float'); // still in the air
		p.tick(fallen(100));
		assert.equal(p.pose(), 'land');
		assert.equal(p.lastAsk().lift, 0);
		assert.equal(p.lastAsk().left, at);
		p.tick(PET_POSE_MS.land);
		assert.equal(p.pose(), 'idle');
		assert.equal(p.lastAsk().left, at);
	});
	test('it floats down in small steps, and never asks Breezell to take time over it', () => {
		const p = ready();
		grab(p);
		carry(p, 500, 200);
		assert.equal(p.lastAsk().lift, 300);
		const count = p.asks().length;
		letGo(p, 500, 200);
		p.tick(fallen(300));
		const lifts = p.asks().slice(count).map(a => a.lift);
		assert.ok(lifts.length >= 30, String(lifts.length));
		assert.equal(lifts.at(-1), 0);
		for (let i = 1; i < lifts.length; i++) {
			assert.ok(lifts[i] < lifts[i - 1], lifts.join());
			assert.ok(lifts[i - 1] - lifts[i] <= 8, lifts.join());
		}
		assert.deepEqual(p.asks().slice(count).filter(a => a.ms).map(a => a.ms), []);
	});
	test('a busy machine makes her slower and does not make her jump: she goes by steps, not by the clock', () => {
		const p = ready();
		grab(p);
		carry(p, 500, 200);
		letGo(p, 500, 200);
		// A long time has passed by the clock, and only a few of her timers have fired.
		const clock = p.window.Date.now;
		p.window.Date.now = () => clock() + 1e7;
		p.tick(48);
		assert.ok(p.lastAsk().lift >= 290, String(p.lastAsk().lift));
		assert.equal(p.pose(), 'float');
	});
	test('Breezell answering with where it is does not bring it down at once', () => {
		const p = ready();
		grab(p);
		carry(p, 500, 200);
		letGo(p, 500, 200);
		p.tick(32);
		assert.ok(p.lastAsk().lift > 280, String(p.lastAsk().lift));
	});
	test('it can be caught on the way down, where it is', () => {
		const p = ready();
		grab(p);
		carry(p, 500, 200);
		letGo(p, 500, 200);
		p.tick(160);
		const caught = p.lastAsk().lift;
		assert.ok(caught > 0 && caught < 300);
		p.pointer('pointerdown', { screenX: 500, screenY: 400 });
		assert.equal(p.pose(), 'drag');
		p.tick(1000);
		assert.ok(Math.abs(p.lastAsk().lift - caught) <= 40, `${caught} ${p.lastAsk().lift}`);
		carry(p, 500, 380);
		const moved = p.lastAsk().lift;
		letGo(p, 500, 380);
		p.tick(fallen(moved));
		assert.equal(p.lastAsk().lift, 0);
		assert.equal(p.pose(), 'land');
	});
	test('the next time it comes where it was put', () => {
		const p = ready();
		grab(p);
		carry(p, 300, 500);
		letGo(p, 300, 500);
		p.tick(1000);
		const q = ready({ progress: p.saves().at(-1) });
		assert.equal(q.lastAsk().left, p.lastAsk().left);
	});
	test('dropping it close to the box needs no fall', () => {
		const p = ready();
		grab(p);
		carry(p, 450, 498);
		letGo(p, 450, 498);
		assert.equal(p.lastAsk().lift, 0);
		assert.equal(p.pose(), 'land');
	});
	test('dragging while the card is open closes it', () => {
		const p = ready();
		p.pointer('contextmenu');
		assert.equal(p.card(), true);
		grab(p);
		carry(p, 480, 500);
		assert.equal(p.card(), false);
	});
	test('the card does not interrupt its fall', () => {
		const p = ready();
		grab(p);
		carry(p, 400, 400);
		letGo(p, 400, 400);
		p.tick(fallen(100));
		assert.equal(p.card(), false);
		assert.equal(p.lastAsk().lift, 0);
	});
	test('a press that ends elsewhere still ends', () => {
		const p = ready();
		grab(p);
		carry(p, 480, 480);
		p.pointer('pointercancel', {});
		p.tick(fallen(20));
		assert.notEqual(p.pose(), 'drag');
		assert.equal(p.lastAsk().lift, 0);
	});
	test('the right button is not a drag and opens its card, not a menu', () => {
		const p = ready();
		p.pointer('pointerdown', { button: 2, screenX: 5, screenY: 5 });
		carry(p, 200, 200);
		assert.notEqual(p.pose(), 'drag');
		const menu = p.pointer('contextmenu');
		assert.equal(menu.defaultPrevented, true);
		assert.equal(p.card(), true);
	});
});

suite('what catches the mouse', () => {
	const hitWide = Math.round(WIDE * PET_HIT_SHARE);
	test('her middle and not the frame: the air and the hair beside her let it through to the chat', () => {
		const ask = ready().lastAsk();
		assert.equal(ask.hit.length, 1);
		const [area] = ask.hit;
		assert.equal(area.width, hitWide);
		assert.equal(area.height, PET_SIZES.medium);
		assert.equal(area.y, REST.height - PET_SIZES.medium);
		assert.equal(area.x, SIDE + Math.round((WIDE - hitWide) / 2));
	});
	test('it says so again when the frame changes, and not when nothing did', () => {
		const p = ready();
		const asks = p.asks().length;
		p.layout();
		assert.equal(p.asks().length, asks);
		p.send({ type: 'settings', settings: { visible: true, size: 'large', speech: true } });
		assert.equal(p.lastAsk().hit[0].height, PET_SIZES.large);
	});
	test('her card catches it too, for as long as it is open', () => {
		const p = ready();
		p.pointer('contextmenu');
		assert.equal(p.lastAsk().hit.length, 2);
		assert.deepEqual([p.lastAsk().hit[1].width, p.lastAsk().hit[1].height], [CARD.width, CARD.height]);
		p.pointer('pointerleave');
		p.tick(300);
		assert.equal(p.lastAsk().hit.length, 1);
	});
	test('made small, what catches it stays where she shows', () => {
		const ask = ready({ layout: { restricted: true } }).lastAsk();
		assert.equal(ask.hit[0].y, 0);
		assert.ok(ask.hit[0].x <= ask.width / 2 && ask.hit[0].x + ask.hit[0].width >= ask.width / 2);
	});
	test('off her the frame is told to let go', () => {
		const p = ready();
		const out = () => p.posted.filter(m => m.__breezellCompanion?.mouseOut === true).length;
		p.pointer('pointerenter');
		p.pointer('pointerleave');
		p.tick(0);
		assert.equal(out(), 1);
	});
	test('from her to her card is not off her', () => {
		const p = ready();
		p.pointer('contextmenu');
		const before = p.posted.filter(m => m.__breezellCompanion?.mouseOut === true).length;
		p.pointer('pointerleave');
		p.pointer('pointerenter', {}, p.$('card'));
		p.tick(0);
		assert.equal(p.posted.filter(m => m.__breezellCompanion?.mouseOut === true).length, before);
	});
	test('while she is held nothing lets go of her', () => {
		const p = ready();
		grab(p);
		p.pointer('pointerleave');
		p.tick(0);
		assert.equal(p.posted.filter(m => m.__breezellCompanion?.mouseOut === true).length, 0);
	});
	test('the wheel over her is for the chat, in pixels', () => {
		const p = ready();
		const wheel = (init: object) => p.$('pet').dispatchEvent(new (p.window as any).WheelEvent('wheel', { bubbles: true, ...init }));
		const scrolls = () => p.posted.flatMap(m => m.__breezellCompanion?.scroll ? [m.__breezellCompanion.scroll] : []);
		wheel({ deltaY: 120 });
		wheel({ deltaY: -3, deltaMode: 1 });
		wheel({ deltaY: 500, ctrlKey: true }); // that one zooms
		assert.deepEqual(JSON.parse(JSON.stringify(scrolls())), [{ deltaX: 0, deltaY: 120 }, { deltaX: 0, deltaY: -48 }]);
	});
});

suite('what she costs', () => {
	const paused = (p: Page) => p.window.document.documentElement.hasAttribute('data-paused');
	test('turned off, nothing runs: no hair, no animations, nothing to paint', () => {
		const p = ready();
		p.tick(500);
		assert.equal(paused(p), false);
		p.send({ type: 'settings', settings: { visible: false, size: 'medium', speech: true } });
		const frames = p.hair.frames;
		p.tick(5000);
		assert.equal(p.hair.frames, frames);
		assert.equal(paused(p), true);
		assert.equal(p.$('pet').style.display, 'none');
	});
	test('turned on again it all goes on', () => {
		const p = ready({ settings: { visible: false } });
		p.tick(1000);
		const frames = p.hair.frames;
		p.send({ type: 'settings', settings: { visible: true, size: 'medium', speech: true } });
		p.tick(1000);
		assert.ok(p.hair.frames - frames >= 15, String(p.hair.frames - frames));
		assert.equal(paused(p), false);
		assert.equal(p.$('pet').style.display, '');
	});
	test('it does not ask for every frame: that keeps a page painting with nothing moved', () => {
		let asked = 0;
		const p = page();
		(p.window as any).requestAnimationFrame = () => void asked++;
		p.layout();
		p.init();
		p.tick(1000);
		assert.equal(asked, 0);
		assert.ok(p.hair.frames > 0);
	});
});

suite('in a narrow chat', () => {
	test('a whole smaller pet, and not part of one', () => {
		for (const boxWidth of [140, 160, 181]) {
			const p = ready({ layout: { boxWidth } });
			const height = petFittedHeight(PET_SIZES.medium, boxWidth);
			assert.ok(height < PET_SIZES.medium, String(boxWidth));
			assert.equal(p.$('pet').style.height, `${height}px`);
			assert.ok(petWidth(height) + PET_MARGIN * 2 <= boxWidth + 1, String(boxWidth));
		}
	});
	test('with room she is the size she was set to, however wide', () => {
		for (const boxWidth of [200, 400, 1200]) {
			assert.equal(ready({ layout: { boxWidth } }).$('pet').style.height, `${PET_SIZES.medium}px`);
		}
	});
	test('widening the panel gives her size back', () => {
		const p = ready({ layout: { boxWidth: 140 } });
		p.layout({ boxWidth: 500 });
		assert.equal(p.$('pet').style.height, `${PET_SIZES.medium}px`);
		assert.equal(p.lastAsk().height, REST.height);
	});
});

suite('its card', () => {
	const open = (over: object = {}) => {
		const p = ready(over);
		p.pointer('contextmenu');
		return p;
	};
	const press = (p: ReturnType<typeof page>, what: string) => (p.$('card').querySelector(`[data-do="${what}"]`) as HTMLElement).click();

	test('hovering over her never opens it, however long: it would be in the way of picking her up', () => {
		const p = ready();
		p.pointer('pointerenter');
		p.tick(60_000);
		assert.equal(p.card(), false);
	});
	test('she can be picked up straight after hovering over her', () => {
		const p = ready();
		const start = p.lastAsk().left;
		p.pointer('pointerenter');
		p.tick(2000);
		grab(p);
		carry(p, 450, 500);
		assert.equal(p.pose(), 'drag');
		assert.equal(p.lastAsk().left, start - 50);
	});
	test('right-clicking opens it', () => {
		const p = ready();
		p.pointer('contextmenu');
		assert.equal(p.card(), true);
	});
	test('it opens over her dress and leaves her face in sight, with the frame as it was', () => {
		for (const size of ['medium', 'large'] as const) {
			const p = open({ settings: { size } });
			const ask = p.lastAsk();
			assert.equal(ask.width, restFrame(PET_SIZES[size]).width, size);
			assert.equal(ask.height, restFrame(PET_SIZES[size]).height, size);
			const top = ask.height - parseFloat(p.$('card').style.bottom) - CARD.height;
			const chin = ask.height - PET_SIZES[size] + PET_SIZES[size] * 415 / 1130;
			assert.ok(top >= chin, `${size} ${top} ${chin}`);
			const left = parseFloat(p.$('card').style.left);
			assert.ok(left >= 0 && left + CARD.width <= ask.width, size);
		}
	});
	test('leaving it closes it', () => {
		const p = open();
		p.pointer('pointerleave');
		p.tick(240);
		assert.equal(p.card(), false);
	});
	test('as the frame grows the pet does not move on the screen', () => {
		const p = ready();
		const before = p.lastAsk().left + parseFloat(p.$('pet').style.left);
		p.pointer('contextmenu');
		assert.equal(p.lastAsk().left + parseFloat(p.$('pet').style.left), before);
	});
	test('at the ends of the box too', () => {
		for (const perch of [0, 1]) {
			const p = ready({ progress: { perch } });
			const before = p.lastAsk().left + parseFloat(p.$('pet').style.left);
			p.pointer('contextmenu');
			assert.equal(p.lastAsk().left + parseFloat(p.$('pet').style.left), before, String(perch));
			assert.ok(p.lastAsk().left >= 0 && p.lastAsk().left + p.lastAsk().width <= 600);
		}
	});
	test('moving from the pet onto it keeps it open', () => {
		const p = open();
		p.pointer('pointerleave');
		p.tick(100);
		p.pointer('pointerenter', {}, p.$('card'));
		p.tick(1000);
		assert.equal(p.card(), true);
	});
	test('it stays within what Breezell allows at every size', () => {
		for (const size of ['small', 'medium', 'large']) {
			const p = open({ settings: { size } });
			const ask = p.lastAsk();
			assert.ok(ask.width <= 240 && ask.height <= 240, size);
			assert.ok(parseFloat(p.$('card').style.bottom) + CARD.height <= ask.height, size);
		}
	});
	test('it shows its level, title and how far along, in its language', () => {
		const p = ready({ progress: { xp: 7, turns: 7 } });
		p.send({ type: 'breezell.surface.context', context: { language: 'zh-TW', conversationId: 'c' } });
		p.pointer('contextmenu');
		const text = p.$('card').textContent!;
		assert.ok(text.includes(PET_STRINGS['zh-TW'].name));
		assert.ok(text.includes(`Lv.2 ${PET_STRINGS['zh-TW'].titles[1]}`));
		assert.ok(text.includes(PET_STRINGS['zh-TW'].turns.replace('{count}', '7')));
		assert.equal((p.$('card').querySelector('.bar > div') as HTMLElement).style.width, '20%');
	});
	test('what happens while it is open shows on it', () => {
		const p = open({ progress: { xp: 0, turns: 0 } });
		p.turn('done');
		assert.ok(p.$('card').textContent!.includes(PET_STRINGS.en.turns.replace('{count}', '1')));
		p.send({ type: 'progress', progress: { xp: 0, turns: 5 } });
		assert.ok(p.$('card').textContent!.includes(PET_STRINGS.en.turns.replace('{count}', '5')));
	});
	test('its buttons stay the same ones when nothing on it changed', () => {
		const p = open({ progress: { mood: 100, moodAt: 1_800_000_000_000 } });
		const button = p.$('card').querySelector('button');
		p.send({ type: 'settings', settings: { visible: true, size: 'medium', speech: true } });
		p.pointer('pointerleave');
		p.tick(100);
		p.pointer('pointerenter', {}, p.$('card'));
		assert.equal(p.$('card').querySelector('button'), button);
	});
	test('at the top level the bar is full', () => {
		const p = open({ progress: { xp: 1e6 } });
		assert.equal((p.$('card').querySelector('.bar > div') as HTMLElement).style.width, '100%');
	});
	test('feeding it plays, is kept and closes the card', () => {
		const p = open();
		press(p, 'feed');
		assert.equal(p.pose(), 'eat');
		assert.equal(p.saves().at(-1)?.fed, 1);
		assert.equal(p.card(), false);
		assert.ok(PET_STRINGS.en.fed.includes(p.saying()!));
	});
	test('fed again at once it says it is full and nothing changes', () => {
		const p = open();
		press(p, 'feed');
		p.tick(3000);
		p.pointer('contextmenu');
		const saves = p.saves().length;
		press(p, 'feed');
		assert.equal(p.saying(), PET_STRINGS.en.full);
		assert.equal(p.saves().length, saves);
	});
	test('playing plays and is kept', () => {
		const p = open();
		press(p, 'play');
		assert.equal(p.pose(), 'play');
		assert.equal(p.saves().at(-1)?.played, 1);
	});
	test('care that raises a level shows after the moment', () => {
		const p = open({ progress: { xp: PET_LEVEL_XP[1] - 1 } });
		press(p, 'feed');
		assert.equal(p.pose(), 'eat');
		p.tick(PET_POSE_MS.eat);
		assert.equal(p.pose(), 'levelup');
	});
});

suite('its words', () => {
	test('it speaks the language of Breezell', () => {
		const p = page();
		p.send({ type: 'breezell.surface.context', context: { language: 'ja' } });
		p.layout();
		p.init({ greet: true });
		assert.ok(PET_STRINGS.ja.hello.includes(p.saying()!));
	});
	test('turned off it says nothing, and what it was saying goes', () => {
		const p = ready({ settings: { speech: false } });
		p.chat('thinking');
		p.tick(PET_POSE_MS.send);
		p.chat('waiting');
		assert.equal(p.saying(), undefined);
		const q = page();
		q.layout();
		q.init({ greet: true });
		assert.ok(q.saying());
		q.send({ type: 'settings', settings: { visible: true, size: 'medium', speech: false } });
		assert.equal(q.saying(), undefined);
	});
	test('the frame grows for its words and goes back', () => {
		const p = ready({ settings: { size: 'small' } });
		p.chat('thinking');
		p.tick(PET_POSE_MS.send);
		p.chat('waiting');
		assert.equal(p.lastAsk().height, PET_SIZES.small + BUBBLE.height + 4);
		p.tick(3200);
		assert.equal(p.saying(), undefined);
		assert.equal(p.lastAsk().height, restFrame(PET_SIZES.small).height);
	});
});

suite('being held by the mouse', () => {
	test('at a zoom she stays under the pointer: the screen knows no zoom, the page\'s pixels do', () => {
		const p = ready({ layout: { zoom: 1.25 } });
		const left = p.lastAsk().left;
		grab(p);
		carry(p, 400, 400);
		assert.equal(p.lastAsk().left - left, -80);
		assert.equal(p.lastAsk().lift, 80);
	});
	test('without a zoom she moves as far as the pointer', () => {
		const p = ready();
		const left = p.lastAsk().left;
		grab(p);
		carry(p, 400, 400);
		assert.equal(p.lastAsk().left - left, -100);
		assert.equal(p.lastAsk().lift, 100);
	});
	test('let go at an end of the box she stays where she was: she does not jump to what she keeps from it', () => {
		for (const screenX of [-5000, 5000]) {
			const p = ready();
			grab(p);
			carry(p, screenX, 500);
			const held = p.$('pet').style.left + '|' + p.lastAsk().left;
			letGo(p, screenX, 500);
			p.tick(PET_POSE_MS.land);
			assert.equal(p.$('pet').style.left + '|' + p.lastAsk().left, held, String(screenX));
		}
	});
	test('a click answers whatever the chat is doing, and she goes back to it', () => {
		for (const [activity, pose] of [['working', 'work'], ['writing', 'write'], ['thinking', 'think'], ['none', 'idle']]) {
			const p = ready();
			p.chat(activity);
			p.tick(PET_POSE_MS.send);
			assert.equal(p.pose(), pose);
			grab(p);
			letGo(p, 500, 500);
			assert.equal(p.pose(), 'joy', activity);
			p.tick(PET_POSE_MS.joy);
			assert.equal(p.pose(), pose);
		}
	});
});

suite('how she faces', () => {
	test('after a walk to the left she faces left, and what is written over her does not', () => {
		const p = ready({ random: 0 });
		p.tick(26_000);
		assert.equal(p.$('pet').style.transform, 'scaleX(-1)');
		assert.equal(p.$('pet').hasAttribute('data-mirrored'), true);
		const css = readFileSync(join(__dirname, '..', '..', 'ui', 'pet.css'), 'utf8');
		assert.ok(/\[data-mirrored\]\[data-pet-pose="sleep"\] #props \{ transform: scaleX\(-1\)/.test(css));
	});
});

suite('something waits on the user', () => {
	const held = (over: object = {}) => ready({ layout: { restricted: true }, ...over });

	test('she fades at the edges of the frame instead of being cut off by them', () => {
		const p = held();
		assert.equal(p.window.document.documentElement.hasAttribute('data-restricted'), true);
		p.layout({ restricted: false });
		assert.equal(p.window.document.documentElement.hasAttribute('data-restricted'), false);
		const css = readFileSync(join(__dirname, '..', '..', 'ui', 'pet.css'), 'utf8');
		assert.ok(/html\[data-restricted\] body \{[^}]*mask-image/.test(css));
	});

	test('it keeps inside what Breezell allows then, at every size, sunk to show her from the waist up', () => {
		for (const size of ['small', 'medium', 'large'] as const) {
			const p = held({ settings: { size } });
			const ask = p.lastAsk();
			assert.ok(ask.width <= 96 && ask.height <= 96, size);
			// The same size as ever, and the top of her head is at the top of the frame.
			assert.equal(p.$('pet').style.height, `${PET_SIZES[size]}px`);
			assert.equal(parseFloat(p.$('pet').style.bottom) + PET_SIZES[size], ask.height, size);
			// In the middle of the frame, however wide she is.
			const middle = parseFloat(p.$('pet').style.left) + petWidth(PET_SIZES[size]) / 2;
			assert.ok(Math.abs(middle - ask.width / 2) <= 1, `${size} ${middle}`);
		}
	});
	test('what floats beside her goes while only her head is in the frame', () => {
		const p = held();
		assert.equal(p.$('pet').hasAttribute('data-restricted'), true);
		p.layout({ restricted: false });
		assert.equal(p.$('pet').hasAttribute('data-restricted'), false);
	});
	test('when it is over she stands on the box again', () => {
		const p = held({ settings: { size: 'large' } });
		p.layout({ restricted: false });
		assert.equal(parseFloat(p.$('pet').style.bottom), 0);
		assert.equal(p.lastAsk().width, restFrame(PET_SIZES.large).width);
		assert.equal(p.lastAsk().height, restFrame(PET_SIZES.large).height);
	});
	test('no words and no card', () => {
		const p = held();
		p.chat('waiting');
		assert.equal(p.saying(), undefined);
		p.pointer('contextmenu');
		assert.equal(p.card(), false);
		assert.ok(p.lastAsk().width <= 96 && p.lastAsk().height <= 96);
	});
	test('it cannot be dragged off', () => {
		const p = held();
		const left = p.lastAsk().left;
		grab(p);
		carry(p, 100, 100);
		assert.equal(p.lastAsk().left, left);
		assert.equal(p.lastAsk().lift, 0);
		assert.notEqual(p.pose(), 'drag');
	});
	test('an open card closes when it starts, and comes back to size after', () => {
		const p = ready();
		p.pointer('contextmenu');
		assert.equal(p.card(), true);
		p.layout({ restricted: true });
		assert.equal(p.card(), false);
		assert.ok(p.lastAsk().width <= 96);
	});
});

suite('her hair', () => {
	test('it is drawn a row at a time, still at her head and moving towards the ends', () => {
		const p = ready();
		p.tick(1000);
		const rows = p.hair.rows;
		assert.ok(rows.length >= 50, String(rows.length));
		assert.equal(rows.find(r => r.y === 0)?.x, PET_HAIR_MARGIN);
		assert.notEqual(rows[Math.floor(rows.length * .75)].x, PET_HAIR_MARGIN);
		for (const row of rows) {
			// Never past what the frame leaves for it.
			assert.ok(row.x >= 0 && Math.abs(row.x - PET_HAIR_MARGIN) <= PET_HAIR_MARGIN, String(row.x));
		}
	});
	test('it moves as time passes, about twenty times a second', () => {
		const p = ready();
		p.tick(1000);
		const frames = p.hair.frames;
		const first = p.hair.rows.map(r => r.x).join();
		p.tick(1000);
		assert.notEqual(p.hair.rows.map(r => r.x).join(), first);
		assert.ok(p.hair.frames - frames >= 15 && p.hair.frames - frames <= 22, String(p.hair.frames - frames));
	});
	test('it costs nothing while the page cannot be seen', () => {
		const p = ready();
		p.tick(500);
		Object.defineProperty(p.window.document, 'visibilityState', { configurable: true, value: 'hidden' });
		const frames = p.hair.frames;
		p.tick(5000);
		assert.equal(p.hair.frames, frames);
	});
	test('for someone who asked for less motion it is drawn once, still', () => {
		const p = ready({ stillHair: true });
		p.tick(3000);
		assert.equal(p.hair.frames, 1);
	});
	test('it blows harder as she floats down', () => {
		const reach = (p: ReturnType<typeof ready>) => Math.max(...p.hair.rows.map(r => Math.abs(r.x - PET_HAIR_MARGIN)));
		const still = ready();
		let calm = 0;
		for (let i = 0; i < 40; i++) {
			still.tick(100);
			calm = Math.max(calm, reach(still));
		}
		const p = ready();
		grab(p);
		carry(p, 500, 0);
		letGo(p, 500, 0);
		let blown = 0;
		for (let i = 0; i < 18; i++) {
			p.tick(100);
			blown = Math.max(blown, reach(p));
		}
		assert.ok(blown > calm, `${blown} ${calm}`);
	});
});

suite('how she looks', () => {
	test('the picture every pose wants, or the usual one while it is not there', () => {
		for (const pose of PET_POSES) {
			assert.ok(['base', 'think', 'work', 'wave', 'happy', 'surprised', 'sad', 'sleep'].includes(petImageFor(pose, ['base', 'think', 'work', 'wave', 'happy', 'surprised', 'sad', 'sleep'])), pose);
			assert.equal(petImageFor(pose, ['base']), 'base', pose);
		}
		assert.equal(petImageFor('think', ['base', 'think']), 'think');
		assert.equal(petImageFor('sad', ['base', 'think']), 'base');
	});
	test('every picture there is, is in the package with its hair, and the usual one is among them', () => {
		assert.ok(PET_IMAGES.includes('base'));
		assert.ok(PET_IMAGES.includes('blink'));
		for (const name of PET_IMAGES) {
			assert.ok(existsSync(join(__dirname, '..', '..', 'ui', 'art', `${name}.webp`)), name);
			if (name !== 'blink') {
				assert.ok(existsSync(join(__dirname, '..', '..', 'ui', 'art', `${name}.hair.webp`)), name);
			}
		}
	});
	test('the page has one of each, and shows the one the pose wants', () => {
		const p = ready();
		const images = [...p.$('figure').querySelectorAll('img')] as HTMLElement[];
		assert.deepEqual(images.map(i => i.dataset.name), [...PET_IMAGES]);
		assert.deepEqual(images.filter(i => i.hasAttribute('data-on')).map(i => i.dataset.name), ['base']);
		assert.equal(images.find(i => i.dataset.name === 'blink')?.hasAttribute('data-on'), false);
		assert.ok(images.every(i => i.getAttribute('src')?.startsWith('art/')));
	});
	test('she is in the air while held and falling, and not on the box', () => {
		const p = ready();
		assert.equal(p.$('pet').hasAttribute('data-air'), false);
		grab(p);
		carry(p, 500, 300);
		assert.equal(p.$('pet').hasAttribute('data-air'), true);
		letGo(p, 500, 300);
		assert.equal(p.$('pet').hasAttribute('data-air'), true);
		p.tick(fallen(200));
		assert.equal(p.$('pet').hasAttribute('data-air'), false);
	});
	test('nothing is drawn around her as she lands: marks there look like pieces of her', () => {
		assert.equal(petProps('land', 0), petProps('idle', 0));
	});
	for (const pose of PET_POSES) {
		test(`what floats around her in ${pose} draws, and loads nothing`, () => {
			const html = petProps(pose, 1);
			const doc = new JSDOM(`<!doctype html><body>${html}`).window.document;
			assert.ok(doc.querySelector('svg'));
			assert.doesNotMatch(html, /<script|\son\w+=|href=|https?:/);
		});
	}
});
