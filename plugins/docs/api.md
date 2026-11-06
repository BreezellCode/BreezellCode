# API reference

Every member of `vscode.breezell`, with the permission it needs. The typings are
[`breezell.d.ts`](https://github.com/BreezellCode/BreezellCode/blob/main/plugins/devkit/breezell.d.ts)
(in a plugin made from a template: `types/breezell.d.ts`); this page says what the typings cannot.

`vscode.breezell` is `undefined` in other editors and in Breezell versions without the plugin API, so
check it first. A call fails with an `Error` whose `name` says why ([Errors](errors.md)): check the name,
not the message, which may change.

```ts
const breezell = vscode.breezell;
if (!breezell) {
	return; // not Breezell
}
try {
	await breezell.chat.send('Hello');
} catch (error) {
	if ((error as Error).name === 'BreezellPermissionDenied') { /* say what the plugin cannot do */ }
}
```

## Top level

| Member | Permission | What it is |
|---|---|---|
| `apiVersion` | none | The API generation this Breezell implements (`1`) |
| `permissions` | none | The permissions this plugin declared (with the optional ones this Breezell knows) |
| `permissionState(p)` | declared `p` | `granted`, `denied` or `ask`; asks no one |
| `requestPermission(p)` | declared `p` | Asks the user when it is the first time; whether it is allowed |
| `onDidChangePermissions` | none | The user changed one of this plugin's permissions (after one of the two calls above) |
| `language`, `onDidChangeLanguage` | none | Breezell's display language: `en`, `zh-CN`, `zh-TW`, `ja`, `ko`, `ru`, `es`, `pt-BR`. `vscode.env.language` does not follow it. Empty for a moment at start |

## `account`

| Member | Permission | What it is |
|---|---|---|
| `isSignedIn`, `onDidChangeSignIn` | none | Whether a Breezell account is signed in. Plugins run only while one is |

## `app`

| Member | Permission | What it is |
|---|---|---|
| `requestRestart({ scope, reason, l10n, force })` | `app.restart`; `app.forceRestart` with `force` | Ask to restart `extensionHost`, `window` or `app`, or with `force` restart without asking (once per plugin version). `true` when it will happen. See [Restarting Breezell](restart.md) |

## `chat`

| Member | Permission | What it is |
|---|---|---|
| `onDidStartTurn`, `onDidFinishTurn` | `chat.events` | `{ turnId, conversationId, mode }`; a finish adds `outcome` (`completed`, `error`, `stopped`) and `durationMs`. No content |
| `conversationOfTurn(turnId)` | `chat.read` | The `listConversations` id of a turn event's conversation; undefined for a turn too long ago (the last 200 are kept) |
| `listConversations()` | `chat.read` | This workspace's conversations, most recently changed first: `id`, `title`, `createdAt`, `updatedAt`, `messageCount`, `current`, `activity`, `backgroundCommands` |
| `getConversation(id)` | `chat.read` | The same with `messages`, `streaming` and `usage` |
| `onDidChangeConversation` | `chat.read` | `{ conversationId, activity, streaming, backgroundCommands }`, at most every 150 ms per conversation |
| `show(id)` | `chat.read` | Opens the conversation in Breezell's chat |
| `readInput()` | `chat.input` | The chat box: `text`, `before` (before the caret), `recent` (last messages' text) |
| `registerSendHandler(handler)` | `chat.intercept` | See each message the user sends before it goes: change it, stop it, add context for the AI. One per plugin. See [A message before it is sent](chat.md#a-message-before-it-is-sent) |
| `send(text, options)` | `chat.send` | Send as the user would: `conversationId` (none: a new one), `automated`, `mode`, `model`, `attachments`. Resolves to `{ conversationId }` once the message is in |
| `stop(id)` | `chat.send` | Stops the reply being written; not the user's Stop |
| `holdDoneNotice(id)`, `releaseDoneNotice(id, { announce })` | `chat.send` | No done sound or notification until released. See [Work over many turns](chat.md#work-over-many-turns) |
| `approve(id)`, `reject(id)` | `chat.approve` | Answer the tool call the conversation waits for |

### Conversation messages

`getConversation(id).messages` is what the chat shows, in order; `index` is the row's position.

| `kind` | Fields |
|---|---|
| `user` | `text`, `time`, `attachments` (names), `recalledMemories` (`id`, `summary`, `detail`, `priority`, `source`), `memoryUse` (`resident`, `relevant`, `complete`, `inThisConversation`), `automatedBy` (a plugin's message: `{ id, name }`) |
| `assistant` | `text`, `reasoning`, `usage` (`inputTokens`, `outputTokens`, `cacheReadTokens`, `cacheWriteTokens`) |
| `tool` | `id`, `name`, `status` (`invalid`, `awaitingApproval`, `running`, `done`, `failed`, `rejected`), `params`, `result` (cut at 20,000 characters), `resultLength`, `mcpServer`, `plugin` (`{ id, name }` for a plugin's tool) |
| `error` | `text` |

`usage` on a conversation adds `replies` and `repliesWithoutUsage`. Token counts are the provider's, for a
budget of your own: some providers count cache reads inside `inputTokens`, and subagents are not included.

## `models`

| Member | Permission | What it is |
|---|---|---|
| `list()` | `models.select` | The model picker's models: `provider`, `model`, `name`, `current` |
| `select({ provider, model })` | `models.select` | Switches the chat model to one of them |
| `request(request, token)` | `models.request` | A request to the chat model or `request.model`: `messages` (`role`, `content`, `images`), `system`, `model`, `responseFormat: 'json'`, `maxOutputTokens`, `onText`, `onReasoning`. Answers `{ text, model, usage, json }`. See [Models and providers](models.md) |

## `providers`

| Member | Permission | What it is |
|---|---|---|
| `list()` | `providers.list` | Custom APIs without keys: `id`, `name`, `protocol`, `host`, `headerNames`, `poolAccounts`, `models` (`id`, `enabled`, `current`) |
| `listCustom()` | `providers.read` | Custom APIs as their settings page shows them, API keys included; plan with Custom API only |

## `tools`

| Member | Permission | What it is |
|---|---|---|
| `register(name, { invoke })` | `agent.tools` | The code of a tool declared in `contributes.breezell.tools`. See [Agent tools](agent.md#agent-tools) |
| `registerCallHandler(handler)` | `agent.hooks` | See each tool call of the agent before it runs and refuse it: answer `{ deny: true, reason }`. One per plugin. See [The agent's tool calls](agent.md#the-agents-tool-calls) |
| `onDidRunTool` | `agent.hooks` | A call the plugins were asked about finished: the call with `status` (`done`, `failed`, `rejected`), `result`, `resultLength` |

## `ui`

| Member | Permission | What it is |
|---|---|---|
| `onDidOpenSurface` | none (the page is declared) | One of the plugin's pages opened: `surfaceId`, `context`, `postMessage(m)`, `onDidReceiveMessage`, `onDidClose`. See [Pages](ui.md#pages) |

## `windows`

| Member | Permission | What it is |
|---|---|---|
| `open(id)` | none (the window is declared) | Opens one of the plugin's windows, or brings it to the front: `windowId`, `postMessage`, `onDidReceiveMessage`, `onDidClose`, `close()`. See [Windows](windows.md) |

## What every call shares

- Each call checks, at that moment: a signed-in account, the plugin not on the blocklist, the permission
  declared and allowed. A plugin that was running when one of these changed keeps running but gets nothing.
- Events reach a plugin only while it may receive them: turning a permission off stops them at once.
- Values cross between processes as JSON: functions and class instances do not, `Date`s become strings.
