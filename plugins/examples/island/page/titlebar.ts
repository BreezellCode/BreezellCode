import { IDLE, IslandActivity, IslandLook } from '../src/logic';
import { icon, IslandRenderer } from './view';

/*
 * The island in Breezell's title bar ("slot": "titlebar.center"). At rest it is the search bar it
 * stands in for: the workspace's name, and a click opens the search. While Breezell is busy it
 * shows what it is doing. When the island flies out of the window this one steps away, and it
 * is back the moment the island lands.
 */

declare function acquireVsCodeApi(): { postMessage(message: unknown): void };
const vscode = acquireVsCodeApi();

interface StateMessage {
	readonly type: 'state';
	readonly activity?: IslandActivity;
	readonly language?: string;
	readonly look?: IslandLook;
	readonly modelIcon?: string;
	readonly reduceMotion?: boolean;
	readonly away?: boolean;
}

const body = document.body;
const capsule = document.getElementById('capsule')!;
const rest = document.getElementById('rest')!;
const title = document.getElementById('title')!;
const live = document.getElementById('live')!;
const bubble = document.getElementById('bubble')!;
rest.prepend(icon('search', 'search-icon'));

let reduceMotion = false;
const prefersLess = window.matchMedia?.('(prefers-reduced-motion: reduce)');
const lessMotion = () => reduceMotion || !!prefersLess?.matches;

const renderer = new IslandRenderer(
	{ capsule, live, bubble },
	width => {
		// Breezell sizes the title bar's item; the plugin's code hears it for the overlay.
		vscode.postMessage({ __breezellTitlebar: { width } });
		vscode.postMessage({ width });
	},
	target => vscode.postMessage({ reveal: target }),
	lessMotion,
);

let state: StateMessage = { type: 'state', activity: IDLE, language: 'en' };

function apply(): void {
	body.dataset.look = state.look ?? 'dark';
	body.classList.toggle('reduce-motion', lessMotion());
	body.classList.toggle('away', state.away === true);
	renderer.update({ activity: state.activity ?? IDLE, language: state.language ?? 'en', modelIcon: state.modelIcon });
}

window.addEventListener('message', ({ data }) => {
	if (!data || typeof data !== 'object') {
		return;
	}
	if (data.type === 'breezell.surface.context') {
		const context = (data.context ?? {}) as { title?: unknown; windowFocused?: unknown; language?: unknown };
		if (typeof context.title === 'string') {
			title.textContent = context.title;
			capsule.setAttribute('aria-label', context.title);
		}
		body.classList.toggle('blurred', context.windowFocused === false);
		if (typeof context.language === 'string' && context.language !== state.language) {
			state = { ...state, language: context.language };
			apply();
		}
	} else if (data.type === 'state') {
		state = data as StateMessage;
		reduceMotion = state.reduceMotion === true;
		apply();
	}
});

const openSearch = () => vscode.postMessage({ __breezellTitlebar: { openSearch: true } });
capsule.addEventListener('click', openSearch);
capsule.addEventListener('keydown', e => {
	if (e.key === 'Enter' || e.key === ' ') {
		e.preventDefault();
		openSearch();
	}
});

vscode.postMessage({ __breezellSurfaceReady: true });
vscode.postMessage({ hello: true });
apply();
