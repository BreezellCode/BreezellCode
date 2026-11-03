/*
 * The pet on the chat box. This page is a small frame Breezell floats on the box: everything the pet
 * draws stays inside it, and it asks Breezell to move or resize the frame. Breezell tells it what the
 * chat is doing, by states and never by text. What it keeps goes to the plugin's code to be saved.
 */
import { petImageFor, petProps } from './art';
import { PET_IMAGES } from './images.generated';
import {
	applyPetEvent, clamp, frameAround, IPetProgress, newPetProgress, PetActivity, PetEvent, petDaysTogether, petFittedHeight, petLeft, petLevel, PetMomentPose, petMood, petPerchAt, petWidth,
	petFloatLift, petFloatSteps, PET_HAIR_MARGIN, PET_HIT_SHARE, PET_MARGIN, petHairShift, PET_POSE_MS, PET_SIZES, petSizeOf, PetSize, readPetProgress, resolvePetPose, restFrame,
} from '../src/logic';
import { IPetStrings, petStrings } from '../src/strings';

declare function acquireVsCodeApi(): { postMessage(message: unknown): void };
const vscode = acquireVsCodeApi();

/** Asleep after this long with nothing going on. */
const SLEEP_AFTER_MS = 2 * 60_000;
const TYPING_LASTS_MS = 1600;
const WALK_EVERY_MS: readonly [number, number] = [25_000, 70_000];
const WALK_PX_PER_S = 34;
const SPEECH_MS = 3200;
/** Words that are not urgent wait this long after the last. */
const SPEECH_GAP_MS = 14_000;
/** How often a step of floating down comes. */
const FALL_STEP_MS = 16;
/** Dropped lower than this it is already on the box. */
const FALL_FROM = 8;
const CARD_HIDE_MS = 240;
const BORED_EVERY_MS = 10 * 60_000;
const BORED_BELOW = 35;
/** What Breezell allows while something waits on the user: there is no room for words then. */
const RESTRICTED_SIZE = 96;
/** The most Breezell gives a frame. */
const FRAME_MAX = 240;
/**
 * It waits for the plugin's code, which says who it is and where and whether it should show at all. That
 * can take seconds as a window opens, and it does not come at all only if that code is broken: then the
 * pet still works, and only forgets.
 */
const INIT_WAIT_MS = 15_000;

const petEl = document.getElementById('pet') as HTMLElement;
const figureEl = document.getElementById('figure') as HTMLElement;
const propsEl = document.getElementById('props') as HTMLElement;
const bubbleEl = document.getElementById('bubble') as HTMLElement;
const cardEl = document.getElementById('card') as HTMLElement;

let t: IPetStrings = petStrings('en');
let progress: IPetProgress = newPetProgress(Date.now());
let size: PetSize = 'medium';
let speechOn = true;
let visible = true;
let started = false;

let boxWidth = 0;
let maxLift = 0;
let restricted = false;
/** The window's zoom: what the mouse's position on the screen is measured against. */
let zoom = 1;

let activity: PetActivity = 'none';
let moment: PetMomentPose | undefined;
let food = 0;
let typing = false;
let asleep = false;
let facing = 1;
let wander: number | undefined;
let speech: string | undefined;
let cardOpen = false;
let held: { at: number; lift: number } | undefined;
/** How high it still is, during a fall. */
let fallLift: number | undefined;

let lastActive = Date.now();
let lastSpoke = 0;
let said = 0;
let nextWalk = Date.now() + WALK_EVERY_MS[0];
let lastBored = Date.now();
let lastDrawn = '';
let cardHtml = '';
/** What it has asked for so far. */
const asked: ICompanionRequest = {};
let askedHit = '';
/** When the move under way ends. */
let moveEnds = 0;
let walk: { from: number; to: number; since: number; ms: number } | undefined;
let frameHeight = 0;

const timers = new Map<string, ReturnType<typeof setTimeout>>();
function cancel(name: string): void {
	const running = timers.get(name);
	if (running !== undefined) {
		clearTimeout(running);
		timers.delete(name);
	}
}

/** Runs `run` after `ms`, instead of whatever was to run under this name. */
function later(name: string, ms: number, run: () => void): void {
	cancel(name);
	timers.set(name, setTimeout(() => {
		timers.delete(name);
		run();
	}, ms));
}

interface ICompanionRequest {
	width?: number;
	height?: number;
	left?: number;
	lift?: number;
	ms?: number;
	hidden?: boolean;
	hit?: readonly { x: number; y: number; width: number; height: number }[];
}

/**
 * Only when something changes. Breezell answers every move with where it now is: asking for the same
 * place again, with no time to get there, would end a move under way at once.
 */
function ask(request: ICompanionRequest): void {
	const keys = Object.keys(request) as (keyof ICompanionRequest)[];
	const hit = JSON.stringify(request.hit ?? asked.hit ?? null);
	if (hit !== askedHit || keys.some(key => key !== 'ms' && key !== 'hit' && request[key] !== asked[key])) {
		askedHit = hit;
		Object.assign(asked, request);
		vscode.postMessage({ __breezellCompanion: request });
	}
}

/** How tall it is, and how wide. */
const tall = (): number => petFittedHeight(PET_SIZES[size], boxWidth);
const wide = (): number => petWidth(tall());
const petAt = (): number => held ? held.at : petLeft(wander ?? progress.perch, boxWidth, wide());

/** What shows, from the state. */
function draw(): void {
	const pose = resolvePetPose({ dragging: !!held, floating: fallLift !== undefined, moment, activity, typing, walking: !!walk, asleep });
	const image = petImageFor(pose, PET_IMAGES);
	const signature = [pose, food, tall()].join('|');
	if (signature !== lastDrawn) {
		lastDrawn = signature;
		petEl.dataset.petPose = pose;
		petEl.dataset.image = image;
		petEl.style.width = `${wide()}px`;
		petEl.style.height = `${tall()}px`;
		for (const img of figureEl.querySelectorAll('img')) {
			img.toggleAttribute('data-on', img.dataset.name === image);
		}
		hairImage = hairImages.get(image);
		hairDrawnAt = -Infinity;
		startHair();
		propsEl.innerHTML = petProps(pose, food);
	}
	petEl.toggleAttribute('data-air', !!held || fallLift !== undefined);
	petEl.toggleAttribute('data-restricted', restricted);
	petEl.toggleAttribute('data-mirrored', facing < 0);
	document.documentElement.toggleAttribute('data-restricted', restricted);
	petEl.style.transform = facing < 0 ? 'scaleX(-1)' : '';
}

/** The frame: as small as what shows, as it catches the mouse. */
function place(ms = 0): void {
	if (!started || !boxWidth) {
		return;
	}
	if (!visible) {
		ask({ hidden: true });
		return;
	}
	// A word or a card during a walk changes the frame, and the walk goes on for the time it has left.
	const now = Date.now();
	if (ms) {
		moveEnds = now + ms;
	} else if (now < moveEnds) {
		ms = moveEnds - now;
	}
	const petTall = tall();
	const petWide = wide();
	const rest = restFrame(petTall);
	let width = rest.width;
	let height = rest.height;
	const showCard = cardOpen && !restricted;
	const showSpeech = !!speech && !showCard && !restricted;
	cardEl.style.display = showCard ? 'block' : 'none';
	bubbleEl.style.display = showSpeech ? 'block' : 'none';
	if (showCard) {
		// Over her dress, under her face: the frame need not grow for it.
		width = Math.max(width, cardEl.offsetWidth + 2);
		height = Math.max(height, cardEl.offsetHeight + 4);
	} else if (showSpeech) {
		width = Math.max(width, bubbleEl.offsetWidth + 2);
		height = Math.min(FRAME_MAX, Math.max(height, petTall + bubbleEl.offsetHeight + 4));
	}
	if (restricted) {
		width = Math.min(width, RESTRICTED_SIZE);
		height = Math.min(height, RESTRICTED_SIZE);
	}
	const roomOnLeft = petAt() + petWide / 2 > boxWidth / 2;
	const frame = frameAround(petAt(), petWide, width, boxWidth);
	frameHeight = height;
	petEl.style.left = `${frame.petX}px`;
	petEl.style.transition = ms ? `left ${ms}ms linear` : '';
	// With little room it sinks behind the box and shows from the waist up, rather than shrinking.
	const petBottom = Math.min(0, height - petTall);
	petEl.style.bottom = `${petBottom}px`;
	bubbleEl.style.bottom = `${Math.min(petTall + 2, height - bubbleEl.offsetHeight)}px`;
	cardEl.style.bottom = '2px';
	const cardLeft = Math.round((width - cardEl.offsetWidth) / 2);
	cardEl.style.left = `${cardLeft}px`;
	bubbleEl.style.left = roomOnLeft ? '0' : '';
	bubbleEl.style.right = roomOnLeft ? '' : '0';
	// What catches the mouse: her middle, and her card when it is open. The rest of the frame lets it through to the chat.
	const hitWide = Math.round(petWide * PET_HIT_SHARE);
	const hit = [{ x: frame.petX + Math.round((petWide - hitWide) / 2), y: height - petBottom - petTall, width: hitWide, height: petTall }];
	if (showCard) {
		hit.push({ x: cardLeft, y: height - 2 - cardEl.offsetHeight, width: cardEl.offsetWidth, height: cardEl.offsetHeight });
	}
	ask({ hidden: false, width, height, left: frame.left, lift: Math.round(held ? held.lift : fallLift ?? 0), ms, hit });
}

function refresh(ms = 0): void {
	draw();
	place(ms);
}

/** Her progress, as it now is: what is on her card follows it. */
function setProgress(next: IPetProgress): void {
	progress = next;
	if (cardOpen) {
		fillCard();
	}
}

function save(next: IPetProgress): void {
	const before = progress;
	setProgress(next);
	vscode.postMessage({ save: next, before });
}

function apply(event: PetEvent): ReturnType<typeof applyPetEvent> {
	const result = applyPetEvent(progress, event, Date.now());
	if (result.progress !== progress) {
		save(result.progress);
	}
	return result;
}

function say(text: string, urgent = false): void {
	const now = Date.now();
	if (!speechOn || (!urgent && now - lastSpoke < SPEECH_GAP_MS)) {
		return;
	}
	lastSpoke = now;
	speech = text;
	bubbleEl.textContent = text;
	later('speech', SPEECH_MS, () => {
		speech = undefined;
		refresh();
	});
}

const sayLine = (options: readonly string[], urgent = false) => say(options[said++ % options.length], urgent);

function play(pose: PetMomentPose, then?: () => void): void {
	moment = pose;
	later('moment', PET_POSE_MS[pose], () => {
		moment = undefined;
		then?.();
		refresh();
	});
}

function wake(): void {
	lastActive = Date.now();
	if (asleep) {
		asleep = false;
		play('wake');
	}
}

function celebrateLevel(level: number): void {
	play('levelup');
	say(t.levelup.replace('{title}', t.titles[level - 1]), true);
}

/** A moment of care, and the new level after it if it raised one. */
function playCare(pose: PetMomentPose, levelUp: number | undefined): void {
	play(pose, levelUp ? () => celebrateLevel(levelUp) : undefined);
}

// --- what Breezell says ---------------------------------------------------------------------------

function onActivity(next: PetActivity): void {
	const previous = activity;
	activity = next;
	if (next !== 'none') {
		wake();
	}
	if (previous === 'none' && next !== 'none') {
		play('send');
	}
	if (next === 'waiting' && previous !== 'waiting') {
		sayLine(t.wait, true);
	} else if (previous === 'waiting' && speech) {
		speech = undefined; // answered: no more waiting to talk about
	}
	refresh();
}

function onTurn(outcome: unknown): void {
	wake();
	if (outcome === 'done') {
		const { levelUp } = apply('turnDone');
		if (levelUp) {
			celebrateLevel(levelUp);
		} else {
			play('celebrate');
			sayLine(t.done);
		}
	} else if (outcome === 'failed') {
		apply('turnFailed');
		play('startle', () => play('sad'));
		sayLine(t.failed, true);
	}
	refresh();
}

function onTyping(): void {
	wake();
	const was = typing;
	typing = true;
	later('typing', TYPING_LASTS_MS, () => {
		typing = false;
		refresh();
	});
	figureEl.animate?.([{ transform: 'translateY(0)' }, { transform: 'translateY(1.4px)' }, { transform: 'translateY(0)' }], { duration: 170, easing: 'ease-out' });
	if (!was) {
		refresh();
	}
}

function start(greet: boolean): void {
	if (started) {
		return;
	}
	started = true;
	if (greet) {
		play('wave');
		sayLine(t.hello, true);
	}
	refresh();
}

function applySettings(raw: unknown): void {
	const s = raw && typeof raw === 'object' ? raw as { size?: unknown; speech?: unknown; visible?: unknown } : {};
	size = petSizeOf(s.size);
	speechOn = s.speech !== false;
	visible = s.visible !== false;
	if (!speechOn) {
		speech = undefined;
	}
	syncPaused();
}

window.addEventListener('message', ({ data }) => {
	if (!data || typeof data !== 'object') {
		return;
	}
	switch (data.type) {
		case 'breezell.surface.context':
			t = petStrings(data.context?.language);
			fillCard();
			break;
		case 'breezell.companion.layout':
			boxWidth = Number(data.boxWidth) || 0;
			maxLift = Number(data.maxLift) || 0;
			restricted = !!data.restricted;
			zoom = Number(data.zoom) > 0 ? Number(data.zoom) : 1;
			refresh(); // its size may have changed with that
			break;
		case 'breezell.companion.chat':
			onActivity(data.activity);
			break;
		case 'breezell.companion.turn':
			onTurn(data.outcome);
			break;
		case 'breezell.companion.typing':
			onTyping();
			break;
		// From the plugin's code.
		case 'init':
			progress = readPetProgress(data.progress, Date.now());
			applySettings(data.settings);
			start(!!data.greet);
			refresh();
			break;
		case 'progress':
			setProgress(readPetProgress(data.progress, Date.now()));
			refresh();
			break;
		case 'settings':
			applySettings(data.settings);
			refresh();
			break;
	}
});

// --- the mouse ------------------------------------------------------------------------------------

// Pressing on her takes nothing from the chat: not the focus, which stays in the box beneath, and no
// selection, which a browser paints over a whole frame. Clicks and the pointer's events still come.
for (const type of ['mousedown', 'selectstart', 'dragstart']) {
	document.addEventListener(type, e => e.preventDefault());
}

let press: { x: number; y: number; at: number; lift: number; moved: boolean } | undefined;
const stroke = { direction: 0, turns: 0, at: 0, x: 0 };

petEl.addEventListener('pointerdown', e => {
	if (e.button !== 0) {
		return;
	}
	petEl.setPointerCapture?.(e.pointerId); // on this, as what was pressed is drawn anew
	stopWalking();
	// Caught on the way down, it stays where it was caught.
	const caught = fallLift;
	cancel('fall');
	fallLift = undefined;
	press = { x: e.screenX, y: e.screenY, at: petAt(), lift: caught ?? 0, moved: caught !== undefined };
	if (caught !== undefined) {
		held = { at: press.at, lift: caught };
		refresh();
	}
});

petEl.addEventListener('pointermove', e => {
	if (press) {
		// On the screen: the frame moves under the pointer as it goes. The screen knows no zoom, the page's pixels do.
		const dx = (e.screenX - press.x) / zoom;
		const dy = (e.screenY - press.y) / zoom;
		if (!press.moved && Math.hypot(dx, dy) < 4) {
			return;
		}
		if (restricted) {
			return; // something waits on the user: it stays where it is
		}
		press.moved = true;
		wake();
		closeCard();
		wander = undefined;
		held = {
			// Within what she keeps from the ends of the box, where she stays when let go.
			at: clamp(press.at + dx, PET_MARGIN, Math.max(PET_MARGIN, boxWidth - wide() - PET_MARGIN)),
			lift: clamp(press.lift - dy, 0, Math.max(0, maxLift - frameHeight)),
		};
		refresh();
		return;
	}
	// Stroking it: back and forth over it, with no button down.
	const direction = Math.sign(e.clientX - stroke.x);
	stroke.x = e.clientX;
	if (e.timeStamp - stroke.at > 500) {
		stroke.turns = 0;
	}
	if (direction && direction !== stroke.direction) {
		stroke.direction = direction;
		stroke.turns++;
		stroke.at = e.timeStamp;
		if (stroke.turns >= 5 && activity === 'none' && !moment) {
			stroke.turns = 0;
			wake();
			apply('pat');
			play('joy');
			sayLine(t.pat);
			refresh();
		}
	}
});

/** Stops where it is now: taken hold of mid-walk, it is still under the pointer. */
function stopWalking(): void {
	if (!walk) {
		return;
	}
	const part = clamp((Date.now() - walk.since) / walk.ms, 0, 1);
	wander = petPerchAt(walk.from + (walk.to - walk.from) * part, boxWidth, wide());
	walk = undefined;
	moveEnds = 0;
	cancel('walk');
	refresh();
}

petEl.addEventListener('pointerup', endPress);
petEl.addEventListener('pointercancel', endPress);

function endPress(): void {
	const was = press;
	press = undefined;
	if (!was) {
		return;
	}
	if (!was.moved) {
		wake();
		apply('pat');
		// Whatever the chat is doing: she answers, then goes back to it.
		if (!moment) {
			play('joy');
		}
		refresh();
		return;
	}
	const dropped = held;
	held = undefined;
	if (!dropped) {
		return;
	}
	save({ ...progress, perch: petPerchAt(dropped.at, boxWidth, wide()) });
	if (dropped.lift > FALL_FROM) {
		startFall(dropped.lift);
	} else {
		play('land');
		refresh();
	}
}

/** Back down to the box, drifting, a small step at a time. */
function startFall(from: number): void {
	const steps = petFloatSteps(from);
	let done = 0;
	const step = () => {
		done++;
		if (done >= steps) {
			fallLift = undefined;
			play('land');
			refresh();
			return;
		}
		fallLift = petFloatLift(from, done / steps);
		refresh();
		later('fall', FALL_STEP_MS, step);
	};
	fallLift = from;
	refresh();
	later('fall', FALL_STEP_MS, step);
}
function openCard(): void {
	if (press) {
		return;
	}
	wake();
	cardOpen = true;
	fillCard();
	refresh();
}

function closeCard(): void {
	if (cardOpen) {
		cardOpen = false;
		place();
	}
}

// Her card opens only when asked for: it lies over her, and hovering it open got in the way of picking her up.
petEl.addEventListener('pointerenter', () => cancel('card'));
petEl.addEventListener('pointerleave', () => later('card', CARD_HIDE_MS, closeCard));
cardEl.addEventListener('pointerenter', () => cancel('card'));
cardEl.addEventListener('pointerleave', () => later('card', CARD_HIDE_MS, closeCard));
document.documentElement.addEventListener('pointerleave', () => later('card', CARD_HIDE_MS, closeCard));

// Off her and off her card the frame has to let go of the mouse, and only this page can see that. From
// one to the other is not off: leaving comes first and going in right after.
for (const element of [petEl, cardEl]) {
	element.addEventListener('pointerenter', () => cancel('mouse'));
	element.addEventListener('pointerleave', () => later('mouse', 0, () => {
		if (!press) {
			vscode.postMessage({ __breezellCompanion: { mouseOut: true } });
		}
	}));
}

// She floats over the chat, and the wheel over her is for the chat, as it is beside her.
document.addEventListener('wheel', e => {
	if (e.ctrlKey) {
		return;
	}
	const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? window.innerHeight : 1;
	vscode.postMessage({ __breezellCompanion: { scroll: { deltaX: e.deltaX * unit, deltaY: e.deltaY * unit } } });
}, { passive: true });
document.addEventListener('contextmenu', e => {
	e.preventDefault();
	openCard();
});

function fillCard(): void {
	const level = petLevel(progress.xp);
	const now = Date.now();
	const row = (text: string) => `<div class="soft">${escapeHtml(text)}</div>`;
	const bar = (part: number, color: string) => `<div class="bar"><div style="width:${Math.round(clamp(part, 0, 1) * 100)}%;background:${color}"></div></div>`;
	const html = `
		<div class="head"><span class="name">${escapeHtml(t.name)}</span><span class="soft">Lv.${level.level} ${escapeHtml(t.titles[level.level - 1])}</span></div>
		${bar(level.needed ? level.into / level.needed : 1, '#5fb6e8')}
		<div class="mood"><span class="soft">${escapeHtml(t.mood)}</span>${bar(petMood(progress, now) / 100, '#f0708a')}</div>
		${row(t.turns.replace('{count}', String(progress.turns)))}
		${row(t.days.replace('{count}', String(petDaysTogether(progress, now))))}
		<div class="actions"><button data-do="feed">${escapeHtml(t.feed)}</button><button data-do="play">${escapeHtml(t.play)}</button><button data-do="hide">${escapeHtml(t.hide)}</button></div>`;
	// Only when something changed: a button under the pointer stays the one pressed.
	if (html !== cardHtml) {
		cardHtml = html;
		cardEl.innerHTML = html;
	}
}

const escapeHtml = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

cardEl.addEventListener('click', e => {
	const action = (e.target as HTMLElement).closest('button')?.dataset.do;
	wake();
	if (action === 'feed') {
		const { refused, levelUp } = apply('feed');
		if (refused) {
			say(t.full, true);
		} else {
			food++;
			playCare('eat', levelUp);
			sayLine(t.fed, true);
		}
	} else if (action === 'play') {
		const { levelUp } = apply('play');
		playCare('play', levelUp);
		sayLine(t.played, true);
	} else if (action === 'hide') {
		vscode.postMessage({ hide: true });
		return;
	}
	fillCard();
	cardOpen = false;
	refresh();
});

// --- by itself ------------------------------------------------------------------------------------

setInterval(() => {
	if (document.visibilityState === 'hidden' || !started) {
		return;
	}
	const now = Date.now();
	if (activity !== 'none' || moment || typing || held || cardOpen || press) {
		lastActive = now;
		nextWalk = Math.max(nextWalk, now + WALK_EVERY_MS[0] / 2);
		return;
	}
	if (now - lastActive >= SLEEP_AFTER_MS) {
		if (!asleep) {
			asleep = true;
			say(t.sleepy);
			refresh();
		}
		return;
	}
	if (petMood(progress, now) < BORED_BELOW && now - lastBored >= BORED_EVERY_MS) {
		lastBored = now;
		say(t.bored);
		refresh();
	}
	// Wandering along the box now and then.
	if (now >= nextWalk && boxWidth > 0 && !walk && !restricted) {
		nextWalk = now + WALK_EVERY_MS[0] + Math.random() * (WALK_EVERY_MS[1] - WALK_EVERY_MS[0]);
		const start = wander ?? progress.perch;
		const end = clamp(start + (Math.random() - 0.5) * 0.5, 0, 1);
		const from = petLeft(start, boxWidth, wide());
		const to = petLeft(end, boxWidth, wide());
		if (Math.abs(to - from) >= 16) {
			const ms = Math.round(Math.abs(to - from) / WALK_PX_PER_S * 1000);
			facing = to >= from ? 1 : -1;
			walk = { from, to, since: now, ms };
			wander = end;
			refresh(ms);
			later('walk', ms, () => {
				walk = undefined;
				refresh();
			});
		}
	}
}, 1000);

document.addEventListener('visibilitychange', syncPaused);

/** Whether anyone can see her. Turned off she is still a page in the chat, and it should cost nothing. */
function paused(): boolean {
	return document.visibilityState === 'hidden' || !visible;
}

function syncPaused(): void {
	document.documentElement.toggleAttribute('data-paused', paused());
	petEl.style.display = visible ? '' : 'none';
	startHair();
}

// --- her hair -------------------------------------------------------------------------------------

/** Her hair is on a layer of its own, behind her, drawn a row at a time with each row blown a little. */
const HAIR_FPS = 20;
const HAIR_ROW = 2;
/** How much of the wind there is. */
const HAIR_WIND: Partial<Record<string, number>> = { float: 1.7, drag: 1.7, walk: 1.3, sleep: .35 };

figureEl.style.setProperty('--hair-margin', `${PET_HAIR_MARGIN}px`);
const hairCanvas = document.createElement('canvas');
figureEl.appendChild(hairCanvas);
const hairContext = hairCanvas.getContext('2d');
const hairImages = new Map<string, HTMLImageElement>();
let hairImage: HTMLImageElement | undefined;
let hairDrawnAt = -Infinity;
let hairRunning = false;
const stillHair = !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/** By a timer and not by frames: asking for every frame keeps the page painting whether or not anything moved. */
function startHair(): void {
	if (!hairRunning && !paused()) {
		hairRunning = true;
		hairTick();
	}
}

function hairTick(): void {
	if (paused()) {
		hairRunning = false;
		return;
	}
	if (hairContext && hairImage?.naturalWidth && (!stillHair || hairDrawnAt === -Infinity)) {
		drawHair(Date.now());
	}
	if (stillHair && hairDrawnAt !== -Infinity) {
		hairRunning = false; // drawn, and it stays so: a new picture starts this again
		return;
	}
	setTimeout(hairTick, 1000 / HAIR_FPS);
}

function drawHair(now: number): void {
	if (!hairContext || !hairImage) {
		return;
	}
	hairDrawnAt = now;
	const scale = Math.min(2, window.devicePixelRatio || 1);
	const width = Math.round(wide() * scale);
	const height = Math.round(tall() * scale);
	const margin = PET_HAIR_MARGIN * scale;
	if (hairCanvas.width !== width + margin * 2 || hairCanvas.height !== height) {
		hairCanvas.width = width + margin * 2;
		hairCanvas.height = height;
	}
	hairContext.clearRect(0, 0, hairCanvas.width, height);
	const seconds = stillHair ? 0 : now / 1000;
	const wind = HAIR_WIND[petEl.dataset.petPose ?? ''] ?? 1;
	const sourceWidth = hairImage.naturalWidth;
	const sourceHeight = hairImage.naturalHeight;
	const sourceRow = sourceHeight * HAIR_ROW / height;
	for (let y = 0; y < height; y += HAIR_ROW) {
		const shift = petHairShift(y / height, seconds, wind) * height;
		hairContext.drawImage(hairImage, 0, y / height * sourceHeight, sourceWidth, sourceRow, margin + shift, y, width, HAIR_ROW);
	}
}

for (const name of PET_IMAGES) {
	if (name !== 'blink') {
		const hair = new Image();
		hair.src = `art/${name}.hair.webp`;
		hairImages.set(name, hair);
	}
	const img = document.createElement('img');
	img.src = `art/${name}.webp`;
	img.alt = '';
	img.draggable = false;
	img.dataset.name = name;
	figureEl.appendChild(img);
}

startHair();

vscode.postMessage({ __breezellSurfaceReady: true });
vscode.postMessage({ hello: true });
setTimeout(() => start(false), INIT_WAIT_MS);
