import * as vscode from 'vscode';

/**
 * Chat Mirror — an example Breezell plugin that reads and takes part in the user's
 * conversations (permissions "chat.read", "chat.send", "chat.approve"), in a window of its own,
 * switches Breezell's chat model ("models.select") and gives the agent two tools of its own
 * ("agent.tools"): pin_note and list_notes, which keep notes the window shows.
 *
 * The page in window/ draws the list and the conversation; this code relays between it and
 * vscode.breezell.chat. Breezell asks the user for each permission the first time the plugin
 * uses it. A refused or turned-off permission fails its call with BreezellPermissionDenied:
 * the page says so instead of failing silently.
 */

type Breezell = typeof vscode.breezell;

/** What the page sends. */
type PageMessage =
	| { type: 'ready' }
	| { type: 'refresh' }
	| { type: 'select'; id: string }
	| { type: 'new' }
	| { type: 'send'; text: string }
	| { type: 'approve' }
	| { type: 'reject' }
	| { type: 'show' }
	| { type: 'models' }
	| { type: 'selectModel'; provider: string; model: string }
	| { type: 'unpin'; id: string };

/** A note the agent pinned with pin_note; kept with the plugin's data, shown in the window. */
interface Note {
	readonly id: string;
	readonly title: string;
	readonly text: string;
	readonly at: number;
}

const NOTES_KEY = 'notes';
const MAX_NOTES = 50;

const readNotes = (context: vscode.ExtensionContext): Note[] => context.globalState.get<Note[]>(NOTES_KEY) ?? [];

async function writeNotes(context: vscode.ExtensionContext, notes: Note[]): Promise<void> {
	await context.globalState.update(NOTES_KEY, notes);
	void mirror?.window.postMessage({ type: 'notes', items: notes });
}

export function activate(context: vscode.ExtensionContext) {
	const breezell = vscode.breezell as Breezell | undefined;
	context.subscriptions.push(vscode.commands.registerCommand('chatMirror.open', () => {
		if (!breezell) {
			vscode.window.showWarningMessage('Chat Mirror needs Breezell: it shows Breezell conversations.');
			return;
		}
		return openMirror(breezell, context);
	}));
	// The agent's tools, declared in package.json ("contributes.breezell.tools", with their modes)
	// and run here. Registered at startup so the agent has them before the window ever opens;
	// Breezell asks the user for "agent.tools" the first time. A Breezell from before tools has none.
	if (breezell && typeof breezell.tools?.register === 'function') {
		context.subscriptions.push(
			breezell.tools.register('pin_note', { invoke: input => pinNote(context, input) }),
			breezell.tools.register('list_notes', { invoke: () => listNotes(context) }),
		);
	}
}

/** pin_note (Chat, Agent, Entanglement): keeps a note for the window. */
async function pinNote(context: vscode.ExtensionContext, input: { readonly [name: string]: unknown }): Promise<vscode.breezell.ToolResult> {
	const text = typeof input.text === 'string' ? input.text.trim() : '';
	if (!text) {
		return { text: 'Nothing pinned: "text" is empty.', isError: true };
	}
	const title = typeof input.title === 'string' ? input.title.trim().slice(0, 80) : '';
	const note: Note = { id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, title, text: text.slice(0, 2000), at: Date.now() };
	const notes = [note, ...readNotes(context)].slice(0, MAX_NOTES);
	await writeNotes(context, notes);
	return `Pinned${title ? ` "${title}"` : ''} in Chat Mirror. ${notes.length} note${notes.length === 1 ? '' : 's'} pinned.`;
}

/** list_notes (every mode): what is pinned, newest first. */
function listNotes(context: vscode.ExtensionContext): vscode.breezell.ToolResult {
	const notes = readNotes(context);
	if (!notes.length) {
		return 'No notes are pinned in Chat Mirror.';
	}
	return notes.map((note, i) => `${i + 1}. ${note.title ? `${note.title}: ` : ''}${note.text} (pinned ${new Date(note.at).toISOString()})`).join('\n');
}

let mirror: { window: vscode.breezell.PluginWindow } | undefined;

async function openMirror(breezell: Breezell, context: vscode.ExtensionContext): Promise<void> {
	if (mirror) {
		return;
	}
	let win: vscode.breezell.PluginWindow;
	try {
		win = await breezell.windows.open('mirror');
	} catch (err) {
		vscode.window.showErrorMessage(`Chat Mirror: ${(err as Error).message}`);
		return;
	}
	mirror = { window: win };
	let selected: string | undefined;
	/** What the open conversation was doing at its last change. */
	let lastActivity: string | undefined;
	let watching: vscode.Disposable | undefined;
	let reloadTimer: ReturnType<typeof setTimeout> | undefined;
	let listTimer: ReturnType<typeof setTimeout> | undefined;

	const post = (message: unknown) => void win.postMessage(message);
	const fail = (action: string, err: unknown) => {
		const error = err as { name?: string; message?: string };
		post({ type: 'error', action, name: error?.name ?? 'Error', message: error?.message ?? String(err) });
	};
	const sendList = async () => {
		try {
			post({ type: 'conversations', items: await breezell.chat.listConversations(), selected });
		} catch (err) {
			fail('list', err);
		}
	};
	const sendConversation = async (id: string) => {
		try {
			post({ type: 'conversation', conversation: await breezell.chat.getConversation(id) });
		} catch (err) {
			fail('open', err);
		}
	};
	// The models of Breezell's picker. `items: undefined` hides the page's picker: a Breezell
	// from before models.list has none to offer.
	const sendModels = async () => {
		if (typeof breezell.models.list !== 'function') {
			post({ type: 'models', items: undefined });
			return;
		}
		try {
			post({ type: 'models', items: await breezell.models.list() });
		} catch (err) {
			fail('models', err);
		}
	};
	const watch = () => {
		watching ??= breezell.chat.onDidChangeConversation(change => {
			if (change.conversationId === selected) {
				// The reply being written goes to the page as it comes ...
				post({ type: 'change', change });
				// ... and each time what it does changes (thinking, writing, a tool call, a wait for
				// approval, done), the messages are read again: the message sent gets the memories
				// used for it, a tool call its result, the reply its final text.
				if (change.activity !== lastActivity) {
					lastActivity = change.activity;
					clearTimeout(reloadTimer);
					reloadTimer = setTimeout(() => void sendConversation(change.conversationId), 250);
				}
			}
			clearTimeout(listTimer);
			listTimer = setTimeout(() => void sendList(), 1000);
		});
	};
	const run = async (action: string, work: () => Thenable<unknown>) => {
		try {
			await work();
		} catch (err) {
			fail(action, err);
		}
	};

	win.onDidReceiveMessage(async raw => {
		const message = raw as PageMessage;
		switch (message?.type) {
			case 'ready':
				post({ type: 'notes', items: readNotes(context) });
				await sendList();
				await sendModels();
				watch();
				return;
			case 'refresh':
				await sendList();
				await sendModels();
				if (selected) {
					await sendConversation(selected);
				}
				return;
			case 'models':
				// The window got the focus: the model may have been switched in Breezell meanwhile.
				await sendModels();
				return;
			case 'selectModel':
				await run('selectModel', () => breezell.models.select({ provider: message.provider, model: message.model }));
				// Also after a failure: the page shows the model that is really chosen.
				await sendModels();
				return;
			case 'select':
				selected = message.id;
				lastActivity = undefined;
				await sendConversation(message.id);
				return;
			case 'new':
				selected = undefined;
				lastActivity = undefined;
				post({ type: 'conversation', conversation: undefined });
				return;
			case 'send':
				await run('send', async () => {
					const { conversationId } = await breezell.chat.send(message.text, selected ? { conversationId: selected } : undefined);
					selected = conversationId;
					lastActivity = undefined;
					post({ type: 'sent', conversationId });
					await sendList();
					await sendConversation(conversationId);
				});
				return;
			case 'approve':
			case 'reject':
				if (selected) {
					const id = selected;
					await run(message.type, () => message.type === 'approve' ? breezell.chat.approve(id) : breezell.chat.reject(id));
				}
				return;
			case 'show':
				if (selected) {
					const id = selected;
					await run('show', () => breezell.chat.show(id));
				}
				return;
			case 'unpin':
				await writeNotes(context, readNotes(context).filter(note => note.id !== message.id));
				return;
		}
	});
	win.onDidClose(() => {
		watching?.dispose();
		clearTimeout(reloadTimer);
		clearTimeout(listTimer);
		mirror = undefined;
	});
	context.subscriptions.push({ dispose: () => win.close() });
}

export function deactivate() { }
