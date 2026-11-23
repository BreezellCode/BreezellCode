# Changelog

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
