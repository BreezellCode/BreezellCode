# Focus Player

Ambient focus sounds and your own music, in step with Breezell: a chime when the AI finishes a turn.

The official example of a Breezell panel plugin. Source: [`plugins/examples/focus-player`](https://github.com/BreezellCode/BreezellCode/tree/main/plugins/examples/focus-player).

## Features

- **Ambient sound**: rain, deep focus (brown noise and a low drone) and a soft chord pad, all synthesized live with Web Audio. The plugin ships no audio files.
- **My music**: pick a folder (mp3, ogg, wav, flac, m4a, opus, webm) and play it in order.
- **With Breezell** (permission `chat.events`: mode, outcome and duration only, never the content):
  - a chime when a conversation turn finishes, and a different one when it fails or is stopped;
  - optionally, play while the agent works and pause when it is done;
  - recent activity in the panel.

## Use

- Open it from **Plugins** in the Box sidebar, or with **Open** in Breezell Console › Plugins.
- The **▶ Focus** item in the status bar plays and pauses.
- The panel is an editor tab: drag it out, or run "Move Editor into New Window", to give it a window of its own.
- Settings: `focusPlayer.chimeWhenTurnFinishes`, `focusPlayer.playWhileAgentWorks`, `focusPlayer.musicFolder`.

Like every Breezell plugin, it runs while you are signed in to Breezell.

## Develop

```bash
npm install
npm run typecheck
npm run package:open      # open source package
npm run package:closed    # closed source package
```

Open this folder in Breezell and press F5 to run it in a development window.
