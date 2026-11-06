# Recipes

Whole small plugins for common tasks. Each is a `package.json` part and a complete `src/extension.ts`;
start from the Minimal template and paste them in. They are checked with `validate` and `typecheck`.

## Explain the selection with the user's model

A command that streams the chat model's explanation of the selected code into an output channel.

```json
"breezell": { "apiVersion": 1, "permissions": ["models.request"] },
"contributes": { "commands": [{ "command": "explainer.explain", "title": "Explain Selection", "category": "Explainer" }] }
```

```ts
import * as vscode from 'vscode';

export function activate(context: vscode.ExtensionContext) {
	const output = vscode.window.createOutputChannel('Explainer');
	context.subscriptions.push(output, vscode.commands.registerCommand('explainer.explain', async () => {
		const editor = vscode.window.activeTextEditor;
		const code = editor?.document.getText(editor.selection);
		if (!vscode.breezell || !code) {
			return;
		}
		output.clear();
		output.show(true);
		const source = new vscode.CancellationTokenSource();
		try {
			let shown = 0;
			await vscode.breezell.models.request({
				system: 'Explain code briefly, for a developer who did not write it.',
				messages: [{ role: 'user', content: code }],
				onText: soFar => { output.append(soFar.slice(shown)); shown = soFar.length; },
			}, source.token);
		} catch (error) {
			const name = (error as Error).name;
			vscode.window.showWarningMessage(name === 'BreezellPermissionDenied' ? 'Explainer may not use your chat model.' : `Explainer: ${(error as Error).message}`);
		} finally {
			source.dispose();
		}
	}));
}
```

## Refuse destructive commands the agent runs

A guard that refuses `rm -rf` and `git push --force` before they run, and keeps a log of every call.

```json
"activationEvents": ["onStartupFinished"],
"breezell": { "apiVersion": 1, "permissions": [], "optionalPermissions": ["agent.hooks"] }
```

```ts
import * as vscode from 'vscode';

const DANGEROUS = [/\brm\s+-[a-z]*r[a-z]*f/i, /\bgit\s+push\b.*--force/i];

export function activate(context: vscode.ExtensionContext) {
	const breezell = vscode.breezell;
	if (!breezell?.permissions.includes('agent.hooks')) {
		return; // an older Breezell, without tool hooks
	}
	const log = vscode.window.createOutputChannel('Command Guard');
	context.subscriptions.push(log, breezell.tools.registerCallHandler(call => {
		const command = typeof call.params.command === 'string' ? call.params.command : '';
		if (call.name === 'run_terminal_cmd' && DANGEROUS.some(pattern => pattern.test(command))) {
			return { deny: true, reason: `"${command}" is not allowed here: do it by hand if you mean it.` };
		}
		return undefined;
	}), breezell.tools.onDidRunTool(run => {
		log.appendLine(`${run.name} ${run.status} (${run.resultLength} characters)`);
	}));
}
```

## Give the AI the ticket a message is about

Each message that names a ticket (`ABC-123`) goes with the ticket's text, which the AI reads and the user
does not see in the chat.

```json
"activationEvents": ["onStartupFinished"],
"breezell": { "apiVersion": 1, "permissions": ["chat.intercept"] }
```

```ts
import * as vscode from 'vscode';

async function ticketText(id: string): Promise<string | undefined> {
	const file = vscode.Uri.joinPath(vscode.workspace.workspaceFolders?.[0]?.uri ?? vscode.Uri.file('/'), 'tickets', `${id}.md`);
	try {
		return new TextDecoder().decode(await vscode.workspace.fs.readFile(file));
	} catch {
		return undefined;
	}
}

export function activate(context: vscode.ExtensionContext) {
	if (!vscode.breezell) {
		return;
	}
	context.subscriptions.push(vscode.breezell.chat.registerSendHandler(async ({ text }) => {
		const id = /\b[A-Z]{2,5}-\d{1,6}\b/.exec(text)?.[0];
		const ticket = id && await ticketText(id);
		return ticket ? { context: `Ticket ${id}:\n${ticket.slice(0, 15_000)}` } : undefined;
	}));
}
```

Answer within three seconds: a slower handler is passed over for that message.

## A look of your own, switched in Feature Options

No code: a paper look and a night look for Breezell's screens, a font, and the user's choice between
them in Box › Feature Options.

```json
"breezell": { "apiVersion": 1, "permissions": ["ui.contribute"], "optionalPermissions": ["ui.modify"] },
"contributes": {
	"configuration": { "title": "Paper", "properties": {
		"paper.look": { "type": "string", "enum": ["paper", "night"], "default": "paper" },
		"paper.accent": { "type": "string", "format": "color-hex", "default": "#7a4b1f" }
	} },
	"breezell": { "ui": {
		"fonts": [{ "family": "Lora", "file": "fonts/Lora.woff2" }],
		"stylesheet": "look.css",
		"tokens": { "chat-font-family": "Lora, Georgia, serif", "link-color": { "setting": "paper.accent" } },
		"variants": { "setting": "paper.look", "values": {
			"paper": { "tokens": { "bg-1": "#fffbe8", "bg-2": "#f6f1e3", "fg-1": "#2b2b2b", "accent": "#7a4b1f", "accent-fg": "#ffffff" } },
			"night": { "tokens": { "bg-1": "#101418", "bg-2": "#151a20", "fg-1": "#e6e6e6", "accent": "#c8a97e", "accent-fg": "#101418" } }
		} },
		"options": { "title": "Paper", "items": [
			{ "setting": "paper.look", "title": "Look", "choices": [{ "value": "paper", "title": "Paper" }, { "value": "night", "title": "Night" }] },
			{ "setting": "paper.accent", "title": "Link colour" }
		] }
	} }
}
```

```css
/* look.css */
::part(chat.message.user), ::part(chat.message.assistant) { border-radius: 16px; padding: 10px 14px; }
::part(box.page) { background-image: linear-gradient(#fffbe8, #f6f1e3); }
```

The look applies once the user allows `ui.modify`, which Breezell asks for when the plugin first runs.

## A status bar item that follows the chat

Shows what the chat is doing, with no content: `chat.events` is on unless the user turns it off.

```json
"activationEvents": ["onStartupFinished"],
"breezell": { "apiVersion": 1, "permissions": ["chat.events"] }
```

```ts
import * as vscode from 'vscode';

export function activate(context: vscode.ExtensionContext) {
	const item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left);
	item.text = '$(comment) idle';
	item.show();
	context.subscriptions.push(item);
	const chat = vscode.breezell?.chat;
	if (!chat) {
		return;
	}
	context.subscriptions.push(
		chat.onDidStartTurn(turn => { item.text = `$(sync~spin) ${turn.mode}`; }),
		chat.onDidFinishTurn(turn => { item.text = `$(comment) ${turn.outcome}, ${Math.round(turn.durationMs / 1000)} s`; }),
	);
}
```

## Structured data from the model

Asks a picked model for JSON and uses it, with a cap on the answer.

```json
"breezell": { "apiVersion": 1, "permissions": ["models.request", "models.select"] },
"contributes": { "commands": [{ "command": "todos.extract", "title": "Extract TODOs", "category": "Todos" }] }
```

```ts
import * as vscode from 'vscode';

interface Todo { readonly line: number; readonly text: string }

export function activate(context: vscode.ExtensionContext) {
	context.subscriptions.push(vscode.commands.registerCommand('todos.extract', async () => {
		const document = vscode.window.activeTextEditor?.document;
		const breezell = vscode.breezell;
		if (!document || !breezell) {
			return;
		}
		const models = await breezell.models.list();
		const model = models.find(m => m.current) ?? models[0];
		const answer = await breezell.models.request({
			model: model && { provider: model.provider, model: model.model },
			system: 'List the TODO comments as a JSON array of { "line": number, "text": string }.',
			messages: [{ role: 'user', content: document.getText().slice(0, 150_000) }],
			responseFormat: 'json',
			maxOutputTokens: 2000,
		});
		const todos = Array.isArray(answer.json) ? answer.json as Todo[] : [];
		vscode.window.showInformationMessage(`${todos.length} TODOs (${answer.model})`);
	}));
}
```

## Hand a task to the agent with files

Starts a conversation in Plan mode with the open file and a screenshot attached.

```json
"breezell": { "apiVersion": 1, "permissions": ["chat.send"] },
"contributes": { "commands": [{ "command": "planner.plan", "title": "Plan a Fix", "category": "Planner" }] }
```

```ts
import * as vscode from 'vscode';

export function activate(context: vscode.ExtensionContext) {
	context.subscriptions.push(vscode.commands.registerCommand('planner.plan', async () => {
		const file = vscode.window.activeTextEditor?.document.uri;
		if (!vscode.breezell || !file || file.scheme !== 'file') {
			return;
		}
		// Resolves once the message is in the new conversation; the plan follows in the chat.
		await vscode.breezell.chat.send('Plan a fix for the bug in this file, shown in the screenshot.', {
			mode: 'plan',
			attachments: [file.fsPath, 'docs/bug.png'],
		});
	}));
}
```
