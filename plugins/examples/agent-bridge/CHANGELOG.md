# Changelog

## 1.0.4

- Box › Models: Cache hits and Request records list each of Claude Code's model requests on its own row, as for Breezell's own models (before: one row a turn). Its subagents' requests are rows of their own too, and the rows add up to Claude Code's own count. The context ring follows each request while a turn is under way.
- With Entanglement picked, a Claude Code conversation says once, above its reply, that Claude Code works in Agent mode: Entanglement is a mode of Breezell's own models, and its Entanglement Dashboard does not apply.

## 1.0.3

- A new icon.

## 1.0.2

- Published by DreamfallSerena.
- The chat mode you pick applies to Claude Code. In Plan it plans with Claude Code's own plan mode and changes nothing; its plan shows as Breezell's plan card, which you can edit, and Execute has Claude Code carry it out in Agent mode. In Analyze it reads and answers, in Chat it answers; neither changes a file or runs a command. Needs Breezell 1.4.66 or newer.
- What Claude Code uses shows in Breezell: the context ring under the chat shows how much of its model's context the conversation takes, Box › Token usage lists its requests by model (its subagents' models too), and each reply carries its token count. Needs Breezell 1.4.66 or newer.
- Manual compress on the context ring compresses Claude Code's own context, in its session (its /compact), showing "Compressing…" as for Breezell's own models. The ring then shows the size Claude Code counts after it. When Claude Code compresses by itself because its context is full, the chat shows "Condensing" meanwhile, as it does for Breezell's own models. Needs Breezell 1.4.66 or newer.
- Your MCP servers in Breezell work in Claude Code. Breezell runs them with its own connections, so a server already signed in, or one on Windows while Claude Code runs in WSL, just works. Turning a server or tool off in Breezell turns it off for Claude Code too, Plan and Chat use none (as for Breezell's own models), Auto-approve MCP tools decides as usual, and each call shows as Breezell's own MCP step of that server. A new switch on the plugin's page, "Use Claude Code's own MCP servers" (on by default), keeps or leaves out the MCP servers Claude Code has of its own. Needs Breezell 1.4.66 or newer.
- When Claude Code asks you something, Breezell's question card shows its questions and options, with room for your own answer, and Claude Code gets what you picked. It waits for you even with auto-approve on; Skip tells Claude Code you skipped. Needs Breezell 1.4.66 or newer.
- Claude Code no longer asks before reading or searching files outside the project, fetching a page or searching the web, as Breezell's own models don't. Its own MCP tools still follow Auto-approve MCP tools. A plan it makes by itself in Agent mode goes ahead, as in Breezell's Agent mode.
- Files you attach from outside the project are read without asking: you gave them.
- Pictures you paste and PDFs you attach in Breezell's chat go to Claude Code with your message, and it sees them. What you drag in from the Explorer reaches it too: files and folders by their path, selected code with its lines, and problems, terminal output or quoted messages as text. Needs Breezell 1.4.66 or newer.
- Your Breezell rules for the project go to Claude Code once, when a conversation starts, as standing instructions beside its CLAUDE.md, not again with each message. A change is told once, with your next message. Each project gets its own rules. Needs Breezell 1.4.66 or newer.

## 1.0.1

- The README said chatting needs a paid Breezell plan. It does not: a signed-in Breezell account is enough.

## 1.0.0

First release in the Breezell plugin market. Needs a Breezell newer than 1.4.64.

- A Claude Code tile on Box › Models › Sign in. Turn on "Connect Claude Code" and agree to what it asks: the page shows whether the Claude Code you installed and signed in to yourself is connected, your account, plan and sign-in method, its version, and a bar for each usage limit with when it resets, in your computer's time.
- Finds Claude Code wherever Anthropic's install guide puts it (the native installer, Homebrew, WinGet, npm, Linux packages, nvm, volta, bun, pnpm, scoop), and on Windows also inside WSL. A window opened in WSL uses the Claude Code of its own distribution first.
- Chat with Claude Code in Breezell: its models are in the chat's model picker under Sign in › Claude Code, with the effort levels each takes in the model menu. It works in the conversation's project (also in an SSH window whose host is the same WSL distribution), with the window's other folders, and goes on where it left off in that conversation.
- Its replies, its thinking (as a summary under "Thinking") and each step it takes show as they happen, as Breezell's own: files read, edits with their changes, new files, commands, searches, its to-do list. Each subagent it starts gets a page of its own, and Stop there stops that subagent alone.
- Its commands run in Breezell's terminal: command cards with live output, Open terminal, Stop and Move to background. A command that ends in the background tells Claude Code, which answers even when the conversation is idle.
- Its file changes go through Breezell's editor: you keep or undo them there, and they are listed in Code Review and the changed-files bar. The lint and type errors a change leaves go back to Claude Code.
- Auto-approve edits, Auto-approve terminal, Always allow, Auto-approve MCP tools, Auto-accept code changes, Auto open file on edit and Auto-fix lint errors apply to Claude Code as to Breezell's own model.
- A model request that fails on the way is handled as Breezell handles its own: Breezell's reconnecting countdown, then Claude Code goes on in the same session from where it stopped. Retry on an error does the same.
- What Breezell remembers goes with each message, finished turns are learned from (Super Memory), and Claude Code can look up Breezell's memories while it works.
- In a conversation another model answered, or after you edited an earlier message, Claude Code is told what it has not seen.
- Your Claude Code conversations of the projects you open in Breezell show in that project's conversation list and go on in Claude Code when you continue them. They are brought in when Claude Code connects, every few minutes after, and with "Sync conversations". With "Delete in Claude Code too" (off by default, asked before it turns on), deleting a conversation in Breezell also deletes it in Claude Code.
- Box › Plugins › Agent Bridge shows the connection, your account, your usage and how the last sync went.
- Breezell asks once whether the plugin may answer conversations. A signed-in Breezell account is enough; no paid plan is needed.
