# Permissions

Every permission: whether it is on from the start or asked for, and what it gives.

A plugin declares every permission it uses in `package.json` (`"breezell": { "permissions": [...] }`),
as an Android app does in its manifest. Nothing undeclared is ever usable, and the market lists what
each plugin declares before it is installed.

| Permission | Kind | Granted |
|---|---|---|
| `chat.events` | normal | On from the start; the user can turn it off |
| `models.request` | dangerous | Asked for the first time the plugin uses it |
| `models.select` | normal | On from the start; the user can turn it off |
| `chat.read` | dangerous | Asked for the first time the plugin uses it |
| `chat.send` | dangerous | Asked for the first time the plugin uses it |
| `chat.approve` | dangerous | Asked for the first time the plugin uses it |
| `providers.read` | dangerous | Asked for the first time the plugin uses it, and only for an account whose plan includes Custom API |
| `providers.list` | normal | On from the start; the user can turn it off. Never a key |
| `agent.tools` | dangerous | "Agent tool registration": asked when the plugin first registers a tool, or when a plugin with MCP servers first runs |
| `agent.hooks` | dangerous | Asked when the plugin first registers a tool call handler or listens to tool runs: it sees what the agent passes (file paths, edits, commands) and the results |
| `app.restart` | normal | On from the start; the user can turn it off. The user still answers each request |
| `app.forceRestart` | dangerous | Asked the first time the plugin forces a restart; if refused, the plugin asks each time instead |
| `editor.read` | dangerous | The plugin asks with `requestPermission`. A plugin is an extension, so VS Code's API reaches open files whatever this says: this is how it says that it does, and how the user tells it not to |
| `chat.input` | dangerous | Asked for the first time the plugin reads the chat box |
| `chat.intercept` | dangerous | Asked when the plugin registers a send handler |
| `ui.contribute` | normal | On from the start; the user can turn it off, which takes the plugin's buttons, pages and modes out of Breezell's screens |
| `ui.modify` | dangerous | Asked when a plugin that declares `ui.patches`, `ui.tokens`, `ui.variants`, `ui.fonts`, `ui.stylesheet` or a companion first runs |
| `chat.render` | dangerous | Asked when a plugin that declares `ui.renderers` first runs: a drawn code fence hands the plugin its text |

- A permission only some versions of Breezell know goes in `"breezell": { "optionalPermissions": [...] }`:
  an older Breezell leaves it out and installs the plugin all the same, where a permission it does not
  know in `permissions` would refuse it. Check before using what it gives.
- A dangerous permission is asked for once, when the plugin first uses it; the answer is kept. While
  the user has not allowed it, its calls fail with `BreezellPermissionDenied` and the plugin should
  say what it cannot do.
- On the plugin's page (**Plugins › Installed**) the user switches each permission on and off, or
  all of them at once. Turning one off stops it at once, including events the plugin listens to.
- Ask only for what the plugin needs: review looks harder at plugins that read or send messages or
  approve tool calls, and at closed source ones above all.
- `chat.read` gives what the user sees in the chat: never Breezell's prompts, text only the model
  sees, hidden messages or other workspaces' conversations. A tool's parameters and result are cut
  at 20,000 characters. `chat.send` sends at most 10 messages a minute and refuses a busy
  conversation; its messages are billed like the user's own.
- `chat.read` also says how many commands a conversation runs in the background, and the tokens its
  replies used as the provider reported them: nothing about money, plans or quota.
- `providers.read` hands out the custom APIs' keys: a plugin can call those APIs itself, outside
  Breezell, and the providers bill the user. It works only for an account whose Breezell plan
  includes Custom API; otherwise the call fails with `BreezellPlanRequired` and the user is not
  asked. It never gives Breezell's own account or other providers' keys.

## Checking and asking

```ts
const breezell = vscode.breezell;
if (!breezell?.permissions.includes('agent.hooks')) {
	return; // an older Breezell left the optional permission out
}
if (await breezell.permissionState('editor.read') === 'ask') {
	await breezell.requestPermission('editor.read');   // asks now, at a moment of your choosing
}
breezell.onDidChangePermissions(() => refresh());       // the user switched one on the plugin's page
```

- `permissionState(p)` is `granted`, `denied` or `ask` and asks no one.
- `requestPermission(p)` asks when it is the first time and returns whether it is allowed.
- A dangerous permission's first call asks by itself; a refused one fails with `BreezellPermissionDenied`.
- The user can turn any permission off at any time, also a normal one: handle the error where you call.
