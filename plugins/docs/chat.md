# The chat

What a plugin can know and do about the user's conversations. Each call names its permission; see
[API reference](api.md#chat) for the exact shapes.

## Turn events (`chat.events`)

```ts
vscode.breezell.chat.onDidStartTurn(turn => status.text = `Working (${turn.mode})`);
vscode.breezell.chat.onDidFinishTurn(turn => status.text = `${turn.outcome} in ${Math.round(turn.durationMs / 1000)} s`);
```

- A turn starts when the AI starts answering and finishes as `completed`, `error` or `stopped`. A turn
  waiting for the user's approval has not finished.
- `conversationId` in an event is stable per conversation in this window but is **not** the id
  `listConversations` uses; with `chat.read`, `conversationOfTurn(turnId)` gives that id.
- Events carry no content: the mode, the outcome and the duration. `chat.events` is normal: on unless the
  user turns it off.

## Reading conversations (`chat.read`)

```ts
const list = await vscode.breezell.chat.listConversations();           // most recently changed first
const open = list.find(c => c.current);
const conversation = open && await vscode.breezell.chat.getConversation(open.id);
for (const message of conversation?.messages ?? []) {
	if (message.kind === 'tool') { console.log(message.name, message.status, message.resultLength); }
}
vscode.breezell.chat.onDidChangeConversation(change => console.log(change.conversationId, change.activity));
```

- What the user sees in the chat of this workspace: their messages (with the memories recalled for
  each), replies with reasoning, each tool call with its parameters, status and result, and errors.
  Never Breezell's prompts, text only the model sees, hidden rows or other workspaces' conversations.
- A tool's parameters and result are cut at 20,000 characters (`resultLength` is the full length).
- `activity` is `idle`, `thinking`, `writing`, `runningTool`, `awaitingApproval` or `working`.
  `onDidChangeConversation` fires at most every 150 ms per conversation while it streams, with the
  reply being written in `streaming`.
- `show(id)` opens a conversation in Breezell's chat. `readInput()` (`chat.input`) gives what is typed in
  the chat box, its part before the caret, and the text of the last messages.

## Sending (`chat.send`)

```ts
const { conversationId } = await vscode.breezell.chat.send('Run the tests and fix what fails', {
	mode: 'agent',                                                 // normal, agent or plan
	model: { provider: 'openAICompatible', model: 'my-model' },     // one of models.list()
	attachments: ['src/app.ts', 'docs/screen.png'],                 // files of the workspace
});
await vscode.breezell.chat.stop(conversationId);                // stops the reply being written
```

- Without `conversationId` a new conversation starts. The call resolves once the message is in the
  conversation; the reply follows through `onDidChangeConversation`.
- The AI answers it as if the user had typed it, with the same tools, and it is billed the same way.
  At most 10 messages a minute per plugin; a busy conversation refuses it (`BreezellInvalidRequest`).
- `mode` and `model` are set as the user's pickers set them: in the conversation open in the chat the
  picker moves; another conversation keeps them as its own. Entanglement, Agent Teams and Dark Selene
  stay the user's choice. `model` must be one of `models.list()`.
- `attachments`: up to 10 files or folders of the workspace, by absolute path or relative to its first
  folder; images (png, jpg, gif, webp, up to 10 MB) go as images. Links, anything outside the workspace
  folders and what Breezell keeps from plugins are refused.
- `stop(id)` is not the user's Stop: `automated` messages may follow it.
- `approve(id)` / `reject(id)` (`chat.approve`) answer the tool call a conversation waits for. Leave
  approving to the user unless approving is what the plugin is for.

## Work over many turns

A plugin can keep a conversation going until something is done, as the [Goal](https://github.com/BreezellCode/BreezellCode/tree/main/plugins/examples/goal) example
does. All of this needs a Breezell newer than 1.4.41, and every call is checked against the sign-in and
the plugin's permissions: after a sign-out or a block it hears nothing more and can do nothing more.

```js
const { chat } = vscode.breezell;
await chat.holdDoneNotice(id);                               // no "done" sound for each turn
chat.onDidFinishTurn(async turn => {
	if (await chat.conversationOfTurn(turn.turnId) !== id) return;
	if (turn.outcome !== 'completed') { await chat.releaseDoneNotice(id); return; }   // stopped, or it failed
	const { backgroundCommands, usage } = await chat.getConversation(id);
	if (backgroundCommands?.willEnd) return;                   // its end starts a turn by itself
	if (done(usage)) { await chat.releaseDoneNotice(id, { announce: true }); return; }
	await chat.send('Go on with the tests', { conversationId: id, automated: true });
});
```

- **`automated`** is for a message the plugin sends on its own. It shows in the chat labelled with the
  plugin's name, and the AI is told the user did not type it. It does not count as the user reacting to the
  last turn and does not end up in their memories. Leave it out only for what a person asked to send.
- **Stop holds.** After the user presses Stop on the reply, an automated message fails with
  `BreezellStoppedByUser` until they write again. A message of theirs waiting in the queue goes first: yours
  fails with `BreezellInvalidRequest`, and the end of that turn is your next chance.
- **The done notice** can be held back, and comes once when released with `announce`. Errors still sound.
  A hold ends by itself on Stop, a sign-out, losing `chat.send`, a block, or the plugin stopping.
- **`backgroundCommands`** (`{ running, willEnd }`) says how many commands run in the background, and how
  many of them will end by themselves: servers and watchers do not. It is a count, not what they are.
- **`usage`** on a reply, on a conversation and on a `models.request` answer is the provider's numbers.
  Some providers count cache reads inside `inputTokens`. Subagents and checks that run beside a
  conversation are not in it, and `repliesWithoutUsage` says how many replies reported nothing.
- A turn's `outcome` is `completed`, `error` or `stopped`. A turn waiting for the user's approval has not
  finished, and a plugin should leave approving to the user.

## A message before it is sent

```js
vscode.breezell.chat.registerSendHandler(({ conversationId, text }) => {
	if (/sk-[A-Za-z0-9_-]{20,}/.test(text)) {
		return { cancel: true, reason: 'This message seems to hold a secret key.' };
	}
	return { text: text.replace(/\bTODO\b/g, 'to do') };   // or nothing: as it is
});
```

Needs `chat.intercept`, one handler per plugin. It covers what the user sends (typed, queued, edited or a
follow-up they picked), not what Breezell or another plugin writes: a teammate's start, a plan's prompt,
`chat.send`. The message goes on through the usual send path, so its model, plan and billing are what they
would have been.

- It sees the text as it reads, with mentions written out (`@file.ts`), and `attachments`: the names of what goes with it. Attachments stay as they are.
- Context for the AI: answer `{ context: '...' }` (alone or with `text`), up to 20,000 characters, 50,000 from all
  plugins together. The AI reads it with the message and is told it came from your plugin; the user does not see
  it in the chat and `chat.read` does not show it. It stays in the conversation's history, and an edit of the
  message asks your handler again and replaces it.
- Stopped: the user is told by which plugin and why, and the text stays in the chat box.
- A command of the plugin's own: answer `{ cancel: true, handled: true }`. The box clears and nothing is said,
  so telling the user what happened is up to the plugin. Keep `reason` for an older Breezell, which takes it as stopped.
- Changed: what is sent is what shows in the bubble, and it must not be empty or over 400,000 characters.
- An answer later than 3 seconds, or a failure, passes the message on as it was, and all plugins together get
  at most 6 seconds.
- With several plugins they go in id order, each seeing what the one before made of it.
