import * as vscode from 'vscode';
import { commentFromAnswer } from './comment';

/**
 * Doc Writer — an example Breezell plugin that uses the user's chat model
 * (`vscode.breezell.models.request`, permission "models.request").
 *
 * - "Write Doc Comment" asks the model for a doc comment in the syntax of the
 *   file's language and inserts it above the selection, indented like it, only when
 *   the answer really is a comment (src/comment.ts).
 * - "Explain Selection" streams an explanation into a Markdown document beside the code.
 *
 * Breezell asks the user once before the first request, and every request counts like
 * the user's own chat requests. Errors carry a `name`, handled in `explainError`.
 */

type Breezell = typeof vscode.breezell;

export function activate(context: vscode.ExtensionContext) {
	const breezell = vscode.breezell as Breezell | undefined;
	context.subscriptions.push(
		vscode.commands.registerCommand('docWriter.writeDoc', () => breezell ? writeDoc(breezell) : notInBreezell()),
		vscode.commands.registerCommand('docWriter.explain', () => breezell ? explain(breezell) : notInBreezell()),
	);
}

function notInBreezell() {
	vscode.window.showWarningMessage('Doc Writer needs Breezell: it uses your Breezell chat model.');
}

function outputLanguage(): string {
	return vscode.workspace.getConfiguration('docWriter').get<string>('language', 'English').trim() || 'English';
}

function selection(): { editor: vscode.TextEditor; code: string } | undefined {
	const editor = vscode.window.activeTextEditor;
	if (!editor || editor.selection.isEmpty) {
		vscode.window.showInformationMessage('Select some code first.');
		return undefined;
	}
	return { editor, code: editor.document.getText(editor.selection) };
}

async function writeDoc(breezell: Breezell) {
	const picked = selection();
	if (!picked) {
		return;
	}
	const { editor, code } = picked;
	const languageId = editor.document.languageId;
	const startLine = editor.document.lineAt(editor.selection.start.line);
	const indent = startLine.text.slice(0, startLine.firstNonWhitespaceCharacterIndex);

	await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: 'Doc Writer: writing a doc comment…', cancellable: true }, async (_progress, token) => {
		try {
			const response = await breezell.models.request({
				system: [
					'You write documentation comments for source code.',
					`Answer with the comment only, in the usual doc comment syntax for ${languageId}: /** */ for TypeScript, JavaScript, Java, C#, Kotlin, PHP; /// for Rust and Swift; // for Go; # lines for Python, Ruby and shell. It goes on the lines above the code.`,
					'No code fence, no code, no explanation around it. Describe what the code does, its parameters and its return value.',
					'The code may be only part of a file: document what is there, and never ask for the rest or complete it.',
					`Write the comment in ${outputLanguage()}.`,
				].join(' '),
				// The instruction is repeated with the code: some models follow the last user message
				// rather than the system text, and take bare code for a question about it.
				messages: [{ role: 'user', content: `Write the doc comment for this ${languageId} code. Reply with the comment only.\n\n${fence(code, languageId)}` }],
			}, token);
			const comment = commentFromAnswer(stripFence(response.text), languageId, code);
			if (!comment) {
				// Never put an answer that is not a comment into the code; offer to show it instead
				// (not awaited: the progress notification closes now).
				const show = 'Show the answer';
				void vscode.window.showWarningMessage('Doc Writer: the model did not answer with a comment, so nothing was inserted.', show).then(async choice => {
					if (choice === show) {
						const doc = await vscode.workspace.openTextDocument({ language: 'markdown', content: `${response.text}\n\n---\n*${response.model}*\n` });
						await vscode.window.showTextDocument(doc, vscode.ViewColumn.Beside, true);
					}
				});
				return;
			}
			const text = comment.split('\n').map(line => indent + line.trimEnd()).join('\n') + '\n';
			await editor.edit(edit => edit.insert(new vscode.Position(startLine.lineNumber, 0), text));
		} catch (err) {
			explainError(err);
		}
	});
}

async function explain(breezell: Breezell) {
	const picked = selection();
	if (!picked) {
		return;
	}
	const { editor, code } = picked;
	const doc = await vscode.workspace.openTextDocument({ language: 'markdown', content: '' });
	const shown = await vscode.window.showTextDocument(doc, vscode.ViewColumn.Beside, true);
	let shownText = '';
	// Edits are queued so streamed chunks land in order. Text that continues what is shown is
	// appended; anything else (the final text can differ from the stream) replaces it.
	let queue = Promise.resolve();
	const writeUpTo = (text: string) => {
		queue = queue.then(async () => {
			if (text === shownText) {
				return;
			}
			const continues = text.startsWith(shownText);
			const previous = shownText;
			shownText = text;
			await shown.edit(edit => continues
				? edit.insert(doc.positionAt(previous.length), text.slice(previous.length))
				: edit.replace(new vscode.Range(doc.positionAt(0), doc.positionAt(previous.length)), text));
		});
		return queue;
	};

	await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: 'Doc Writer: explaining…', cancellable: true }, async (_progress, token) => {
		try {
			const response = await breezell.models.request({
				system: `You explain code to a developer: what it does, how, and anything surprising. Be concise and concrete. Answer in Markdown, in ${outputLanguage()}.`,
				messages: [{ role: 'user', content: `Explain this ${editor.document.languageId} code:\n\n${code}` }],
				onText: text => void writeUpTo(text),
			}, token);
			await writeUpTo(`${response.text}\n\n---\n*${response.model}*\n`);
		} catch (err) {
			explainError(err);
		}
	});
}

/** The code in a Markdown fence longer than any run of backticks inside it. */
function fence(code: string, languageId: string): string {
	const ticks = '`'.repeat(Math.max(3, ...(code.match(/`+/g) ?? []).map(run => run.length + 1)));
	return `${ticks}${languageId}\n${code}\n${ticks}`;
}

function stripFence(text: string): string {
	const fenced = /^\s*```[\w-]*\n([\s\S]*?)\n```\s*$/.exec(text);
	return fenced ? fenced[1] : text;
}

/** What each Breezell error means for the user. */
function explainError(err: unknown) {
	const error = err instanceof Error ? err : new Error(String(err));
	switch (error.name) {
		case 'BreezellCancelled':
			return;
		case 'BreezellNotSignedIn':
			vscode.window.showWarningMessage('Doc Writer: sign in to Breezell first.');
			return;
		case 'BreezellPermissionDenied':
			vscode.window.showWarningMessage('Doc Writer may not use your chat model. Allow it under Breezell Console › Plugins › Installed.');
			return;
		case 'BreezellNoModel':
			vscode.window.showWarningMessage('Doc Writer: choose a chat model in Breezell first.');
			return;
		case 'BreezellRateLimited':
			vscode.window.showWarningMessage('Doc Writer: too many requests at once. Try again in a moment.');
			return;
		default:
			vscode.window.showErrorMessage(`Doc Writer: ${error.message}`);
	}
}

export function deactivate() { }
