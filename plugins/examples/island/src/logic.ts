import { IslandStrings } from './strings';

/*
 * What the island shows and where it goes, without a DOM or an editor: the plugin's code
 * (src/island.ts) and both pages (page/) share it, and the tests run it as it is.
 */

/** What Breezell is busy with (vscode.breezell.Activity), as the pages receive it. */
export interface IslandActivity {
	readonly agent:
	| { readonly kind: 'idle' }
	| { readonly kind: 'awaitingUser'; readonly conversationId: string; readonly conversations: number }
	| { readonly kind: 'working'; readonly conversationId: string; readonly step: IslandStep; readonly conversations: number; readonly startedAt: number; readonly model?: { readonly provider: string; readonly name: string } }
	| { readonly kind: 'finished'; readonly conversationId: string; readonly elapsedMs: number }
	| { readonly kind: 'failed'; readonly conversationId: string };
	readonly task?:
	| { readonly kind: 'running'; readonly name: string; readonly startedAt: number; readonly others: number }
	| { readonly kind: 'succeeded'; readonly name: string; readonly elapsedMs: number }
	| { readonly kind: 'failed'; readonly name: string; readonly exitCode?: number };
}

export interface IslandStep {
	readonly kind: 'thinking' | 'writing' | 'editing' | 'reading' | 'searching' | 'runningCommand' | 'usingTool' | 'waitingOnSubtasks' | 'condensing' | 'reconnecting';
	readonly file?: string;
}

export type IslandTask = NonNullable<IslandActivity['task']>;

export const IDLE: IslandActivity = Object.freeze({ agent: Object.freeze({ kind: 'idle' as const }) });

/** The capsule's width at rest, and the most a live activity may widen it to. */
export const REST_WIDTH = 220;
export const MAX_WIDTH = 380;
/** Room to the capsule's right for the bubble a task beside the agent splits off: its gap and its width. */
export const BUBBLE_GAP = 6;
export const BUBBLE_SIZE = 26;
export const BUBBLE_ROOM = BUBBLE_GAP + BUBBLE_SIZE;
/** How tall the island is, in the title bar and outside the window alike: it does not grow as it leaves. */
export const ISLAND_HEIGHT = 26;
/** How far below the top of the screen it floats outside the window. */
export const OUTSIDE_TOP = 6;
/** The spring all of it moves on: quick to leave, slow to settle. */
export const SPRING = 'cubic-bezier(0.32, 0.72, 0, 1)';
/** The width's morph, and how long a flight out of the window and back in takes. */
export const MORPH_MS = 520;
export const FLY_OUT_MS = 560;
export const FLY_IN_MS = 480;
/** How long what leaves takes to fade out. */
export const LEAVE_MS = 200;
/** The least time words stay up, so a burst of quick steps reads instead of flickering. */
export const WORDS_DWELL_MS = 450;

export const format = (template: string, value: string | number): string => template.replace('{0}', String(value));

export const formatElapsed = (ms: number): string => {
	const seconds = Math.max(0, Math.floor(ms / 1000));
	return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
};

export const stepText = (step: IslandStep, strings: IslandStrings): string => {
	switch (step.kind) {
		case 'thinking': return strings.thinking;
		case 'writing': return strings.writing;
		case 'editing': return step.file ? format(strings.editing, step.file) : strings.editingFiles;
		case 'reading': return step.file ? format(strings.reading, step.file) : strings.readingFiles;
		case 'searching': return strings.searching;
		case 'runningCommand': return strings.runningCommand;
		case 'usingTool': return strings.usingTool;
		case 'waitingOnSubtasks': return strings.waitingOnSubtasks;
		case 'condensing': return strings.condensing;
		case 'reconnecting': return strings.reconnecting;
		default: return strings.thinking;
	}
};

export const taskLabel = (task: IslandTask, strings: IslandStrings): string =>
	task.kind === 'running' ? format(strings.taskRunning, task.name)
		: task.kind === 'succeeded' ? format(strings.taskSucceeded, task.name)
			: format(strings.taskFailed, task.name);

export type IslandTone = 'accent' | 'ok' | 'warn' | 'error';
export type IslandGlyph = 'sparkle' | 'model' | 'ok' | 'error' | 'spinner';

/** One piece of a live view, left to right. `text` is where the main words go. */
export type IslandPart =
	| { readonly kind: 'glyph'; readonly glyph: IslandGlyph; readonly tone: IslandTone }
	| { readonly kind: 'dot'; readonly tone: IslandTone }
	| { readonly kind: 'text' }
	| { readonly kind: 'dim'; readonly text: string }
	| { readonly kind: 'fill' }
	| { readonly kind: 'wave' }
	| { readonly kind: 'clock'; readonly since: number }
	| { readonly kind: 'chip'; readonly label: string; readonly reveal: 'agent' | 'task'; readonly tone: IslandTone };

export interface IslandView {
	/** Changes when the view has to be built anew; its main words and the running clock do not count. */
	readonly key: string;
	/** The main words, which change in place: the old ones fade out over the new ones. */
	readonly words?: string;
	readonly parts: readonly IslandPart[];
}

const taskGlyph = (task: IslandTask): IslandPart =>
	task.kind === 'running' ? { kind: 'glyph', glyph: 'spinner', tone: 'accent' }
		: task.kind === 'succeeded' ? { kind: 'glyph', glyph: 'ok', tone: 'ok' }
			: { kind: 'glyph', glyph: 'error', tone: 'error' };

/** What the island shows for an activity; undefined at rest (the title shows). */
export function islandView(activity: IslandActivity, strings: IslandStrings): IslandView | undefined {
	const agent = activity.agent;
	switch (agent.kind) {
		case 'awaitingUser':
			return {
				key: `awaiting|${agent.conversationId}`,
				words: agent.conversations > 1 ? format(strings.awaitingMany, agent.conversations) : strings.awaiting,
				parts: [{ kind: 'dot', tone: 'warn' }, { kind: 'text' }, { kind: 'fill' }, { kind: 'chip', label: strings.view, reveal: 'agent', tone: 'warn' }],
			};
		case 'working': {
			const others = agent.conversations > 1 ? `+${agent.conversations - 1}` : '';
			const model = agent.model;
			return {
				// The step is in the words: from one step to the next, the icon, the wave and the clock stay.
				key: `working|${agent.conversationId}|${agent.startedAt}|${others}|${model?.provider}/${model?.name}`,
				words: stepText(agent.step, strings),
				parts: [
					model ? { kind: 'glyph', glyph: 'model', tone: 'accent' } : { kind: 'glyph', glyph: 'sparkle', tone: 'accent' },
					{ kind: 'text' },
					...(others ? [{ kind: 'dim', text: others } as const] : []),
					{ kind: 'fill' }, { kind: 'wave' }, { kind: 'clock', since: agent.startedAt },
				],
			};
		}
		case 'finished': {
			const took = format(strings.took, formatElapsed(agent.elapsedMs));
			return {
				key: `finished|${agent.conversationId}|${took}`,
				words: strings.finished,
				parts: [{ kind: 'glyph', glyph: 'ok', tone: 'ok' }, { kind: 'text' }, { kind: 'dim', text: took }],
			};
		}
		case 'failed':
			return {
				key: `failed|${agent.conversationId}`,
				words: strings.failed,
				parts: [{ kind: 'glyph', glyph: 'error', tone: 'error' }, { kind: 'text' }, { kind: 'fill' }, { kind: 'chip', label: strings.view, reveal: 'agent', tone: 'error' }],
			};
	}
	const task = activity.task;
	if (!task) {
		return undefined;
	}
	switch (task.kind) {
		case 'running': {
			const others = task.others > 0 ? `+${task.others}` : '';
			return {
				key: `task|running|${task.name}|${task.startedAt}|${others}`,
				words: task.name,
				parts: [taskGlyph(task), { kind: 'text' }, ...(others ? [{ kind: 'dim', text: others } as const] : []), { kind: 'fill' }, { kind: 'clock', since: task.startedAt }],
			};
		}
		case 'succeeded': {
			const took = format(strings.took, formatElapsed(task.elapsedMs));
			return {
				key: `task|succeeded|${task.name}|${took}`,
				words: taskLabel(task, strings),
				parts: [taskGlyph(task), { kind: 'text' }, { kind: 'dim', text: took }],
			};
		}
		case 'failed': {
			const code = task.exitCode === undefined ? '' : format(strings.exitCode, task.exitCode);
			return {
				key: `task|failed|${task.name}|${code}`,
				words: taskLabel(task, strings),
				parts: [taskGlyph(task), { kind: 'text' }, ...(code ? [{ kind: 'dim', text: code } as const] : []), { kind: 'fill' }, { kind: 'chip', label: strings.view, reveal: 'task', tone: 'error' }],
			};
		}
	}
}

/** Whether there is anything to show: the agent at work, waiting, done or failed, or a task. At rest there is not, and the title shows. */
export const hasActivity = (activity: IslandActivity): boolean => activity.agent.kind !== 'idle' || !!activity.task;

/** A task running beside a live agent activity shows in a bubble of its own, to the capsule's right. */
export const bubbleTask = (activity: IslandActivity): IslandTask | undefined =>
	activity.agent.kind !== 'idle' ? activity.task : undefined;

/** The capsule's width for what it shows, given the width that content takes. */
export const capsuleWidth = (contentWidth: number | undefined): number =>
	contentWidth === undefined ? REST_WIDTH : Math.min(MAX_WIDTH, Math.max(REST_WIDTH, Math.ceil(contentWidth)));

/** The page's whole width: the capsule and, when a bubble shows, its room. */
export const islandWidth = (capsule: number, bubble: boolean): number => capsule + (bubble ? BUBBLE_ROOM : 0);

export interface Rect {
	readonly x: number;
	readonly y: number;
	readonly width: number;
	readonly height: number;
}

/** Where the island floats outside the window: at the top of the screen, in the middle. */
export const outsideRect = (workArea: Rect, width: number, height = ISLAND_HEIGHT): Rect => ({
	x: Math.round(workArea.x + (workArea.width - width) / 2),
	y: workArea.y + OUTSIDE_TOP,
	width,
	height,
});

/** Above the top of the screen, where it comes from and goes to when there is no title bar to fly from. */
export const aboveScreen = (workArea: Rect, width: number, height = ISLAND_HEIGHT): Rect => ({
	...outsideRect(workArea, width, height),
	y: workArea.y - height - 4,
});

/**
 * The title bar's place when the island can fly from it or to it: a rectangle on the screen the
 * work area is of, or on one beside it; undefined otherwise, as without a title bar. An older
 * Breezell answers for a minimized window on Windows with where the system parks it, far off every
 * screen (-32000, -32000), and an overlay sent there lands in the nearest corner of the screen.
 */
export const flightPlace = (place: Rect | undefined, workArea: Rect): Rect | undefined => {
	if (!place || place.width <= 0 || place.height <= 0) {
		return undefined;
	}
	const near = place.x + place.width > workArea.x - workArea.width && place.x < workArea.x + 2 * workArea.width
		&& place.y + place.height > workArea.y - workArea.height && place.y < workArea.y + 2 * workArea.height;
	return near ? place : undefined;
};

export interface IslandFocus {
	readonly editorFocused: boolean;
	readonly lastUsed: boolean;
	/** This editor window's id (a Breezell without it: the island shows this window only). */
	readonly windowId?: number;
}

/**
 * Where the island belongs: in the title bar while the user is in Breezell and while nothing goes
 * on; outside (at the top of the screen) once they have left it and there is something to show
 * (`live`), for the window they used last. Without an overlay (turned off, not allowed, or a
 * desktop that cannot float one) it stays in.
 */
export const islandPlace = (focus: IslandFocus, canFloat: boolean, live: boolean): 'inside' | 'outside' =>
	canFloat && live && !focus.editorFocused && focus.lastUsed ? 'outside' : 'inside';

/** The theme the island takes in the title bar; outside it is always the dark pill. */
export type IslandLook = 'dark' | 'light' | 'highContrast' | 'highContrastLight';

/** The panel the island opens into outside the window, as wide as iOS's expanded island looks on a desktop. */
export const PANEL_WIDTH = 420;
export const PANEL_MIN_HEIGHT = 96;
export const PANEL_MAX_HEIGHT = 480;
/** Opening the panel and closing it. */
export const EXPAND_MS = 460;
export const COLLAPSE_MS = 380;

/** What a conversation is doing, as Breezell tells it (chat.read). */
export type ConversationState = 'idle' | 'thinking' | 'writing' | 'runningTool' | 'awaitingApproval' | 'working';

/** A conversation as the panel lists it: no messages, only its title and the end of its latest reply. */
export interface ConversationDigest {
	readonly id: string;
	readonly title: string;
	readonly state: ConversationState;
	/** The end of the reply being written, or of the last one. */
	readonly reply?: string;
	readonly updatedAt: number;
	/** When it started working, while it does. */
	readonly since?: number;
}

/** One editor window as the island outside sees it: what each window's instance of the plugin tells the others. */
export interface WindowDigest {
	readonly windowId: number;
	readonly title: string;
	readonly activity: IslandActivity;
	/** Without chat.read: none, and `readsChat` false. */
	readonly conversations: readonly ConversationDigest[];
	readonly readsChat: boolean;
	readonly at: number;
}

/** A window that has said nothing for this long is gone (closed, or its plugin stopped). */
export const DIGEST_STALE_MS = 45_000;
/** Each window says it is there this often. */
export const DIGEST_HEARTBEAT_MS = 15_000;

const AGENT_RANK: Readonly<Record<IslandActivity['agent']['kind'], number>> = { awaitingUser: 4, working: 3, failed: 2, finished: 1, idle: 0 };
const TASK_RANK = { running: 3, failed: 2, succeeded: 1 } as const;

/**
 * What the island outside shows for all the windows at once: the most pressing agent activity
 * (waiting on the user, then working, failed, done), with the conversations of that kind counted
 * across the windows; the task of the window with the most pressing one.
 */
export function combinedActivity(windows: readonly WindowDigest[]): IslandActivity {
	let top: WindowDigest | undefined;
	for (const w of windows) {
		if (!top || AGENT_RANK[w.activity.agent.kind] > AGENT_RANK[top.activity.agent.kind] || (AGENT_RANK[w.activity.agent.kind] === AGENT_RANK[top.activity.agent.kind] && w.at > top.at)) {
			top = w;
		}
	}
	let task: IslandActivity['task'];
	for (const w of windows) {
		if (w.activity.task && (!task || TASK_RANK[w.activity.task.kind] > TASK_RANK[task.kind])) {
			task = w.activity.task;
		}
	}
	const agent = top?.activity.agent ?? IDLE.agent;
	const sameKind = (kind: string) => windows.reduce((n, w) => n + (w.activity.agent.kind === kind && 'conversations' in w.activity.agent ? w.activity.agent.conversations : 0), 0);
	const combined: IslandActivity['agent'] = agent.kind === 'working' || agent.kind === 'awaitingUser' ? { ...agent, conversations: Math.max(1, sameKind(agent.kind)) } : agent;
	return task ? { agent: combined, task } : { agent: combined };
}

/** The end of a reply, for one or two lines: no code, no markup, the last words. */
export function replyExcerpt(text: string | undefined, max = 160): string | undefined {
	if (!text) {
		return undefined;
	}
	const plain = text
		.replace(/```[\s\S]*?(```|$)/g, ' ')
		.replace(/`([^`]*)`/g, '$1')
		.replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
		.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
		.replace(/^\s{0,3}(#{1,6}|>|[-*+]|\d+\.)\s+/gm, '')
		.replace(/[*_~]{1,3}([^*_~]+)[*_~]{1,3}/g, '$1')
		.replace(/<[^>]+>/g, ' ')
		.replace(/\s+/g, ' ')
		.trim();
	if (!plain) {
		return undefined;
	}
	return plain.length <= max ? plain : `…${plain.slice(plain.length - max + 1).replace(/^\S{0,12}\s/, '')}`;
}

/** The conversations the panel lists: those at work first, then the latest finished ones. */
export function conversationsToShow(conversations: readonly ConversationDigest[], now: number, recent = 2, recentMs = 15 * 60_000): ConversationDigest[] {
	const busy = conversations.filter(c => c.state !== 'idle').sort((a, b) => (a.state === 'awaitingApproval' ? 0 : 1) - (b.state === 'awaitingApproval' ? 0 : 1) || b.updatedAt - a.updatedAt);
	const done = conversations.filter(c => c.state === 'idle' && now - c.updatedAt < recentMs).sort((a, b) => b.updatedAt - a.updatedAt).slice(0, recent);
	return [...busy, ...done];
}

/** What a conversation is doing, in words. */
export function conversationStateText(state: ConversationState, strings: IslandStrings): string {
	switch (state) {
		case 'thinking': return strings.thinking;
		case 'writing': return strings.writing;
		case 'runningTool': return strings.usingTool;
		case 'awaitingApproval': return strings.awaiting;
		case 'working': return strings.working;
		default: return strings.finished;
	}
}

/** What the island outside says at rest: the workspace of the window used last, as the title bar's does. */
export const restTitle = (windows: readonly WindowDigest[]): string => windows[0]?.title || 'Breezell';

/** The panel's headline: how many chats wait and run across the windows, or what else goes on; at rest, the workspace. */
export function panelSummary(windows: readonly WindowDigest[], strings: IslandStrings): string {
	const combined = combinedActivity(windows);
	const count = (kind: string) => windows.reduce((n, w) => n + (w.activity.agent.kind === kind && 'conversations' in w.activity.agent ? w.activity.agent.conversations : 0), 0);
	const waiting = count('awaitingUser');
	const running = count('working');
	const parts: string[] = [];
	if (waiting) {
		parts.push(waiting > 1 ? format(strings.awaitingMany, waiting) : strings.awaiting);
	}
	if (running) {
		parts.push(format(strings.running, running));
	}
	if (parts.length) {
		return parts.join(' · ');
	}
	const view = islandView(combined, strings);
	return view?.words ?? restTitle(windows);
}

/** Where the panel opens: at the top of the screen, in the middle, where the island is. */
export const panelRect = (workArea: Rect, height: number): Rect => outsideRect(workArea, PANEL_WIDTH, Math.min(PANEL_MAX_HEIGHT, Math.max(PANEL_MIN_HEIGHT, Math.round(height))));

/** Windows the island still hears from, the one used last first. */
export function liveWindows(windows: Iterable<WindowDigest>, now: number, lastUsed: number | undefined): WindowDigest[] {
	return [...windows].filter(w => now - w.at < DIGEST_STALE_MS).sort((a, b) => (a.windowId === lastUsed ? -1 : b.windowId === lastUsed ? 1 : a.windowId - b.windowId));
}
