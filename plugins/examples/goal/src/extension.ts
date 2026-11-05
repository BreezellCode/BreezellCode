import * as vscode from 'vscode';
import { GoalEngine, GoalView } from './engine';
import { GoalCommand, GoalLimits, GOAL_LIMITS, limitsFromSettings, parseGoalCommand } from './logic';
import { fill, goalStrings } from './strings';

/*
 * Goal in the editor: the /goal command in the chat box, the button beside it, the strip above it, the
 * tools the agent reports through, and the settings. What a goal does is engine.ts.
 */

const STORE_KEY = 'goal.goals';
const STRIP = 'strip';
const STRIP_CLOCK_MS = 30_000;

interface OpenStrip {
	readonly surface: vscode.breezell.PluginSurface;
	readonly conversationId: string;
}

export function activate(context: vscode.ExtensionContext): { engine?: GoalEngine } {
	const breezell = vscode.breezell;
	const t = () => goalStrings(breezell?.language);
	const tell = (text: string, warn = false) => { void (warn ? vscode.window.showWarningMessage(text) : vscode.window.showInformationMessage(text)); };

	if (!breezell?.chat?.holdDoneNotice) {
		for (const command of ['goal.open', 'goal.status', 'goal.pause', 'goal.resume', 'goal.clear']) {
			context.subscriptions.push(vscode.commands.registerCommand(command, () => tell(t().needsNewer, true)));
		}
		return {};
	}

	const settings = (): GoalLimits => {
		const config = vscode.workspace.getConfiguration('goal');
		return limitsFromSettings({ maxRounds: config.get('maxRounds'), maxTokens: config.get('maxTokens'), maxMinutes: config.get('maxMinutes') });
	};
	const engine = new GoalEngine({
		api: breezell,
		load: () => context.workspaceState.get(STORE_KEY),
		save: goals => { void context.workspaceState.update(STORE_KEY, goals); },
		cancellation: () => new vscode.CancellationTokenSource(),
		defaults: settings,
		tell,
	});

	// --- the agent's tools ---------------------------------------------------------------------------

	let toolsRegistered = false;
	const registerTools = () => {
		if (toolsRegistered || !hasPermission('agent.tools')) {
			return;
		}
		toolsRegistered = true;
		context.subscriptions.push(
			breezell.tools.register('goal_get', { invoke: input => engine.toolGet(input) }),
			breezell.tools.register('goal_update', { invoke: input => engine.toolUpdate(input) }),
		);
	};
	const hasPermission = (permission: string) => breezell.permissions.includes(permission);

	// --- the chat box ----------------------------------------------------------------------------------

	const summaryOfLimits = (limits: GoalLimits): string => {
		const strings = t();
		return [
			fill(strings.round, { n: 0, max: limits.rounds }),
			...(limits.tokens ? [fill(strings.tokensOf, { n: 0, max: limits.tokens })] : []),
			...(limits.minutes ? [fill(strings.minutesOf, { n: 0, max: limits.minutes })] : []),
		].join(' · ');
	};

	const whyInvalid = (command: GoalCommand & { kind: 'invalid' }): string => command.problem === 'tooLong'
		? fill(t().tooLong, { max: GOAL_LIMITS.conditionChars })
		: fill(t().badLimit, { detail: command.detail ?? '' });
	const pauseNow = (conversationId: string): string => engine.pause(conversationId) ? t().pausedToast : t().noGoal;
	const clearNow = (conversationId: string): string => engine.clear(conversationId) ? t().clearedToast : t().noGoal;

	const handleResume = async (conversationId: string, asked: Partial<GoalLimits>) => {
		const strings = t();
		const result = await engine.resume(conversationId, asked);
		if (result === 'none') {
			tell(strings.noGoal);
		} else if (result === 'resumed' || result === 'running') {
			tell(strings.resumedToast);
		} else if (result !== 'refused') {
			tell(fill(strings.stillAtLimit, { flag: `--${result.blockedBy} …` }), true);
		}
	};

	let handler: vscode.Disposable | undefined;
	const handleSend: vscode.breezell.SendHandler = async input => {
		const command = parseGoalCommand(input.text);
		if (!command) {
			return undefined;
		}
		const strings = t();
		const handled = (reason?: string) => {
			if (reason) {
				tell(reason);
			}
			return { cancel: true, handled: true, reason: reason ?? strings.title };
		};
		switch (command.kind) {
			case 'invalid':
				// What was typed stays in the box to be corrected, and Breezell says why.
				return { cancel: true, reason: whyInvalid(command) };
			case 'help':
				return handled(strings.help);
			case 'status':
				return handled(engine.statusLine(input.conversationId));
			case 'pause':
				return handled(pauseNow(input.conversationId));
			case 'clear':
				return handled(clearNow(input.conversationId));
			case 'resume':
				void handleResume(input.conversationId, command.limits);
				return handled();
			case 'set': {
				registerTools();
				const missing = await engine.missingPermissions().catch(() => ['?']);
				if (missing.length) {
					// Asking takes longer than a message may be held: the box clears, and the goal goes out once allowed.
					void engine.start(input.conversationId, command.condition, command.limits);
					return handled();
				}
				return { text: engine.beginFromMessage(input.conversationId, command.condition, command.limits) };
			}
		}
	};

	let handlerAllowed: vscode.breezell.PermissionState | undefined;
	const dropSendHandler = () => {
		handler?.dispose();
		handler = undefined;
		handlerAllowed = undefined;
	};
	/**
	 * Registering asks the user the first time, which is why it does not wait to be allowed. One that
	 * was refused is dead, so once allowed it registers anew.
	 */
	const syncSendHandler = () => {
		if (!hasPermission('chat.intercept')) {
			return;
		}
		void breezell.permissionState('chat.intercept').then(state => {
			if (state === 'denied' || (state === 'granted' && handlerAllowed !== 'granted')) {
				dropSendHandler();
			}
			if (state !== 'denied' && !handler && breezell.account.isSignedIn) {
				handler = breezell.chat.registerSendHandler(handleSend);
			}
			handlerAllowed = state;
		}, () => undefined);
	};
	const syncTools = () => {
		if (hasPermission('agent.tools')) {
			void breezell.permissionState('agent.tools').then(state => { if (state === 'granted') { registerTools(); } }, () => undefined);
		}
	};
	const syncWithPermissions = () => {
		syncSendHandler();
		syncTools();
	};

	context.subscriptions.push(
		breezell.chat.onDidStartTurn(turn => engine.turnStarted(turn.turnId)),
		breezell.chat.onDidFinishTurn(turn => { void engine.turnFinished(turn); }),
		breezell.account.onDidChangeSignIn(signedIn => {
			if (signedIn) {
				syncWithPermissions();
			} else {
				engine.signedOut();
				dropSendHandler();
			}
		}),
		breezell.onDidChangePermissions(() => {
			void engine.permissionsChanged();
			syncWithPermissions();
		}),
	);
	if (breezell.account.isSignedIn) {
		syncWithPermissions();
	}

	// --- the button ----------------------------------------------------------------------------------

	const conversationOf = async (button?: vscode.breezell.ButtonContext): Promise<string | undefined> => {
		if (button?.conversationId) {
			return button.conversationId;
		}
		const conversations = await breezell.chat.listConversations();
		return conversations.find(conversation => conversation.current)?.id;
	};

	const askForGoal = async (conversationId: string, value?: string) => {
		const strings = t();
		const condition = await vscode.window.showInputBox({ title: strings.title, prompt: strings.inputPrompt, placeHolder: strings.inputPlaceholder, value });
		if (condition?.trim()) {
			const parsed = parseGoalCommand(`/goal ${condition}`);
			if (parsed?.kind === 'invalid') {
				tell(whyInvalid(parsed), true);
				return;
			}
			registerTools();
			const words = parsed?.kind === 'set' ? parsed : { condition: condition.trim(), limits: {} };
			await engine.start(conversationId, words.condition, words.limits);
			const goal = engine.get(conversationId);
			if (goal?.status === 'active' && !goal.pendingStart) {
				tell(fill(strings.started, { limits: summaryOfLimits(goal.limits) }));
			}
		}
	};

	/** A command run for a conversation: the one it was pressed or picked in, else the one open. */
	const onConversation = (run: (conversationId: string) => unknown) => async (button?: vscode.breezell.ButtonContext) => {
		let conversationId: string | undefined;
		try {
			conversationId = await conversationOf(button);
		} catch {
			tell(t().needsPermission, true);
			return;
		}
		if (conversationId) {
			await run(conversationId);
		} else {
			tell(t().noConversation, true);
		}
	};

	context.subscriptions.push(
		vscode.commands.registerCommand('goal.status', onConversation(conversationId => tell(engine.statusLine(conversationId)))),
		vscode.commands.registerCommand('goal.pause', onConversation(conversationId => tell(pauseNow(conversationId)))),
		vscode.commands.registerCommand('goal.resume', onConversation(conversationId => handleResume(conversationId, {}))),
		vscode.commands.registerCommand('goal.clear', onConversation(conversationId => tell(clearNow(conversationId)))),
		vscode.commands.registerCommand('goal.open', onConversation(async conversationId => {
			const strings = t();
			const goal = engine.get(conversationId);
			if (!goal || goal.status === 'complete') {
				await askForGoal(conversationId);
				return;
			}
			const choices = [
				goal.status === 'active' ? { label: strings.pause, id: 'pause' } : { label: strings.resume, id: 'resume' },
				{ label: strings.edit, id: 'edit' },
				{ label: strings.clear, id: 'clear' },
			];
			const picked = await vscode.window.showQuickPick(choices, { title: engine.statusLine(conversationId).split('\n')[1], placeHolder: fill(strings.pickPlaceholder, { condition: goal.condition.slice(0, 120) }) });
			switch (picked?.id) {
				case 'pause': tell(pauseNow(conversationId)); break;
				case 'resume': await handleResume(conversationId, {}); break;
				case 'clear': tell(clearNow(conversationId)); break;
				case 'edit': await askForGoal(conversationId, goal.condition); break;
			}
		})),
	);

	// --- the strip above the chat box ------------------------------------------------------------------

	const strips = new Set<OpenStrip>();
	const stateFor = (conversationId: string): { type: 'state'; view: GoalView | undefined } => ({ type: 'state', view: engine.viewOf(conversationId) });
	const updateStrips = (wanted: (conversationId: string) => boolean = () => true) => {
		for (const strip of strips) {
			if (wanted(strip.conversationId)) {
				void strip.surface.postMessage(stateFor(strip.conversationId));
			}
		}
	};
	// The time on the strip moves on by itself.
	const clock = setInterval(() => updateStrips(conversationId => engine.get(conversationId)?.status === 'active'), STRIP_CLOCK_MS);
	context.subscriptions.push(
		engine.onDidChange(changed => updateStrips(conversationId => conversationId === changed)),
		breezell.onDidChangeLanguage(() => updateStrips()),
		breezell.ui.onDidOpenSurface(surface => {
			const conversationId = surface.context.conversationId;
			if (surface.surfaceId !== STRIP || typeof conversationId !== 'string') {
				return;
			}
			const strip: OpenStrip = { surface, conversationId };
			strips.add(strip);
			const listening = surface.onDidReceiveMessage(message => {
				const m = (message ?? {}) as { hello?: unknown; action?: unknown };
				if (m.hello) {
					void surface.postMessage(stateFor(conversationId));
				} else if (m.action === 'pause') {
					engine.pause(conversationId);
				} else if (m.action === 'resume') {
					void handleResume(conversationId, {});
				} else if (m.action === 'clear' || m.action === 'dismiss') {
					engine.clear(conversationId);
				}
			});
			surface.onDidClose(() => {
				strips.delete(strip);
				listening.dispose();
			});
			void surface.postMessage(stateFor(conversationId));
		}),
		{
			dispose: () => {
				clearInterval(clock);
				handler?.dispose();
				engine.dispose();
			},
		},
	);

	return { engine };
}
