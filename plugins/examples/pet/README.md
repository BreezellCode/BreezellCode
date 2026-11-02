# Desk Pet

A small wind spirit in the Japanese anime style, who sits on your chat box and keeps you company while the AI works.

It never reads your messages. Breezell tells it what the chat is doing (thinking, writing, running a tool, waiting for you) and whether a turn went well, and no text of any kind.

## What it does

- **Follows the chat.** Thought bubbles while the AI thinks, a sign when the AI is waiting for you, confetti when a turn finishes, and a word or two when one fails. You can tell what is going on from the corner of your eye.
- **Grows with you.** Every finished turn earns experience. Its twelve levels follow the Beaufort scale, from Light Air to Hurricane.
- **Likes attention.** Click or stroke it, feed it and play with it from its card. Right-click it to see its card.
- **Goes where you put it.** Drag it anywhere along the box, even up over the chat, and it floats back down. It wanders about by itself now and then and dozes off when nothing is going on. Its hair moves in the wind, and it blinks.

## What it asks for

- **Change Breezell's screens** (`ui.modify`): it floats on top of the chat box. Breezell asks you when it arrives.
- **Know when a turn starts and ends** (`chat.events`): what the chat is doing, with no content.

Whatever it draws stays inside a small frame. While something waits for you it stays small and out of the way.

## Settings

| Setting | What it does |
|---|---|
| `deskPet.visible` | Show the pet. **Hide** on its card turns this off |
| `deskPet.size` | `small`, `medium` or `large` |
| `deskPet.speech` | Let it say things in speech bubbles |

They are also in Box > Feature Options. **Desk Pet: Show or Hide** in the Command Palette brings it back after you hide it.

Needs a Breezell that has chat box companions. On an older one the plugin installs and does nothing.
