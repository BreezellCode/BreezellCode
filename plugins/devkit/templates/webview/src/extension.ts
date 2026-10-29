import * as vscode from 'vscode';

/**
 * A panel with its own layout. It follows the user's conversation turns through
 * `vscode.breezell.chat` ("chat.events" permission: mode, outcome and duration,
 * never the content). The panel is an editor tab: drag it out, or use
 * "Move Editor into New Window", to keep it in a window of its own.
 */
export function activate(context: vscode.ExtensionContext) {
	const breezell = vscode.breezell as typeof vscode.breezell | undefined;
	let panel: vscode.WebviewPanel | undefined;
	let turns = 0;
	let running = 0;

	const post = (message: unknown) => void panel?.webview.postMessage(message);

	context.subscriptions.push(vscode.commands.registerCommand('{{name}}.open', () => {
		if (panel) {
			panel.reveal();
			return;
		}
		panel = vscode.window.createWebviewPanel('{{name}}', '{{displayName}}', vscode.ViewColumn.Beside, { enableScripts: true, retainContextWhenHidden: true });
		panel.webview.html = html(panel.webview);
		panel.onDidDispose(() => panel = undefined);
		panel.webview.onDidReceiveMessage(message => {
			if (message?.type === 'ready') {
				post({ type: 'state', inBreezell: !!breezell, signedIn: breezell?.account.isSignedIn ?? false, turns, running });
			}
		});
	}));

	if (breezell) {
		context.subscriptions.push(
			breezell.account.onDidChangeSignIn(signedIn => post({ type: 'state', inBreezell: true, signedIn, turns, running })),
			breezell.chat.onDidStartTurn(turn => {
				running++;
				post({ type: 'turn', phase: 'start', mode: turn.mode, turns, running });
			}),
			breezell.chat.onDidFinishTurn(turn => {
				running = Math.max(0, running - 1);
				turns++;
				post({ type: 'turn', phase: 'finish', mode: turn.mode, outcome: turn.outcome, seconds: Math.round(turn.durationMs / 1000), turns, running });
			}),
		);
	}
}

function html(webview: vscode.Webview): string {
	const nonce = Math.random().toString(36).slice(2);
	return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>
	body { font-family: var(--vscode-font-family); color: var(--vscode-foreground); padding: 24px; }
	.card { border: 1px solid var(--vscode-panel-border); border-radius: 12px; padding: 16px; max-width: 520px; }
	.big { font-size: 40px; font-weight: 700; margin: 8px 0; }
	.muted { opacity: .7; }
	ul { padding-left: 18px; }
</style>
</head>
<body>
	<div class="card">
		<div class="muted" id="status">…</div>
		<div class="big" id="turns">0</div>
		<div class="muted">finished turns in this window</div>
		<ul id="log"></ul>
	</div>
<script nonce="${nonce}">
	const vscode = acquireVsCodeApi();
	const $ = id => document.getElementById(id);
	window.addEventListener('message', ({ data }) => {
		if (data.type === 'state') {
			$('status').textContent = !data.inBreezell ? 'Not running in Breezell' : data.signedIn ? 'Signed in to Breezell' : 'Sign in to Breezell';
		}
		if (data.type === 'turn') {
			const item = document.createElement('li');
			item.textContent = data.phase === 'start' ? 'Started (' + data.mode + ')' : 'Finished: ' + data.outcome + ' in ' + data.seconds + ' s';
			$('log').prepend(item);
		}
		if (typeof data.turns === 'number') {
			$('turns').textContent = String(data.turns);
		}
	});
	vscode.postMessage({ type: 'ready' });
</script>
</body>
</html>`;
}

export function deactivate() { }
