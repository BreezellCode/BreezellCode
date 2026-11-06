---
name: breezell-plugin
description: "Builds and changes Breezell plugins: VS Code extensions with a `breezell` object in package.json that use `vscode.breezell` (the user's conversations, chat models, agent tools and tool call hooks, Breezell's screens, windows) and are packed and published with the Breezell devkit. Use in a Breezell plugin project, or when the user asks to make, change, fix, pack or publish a Breezell plugin."
---

# Breezell plugins

A Breezell plugin is a VS Code extension whose `package.json` has a `breezell` object. It can use the
whole VS Code API, and `vscode.breezell` for what is Breezell's, limited to the permissions it declares.
Work in this order: understand the request, choose permissions, declare, write code, check, test, pack.
Read the reference page for the part you touch before writing it: they are short and exact.

## 1. Look before you change anything

- `package.json`: the `breezell` object (`apiVersion`, `permissions`, `optionalPermissions`, `source`) and
  `contributes.breezell`.
- `types/breezell.d.ts`: the API this project can call. When a call you need is missing, the copy is old:
  replace it, and `tools/breezell-plugin.mjs` with it, from
  `https://raw.githubusercontent.com/BreezellCode/BreezellCode/main/plugins/devkit/breezell.d.ts` and
  `.../devkit/breezell-plugin.mjs`. The pages in `references/` are copies of the market's `plugins/docs`:
  the newest are at `https://github.com/BreezellCode/BreezellCode/tree/main/plugins/docs`.
- `src/extension.ts` (none in a Pack) and the scripts in `package.json`.

## 2. From what the user wants to what to use

| The user wants | Permission | Use | Read |
|---|---|---|---|
| Use their chat model (or another of the picker's) | `models.request` | `models.request` | `references/models.md` |
| Know when the AI starts or finishes, no content | `chat.events` (normal) | `chat.onDidStartTurn`, `onDidFinishTurn` | `references/chat.md` |
| Read conversations, tool calls, recalled memories | `chat.read` | `listConversations`, `getConversation`, `onDidChangeConversation` | `references/chat.md` |
| Send messages, start conversations, stop a reply, keep work going | `chat.send` | `chat.send`, `chat.stop`, `holdDoneNotice` | `references/chat.md` |
| Approve or reject a waiting tool call | `chat.approve` | `chat.approve`, `chat.reject` | `references/chat.md` |
| Change, stop or add context to what the user sends | `chat.intercept` | `chat.registerSendHandler` | `references/chat.md` |
| Read the chat box | `chat.input` | `chat.readInput` | `references/chat.md` |
| Give the agent a tool | `agent.tools` | `contributes.breezell.tools` + `tools.register` | `references/agent.md` |
| See or refuse the agent's tool calls | `agent.hooks` | `tools.registerCallHandler`, `tools.onDidRunTool` | `references/agent.md` |
| Skills, rules, MCP servers with no code | none (`agent.tools` for MCP) | `contributes.breezell.skills`, `rules`, `mcpServers` | `references/agent.md` |
| Buttons, slash menu rows, pages, modes, settings cards | `ui.contribute` (normal) | `contributes.breezell.ui` | `references/ui.md` |
| Hide, move, restyle or replace Breezell's parts; colours, fonts, a stylesheet; a companion | `ui.modify` | `contributes.breezell.ui` | `references/ui.md` |
| Draw a code fence language | `chat.render` | `ui.renderers` | `references/ui.md` |
| A window of its own, also without the editor | none | `contributes.breezell.windows` + `windows.open` | `references/windows.md` |
| The model picker | `models.select` (normal) | `models.list`, `models.select` | `references/models.md` |
| Custom APIs without keys / with keys | `providers.list` (normal) / `providers.read` | `providers.list` / `providers.listCustom` | `references/models.md` |
| A restart | `app.restart` (normal), `app.forceRestart` | `app.requestRestart`, `contributes.breezell.restart` | `references/restart.md` |

Every permission: `references/permissions.md`. Every call: `references/api.md`. Errors: `references/errors.md`.
Limits: `references/limits.md`. Whole examples to start from: `references/recipes.md`.

## 3. Rules that hold everywhere

- **Fewest permissions.** Declare only what the code uses. A permission newer than the user's Breezell
  refuses the install from `permissions`: put new ones (`agent.hooks`, `providers.list`, ...) in
  `optionalPermissions` and check `vscode.breezell.permissions` before using them.
- **Expect refusals.** Dangerous permissions are asked at first use and can be turned off any time. Catch
  errors, check `error.name` (`BreezellPermissionDenied`, `BreezellNotSignedIn`, ...), and tell the user what
  the plugin cannot do. Never retry in a loop.
- **Check for the API.** `vscode.breezell` is undefined outside Breezell; plugins run only while signed in.
- **Declare, do not inject.** Breezell's own window runs no plugin script or CSS. Change its screens only
  through `contributes.breezell.ui` (or a stylesheet, which is read as declarations); a plugin's own UI goes
  in a page (`ui.surfaces`), a webview or a window.
- **Never touch** Breezell's internal commands (`breezell.*`), its sign-in, plan, quota, custom API,
  approvals or errors, or its files (sign-ins, conversations, memories). Never imitate its sign-in or
  payment screens or work around billing. These are refused, and review rejects plugins that try.
- **Private data stays put.** What `chat.read`, `chat.input`, `chat.intercept`, `agent.hooks` and agent tools
  hand over stays on the user's computer unless the README says where it goes. Keys from `providers.listCustom`
  go only to their provider. Secrets go in `context.secrets`.
- **Be quick where Breezell waits.** A send handler or tool call handler that takes over 3 seconds is passed
  over. Do slow work before or after, not in them.
- **Start with Breezell** (`"activationEvents": ["onStartupFinished"]`) when registering tools, a send handler
  or a tool call handler: nothing is offered before the code is registered.
- **Remote windows:** `"extensionKind": ["ui", "workspace"]`.
- **Market text is English:** README, package.json texts, commit messages. Translations go in `i18n/`
  (`references/translations.md`).

## 4. Before saying it is done

1. `npm run validate`: no problems. Everything it reports, Breezell would leave out.
2. `npm run typecheck`: no errors (a Pack has no code and no such script).
3. `npm run build`: it builds (not in a Pack).
4. Each permission is used and explained in the README; each call's errors are handled.
5. Tell the user how to try it: open the folder in Breezell, press **F5**, sign in in the development window,
   and what to do there. Say which permissions Breezell will ask for.
6. To install it for real: `npm run package:open` (or `package:closed`), then **Plugins › Installed › Install
   local .vsix**. To publish: `references/publishing.md`.

## 5. Mistakes seen often

- A turn event's `conversationId` is not the id of `listConversations`: use `chat.conversationOfTurn(turnId)`.
- An `automated` message after the user pressed Stop fails with `BreezellStoppedByUser` until they write again.
- `chat.send` refuses a conversation that is busy; wait for `onDidFinishTurn`.
- `models.request` runs at most 2 at a time and 20 a minute per plugin.
- Tool parameters and results from `chat.read` are cut at 20,000 characters (`resultLength` is the real length).
- A must-read colour pair (`send-bg`/`send-fg`, `approve-*`, `reject-*`, `error-*`, `accent`/`accent-fg`) is used
  only when both are written out, opaque and contrast at least 4.5.
- A setting a look follows (`when`, `variants`, a token `{ "setting" }`) must be the plugin's own, in
  `contributes.configuration`.
- Values crossing to Breezell are JSON: no functions, class instances or `Date` objects.

## References

All in `references/`, the same pages as the market's `plugins/docs`:

`README.md` (index), `getting-started.md`, `manifest.md`, `permissions.md`, `api.md`, `errors.md`, `limits.md`,
`chat.md`, `models.md`, `agent.md`, `ui.md`, `windows.md`, `restart.md`, `translations.md`, `security.md`,
`publishing.md`, `recipes.md`.
