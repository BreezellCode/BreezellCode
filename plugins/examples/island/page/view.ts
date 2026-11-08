import { BUBBLE_ROOM, bubbleTask, capsuleWidth, IDLE, IslandActivity, IslandGlyph, IslandPart, IslandView, islandView, islandWidth, LEAVE_MS, MORPH_MS, SPRING, taskLabel, WORDS_DWELL_MS, formatElapsed } from '../src/logic';
import { islandStrings } from '../src/strings';

/*
 * The capsule, as both pages draw it: at rest what the page puts there (the title); while
 * Breezell is busy, what it is doing, in place of it. The capsule's width follows what it shows
 * (the page asks for that width: the morph is the width changing); a task beside the agent splits
 * off into a bubble to its right.
 */

export interface IslandState {
	readonly activity: IslandActivity;
	readonly language: string;
	readonly modelIcon?: string;
}

export interface IslandElements {
	readonly capsule: HTMLElement;
	readonly live: HTMLElement;
	readonly bubble: HTMLElement;
}

const SVG_NS = 'http://www.w3.org/2000/svg';

/** Icons drawn in currentColor, at 16 × 16. */
const ICONS: Readonly<Record<Exclude<IslandGlyph, 'model'> | 'search', string>> = {
	search: '<circle cx="7" cy="7" r="4.5" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="m10.5 10.5 3.5 3.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>',
	sparkle: '<path d="M8 1.5c.4 2.9 1.6 4.1 4.5 4.5-2.9.4-4.1 1.6-4.5 4.5-.4-2.9-1.6-4.1-4.5-4.5C6.4 5.6 7.6 4.4 8 1.5Z" fill="currentColor"/><path d="M12.5 10c.2 1.3.7 1.8 2 2-1.3.2-1.8.7-2 2-.2-1.3-.7-1.8-2-2 1.3-.2 1.8-.7 2-2Z" fill="currentColor"/>',
	ok: '<circle cx="8" cy="8" r="6.5" fill="currentColor"/><path d="m5 8.2 2 2 4-4.2" fill="none" stroke="var(--island-surface)" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>',
	error: '<circle cx="8" cy="8" r="6.5" fill="currentColor"/><path d="M8 4.6v4.2" stroke="var(--island-surface)" stroke-width="1.6" stroke-linecap="round"/><circle cx="8" cy="11.2" r="0.95" fill="var(--island-surface)"/>',
	spinner: '<circle cx="8" cy="8" r="5.5" fill="none" stroke="currentColor" stroke-opacity="0.25" stroke-width="1.8"/><path d="M8 2.5a5.5 5.5 0 0 1 5.5 5.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
};

export function icon(name: keyof typeof ICONS, ...classes: string[]): SVGSVGElement {
	const svg = document.createElementNS(SVG_NS, 'svg');
	svg.setAttribute('viewBox', '0 0 16 16');
	svg.setAttribute('aria-hidden', 'true');
	svg.classList.add('icon', ...classes);
	// Markup of our own, written above.
	svg.innerHTML = ICONS[name];
	return svg;
}

/**
 * A model's mark, as Breezell gives it (SVG markup), with nothing in it that could run: no
 * scripts, no event handlers, no links out, no foreign content.
 */
export function modelMark(markup: string | undefined): SVGSVGElement | undefined {
	if (!markup) {
		return undefined;
	}
	const parsed = new DOMParser().parseFromString(markup, 'image/svg+xml');
	const svg = parsed.documentElement;
	if (!svg || svg.nodeName.toLowerCase() !== 'svg' || parsed.getElementsByTagName('parsererror').length) {
		return undefined;
	}
	for (const element of Array.from(svg.querySelectorAll('script, foreignObject, iframe, a, use[href^="http"], image'))) {
		element.remove();
	}
	for (const element of [svg, ...Array.from(svg.querySelectorAll('*'))]) {
		for (const attribute of Array.from(element.attributes)) {
			const name = attribute.name.toLowerCase();
			if (name.startsWith('on') || ((name === 'href' || name === 'xlink:href') && !attribute.value.startsWith('#'))) {
				element.removeAttribute(attribute.name);
			}
		}
	}
	const imported = document.importNode(svg, true) as unknown as SVGSVGElement;
	imported.removeAttribute('width');
	imported.removeAttribute('height');
	imported.setAttribute('aria-hidden', 'true');
	return imported;
}

interface Shown {
	readonly key: string;
	readonly language: string;
	readonly content: HTMLElement;
	readonly text: HTMLElement;
	words: string | undefined;
	wordsElement: HTMLElement;
	wordsAt: number;
	readonly stop: () => void;
}

const el = (tag: string, className?: string, text?: string): HTMLElement => {
	const element = document.createElement(tag);
	if (className) {
		element.className = className;
	}
	if (text !== undefined) {
		element.textContent = text;
	}
	return element;
};

export class IslandRenderer {

	private _state: IslandState = { activity: IDLE, language: 'en' };
	private _shown: Shown | undefined;
	private _pendingWords: ReturnType<typeof setTimeout> | undefined;
	private _bubbleKey: string | undefined;
	private _width = 0;

	constructor(
		private readonly _elements: IslandElements,
		/** The width the page needs now: the capsule and the bubble's room. */
		private readonly _onWidth: (width: number) => void,
		/** A chip or the bubble was clicked: Breezell shows what it is about. */
		private readonly _onReveal: (target: 'agent' | 'task') => void,
		private readonly _reduceMotion: () => boolean,
	) {
		const { bubble, live } = _elements;
		bubble.setAttribute('role', 'button');
		bubble.setAttribute('aria-hidden', 'true');
		bubble.addEventListener('click', e => {
			e.stopPropagation();
			this._onReveal('task');
		});
		live.setAttribute('aria-live', 'polite');
	}

	get width(): number {
		return this._width;
	}

	update(state: IslandState): void {
		this._state = state;
		this.render();
	}

	render(): void {
		const strings = islandStrings(this._state.language);
		this._renderBubble();
		const view = islandView(this._state.activity, strings);
		const shown = this._shown;
		if (view && shown && view.key === shown.key && this._state.language === shown.language) {
			this._setWords(shown, view.words);
			this._fit();
			return;
		}
		if (!view && !shown) {
			this._fit();
			return;
		}
		this._clearPending();
		this._leave();
		this._elements.capsule.classList.toggle('live-active', !!view);
		if (!view) {
			this._fit();
			return;
		}
		const { content, text, wordsElement, stop } = this._build(view);
		this._elements.live.append(content);
		this._shown = { key: view.key, language: this._state.language, content, text, words: view.words, wordsElement, wordsAt: Date.now(), stop };
		this._fit();
	}

	private _build(view: IslandView) {
		const content = el('div', 'live-content');
		const wordsElement = el('span', 'words', view.words ?? '');
		const text = el('span', 'text');
		text.append(wordsElement);
		const timers: ReturnType<typeof setInterval>[] = [];
		for (const part of view.parts) {
			content.append(this._part(part, text, timers));
		}
		return { content, text, wordsElement, stop: () => timers.forEach(clearInterval) };
	}

	private _part(part: IslandPart, text: HTMLElement, timers: ReturnType<typeof setInterval>[]): Node {
		switch (part.kind) {
			case 'text':
				return text;
			case 'glyph': {
				const glyph = el('span', `glyph tone-${part.tone}`);
				const mark = part.glyph === 'model' ? modelMark(this._state.modelIcon) : undefined;
				if (mark) {
					mark.classList.add('model-mark');
					glyph.append(mark);
				} else {
					glyph.append(icon(part.glyph === 'model' ? 'sparkle' : part.glyph, ...(part.glyph === 'spinner' ? ['spin'] : [])));
				}
				return glyph;
			}
			case 'dot':
				return el('span', `dot breathe tone-${part.tone}`);
			case 'dim':
				return el('span', 'dim', part.text);
			case 'fill':
				return el('span', 'fill');
			case 'wave': {
				const wave = el('span', 'wave tone-accent');
				wave.setAttribute('aria-hidden', 'true');
				for (let i = 0; i < 5; i++) {
					wave.append(el('span'));
				}
				return wave;
			}
			case 'clock': {
				// The live region would read the clock out every second.
				const clock = el('span', 'clock');
				clock.setAttribute('aria-hidden', 'true');
				const tick = () => { clock.textContent = formatElapsed(Date.now() - part.since); };
				tick();
				timers.push(setInterval(tick, 1000));
				return clock;
			}
			case 'chip': {
				const chip = el('span', `chip tone-${part.tone}`, part.label);
				chip.setAttribute('role', 'button');
				chip.addEventListener('click', e => {
					e.stopPropagation();
					this._onReveal(part.reveal);
				});
				return chip;
			}
		}
	}

	private _clearPending(): void {
		if (this._pendingWords) {
			clearTimeout(this._pendingWords);
			this._pendingWords = undefined;
		}
	}

	/** What the live layer shows fades out, under what comes next. */
	private _leave(): void {
		const shown = this._shown;
		if (!shown) {
			return;
		}
		this._shown = undefined;
		shown.stop();
		this._fadeOut(shown.content);
	}

	private _fadeOut(element: HTMLElement): void {
		element.classList.add('leaving');
		element.setAttribute('aria-hidden', 'true');
		setTimeout(() => element.remove(), this._reduceMotion() ? 0 : LEAVE_MS);
	}

	/** Asks for the width of what shows: the capsule's, and the bubble's room. */
	private _fit(): void {
		const shown = this._shown;
		let capsule = capsuleWidth(undefined);
		if (shown) {
			const border = this._elements.capsule.offsetWidth - this._elements.capsule.clientWidth;
			shown.content.style.maxWidth = `${capsuleWidth(Infinity) - border}px`;
			capsule = capsuleWidth(shown.content.offsetWidth + border);
		}
		const width = islandWidth(capsule, this._elements.bubble.classList.contains('bubble-shown'));
		if (width !== this._width) {
			this._width = width;
			this._onWidth(width);
		}
	}

	/** Changes the shown view's main words in place, once the current ones have been up for a moment. */
	private _setWords(shown: Shown, words: string | undefined): void {
		if (words === undefined || words === shown.words) {
			this._clearPending();
			return;
		}
		const wait = shown.wordsAt + WORDS_DWELL_MS - Date.now();
		if (wait > 0) {
			// Whatever the words are by then show: the steps in between are skipped.
			this._clearPending();
			this._pendingWords = setTimeout(() => {
				this._pendingWords = undefined;
				this.render();
			}, wait);
			return;
		}
		this._clearPending();
		this._swapWords(shown, words);
	}

	/** The old words fade out over the new ones, while the room they take morphs along with the capsule. */
	private _swapWords(shown: Shown, words: string): void {
		const text = shown.text;
		const from = text.getBoundingClientRect().width;
		for (const animation of text.getAnimations?.() ?? []) {
			animation.cancel();
		}
		text.classList.remove('clip');
		this._fadeOut(shown.wordsElement);
		const entering = el('span', 'words entering', words);
		text.append(entering);
		shown.words = words;
		shown.wordsElement = entering;
		shown.wordsAt = Date.now();
		const to = text.getBoundingClientRect().width;
		if (from !== to && !this._reduceMotion() && typeof text.animate === 'function') {
			// Clipped while the room changes: an ellipsis would crawl along the words.
			text.classList.add('clip');
			const morph = text.animate([{ width: `${from}px` }, { width: `${to}px` }], { duration: MORPH_MS, easing: SPRING });
			morph.onfinish = () => text.classList.remove('clip');
		}
	}

	/** A task beside a live agent activity: shown in the bubble the capsule splits off. */
	private _renderBubble(): void {
		const bubble = this._elements.bubble;
		const task = bubbleTask(this._state.activity);
		bubble.classList.toggle('bubble-shown', !!task);
		bubble.setAttribute('aria-hidden', String(!task));
		if (!task) {
			// The last content stays for the bubble's exit transition.
			this._bubbleKey = undefined;
			return;
		}
		const label = taskLabel(task, islandStrings(this._state.language));
		const key = `${task.kind}|${task.name}|${label}`;
		if (key === this._bubbleKey) {
			return;
		}
		this._bubbleKey = key;
		const glyph = el('span', `glyph tone-${task.kind === 'running' ? 'accent' : task.kind === 'succeeded' ? 'ok' : 'error'}`);
		glyph.append(icon(task.kind === 'running' ? 'spinner' : task.kind === 'succeeded' ? 'ok' : 'error', ...(task.kind === 'running' ? ['spin'] : [])));
		bubble.replaceChildren(glyph);
		bubble.setAttribute('aria-label', label);
		bubble.title = label;
	}
}

/** The bubble's room, for pages that lay it out. */
export const BUBBLE_ROOM_PX = `${BUBBLE_ROOM}px`;
