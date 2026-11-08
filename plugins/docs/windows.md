# Windows

Windows of the plugin's own, with its page and layout.

A window plugin declares its windows in `package.json`:

```json
"contributes": {
	"breezell": {
		"windows": [{
			"id": "timer",
			"title": "Focus Timer",
			"entry": "window/index.html",
			"width": 380, "height": 560, "minWidth": 320, "minHeight": 460,
			"requiresEditor": false
		}]
	}
}
```

- The page is the plugin's own HTML, CSS and JavaScript, loaded from `breezell-plugin://<publisher.name>/`.
  It loads `/__breezell/api.js` for `window.breezell`: `postMessage(message)` (to the plugin's code),
  `onMessage(listener)` and `connected`.
- In the plugin's code, `vscode.breezell.windows.open('timer')` opens it (or brings it to the front) and
  returns an object to `postMessage` to the page, listen to `onDidReceiveMessage`, `onDidClose`, and `close()`.
- The window is sandboxed: no Node, no network (`connect-src 'self'`), only the plugin's files, no popups,
  no navigating away, and its own storage (`localStorage`, IndexedDB) separate from Breezell and other
  plugins. The title always ends with the plugin's name.
- Window plugins need `"extensionKind": ["ui", "workspace"]`: the window's files are read on the user's computer.

**Opening without the editor**: with `"requiresEditor": false` a window can open on its own, with no editor
window: from a shortcut that **Plugins › Installed** adds (**Add to Start menu** on Windows, **Add to applications
menu** on Linux: a `.desktop` file, **Add to Applications** on macOS: a small app in `~/Applications` that
Launchpad and Spotlight find), with
`breezell://plugin-window/<publisher.name>/<window id>`, or `Breezell --plugin-window <publisher.name>/<window id>`.
It still needs a signed-in Breezell account; otherwise Breezell opens as usual. A window opened on its own
has no editor to relay messages: `window.breezell.connected` is `false` and `postMessage` resolves to `false`.

## Overlay windows

A window declared with `"kind": "overlay"` is small, borderless and see-through, stays above every app,
never takes the focus (so never the keyboard), and is out of the taskbar and the window switcher. On macOS
it also shows over full-screen apps. It is for something that stays in sight while the user works elsewhere.

```json
"windows": [{ "id": "overlay", "kind": "overlay", "title": "Activity Island", "entry": "ui/overlay.html", "width": 220, "height": 32 }]
```

- It needs `ui.overlay` (dangerous). Ask with `requestPermission('ui.overlay')` while the user is in Breezell
  (`app.focus()`): `windows.open` asks too, and a question asked after they left waits in a window they
  cannot see.
- At most 560 × 480, at least 24 × 16. It opens hidden at the top of the screen: place it, then `show()`.
- `setBounds({ x, y, width, height }, { durationMs })` places it in screen pixels at 100% (the same as
  `windows.workArea()` and `PluginSurface.screenRect()`); with `durationMs` (up to 2000) it moves and resizes
  there on a curve that leaves quickly and settles slowly. A new call stops a move under way. It stays on a screen.
- `show()` shows it without taking the focus from the app in front; `hide()`; `close()`.
- `activate()` lets it take the keyboard, for a panel the user's click opened, until it loses the focus
  (a click anywhere else): then `onDidDeactivate` fires and it stops taking the focus again.
- `windows.focusEditor(windowId?)` brings this editor window, or another one, to the front, restored when
  minimized. Only while the plugin has an overlay open: it is for a click on it.
- `windows.overlaySupported()` is `false` on a native Wayland session, where an app can neither place its
  windows nor keep one above the others; `open` fails there with `BreezellNotSupported`. Under X11, or with
  Breezell started with `--ozone-platform=x11`, it works. Windows and macOS always.
- It closes when the user turns `ui.overlay` off, and with its editor window.

## Several editor windows

Each editor window runs its own copy of the plugin. They can tell each other what they know:

- `app.focus()` and `app.onDidChangeFocus` say whether an editor window has the focus (`editorFocused`),
  whether this one has it or had it last (`lastUsed`), and this window's id (`windowId`). Switching between
  Breezell's own windows is not a change; going to another app or minimizing is.
- `windows.broadcast(message)` reaches this plugin's copies in the other editor windows, nothing else
  (JSON, at most 1 MB); they hear it on `windows.onDidReceiveBroadcast` as `{ fromWindow, message }`.
  A window that closes says nothing: let each copy say it is there now and then.
- One way to show something once for all windows: only the copy whose window is `lastUsed` shows it,
  from what every copy broadcasts.
