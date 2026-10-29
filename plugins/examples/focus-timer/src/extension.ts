import * as vscode from 'vscode';

/**
 * Focus Timer — an example Breezell window plugin.
 *
 * The timer itself is the page in window/ (it also runs when the window is opened on its own,
 * from the Start menu, with no editor). This code only adds what needs Breezell: a command and a
 * status bar item that open the window, and the AI's conversation turns sent to the page
 * (permission "chat.events"), which can pause the timer's sound while the AI works.
 */
export function activate(context: vscode.ExtensionContext) {
	const breezell = vscode.breezell as typeof vscode.breezell | undefined;
	if (!breezell) {
		return;
	}
	let timer: vscode.breezell.PluginWindow | undefined;

	const status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 89);
	status.text = '$(watch) Timer';
	status.tooltip = 'Open Focus Timer';
	status.command = 'focusTimer.open';
	status.show();
	context.subscriptions.push(status);

	context.subscriptions.push(vscode.commands.registerCommand('focusTimer.open', async () => {
		try {
			timer = await breezell.windows.open('timer');
			timer.onDidReceiveMessage(message => {
				const m = message as { type?: string; phase?: string; remaining?: string };
				if (m.type === 'state') {
					status.text = m.phase === 'idle' ? '$(watch) Timer' : `$(watch) ${m.phase === 'break' ? 'Break' : 'Focus'} ${m.remaining}`;
				}
			});
			timer.onDidClose(() => {
				timer = undefined;
				status.text = '$(watch) Timer';
			});
		} catch (err) {
			vscode.window.showErrorMessage(`Focus Timer: ${(err as Error).message}`);
		}
	}));

	context.subscriptions.push(
		breezell.chat.onDidStartTurn(turn => void timer?.postMessage({ type: 'turn', phase: 'start', mode: turn.mode })),
		breezell.chat.onDidFinishTurn(turn => void timer?.postMessage({ type: 'turn', phase: 'finish', outcome: turn.outcome, seconds: Math.round(turn.durationMs / 1000) })),
	);
}

export function deactivate() { }
