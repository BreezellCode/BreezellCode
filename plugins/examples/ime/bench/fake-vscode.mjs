// The little of the vscode API the input method plugin uses, for running it outside Breezell
// (bench/plugin-smoke.mjs): one editor over a text, commands, settings, events, a log.
const registry = new Map();
const listeners = { selection: [], document: [], editor: [], window: [], config: [] };
const on = name => fn => { listeners[name].push(fn); return { dispose() { } }; };
export const calls = [];
/** What a modal dialog answers (the test sets it). */
export let dialogAnswer;
export const setDialogAnswer = a => { dialogAnswer = a; };
export const settings = {};

export class Position {
	constructor(line, character) { this.line = line; this.character = character; }
	isEqual(o) { return o && o.line === this.line && o.character === this.character; }
	translate(dl = 0, dc = 0) { return new Position(this.line + dl, this.character + dc); }
}
export class Range {
	constructor(start, end) { this.start = start; this.end = end; }
}
export class ThemeColor { constructor(id) { this.id = id; } }
export const StatusBarAlignment = { Left: 1, Right: 2 };
export const ConfigurationTarget = { Global: 1 };
export const TextEditorSelectionChangeKind = { Keyboard: 1, Mouse: 2, Command: 3 };

/** A document of one or more lines; the caret is a Position. */
export class FakeEditor {
	constructor(text, languageId = 'markdown') {
		this.text = text;
		const lines = text.split('\n');
		this.selection = { active: new Position(lines.length - 1, lines[lines.length - 1].length) };
		this.selections = [this.selection];
		const self = this;
		this.document = {
			languageId,
			get text() { return self.text; },
			offsetAt(p) { const ls = self.text.split('\n'); let o = 0; for (let i = 0; i < p.line; i++) o += ls[i].length + 1; return o + p.character; },
			positionAt(o) { const ls = self.text.split('\n'); let line = 0; while (line < ls.length - 1 && o > ls[line].length) { o -= ls[line].length + 1; line++; } return new Position(line, o); },
			getText(r) { return r ? self.text.slice(this.offsetAt(r.start), this.offsetAt(r.end)) : self.text; },
			lineAt(l) { return { text: self.text.split('\n')[l] }; },
		};
	}
	insertAtCaret(t) {
		const o = this.document.offsetAt(this.selection.active);
		this.text = this.text.slice(0, o) + t + this.text.slice(o);
		this.selection = { active: this.document.positionAt(o + t.length) };
		this.selections = [this.selection];
	}
	async edit(cb) {
		const edits = [];
		cb({ replace: (sel, t) => edits.push(t) });
		for (const t of edits) this.insertAtCaret(t);
		for (const fn of listeners.document) fn({ document: this.document, contentChanges: [{ text: edits.join(''), range: new Range(this.selection.active, this.selection.active) }] });
		return true;
	}
	setDecorations(type, items) { calls.push(['decoration', items.map(i => i.renderOptions?.after?.contentText ?? '')]); }
}

export const window = {
	activeTextEditor: undefined,
	state: { focused: true },
	createTextEditorDecorationType: () => ({ dispose() { } }),
	createStatusBarItem: () => ({ show() { }, dispose() { }, text: '', tooltip: '', command: '' }),
	createOutputChannel: () => ({ info: m => calls.push(['log', m]), warn: m => calls.push(['warn', m]), error: m => calls.push(['error', m]), dispose() { } }),
	showQuickPick: async () => undefined,
	/** The settings page: what it was told last, and how it asks. */
	createWebviewPanel: () => {
		const listeners = [];
		const panel = {
			webview: {
				html: '', cspSource: 'fake:',
				asWebviewUri: u => u.fsPath,
				posted: [],
				postMessage: async m => { panel.webview.posted.push(m); return true; },
				onDidReceiveMessage: fn => { listeners.push(fn); return { dispose() { } }; },
			},
			ask: m => Promise.all(listeners.map(fn => fn(m))),
			reveal() { calls.push(['reveal']); },
			onDidDispose: () => ({ dispose() { } }),
			dispose() { },
		};
		calls.push(['webview', panel]);
		return panel;
	},
	showWarningMessage: async (m, ...items) => { calls.push(['warning', m]); return dialogAnswer; },
	showOpenDialog: async () => undefined,
	showInformationMessage: async m => { calls.push(['info', m]); return dialogAnswer; },
	showErrorMessage: m => calls.push(['error', m]),
	setStatusBarMessage: () => ({ dispose() { } }),
	onDidChangeTextEditorSelection: on('selection'),
	onDidChangeActiveTextEditor: on('editor'),
	onDidChangeWindowState: on('window'),
};
export const workspace = {
	getConfiguration: () => ({ get: (k, d) => (k in settings ? settings[k] : d), update: async (k, v) => { settings[k] = v; } }),
	onDidChangeTextDocument: on('document'),
	onDidChangeConfiguration: on('config'),
};
export const env = { language: 'zh-tw' };
const format = (t, args) => t.replace(/\{(\d+)\}/g, (m, i) => args[i] ?? m);
export const l10n = { t: (message, ...args) => format(message, args) };
export const ViewColumn = { Active: -1 };
export const Uri = {
	joinPath: (base, ...parts) => ({ fsPath: [base.fsPath, ...parts].join('/') }),
	file: fsPath => ({ fsPath }),
};
export const commands = {
	registerCommand(id, fn) { registry.set(id, fn); return { dispose() { if (registry.get(id) === fn) registry.delete(id); } }; },
	async executeCommand(id, ...args) {
		if (id === 'default:type') { window.activeTextEditor.insertAtCaret(args[0].text); return; }
		if (id === 'deleteLeft') { const e = window.activeTextEditor; const o = e.document.offsetAt(e.selection.active); e.text = e.text.slice(0, o - 1) + e.text.slice(o); e.selection = { active: e.document.positionAt(o - 1) }; return; }
		if (id === 'setContext') return;
		if (id === 'breezell.ime.panel') { calls.push(['panel', args[0]]); return; }
		const fn = registry.get(id);
		if (!fn) throw new Error(`command '${id}' not found`);
		return fn(...args);
	},
	async getCommands() { return [...registry.keys(), 'breezell.ime.panel']; },
};
