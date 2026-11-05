import type * as vscode from 'vscode';
import {
	activeMinutes, checkRequest, freshTokens, Goal, GoalLimits, GoalReport, GOAL_LIMITS, lastMessageIndex, LimitKind, limitReached, limitsToResume, parseVerdict, PauseReason,
	readStoredGoals, shortCount, storedGoals, tokensUsed, usedToolsSince, Verdict, WorkMessage, workRecord,
} from './logic';
import { fill, goalStrings, GoalStrings } from './strings';

/*
 * Keeps goals going. Each ended turn of a conversation with a goal is looked at: is a command still to end,
 * has the work met the goal, is a limit reached; if nothing says stop, the next message goes out. It decides
 * nothing for the user: tool approvals stay theirs, Stop holds, and nothing starts by itself after a restart.
 */

type Api = typeof vscode.breezell;

export interface GoalView {
	readonly id: string;
	readonly status: Goal['status'];
	readonly statusText: string;
	readonly condition: string;
	readonly note: string;
	readonly progress: string;
	readonly fractions: readonly number[];
	readonly actions: readonly { readonly id: 'pause' | 'resume' | 'clear' | 'dismiss'; readonly label: string }[];
}

export interface GoalEngineDeps {
	readonly api: Api;
	readonly load: () => unknown;
	readonly save: (goals: unknown[]) => void;
	readonly cancellation: () => vscode.CancellationTokenSource;
	readonly defaults: () => GoalLimits;
	readonly tell: (text: string, warn?: boolean) => void;
	readonly now?: () => number;
}

/** What a goal cannot go without. `chat.intercept` and `agent.tools` are extras it does well without. */
export const REQUIRED_PERMISSIONS = ['chat.events', 'chat.read', 'chat.send', 'models.request'] as const;

/** The errors that mean it may not go on, whatever it tries. */
const REFUSALS: ReadonlySet<string> = new Set(['BreezellNotSignedIn', 'BreezellPermissionDenied', 'BreezellBlocked']);

type ToolAnswer = string | { text: string; isError: boolean };

const errorName = (error: unknown): string => (error as { name?: string })?.name ?? '';
const workOf = (conversation: vscode.breezell.Conversation) => conversation.messages as readonly WorkMessage[];
/** Where what comes next in the conversation will be. */
const nextIndexOf = (conversation: vscode.breezell.Conversation): number => lastMessageIndex(workOf(conversation)) + 1;

/** One timer per conversation: setting another replaces it. */
class Timers {
	private readonly _timers = new Map<string, ReturnType<typeof setTimeout>>();

	get size(): number {
		return this._timers.size;
	}

	set(conversationId: string, run: () => void, afterMs: number): void {
		this.clear(conversationId);
		this._timers.set(conversationId, setTimeout(() => {
			this._timers.delete(conversationId);
			run();
		}, afterMs));
	}

	clear(conversationId: string): void {
		clearTimeout(this._timers.get(conversationId));
		this._timers.delete(conversationId);
	}
}

export class GoalEngine {
	private readonly _goals = new Map<string, Goal>();
	private readonly _queues = new Map<string, Promise<void>>();
	private readonly _checks = new Map<string, vscode.CancellationTokenSource>();
	private readonly _retryTimers = new Timers();
	private readonly _retryAttempts = new Map<string, number>();
	private readonly _firstTurn = new Timers();
	private readonly _waiting = new Timers();
	private readonly _listeners = new Set<(conversationId: string) => void>();
	private _nextId = 1;

	/** How long things wait. */
	readonly timing = { retryMs: 5000, rateLimitMs: 60_000, retries: 6, firstTurnMs: 20_000, waitCheckMs: 15_000 };

	constructor(private readonly _deps: GoalEngineDeps) {
		for (const goal of readStoredGoals(_deps.load(), this._now())) {
			this._goals.set(goal.conversationId, goal);
		}
		this._save();
	}

	private _now(): number {
		return this._deps.now?.() ?? Date.now();
	}

	private get _t(): GoalStrings {
		return goalStrings(this._deps.api.language);
	}

	onDidChange(listener: (conversationId: string) => void): { dispose(): void } {
		this._listeners.add(listener);
		return { dispose: () => this._listeners.delete(listener) };
	}

	private _changed(goal: Goal): void {
		this._save();
		for (const listener of [...this._listeners]) {
			listener(goal.conversationId);
		}
	}

	/** It has not been replaced or cleared since. */
	private _isCurrent(goal: Goal): boolean {
		return this._goals.get(goal.conversationId) === goal;
	}

	private _isRunning(goal: Goal): boolean {
		return this._isCurrent(goal) && goal.status === 'active';
	}

	private _save(): void {
		this._deps.save(storedGoals(this._goals.values(), this._now()));
	}

	get(conversationId: string): Goal | undefined {
		return this._goals.get(conversationId);
	}

	get activeGoals(): Goal[] {
		return [...this._goals.values()].filter(goal => goal.status === 'active');
	}

	// --- what is shown -----------------------------------------------------------------------------

	viewOf(conversationId: string): GoalView | undefined {
		const goal = this._goals.get(conversationId);
		if (!goal) {
			return undefined;
		}
		const t = this._t;
		const now = this._now();
		const tokens = tokensUsed(goal);
		const minutes = activeMinutes(goal, now);
		const parts = [
			fill(t.round, { n: goal.rounds, max: goal.limits.rounds }),
			goal.limits.tokens ? fill(t.tokensOf, { n: shortCount(tokens), max: shortCount(goal.limits.tokens) }) : fill(t.tokens, { n: shortCount(tokens) }),
			goal.limits.minutes ? fill(t.minutesOf, { n: Math.floor(minutes), max: goal.limits.minutes }) : fill(t.minutes, { n: Math.floor(minutes) }),
			...(goal.uncountedReplies > 0 ? [t.uncounted] : []),
		];
		const fractions = [
			goal.rounds / goal.limits.rounds,
			...(goal.limits.tokens ? [tokens / goal.limits.tokens] : []),
			...(goal.limits.minutes ? [minutes / goal.limits.minutes] : []),
		].map(value => Math.min(1, value));
		return {
			id: goal.id,
			status: goal.status,
			statusText: this._statusText(goal, t),
			condition: goal.condition,
			note: goal.note ?? '',
			progress: parts.join(' · '),
			fractions,
			actions: this._actions(goal, t),
		};
	}

	private _actions(goal: Goal, t: GoalStrings): GoalView['actions'] {
		const clear = { id: 'clear', label: t.clear } as const;
		switch (goal.status) {
			case 'active': return [{ id: 'pause', label: t.pause }, clear];
			case 'complete': return [{ id: 'dismiss', label: t.dismiss }];
			default: return [{ id: 'resume', label: t.resume }, clear];
		}
	}

	private _statusText(goal: Goal, t: GoalStrings): string {
		switch (goal.status) {
			case 'active':
				return this._checks.has(goal.conversationId) ? t.checking : goal.waitingFor > 0 ? fill(t.waiting, { n: goal.waitingFor }) : t.working;
			case 'paused': return t.paused;
			case 'complete': return t.complete;
			case 'blocked': return t.blocked;
			case 'limit': return t.limit;
		}
	}

	/** How it stands, in a line. */
	statusLine(conversationId: string): string {
		const view = this.viewOf(conversationId);
		if (!view) {
			return this._t.noGoal;
		}
		return `${this._t.title} (${view.statusText}): ${view.condition}\n${view.progress}${view.note ? `\n${view.note}` : ''}`;
	}

	// --- setting one -------------------------------------------------------------------------------

	/** Which permissions it would have to ask for. Asks no one, so it is quick. */
	async missingPermissions(): Promise<string[]> {
		const states = await Promise.all(REQUIRED_PERMISSIONS.map(permission => this._deps.api.permissionState(permission)));
		return REQUIRED_PERMISSIONS.filter((_, index) => states[index] !== 'granted');
	}

	/** Asks the user for what it needs, one dialog at a time. */
	async askPermissions(): Promise<boolean> {
		for (const permission of REQUIRED_PERMISSIONS) {
			if (!await this._deps.api.requestPermission(permission)) {
				return false;
			}
		}
		return true;
	}

	private _create(conversationId: string, condition: string, asked: Partial<GoalLimits>): Goal {
		const old = this._goals.get(conversationId);
		if (old) {
			this._stopWork(old);
		}
		const now = this._now();
		const goal: Goal = {
			id: `g${now.toString(36)}${(this._nextId++).toString(36)}`,
			conversationId,
			condition,
			status: 'active',
			limits: { ...this._deps.defaults(), ...asked },
			rounds: 0,
			idleTurns: 0,
			checksFailed: 0,
			startedAt: now,
			activeMs: 0,
			resumedAt: now,
			checkTokens: 0,
			uncountedReplies: 0,
			startIndex: 0,
			checkedIndex: 0,
			waitingFor: 0,
		};
		this._goals.set(conversationId, goal);
		return goal;
	}

	private _firstMessage(goal: Goal): string {
		return fill(this._t.firstMessage, { condition: goal.condition });
	}

	/**
	 * Where it starts counting from, and the hold on the notice that a turn ended. Gives the
	 * conversation as it found it; nothing if the goal has been replaced meanwhile.
	 */
	private async _prepare(goal: Goal): Promise<vscode.breezell.Conversation | undefined> {
		const { chat } = this._deps.api;
		const conversation = await chat.getConversation(goal.conversationId);
		if (!this._isCurrent(goal)) {
			return undefined;
		}
		goal.baseline = goal.used = conversation.usage;
		goal.startIndex = goal.checkedIndex = nextIndexOf(conversation);
		await chat.holdDoneNotice(goal.conversationId);
		this._changed(goal);
		return conversation;
	}

	/**
	 * The user's own message becomes the goal's first (`/goal ...` in the chat box). This has to answer
	 * quickly, so the rest happens beside it, and a first turn that never comes pauses the goal.
	 */
	beginFromMessage(conversationId: string, condition: string, asked: Partial<GoalLimits>): string {
		const goal = this._create(conversationId, condition, asked);
		this._watchFirstTurn(goal);
		this._prepare(goal).catch(error => this._failed(goal, error));
		this._changed(goal);
		return this._firstMessage(goal);
	}

	/** A goal set from a button or after being asked for permissions: this sends the first message itself. */
	async start(conversationId: string, condition: string, asked: Partial<GoalLimits>): Promise<void> {
		if (!await this.askPermissions()) {
			this._deps.tell(this._t.needsPermission, true);
			return;
		}
		const goal = this._create(conversationId, condition, asked);
		this._changed(goal);
		let conversation: vscode.breezell.Conversation | undefined;
		try {
			conversation = await this._prepare(goal);
		} catch (error) {
			this._failed(goal, error);
			return;
		}
		if (!conversation) {
			return;
		}
		if (conversation.activity !== 'idle') {
			goal.pendingStart = true;
			this._changed(goal);
			this._deps.tell(this._t.startsLater);
			return;
		}
		await this._send(goal, this._firstMessage(goal), false);
	}

	private _watchFirstTurn(goal: Goal): void {
		this._firstTurn.set(goal.conversationId, () => {
			if (this._isRunning(goal)) {
				this._pause(goal, 'notSent');
			}
		}, this.timing.firstTurnMs);
	}

	// --- what the user says ------------------------------------------------------------------------

	pause(conversationId: string): boolean {
		const goal = this._goals.get(conversationId);
		if (!goal || goal.status !== 'active') {
			return false;
		}
		this._pause(goal, 'user');
		return true;
	}

	clear(conversationId: string): boolean {
		const goal = this._goals.get(conversationId);
		if (!goal) {
			return false;
		}
		this._stopWork(goal);
		this._goals.delete(conversationId);
		if (goal.status === 'active') {
			this._releaseNotice(goal, false);
		}
		this._changed(goal);
		return true;
	}

	/** The user asks it to go on: this is theirs to send, so it goes as their message, and a Stop no longer holds. */
	async resume(conversationId: string, asked: Partial<GoalLimits> = {}): Promise<'resumed' | 'none' | 'running' | 'refused' | { blockedBy: LimitKind }> {
		const goal = this._goals.get(conversationId);
		if (!goal) {
			return 'none';
		}
		if (goal.status === 'active') {
			if (Object.keys(asked).length) {
				goal.limits = { ...goal.limits, ...asked };
				this._changed(goal);
			}
			return 'running';
		}
		const resumed = limitsToResume(goal, asked, this._now());
		if ('blockedBy' in resumed) {
			return resumed;
		}
		if (!await this.askPermissions()) {
			this._deps.tell(this._t.needsPermission, true);
			return 'refused';
		}
		goal.limits = resumed.limits;
		goal.status = 'active';
		goal.pause = goal.limit = goal.note = undefined;
		goal.idleTurns = goal.checksFailed = 0;
		goal.resumedAt = this._now();
		this._changed(goal);
		try {
			await this._deps.api.chat.holdDoneNotice(conversationId);
			const conversation = await this._deps.api.chat.getConversation(conversationId);
			this._account(goal, conversation);
			goal.checkedIndex = nextIndexOf(conversation);
			if (conversation.activity !== 'idle') {
				return 'resumed';
			}
		} catch (error) {
			this._failed(goal, error);
			return 'refused';
		}
		await this._send(goal, goal.pendingStart ? this._firstMessage(goal) : fill(this._t.resumeMessage, { condition: this._inMessage(goal) }), false);
		return 'resumed';
	}

	// --- what the agent reports --------------------------------------------------------------------

	/** The goal a call of the agent is about: a tool is not told which conversation called it. */
	private async _goalOfCall(goalId: unknown): Promise<Goal | string> {
		const active = this.activeGoals;
		if (typeof goalId === 'string' && goalId) {
			return active.find(goal => goal.id === goalId) ?? `No running goal has the id ${goalId}.`;
		}
		if (active.length === 1) {
			return active[0];
		}
		if (!active.length) {
			return 'No goal is running.';
		}
		const conversations = await this._deps.api.chat.listConversations();
		const atWork = active.filter(goal => conversations.some(conversation => conversation.id === goal.conversationId && conversation.activity !== 'idle'));
		if (atWork.length === 1) {
			return atWork[0];
		}
		return `Several goals are running. Call again with the goal_id of this conversation's goal:\n${active.map(goal => `${goal.id}: ${goal.condition.slice(0, 200)}`).join('\n')}`;
	}

	private async _forGoalOfCall(goalId: unknown, answer: (goal: Goal) => ToolAnswer): Promise<ToolAnswer> {
		const goal = await this._goalOfCall(goalId);
		return typeof goal === 'string' ? { text: goal, isError: true } : answer(goal);
	}

	toolGet(input: { readonly goal_id?: unknown }): Promise<ToolAnswer> {
		return this._forGoalOfCall(input.goal_id, goal => JSON.stringify({ goal_id: goal.id, goal: goal.condition, status: goal.status, progress: this.viewOf(goal.conversationId)!.progress, last_check: goal.note ?? '' }));
	}

	toolUpdate(input: { readonly status?: unknown; readonly evidence?: unknown; readonly goal_id?: unknown }): Promise<ToolAnswer> {
		return this._forGoalOfCall(input.goal_id, goal => {
			const { status, evidence } = input;
			if ((status !== 'complete' && status !== 'blocked') || typeof evidence !== 'string' || !evidence.trim()) {
				return { text: 'status must be complete or blocked, with evidence.', isError: true };
			}
			goal.report = { status, evidence: evidence.trim().slice(0, GOAL_LIMITS.evidenceChars) };
			return status === 'complete'
				? 'Recorded. It is checked against the work when this turn ends: end your turn now.'
				: 'Recorded. The user will be told: end your turn now.';
		});
	}

	// --- what happens in the chat ------------------------------------------------------------------

	turnStarted(turnId: string): void {
		if (!this._firstTurn.size && !this.activeGoals.length) {
			return;
		}
		void this._deps.api.chat.conversationOfTurn(turnId).then(conversationId => {
			if (conversationId) {
				this._firstTurn.clear(conversationId);
				const goal = this._goals.get(conversationId);
				if (goal?.status === 'active') {
					this._waiting.clear(conversationId);
					goal.waitingFor = 0;
					this._changed(goal);
				}
			}
		}, () => { /* it hears at the end of the turn, or the call there says why not */ });
	}

	turnFinished(turn: { readonly turnId: string; readonly outcome: 'completed' | 'error' | 'stopped' }): Promise<void> {
		if (!this.activeGoals.length) {
			return Promise.resolve();
		}
		return Promise.resolve(this._deps.api.chat.conversationOfTurn(turn.turnId)).then(conversationId => {
			if (conversationId && this._goals.has(conversationId)) {
				return this._inTurn(conversationId, () => this._afterTurn(conversationId, turn.outcome));
			}
			return undefined;
		}, error => {
			for (const goal of this.activeGoals) {
				this._failed(goal, error);
			}
		});
	}

	/** One at a time per conversation, in the order they came. */
	private _inTurn(conversationId: string, work: () => Promise<void>): Promise<void> {
		const next = (this._queues.get(conversationId) ?? Promise.resolve())
			.then(work)
			.catch(error => {
				const goal = this._goals.get(conversationId);
				if (goal) {
					this._failed(goal, error);
				}
			});
		this._queues.set(conversationId, next);
		return next;
	}

	/**
	 * A turn ended with a command still to end, and the command's end starts the next one. Should none come
	 * (the user pressed Stop meanwhile, or the command ended unnoticed), or a limit run out while it waits,
	 * it must not wait for ever.
	 */
	private _watchWaiting(goal: Goal, sawItEnd = false): void {
		const stillWaiting = () => this._isRunning(goal) && goal.waitingFor > 0;
		this._waiting.set(goal.conversationId, () => void this._inTurn(goal.conversationId, async () => {
			if (!stillWaiting()) {
				return;
			}
			const conversation = (await this._deps.api.chat.listConversations()).find(c => c.id === goal.conversationId);
			if (!conversation || !stillWaiting() || conversation.activity !== 'idle' || this._endIfAtLimit(goal)) {
				return;
			}
			const waitingFor = conversation.backgroundCommands?.willEnd ?? 0;
			if (waitingFor > 0) {
				goal.waitingFor = waitingFor;
				this._changed(goal);
				this._watchWaiting(goal);
			} else if (!sawItEnd) {
				// The turn its end starts may be about to begin.
				this._watchWaiting(goal, true);
			} else {
				await this._afterTurn(goal.conversationId, 'completed');
			}
		}), this.timing.waitCheckMs);
	}

	private _endIfAtLimit(goal: Goal): boolean {
		const limit = limitReached(goal, this._now());
		if (limit) {
			goal.limit = limit;
			this._end(goal, 'limit', this._t.limitHit[limit]);
		}
		return !!limit;
	}

	private async _afterTurn(conversationId: string, outcome: 'completed' | 'error' | 'stopped'): Promise<void> {
		const goal = this._goals.get(conversationId);
		if (!goal || goal.status !== 'active') {
			return;
		}
		this._firstTurn.clear(conversationId);
		this._retryTimers.clear(conversationId);
		this._waiting.clear(conversationId);
		if (outcome !== 'completed') {
			this._pause(goal, outcome === 'stopped' ? 'stop' : 'error');
			return;
		}
		const conversation = await this._deps.api.chat.getConversation(conversationId);
		if (!this._isRunning(goal)) {
			return;
		}
		this._account(goal, conversation);
		goal.waitingFor = 0;
		// A turn has begun since, or waits on the user: its end is what to look at.
		if (conversation.activity !== 'idle') {
			this._changed(goal);
			return;
		}
		if (goal.pendingStart) {
			await this._send(goal, this._firstMessage(goal), false);
			return;
		}
		const waitingFor = conversation.backgroundCommands?.willEnd ?? 0;
		// Its end starts a turn by itself. The work is not done, so there is nothing to look at or send yet.
		if (waitingFor > 0) {
			goal.waitingFor = waitingFor;
			this._changed(goal);
			this._watchWaiting(goal);
			return;
		}
		const report = goal.report;
		goal.report = undefined;
		const messages = workOf(conversation);
		goal.idleTurns = usedToolsSince(messages, goal.checkedIndex) ? 0 : goal.idleTurns + 1;
		const seenUpTo = nextIndexOf(conversation);
		if (report?.status === 'blocked') {
			goal.checkedIndex = seenUpTo;
			this._end(goal, 'blocked', report.evidence.slice(0, GOAL_LIMITS.noteChars));
			return;
		}
		const verdict = await this._check(goal, messages, report);
		if (!this._isRunning(goal)) {
			return;
		}
		goal.checkedIndex = seenUpTo;
		if (verdict?.status === 'met') {
			this._end(goal, 'complete', verdict.reason);
			return;
		}
		if (verdict?.status === 'impossible' || verdict?.status === 'needs_user') {
			this._end(goal, 'blocked', verdict.reason);
			return;
		}
		if (verdict) {
			goal.checksFailed = 0;
			goal.note = verdict.reason;
		} else if (++goal.checksFailed >= GOAL_LIMITS.checksFailed) {
			this._end(goal, 'blocked', this._t.cantCheck);
			return;
		}
		if (this._endIfAtLimit(goal)) {
			return;
		}
		if (goal.idleTurns >= GOAL_LIMITS.idleTurns) {
			this._end(goal, 'blocked', this._t.noProgress);
			return;
		}
		await this._send(goal, this._nextMessage(goal, verdict), true);
	}

	private _account(goal: Goal, conversation: vscode.breezell.Conversation): void {
		if (conversation.usage) {
			goal.used = conversation.usage;
			goal.uncountedReplies = conversation.usage.repliesWithoutUsage;
		}
	}

	private _inMessage(goal: Goal): string {
		const { condition } = goal;
		return condition.length > GOAL_LIMITS.conditionInMessageChars ? `${condition.slice(0, GOAL_LIMITS.conditionInMessageChars)}...` : condition;
	}

	private _nextMessage(goal: Goal, verdict: Verdict | undefined): string {
		const t = this._t;
		const progress = fill(t.round, { n: goal.rounds + 1, max: goal.limits.rounds });
		const condition = this._inMessage(goal);
		return verdict?.reason
			? fill(t.continueMessage, { reason: verdict.reason, next: verdict.next || t.continueNoReason.split('\n')[0], condition, progress })
			: fill(t.continueNoReason, { condition, progress });
	}

	/** Has the work met it? Undefined when no answer could be had: nothing can be concluded from that. */
	private async _check(goal: Goal, messages: readonly WorkMessage[], report: GoalReport | undefined): Promise<Verdict | undefined> {
		const { system, content } = checkRequest(goal.condition, workRecord(messages, goal.startIndex), report, this._deps.api.language);
		const cancellation = this._deps.cancellation();
		this._checks.set(goal.conversationId, cancellation);
		this._changed(goal);
		try {
			const answer = await this._deps.api.models.request({ system, messages: [{ role: 'user', content }] }, cancellation.token);
			if (answer.usage) {
				goal.checkTokens += freshTokens(answer.usage);
			}
			return parseVerdict(answer.text);
		} catch (error) {
			if (REFUSALS.has(errorName(error))) {
				this._failed(goal, error);
			}
			return undefined;
		} finally {
			if (this._checks.get(goal.conversationId) === cancellation) {
				this._checks.delete(goal.conversationId);
			}
			cancellation.dispose();
			if (this._isCurrent(goal)) {
				this._changed(goal);
			}
		}
	}

	private async _send(goal: Goal, text: string, automated: boolean): Promise<void> {
		try {
			await this._deps.api.chat.send(text, { conversationId: goal.conversationId, automated });
		} catch (error) {
			if (!this._isRunning(goal)) {
				return;
			}
			switch (errorName(error)) {
				case 'BreezellStoppedByUser':
					this._pause(goal, 'stop');
					return;
				case 'BreezellRateLimited':
					this._retry(goal, text, automated, this.timing.rateLimitMs);
					return;
				case 'BreezellInvalidRequest':
					// Busy, or a message of the user's goes first. The end of that turn brings it back here.
					this._retry(goal, text, automated, this.timing.retryMs);
					return;
				default:
					this._failed(goal, error);
					return;
			}
		}
		if (!this._isCurrent(goal)) {
			return;
		}
		goal.pendingStart = undefined;
		if (automated) {
			goal.rounds++;
		}
		this._retryAttempts.delete(goal.conversationId);
		this._changed(goal);
	}

	private _retry(goal: Goal, text: string, automated: boolean, afterMs: number): void {
		const { conversationId } = goal;
		const attempts = (this._retryAttempts.get(conversationId) ?? 0) + 1;
		if (attempts > this.timing.retries) {
			this._pause(goal, 'notSent');
			return;
		}
		this._retryAttempts.set(conversationId, attempts);
		this._retryTimers.set(conversationId, () => {
			if (this._isRunning(goal)) {
				void this._send(goal, text, automated);
			}
		}, afterMs);
	}

	// --- where it ends -----------------------------------------------------------------------------

	/** Nothing started for it goes on. */
	private _cancelPending(conversationId: string): void {
		this._checks.get(conversationId)?.cancel();
		this._checks.delete(conversationId);
		this._retryTimers.clear(conversationId);
		this._retryAttempts.delete(conversationId);
		this._firstTurn.clear(conversationId);
		this._waiting.clear(conversationId);
	}

	private _stopWork(goal: Goal): void {
		this._cancelPending(goal.conversationId);
		if (goal.resumedAt !== undefined) {
			goal.activeMs += Math.max(0, this._now() - goal.resumedAt);
			goal.resumedAt = undefined;
		}
		goal.waitingFor = 0;
	}

	private _releaseNotice(goal: Goal, announce: boolean): void {
		// After a sign-out or a block this is refused, and the hold has ended without it.
		void Promise.resolve(this._deps.api.chat.releaseDoneNotice(goal.conversationId, { announce })).catch(() => undefined);
	}

	private _pause(goal: Goal, reason: PauseReason): void {
		this._stopWork(goal);
		goal.status = 'paused';
		goal.pause = reason;
		goal.report = undefined;
		goal.note = this._t.pausedBecause[reason];
		this._releaseNotice(goal, false);
		this._changed(goal);
	}

	private _end(goal: Goal, status: 'complete' | 'blocked' | 'limit', note: string): void {
		this._stopWork(goal);
		goal.status = status;
		goal.note = note;
		const t = this._t;
		this._releaseNotice(goal, true);
		this._changed(goal);
		this._deps.tell(fill(status === 'complete' ? t.met : status === 'limit' ? t.limitStopped : t.stopped, { note }), status !== 'complete');
	}

	private _failed(goal: Goal, error: unknown): void {
		if (!this._isRunning(goal)) {
			return;
		}
		const name = errorName(error);
		if (name === 'BreezellInvalidRequest' && /No conversation/.test(String((error as Error)?.message))) {
			// The conversation was deleted, and its goal with it.
			this._stopWork(goal);
			this._goals.delete(goal.conversationId);
			this._changed(goal);
			return;
		}
		this._pause(goal, name === 'BreezellNotSignedIn' ? 'signedOut' : name === 'BreezellPermissionDenied' ? 'permission' : 'refused');
	}

	// --- what changes around it --------------------------------------------------------------------

	private _pauseAll(reason: PauseReason): void {
		for (const goal of this.activeGoals) {
			this._pause(goal, reason);
		}
	}

	signedOut(): void {
		this._pauseAll('signedOut');
	}

	async permissionsChanged(): Promise<void> {
		if (!this.activeGoals.length) {
			return;
		}
		const missing = await this.missingPermissions().catch(() => []);
		if (missing.length) {
			this._pauseAll('permission');
		}
	}

	dispose(): void {
		for (const conversationId of this._goals.keys()) {
			this._cancelPending(conversationId);
		}
		this._listeners.clear();
		this._save();
	}
}
