# Security

What plugins cannot reach, and what users and review expect of them.

## What plugins cannot reach

To protect users and Breezell, plugins get none of these:

- The Breezell sign-in token: `vscode.authentication` gives no `breezell` session.
- API keys, the API Vault, conversation content, system prompts, cloud prompts, memories.
- Breezell's internal commands: `breezell.*` and the other Breezell commands are for Breezell and its built-in extensions only. `executeCommand` refuses them, and a `command:` link to one, in a notification, a page or a hover, does nothing.
- The commands `breezellIme.*`: Breezell hands the chat box's keys to them, so only the Breezell IME plugin (`breezell.ime`) may register them.
- Breezell's own files: the databases, chat transcripts, memories and the copies of its prompts, for `vscode.workspace.fs`, `openTextDocument`, `workspace.applyEdit` and `fs`, whichever the URI scheme or link. The app's own folders cannot be written to either, and no folder holding any of these can be copied, moved or removed in one go. A plugin's own storage and the user's files are not affected. Do not look for a way around this: review refuses a plugin that does.
- Breezell's main window: plugin code, HTML and CSS only run in their own pages (see [Changing Breezell's screens](ui.md)).

## Plugins are not sandboxed

A plugin runs as an ordinary extension: with Node, it can read and write the files it reaches, use the
network and start processes. Breezell keeps its plain file access away from Breezell's sign-ins, stored
conversations and program files, and keeps its code and CSS out of Breezell's own window. Everything else
is trust: the permissions say what a plugin does through Breezell, and review looks at the rest.

## What to do with what a plugin gets

- Keep what `chat.read`, `chat.input`, `chat.intercept`, `editor.read`, `agent.hooks` and agent tools hand you
  on the user's computer unless the plugin says, in its README and its screens, where it goes and why.
- Never send keys from `providers.listCustom()` anywhere but the provider they belong to.
- Ask for a permission where it is needed, and say what the plugin cannot do when it is refused.
- Store data in the extension's own storage (`context.globalStorageUri`, `context.secrets` for secrets).
- Never imitate Breezell's sign-in, plan or payment screens, and never work around billing or plan limits.
