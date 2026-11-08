import {
	combinedActivity, ConversationDigest, conversationStateText, formatElapsed, IDLE, IslandActivity, IslandLook, panelSummary, PANEL_MAX_HEIGHT, PANEL_MIN_HEIGHT, taskLabel, WindowDigest, format, stepText,
} from '../src/logic';
import { islandStrings, IslandStrings } from '../src/strings';
import { icon, IslandRenderer, modelMark } from './view';

/*
 * The island outside the window: a small window of its own (`"kind": "overlay"`) that floats
 * above every app at the top of the screen while you are away from Breezell. It flies there from
 * the title bar and back; on the way it changes from the title bar's look to its own dark pill.
 * It shows every Breezell window at once. A click opens it into a panel, as iOS opens its island:
 * the windows, their conversations with the end of each reply, their tasks, and ways back in.
 */

interface Bridge {
	postMessage(message: unknown): Promise<boolean>;
	onMessage(listener: (message: unknown) => void): () => void;
}
const bridge = (window as unknown as { breezell?: Bridge }).breezell;

interface StateMessage {
	readonly type: 'state';
	readonly activity?: IslandActivity;
	readonly windows?: readonly WindowDigest[];
	readonly windowId?: number;
	readonly readsChat?: boolean;
	readonly expanded?: boolean;
	readonly language?: string;
	readonly look?: IslandLook;
	readonly modelIcon?: string;
	readonly reduceMotion?: boolean;
}

const body = document.body;
const capsule = document.getElementById('capsule')!;
const title = document.getElementById('title')!;
const live = document.getElementById('live')!;
const bubble = document.getElementById('bubble')!;
const panel = document.getElementById('panel')!;
const panelContent = document.getElementById('panel-content')!;
const panelGlyph = document.getElementById('panel-glyph')!;
const panelSummaryEl = document.getElementById('panel-summary')!;
const panelBack = document.getElementById('panel-back') as HTMLButtonElement;
const panelBody = document.getElementById('panel-body')!;
const panelHint = document.getElementById('panel-hint')!;

let reduceMotion = false;
const prefersLess = window.matchMedia?.('(prefers-reduced-motion: reduce)');
const lessMotion = () => reduceMotion || !!prefersLess?.matches;
const send = (message: unknown) => void bridge?.postMessage(message);

const renderer = new IslandRenderer({ capsule, live, bubble }, width => send({ width }), target => send({ reveal: target }), lessMotion);

let state: StateMessage = { type: 'state', activity: IDLE, language: 'en' };
let lastPanelHeight = 0;

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

const button = (label: string, className: string, run: () => void): HTMLButtonElement => {
	const b = el('button', className, label) as HTMLButtonElement;
	b.type = 'button';
	b.addEventListener('click', e => {
		e.stopPropagation();
		run();
	});
	return b;
};

const clock = (since: number): HTMLElement => {
	const c = el('span', 'clock', formatElapsed(Date.now() - since));
	c.dataset.since = String(since);
	c.setAttribute('aria-hidden', 'true');
	return c;
};

/** A conversation's mark: what it is doing, in the island's colors. */
function conversationGlyph(c: ConversationDigest): HTMLElement {
	const glyph = el('span', 'glyph');
	if (c.state === 'awaitingApproval') {
		glyph.classList.add('tone-warn');
		glyph.append(el('span', 'dot breathe'));
	} else if (c.state === 'idle') {
		glyph.classList.add('tone-ok');
		glyph.append(icon('ok'));
	} else {
		glyph.classList.add('tone-accent');
		glyph.append(icon('spinner', 'spin'));
	}
	return glyph;
}

function conversationRow(windowId: number, c: ConversationDigest, strings: IslandStrings): HTMLElement {
	const row = el('div', 'row conversation');
	row.setAttribute('role', 'button');
	row.addEventListener('click', e => {
		e.stopPropagation();
		send({ openConversation: { windowId, conversationId: c.id } });
	});
	const line = el('div', 'row-line');
	line.append(conversationGlyph(c), el('span', 'row-title', c.title || strings.untitled));
	const meta = el('span', 'row-meta', conversationStateText(c.state, strings));
	line.append(meta);
	if (c.since && c.state !== 'idle') {
		line.append(clock(c.since));
	}
	row.append(line);
	if (c.reply) {
		row.append(el('div', 'row-reply', c.reply));
	}
	return row;
}

/** A window without chat.read: what its agent does, in a line. */
function activityRow(w: WindowDigest, strings: IslandStrings): HTMLElement | undefined {
	const agent = w.activity.agent;
	if (agent.kind === 'idle') {
		return undefined;
	}
	const row = el('div', 'row conversation');
	row.setAttribute('role', 'button');
	row.addEventListener('click', e => {
		e.stopPropagation();
		send({ goWindow: w.windowId });
	});
	const line = el('div', 'row-line');
	const glyph = el('span', 'glyph');
	const words = agent.kind === 'working' ? stepText(agent.step, strings)
		: agent.kind === 'awaitingUser' ? (agent.conversations > 1 ? format(strings.awaitingMany, agent.conversations) : strings.awaiting)
			: agent.kind === 'finished' ? strings.finished : strings.failed;
	if (agent.kind === 'working') {
		glyph.classList.add('tone-accent');
		glyph.append(icon('spinner', 'spin'));
	} else if (agent.kind === 'awaitingUser') {
		glyph.classList.add('tone-warn');
		glyph.append(el('span', 'dot breathe'));
	} else {
		glyph.classList.add(agent.kind === 'finished' ? 'tone-ok' : 'tone-error');
		glyph.append(icon(agent.kind === 'finished' ? 'ok' : 'error'));
	}
	line.append(glyph, el('span', 'row-title', words));
	if (agent.kind === 'working') {
		line.append(clock(agent.startedAt));
	}
	row.append(line);
	return row;
}

function taskRow(w: WindowDigest, strings: IslandStrings): HTMLElement | undefined {
	const task = w.activity.task;
	if (!task) {
		return undefined;
	}
	const row = el('div', 'row task');
	const line = el('div', 'row-line');
	const glyph = el('span', `glyph tone-${task.kind === 'running' ? 'accent' : task.kind === 'succeeded' ? 'ok' : 'error'}`);
	glyph.append(icon(task.kind === 'running' ? 'spinner' : task.kind === 'succeeded' ? 'ok' : 'error', ...(task.kind === 'running' ? ['spin'] : [])));
	line.append(glyph, el('span', 'row-title', taskLabel(task, strings)));
	if (task.kind === 'running') {
		line.append(clock(task.startedAt));
	}
	line.append(button(strings.view, 'chip', () => send({ revealTask: w.windowId })));
	row.append(line);
	return row;
}

function renderPanel(): void {
	const strings = islandStrings(state.language);
	const windows = state.windows ?? [];
	const activity = combinedActivity(windows);
	panelSummaryEl.textContent = panelSummary(windows, strings);
	panelBack.textContent = strings.backToEditor;
	const mark = activity.agent.kind === 'working' && activity.agent.model ? modelMark(state.modelIcon) : undefined;
	panelGlyph.className = 'glyph';
	if (mark) {
		mark.classList.add('model-mark');
		panelGlyph.replaceChildren(mark);
	} else if (activity.agent.kind === 'idle' && !activity.task) {
		panelGlyph.classList.add('tone-ok');
		panelGlyph.replaceChildren(el('span', 'dot'));
	} else {
		panelGlyph.classList.add('tone-accent');
		panelGlyph.replaceChildren(icon('sparkle'));
	}
	const sections: HTMLElement[] = [];
	for (const w of windows) {
		const rows: HTMLElement[] = [];
		if (w.readsChat) {
			rows.push(...w.conversations.map(c => conversationRow(w.windowId, c, strings)));
		} else {
			const row = activityRow(w, strings);
			if (row) {
				rows.push(row);
			}
		}
		const task = taskRow(w, strings);
		if (task) {
			rows.push(task);
		}
		if (windows.length > 1) {
			const head = el('div', 'window-head');
			head.append(el('span', 'window-name', w.title), button(strings.goTo, 'chip', () => send({ goWindow: w.windowId })));
			sections.push(head);
		}
		sections.push(...rows);
	}
	panelBody.replaceChildren(...sections);
	panelBody.classList.toggle('empty', !sections.length);
	panelHint.textContent = state.readsChat ? '' : strings.readChatHint;
	panelHint.hidden = !!state.readsChat;
	measurePanel();
}

/** The panel's page asks for the height of what it lists, within the overlay's limits. */
function measurePanel(): void {
	const height = Math.min(PANEL_MAX_HEIGHT, Math.max(PANEL_MIN_HEIGHT, Math.ceil(panelContent.scrollHeight)));
	if (height !== lastPanelHeight) {
		lastPanelHeight = height;
		send({ panelHeight: height });
	}
}

function apply(): void {
	const strings = islandStrings(state.language);
	body.dataset.look = state.look ?? 'dark';
	body.classList.toggle('reduce-motion', lessMotion());
	body.classList.toggle('expanded', state.expanded === true);
	panel.setAttribute('aria-hidden', String(state.expanded !== true));
	title.textContent = strings.allQuiet;
	capsule.setAttribute('aria-label', panelSummary(state.windows ?? [], strings));
	renderer.update({ activity: state.activity ?? IDLE, language: state.language ?? 'en', modelIcon: state.modelIcon });
	renderPanel();
}

/**
 * On the way out it starts in the title bar's look and turns into the dark pill; on the way back
 * in, the other way round, so it lands looking like the island it hands over to.
 */
function fly(to: 'inside' | 'outside', durationMs: number): void {
	body.style.setProperty('--fly-ms', `${Math.max(0, Math.round(durationMs * 0.7))}ms`);
	if (to === 'outside') {
		body.classList.add('no-transition');
		body.classList.remove('outside');
		void body.offsetWidth;
		body.classList.remove('no-transition');
		body.classList.add('outside');
	} else {
		body.classList.remove('outside', 'expanded');
	}
}

bridge?.onMessage(raw => {
	const data = raw as { type?: unknown; to?: unknown; durationMs?: unknown } | null;
	if (!data || typeof data !== 'object') {
		return;
	}
	if (data.type === 'state') {
		state = data as StateMessage;
		reduceMotion = state.reduceMotion === true;
		apply();
	} else if (data.type === 'fly' && (data.to === 'inside' || data.to === 'outside')) {
		fly(data.to, typeof data.durationMs === 'number' ? data.durationMs : 0);
	}
});

// Collapsed, a click opens the panel; open, its rows and buttons act, and Escape closes it.
capsule.addEventListener('click', () => {
	if (state.expanded !== true) {
		send({ expand: true });
	}
});
panelBack.addEventListener('click', e => {
	e.stopPropagation();
	send({ back: true });
});
document.addEventListener('keydown', e => {
	if (e.key === 'Escape' && state.expanded === true) {
		send({ collapse: true });
	}
});

// The clocks in the panel tick while it is open.
setInterval(() => {
	if (state.expanded !== true) {
		return;
	}
	for (const c of Array.from(panel.querySelectorAll<HTMLElement>('.clock[data-since]'))) {
		c.textContent = formatElapsed(Date.now() - Number(c.dataset.since));
	}
}, 1000);

send({ hello: true });
apply();
