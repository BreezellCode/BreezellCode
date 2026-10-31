# Starter Pack

Code review and testing skills, short house rules, a thinking MCP server and a calm dark theme: no code.

The official example of a Breezell plugin pack: everything is declared in `package.json` ›
`contributes.breezell` (and `contributes.themes`), nothing is compiled or run by the pack itself.
Source: [`plugins/examples/starter-pack`](https://github.com/BreezellCode/BreezellCode/tree/main/plugins/examples/starter-pack).

## What it adds

| | Where | What you see in Breezell |
|---|---|---|
| Skills `code-review`, `write-tests` | `skills/<name>/SKILL.md` | In the skill list, labelled with the pack; the agent loads one when it fits the task |
| House rules | `rules/house-rules.md` | Added to the AI's instructions while the pack is on |
| MCP server `sequential-thinking` | `contributes.breezell.mcpServers` | In the MCP list, labelled with the pack; runs `npx -y @modelcontextprotocol/server-sequential-thinking` (needs Node.js) |
| Theme "Breezell Calm Dark" | `themes/calm-dark.json` | In the color theme picker |

Turn the pack off or remove it under **Breezell Console › Plugins › Installed** and all of it goes away.
A skill or MCP server of yours with the same name wins over the pack's.

The MCP server gives the agent tools, so the pack declares the `agent.tools` permission ("Agent tool registration"). Breezell asks for it once, when the pack first runs, and starts the server only if you allow it; you can turn it on or off under **Breezell Console › Plugins › Installed** › Starter Pack.

## Make your own

Start from the **Pack** template (Breezell Console › Plugins › Develop, or
`node breezell-plugin.mjs init my-pack --id me.my-pack --template pack`), then `npm run package:open`.
