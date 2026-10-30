# Chat Mirror

Your Breezell conversations in a window of their own: pick one, read it with its tool calls and recalled memories, reply, approve tool calls, and switch the chat model.

The official example of a Breezell plugin that reads and takes part in conversations. Source: [`plugins/examples/chat-mirror`](https://github.com/BreezellCode/BreezellCode/tree/main/plugins/examples/chat-mirror).

## Use

- Open it from **Plugins** in the Box sidebar, or with **Open** in Breezell Console › Plugins.
- The list on the left shows this workspace's conversations, the most recent first. A dot marks one that is working (amber: waiting for your approval).
- Pick one to read it: your messages with the memories recalled for them, the replies with their reasoning, and every tool call with its parameters and result. The reply being written shows below as it comes.
- Write a message and press **Send** (Ctrl+Enter) to reply, or **New conversation** to start one. The AI answers as if you had typed it in Breezell.
- When a tool call waits for approval, **Approve** or **Reject** it here.
- **Open in Breezell** shows the conversation in Breezell's chat.
- **Model**, beside **Send**, switches Breezell's chat model. It is the same setting as the model picker in Breezell's chat, so a change on either side shows on the other (here when the window gets the focus).

## Permissions

| Permission | Used for |
|---|---|
| `chat.read` | The list, the conversation and its changes, Open in Breezell |
| `chat.send` | Send and New conversation |
| `chat.approve` | Approve and Reject |
| `models.select` | Model (the list and switching) |

Breezell asks for each `chat.*` permission the first time Chat Mirror uses it; `models.select` carries no risk and is on unless you turn it off. If you refuse one, Chat Mirror says what it cannot do and the rest keeps working. You can switch each one on or off, or all at once, under Breezell Console › Plugins › Installed › Chat Mirror. Messages it sends count like your own.

## How it is built

- `window/` is the page. It only draws, and shows every text with `textContent`, never as HTML: a message can contain anything.
- `src/extension.ts` opens the window and relays between it and `vscode.breezell.chat`: `listConversations`, `getConversation`, `onDidChangeConversation`, `send`, `approve`/`reject` and `show`.
- Model uses `vscode.breezell.models`: `list` when the window opens or gets the focus, `select` when you switch.
- Changes arrive while a reply is written, a few a second at most; when a step ends, the plugin reads the conversation again.
- A refused permission makes its call fail with `BreezellPermissionDenied`, and the page turns that into a sentence.
