# Focus Timer

A Pomodoro timer in a window of its own, also from the Start menu without opening the editor.

The official example of a Breezell **window plugin**. Source:
[`plugins/examples/focus-timer`](https://github.com/BreezellCode/BreezellCode/tree/main/plugins/examples/focus-timer).

## Use

- In Breezell: `Focus Timer: Open`, the **⌚ Timer** item in the status bar, or **Open Focus Timer** under
  Breezell Console › Plugins › Installed. The status bar shows the time left while the timer runs.
- Without the editor: under Plugins › Installed, **Add to Start menu** (Windows) adds a shortcut that opens
  only this window. Any `breezell://plugin-window/breezell.focus-timer/timer` link does the same.
  Like every plugin, it needs you to be signed in to Breezell; otherwise Breezell opens as usual.

Focus and break lengths, the end-of-phase sound and today's session count are kept in the window's own
storage. When Breezell opened the window, the AI's conversation turns show up in it (permission `chat.events`).

## How it is built

- `package.json` › `contributes.breezell.windows` declares the window: page, size, and `"requiresEditor": false`
  so it may open on its own.
- `window/` is the page. It loads `/__breezell/api.js` for `window.breezell` (`postMessage`, `onMessage`,
  `connected`). The window is sandboxed: no Node, no network, only the plugin's own files.
- `src/extension.ts` opens the window with `vscode.breezell.windows.open('timer')` and relays the turns.
- `"extensionKind": ["ui", "workspace"]`: windows need the plugin on this computer.
