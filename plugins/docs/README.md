# Breezell plugin documentation

Everything you need to build a Breezell plugin, from the first command to the market. The
[market overview](../README.md) is the short version; these pages are the whole of it. They are also
the reference of the AI skill every new plugin ships with (see [Working with an AI assistant](#working-with-an-ai-assistant)).

Typings: [`devkit/breezell.d.ts`](https://github.com/BreezellCode/BreezellCode/blob/main/plugins/devkit/breezell.d.ts)
(in a plugin made from a template: `types/breezell.d.ts`).

## Read in this order

| Page | What it covers |
|---|---|
| [Getting started](getting-started.md) | Make a plugin, run it, check it, pack it, install it |
| [package.json](manifest.md) | The `breezell` object, `contributes.breezell`, how a plugin opens |
| [Permissions](permissions.md) | Every permission, which are asked for, what each gives |
| [API reference](api.md) | Every call of `vscode.breezell`, with its permission and limits |
| [Errors](errors.md) | What each error name means and what to do |
| [Limits](limits.md) | Every limit in one table |

## By topic

| Page | What it covers |
|---|---|
| [The chat](chat.md) | Turn events, reading conversations, sending, stopping, work over many turns, a message before it is sent |
| [Models and providers](models.md) | The user's models: requests, streaming, images, JSON; the model picker; custom APIs |
| [The agent](agent.md) | Packs (skills, rules, MCP servers), agent tools, watching and refusing the agent's tool calls |
| [Breezell's screens](ui.md) | Buttons, the slash menu, pages, a companion, settings, patches, tokens, fonts, a stylesheet, variants, code fences, modes |
| [Windows](windows.md) | Windows of the plugin's own, also without an editor |
| [Restarting Breezell](restart.md) | Asking for a restart, after an install or an update too |
| [Translations](translations.md) | The README, name, description and commands in other languages |
| [Security](security.md) | What plugins cannot reach, and what users and review expect |
| [Publishing](publishing.md) | Open or closed source, the market, review, the blocklist |
| [Recipes](recipes.md) | Whole small plugins for common tasks |

## Versions

A plugin declares the API generation it was written for in `breezell.apiVersion` (1). Breezell adds to
generation 1 without breaking it; pages mark what needs a newer Breezell. A permission an older Breezell
does not know refuses the install when it is in `permissions`, so put new ones in `optionalPermissions`
and check `vscode.breezell.permissions` (or a call's error) before using them. Fields an older Breezell
does not know in `contributes.breezell` are ignored, so declaring them is safe.

## Working with an AI assistant

Every plugin made from a template (in Breezell or with `breezell-plugin.mjs init`) has:

- `.agents/skills/breezell-plugin/`: a skill with the workflow, the rules and these pages as its
  references. Breezell's own agent finds it in the plugin's folder, as do tools that read `.agents/skills`.
- `AGENTS.md`, and `CLAUDE.md` pointing to it: what any assistant should read first.

Ask the assistant for what you want ("a panel that lists the files the agent changed"); the skill tells it
which permissions that needs, which calls to use, and to run `npm run validate` and `npm run typecheck`
before it says it is done. The same pages are here for you to read.

