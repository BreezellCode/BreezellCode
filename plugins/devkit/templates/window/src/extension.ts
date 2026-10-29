import * as vscode from 'vscode';

/**
 * Opens the window declared in package.json (contributes.breezell.windows) and talks to its
 * page: the page sends with `breezell.postMessage`, the plugin answers with `window.postMessage`.
 * The window can also open on its own (Start menu, breezell://plugin-window/{{id}}/main); then
 * there is no editor and `breezell.connected` is false in the page.
 */
export function activate(context: vscode.ExtensionContext) {
	const breezell = vscode.breezell as typeof vscode.breezell | undefined;
	if (!breezell) {
		return;
	}
	let open: vscode.breezell.PluginWindow | undefined;

	context.subscriptions.push(vscode.commands.registerCommand('{{name}}.openWindow', async () => {
		try {
			open = await breezell.windows.open('main');
			open.onDidReceiveMessage(message => {
				if ((message as { type?: string })?.type === 'hello') {
					void open?.postMessage({ type: 'greeting', text: `Hello from ${vscode.env.appName}` });
				}
			});
			open.onDidClose(() => open = undefined);
		} catch (err) {
			vscode.window.showErrorMessage(`{{displayName}}: ${(err as Error).message}`);
		}
	}));

	// Conversation turns go to the window while it is open (permission "chat.events").
	context.subscriptions.push(
		breezell.chat.onDidStartTurn(turn => void open?.postMessage({ type: 'turn', phase: 'start', mode: turn.mode })),
		breezell.chat.onDidFinishTurn(turn => void open?.postMessage({ type: 'turn', phase: 'finish', outcome: turn.outcome, seconds: Math.round(turn.durationMs / 1000) })),
	);
}

export function deactivate() { }
