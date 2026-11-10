import {
	aboveScreen, COLLAPSE_MS, combinedActivity, ConversationDigest, ConversationState, conversationsToShow, DIGEST_HEARTBEAT_MS, EXPAND_MS, flightPlace, FLY_IN_MS, FLY_OUT_MS, hasActivity, IDLE,
	IslandActivity, IslandFocus, IslandLook, islandPlace, liveWindows, MORPH_MS, outsideRect, PANEL_MIN_HEIGHT, panelRect, Rect, replyExcerpt, REST_WIDTH, WindowDigest,
} from './logic';
import { islandStrings } from './strings';

/*
 * The plugin's code: it hears what Breezell is busy with and whether the user is in it, tells
 * both pages, and moves the island. In the title bar it is Breezell's page (the "titlebar"
 * surface); outside the window it is the overlay (the "overlay" window), which flies from the
 * title bar to the top of the screen once the user has left Breezell and something goes on, and
 * back when they return or all is quiet again. With nothing to show it stays in the title bar.
 *
 * Every editor window runs its own copy of this code. Each tells the others what its window is
 * doing (a broadcast); the one whose window was used last sends its island out, and that island
 * shows all the windows. A click on it opens a panel listing them, their conversations and the
 * end of each reply (with chat.read), with ways back into any of them.
 */

export const TITLEBAR_SURFACE = 'titlebar';
export const OVERLAY_WINDOW = 'overlay';
const WAYLAND_NOTED_KEY = 'island.waylandNoted';
/** The longest the overlay's page may take to load before it is shown anyway. */
const PAGE_LOAD_MS = 1500;
/** The title bar's island shows again, and only then the overlay goes: no frame without either. */
const HANDOFF_MS = 40;
/** What changes often (a reply being written) is told at most this often. */
const TELL_EVERY_MS = 250;
/** Conversations kept per window: the panel shows the busy ones and the latest few. */
const CONVERSATIONS_KEPT = 12;

interface Disposable { dispose(): unknown }
type Listen<T> = (listener: (value: T) => unknown) => Disposable;

/** What the island uses of vscode.breezell, so the tests can stand in for it. */
export interface IslandSurface {
	readonly surfaceId: string;
	postMessage(message: unknown): Thenable<boolean>;
	readonly onDidReceiveMessage: Listen<unknown>;
	readonly onDidClose: Listen<void>;
	screenRect(): Thenable<Rect | undefined>;
}

export interface IslandWindow {
	postMessage(message: unknown): Thenable<boolean>;
	readonly onDidReceiveMessage: Listen<unknown>;
	readonly onDidClose: Listen<void>;
	setBounds(bounds: Rect, options?: { readonly durationMs?: number }): Thenable<void>;
	show(): Thenable<void>;
	hide(): Thenable<void>;
	close(): Thenable<void>;
	activate(): Thenable<void>;
	readonly onDidDeactivate: Listen<void>;
}

interface ConversationSummaryLike {
	readonly id: string;
	readonly title: string;
	readonly updatedAt: string;
	readonly activity: ConversationState;
}

export interface IslandApi {
	readonly language: string;
	readonly onDidChangeLanguage: Listen<string>;
	permissionState(permission: string): Thenable<'granted' | 'denied' | 'ask'>;
	requestPermission(permission: string): Thenable<boolean>;
	readonly onDidChangePermissions: Listen<void>;
	readonly ui: { readonly onDidOpenSurface: Listen<IslandSurface> };
	readonly app: { focus(): Thenable<IslandFocus>; readonly onDidChangeFocus: Listen<IslandFocus> };
	readonly activity: {
		current(): Thenable<IslandActivity>;
		readonly onDidChange: Listen<IslandActivity>;
		modelIcon(model: { readonly provider: string; readonly name: string }): Thenable<string | undefined>;
		reveal(target?: 'agent' | 'task'): Thenable<void>;
	};
	readonly chat: {
		listConversations(): Thenable<readonly ConversationSummaryLike[]>;
		getConversation(conversationId: string): Thenable<ConversationSummaryLike & { readonly messages: readonly { readonly kind: string; readonly text?: string }[] }>;
		readonly onDidChangeConversation: Listen<{ readonly conversationId: string; readonly activity: ConversationState; readonly streaming?: { readonly text: string } }>;
		show(conversationId: string): Thenable<void>;
	};
	readonly windows: {
		open(windowId: string): Thenable<IslandWindow>;
		overlaySupported(): Thenable<boolean>;
		workArea(): Thenable<Rect>;
		focusEditor(windowId?: number): Thenable<void>;
		broadcast(message: unknown): Thenable<boolean>;
		readonly onDidReceiveBroadcast: Listen<{ readonly fromWindow: number; readonly message: unknown }>;
	};
}

/** What the island takes from the editor around it. */
export interface IslandHost {
	readonly api: IslandApi;
	/** The user's "Float outside the window" setting. */
	floatOutside(): boolean;
	readonly onDidChangeSettings: Listen<void>;
	look(): IslandLook;
	readonly onDidChangeLook: Listen<void>;
	/** The workspace's name: how the panel names this window. */
	title(): string | undefined;
	/** Whether moves are to happen at once (Breezell's reduce motion). */
	reduceMotion(): boolean;
	readonly memento: { get<T>(key: string): T | undefined; update(key: string, value: unknown): Thenable<void> };
	note(text: string): void;
	log(text: string): void;
	delay(ms: number): Promise<void>;
	now(): number;
	/** Runs `run` after `ms`, unless disposed first. */
	later(ms: number, run: () => void): Disposable;
}

type Place = 'inside' | 'outside';

/** What the windows tell each other. */
type Broadcast =
	| { readonly type: 'hello' }
	| { readonly type: 'digest'; readonly digest: WindowDigest }
	| { readonly type: 'bye'; readonly windowId: number }
	| { readonly type: 'show'; readonly windowId: number; readonly conversationId: string }
	| { readonly type: 'revealTask'; readonly windowId: number }
	/** The panel opened: each window reads its conversations again (a deleted one says nothing). */
	| { readonly type: 'refresh' };

export class Island {

	private readonly _subscriptions: Disposable[] = [];
	private _activity: IslandActivity = IDLE;
	private readonly _modelIcons = new Map<string, string | undefined>();
	private _focus: IslandFocus = { editorFocused: true, lastUsed: true };
	private _supported = false;
	/** Whether the user allows the overlay (ui.overlay); it floats only once it is known to be allowed. */
	private _overlayPermission: 'granted' | 'denied' | 'ask' = 'ask';
	private _titlebar: IslandSurface | undefined;
	private _overlay: Promise<IslandWindow | undefined> | undefined;
	private _overlayReady: (() => void) | undefined;
	/** The overlay is on screen (or about to be): a flight back in has to bring it down. */
	private _overlayShown = false;
	/** The overlay did not open, or Breezell closed it: it is not asked for again until the user has been back. */
	private _overlayLost = false;
	/** The title bar's island stepped away because the overlay covers it or is out. */
	private _titlebarAway = false;
	/** The width each page asked for; outside, the overlay takes its own. */
	private _titlebarWidth = REST_WIDTH;
	private _overlayWidth: number | undefined;
	private _place: Place = 'inside';
	/** Where the island is meant to be; a flight under way gives way to the next. */
	private _flight = 0;
	private _settled = true;
	private _disposed = false;
	/** The panel is open (outside only), and how tall its page says it is. */
	private _expanded = false;
	private _panelHeight = PANEL_MIN_HEIGHT;
	/** The other windows, as they last told it. */
	private readonly _others = new Map<number, WindowDigest>();
	/** This window's conversations (chat.read). */
	private readonly _chats = new Map<string, ConversationDigest>();
	private _readsChat = false;
	private _chatWatch: Disposable | undefined;
	private _tellSoon: Disposable | undefined;
	private _heartbeat: Disposable | undefined;

	constructor(private readonly _host: IslandHost) { }

	async start(): Promise<void> {
		const api = this._host.api;
		this._subscriptions.push(
			api.ui.onDidOpenSurface(surface => this._onSurface(surface)),
			api.onDidChangeLanguage(() => this._tellAll()),
			this._host.onDidChangeLook(() => this._changed()),
			this._host.onDidChangeSettings(() => {
				if (!this._host.floatOutside()) {
					this._closeOverlay();
				}
				this._tellAll();
				void this._askForPermissions().then(() => this._decide());
			}),
			api.onDidChangePermissions(() => void this._refreshPermissions().then(() => this._decide())),
			api.windows.onDidReceiveBroadcast(b => this._onBroadcast(b.fromWindow, b.message as Broadcast)),
		);
		this._supported = await Promise.resolve(api.windows.overlaySupported()).catch(() => false);
		this._focus = await Promise.resolve(api.app.focus()).catch(() => this._focus);
		await this._refreshPermissions();
		try {
			this._subscriptions.push(api.activity.onDidChange(activity => this._setActivity(activity)));
			this._setActivity(await api.activity.current());
		} catch (err) {
			this._host.log(`activity is not available: ${errorText(err)}`);
		}
		this._subscriptions.push(api.app.onDidChangeFocus(focus => {
			this._focus = focus;
			if (focus.editorFocused) {
				this._overlayLost = false;
			}
			this._decide();
			if (focus.editorFocused) {
				void this._askForPermissions().then(() => this._decide());
			}
		}));
		if (!this._supported && this._host.floatOutside() && !this._host.memento.get(WAYLAND_NOTED_KEY)) {
			void this._host.memento.update(WAYLAND_NOTED_KEY, true);
			this._host.note(this._strings().waylandNote);
		}
		await this._askForPermissions();
		void api.windows.broadcast({ type: 'hello' });
		this._sayDigest();
		this._beat();
		this._decide();
	}

	dispose(): void {
		this._disposed = true;
		this._flight++;
		for (const s of this._subscriptions.splice(0)) {
			s.dispose();
		}
		this._chatWatch?.dispose();
		this._tellSoon?.dispose();
		this._heartbeat?.dispose();
		if (this._focus.windowId !== undefined) {
			void Promise.resolve(this._host.api.windows.broadcast({ type: 'bye', windowId: this._focus.windowId })).catch(() => undefined);
		}
		this._closeOverlay();
	}

	// --- permissions ---------------------------------------------------------------------

	/** Whether the island goes out of the window now. */
	private _canFloat(): boolean {
		return this._supported && this._overlayPermission === 'granted' && this._host.floatOutside();
	}

	private async _state(permission: string): Promise<'granted' | 'denied' | 'ask'> {
		return Promise.resolve(this._host.api.permissionState(permission)).catch(() => 'denied' as const);
	}

	private async _refreshPermissions(): Promise<void> {
		this._overlayPermission = await this._state('ui.overlay');
		if (this._overlayPermission !== 'granted') {
			this._closeOverlay();
		}
		this._setReadsChat(await this._state('chat.read') === 'granted');
	}

	/**
	 * Permissions are asked for while the user is in Breezell (at start, or when they come back),
	 * so a question never pops up in a window they just left: the overlay first, then reading the
	 * conversations for the panel.
	 */
	private async _askForPermissions(): Promise<void> {
		if (!this._focus.editorFocused || this._disposed) {
			return;
		}
		const api = this._host.api;
		if (this._supported && this._host.floatOutside() && this._overlayPermission === 'ask') {
			if (await this._state('ui.overlay') === 'ask') {
				this._overlayPermission = await Promise.resolve(api.requestPermission('ui.overlay')).catch(() => false) ? 'granted' : 'denied';
			} else {
				this._overlayPermission = await this._state('ui.overlay');
			}
		}
		if (this._canFloat() && !this._readsChat && await this._state('chat.read') === 'ask') {
			this._setReadsChat(await Promise.resolve(api.requestPermission('chat.read')).catch(() => false));
		}
	}

	// --- what this window does -------------------------------------------------------------

	private _strings() {
		return islandStrings(this._host.api.language);
	}

	private _setActivity(activity: IslandActivity): void {
		this._activity = activity;
		this._changed();
		this._decide();
	}

	private _setReadsChat(reads: boolean): void {
		if (reads === this._readsChat) {
			return;
		}
		this._readsChat = reads;
		this._chatWatch?.dispose();
		this._chatWatch = undefined;
		this._chats.clear();
		if (reads) {
			const api = this._host.api;
			try {
				this._chatWatch = api.chat.onDidChangeConversation(change => this._onConversation(change));
			} catch (err) {
				this._host.log(`conversations are not available: ${errorText(err)}`);
				this._readsChat = false;
				return;
			}
			void this._loadConversations();
		}
		this._changed();
	}

	/**
	 * Reads the conversations again. Breezell says nothing when one is deleted: those no longer
	 * listed go, whatever they were doing.
	 */
	private async _loadConversations(): Promise<void> {
		const list = await Promise.resolve(this._host.api.chat.listConversations()).catch(() => undefined);
		if (!this._readsChat || !list) {
			return;
		}
		const listed = new Set(list.map(c => c.id));
		for (const id of [...this._chats.keys()]) {
			if (!listed.has(id)) {
				this._chats.delete(id);
			}
		}
		const recent = [...list].sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt)).slice(0, CONVERSATIONS_KEPT);
		for (const c of recent) {
			const known = this._chats.get(c.id);
			this._chats.set(c.id, {
				id: c.id, title: c.title, state: known?.state ?? c.activity, updatedAt: Date.parse(c.updatedAt) || this._host.now(),
				...(known?.reply ? { reply: known.reply } : {}), ...(known?.since ? { since: known.since } : {}),
			});
		}
		this._trimChats();
		// The end of the last reply of those the panel would list.
		for (const c of conversationsToShow([...this._chats.values()], this._host.now())) {
			if (!c.reply) {
				void this._loadReply(c.id);
			}
		}
		this._changed();
	}

	private async _loadReply(conversationId: string): Promise<void> {
		const conversation = await Promise.resolve(this._host.api.chat.getConversation(conversationId)).catch(() => undefined);
		const known = this._chats.get(conversationId);
		if (!conversation || !known || !this._readsChat) {
			return;
		}
		const last = [...conversation.messages].reverse().find(m => m.kind === 'assistant' && m.text);
		this._chats.set(conversationId, { ...known, title: conversation.title || known.title, ...(last?.text ? { reply: replyExcerpt(last.text) } : {}) });
		this._changed();
	}

	private _onConversation(change: { readonly conversationId: string; readonly activity: ConversationState; readonly streaming?: { readonly text: string } }): void {
		const now = this._host.now();
		const known = this._chats.get(change.conversationId);
		const reply = change.streaming?.text ? replyExcerpt(change.streaming.text) : known?.reply;
		const since = change.activity === 'idle' ? undefined : known && known.state !== 'idle' && known.since ? known.since : now;
		this._chats.set(change.conversationId, {
			id: change.conversationId, title: known?.title ?? '', state: change.activity, updatedAt: now,
			...(reply ? { reply } : {}), ...(since ? { since } : {}),
		});
		this._trimChats();
		if (!known) {
			// A new conversation: its title comes with the list.
			void this._loadConversations();
		} else if (change.activity === 'idle' && known.state !== 'idle') {
			void this._loadReply(change.conversationId);
		}
		this._changed();
	}

	private _trimChats(): void {
		const order = [...this._chats.values()].sort((a, b) => b.updatedAt - a.updatedAt);
		for (const c of order.slice(CONVERSATIONS_KEPT)) {
			if (c.state === 'idle') {
				this._chats.delete(c.id);
			}
		}
	}

	/** This window, as the other windows' islands hear of it. */
	private _digest(): WindowDigest | undefined {
		const windowId = this._focus.windowId;
		if (windowId === undefined) {
			return undefined;
		}
		const now = this._host.now();
		return {
			windowId,
			title: this._host.title() || 'Breezell',
			activity: this._activity,
			conversations: conversationsToShow([...this._chats.values()], now, 3),
			readsChat: this._readsChat,
			at: now,
		};
	}

	/** Something this window shows changed: the title bar's page hears at once, the rest a moment later. */
	private _changed(): void {
		void this._titlebar?.postMessage(this._titlebarState());
		this._fetchModelIcons();
		if (!this._tellSoon) {
			this._tellSoon = this._host.later(TELL_EVERY_MS, () => {
				this._tellSoon = undefined;
				this._sayDigest();
				this._tellOverlay();
			});
		}
	}

	private _sayDigest(): void {
		const digest = this._digest();
		if (digest && !this._disposed) {
			void Promise.resolve(this._host.api.windows.broadcast({ type: 'digest', digest })).catch(() => undefined);
		}
	}

	/** Each window says it is there now and then, so a window that went quiet drops out. */
	private _beat(): void {
		this._heartbeat = this._host.later(DIGEST_HEARTBEAT_MS, () => {
			if (this._readsChat) {
				void this._loadConversations();
			}
			this._sayDigest();
			this._tellOverlay();
			// A window that went quiet may have been the one with something to show.
			this._decide();
			this._beat();
		});
	}

	private _onBroadcast(fromWindow: number, message: Broadcast): void {
		if (!message || typeof message !== 'object' || this._disposed) {
			return;
		}
		const mine = this._focus.windowId;
		switch (message.type) {
			case 'hello':
				this._sayDigest();
				break;
			case 'refresh':
				if (this._readsChat) {
					void this._loadConversations();
				}
				break;
			case 'digest':
				if (message.digest && message.digest.windowId === fromWindow) {
					this._others.set(fromWindow, { ...message.digest, at: this._host.now() });
					this._tellOverlay();
					this._decide();
				}
				break;
			case 'bye':
				this._others.delete(fromWindow);
				this._tellOverlay();
				this._decide();
				break;
			case 'show':
				if (message.windowId === mine && typeof message.conversationId === 'string' && this._readsChat) {
					void Promise.resolve(this._host.api.chat.show(message.conversationId)).catch(err => this._host.log(`show: ${errorText(err)}`));
				}
				break;
			case 'revealTask':
				if (message.windowId === mine) {
					void Promise.resolve(this._host.api.activity.reveal('task')).catch(() => undefined);
				}
				break;
		}
	}

	/** Every window the island outside shows, this one first. */
	private _windows(): WindowDigest[] {
		const own = this._digest();
		const all = new Map(this._others);
		if (own) {
			all.set(own.windowId, own);
		}
		return liveWindows(all.values(), this._host.now(), this._focus.windowId);
	}

	/** Whether any window has something to show: the island goes out for that, never to say that nothing goes on. */
	private _live(): boolean {
		return hasActivity(combinedActivity(this._windows()));
	}

	private _fetchModelIcons(): void {
		const models = [this._activity, ...[...this._others.values()].map(w => w.activity)]
			.map(a => a.agent.kind === 'working' ? a.agent.model : undefined)
			.filter((m): m is { provider: string; name: string } => !!m);
		for (const model of models) {
			const key = `${model.provider}/${model.name}`;
			if (!this._modelIcons.has(key)) {
				this._modelIcons.set(key, undefined);
				void Promise.resolve(this._host.api.activity.modelIcon(model)).then(svg => {
					this._modelIcons.set(key, svg);
					void this._titlebar?.postMessage(this._titlebarState());
					this._tellOverlay();
				}, () => undefined);
			}
		}
	}

	private _iconOf(activity: IslandActivity): string | undefined {
		const model = activity.agent.kind === 'working' ? activity.agent.model : undefined;
		return model ? this._modelIcons.get(`${model.provider}/${model.name}`) : undefined;
	}

	// --- the pages -----------------------------------------------------------------------

	private _common() {
		return { type: 'state', language: this._host.api.language, look: this._host.look(), reduceMotion: this._host.reduceMotion() };
	}

	/** The title bar shows its own window. */
	private _titlebarState() {
		return { ...this._common(), activity: this._activity, modelIcon: this._iconOf(this._activity), away: this._titlebarAway };
	}

	/** Outside, the island shows every window; its panel lists them. */
	private _overlayState() {
		const windows = this._windows();
		const activity = combinedActivity(windows);
		return { ...this._common(), activity, modelIcon: this._iconOf(activity), windows, windowId: this._focus.windowId, readsChat: this._readsChat, expanded: this._expanded };
	}

	private _tellOverlay(): void {
		void this._overlay?.then(w => w?.postMessage(this._overlayState()));
	}

	private _tellAll(): void {
		void this._titlebar?.postMessage(this._titlebarState());
		this._tellOverlay();
	}

	private _onSurface(surface: IslandSurface): void {
		if (surface.surfaceId !== TITLEBAR_SURFACE) {
			return;
		}
		this._titlebar = surface;
		const listening = surface.onDidReceiveMessage(raw => {
			const m = (raw ?? {}) as { hello?: unknown; width?: unknown; reveal?: unknown };
			if (m.hello) {
				void surface.postMessage(this._titlebarState());
			}
			if (typeof m.width === 'number' && Number.isFinite(m.width)) {
				this._titlebarWidth = Math.round(m.width);
			}
			if (m.reveal === 'agent' || m.reveal === 'task') {
				void this._host.api.activity.reveal(m.reveal);
			}
		});
		surface.onDidClose(() => {
			listening.dispose();
			if (this._titlebar === surface) {
				this._titlebar = undefined;
			}
		});
		void surface.postMessage(this._titlebarState());
	}

	private _openOverlay(): Promise<IslandWindow | undefined> {
		if (!this._overlay) {
			const opened = (async () => {
				let ready: () => void = () => undefined;
				const loaded = new Promise<void>(resolve => { ready = resolve; });
				this._overlayReady = ready;
				const win = await this._host.api.windows.open(OVERLAY_WINDOW);
				win.onDidReceiveMessage(raw => this._onOverlayMessage(win, raw));
				win.onDidDeactivate(() => this._collapse());
				win.onDidClose(() => {
					if (this._overlay === opened) {
						this._overlay = undefined;
						this._overlayShown = false;
						this._overlayWidth = undefined;
						this._expanded = false;
						this._overlayLost = true;
						this._comeBack();
					}
				});
				void win.postMessage(this._overlayState());
				await Promise.race([loaded, this._host.delay(PAGE_LOAD_MS)]);
				return win;
			})().catch(err => {
				this._host.log(`the overlay did not open: ${errorText(err)}`);
				if ((err as { name?: string })?.name === 'BreezellPermissionDenied') {
					this._overlayPermission = 'denied';
				} else if ((err as { name?: string })?.name === 'BreezellNotSupported') {
					this._supported = false;
				}
				this._overlay = undefined;
				this._overlayLost = true;
				return undefined;
			});
			this._overlay = opened;
		}
		return this._overlay;
	}

	private _onOverlayMessage(win: IslandWindow, raw: unknown): void {
		const m = (raw ?? {}) as {
			hello?: unknown; width?: unknown; panelHeight?: unknown; expand?: unknown; collapse?: unknown; back?: unknown;
			goWindow?: unknown; openConversation?: { windowId?: unknown; conversationId?: unknown }; revealTask?: unknown;
		};
		const api = this._host.api;
		const focus = (windowId?: number) => Promise.resolve(api.windows.focusEditor(windowId)).catch(err => this._host.log(`to the editor: ${errorText(err)}`));
		if (m.hello) {
			void win.postMessage(this._overlayState());
			this._overlayReady?.();
		}
		if (typeof m.width === 'number' && Number.isFinite(m.width)) {
			this._overlayWidth = Math.round(m.width);
			if (this._place === 'outside' && this._settled && !this._expanded) {
				void this._fit(win, MORPH_MS);
			}
		}
		if (typeof m.panelHeight === 'number' && Number.isFinite(m.panelHeight)) {
			const height = Math.round(m.panelHeight);
			if (height !== this._panelHeight) {
				this._panelHeight = height;
				if (this._expanded && this._settled) {
					void this._fit(win, MORPH_MS);
				}
			}
		}
		if (m.expand) {
			void this._expand(win);
		} else if (m.collapse) {
			this._collapse();
		} else if (m.back) {
			void focus();
		} else if (typeof m.goWindow === 'number') {
			void focus(m.goWindow);
		} else if (m.openConversation && typeof m.openConversation.windowId === 'number' && typeof m.openConversation.conversationId === 'string') {
			const { windowId, conversationId } = m.openConversation as { windowId: number; conversationId: string };
			if (windowId === this._focus.windowId) {
				if (this._readsChat) {
					void Promise.resolve(api.chat.show(conversationId)).catch(err => this._host.log(`show: ${errorText(err)}`));
				}
			} else {
				void api.windows.broadcast({ type: 'show', windowId, conversationId });
			}
			void focus(windowId);
		} else if (typeof m.revealTask === 'number') {
			if (m.revealTask === this._focus.windowId) {
				void Promise.resolve(api.activity.reveal('task')).catch(() => undefined);
			} else {
				void api.windows.broadcast({ type: 'revealTask', windowId: m.revealTask });
				void focus(m.revealTask);
			}
		}
	}

	/** Where the overlay is when it is out: the pill, or the panel when open. */
	private async _fit(win: IslandWindow, durationMs: number): Promise<void> {
		const flight = this._flight;
		const area = await this._host.api.windows.workArea();
		if (flight !== this._flight) {
			// It set off elsewhere meanwhile: that flight places it.
			return;
		}
		const rect = this._expanded ? panelRect(area, this._panelHeight) : outsideRect(area, this._overlayWidth ?? this._titlebarWidth);
		await win.setBounds(rect, { durationMs: this._ms(durationMs) });
	}

	/** The pill opens into the panel, which takes the keyboard until the user clicks elsewhere. */
	private async _expand(win: IslandWindow): Promise<void> {
		if (this._place !== 'outside' || !this._settled || this._expanded) {
			return;
		}
		this._expanded = true;
		this._tellOverlay();
		if (this._readsChat) {
			void this._loadConversations();
		}
		void Promise.resolve(this._host.api.windows.broadcast({ type: 'refresh' })).catch(() => undefined);
		const flight = this._flight;
		await this._fit(win, EXPAND_MS);
		if (flight === this._flight && this._expanded) {
			await Promise.resolve(win.activate()).catch(err => this._host.log(`activate: ${errorText(err)}`));
		}
	}

	private _collapse(): void {
		if (!this._expanded) {
			return;
		}
		this._expanded = false;
		this._tellOverlay();
		// Open, the panel kept the island out; with nothing left to show it goes home now, not back into the pill.
		this._decide();
		if (this._place === 'outside' && this._settled) {
			void this._overlay?.then(win => win && this._fit(win, COLLAPSE_MS));
		}
	}

	private _closeOverlay(): void {
		const overlay = this._overlay;
		this._overlay = undefined;
		this._overlayShown = false;
		this._overlayWidth = undefined;
		this._expanded = false;
		void overlay?.then(w => w?.close());
		this._comeBack();
	}

	/** The overlay is gone: the island is back in the title bar, at once. */
	private _comeBack(): void {
		this._flight++;
		this._settled = true;
		this._place = 'inside';
		if (this._titlebarAway) {
			this._titlebarAway = false;
			void this._titlebar?.postMessage(this._titlebarState());
		}
	}

	private _ms(ms: number): number {
		return this._host.reduceMotion() ? 0 : ms;
	}

	// --- flying ------------------------------------------------------------------------

	/** Sends the island where it belongs now, if it is not there or on its way. */
	private _decide(): void {
		if (this._disposed) {
			return;
		}
		// The open panel counts as something to show: the island does not leave from under the user's hand.
		// What goes on changes far more often than where the user is: a lost overlay is not opened anew for it.
		const place = islandPlace(this._focus, this._canFloat() && !this._overlayLost, this._live() || this._expanded);
		if (place === this._place) {
			return;
		}
		this._place = place;
		const flight = ++this._flight;
		this._settled = false;
		const go = place === 'outside' ? this._flyOut(flight) : this._flyIn(flight);
		void go.catch(err => this._host.log(`the island did not move: ${errorText(err)}`)).finally(() => {
			if (flight === this._flight) {
				this._settled = true;
			}
		});
	}

	private async _flyOut(flight: number): Promise<void> {
		const api = this._host.api;
		const [from, area, win] = await Promise.all([
			this._titlebar ? Promise.resolve(this._titlebar.screenRect()).catch(() => undefined) : undefined,
			api.windows.workArea(),
			this._openOverlay(),
		]);
		if (flight !== this._flight) {
			return;
		}
		if (!win) {
			// Not allowed or not possible after all: it stays in.
			this._place = 'inside';
			return;
		}
		this._expanded = false;
		void win.postMessage(this._overlayState());
		const width = this._overlayWidth ?? this._titlebarWidth;
		const to = outsideRect(area, width);
		// From the title bar's island, or from above the screen when that one is not on it (no page there, or a minimized window an older Breezell misplaces).
		const start = flightPlace(from, area) ?? aboveScreen(area, width);
		void win.postMessage({ type: 'fly', to: 'outside', durationMs: this._ms(FLY_OUT_MS) });
		if (!this._overlayShown) {
			await win.setBounds(start);
			if (flight !== this._flight) {
				return;
			}
			// Marked first: a flight back in that starts while it appears brings it down.
			this._overlayShown = true;
			await win.show();
			if (flight !== this._flight) {
				return;
			}
		}
		// The overlay covers the title bar's island now (or is already out): that one steps away under it.
		this._titlebarAway = true;
		void this._titlebar?.postMessage(this._titlebarState());
		await win.setBounds(to, { durationMs: this._ms(FLY_OUT_MS) });
	}

	private async _flyIn(flight: number): Promise<void> {
		const win = this._overlay ? await this._overlay : undefined;
		if (flight !== this._flight) {
			return;
		}
		if (!win || !this._overlayShown) {
			this._titlebarAway = false;
			void this._titlebar?.postMessage(this._titlebarState());
			return;
		}
		// The panel closes as it flies home.
		this._expanded = false;
		void win.postMessage(this._overlayState());
		const api = this._host.api;
		const [to, area] = await Promise.all([
			this._titlebar ? Promise.resolve(this._titlebar.screenRect()).catch(() => undefined) : undefined,
			api.windows.workArea(),
		]);
		if (flight !== this._flight) {
			return;
		}
		const width = this._overlayWidth ?? this._titlebarWidth;
		const landing = flightPlace(to, area) ?? aboveScreen(area, width);
		void win.postMessage({ type: 'fly', to: 'inside', durationMs: this._ms(FLY_IN_MS) });
		await win.setBounds(landing, { durationMs: this._ms(FLY_IN_MS) });
		if (flight !== this._flight) {
			return;
		}
		this._titlebarAway = false;
		void this._titlebar?.postMessage(this._titlebarState());
		await this._host.delay(HANDOFF_MS);
		if (flight !== this._flight) {
			return;
		}
		await win.hide();
		this._overlayShown = false;
	}
}

const errorText = (err: unknown): string => err instanceof Error ? err.message : String(err);
