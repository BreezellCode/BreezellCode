# The agent

What a plugin gives Breezell's agent, and how it watches what the agent does.

## Packs: skills, rules, MCP servers

Declare them in `package.json`; no code is needed:

```json
"contributes": {
	"breezell": {
		"skills": ["skills"],
		"rules": ["rules/house-rules.md"],
		"mcpServers": {
			"sequential-thinking": { "command": "npx", "args": ["-y", "@modelcontextprotocol/server-sequential-thinking"] },
			"docs": { "url": "https://example.com/mcp" }
		}
	},
	"themes": [{ "label": "My Theme", "uiTheme": "vs-dark", "path": "./themes/my-theme.json" }]
}
```

- `skills`: folders holding skill folders (`skills/<name>/SKILL.md`). They appear in Breezell's skill list
  labelled with the plugin, and the agent loads them like any skill. A user's skill of the same name wins.
- `rules`: Markdown files added to the AI's instructions while the plugin is on (at most 8,000 characters
  per file and 24,000 for all plugins together). Keep them short: they count against every request.
- `mcpServers`: a `command` (with `args` and `env`) or a `url` (with `headers`). They appear in the MCP list
  labelled with the plugin; a user or project server of the same name wins. Users see each command before
  they install. MCP servers give the agent tools, so they need the `agent.tools` permission in
  `breezell.permissions`: they start once the user allows it.

Everything a plugin declares goes away when it is turned off or removed, and while nobody is signed in.

## Agent tools

A plugin can give Breezell's agent tools of its own: it declares each one in `package.json`, with
the chat modes it is offered in, and runs it in its code. It needs the `agent.tools` permission
("Agent tool registration"), which the user is asked for when the plugin first registers a tool.

```json
"activationEvents": ["onStartupFinished"],
"breezell": { "apiVersion": 1, "permissions": ["agent.tools"] },
"contributes": {
	"breezell": {
		"tools": [{
			"name": "get_weather",
			"displayName": "Weather",
			"description": "Current weather for a city. Use it when the user asks about the weather.",
			"modes": ["chat", "agent", "entanglement"],
			"inputSchema": {
				"type": "object",
				"properties": { "city": { "type": "string", "description": "City name" } },
				"required": ["city"]
			}
		}]
	}
}
```

```ts
context.subscriptions.push(vscode.breezell.tools.register('get_weather', {
	async invoke(input, token) {
		const weather = await lookUp(String(input.city), token);
		return weather ? `${weather.summary}, ${weather.celsius} °C` : { text: 'No such city', isError: true };
	},
}));
```

- `name`: 2 to 48 lowercase letters, digits and underscores, not one of Breezell's own tool names. At
  most 16 tools. `description` is what the agent reads to decide when to call it; `inputSchema` is an
  object JSON Schema (left out: no arguments); `displayName` is what the user sees.
- `modes`: one or several of `chat`, `agent`, `entanglement`, `analyze`, `teams` (none: `agent`). In
  any other mode the agent neither sees nor can call the tool, so a set of tools can make a mode of
  its own, for example Chat with a few tools of yours.
- Register the code when the plugin starts (`onStartupFinished`): a tool is offered only while its code
  is registered. Disposing the registration takes it away.
- The agent reaches the tools as those of the MCP server `plugin:<publisher.name>`; the user's "MCP
  tools" auto-approve setting applies to their calls. `input` is checked against `inputSchema`
  first (required properties present; undeclared ones removed unless the schema allows
  `additionalProperties`).
- `invoke` returns text, or `{ text, isError: true }` for a failure the agent should see as one; a
  thrown error is a failure too. Results longer than 400,000 characters are cut. `token` is
  cancelled when the user stops the agent or after 5 minutes.
- If the user refuses, the tools stay registered but unused; turning the permission on later under
  **Plugins › Installed** brings them back at once. Signed out, blocklisted or turned off, nothing is
  offered, and each call is checked again.
- With `chat.read`, a conversation shows each call of a plugin's tool with `plugin: { id, name }`.
- The arguments the agent passes can hold conversation text or file contents: keep them on the user's
  computer unless the tool says otherwise. Review looks closely at plugins with agent tools.

[Chat Mirror](https://github.com/BreezellCode/BreezellCode/tree/main/plugins/examples/chat-mirror) has two: `pin_note` (Chat, Agent, Entanglement) and `list_notes`
(every mode).

### The agent's tool calls

With `agent.hooks` a plugin sees each tool call of the agent after Breezell's own checks and before it
runs or asks for approval, and can refuse it:

```js
vscode.breezell.tools.registerCallHandler(call => {
	if (call.name === 'run_terminal_cmd' && /rm -rf/.test(String(call.params.command))) {
		return { deny: true, reason: 'No deleting in this repository.' };
	}
	// or nothing: the call goes on
});
vscode.breezell.tools.onDidRunTool(run => console.log(run.name, run.status, run.resultLength));
```

- A call is `{ conversationId, toolCallId, name, params, mcpServer, mode }`; each text in `params` is cut at
  20,000 characters. `conversationId` is the one `listConversations` uses.
- A refused call never runs. The agent reads your plugin's reason, is told not to repeat the call, and the user
  sees it as your plugin's. Repeating the same refused call counts toward Breezell's loop guard.
- An answer later than 3 seconds, or a failure, lets the call go on; all plugins together get at most 6 seconds,
  in id order, and the first refusal decides. A Stop pressed meanwhile ends the call.
- `onDidRunTool` reports each call once its row has finished: `done`, `failed` or `rejected` (by the user), with
  what the chat shows of the result (cut at 20,000 characters, `resultLength` the full length).
