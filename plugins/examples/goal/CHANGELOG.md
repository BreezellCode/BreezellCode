# Changelog

## 1.1.1

When the AI hands work to a subagent and its turn ends while the subagent is still working, the goal now waits for the subagent's report and the turn that report starts before it checks, instead of judging work that is not done yet. The strip says how many subagents it is waiting for. This needs a Breezell newer than 1.4.56.

## 1.1.0

With a Breezell newer than 1.4.54, `/goal` shows in the chat box as a tag, whether it is picked from the menu or typed at the start of a message, and only a message sent with that tag is a goal command. Text that merely reads `/goal …`, pasted in or kept as words, now goes to the AI as written instead of setting a goal. On an older Breezell nothing changes: a message that starts with `/goal` is the command.

## 1.0.1

The tokens on the strip keep moving during a long turn, also while the conversation waits for its analysis subagents or teammates, and with a Breezell newer than 1.4.54 they include what those helpers spend, so the token limit covers them too.

## 1.0.0

First version: a goal per conversation, checked after each turn, with limits on messages, tokens and time, `/goal` in the chat box, a button, a strip above the box, and tools for the AI to report through.
