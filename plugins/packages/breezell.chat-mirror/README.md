# Chat Mirror

Your Breezell conversations in a window of their own: pick one, read it with its tool calls and recalled memories, reply, approve tool calls, and switch the chat model.

The official example of a Breezell plugin that reads and takes part in conversations. Source: [`plugins/examples/chat-mirror`](https://github.com/BreezellCode/BreezellCode/tree/main/plugins/examples/chat-mirror).

## Use

- Open it from **Plugins** in the Box sidebar, or with **Open** in Breezell Console › Plugins.
- The list on the left shows this workspace's conversations, the most recent first. A dot marks one that is working (amber: waiting for your approval).
- Pick one to read it: your messages with the memories used for them (counted as in Breezell's chat: resident and relevant), the replies with their reasoning, and every tool call with its parameters and result.
- While Breezell works on a reply, the last bubble shows what it is doing and for how long (thinking, running a tool, waiting for your approval), its reasoning and the text as it comes.
- Write a message and press **Send** (Ctrl+Enter) to reply, or **New conversation** to start one. The AI answers as if you had typed it in Breezell.
- When a tool call waits for approval, **Approve** or **Reject** it here.
- **Open in Breezell** shows the conversation in Breezell's chat.
- **Model**, beside **Send**, switches Breezell's chat model. It is the same setting as the model picker in Breezell's chat, so a change on either side shows on the other (here when the window gets the focus).
- **Pinned notes**, under the conversations: the notes Breezell's agent pinned with Chat Mirror's `pin_note` tool, newest first. **Unpin** removes one.
- A tool call of a plugin shows the plugin's name and **Plugin tool** (Chat Mirror's own `pin_note` too); an MCP tool shows its server.

## Agent tools

Chat Mirror gives Breezell's agent two tools of its own (`agent.tools`, "Agent tool registration"). Each one names the modes it is offered in; in other modes the agent neither sees nor can call it.

| Tool | Modes | What it does |
|---|---|---|
| `pin_note` | Chat, Agent, Entanglement | Pins a note (a title and its text) in this window |
| `list_notes` | Chat, Agent, Entanglement, Analyze, Teams | Reads the pinned notes back, newest first |

Try it in Chat: "Pin a note in Chat Mirror: ship 1.4.42 on Monday". The notes are kept on your computer with the plugin's data, also while the window is closed. Their calls follow **Auto-approve MCP tools**, like any MCP tool.

## Permissions

| Permission | Used for |
|---|---|
| `chat.read` | The list, the conversation and its changes, Open in Breezell |
| `chat.send` | Send and New conversation |
| `chat.approve` | Approve and Reject |
| `models.select` | Model (the list and switching) |
| `agent.tools` | The `pin_note` and `list_notes` tools for the agent |

Breezell asks for each `chat.*` permission the first time Chat Mirror uses it; `models.select` carries no risk and is on unless you turn it off. If you refuse one, Chat Mirror says what it cannot do and the rest keeps working. You can switch each one on or off, or all at once, under Breezell Console › Plugins › Installed › Chat Mirror. Messages it sends count like your own.

Breezell asks for `agent.tools` once, the first time Chat Mirror starts. If you refuse, the two tools stay off until you turn the permission on, and the window works as before.

## How it is built

- `window/` is the page. It only draws, and shows every text with `textContent`, never as HTML: a message can contain anything.
- `src/extension.ts` opens the window and relays between it and `vscode.breezell.chat`: `listConversations`, `getConversation`, `onDidChangeConversation`, `send`, `approve`/`reject` and `show`.
- Model uses `vscode.breezell.models`: `list` when the window opens or gets the focus, `select` when you switch.
- Changes arrive while a reply is written, a few a second at most; each time what Breezell does changes (thinking, writing, a tool call, done), the plugin reads the conversation again. The memories come from each message's `recalledMemories` and `memoryUse`.
- A refused permission makes its call fail with `BreezellPermissionDenied`, and the page turns that into a sentence.
- The tools are declared in `package.json` (`contributes.breezell.tools`: name, description, `inputSchema`, `modes`) and run in `src/extension.ts` with `vscode.breezell.tools.register`. They are registered at startup (`onStartupFinished`), so the agent has them before the window ever opens.
- In a conversation read with `chat.read`, a plugin's tool call carries `plugin` (`{ id, name }`): the page shows that name instead of the `plugin:<id>` server.
