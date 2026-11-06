# Restarting Breezell

When a plugin needs Breezell, its window or the plugins restarted.

A plugin can ask to restart, or with the user's leave restart without asking. It chooses what:

| `scope` | What restarts | Needed for |
|---|---|---|
| `extensionHost` | The plugins only, the quickest | Running a plugin's new code |
| `window` | This window | What is read when a window opens |
| `app` | All of Breezell, every window | A plugin's `vscode:uninstall` script: it runs at this restart |

**After an install, an update or a removal.** The plugin's code cannot ask then: an updated plugin's old copy runs until the extension host restarts, and a removed plugin is gone. So declare it in `package.json`:

```json
"contributes": {
	"breezell": {
		"restart": {
			"afterUpdate": { "scope": "window", "reason": "The new panel appears after a restart.", "l10n": { "zh-TW": "重新啟動後才會出現新面板。" } },
			"afterUninstall": { "scope": "app", "reason": "Finishes removing it from this computer." }
		}
	}
}
```

`afterInstall`, `afterUpdate` and `afterUninstall` each take a `scope` and a `reason` (at most 300 characters; the user is told why), with `l10n` for other languages. The install dialog lists them. Asking this way needs no permission. Without an `afterUpdate`, Breezell offers to restart the plugins when an updated plugin was running.

**While the plugin runs.** With the `app.restart` permission:

```ts
const restarting = await vscode.breezell?.app?.requestRestart({ scope: 'window', reason: 'The new settings apply after a restart.' });
```

It is `true` when the restart will happen. After the user says **Later**, further requests within 30 minutes return `false` without asking.

**Not asking.** Add `"force": true`, here or in `afterInstall` or `afterUpdate`, and declare the `app.forceRestart` permission. So that no plugin can trap a user in a loop of restarts, or cut off their work:

- The user is asked for the permission the first time. If they refuse, the plugin asks each time instead.
- It happens once per version of the plugin. After that, the plugin asks.
- It waits for a reply being written to end, for at most 10 minutes, and gives a few seconds' notice with your reason.
- A plugin being removed can only ask.

Every restart goes through the usual shutdown, so unsaved files are kept or asked about as in any restart.

An older Breezell does not install a plugin that declares a permission it does not know, so `app.restart` and `app.forceRestart` limit which versions can use the plugin. It ignores `contributes.breezell.restart`, so asking this way works everywhere it can.
