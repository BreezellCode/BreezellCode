# An agent of your own

A plugin can answer conversations itself, with an agent it runs: a command-line agent the user installed
and signed in to, or a service of the plugin's own. Its models go in Breezell's model picker under one of
its [sign-in tiles](ui.md#sign-in-tiles-new), and a conversation on one of them is answered by the plugin,
not by a model Breezell sends requests to. The example is [Agent Bridge](../examples/agent-bridge), which
connects the Claude Code the user installed and signed in to.

All of this needs a Breezell newer than 1.4.64.

## What the user sees

- A tile on **Box › Models › Sign in** that declares `"agent": true`. While the plugin lists models for it,
  they are in the chat's model picker under the tile, and the model menu offers their effort levels.
- In a conversation on one of them, the turn looks like one of Breezell's own models: the reply as it is
  written, its thinking, its tool calls as Breezell's own steps, approval cards, Stop, an error card with
  Retry, how long it worked.
- Breezell sends no model request for these turns and bills nothing for them. Answering with a plugin's
  agent is open to every signed-in user, as the user's own API keys (BYOK) are.

## Declaring it

```json
"breezell": { "apiVersion": 1, "permissions": ["ui.contribute", "chat.agent"] },
"contributes": {
	"configuration": {
		"properties": {
			"myAgent.enabled": { "type": "boolean", "default": false, "scope": "application", "description": "Connect My Agent" }
		}
	},
	"commands": [{ "command": "myAgent.check", "title": "Check My Agent Again" }],
	"breezell": {
		"ui": {
			"signIns": [{
				"id": "myAgent", "title": "My Agent", "icon": "sparkle",
				"setting": "myAgent.enabled", "command": "myAgent.check", "agent": true,
				"consent": { "title": "Connect My Agent?", "message": "What it reads, where what you send goes, and whose terms you follow." }
			}]
		}
	}
}
```

- `chat.agent` is dangerous: Breezell asks the first time the plugin registers its agent. Refused, its
  models are never offered, and `register` logs why.
- An older Breezell refuses to install a plugin with `chat.agent` in `permissions`. A plugin that is
  nothing without its agent can keep it there; one that does more puts it in `optionalPermissions`.

## Registering it and its models

```ts
const breezell = vscode.breezell;
context.subscriptions.push(breezell.agents.register('myAgent', { runTurn, stopSubagent }));
// Once connected; an empty list takes them out of the picker again.
await breezell.agents.setModels('myAgent', [
	{ id: 'fast', title: 'Fast', description: 'Quick answers', efforts: ['low', 'medium', 'high'] },
	{ id: 'deep', title: 'Deep' },
]);
```

- `setModels` replaces the list. List models only while the tile's switch is on and the agent can answer.
- `id`: letters, digits and `._:@+-[]`; `title` and `description` are shown in the picker.
- `family: 'claude'`: a model of a maker Breezell knows shows Breezell's own icon of that maker. Plugins
  never send logos.
- `efforts`: the levels the model takes. The model menu offers them; `turn.effort` is the one the user
  picked, and absent when they picked none (use the agent's own default then).
- `compacts: true`: the agent compresses its context when asked. Manual compress (the context ring)
  then asks it with a turn that has `compact`, instead of doing nothing. Breezell newer than 1.4.65.

## A turn

```ts
async function runTurn(turn: vscode.breezell.AgentTurn, reply: vscode.breezell.AgentReply, token: vscode.CancellationToken) {
	const run = myAgent.start({ resume: turn.session, folder: turn.folders[0], model: turn.model, prompt: promptOf(turn) });
	token.onCancellationRequested(() => run.stop());
	for await (const event of run.events()) {
		if (event.type === 'session') { reply.session(event.id); }
		if (event.type === 'text') { reply.text(event.text); }
		if (event.type === 'tool') { reply.tool({ id: event.id, name: event.name, status: event.status, view: viewOf(event) }); }
	}
	return { session: run.sessionId, entry: run.lastRecordId };
}
```

What a turn brings:

| Field | What it is |
|---|---|
| `conversationId` | The conversation, for `stopSubagent` and your own bookkeeping |
| `model` | The id of the model picked, one of those listed |
| `text` | What the user wrote (empty in a turn Breezell starts for `notices` alone) |
| `attachments` | What the user attached. Files and folders: their `path`, for the agent to open. Pictures and PDFs, pasted ones too: their bytes in `data` (base64 and its type), to give the agent as an image or a document. A code selection (`path`, `lines`), problems, console or terminal output, a quoted message, a skill and the like: `text`, what Breezell's own model is given of it. Anything else (a video): its name only |
| `folders` | The conversation's folders as URIs, the one it works in first |
| `session` | What the plugin said of its session in this conversation's last turn: go on in it |
| `effort` | The effort level picked, if any |
| `history` | What the conversation said that the agent has not seen, oldest first: another model's turns, or everything when there is no `session` to go on with (a new conversation for the agent, or one rewound or edited since). Tool calls are notes such as `[Breezell used read_file: a.ts (done)]` |
| `memories` | What Breezell remembers that bears on this message, as its own model gets it: put it in the agent's prompt |
| `continuing` | `{ after }`: the turn goes on in `session` after the agent's model request failed (see below). `text` is the message it was answering; there are no attachments |
| `notices` | Breezell's notices for the agent: how commands it ran in Breezell's terminal ended in the background |
| `mode` | The chat mode the user picked: `agent` (or absent) changes files and runs commands; `plan` reads and plans, and its plan goes to `callBreezellTool('update_plan', …)` (below), whose card's Execute starts an `agent` turn asking for it to be carried out; `analyze` reads and answers; `chat` answers. Breezell's tools for changes and commands are listed and run in `agent` only: turn the agent's own off in the other modes. Breezell newer than 1.4.65 |
| `compact` | The user chose Manual compress on the context ring (models listed with `compacts` only): compress the agent's context in `session` now, as it compresses its own, and nothing else. `text` is empty. Say how it went with `compaction`, and its size after with `usage` (`context`). Breezell newer than 1.4.65 |
| `rules` | The user's rules for this project, as Breezell's own model gets them (the project's rules file, else the global ones, and the plugins' rules for this model). Without `session`: give them to the new session once, where it keeps its standing instructions (they are not sent again with each message). With `session`: they changed since the session got them (`''`: removed); tell the agent once. Absent when there is nothing new. Breezell newer than 1.4.65 |
| `autoApprove` | `{ mcp }`: whether the user auto-approves MCP tools. Breezell never sees the calls an agent makes to MCP servers of its own before they run: an agent that cannot ask the user runs them only while `mcp` is true. Absent (an older Breezell): it does not. Breezell newer than 1.4.68 |

What the plugin writes:

| Member | What it does |
|---|---|
| `text(text, parent?)` | More of the reply. `parent`: the subagent call whose words they are |
| `reasoning(text, parent?)` | More of its reasoning, shown under Thinking |
| `thinking(tokens)` | A thought whose text the agent keeps hidden: Breezell shows Thinking with how long and about how many tokens. Not for a thought you give with `reasoning`, except one begun with `thinkingStarted`, whose size may come before its text |
| `thinkingStarted()` | Its model began a request whose thought the agent tells only after: Breezell shows Thinking from now until its words or a call come. The thought stays, with its time, when its text (`reasoning`) or its size (`thinking`) comes before the next call or the turn's end; otherwise there was none. Breezell newer than 1.4.68 |
| `tool(event)` | One of the agent's tool calls (below) |
| `session(id)` | The agent's own session: the next turn gets it as `turn.session`. Say it as soon as you know it |
| `usage({ context, models })` | What the agent's model requests used, once or more a turn. `context`: `tokens`, how much of its model's context its conversation now takes (its last request's input, cached parts too), and that model's `window`, for the chat's context ring. `models`: per model, the `inputTokens`, `outputTokens`, `cacheReadTokens` and `cacheWriteTokens` used since it last said this, for Box › Token usage and the reply's token count. Breezell newer than 1.4.65 |
| `compaction({ phase, trigger, preTokens, postTokens })` | The agent compresses its context: `started`, then `done` (its size before and after, as the agent says them) or `failed`. `trigger`: `manual` for a `compact` turn, `auto` when the agent compresses by itself. Breezell shows that it compresses ("Compressing…" on the ring for a `compact` turn, "Condensing" in the chat for the agent's own); the ring takes its size from `usage`, not from these. Breezell newer than 1.4.65 |
| `retrying({ attempt, maxAttempts, delayMs, error })` | The agent sends a failed model request again by itself: Breezell shows its reconnecting countdown until the agent's next event |
| `approve(request)` | Ask before a call runs (below) |
| `breezellTools()`, `callBreezellTool(name, input, toolUseId)` | Breezell's own tools for the agent (below) |

`runTurn` resolves with `{ session, entry, error, apiError }` or nothing. `session` is kept whatever
happens. `entry` is the id of the last record of the agent's own this turn made, so that importing the
session later adds only what came after it.

## Tool calls

Tell each call `running` as soon as it starts (and again to say how it goes), then `done` or `error`,
under the same `id`. With a `view`, Breezell draws it as its own tool of that kind; without one, it is a
row under its own name.

| `view.kind` | Drawn as |
|---|---|
| `read` | A file read: `path`, `uri`, `startLine`, `endLine`, `totalLines` |
| `edit` | An edit card with its diff: `path`, `uri`, `edits` (`oldString`, `newString`, `replaceAll`) |
| `create` | A new file: `path`, `uri`, `content` |
| `command` | A command card: `command`, `description`, `background`, `output` |
| `search`, `files`, `list` | A text search, the files a pattern found, a folder listed |
| `fetch`, `webSearch` | A page fetched, a web search |
| `todos` | The agent's to-do list |
| `subagent` | A subagent: `description`, `prompt`, `step`, `report`, `background`, `stopped`, `model` |
| `memories` | A lookup in Breezell's memories (`callBreezellTool('memories_recall')`) |
| `mcp` | A tool of one of the user's MCP servers in Breezell: `server`, `tool`. Drawn as Breezell's MCP row of that server, its approval card too |

- A file is drawn as Breezell's own only with its `uri`, as Breezell opens it: a `file:` or
  `vscode-remote:` URI of the window. `path` is the agent's own name of it.
- The agent's own file changes are its own: Breezell shows them, and never keeps, undoes or reviews them.
  To have changes reviewed as Breezell's own, let the agent make them with Breezell's edit tools (below).
- Tell a call while the agent is still writing it (its input so far), and its card grows with it.
- **Subagents.** A call with `view.kind: 'subagent'` gets a page of its own, as Breezell's subagents do.
  Its own words and calls carry `parent`: that call's id. `stopSubagent(conversationId, toolId)` is what
  Stop on its page runs; answer false if the agent cannot stop one subagent alone.

## Asking first

`reply.approve({ toolId, name, kind, title, input, reason, view })` shows Breezell's approval card on the
call's row (tell the call `running` first), unless the user's settings answer:

| `kind` | Decided by |
|---|---|
| `edit` | Auto-approve edits |
| `command` | Auto-approve terminal; with it off, the project's Always allow list (a dangerous command on it is asked all the same) |
| `other` | Auto-approve MCP tools |

It resolves false when the user refuses or the turn stops. Tell the agent the call was refused.

## Breezell's tools for the agent

`reply.breezellTools()` lists the tools this Breezell offers the agent: each `name`, its parameters as a
JSON schema, and for `run_terminal_cmd` the `shell` its commands run in (such as `windows | PowerShell`).
Offer them to the agent with descriptions of your own (an MCP server inside the plugin is one way), and
run its calls with `reply.callBreezellTool(name, input, toolUseId)`. Pass the agent's own id of the call
(the `id` of its tool event): Breezell then draws that row as its own tool's.

| Tool | What it does for the agent |
|---|---|
| `memories_recall` | Looks up what Breezell remembers, as Breezell's own model does |
| `run_terminal_cmd` | Runs a command in Breezell's terminal: the card has Open, Stop, live output and Move to background; a command still running after its wait goes on in the background |
| `await` | Waits on such a background command, or stops it |
| MCP tools | The tools of the user's MCP servers in Breezell, as Breezell's own model may use them in this mode: each listed with `mcpServer`, `mcpTool` and `description` beside its `name` and schema. Offer them under names of your own; call them by this `name`, and Breezell runs them with its own connection to the server (also from WSL, also signed-in servers). Ask first with `kind: 'other'` (Auto-approve MCP tools decides) and tell their calls with `view: { kind: 'mcp', server, tool }`. Breezell newer than 1.4.65 |
| `ask_question` | Asks the user the agent's questions with Breezell's question card, on the row of the agent's call (pass its `toolUseId`), in every mode. `questions`: each with an `id`, the `question`, at least two `options` (`id`, `label`) and `allow_multiple`. It waits for the user, whatever their auto-approve settings, and resolves with `answers` (per question, the labels picked or the user's own words); empty when they chose Skip. Breezell newer than 1.4.65 |
| `update_plan` | In `plan` mode: shows the agent's plan as Breezell's plan card, on the row of the agent's call (pass its `toolUseId`). Give `title`, `markdown` (the plan) and `plan`, its steps (`[{ step }]`, at least one), the card's to-dos. The user can edit it and chooses Execute. Not for the agent to call itself |
| `edit_file`, `write_to_file` | Changes a file or creates one through Breezell's editor: a snapshot before it, the change in the editor to keep or undo, a step of Code Review, Auto-accept, Open file when editing, and the lint and type errors it leaves in the result |

- When you offer the terminal or the edit tools, turn the agent's own shell or edit tools off, so that
  every command and change goes through Breezell.
- A failure comes back as a result with `isError`, never as a thrown error. Give its `text` to the agent.
- Commands that end in the background come back as `turn.notices` with the next message. When one ends
  while the conversation is idle, Breezell starts a turn of its own: `text` is empty and `notices` says
  what ended.

## Failures, retries and Stop

- Stop cancels `token`: stop the agent and return.
- A thrown error, or `error` in the result, is shown as the error card after what was written.
- `apiError`: the error came from the agent's model request, of this kind (`rate_limit`, `overloaded`,
  `server_error`, `unknown` for a dropped connection, `stalled`, or one a new attempt cannot get past,
  such as `billing_error`). Breezell then waits as it does for its own requests and calls `runTurn` again
  in `session` with `continuing`, as often as its own retry settings say. Ask the agent to continue from
  where it stopped, not to start over. Retry on the error card does the same.
- When the agent retries by itself, say so with `retrying`, and Breezell shows the same countdown.

## The agent's own conversations

`agents.importConversation(tileId, { session, folder, title, model, messages })` brings one of the agent's
own conversations (one session) into the window that has its folder open, as a conversation that goes on
in that session. Messages are user, assistant and tool messages, oldest first, each with the `entry` of
the agent's record it comes from (a tool message can carry a `view` and a subagent's messages). The same
session again adds only what came after the last record the conversation shows.

| Status | Meaning |
|---|---|
| `created` | A new conversation |
| `updated` | It got the session's newer messages |
| `unchanged` | Nothing new, or no record to go on from |
| `deleted` | The user deleted it: it stays deleted |
| `busy` | It runs a turn now: try later |
| `elsewhere` | This window does not have its folder open |

`agents.onDidDeleteConversations` tells which of the plugin's conversations the user deleted, with their
sessions and folders. Delete the agent's own copies only when the user asked for that (Agent Bridge has
an option for it, off by default, that asks before it turns on).

## Rules

- Never read, keep or pass on the user's credentials for the agent. Let the user sign in to it
  themselves, in its own app, and run it as it was published.
- Follow the terms of whoever makes the agent, also for its name and logos: a tile takes a codicon,
  never an image.
- Do not name the tile, its settings or its buttons after Breezell.
- Say in the consent what the plugin reads, where what the user sends goes, and that Breezell's
  approval cards decide the agent's actions.

Limits: [Limits](limits.md#calls).
