# Getting started

From nothing to a plugin installed in your own Breezell. A plugin is a VS Code extension with a
`breezell` object in its `package.json` ([package.json](manifest.md)); everything VS Code extensions can
do, it can do, and `vscode.breezell` adds what is Breezell's ([API reference](api.md)).

**In Breezell**

Open **Breezell Console › Plugins › Develop**, fill in the id and name, choose a template (Pack,
Panel, AI command, Window or Minimal) and how to publish it (open or closed source), then pick a
folder. Open the new folder in a new window.

**From the command line** (Node.js 18 or later)

```bash
curl -O https://raw.githubusercontent.com/BreezellCode/BreezellCode/main/plugins/devkit/breezell-plugin.mjs
node breezell-plugin.mjs init my-plugin --id my-name.my-plugin --display-name "My Plugin" --template webview
cd my-plugin
npm install
```

Then open the folder in Breezell and press **F5**: the plugin runs in a development window.

| Command | What it does |
|---|---|
| `npm run build` / `npm run watch` | Bundle `src/extension.ts` into `dist/extension.js` with esbuild |
| `npm run typecheck` | TypeScript type check |
| `npm run validate` | Check `package.json` |
| `npm run package:open` | Pack as **open source**: the source and source maps ship in the package |
| `npm run package:closed` | Pack as **closed source**: minified code only (including the js and css in `media/`), no source, no source maps |
| `npm run submit -- --market <clone of the market>` | Add the package to the market (see "Publishing") |

## What a new plugin holds

| Path | What it is |
|---|---|
| `package.json` | The manifest: `breezell` (API version, permissions, source) and `contributes` |
| `src/extension.ts` | The plugin's code (`activate`, `deactivate`); not in a Pack |
| `types/breezell.d.ts` | The typings of `vscode.breezell`. Replace it with the market's newest copy when you need newer calls |
| `tools/breezell-plugin.mjs` | The devkit: `validate`, `pack`, `submit`. Replace it with the market's newest copy with the typings |
| `.agents/skills/breezell-plugin/` | The skill for an AI assistant, with these pages as references |
| `AGENTS.md`, `CLAUDE.md` | What an AI assistant reads first |
| `.vscode/launch.json`, `tasks.json` | F5 runs the plugin in a development window |
| `README.md`, `CHANGELOG.md` | Shown on the plugin's market page; `i18n/` holds translations ([Translations](translations.md)) |

## Run it

1. `npm install`, then open the folder in Breezell.
2. Press **F5**. A development window opens with the plugin running; set breakpoints in `src/`.
3. Sign in to Breezell in that window: plugins run only while someone is signed in, and every
   `vscode.breezell` call fails with `BreezellNotSignedIn` otherwise.
4. Change the code, then **Developer: Restart Extension Host** (or reload the window) to run it again.
   `npm run watch` rebuilds as you save.

The plugin's log lines (`console.log`) are in **Help › Toggle Developer Tools** of the development window,
and Breezell's own lines about plugins start with `[BreezellPlugins]` in the **Window** output channel:
a declaration Breezell left out says why there.

## Check it

- `npm run validate` checks `package.json` the way Breezell reads it: permissions, every
  `contributes.breezell` entry, files it names. What it reports, Breezell would leave out.
- `npm run typecheck` checks the code against the typings.
- A permission the plugin uses must be declared; `validate` names the missing ones.

## Install it

`npm run package:open` (or `package:closed`) writes `<publisher.name>-<version>.vsix`. In Breezell,
**Plugins › Installed › Install local .vsix** installs it. A local plugin works the same as one from
the market; the user is told it was not reviewed.

## Before you publish

- [ ] `validate` and `typecheck` pass; the plugin does what it says with every permission turned off too
      (it says what it cannot do instead of failing silently).
- [ ] Only the permissions it needs, each explained in the README.
- [ ] It works in a remote (WSL, SSH) window: `"extensionKind": ["ui", "workspace"]`.
- [ ] It handles being signed out, blocked, and a call failing with each [error](errors.md) it can meet.
- [ ] The README says what it does, in English, with translations if you have them.
- [ ] Then [Publishing](publishing.md).
