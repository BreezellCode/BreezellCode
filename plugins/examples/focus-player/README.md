# Focus Player

Ambient focus sounds and your own music, in step with Breezell: a chime when the AI finishes a turn.

This is the official example Breezell plugin. Its source is in
[`plugins/examples/focus-player`](https://github.com/BreezellCode/BreezellCode/tree/main/plugins/examples/focus-player).

## Features

- **Ambient sound**: rain, deep focus (brown noise and a low drone) and a soft chord pad, all
  synthesized live with Web Audio. The plugin ships no audio files.
- **My music**: pick a folder (mp3, ogg, wav, flac, m4a, opus, webm) and play it in order.
- **With Breezell** (permission `chat.events`: mode, outcome and duration only, never the content)
  - A chime when a conversation turn finishes, and a different one when it fails or is stopped.
  - Optional: play while the agent works, pause when it is done.
  - Recent activity in the panel.
- **A window of its own**: the panel is an editor tab. Drag it out, or run "Move Editor into New Window".

## Use

- Commands: `Focus Player: Open`, `Focus Player: Play / Pause`, `Focus Player: Choose Music Folder…`
- The **▶ Focus** status bar item plays and pauses.
- Settings: `focusPlayer.chimeWhenTurnFinishes`, `focusPlayer.playWhileAgentWorks`, `focusPlayer.musicFolder`

Like every Breezell plugin, it runs while you are signed in to Breezell.

## Develop

```bash
npm install
npm run typecheck
npm run package:open      # open source package
npm run package:closed    # closed source package
```

Open this folder in Breezell and press F5 to run it in a development window.
