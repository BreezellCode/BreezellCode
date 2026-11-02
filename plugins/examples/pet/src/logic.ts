/*
 * What the pet does and how it grows. No DOM and no editor here, so all of it can be tested alone.
 * It knows what the chat is doing (thinking, running a tool, waiting for the user), never what is said
 * in it: Breezell tells it no text, and nothing here could use any.
 */

export type PetPose =
	| 'idle' | 'watch' | 'think' | 'write' | 'work' | 'wait' | 'send'
	| 'celebrate' | 'startle' | 'sad' | 'sleep' | 'wake'
	| 'drag' | 'float' | 'land' | 'walk' | 'eat' | 'play' | 'joy' | 'wave' | 'levelup';

export const PET_POSES: readonly PetPose[] = ['idle', 'watch', 'think', 'write', 'work', 'wait', 'send', 'celebrate', 'startle', 'sad', 'sleep', 'wake', 'drag', 'float', 'land', 'walk', 'eat', 'play', 'joy', 'wave', 'levelup'];

/** Poses that play once and end by themselves, and how long they take. */
export const PET_POSE_MS = {
	send: 900,
	celebrate: 2400,
	startle: 650,
	sad: 3800,
	wake: 900,
	land: 420,
	eat: 2200,
	play: 2600,
	joy: 1500,
	wave: 1900,
	levelup: 3400,
} as const;

export type PetMomentPose = keyof typeof PET_POSE_MS;
export type PetActivity = 'none' | 'thinking' | 'writing' | 'working' | 'waiting';

/**
 * What it is doing now, the first that applies: being held, a moment that is playing, what the chat
 * is doing (what waits on the user first), the user typing, walking, sleeping, nothing.
 */
export function resolvePetPose(state: {
	readonly dragging?: boolean;
	readonly floating?: boolean;
	readonly moment?: PetMomentPose;
	readonly activity: PetActivity;
	readonly typing?: boolean;
	readonly walking?: boolean;
	readonly asleep?: boolean;
}): PetPose {
	if (state.dragging) {
		return 'drag';
	}
	if (state.floating) {
		return 'float';
	}
	if (state.moment) {
		return state.moment;
	}
	switch (state.activity) {
		case 'waiting': return 'wait';
		case 'working': return 'work';
		case 'writing': return 'write';
		case 'thinking': return 'think';
	}
	return state.typing ? 'watch' : state.walking ? 'walk' : state.asleep ? 'sleep' : 'idle';
}

// ---------------------------------------------------------------------------
// Growing up
// ---------------------------------------------------------------------------

/** Levels go by the Beaufort scale, from a light air to a hurricane. Total experience to reach each. */
export const PET_LEVEL_XP: readonly number[] = [0, 5, 15, 35, 70, 120, 200, 320, 500, 750, 1100, 1600];
export const PET_MAX_LEVEL = PET_LEVEL_XP.length;

export function petLevel(xp: number): { readonly level: number; readonly into: number; readonly needed: number } {
	let level = 1;
	while (level < PET_MAX_LEVEL && xp >= PET_LEVEL_XP[level]) {
		level++;
	}
	if (level === PET_MAX_LEVEL) {
		return { level, into: 0, needed: 0 };
	}
	const from = PET_LEVEL_XP[level - 1];
	return { level, into: xp - from, needed: PET_LEVEL_XP[level] - from };
}

export interface IPetProgress {
	readonly xp: number;
	readonly turns: number;
	readonly fed: number;
	readonly played: number;
	/** 0 to 100, as it was at `moodAt`. */
	readonly mood: number;
	readonly moodAt: number;
	readonly bornAt: number;
	readonly fedAt: number;
	readonly playedAt: number;
	/** Where it sits along the box, 0 to 1. */
	readonly perch: number;
}

const MOOD_START = 70;
/** It gets a little bored with no one around, and never below this. */
const MOOD_FLOOR = 30;
const MOOD_LOSS_PER_HOUR = 2;
export const DEFAULT_PERCH = 0.86;
/** Care earns experience this often: feeding a hundred times in a row is not growing up. */
const CARE_XP_EVERY_MS = 30 * 60_000;
const FULL_FOR_MS = 60_000;

export function newPetProgress(now: number): IPetProgress {
	return { xp: 0, turns: 0, fed: 0, played: 0, mood: MOOD_START, moodAt: now, bornAt: now, fedAt: 0, playedAt: 0, perch: DEFAULT_PERCH };
}

const count = (value: unknown): number => typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.floor(value) : 0;
const time = (value: unknown, fallback: number): number => typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : fallback;
export const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

/** What was kept, as far as it can be used: a damaged record starts the pet anew rather than breaking it. */
export function readPetProgress(raw: unknown, now: number): IPetProgress {
	if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
		return newPetProgress(now);
	}
	const p = raw as Record<string, unknown>;
	return {
		xp: count(p.xp),
		turns: count(p.turns),
		fed: count(p.fed),
		played: count(p.played),
		mood: typeof p.mood === 'number' && Number.isFinite(p.mood) ? clamp(p.mood, 0, 100) : MOOD_START,
		moodAt: time(p.moodAt, now),
		bornAt: time(p.bornAt, now),
		fedAt: time(p.fedAt, 0),
		playedAt: time(p.playedAt, 0),
		perch: typeof p.perch === 'number' && Number.isFinite(p.perch) ? clamp(p.perch, 0, 1) : DEFAULT_PERCH,
	};
}

export function petMood(progress: IPetProgress, now: number): number {
	const hours = Math.max(0, now - progress.moodAt) / 3_600_000;
	return progress.mood <= MOOD_FLOOR ? progress.mood : Math.max(MOOD_FLOOR, progress.mood - hours * MOOD_LOSS_PER_HOUR);
}

export type PetEvent = 'turnDone' | 'turnFailed' | 'pat' | 'feed' | 'play';

export interface IPetEventResult {
	readonly progress: IPetProgress;
	/** The new level, when this raised it. */
	readonly levelUp?: number;
	/** It did not want that just now. */
	readonly refused?: boolean;
}

/** What an event does to it. */
export function applyPetEvent(progress: IPetProgress, event: PetEvent, now: number): IPetEventResult {
	const mood = petMood(progress, now);
	const withMood = (change: number, rest: Partial<IPetProgress> = {}, xp = 0): IPetEventResult => {
		const next: IPetProgress = { ...progress, ...rest, mood: clamp(mood + change, 0, 100), moodAt: now, xp: progress.xp + xp };
		const before = petLevel(progress.xp).level;
		const after = petLevel(next.xp).level;
		return after > before ? { progress: next, levelUp: after } : { progress: next };
	};
	switch (event) {
		case 'turnDone':
			return withMood(3, { turns: progress.turns + 1 }, 1);
		case 'turnFailed':
			return withMood(-2);
		case 'pat':
			return withMood(2);
		case 'feed':
			if (now - progress.fedAt < FULL_FOR_MS) {
				return { progress, refused: true };
			}
			return withMood(15, { fed: progress.fed + 1, fedAt: now }, now - progress.fedAt >= CARE_XP_EVERY_MS ? 1 : 0);
		case 'play':
			return withMood(20, { played: progress.played + 1, playedAt: now }, now - progress.playedAt >= CARE_XP_EVERY_MS ? 1 : 0);
	}
}

export function petDaysTogether(progress: IPetProgress, now: number): number {
	return Math.max(1, Math.floor((now - progress.bornAt) / 86_400_000) + 1);
}

// ---------------------------------------------------------------------------
// Where it stands
// ---------------------------------------------------------------------------

/** How tall it can be, in pixels. */
export const PET_SIZES = { small: 170, medium: 200, large: 232 } as const;
export type PetSize = keyof typeof PET_SIZES;

/** How wide it is at a height: the pictures show 1024 by 1130 of what was painted. */
export const petWidth = (height: number): number => Math.round(height * 1024 / 1130);
export const petSizeOf = (size: unknown): PetSize => size === 'small' || size === 'large' ? size : 'medium';

const MARGIN = 8;

/** Where a pet stands on a box at `perch`, kept on the box. */
export function petLeft(perch: number, boxWidth: number, size: number): number {
	const room = Math.max(0, boxWidth - size - MARGIN * 2);
	return MARGIN + clamp(perch, 0, 1) * room;
}

/** The perch for a pet dropped at `left`. */
export function petPerchAt(left: number, boxWidth: number, size: number): number {
	const room = boxWidth - size - MARGIN * 2;
	return room > 0 ? clamp((left - MARGIN) / room, 0, 1) : DEFAULT_PERCH;
}

/** What her hair may reach beyond the picture on each side, in pixels. */
export const PET_HAIR_MARGIN = 10;

/** The frame it asks for with nothing to show but itself, `height` tall: room for her hair and her jumps and little else, as the frame catches the mouse. */
export function restFrame(height: number): { readonly width: number; readonly height: number } {
	return { width: petWidth(height) + PET_HAIR_MARGIN * 2, height: Math.min(240, height + 8) };
}

/**
 * How many steps it takes to float down from `height`. A wind spirit drifts: fast movement over the
 * chat left pieces of her behind on the screen, however she was moved, and slow movement never has.
 * By steps rather than by the clock, so a busy machine makes her slower, not jump.
 */
export function petFloatSteps(height: number): number {
	return Math.max(12, Math.ceil(Math.max(0, height) / 4.2));
}

/** How high she still is `part` of the way down: easing away and easing in to land. */
export function petFloatLift(from: number, part: number): number {
	const done = Math.min(1, Math.max(0, part));
	return from * (1 - done * done * (3 - 2 * done));
}

/**
 * How far a row of her hair is blown, as a part of her height: `row` from 0 at the top of the picture
 * to 1 at the bottom. Nothing at her head and more towards the ends, in waves that run down it.
 */
export function petHairShift(row: number, seconds: number, strength = 1): number {
	const rise = clamp((row - .2) / .5, 0, 1);
	const reach = rise * rise * (3 - 2 * rise);
	const t = seconds / 3.2;
	return reach * strength * .024 * (Math.sin(2 * Math.PI * (row * 1.6 - t)) + .4 * Math.sin(2 * Math.PI * (row * 3.4 - t * 1.7)));
}

/**
 * Where a frame of `width` goes to have the pet at `petAt` on the box, and where the pet is inside it.
 * Centred on the pet, unless the box's ends push it aside.
 */
export function frameAround(petAt: number, size: number, width: number, boxWidth: number): { readonly left: number; readonly petX: number } {
	const left = Math.round(clamp(petAt - (width - size) / 2, 0, Math.max(0, boxWidth - width)));
	return { left, petX: Math.round(petAt) - left };
}
