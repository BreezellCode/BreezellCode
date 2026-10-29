import * as vscode from 'vscode';

export function activate(context: vscode.ExtensionContext) {
	// `vscode.breezell` exists only in Breezell; elsewhere it is undefined.
	const breezell = vscode.breezell as typeof vscode.breezell | undefined;

	context.subscriptions.push(vscode.commands.registerCommand('{{name}}.hello', () => {
		const who = breezell ? (breezell.account.isSignedIn ? 'signed in to Breezell' : 'not signed in') : 'not running in Breezell';
		vscode.window.showInformationMessage(`Hello from {{displayName}} (${who}).`);
	}));

	if (breezell) {
		context.subscriptions.push(breezell.account.onDidChangeSignIn(signedIn => {
			console.log(`[{{id}}] Breezell sign-in: ${signedIn}`);
		}));
	}
}

export function deactivate() { }
