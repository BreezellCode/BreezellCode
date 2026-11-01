/**
 * The settings page: which languages are on this computer (the download from the plugin's GitHub
 * release), how typing behaves, and the input method for the whole computer. The page itself is
 * media/settings.js: it draws what this file posts and asks for what the user does.
 */
import { randomBytes } from 'node:crypto';
import * as vscode from 'vscode';
import { DataError, DataManifest, downloadPack, hasPack, PackId, packOfLayout, packSize, packState, PackState, removePack } from './data.js';
import { displayLanguage, l10n } from './l10n.js';
import { installSystem, profileFor, SystemCancelled, systemState, uninstallSystem } from './system.js';

/** What the page changes in the input method. */
export interface ImeControls {
	readonly layout: string;
	readonly traditional: boolean;
	readonly dataDir: string;
	readonly toggleKey: string;
	layouts(): readonly { id: string; label: string }[];
	setLayout(id: string): Promise<void>;
	setDataDir(dir: string): Promise<void>;
	/** A setting the system input method's host also reads. */
	setSharedSetting(key: 'learning' | 'wubiSmartOrder' | 'pageSize', value: unknown): Promise<void>;
	clearLearning(): Promise<void>;
	/** The models changed on disk. */
	dataChanged(): Promise<void>;
	systemChanged(): Promise<void>;
	showLog(): void;
}

interface Download {
	readonly controller: AbortController;
	received: number;
	total: number;
	bytesPerSecond: number;
}

/** A message from the page. */
type Ask =
	| { type: 'ready' }
	| { type: 'download' | 'cancel' | 'remove'; pack: PackId }
	| { type: 'chooseFolder' | 'installSystem' | 'uninstallSystem' | 'clearLearning' | 'showLog' }
	| { type: 'layout'; id: string }
	| { type: 'set'; key: string; value: unknown };

const PACKS: readonly PackId[] = ['chinese', 'japanese', 'korean'];

export class SettingsPage implements vscode.Disposable {
	private panel?: vscode.WebviewPanel;
	private readonly downloads = new Map<PackId, Download>();
	private readonly states = new Map<PackId, PackState | 'checking'>();
	private readonly errors = new Map<PackId, string>();
	private systemBusy: '' | 'installing' | 'removing' = '';
	/** Setting up after the install: what is going on, for the top of the page. */
	private setup: '' | 'asking' | 'downloading' = '';
	/** What to do once the language the input method needs is here (it turns on). */
	private whenReady?: { pack: PackId; run: () => Promise<void> };
	private systemError = '';
	private checks = 0;
	private postTimer?: NodeJS.Timeout;

	constructor(
		private readonly context: vscode.ExtensionContext,
		private readonly manifest: DataManifest,
		private readonly ime: ImeControls,
	) { }

	private get config() {
		return vscode.workspace.getConfiguration('breezellIme');
	}

	/** Shows the page; `need`: why (the pack the input method chose needs), said at the top. */
	open(need?: PackId): void {
		if (this.panel) {
			this.panel.reveal();
		} else {
			const media = vscode.Uri.joinPath(this.context.extensionUri, 'media');
			this.panel = vscode.window.createWebviewPanel('breezellIme.settings', l10n.t('Breezell IME'), vscode.ViewColumn.Active, {
				enableScripts: true, retainContextWhenHidden: true, localResourceRoots: [media],
			});
			this.panel.iconPath = vscode.Uri.joinPath(media, 'icon.png');
			this.panel.webview.html = this.html(this.panel.webview, media);
			this.panel.webview.onDidReceiveMessage((m: Ask) => void this.answer(m).catch(e => void vscode.window.showErrorMessage(l10n.t('Breezell IME: {0}', String((e as Error)?.message ?? e)))));
			this.panel.onDidDispose(() => { this.panel = undefined; });
		}
		if (need) {
			this.needed = need;
		}
		void this.check();
		this.post();
	}

	private needed?: PackId;

	/**
	 * The first start after the plugin is installed: nothing more for the user to do but answer
	 * Windows' prompt. That comes first, so the rest needs nobody. The input method on Windows
	 * waits for the models by itself, leaving keys to the programs until they are here.
	 */
	async firstRun(pack: PackId, ready: () => Promise<void>): Promise<void> {
		this.whenReady = { pack, run: ready };
		this.open();
		// A moment for the page to show: it says why Windows is about to ask.
		const system = systemState();
		if (system.supported && !system.installed) {
			this.setup = 'asking';
			this.post();
			await new Promise(r => setTimeout(r, 1200));
			await this.installSystemNow();
			this.setup = '';
		}
		if (!hasPack(this.manifest, this.ime.dataDir, pack)) {
			this.setup = 'downloading';
			this.setupPack = pack;
			this.post();
			await this.download(pack);
			this.setup = '';
			this.post();
			return;  // Ready, or the page shows why not and Download tries again.
		}
		await this.finishSetup();
	}

	private setupPack?: PackId;

	/** The language is here: the input method turns on, and the user hears it is ready. */
	private async finishSetup(): Promise<void> {
		const w = this.whenReady;
		if (!w || !hasPack(this.manifest, this.ime.dataDir, w.pack)) {
			return;
		}
		this.whenReady = undefined;
		await w.run();
		const everywhere = systemState().installed;
		void vscode.window.showInformationMessage(everywhere
			? l10n.t('Breezell IME is ready in every program. {0} turns it off here.', this.ime.toggleKey)
			: l10n.t('Breezell IME is ready. {0} turns it off.', this.ime.toggleKey));
		this.post();
	}

	/** What each pack is on this computer (a first look hashes what was never hashed: in the background). */
	private async check(): Promise<void> {
		const run = ++this.checks;
		const dir = this.ime.dataDir;
		for (const id of PACKS) {
			if (!this.downloads.has(id)) {
				this.states.set(id, hasPack(this.manifest, dir, id) ? 'checking' : 'missing');
			}
		}
		this.post();
		for (const id of PACKS) {
			if (this.downloads.has(id) || this.states.get(id) === 'missing') {
				continue;
			}
			const state = await packState(this.manifest, dir, id).catch(() => 'missing' as const);
			if (run !== this.checks) {
				return;
			}
			this.states.set(id, state);
			this.post();
		}
	}

	private async answer(m: Ask): Promise<void> {
		switch (m.type) {
			case 'ready': this.post(); return;
			case 'download': return this.download(m.pack);
			case 'cancel': this.downloads.get(m.pack)?.controller.abort(); return;
			case 'remove': return this.remove(m.pack);
			case 'chooseFolder': return this.chooseFolder();
			case 'installSystem': return this.installSystem();
			case 'uninstallSystem': return this.uninstallSystem();
			case 'clearLearning': return this.clearLearning();
			case 'showLog': this.ime.showLog(); return;
			case 'layout':
				await this.ime.setLayout(String(m.id));
				this.post();
				return;
			case 'set': return this.setting(m.key, m.value);
		}
	}

	private async setting(key: string, value: unknown): Promise<void> {
		if (key === 'chineseScript' || key === 'englishInCode' || key === 'displayLanguage' || key === 'prediction') {
			await this.config.update(key, value, vscode.ConfigurationTarget.Global);
		} else if (key === 'learning' || key === 'wubiSmartOrder' || key === 'pageSize') {
			await this.config.update(key, value, vscode.ConfigurationTarget.Global);
			await this.ime.setSharedSetting(key, value);
		}
		this.post();
	}

	private async download(id: PackId): Promise<void> {
		if (this.downloads.has(id)) {
			return;
		}
		const pack = this.manifest.packs.find(p => p.id === id);
		if (!pack) {
			return;
		}
		const d: Download = { controller: new AbortController(), received: 0, total: packSize(pack), bytesPerSecond: 0 };
		this.downloads.set(id, d);
		this.errors.delete(id);
		this.post();
		try {
			await downloadPack(this.manifest, id, this.ime.dataDir, {
				base: this.config.get<string>('dataMirror', '').trim() || undefined,
				signal: d.controller.signal,
				onProgress: p => {
					d.received = p.received;
					d.total = p.total;
					d.bytesPerSecond = p.bytesPerSecond;
					this.postSoon();
				},
			});
			this.downloads.delete(id);
			this.states.set(id, 'ready');
			if (this.needed === id) {
				this.needed = undefined;
			}
			await this.ime.dataChanged();
			if (this.whenReady?.pack === id) {
				await this.finishSetup();
			} else {
				void vscode.window.showInformationMessage(l10n.t('Breezell IME: {0} is ready.', this.packName(id)));
			}
		} catch (e) {
			this.downloads.delete(id);
			if (e instanceof DataError && e.kind === 'cancelled') {
				this.errors.delete(id);
			} else {
				this.errors.set(id, this.failure(e));
			}
			void this.check();
		}
		this.post();
	}

	private failure(e: unknown): string {
		if (e instanceof DataError) {
			switch (e.kind) {
				case 'space': return l10n.t('Not enough free disk space in this folder.');
				case 'checksum': return l10n.t('A downloaded file did not match its checksum. Try again, or check the mirror setting.');
				case 'address': return l10n.t('The mirror setting needs an https address.');
				default: return l10n.t('The download stopped: {0}. Download goes on from where it stopped.', e.message);
			}
		}
		return String((e as Error)?.message ?? e);
	}

	private async remove(id: PackId): Promise<void> {
		const yes = l10n.t('Remove');
		const answer = await vscode.window.showWarningMessage(l10n.t('Remove {0} from this computer? You can download it again at any time.', this.packName(id)), { modal: true }, yes);
		if (answer !== yes) {
			return;
		}
		removePack(this.manifest, id, this.ime.dataDir);
		this.errors.delete(id);
		await this.ime.dataChanged();
		await this.check();
	}

	private async chooseFolder(): Promise<void> {
		const picked = await vscode.window.showOpenDialog({ canSelectFolders: true, canSelectFiles: false, canSelectMany: false, openLabel: l10n.t('Use this folder') });
		if (!picked?.[0]) {
			return;
		}
		await this.ime.setDataDir(picked[0].fsPath);
		await this.check();
	}

	private async installSystem(): Promise<void> {
		const yes = l10n.t('Install');
		const answer = await vscode.window.showInformationMessage(
			l10n.t('Install Breezell IME in Windows?'),
			{ modal: true, detail: l10n.t('Windows will ask for administrator permission to register it. It becomes your default input method; Win+Space switches to another, and you can remove it here.') },
			yes,
		);
		if (answer !== yes) {
			return;
		}
		if (await this.installSystemNow()) {
			void vscode.window.showInformationMessage(l10n.t('Breezell IME is installed, and on in every program.'));
		}
	}

	/** Windows' prompt, then the input method for the whole computer. True when it is installed. */
	private async installSystemNow(): Promise<boolean> {
		let done = false;
		this.systemBusy = 'installing';
		this.systemError = '';
		this.post();
		try {
			await installSystem({
				extensionPath: this.context.extensionPath,
				exe: process.execPath,
				dataDir: this.ime.dataDir,
				profile: profileFor(this.ime.layout, this.ime.traditional),
				version: String((this.context.extension.packageJSON as { version?: unknown }).version ?? ''),
			});
			await this.ime.systemChanged();
			done = true;
		} catch (e) {
			if (!(e instanceof SystemCancelled)) {
				this.systemError = String((e as Error)?.message ?? e);
			}
		}
		this.systemBusy = '';
		this.post();
		return done;
	}

	private async uninstallSystem(): Promise<void> {
		const yes = l10n.t('Remove');
		const answer = await vscode.window.showWarningMessage(
			l10n.t('Remove Breezell IME from Windows?'),
			{ modal: true, detail: l10n.t('Windows will ask for administrator permission. The downloaded languages and what it learned stay, for use in Breezell.') },
			yes,
		);
		if (answer !== yes) {
			return;
		}
		this.systemBusy = 'removing';
		this.systemError = '';
		this.post();
		try {
			await uninstallSystem(this.context.extensionPath);
			await this.ime.systemChanged();
		} catch (e) {
			if (!(e instanceof SystemCancelled)) {
				this.systemError = String((e as Error)?.message ?? e);
			}
		}
		this.systemBusy = '';
		this.post();
	}

	private async clearLearning(): Promise<void> {
		const yes = l10n.t('Clear');
		const answer = await vscode.window.showWarningMessage(l10n.t('Forget every word Breezell IME has learned from you?'), { modal: true }, yes);
		if (answer === yes) {
			await this.ime.clearLearning();
		}
	}

	private packName(id: PackId): string {
		return id === 'chinese' ? l10n.t('Chinese') : id === 'japanese' ? l10n.t('Japanese') : l10n.t('Korean');
	}

	private packUse(id: PackId): string {
		return id === 'chinese' ? l10n.t('Pinyin, double pinyin, zhuyin and wubi')
			: id === 'japanese' ? l10n.t('Romaji to kana and kanji')
				: l10n.t('2-set Hangul with word suggestions');
	}

	/** Progress comes many times a second; the page needs a few. */
	private postSoon(): void {
		this.postTimer ??= setTimeout(() => {
			this.postTimer = undefined;
			this.post();
		}, 250);
	}

	/** The display language changed: the page says everything again. */
	retranslate(): void {
		if (this.panel) {
			this.panel.title = l10n.t('Breezell IME');
			this.post();
		}
	}

	private post(): void {
		if (!this.panel) {
			return;
		}
		const inUse = packOfLayout(this.ime.layout);
		const system = systemState();
		void this.panel.webview.postMessage({
			type: 'state',
			strings: this.strings(),
			needed: this.needed && !hasPack(this.manifest, this.ime.dataDir, this.needed) ? this.packName(this.needed) : '',
			setup: this.setup === 'asking' ? l10n.t('Setting up: Windows will ask for permission to add the input method to every program.')
				: this.setup === 'downloading' && this.setupPack ? l10n.t('Setting up: downloading {0}. You can keep working; it turns on by itself when this finishes.', this.packName(this.setupPack))
					: '',
			dataDir: this.ime.dataDir,
			packs: PACKS.map(id => {
				const pack = this.manifest.packs.find(p => p.id === id)!;
				const d = this.downloads.get(id);
				return {
					id, name: this.packName(id), use: this.packUse(id), size: packSize(pack), inUse: id === inUse,
					state: d ? 'downloading' : this.states.get(id) ?? 'checking',
					received: d?.received ?? 0, total: d?.total ?? packSize(pack), bytesPerSecond: d?.bytesPerSecond ?? 0,
					error: this.errors.get(id) ?? '',
				};
			}),
			layouts: this.ime.layouts(),
			layout: this.ime.layout,
			displayLanguage: this.config.get<string>('displayLanguage', 'auto'),
			chineseScript: this.config.get<string>('chineseScript', 'auto'),
			pageSize: this.config.get<number>('pageSize', 7),
			englishInCode: this.config.get<boolean>('englishInCode', true),
			prediction: this.config.get<boolean>('prediction', true),
			learning: this.config.get<boolean>('learning', true),
			wubiSmartOrder: this.config.get<boolean>('wubiSmartOrder', false),
			toggleKey: this.ime.toggleKey,
			system: { ...system, busy: this.systemBusy, error: this.systemError },
		});
	}

	private strings(): Record<string, string> {
		return {
			lede: l10n.t('Type Chinese, Japanese or Korean in Breezell, knowing your code and your conversation.'),
			languages: l10n.t('Languages'),
			languagesNote: l10n.t('The dictionaries and language models are large, so each language downloads on its own, from this plugin\'s GitHub release.'),
			needs: l10n.t('The input method you chose needs {0}. Download it below.'),
			download: l10n.t('Download'),
			update: l10n.t('Update'),
			cancel: l10n.t('Cancel'),
			remove: l10n.t('Remove'),
			ready: l10n.t('Ready'),
			checking: l10n.t('Checking…'),
			outdated: l10n.t('A newer version is available'),
			missing: l10n.t('Not downloaded'),
			inUse: l10n.t('In use'),
			folder: l10n.t('Folder'),
			change: l10n.t('Change…'),
			typing: l10n.t('Typing'),
			pageLanguage: l10n.t('Language of this page'),
			layout: l10n.t('Input method'),
			script: l10n.t('Chinese script'),
			scriptAuto: l10n.t('Follow Breezell\'s display language'),
			scriptSimplified: l10n.t('Simplified Chinese'),
			scriptTraditional: l10n.t('Traditional Chinese (Taiwan)'),
			scriptNote: l10n.t('Zhuyin always writes Traditional Chinese.'),
			pageSize: l10n.t('Candidates per page'),
			englishInCode: l10n.t('English in code'),
			englishInCodeNote: l10n.t('In code, type English outside comments and strings; in comments, strings, or after /// on the line, type your own language.'),
			prediction: l10n.t('Word predictions'),
			predictionNote: l10n.t('After you commit Chinese text, offer the words that may come next (Tab takes the first); in Korean, words as you type. They go after a few seconds or when you click elsewhere. Off: you just type, and nothing is offered.'),
			wubiSmartOrder: l10n.t('Wubi: order by context'),
			wubiSmartOrderNote: l10n.t('Order candidates with the same code by the text around them. Off: a fixed order.'),
			learning: l10n.t('Learn from me'),
			learningNote: l10n.t('Remember the words you pick and the new words you type.'),
			clearLearning: l10n.t('Clear learned words'),
			everywhere: l10n.t('Every program on this computer'),
			everywhereNote: l10n.t('Installs Breezell IME as a Windows input method, so it works in every program with the same engine and the same learned words. Inside Breezell\'s editor and chat, the plugin keeps the keys.'),
			notSupported: l10n.t('Not available on this system yet. The input method works in Breezell\'s editor.'),
			install: l10n.t('Install in Windows…'),
			uninstall: l10n.t('Remove from Windows…'),
			installed: l10n.t('Installed'),
			notInstalled: l10n.t('Not installed'),
			installing: l10n.t('Installing… Windows may be asking for permission.'),
			removing: l10n.t('Removing… Windows may be asking for permission.'),
			keys: l10n.t('Keys'),
			keysOn: l10n.t('Turn on or off'),
			keysLayout: l10n.t('Choose the input method'),
			keysPick: l10n.t('Space or a digit picks a candidate (zhuyin: Shift+digit), Enter commits what you typed, Esc drops it.'),
			privacy: l10n.t('Nothing you type leaves this computer. The plugin connects only to download the languages you choose.'),
			showLog: l10n.t('Show log'),
			speed: l10n.t('{0}/s'),
		};
	}

	private html(webview: vscode.Webview, media: vscode.Uri): string {
		const nonce = randomBytes(16).toString('hex');
		const css = webview.asWebviewUri(vscode.Uri.joinPath(media, 'settings.css'));
		const js = webview.asWebviewUri(vscode.Uri.joinPath(media, 'settings.js'));
		return `<!doctype html>
<html lang="${displayLanguage()}">
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; script-src 'nonce-${nonce}'; img-src ${webview.cspSource}">
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="stylesheet" href="${css}">
<title>Breezell IME</title>
</head>
<body>
<main id="page" class="page" aria-live="off"></main>
<script nonce="${nonce}" src="${js}"></script>
</body>
</html>`;
	}

	dispose(): void {
		clearTimeout(this.postTimer);
		for (const d of this.downloads.values()) {
			d.controller.abort();
		}
		this.panel?.dispose();
	}
}
