# Agents of Agent Bridge

Each command-line agent Agent Bridge connects (Claude Code, Antigravity CLI) is a folder here, on the framework in
`src/core/`. What every agent shares lives in `core/` once; an agent's folder holds only what is its own.

## The framework (`src/core/`)

| Module | What it does for every agent |
| --- | --- |
| `bridge.ts` | `AgentBridge`: the tile's switch, its checks (cheap quiet ones, shared between windows), the models in the picker, its usage bars, and each turn's folder, files and Breezell tools. |
| `checks.ts` | What one window's checks found, read by Breezell's other windows, so that only one of them starts the agent. |
| `cli.ts` | Finding a program (PATH, installers' folders, WSL), running it, its version, its program file's stamp. |
| `process.ts` | `AgentChild`: the program for as long as it runs (its output's lines to the turn it works for, its stderr tail, its end). `AgentProcess`: one turn's hold on it (Stop the agent's own way, then ended; the stalled-model watchdog; its exit error). |
| `keepAlive.ts` | `KeptProcesses`: a conversation's program kept between its turns while the user turned that on: one a conversation, reused only when started the same way and in the same session, closed once idle, on work said between turns, or when the tile goes. `keepAlivePicker.ts` is the tiles' button for it. |
| `lines.ts` | JSON lines from a stream (`onJsonLines`) and from bytes read as a file grows (`LineSplitter`), each line costing its length once. |
| `turn.ts` | The turn Breezell gives and the reply it takes: the message an agent is sent (attachments, memories, rules, notices, mode), the plan card. |
| `tools.ts` | Breezell's tools as the MCP server "breezell": tools/list, tools/call, approvals for an agent that does not ask itself. |
| `mcpHttp.ts` | That MCP server on the loopback, for an agent that connects to MCP servers itself (and its relay for an agent in WSL). |
| `views.ts` | How a tool call is drawn as Breezell's own (read, edit, command…), and Breezell's own tools' views. |
| `usage.ts` | Token rows of model requests, as Breezell's request records take them. |
| `paths.ts`, `workspace.ts` | Paths as the agent, Windows and WSL name them; the window's folders as the agent reaches them. |
| `files.ts` | Removing an agent's own files of a deleted conversation, never following a link. |
| `texts.ts`, `limits.ts` | What every tile's page is made of: languages, usage bars, reset times. |

## An agent's folder

| File | What is in it |
| --- | --- |
| `program.ts` | Its `ProgramSpec` (names, installers' folders, its config folder in WSL) and its `inspect(target, known)`: signed in or not, from its own commands. |
| `turn.ts` | Its turn: arguments, its stream protocol into `Reply` events, on `AgentProcess` and `onJsonLines`, Breezell's tools through `createBreezellToolHost`. |
| `views.ts` | Its own tools' calls as `ToolView`s. |
| `bridge.ts` | `class XBridge extends AgentBridge<XCheck>`: the hooks below. |
| `texts.ts` | Its page's words (en, zh-TW, zh-CN). |
| `index.ts` | What the rest of the plugin and the tests take from it (no `vscode` import). |

## Adding an agent

1. **Find and ask it** (`program.ts`): a `ProgramSpec`, and `inspect(target, { version })` returning a check (`kind`
   `signedIn` / `notSignedIn` / `failed`…, with `where`, `location`, `version`). Ask only its own commands; never read
   its credentials. When `version` is given, do not ask `--version` again.
2. **Its turn** (`turn.ts`): start it with `target.start(args, cwd, env)` in an `AgentChild`, hold it for the turn with
   `AgentProcess` (its Stop and the watchdog), listen to its messages (`agent.listen`), tell Breezell through `reply`
   (`text`, `reasoning`, `tool` with a `ToolView`, `usage` with `usageRow`, `session`). Offer Breezell's tools with
   `createBreezellToolHost` (stdio control messages, or `McpHttpServer` for an agent that connects to MCP servers
   itself). To be kept between turns (`controls.keepAlive`): `pool.take` before starting (with a `key` of everything
   it is started with but its session), `pool.adopt` a program it started, and at a turn that ended well
   `pool.release` it instead of closing its input; say what of its output is work (`isWork`).
3. **Its tile** (`bridge.ts`): extend `AgentBridge` and give `program`, `nativeConfigDir()`, `inspect()`,
   `notInstalled()`, `isSignedIn()`, `modelsKey()`, `listModels()`, `statusOf()`, `texts()`, `runOn()`; optionally
   `fetchLimits()` (its usage, no model request), `controlsOf()`, `sharesModels` (its models need a run of its program
   to list), `afterModels()`, `forgetTarget()`. The base class does the rest: checks, caching, the picker, folders.
4. **Register it**: an entry in `agents/index.ts` (its tile id, its bridge, its commands), and its tile, setting and
   commands in `package.json` (`contributes.breezell.ui.signIns`, `contributes.configuration`, `contributes.commands`).
5. **Test it** against a fake process (`test/fake-child.mjs`): what goes in, what comes out of its stream. No real
   agent runs in the tests.

## What a check costs

Each start of an agent's program is a few hundred MB and up to seconds of CPU (Claude Code's `/usage` reads its whole
local history). So `AgentBridge` asks no more than it must: a quiet check (coming back to Breezell) reuses the program
found before and its version while its file is unchanged, and any window takes what another window found within
`FOCUS_RECHECK_MS` (usage within `LIMITS_REFRESH_MS`). "Check again" and turning the switch on always ask everything.
