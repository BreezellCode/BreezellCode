# Agent Bridge

Connects Breezell to the Claude Code you installed and signed in to yourself.

Anthropic's rules do not let other apps sign you in to a Claude account, and Breezell follows them. So Breezell does not sign you in: you install Claude Code, sign in to your account in Claude Code itself, and Breezell connects to it.

## What it needs

- A Breezell newer than 1.4.64. An older Breezell does not install it.
- Claude Code on this computer (on Windows, in Windows or inside WSL), signed in with your own account or API key.
- A signed-in Breezell account. No paid plan is needed.

## How to connect

1. Install Claude Code on this computer.
2. Run `claude` in a terminal and sign in to your account (type `/login` if it does not ask).
3. In Breezell, open Box › Models › Sign in and pick the Claude Code tile.
4. Turn on "Connect Claude Code" and read what it asks. Agreeing means you follow Anthropic's terms and let Breezell use what Claude Code reports about its connection and your account.

Where it looks: on macOS and Linux, wherever the native installer, Homebrew, npm or your system's packages put `claude`. On Windows, in Windows first, then inside WSL; a window opened in WSL uses the Claude Code of its own distribution first. The page shows which one it connected to.

Folders it works in: those of this computer, and those of a WSL window for the Claude Code in that distribution. An SSH window whose host is that same WSL distribution (an SSH server in WSL reached through localhost) counts too: the plugin checks that the host's machine id is the distribution's own before Claude Code works there. Other SSH hosts and containers are other machines: Claude Code on this computer cannot work in them, and the chat says so.

The page then shows "Connected" with your email, organization, plan, sign-in method and Claude Code version, and a bar for each usage limit (the current session and this week) with when it resets, in your computer's time, or why it is not connected. "Check again" asks Claude Code once more; coming back to Breezell checks again by itself.

## Chatting with Claude Code

Once Claude Code is connected, its models are in the chat's model picker, under Sign in › Claude Code: the ones Claude Code's own model picker offers, with their versions (Opus 5.5, Opus 4.8, Sonnet 4.6 and so on). Pick one and chat as with any model:

- Claude Code works in the conversation's project: its folder, with the window's other folders open to it too (`--add-dir`). It goes on where it left off in that conversation. In a window without a folder, it works in an empty folder of the plugin's own.
- How hard it thinks (effort) is set per model in the model menu, with the levels that model takes; unset, Claude Code uses its own default.
- What you attach goes with your message: pictures you paste and PDFs as they are, files and folders you drag in from the Explorer by their path, selected code with its lines, and problems, terminal output or quoted messages as text.
- The chat mode you pick applies to it. Plan: it plans with its own plan mode and changes nothing, and its plan shows as Breezell's plan card, which you can edit; Execute has it carried out in Agent mode. Analyze: it reads and answers. Chat: it answers. In Analyze and Chat it neither changes a file nor runs a command.
- Manual compress on the context ring has Claude Code compress its own context (its /compact), and the conversation goes on in the same session. When it compresses by itself, the chat shows "Condensing" meanwhile.
- The context ring under the chat shows how much of its model's context the conversation takes, Box › Token usage lists its requests by model, and each reply carries its token count.
- Your MCP servers in Breezell work in Claude Code, run by Breezell with its own connections (signed-in servers, and Windows servers while Claude Code runs in WSL, too). Turning one off in Breezell turns it off for Claude Code; Plan and Chat use none; Auto-approve MCP tools decides; each call shows as Breezell's MCP step of that server. "Use Claude Code's own MCP servers" on the plugin's page (on by default) keeps or leaves out the servers Claude Code has of its own: its settings, its plugins, your claude.ai connectors.
- When it asks you something, Breezell's question card shows its questions and options (and room for your own answer), and waits for you even with auto-approve on.
- Reading and searching files, fetching pages and searching the web run without asking, as for Breezell's own models. Its own MCP tools follow Auto-approve MCP tools.
- Its replies, its thinking, and each file it reads or changes and each command it runs show in the chat as they happen.
- Its file changes and commands are asked about as Breezell's own: Breezell's approval card asks you, or your settings answer (Auto-approve edits, Auto-approve terminal, Always allow on a command's card). For its other tools, what Claude Code's own settings allow runs without asking, as in a terminal, and the rest is asked on Breezell's card (Auto-approve MCP tools).
- In these conversations Claude Code's own Bash, Monitor, Edit and Write are off: it runs commands and changes files only through Breezell. In Plan, its own plan mode keeps Edit and Write to its plan file. Its other tools (reading, searching, the web) are its own.
- What Claude Code does shows as Breezell's own steps: files read, edits with their changes, new files, commands, searches, its to-do list.
- Its file changes go through Breezell's editor: you keep or undo them there, as Breezell's own model's, and they are listed in Code Review and the changed-files bar. Auto-approve edits, Auto-accept code changes and Auto open file on edit apply to them, and the lint and type errors a change leaves go back to Claude Code (Auto-fix lint errors).
- Its commands run in Breezell's terminal, in the window's default shell: each card shows the output as it runs, with Open terminal, Stop and Move to background, and Breezell's approval rules decide what runs unasked. When a command in the background ends, Claude Code hears of it.
- Each subagent Claude Code starts gets a page of its own, as Breezell's subagents do: its task, what it does, and its report. Its row in the conversation tells the step it is on and opens that page. Stop there stops that subagent alone.
- Stop stops Claude Code.
- In a conversation another model answered, or after you edited an earlier message, Claude Code is told what was said that it has not seen.
- A request to the model that fails on the way (a dropped connection, a busy API, a rate limit, or a reply that stays silent for 4 minutes) is handled as Breezell handles its own: you see its reconnecting countdown, and Claude Code goes on in the same session from where it stopped, as often as Box › Network & chat says. Retry on an error does the same.
- Your Breezell rules for the project (its `.breezell/rules/breezell.md`, else your global rules, and the plugins' rules that apply to Claude) go to Claude Code once, when a conversation starts, as standing instructions beside its CLAUDE.md: they are not sent again with each message. If you change them, Claude Code is told once, with your next message. Each project gets its own.
- What Breezell remembers goes with your message (the message's memory row shows which), and Breezell learns from finished turns as it does from its own (Super Memory). Claude Code can also look up Breezell's memories itself while it works, with Breezell's own memory lookup; each lookup shows in the chat as Breezell's own does.

Breezell asks once whether the plugin may answer conversations.

## Your Claude Code conversations in Breezell

The Claude Code conversations of the folders you open in Breezell show in that project's conversation list, under the name of their first message. Continue one and Claude Code goes on in the same session. They are brought in when Claude Code connects and every few minutes after, and with "Sync conversations":

- What you add to a conversation in a terminal later is added to it in Breezell; nothing shows twice, also for conversations you started in Breezell.
- A conversation you delete in Breezell stays deleted. By default only Breezell's copy is deleted; turn on "Delete in Claude Code too" on the plugin's page to delete the conversation in Claude Code as well (it asks first, and that cannot be undone).
- The newest 200 conversations of each folder are read.
- A conversation goes to the project it belongs to: a window syncs the project open in it, and on the Agents page the conversation shows under that project. A window with no project open has nothing to sync; it says so when you press "Sync conversations". The page and the notice after a sync name the project.

## Its page

Box › Plugins › Agent Bridge shows the same page as the Claude Code tile: the connection, your account, your usage, how the last sync went, and "Sync conversations".

## What it reads

Only what Claude Code prints for `claude --version`, `claude auth status` and its own `/usage` command (run as `claude -p /usage --no-session-persistence`: Claude Code answers it itself, no model is asked, none of your usage is spent, and nothing is added to your session history), the same as you would see in a terminal. For the model picker it asks Claude Code which models it offers (the same request Anthropic's Agent SDK makes; no message is sent, so no model is used). To bring your conversations in, it reads Claude Code's conversation files of the folders open in Breezell (in `~/.claude/projects`), and only those. It never reads, stores or passes on your sign-in credentials. The account and usage information is not sent anywhere: it stays on this computer, on that page. What you send in a conversation with a Claude Code model goes to your Claude Code, which handles it as it does in a terminal. While the switch is off, the plugin does not run Claude Code at all.
