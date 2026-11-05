# Goal

Give a conversation a goal, and the AI keeps working until it is met.

Normally the AI stops when it thinks it has answered. With a goal, each time it stops the work is checked against what you asked for. If it is not met yet, Goal sends the next message itself, saying what is still missing. It ends when the goal is met, when it cannot go on without you, or when it reaches a limit you set.

```
/goal all tests in the parser package pass and lint is clean
```

## Using it

Type `/goal` followed by what should be true when the work is done, pick it from the menu that opens at `/`, or press **Goal** beside the chat box. A strip above the box shows how it stands, and takes no room when there is no goal.

| Command | What it does |
| --- | --- |
| `/goal <what should be true>` | Sets the goal of this conversation and starts. A new goal replaces the old one. |
| `/goal status` | Says how it stands. |
| `/goal pause` | Stops after the current turn. Nothing more is sent. |
| `/goal resume` | Goes on. |
| `/goal clear` | Removes it. |

Each conversation has its own goal, and several can run at once.

## Limits

A goal always has a limit on the messages it may send: 20 unless you change it. You can also limit tokens and time. Set the defaults in **Feature Options › Goal**, or per goal, at either end of the message:

```
/goal --rounds 10 --tokens 200k --minutes 30 the site builds without warnings
```

At a limit it stops and tells you. `/goal resume` then allows as much again of that limit, or as much as you say: `/goal resume --rounds 40`.

Tokens are **new tokens** since the goal began, as your provider reports them: input not read from a cache, plus output, plus what checking the work used. They are for keeping an eye on a run, not a bill. Work done by subagents and Cross-Check is not in them, and a provider that reports nothing is not counted (the strip says so when that happens).

## What stops it

- **The goal is met.** After each turn the work is checked by your chat model, from the commands run, their results and what changed, not from what the AI says about them.
- **It cannot go on.** The check finds only you can move it on (a decision, credentials), or that it cannot be done.
- **Nothing is moving.** Three turns in a row used no tool.
- **A limit.**
- **You.** Press Stop on the reply and it pauses. It sends nothing more until you resume or set a new goal.

While a command it started is still running in the background, it waits for that to end. A server or a watcher does not count as something to wait for.

The done sound and notification come once, when the goal has really ended, not after each turn. Errors still sound at once.

## What it does not do

- It never approves a tool call. If a command needs your approval, the goal waits for you.
- It does not start by itself. After a restart or a sign-out a running goal is paused until you resume it.
- Its messages are not passed off as yours. They show in the chat labelled with its name, the AI is told you did not type them, and they do not end up in your memories.

## Permissions

Breezell asks for these the first time they are needed, and you can turn each off under **Plugins › Installed**.

| Permission | Why |
| --- | --- |
| `chat.events` | To know when a turn ends. |
| `chat.read` | To read the conversation with a goal, so the work can be checked. |
| `chat.send` | To send the next message, and to hold the done sound until the end. |
| `models.request` | To check the work with your chat model. This is billed like any request of yours. |
| `ui.contribute` | The button, the strip and the settings. |
| `chat.intercept` (optional) | To recognize `/goal` in the chat box. It answers only messages starting with `/goal`; others pass untouched and are not kept. Without it, use the button. |
| `agent.tools` (optional) | So the AI can report that it is done or blocked. Without it, the check after each turn still decides. |

It reads only conversations you gave a goal to, and sends what it reads only to your own chat model.

## Requirements

A Breezell newer than 1.4.41. On an older one it installs and does nothing, and says so when you press its command.

## Building

```
npm install
npm test            # logic, words and the strip's page
npm run package:open
```

## License

MIT
