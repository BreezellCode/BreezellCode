import * as vscode from 'vscode';

/**
 * Sends the selected code to the user's chat model and streams the answer into a
 * Markdown document. Needs the "models.request" permission: Breezell asks the user
 * once, and the request is billed like the user's own chat requests.
 */
export function activate(context: vscode.ExtensionContext) {
	context.subscriptions.push(vscode.commands.registerCommand('{{name}}.explainSelection', async () => {
		const breezell = vscode.breezell as typeof vscode.breezell | undefined;
		const editor = vscode.window.activeTextEditor;
		if (!breezell) {
			return vscode.window.showWarningMessage('{{displayName}} needs Breezell.');
		}
		if (!editor || editor.selection.isEmpty) {
			return vscode.window.showInformationMessage('Select some code first.');
		}
		const code = editor.document.getText(editor.selection);
		const doc = await vscode.workspace.openTextDocument({ language: 'markdown', content: '' });
		const shown = await vscode.window.showTextDocument(doc, vscode.ViewColumn.Beside, true);
		let written = 0;
		const writeUpTo = async (text: string) => {
			const delta = text.slice(written);
			if (!delta) {
				return;
			}
			written = text.length;
			await shown.edit(edit => edit.insert(doc.positionAt(doc.getText().length), delta));
		};

		await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: '{{displayName}}', cancellable: true }, async (_progress, token) => {
			try {
				const response = await breezell.models.request({
					system: 'You explain code to a developer. Be concise and concrete. Answer in Markdown.',
					messages: [{ role: 'user', content: `Explain this ${editor.document.languageId} code:\n\n${code}` }],
					onText: text => void writeUpTo(text),
				}, token);
				await writeUpTo(response.text);
			} catch (err) {
				const error = err as Error;
				if (error.name !== 'BreezellCancelled') {
					vscode.window.showErrorMessage(`{{displayName}}: ${error.message}`);
				}
			}
		});
	}));
}

export function deactivate() { }
