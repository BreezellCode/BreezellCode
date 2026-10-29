# {{displayName}}

{{description}}

A Breezell plugin pack (`{{id}}`): no code, only what `package.json` › `contributes.breezell` declares.

- `skills/<name>/SKILL.md`: skills the agent can load (they show up in Breezell's skill list).
- `rules/rules.md`: rules added to the AI's instructions while the pack is on.
- `mcpServers`: MCP servers, e.g. `"thinking": { "command": "npx", "args": ["-y", "@modelcontextprotocol/server-sequential-thinking"] }`.
  Users see the command before they install.
- `contributes.themes`: color themes, as in any VS Code extension.

```bash
npm run validate
npm run package:open      # writes {{id}}-<version>.vsix
```

Install the .vsix in Breezell from **Plugins › Installed › Install local .vsix**, or press F5 to try the pack in a development window.
