# package.json

What Breezell reads from a plugin's `package.json`. The rest is an ordinary VS Code extension manifest.

## The `breezell` object

```json
"breezell": {
	"apiVersion": 1,
	"permissions": ["chat.events", "models.request"],
	"optionalPermissions": ["agent.hooks"],
	"source": "open"
}
```

| Field | |
|---|---|
| `apiVersion` | The API generation the plugin is written for: `1` |
| `permissions` | Every permission it uses ([Permissions](permissions.md)). One Breezell does not know refuses the install |
| `optionalPermissions` | Permissions only some versions know: an older Breezell leaves them out and installs the plugin. Check before use |
| `source` | `open` or `closed`: what the package holds and what the market shows ([Publishing](publishing.md)) |

Without a `breezell` object the extension is no plugin: `vscode.breezell` calls fail with `BreezellNotAPlugin`.

## Other fields that matter

- `"extensionKind": ["ui", "workspace"]`: in a remote (WSL, SSH) window the plugin runs on the user's computer,
  next to Breezell, so `vscode.breezell` is there even when the remote server is an older build. Window plugins need it.
- `activationEvents`: a plugin that registers agent tools, a send handler or a tool call handler should start
  with Breezell: `["onStartupFinished"]`. One that only answers its commands can start on them.
- `repository` (https): required for open source in the market.
- `icon`, `displayName`, `description`, `categories`: shown in the market ([Translations](translations.md) for other languages).

## `contributes.breezell`

| Key | What it declares | Permission | Page |
|---|---|---|---|
| `skills` | Folders of skills for the agent | none | [The agent](agent.md#packs-skills-rules-mcp-servers) |
| `rules` | Markdown added to the AI's instructions | none | [The agent](agent.md#packs-skills-rules-mcp-servers) |
| `mcpServers` | MCP servers for the agent | `agent.tools` | [The agent](agent.md#packs-skills-rules-mcp-servers) |
| `tools` | Agent tools the plugin's code runs | `agent.tools` | [The agent](agent.md#agent-tools) |
| `windows` | Windows of the plugin's own | none | [Windows](windows.md) |
| `launcher` | How the plugin opens from Box | none | [below](#opening-a-plugin) |
| `restart` | A restart after install, update or removal | none (`app.forceRestart` to force) | [Restarting Breezell](restart.md) |
| `ui` | Buttons, pages, patches, tokens, fonts, a stylesheet, variants, fences, modes, settings | `ui.contribute`, `ui.modify`, `chat.render` | [Breezell's screens](ui.md) |

An entry Breezell cannot use is left out and the rest stays; the reason is logged, and `validate` tells you first.

## Opening a plugin

Users should not need a command to open a plugin. Declare how it opens:

```json
"contributes": {
	"breezell": {
		"launcher": { "command": "focusPlayer.open", "sidebar": true }
	},
	"commands": [{ "command": "focusPlayer.open", "title": "Open", "category": "Focus Player" }]
}
```

- `command`: one of the plugin's own `contributes.commands` (Breezell refuses any other), or
  `window`: one of its windows (`"launcher": { "window": "timer" }`).
- The plugin then gets an **Open** button in Breezell Console › Plugins (market card and Installed page).
- `sidebar` (default `true`): it is also listed by name under **Plugins** in the Box sidebar. Clicking it
  leaves Box for the editor and opens the plugin there (or opens its window). Set `false` to stay out of the list.
- Plugins without an interface (packs, right-click commands) need no launcher.
