/**
 * Breezell IME in Breezell's editor and chat: while it is on, typed keys go to the input method;
 * what is being composed shows after the caret and its candidates in Breezell's panel (the
 * command breezell.ime.panel: the same panel as the system input method's), and the chosen text
 * goes in. In code the keys stay English outside comments and strings (and after /// on the line).
 *
 * Keys while composing: Space or a digit picks (zhuyin: Shift+digit, Space is the first tone),
 * the arrows and Page Up/Down move through the candidates, Enter commits as typed, Escape drops
 * it, Backspace takes back a key. The toggle (Ctrl+Alt+Space; macOS Ctrl+Alt+Shift+Space: the
 * system keeps Ctrl+Option+Space) turns the input method on and off, Ctrl+Alt+K picks it.
 *
 * What a key does is keys.ts's, shared with the system input method's host. Where the host runs
 * (Windows, with the system input method installed) the plugin composes there (remote.ts), else
 * here; on Windows it also tells the host where the window's focus is, so the system's text
 * service leaves the editor and the chat to the plugin, and follows the system's native /
 * English state.
 */
import { AdaptiveModel, AdaptiveSnapshot } from '../engine/src/index.js';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import * as vscode from 'vscode';
import { englishAt } from './code.js';
import { AsyncComposer, ChineseComposer, ChineseData, Composer, JapaneseComposer, JapaneseData, KoreanComposer, KoreanData, LocalComposer, WubiComposer } from './composers.js';
import { Key, KeySession, KeyView } from './keys.js';
import { DataManifest, hasPack, loadManifest, packOfLayout } from './data.js';
import { configuredDataDir, updateSharedConfig } from './paths.js';
import { HostClient, HostEvent, RemoteComposer } from './remote.js';
import { SettingsPage } from './settings.js';
import { refreshSystem } from './system.js';

const l10n = vscode.l10n;

/** The input methods; `short` is the status bar's mark, in the input method's own script. */
const LAYOUTS: { id: string; label: () => string; short: string }[] = [
	{ id: 'pinyin', label: () => l10n.t('Pinyin'), short: '拼' },
	{ id: 'zhuyin', label: () => l10n.t('Zhuyin (Dachen)'), short: '注' },
	{ id: 'flypy', label: () => l10n.t('Double Pinyin (Flypy)'), short: '鶴' },
	{ id: 'mspy', label: () => l10n.t('Double Pinyin (Microsoft)'), short: '微' },
	{ id: 'ziranma', label: () => l10n.t('Double Pinyin (Ziranma)'), short: '自' },
	{ id: 'sogou', label: () => l10n.t('Double Pinyin (Sogou)'), short: '搜' },
	{ id: 'abc', label: () => l10n.t('Double Pinyin (ABC)'), short: 'ABC' },
	{ id: 'ziguang', label: () => l10n.t('Double Pinyin (Ziguang)'), short: '紫' },
	{ id: 'jiajia', label: () => l10n.t('Double Pinyin (Pinyin Jiajia)'), short: '加' },
	{ id: 'wubi', label: () => l10n.t('Wubi 86'), short: '五' },
	{ id: 'japanese', label: () => l10n.t('Japanese (romaji)'), short: 'あ' },
	{ id: 'korean', label: () => l10n.t('Korean (2-set)'), short: '한' },
];

/** The language the input method needs is not on this computer: the settings page was opened. */
class NoData extends Error { }

const CHINESE = new Set(['pinyin', 'zhuyin', 'flypy', 'mspy', 'ziranma', 'sogou', 'abc', 'ziguang', 'jiajia']);
const SHIFT_DIGITS = '!@#$%^&*(';
const TOGGLE_KEY = process.platform === 'darwin' ? 'Ctrl+Alt+Shift+Space' : 'Ctrl+Alt+Space';

/** A key from Breezell's chat box (see the chat input's bridge). */
interface ChatKey {
	readonly key: string;
	readonly shift?: boolean;
	/** The digit of a digit key (1–9), whatever Shift made of it. */
	readonly digit?: number;
	/** The conversation before, when a composition starts. */
	readonly context?: string;
	/** The chat box's text before the caret. */
	readonly before?: string;
}

/** What the chat box does with it. */
interface ChatAnswer {
	/** The input method took the key (the chat box must not). */
	readonly handled: boolean;
	/** Text to insert at the caret. */
	readonly commit: string;
	readonly preedit: string;
	readonly composing: boolean;
	/** The page of candidates shown, the highlighted one's place on it. */
	readonly candidates: readonly string[];
	readonly highlight: number;
	readonly pageStart: number;
	/** How candidates are picked: digits, Shift+digits (zhuyin), or Tab and a click (the words offered after a commit). */
	readonly labels?: 'digits' | 'shift' | 'none';
	readonly more?: boolean;
	/** The panel's top line (hen jian dan), the input method's sign (中 · 繁), a page before this one. */
	readonly reading?: string;
	readonly badge?: string;
	readonly prev?: boolean;
	readonly lang?: string;
	/** Not composing: the candidates are the words offered after the commit (聯想). */
	readonly predicting?: boolean;
}

/** What Breezell's candidate panel shows (the command breezell.ime.panel; null hides it). */
interface Panel {
	readonly reading: string;
	readonly badge: string;
	readonly candidates: readonly string[];
	/** The highlighted one's place on the page, -1 none. */
	readonly highlight: number;
	readonly labels: 'digits' | 'shift' | 'none';
	readonly more: boolean;
	readonly prev: boolean;
	/** A brief sign instead (中 / 英), gone after a moment. */
	readonly flash?: string;
	/** The candidates' language, for their font: zh-TW, zh-CN, ja, ko. */
	readonly lang?: string;
}

class Ime implements vscode.Disposable {
	private enabled = false;
	private layout: string;
	private session?: KeySession;
	private readonly sessions = new Map<string, KeySession>();
	private readonly host?: HostClient;
	private mergedLearning = false;
	private chinese?: ChineseData;
	private japanese?: JapaneseData;
	private korean?: KoreanData;
	private readonly adaptive = new Map<string, AdaptiveModel>();
	private typeCommand?: vscode.Disposable;
	private queue: Promise<unknown> = Promise.resolve();
	private editing = false;
	/** Where the caret went with this plugin's last edit (its own selection change is no caret move). */
	private ownCaret?: vscode.Position;
	/** Whether the words that may come next are offered where the next commit goes (not in code). */
	private predictionHere = true;
	private readonly status: vscode.StatusBarItem;
	private readonly preeditDeco = vscode.window.createTextEditorDecorationType({
		after: { textDecoration: 'underline; text-underline-offset: 3px', color: new vscode.ThemeColor('editor.foreground') },
	});
	private readonly candDeco = vscode.window.createTextEditorDecorationType({
		after: {
			color: new vscode.ThemeColor('editorSuggestWidget.foreground'), backgroundColor: new vscode.ThemeColor('editorSuggestWidget.background'),
			border: '1px solid', borderColor: new vscode.ThemeColor('editorSuggestWidget.border'), margin: '0 0 0 0.5em',
		},
	});
	private readonly disposables: vscode.Disposable[] = [];
	private readonly log = vscode.window.createOutputChannel('Breezell IME', { log: true });
	private readonly manifest: DataManifest;
	private readonly settings: SettingsPage;
	private commitsSinceSave = 0;
	/** Korean: what the word being typed may become (Tab takes the first). */
	private suggestions: string[] = [];
	/** Whether Breezell draws the candidate panel (else the candidates are text after the caret). */
	private panelCommand?: boolean;
	private panelShown = false;
	/** Breezell's editor or chat has the focus (Breezell says so: breezellIme.surface). */
	private surfaceInternal = false;
	private windowFocused = vscode.window.state.focused;

	constructor(private readonly context: vscode.ExtensionContext) {
		// The input method in use is the plugin's own state; the setting is only the first default.
		this.layout = context.globalState.get<string>('layout') ?? this.config.get<string>('layout', 'pinyin');
		this.log.info(`activated, layout ${this.layout}, platform ${process.platform}, data ${this.dataDir}`);
		this.manifest = loadManifest(join(context.extensionPath, 'media', 'data-manifest.json'));
		const self = this;
		this.settings = new SettingsPage(context, this.manifest, {
			get layout() { return self.layout; },
			get traditional() { return self.traditional; },
			get dataDir() { return self.dataDir; },
			toggleKey: TOGGLE_KEY,
			layouts: () => LAYOUTS.map(l => ({ id: l.id, label: l.label() })),
			setLayout: async id => { await this.run(() => this.setLayout(id)); },
			setDataDir: async dir => { await this.run(() => this.setDataDir(dir)); },
			setSharedSetting: async (key, value) => { await this.run(() => this.setSharedSetting(key, value)); },
			clearLearning: async () => { await this.run(() => this.clearLearning()); },
			dataChanged: async () => { await this.run(() => this.dataChanged()); },
			systemChanged: async () => { await this.run(() => this.dataChanged(false)); },
			showLog: () => this.log.show(),
		});
		this.disposables.push(this.settings);
		this.status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 1000);
		this.status.command = 'breezellIme.chooseLayout';
		this.status.show();
		const cmd = (id: string, fn: (...a: any[]) => unknown, quiet = false) => this.disposables.push(vscode.commands.registerCommand(id, (...a) => {
			if (!quiet) {
				this.log.info(`command ${id}`);
			}
			return this.run(() => fn(...a));
		}));
		cmd('breezellIme.toggle', async () => {
			await this.setEnabled(!this.enabled);
			vscode.window.setStatusBarMessage(l10n.t('Breezell IME: {0}', this.enabled ? this.layoutLabel : l10n.t('off')), 2500);
		});
		cmd('breezellIme.chooseLayout', () => this.chooseLayout());
		cmd('breezellIme.openSettings', () => this.settings.open());
		cmd('breezellIme.toggleScript', () => this.toggleScript());
		cmd('breezellIme.clearLearning', () => this.clearLearning());
		// The editor's keys while composing (package.json binds them).
		cmd('breezellIme.backspace', () => this.editorKey({ key: 'Backspace' }), true);
		cmd('breezellIme.cancel', () => this.editorKey({ key: 'Escape' }), true);
		cmd('breezellIme.enter', () => this.editorKey({ key: 'Enter' }), true);
		cmd('breezellIme.previous', () => this.editorKey({ key: 'ArrowUp' }), true);
		cmd('breezellIme.next', () => this.editorKey({ key: 'ArrowDown' }), true);
		cmd('breezellIme.pageUp', () => this.editorKey({ key: 'PageUp' }), true);
		cmd('breezellIme.pageDown', () => this.editorKey({ key: 'PageDown' }), true);
		cmd('breezellIme.select', (i: number) => this.editorPick(Number(i)), true);
		cmd('breezellIme.tab', () => this.acceptSuggestion(), true);
		// The chat box's keys (Breezell's chat input hands them over while the input method is on).
		cmd('breezellIme.chatKey', (a: ChatKey) => this.chatKey(a), true);
		// A key the chat box kept (Backspace, the arrows, Enter): what comes next follows from it.
		cmd('breezellIme.chatForget', (key?: string) => this.session?.passed({ key: typeof key === 'string' ? key : 'Escape' }), true);
		// A candidate clicked in the chat's panel.
		cmd('breezellIme.chatPick', (i: number) => this.chatPick(Number(i)), true);
		// Where Breezell's focus is: its editor or chat (the system input method steps aside there).
		this.disposables.push(vscode.commands.registerCommand('breezellIme.surface', (internal: boolean) => {
			this.surfaceInternal = !!internal;
			this.host?.updateFocus();
		}));
		if (this.config.get<boolean>('useSystemHost', true)) {
			// Windows: the system input method's text service runs in this process; report the focus.
			this.host = new HostClient(
				msg => this.log.info(msg),
				e => void this.run(() => this.followSystem(e)),
				process.platform === 'win32' ? () => ({ internal: this.surfaceInternal, focused: this.windowFocused, enabled: this.enabled }) : undefined,
			);
			this.disposables.push({ dispose: () => this.host?.dispose() });
		}
		this.disposables.push(
			vscode.window.onDidChangeTextEditorSelection(e => {
				if (this.editing) {
					return;
				}
				const s = this.session;
				if (e.kind === vscode.TextEditorSelectionChangeKind.Mouse && s?.composing) {
					void this.run(async () => { await s.reset(); await this.render(); });
					return;
				}
				// The caret moved (not by this plugin's own insert): the words offered go, and what
				// comes next does not follow the words just typed.
				const own = !!this.ownCaret && e.selections.length === 1 && e.selections[0].active.isEqual(this.ownCaret);
				if (!own && s && !s.composing) {
					void this.run(async () => {
						const offered = s.predicting;
						s.dropPredictions();
						if (e.kind !== undefined) {
							await s.passed({ key: 'ArrowLeft' });
						}
						if (offered) {
							await this.render();
						}
					});
				}
				this.updateStatus();
			}),
			vscode.workspace.onDidChangeTextDocument(e => {
				const s = this.session;
				if (this.editing || !e.contentChanges.length || e.document !== vscode.window.activeTextEditor?.document || !s || s.composing) {
					return;
				}
				// Text changed by something else. Deleted right where this plugin's last commit ended:
				// that commit was not what the user meant (Backspace); else what comes next starts afresh.
				const deletion = e.contentChanges.length === 1 && !e.contentChanges[0].text && !!this.ownCaret && e.contentChanges[0].range.end.isEqual(this.ownCaret);
				void this.run(async () => {
					const offered = s.predicting;
					if (deletion) {
						await s.deletedAfterCommit();
					}
					await s.passed({ key: deletion ? 'Backspace' : 'Escape' });
					if (offered) {
						await this.render();
					}
				});
			}),
			vscode.window.onDidChangeActiveTextEditor(() => void this.run(async () => { await this.session?.reset(); await this.render(); })),
			vscode.window.onDidChangeWindowState(e => {
				this.windowFocused = e.focused;
				this.host?.updateFocus();
			}),
			vscode.workspace.onDidChangeConfiguration(e => {
				// Settings that change what the composers are: they are made again when next needed.
				if (['dataPath', 'chineseScript', 'wubiSmartOrder'].some(name => e.affectsConfiguration(`breezellIme.${name}`))) {
					this.log.info('settings changed: composers reset');
					this.sessions.clear();
					if (e.affectsConfiguration('breezellIme.dataPath')) {
						this.chinese = this.japanese = this.korean = undefined;
					}
					this.session = undefined;
					if (this.enabled) {
						void this.run(() => this.ensureSession());
					}
					this.updateStatus();
				}
			}),
		);
		this.updateStatus();
	}

	private get config() {
		return vscode.workspace.getConfiguration('breezellIme');
	}

	private get pageSize(): number {
		return Math.max(3, Math.min(9, this.config.get<number>('pageSize', 7)));
	}

	/** The models: the setting, else where the system input method's config says, else the platform's place. */
	private get dataDir(): string {
		return this.config.get<string>('dataPath', '') || configuredDataDir();
	}

	private get traditional(): boolean {
		const s = this.config.get<string>('chineseScript', 'auto');
		if (s !== 'auto') {
			return s === 'traditional';
		}
		return /^zh-(tw|hk|mo|hant)/i.test(vscode.env.language);
	}

	private get layoutLabel(): string {
		return LAYOUTS.find(l => l.id === this.layout)?.label() ?? this.layout;
	}

	/** Runs actions one after another: keys arrive faster than edits finish. */
	private run<T>(fn: () => T | Promise<T>): Promise<T | undefined> {
		const next = this.queue.then(fn, fn).catch(e => {
			if (e instanceof NoData) {
				this.updateStatus();
				return undefined;
			}
			if (this.session?.composer instanceof RemoteComposer) {
				// The host went away (or did not answer): compose again, in a new host or here.
				this.log.warn(`system input method host: ${e?.message ?? e}`);
				for (const [key, s] of this.sessions) {
					if (s.composer instanceof RemoteComposer) {
						this.sessions.delete(key);
					}
				}
				this.session = undefined;
				void this.render();
				return undefined;
			}
			this.log.error(`${e?.stack ?? e}`);
			this.updateStatus();
			void vscode.window.showErrorMessage(l10n.t('Breezell IME: {0}', String(e?.message ?? e)));
			return undefined;
		});
		this.queue = next;
		return next;
	}

	// ------------------------------------------------------------ learning (when composing here)

	private model(name: string): AdaptiveModel {
		let m = this.adaptive.get(name);
		if (!m) {
			const file = this.learnFile(name);
			try {
				m = existsSync(file) ? AdaptiveModel.fromJSON(JSON.parse(readFileSync(file, 'utf8')) as AdaptiveSnapshot) : new AdaptiveModel();
			} catch {
				m = new AdaptiveModel();
			}
			this.adaptive.set(name, m);
		}
		return m;
	}

	private learnFile(name: string): string {
		const dir = this.context.globalStorageUri.fsPath;
		mkdirSync(dir, { recursive: true });
		return join(dir, `learned-${name}.json`);
	}

	saveLearning(): void {
		if (!this.config.get<boolean>('learning', true)) {
			return;
		}
		for (const [name, m] of this.adaptive) {
			try {
				writeFileSync(this.learnFile(name), JSON.stringify(m.toJSON()));
			} catch { /* next time */ }
		}
	}

	private committed(commit: string): void {
		if (commit && ++this.commitsSinceSave >= 20) {
			this.commitsSinceSave = 0;
			this.saveLearning();
		}
	}

	private async clearLearning(): Promise<void> {
		for (const m of this.adaptive.values()) {
			m.clear();
		}
		this.saveLearning();
		if (this.host && await this.host.connect(false)) {
			for (const name of ['zh', 'ja']) {
				await this.host.request('clear', 0, { name });
			}
		}
		void vscode.window.showInformationMessage(l10n.t('Breezell IME: learned words cleared.'));
	}

	/** Once: what this plugin learned before it composed in the host goes into the host's user model. */
	private async mergeLearningIntoHost(): Promise<void> {
		if (this.mergedLearning || !this.host || this.context.globalState.get<boolean>('learningMergedIntoHost')) {
			return;
		}
		this.mergedLearning = true;
		for (const name of ['zh', 'ja']) {
			const file = this.learnFile(name);
			if (!existsSync(file)) {
				continue;
			}
			try {
				const snapshot = JSON.parse(readFileSync(file, 'utf8')) as AdaptiveSnapshot;
				const r = await this.host.request('merge', 0, { name, snapshot }, 20000);
				if (!r.error) {
					renameSync(file, `${file}.merged`);
					this.log.info(`what was learned here (${name}) went into the system input method`);
				}
			} catch (e) {
				this.log.warn(`could not hand over what was learned (${name}): ${(e as Error)?.message ?? e}`);
				return;
			}
		}
		void this.context.globalState.update('learningMergedIntoHost', true);
	}

	// ------------------------------------------------------------ the composer

	/**
	 * The key session of the current input method: composing in the system input method's host
	 * when it runs or is installed (its models loaded once for the system and every window, one
	 * user model), else here, its models loaded the first time.
	 */
	private async ensureSession(): Promise<KeySession> {
		const pack = packOfLayout(this.layout);
		if (!hasPack(this.manifest, this.dataDir, pack)) {
			this.log.info(`no ${pack} models in ${this.dataDir}: the settings page offers them`);
			this.settings.open(pack);
			throw new NoData();
		}
		const smart = this.config.get<boolean>('wubiSmartOrder', false);
		const remote = this.host ? await this.host.connect() : false;
		const key = `${remote ? 'host' : 'here'}|${this.layout}|${this.traditional}|${smart}`;
		let s = this.sessions.get(key);
		if (!s && remote && this.host) {
			const r = new RemoteComposer(this.host, this.layout, this.traditional, smart);
			try {
				this.status.text = `$(loading~spin) ${l10n.t('Loading the input method…')}`;
				await r.open();
				await this.mergeLearningIntoHost();
				s = this.newSession(r);
				this.sessions.set(key, s);
				this.log.info(`composing in the system input method's host: ${key}`);
			} catch (e) {
				this.log.warn(`the system input method's host could not compose (${(e as Error)?.message ?? e}): composing here`);
			}
		}
		if (!s) {
			const localKey = `here|${this.layout}|${this.traditional}|${smart}`;
			s = this.sessions.get(localKey);
			if (!s) {
				s = this.newSession(new LocalComposer(await this.localComposer(smart)));
				this.sessions.set(localKey, s);
			}
		}
		this.session = s;
		this.updateStatus();
		return s;
	}

	private newSession(composer: AsyncComposer): KeySession {
		return new KeySession(composer, () => ({
			layout: this.layout,
			traditional: this.traditional,
			pageSize: this.pageSize,
			fullWidth: true,
			prediction: this.predictionHere && this.config.get<boolean>('prediction', true) && CHINESE.has(this.layout),
			english: false,
		}));
	}

	private async localComposer(smart: boolean): Promise<Composer> {
		this.status.text = `$(loading~spin) ${l10n.t('Loading the input method…')}`;
		await new Promise(r => setTimeout(r, 10));
		const dir = this.dataDir;
		const t0 = Date.now();
		this.log.info(`loading ${this.layout} from ${dir}`);
		let c: Composer;
		if (CHINESE.has(this.layout)) {
			this.chinese ??= new ChineseData(dir);
			c = new ChineseComposer(this.chinese, this.layout, this.traditional, this.model('zh'));
		} else if (this.layout === 'wubi') {
			this.chinese ??= new ChineseData(dir);
			c = new WubiComposer(this.chinese, smart, this.model('zh'));
		} else if (this.layout === 'japanese') {
			this.japanese ??= new JapaneseData(dir);
			c = new JapaneseComposer(this.japanese, this.model('ja'));
		} else {
			this.korean ??= new KoreanData(dir);
			c = new KoreanComposer(this.korean);
		}
		this.log.info(`loaded ${this.layout} in ${Date.now() - t0} ms`);
		return c;
	}

	private async setEnabled(on: boolean): Promise<void> {
		if (on === this.enabled) {
			return;
		}
		if (on) {
			await this.ensureSession();
			this.typeCommand = vscode.commands.registerCommand('type', args => this.run(() => this.onType(args?.text ?? '')));
		} else {
			if (this.session?.composing) {
				await this.insert(await this.session.commitHighlighted());
			}
			this.typeCommand?.dispose();
			this.typeCommand = undefined;
		}
		this.enabled = on;
		void vscode.commands.executeCommand('setContext', 'breezellIme.enabled', on);
		this.log.info(on ? `on: ${this.layout}` : 'off');
		this.host?.updateFocus();
		await this.render();
	}

	/**
	 * The system input method's state: native (on) or English (off); off when the system input
	 * method is no longer Breezell's here. The brief sign shows when this window's editor or chat has
	 * the focus (a Shift pressed here).
	 */
	private async followSystem(e: HostEvent): Promise<void> {
		const on = e.mode === 'n';
		if (on === this.enabled) {
			return;
		}
		this.log.info(e.tipGone ? 'system input method switched away: off' : `system input method: ${on ? 'native' : 'English'}`);
		await this.setEnabled(on);
		if (e.tipGone || !this.windowFocused || !this.surfaceInternal) {
			return;
		}
		if (await this.hasPanel()) {
			const sign = !this.enabled ? l10n.t('EN') : this.layout === 'japanese' ? 'あ' : this.layout === 'korean' ? '한' : '中';
			this.drawPanel({ reading: '', badge: '', candidates: [], highlight: -1, labels: 'none', more: false, prev: false, flash: sign });
		} else {
			vscode.window.setStatusBarMessage(l10n.t('Breezell IME: {0}', this.enabled ? this.layoutLabel : l10n.t('English')), 1500);
		}
	}

	private async chooseLayout(): Promise<void> {
		const items = LAYOUTS.map(l => ({ label: l.label(), description: l.id === this.layout ? l10n.t('current') : '', id: l.id }));
		items.push({ label: this.enabled ? l10n.t('Turn off (type English)') : l10n.t('Turn on'), description: TOGGLE_KEY, id: '__toggle' });
		items.push({ label: this.traditional ? l10n.t('Write Simplified Chinese') : l10n.t('Write Traditional Chinese (Taiwan)'), description: l10n.t('What pinyin and double pinyin write'), id: '__script' });
		items.push({ label: l10n.t('Settings and languages…'), description: '', id: '__settings' });
		const pick = await vscode.window.showQuickPick(items, { placeHolder: 'Breezell IME' });
		this.log.info(`picked ${pick?.id ?? '(nothing)'}`);
		if (!pick) {
			return;
		}
		if (pick.id === '__toggle') {
			return this.setEnabled(!this.enabled);
		}
		if (pick.id === '__script') {
			return this.toggleScript();
		}
		if (pick.id === '__settings') {
			return this.settings.open();
		}
		await this.setLayout(pick.id);
		if (!this.enabled) {
			await this.setEnabled(true);
		}
		void vscode.window.showInformationMessage(l10n.t('Breezell IME: {0}', this.layoutLabel));
	}

	/**
	 * The input method in use; for Chinese layouts, the system input method's too. A language not
	 * downloaded yet: the settings page says so (NoData), and the choice stands for when it is.
	 */
	private async setLayout(id: string): Promise<void> {
		if (!LAYOUTS.some(l => l.id === id)) {
			return;
		}
		await this.session?.reset();
		this.layout = id;
		void this.context.globalState.update('layout', id);
		if (id !== 'japanese' && id !== 'korean') {
			updateSharedConfig({ zhLayout: id });
			await this.host?.reloadConfig().catch(e => this.log.warn(`host: ${e?.message ?? e}`));
		}
		this.session = undefined;
		if (this.enabled) {
			await this.ensureSession();
		}
		await this.render();
	}

	/** Where the models are, from now on (the setting, if any, gives way to the settings page's choice). */
	private async setDataDir(dir: string): Promise<void> {
		updateSharedConfig({ dataPath: dir });
		if (this.config.get<string>('dataPath', '')) {
			await this.config.update('dataPath', undefined, vscode.ConfigurationTarget.Global);
		}
		await this.dataChanged();
	}

	private async setSharedSetting(key: string, value: unknown): Promise<void> {
		updateSharedConfig({ [key]: value });
		await this.host?.reloadConfig().catch(e => this.log.warn(`host: ${e?.message ?? e}`));
		this.sessions.clear();
		this.session = undefined;
		if (this.enabled) {
			await this.ensureSession();
		}
		await this.render();
	}

	/**
	 * The models changed on disk (or, `models` false, the system input method did): what is
	 * composing here and in the host starts again from them, and the input method turns off if
	 * its language is gone.
	 */
	private async dataChanged(models = true): Promise<void> {
		if (models) {
			this.chinese = this.japanese = this.korean = undefined;
			await this.host?.reloadConfig(true).catch(e => this.log.warn(`host: ${e?.message ?? e}`));
		}
		this.sessions.clear();
		this.session = undefined;
		if (this.enabled) {
			if (hasPack(this.manifest, this.dataDir, packOfLayout(this.layout))) {
				await this.ensureSession();
			} else {
				await this.setEnabled(false);
			}
		}
		await this.render();
	}

	/** First start with nothing downloaded: the page says what to do next. */
	welcome(): void {
		if (this.context.globalState.get<boolean>('welcomed')) {
			return;
		}
		void this.context.globalState.update('welcomed', true);
		if (!this.manifest.packs.some(p => hasPack(this.manifest, this.dataDir, p.id))) {
			this.settings.open();
		}
	}

	/** After the plugin updated: the system input method's parts follow, with no prompt. */
	refreshSystemParts(): void {
		const version = String((this.context.extension?.packageJSON as { version?: unknown } | undefined)?.version ?? '');
		if (version) {
			void refreshSystem(this.context.extensionPath, version, m => this.log.info(m)).catch(e => this.log.warn(`could not update the system input method: ${e?.message ?? e}`));
		}
	}

	private async toggleScript(): Promise<void> {
		const next = this.traditional ? 'simplified' : 'traditional';
		await this.config.update('chineseScript', next, vscode.ConfigurationTarget.Global);
		void vscode.window.showInformationMessage(l10n.t('Breezell IME: pinyin and double pinyin now write {0}.', next === 'traditional' ? l10n.t('Traditional Chinese (Taiwan)') : l10n.t('Simplified Chinese')));
	}

	// ------------------------------------------------------------ the editor

	/** Whether keys stay English at the editor's caret: code, outside comments and strings. */
	private englishHere(editor: vscode.TextEditor): boolean {
		if (!this.config.get<boolean>('englishInCode', true)) {
			return false;
		}
		const doc = editor.document;
		const pos = editor.selection.active;
		const line = doc.lineAt(pos.line).text.slice(0, pos.character);
		const before = doc.getText(new vscode.Range(new vscode.Position(Math.max(0, pos.line - 300), 0), pos));
		return englishAt(doc.languageId, line, before);
	}

	private textBefore(editor: vscode.TextEditor): string {
		const pos = editor.selection.active;
		const offset = editor.document.offsetAt(pos);
		return editor.document.getText(new vscode.Range(editor.document.positionAt(Math.max(0, offset - 4000)), pos));
	}

	/** Korean: the word before the caret on its line (what a suggestion replaces) and the words before it. */
	private wordBefore(editor: vscode.TextEditor): string {
		const pos = editor.selection.active;
		return /[가-힣]*$/.exec(editor.document.lineAt(pos.line).text.slice(0, pos.character))?.[0] ?? '';
	}

	private wordsBefore(editor: vscode.TextEditor): string[] {
		const pos = editor.selection.active;
		const before = editor.document.lineAt(pos.line).text.slice(0, pos.character);
		return before.split(/\s+/).filter(Boolean).slice(-3, before.endsWith(' ') ? undefined : -1);
	}

	private async insert(text: string): Promise<void> {
		const editor = vscode.window.activeTextEditor;
		if (!editor || !text) {
			return;
		}
		this.editing = true;
		try {
			await editor.edit(eb => {
				for (const sel of editor.selections) {
					eb.replace(sel, text);
				}
			}, { undoStopBefore: false, undoStopAfter: false });
		} finally {
			this.editing = false;
			this.ownCaret = editor.selection.active;
		}
		this.committed(text);
	}

	/** The editor types the key its own way (auto-closing pairs and all); its edit is no one else's. */
	private async typeAsIs(text: string): Promise<void> {
		this.editing = true;
		try {
			await vscode.commands.executeCommand('default:type', { text });
		} finally {
			this.editing = false;
			this.ownCaret = vscode.window.activeTextEditor?.selection.active;
		}
	}

	private async onType(text: string): Promise<void> {
		const editor = vscode.window.activeTextEditor;
		const s = this.session ?? (this.enabled ? await this.ensureSession() : undefined);
		// Pasted text, Enter, Tab and the like: what is being composed goes in first, then the editor's own typing.
		if (!editor || !s || text.length !== 1 || text < ' ') {
			if (s?.composing) {
				await this.insert(await s.commitHighlighted());
			}
			await this.typeAsIs(text);
			return this.render();
		}
		if (!s.composing && this.englishHere(editor)) {
			await s.passed({ key: text });
			await this.typeAsIs(text);
			return this.render();
		}
		this.predictionHere = true;
		const r = await s.key({ key: text, shift: SHIFT_DIGITS.includes(text) }, s.composing ? undefined : this.textBefore(editor));
		if (!r.eaten) {
			await this.typeAsIs(text);
		} else {
			await this.insert(r.commit);
			if (r.typeKey) {
				await this.typeAsIs(text);
			}
		}
		await this.render();
	}

	/** Backspace, Escape, Enter, the arrows, the pages while composing. */
	private async editorKey(k: Key): Promise<void> {
		const s = this.session;
		if (!s) {
			return;
		}
		const r = await s.key(k);
		if (!r.eaten && k.key === 'Backspace') {
			await vscode.commands.executeCommand('deleteLeft');
		}
		await this.insert(r.commit);
		if (r.typeKey && k.key === 'Enter') {
			await this.typeAsIs('\n');
		}
		await this.render();
	}

	/** A candidate picked by its place on the page (a click, zhuyin's Shift+digit). */
	private async editorPick(i: number): Promise<void> {
		const s = this.session;
		if (s) {
			await this.insert(await s.pick(i));
			await this.render();
		}
	}

	/** Tab: the first word offered after a commit, or the Korean suggestion. */
	private async acceptSuggestion(): Promise<void> {
		const s = this.session;
		if (s?.predicting) {
			return this.editorPick(0);
		}
		const editor = vscode.window.activeTextEditor;
		const word = this.suggestions[0];
		if (!editor || !s || !word) {
			return;
		}
		// The word replaces what of it is in the document and the syllable being built.
		const before = this.wordBefore(editor);
		await s.reset();
		const pos = editor.selection.active;
		this.editing = true;
		try {
			await editor.edit(eb => eb.replace(new vscode.Range(pos.translate(0, -before.length), pos), `${word} `));
		} finally {
			this.editing = false;
		}
		this.suggestions = [];
		await this.render();
	}

	private async hasPanel(): Promise<boolean> {
		if (this.panelCommand === undefined) {
			this.panelCommand = (await vscode.commands.getCommands(true)).includes('breezell.ime.panel');
			this.log.info(`candidate panel: ${this.panelCommand ? 'Breezell draws it' : 'text after the caret'}`);
		}
		return this.panelCommand;
	}

	/** Breezell's panel; if this Breezell refuses it, the candidates go after the caret from now on. */
	private drawPanel(panel: Panel | null): void {
		vscode.commands.executeCommand('breezell.ime.panel', panel).then(undefined, e => {
			this.log.warn(`candidate panel: ${e?.message ?? e}; text after the caret instead`);
			this.panelCommand = false;
			void this.run(() => this.render());
		});
	}

	/** What the panel shows: the page of candidates, the words offered after a commit, or the Korean suggestions. */
	private panelOf(v: KeyView | undefined): Panel | null {
		if (v && (v.composing || v.predicting) && v.candidates.length) {
			return { reading: v.reading, badge: v.badge, candidates: v.candidates, highlight: v.highlight, labels: v.labels, more: v.more, prev: v.prev, lang: v.lang };
		}
		if (v && this.suggestions.length) {
			return { reading: 'Tab ⇥', badge: v.badge, candidates: this.suggestions, highlight: 0, labels: 'none', more: false, prev: false, lang: v.lang };
		}
		return null;
	}

	/** Shows what is being composed and the panel (or the candidates as text after the caret). */
	private async render(): Promise<void> {
		const editor = vscode.window.activeTextEditor;
		const s = this.enabled ? this.session : undefined;
		const v = s ? await s.view() : undefined;
		this.suggestions = this.layout === 'korean' && editor && s ? await s.composer.suggestions(this.wordBefore(editor), this.wordsBefore(editor)) : [];
		const composing = !!v?.composing;
		void vscode.commands.executeCommand('setContext', 'breezellIme.composing', composing);
		void vscode.commands.executeCommand('setContext', 'breezellIme.navigating', composing && v!.candidates.length > 0);
		void vscode.commands.executeCommand('setContext', 'breezellIme.suggesting', this.suggestions.length > 0 || !!v?.predicting);
		void vscode.commands.executeCommand('setContext', 'breezellIme.shiftSelect', this.layout === 'zhuyin');
		const panel = editor ? this.panelOf(v) : null;
		if (await this.hasPanel() && (panel || this.panelShown)) {
			this.panelShown = !!panel;
			this.drawPanel(panel);
		}
		if (editor) {
			const at = new vscode.Range(editor.selection.active, editor.selection.active);
			editor.setDecorations(this.preeditDeco, composing && v!.preedit ? [{ range: at, renderOptions: { after: { contentText: v!.preedit } } }] : []);
			// Without Breezell's panel: the candidates as text after the caret.
			let line = '';
			if (!this.panelCommand && panel) {
				const mark = panel.labels === 'shift' ? '⇧' : '';
				line = ' ' + panel.candidates.map((t, i) => {
					const label = panel.labels === 'none' ? t : `${mark}${i + 1}.${t}`;
					return i === panel.highlight ? `【${label}】` : label;
				}).join('  ') + (panel.more ? '  ›' : '') + ' ';
			}
			editor.setDecorations(this.candDeco, line ? [{ range: at, renderOptions: { after: { contentText: line } } }] : []);
		}
		this.updateStatus();
	}

	private updateStatus(): void {
		const l = LAYOUTS.find(x => x.id === this.layout) ?? LAYOUTS[0];
		const script = CHINESE.has(this.layout) && this.layout !== 'zhuyin' ? (this.traditional ? '·繁' : '·簡') : '';
		const editor = vscode.window.activeTextEditor;
		const english = this.enabled && editor && !this.session?.composing && this.englishHere(editor);
		this.status.text = this.enabled ? `$(keyboard) ${l.short}${script}${english ? ` (${l10n.t('code: EN')})` : ''}` : `$(keyboard) ${l10n.t('EN')}`;
		this.status.tooltip = `${l10n.t('Breezell IME: {0}', this.enabled ? l.label() : l10n.t('off'))}\n${l10n.t('{0} turns it on or off, Ctrl+Alt+K chooses the input method', TOGGLE_KEY)}`;
	}

	// ------------------------------------------------------------ the chat

	/**
	 * A key typed in the chat box: what to insert there, and the panel. The chat is prose, so the
	 * native language always; the conversation before is the context.
	 */
	private async chatKey(a: ChatKey): Promise<ChatAnswer> {
		const key = a?.key ?? '';
		if (!this.enabled) {
			return { handled: false, commit: key.length === 1 ? key : '', preedit: '', candidates: [], highlight: 0, composing: false, pageStart: 0 };
		}
		const s = await this.ensureSession();
		this.predictionHere = true;
		const r = await s.key({ key, shift: a.shift, digit: a.digit }, a.context);
		if (!r.eaten) {
			// The chat box takes it: a character goes in as typed (the bridge held it back), Backspace deletes.
			return { ...(await this.chatAnswer(s, key.length === 1 ? key : '')), handled: key.length === 1 };
		}
		return this.chatAnswer(s, r.commit + (r.typeKey && key.length === 1 ? key : ''));
	}

	/** The chat box's answer: what to insert, and the panel. */
	private async chatAnswer(s: KeySession, commit: string): Promise<ChatAnswer> {
		this.committed(commit);
		const v = await s.view();
		return {
			handled: true, commit, preedit: v.preedit, composing: v.composing, predicting: v.predicting,
			candidates: v.composing || v.predicting ? v.candidates : [], highlight: v.highlight, pageStart: v.pageStart,
			labels: v.labels, more: v.more, reading: v.reading, badge: v.badge, prev: v.prev, lang: v.lang,
		};
	}

	/** A candidate clicked in the chat's panel (its place on the page). */
	private async chatPick(i: number): Promise<ChatAnswer | undefined> {
		const s = this.session;
		if (!this.enabled || !s) {
			return undefined;
		}
		return this.chatAnswer(s, await s.pick(i));
	}

	dispose(): void {
		this.saveLearning();
		this.log.dispose();
		this.typeCommand?.dispose();
		this.preeditDeco.dispose();
		this.candDeco.dispose();
		this.status.dispose();
		for (const d of this.disposables) {
			d.dispose();
		}
	}
}

export function activate(context: vscode.ExtensionContext): void {
	const ime = new Ime(context);
	context.subscriptions.push(ime);
	ime.welcome();
	ime.refreshSystemParts();
}

export function deactivate(): void { /* the Ime is disposed with the context */ }
