# Activity Island

Breezell's title bar shows what the agent is doing, in a capsule that morphs. Leave Breezell, or minimize it, and the capsule flies out to the top of the screen, where it floats above every app. Click it and it opens into a panel with your conversations and the latest words of each reply. Come back and it flies into the title bar again.

## What it does

- **Takes the middle of the title bar.** At rest it shows your workspace's name, and a click opens the search, as the search bar did. The notification bell and the update button stay next to it.
- **Morphs while Breezell works.** The capsule widens to the step the agent is on, with the model's mark, a wave and a clock. It tells you when a chat waits for you, when a turn is done and how long it took, and when something went wrong, with a **View** button that opens the conversation.
- **Shows tasks.** A build or test task runs in the capsule when the agent is idle, and in a small bubble beside it when the agent is busy. **View** on a failed task opens its terminal.
- **Floats outside the window.** When you go to another app or minimize Breezell, the capsule flies from the title bar to the top of the screen and turns into a dark pill above everything else. With nothing going on it says **All quiet**.
- **Opens into a panel.** Click the pill and it opens like an expanded island: how many chats run or wait for you, each conversation with what it is doing, its clock and the last words of its reply, and the tasks. Click a conversation to go straight to it, or **Back to editor**. A click anywhere else, or Esc, closes the panel.
- **Every Breezell window at once.** With several windows open, one island outside shows them all, the most pressing first, and the panel lists them window by window with **Go** to switch.

What it reads: the step the agent is on, which model works, how a build or test task goes, and, if you allow **Read your conversations**, the titles of your conversations and the last words of each reply, only to show them in the panel. Nothing leaves your computer.

## What it asks for

- **Change Breezell's screens** (`ui.modify`): its page takes the middle of the title bar. Breezell asks you when it arrives.
- **Show Breezell's activity** (`activity.read`): the agent's step, the model and the task, never what the messages say. On unless you turn it off.
- **Float a small window above other apps** (`ui.overlay`): the island outside the window. Breezell asks you while you are in Breezell. Refuse it and the island stays in the title bar.
- **Read your conversations** (`chat.read`, optional): the titles and the last words of replies in the panel. Breezell asks you while you are in Breezell. Refuse it and the panel shows what each window's agent is doing instead.
- **Add to Feature Options** (`ui.contribute`): its setting in Box > Feature Options.

## Settings

| Setting | What it does |
|---|---|
| `activityIsland.floatOutside` | Float the island at the top of the screen when you leave Breezell. Off: it stays in the title bar |

It is also in Box > Feature Options. Breezell's **Reduce Motion** makes it move at once.

## Windows, macOS and Linux

It floats on Windows, on macOS (also over full-screen apps) and on Linux under X11.

**On a Wayland session it stays in the title bar.** Wayland does not let an app place its own windows or keep one above the others, so there is nowhere for the island to go. The plugin tells you once. Under X11, or with Breezell started with `--ozone-platform=x11`, it floats.

Needs Breezell 1.4.53 or later. On an older one Breezell does not install it.
