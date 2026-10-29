# {{displayName}}

{{description}}

A [Breezell](https://breezell.com) plugin (`{{id}}`).

## Develop

```bash
npm install
```

Open this folder in Breezell and press **F5**: the plugin runs in a development window.
Plugins run only while you are signed in to Breezell.

- `src/extension.ts` — the plugin. Besides the VS Code API it can use `vscode.breezell`
  (typings in `types/breezell.d.ts`); ask only for the permissions you need in
  `package.json` › `breezell.permissions`.
- `npm run validate` — check `package.json`.

## Package

```bash
npm run package:open     # open source: the source ships in the package
npm run package:closed   # closed source: minified build only, no source
```

Either command writes `{{id}}-<version>.vsix`. Install it in Breezell from
**Plugins › Installed › Install local .vsix**. It works without uploading it anywhere.

## Publish to the Breezell plugin market

1. Fork [BreezellCode/BreezellCode](https://github.com/BreezellCode/BreezellCode) and clone your fork.
2. `node tools/breezell-plugin.mjs submit --market <path to your clone>`
3. Commit, push and open a pull request. The market check runs on it.

Guide: <https://github.com/BreezellCode/BreezellCode/tree/main/plugins>
