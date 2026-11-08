import * as vscode from 'vscode';
import { Island } from './island';
import { IslandLook } from './logic';

/*
 * Activity Island: Breezell's title bar shows what the agent is doing in a capsule that morphs,
 * and when you leave Breezell the capsule flies out to the top of the screen, above every app,
 * and back into the title bar when you return. The pages (page/) draw it; src/island.ts moves it.
 */

const SECTION = 'activityIsland';

const lookOf = (kind: vscode.ColorThemeKind): IslandLook =>
	kind === vscode.ColorThemeKind.Light ? 'light'
		: kind === vscode.ColorThemeKind.HighContrast ? 'highContrast'
			: kind === vscode.ColorThemeKind.HighContrastLight ? 'highContrastLight'
				: 'dark';

export function activate(context: vscode.ExtensionContext): void {
	const breezell = vscode.breezell;
	// Another editor, or a Breezell from before the island's API.
	if (!breezell?.ui || !breezell.activity || !breezell.windows?.overlaySupported || !breezell.windows.broadcast || !breezell.app?.focus) {
		return;
	}
	const output = vscode.window.createOutputChannel('Activity Island', { log: true });
	const config = () => vscode.workspace.getConfiguration(SECTION);
	const settings = new vscode.EventEmitter<void>();
	const look = new vscode.EventEmitter<void>();
	context.subscriptions.push(
		output, settings, look,
		vscode.workspace.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(SECTION) || e.affectsConfiguration('workbench.reduceMotion')) {
				settings.fire();
			}
		}),
		vscode.window.onDidChangeActiveColorTheme(() => look.fire()),
		vscode.workspace.onDidChangeWorkspaceFolders(() => look.fire()),
	);
	const island = new Island({
		api: breezell,
		floatOutside: () => config().get<boolean>('floatOutside', true) !== false,
		onDidChangeSettings: settings.event,
		look: () => lookOf(vscode.window.activeColorTheme.kind),
		onDidChangeLook: look.event,
		title: () => vscode.workspace.name,
		reduceMotion: () => vscode.workspace.getConfiguration('workbench').get<string>('reduceMotion') === 'on',
		memento: context.globalState,
		note: text => void vscode.window.showInformationMessage(text),
		log: text => output.info(text),
		delay: ms => new Promise(resolve => setTimeout(resolve, ms)),
		now: () => Date.now(),
		later: (ms, run) => {
			const handle = setTimeout(run, ms);
			return { dispose: () => clearTimeout(handle) };
		},
	});
	context.subscriptions.push({ dispose: () => island.dispose() });
	void island.start().catch(err => output.error(`could not start: ${err instanceof Error ? err.message : String(err)}`));
}
