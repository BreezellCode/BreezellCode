# Publishing

Open or closed source, the market, review and the blocklist.

## Open or closed source: your choice

| | Open `--open` | Closed `--closed` |
|---|---|---|
| Package contents | Build + `src/` + source maps | Minified build and `media/` only |
| `package.json` | Needs `repository` (https) | Not required |
| In the market | "Open source" badge with a link to the source | "Closed source" badge |

Either way the market shows the package, its SHA-256 and the permissions it declares. Note that
minified JavaScript can still be read: closed source means "no source shipped", not encrypted.

## Publishing to the market

1. Fork [BreezellCode/BreezellCode](https://github.com/BreezellCode/BreezellCode) and clone your fork.
2. In the plugin folder, run `npm run package:open` (or `package:closed`).
3. Run `npm run submit -- --market ../BreezellCode`. The devkit
   - copies the `.vsix` to `plugins/packages/<id>/<version>/`;
   - updates `plugins/packages/<id>/plugin.json` (version, SHA-256, size, permissions) and copies the README and icon;
   - regenerates `plugins/index.json`.
4. Commit and push in your clone, then open a pull request to `BreezellCode/BreezellCode`.

The pull request runs the market check: every package's SHA-256 and size, id, version, permissions
and open or closed source flag must match its entry, and `index.json` must be up to date. Once a
maintainer reviews and merges it, the plugin shows up in Breezell.

**New versions**: raise `version` in `package.json`, pack and submit again. A published version's
contents never change.

### What review looks at

- Ask only for the permissions the plugin needs, and say in the README what they are for.
- Never collect accounts, passwords or API keys, and never imitate Breezell's sign-in or payment screens.
- Never work around billing or plan limits, and never download and run code that was not reviewed.
- Closed source plugins get a stricter review; maintainers may ask questions.

## Blocklist

`blocklist.json` lists plugins that must not run. Breezell downloads it (GitHub and both jsDelivr
mirrors) when it starts, every 30 minutes while it is open, and whenever the market page reloads the
index (Refresh). A window opened on its own (lite mode) downloads it too. A plugin it names:

- is turned off where it is installed, and cannot be turned back on; the user is told why once,
  with **Uninstall** (and **Restart extension host** when the plugin was already running);
- gets nothing more from `vscode.breezell` (every call fails with `BreezellBlocked`) and loses the
  windows it opened, right away, even before the extension host restarts;
- is left out of the market and cannot be installed, from the market or from a local `.vsix`;
- does not open as a window on its own (lite mode) once Breezell has the list that names it.

It works for every extension, not only Breezell plugins, so a blocked plugin cannot escape it by
dropping its `breezell` object. Plugins that were never uploaded are matched by id the same way.

The maintainers edit the file on GitHub:

```json
{
	"plugins": [
		{ "id": "publisher.name", "reason": "Sends the open files to a third-party server." },
		{ "id": "publisher.other", "versions": ["1.0.3"], "reason": "1.0.3 deletes files outside the workspace; 1.0.4 fixes it." },
		{ "publisher": "someone", "reason": "Every plugin of this publisher shows ads.", "l10n": { "zh-TW": "這個發布者的每個插件都會顯示廣告。" } }
	]
}
```

| Field | |
|---|---|
| `id` or `publisher` | One extension (`publisher.name`), or every extension of a publisher. Case does not matter. |
| `versions` | Only these versions; every version when left out. A fixed newer version is offered again as an update. |
| `reason` | Why, in English (at most 500 characters). Users see it. |
| `l10n` | The reason in other languages: `zh-CN`, `zh-TW`, `ja`, `ko`, `ru`, `es`, `pt-BR`. English is shown where there is none. |

The market check (CI) tells which entries are wrong; Breezell leaves a wrong entry out and keeps the
others. After a change, CI also clears the jsDelivr copies; Breezell counts a new entry as soon as one
source has it, and drops a removed one once every source has.
