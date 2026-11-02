import * as vscode from 'vscode';
import { petStrings } from './strings';

/*
 * The plugin's code keeps what the pet must not forget: how it has grown, across windows and restarts.
 * The pet itself is the page (page/main.ts), which Breezell floats on the chat box and which works
 * without this, only forgetting.
 */

const PROGRESS_KEY = 'deskPet.progress';
const SURFACE = 'pet';

export function activate(context: vscode.ExtensionContext): void {
	const config = () => vscode.workspace.getConfiguration('deskPet');
	const setVisible = (visible: boolean) => config().update('visible', visible, vscode.ConfigurationTarget.Global);
	context.subscriptions.push(vscode.commands.registerCommand('deskPet.toggle', () => setVisible(config().get<boolean>('visible', true) === false)));

	const breezell = vscode.breezell;
	if (!breezell?.ui) {
		return; // another editor, or a Breezell from before companions
	}

	const open = new Set<vscode.breezell.PluginSurface>();
	// It says hello when a window opens, not at every conversation it is drawn for.
	let greeted = false;
	const settings = () => ({ visible: config().get('visible', true), size: config().get('size', 'medium'), speech: config().get('speech', true) });
	const tellAll = (message: unknown, except?: vscode.breezell.PluginSurface) => {
		for (const surface of open) {
			if (surface !== except) {
				void surface.postMessage(message);
			}
		}
	};

	context.subscriptions.push(
		vscode.workspace.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration('deskPet')) {
				tellAll({ type: 'settings', settings: settings() });
			}
		}),
		breezell.ui.onDidOpenSurface(surface => {
			if (surface.surfaceId !== SURFACE) {
				return;
			}
			open.add(surface);
			const init = () => {
				const greet = !greeted;
				greeted = true;
				void surface.postMessage({ type: 'init', progress: context.globalState.get(PROGRESS_KEY), settings: settings(), greet });
			};
			const listening = surface.onDidReceiveMessage(message => {
				const m = (message ?? {}) as { hello?: unknown; save?: unknown; hide?: unknown };
				if (m.hello) {
					init();
				} else if (m.save) {
					void context.globalState.update(PROGRESS_KEY, m.save);
					tellAll({ type: 'progress', progress: m.save }, surface);
				} else if (m.hide) {
					void setVisible(false);
					void vscode.window.showInformationMessage(petStrings(breezell.language).hidden);
				}
			});
			surface.onDidClose(() => {
				open.delete(surface);
				listening.dispose();
			});
			init();
		}),
	);
}
