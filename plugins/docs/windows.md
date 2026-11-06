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
