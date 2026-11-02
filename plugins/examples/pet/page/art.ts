/*
 * How she looks: pictures painted for her (ui/art, made by tools/prepare_art.py), one for each kind of
 * moment, and what floats around her, drawn here on 100 by 110, the shape of the pictures.
 */
import { PetPose } from '../src/logic';

const POSE_IMAGE: Readonly<Record<PetPose, string>> = {
	idle: 'base', watch: 'base', walk: 'base', float: 'base', land: 'base', send: 'base', wake: 'base',
	think: 'think',
	write: 'work', work: 'work',
	wait: 'wave', wave: 'wave',
	celebrate: 'happy', levelup: 'happy', joy: 'happy', play: 'happy', eat: 'happy',
	startle: 'surprised', drag: 'surprised',
	sad: 'sad',
	sleep: 'sleep',
};

/** The picture for a pose, among those there are. */
export function petImageFor(pose: PetPose, images: readonly string[]): string {
	const wanted = POSE_IMAGE[pose];
	return images.includes(wanted) ? wanted : 'base';
}

/** Readable on a dark theme and a light one. */
const MARK = '#8b95a5';

const FOODS: readonly string[] = [
	// A rice ball.
	`<path d="M60 30 C 62 30 65 34 64.6 36 C 64.2 37.4 55.8 37.4 55.4 36 C 55 34 58 30 60 30 Z" fill="#fff" stroke="#aeb8cc" stroke-width=".4"/><path d="M57.4 37 h5.2 v-2.2 h-5.2 z" fill="#2b3a35"/>`,
	// A dango.
	`<path d="M54 38 L 66 30" stroke="#b08a5a" stroke-width=".8" stroke-linecap="round"/><circle cx="56.6" cy="36.4" r="2" fill="#f6b6c6"/><circle cx="60" cy="34" r="2" fill="#fff" stroke="#aeb8cc" stroke-width=".3"/><circle cx="63.4" cy="31.8" r="2" fill="#a8d59a"/>`,
	// A cookie.
	`<circle cx="60" cy="34" r="3.8" fill="#e6b877" stroke="#c4935a" stroke-width=".5"/><circle cx="58.8" cy="33" r=".6" fill="#6b4a2b"/><circle cx="61.4" cy="34" r=".6" fill="#6b4a2b"/><circle cx="59.6" cy="35.6" r=".6" fill="#6b4a2b"/>`,
];

function around(pose: PetPose, food: number): string {
	switch (pose) {
		case 'think':
			return `<g fill="#fff" stroke="${MARK}" stroke-width=".5"><circle data-p="dot1" cx="72" cy="15" r="1.2"/><circle data-p="dot2" cx="78" cy="9" r="1.8"/><circle data-p="dot3" cx="86" cy="4" r="2.6"/></g>`;
		case 'wait':
			return `<g data-p="sign"><path d="M84 2 C 89 2 93 5.6 93 10 C 93 14.4 89 18 84 18 C 82.6 18 81.2 17.7 80 17.2 L 75.8 19 L 77 15.2 C 76 13.8 75 12 75 10 C 75 5.6 79 2 84 2 Z" fill="#f5c04a" stroke="#c9962a" stroke-width=".7" stroke-linejoin="round"/><path d="M84 5.4 v5.6" stroke="#2b2f38" stroke-width="2" stroke-linecap="round"/><circle cx="84" cy="14" r="1.2" fill="#2b2f38"/></g>`;
		case 'send':
			return `<g fill="none" stroke="${MARK}" stroke-width="1" stroke-linecap="round"><path data-p="wind1" d="M78 28 C 75 22 82 19 79 12"/><path data-p="wind2" d="M85 32 C 83 27 88 24 86 18"/><path data-p="wind3" d="M71 26 C 69 21 74 19 72 14"/></g>`;
		case 'walk':
			return `<g fill="none" stroke="${MARK}" stroke-width="1" stroke-linecap="round"><path d="M3 66 h6 M0 78 h5 M4 90 h4"/></g>`;
		case 'sleep':
			return `<g fill="#fff" font-weight="800" font-family="system-ui, sans-serif" stroke="#3a4250" stroke-width="1" paint-order="stroke"><text data-p="z1" x="70" y="17" font-size="5.5">z</text><text data-p="z2" x="76" y="11" font-size="7">z</text><text data-p="z3" x="84" y="5" font-size="9">z</text></g>`;
		case 'startle':
			return `<g stroke="${MARK}" stroke-width="1.2" stroke-linecap="round"><path d="M30 9 l-3 -4 M70 9 l3 -4 M50 2 v-4 M40 4 l-1 -4 M60 4 l1 -4"/></g>`;
		case 'joy':
			return `<g fill="#f0708a"><path data-p="heart1" d="M24 16 c-1.4 -2.4 -4.2 -1 -3.4 1.4 c.5 1.4 3.4 3.4 3.4 3.4 s2.9 -2 3.4 -3.4 c.8 -2.4 -2 -3.8 -3.4 -1.4 z"/><path data-p="heart2" d="M76 10 c-1.1 -1.8 -3.3 -.8 -2.6 1.1 c.4 1.1 2.6 2.5 2.6 2.5 s2.2 -1.4 2.6 -2.5 c.7 -1.9 -1.5 -2.9 -2.6 -1.1 z"/></g>`;
		case 'celebrate':
		case 'levelup':
			return `<g data-p="confetti"><rect data-p="c1" x="14" y="8" width="3" height="3" rx=".7" fill="#f0708a"/><rect data-p="c2" x="82" y="6" width="3" height="3" rx=".7" fill="#f5c04a"/><rect data-p="c3" x="8" y="26" width="2.6" height="2.6" rx=".6" fill="#5fb6e8"/><rect data-p="c4" x="90" y="24" width="2.6" height="2.6" rx=".6" fill="#7bd38f"/><circle data-p="c5" cx="30" cy="3" r="1.5" fill="#5fb6e8"/><circle data-p="c6" cx="68" cy="2" r="1.5" fill="#f0708a"/></g>`;
		case 'eat':
			return `<g data-p="food">${FOODS[Math.abs(food) % FOODS.length]}</g>`;
		case 'play':
			return `<g data-p="ball"><circle cx="82" cy="12" r="4.6" fill="#f5c04a" stroke="#c9962a" stroke-width=".7"/><path d="M78 9.6 q4 3 8 0 M78.4 14.4 q3.6 -2.6 7.2 0" fill="none" stroke="#c9962a" stroke-width=".6"/></g>`;
		default:
			return '';
	}
}

const PETALS = `<g data-p="wisp" stroke="#e9b7c4" stroke-width=".2"><path d="M90 40 c1.4 -1.6 3.2 -1 3.2 .5 c-1.3 1.4 -2.6 1 -3.2 -.5 z" fill="#ffe6ec"/><path d="M6 54 c1.2 -1.4 2.8 -1 2.9 .4 c-1.2 1.3 -2.4 1 -2.9 -.4 z" fill="#fff6d8"/><path d="M93 74 c1 -1.2 2.4 -.9 2.5 .4 c-1 1.1 -2 .9 -2.5 -.4 z" fill="#ffe6ec"/></g>`;

/** What floats around her in a pose. No text from anywhere goes in here. */
export function petProps(pose: PetPose, food: number): string {
	return `<svg viewBox="0 0 100 110" preserveAspectRatio="none" aria-hidden="true">${pose === 'sleep' ? '' : PETALS}${around(pose, food)}</svg>`;
}
