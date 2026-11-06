# Errors

Every failed `vscode.breezell` call throws an `Error` whose `name` is one of these. Check the name.

| `name` | When | What to do |
|---|---|---|
| `BreezellNotSignedIn` | Nobody is signed in to Breezell | Wait for `account.onDidChangeSignIn`; do nothing meanwhile |
| `BreezellPermissionDenied` | The permission is not declared, or the user refused it or turned it off | Say what the plugin cannot do; offer `requestPermission` where it makes sense |
| `BreezellBlocked` | The plugin is on the market's blocklist | Nothing: every call fails until the user removes it |
| `BreezellNotAPlugin` | The extension has no `breezell` object in its `package.json` | Add it ([package.json](manifest.md)) |
| `BreezellInvalidRequest` | The call's arguments are wrong: no such conversation, a busy conversation, a model the picker does not offer, a refused attachment, a message too long | Fix the call; its message says what |
| `BreezellRateLimited` | Over a per-plugin limit: requests a minute, requests at a time, messages a minute | Wait and try again later; do not retry in a tight loop |
| `BreezellNoModel` | No chat model is selected and the request named none | Ask the user to pick a model, or pass `model` |
| `BreezellModelError` | The model failed: the provider's error, no answer in time, the API stopped answering, or no JSON when `responseFormat: 'json'` asked for it | Tell the user; retry once if it makes sense |
| `BreezellCancelled` | The request's cancellation token fired, or the extension host is going away | Nothing |
| `BreezellStoppedByUser` | An `automated` message after the user pressed Stop, before they wrote again | Wait for the user's next message |
| `BreezellPlanRequired` | `providers.listCustom()` for an account whose plan does not include Custom API | Say so; the user is not asked |

A plugin's own errors inside a tool (`invoke`), a send handler or a tool call handler never reach the user
as Breezell's: a tool's failure reaches the agent as a failed call, a handler's failure lets the message or
the call go on as it was.
