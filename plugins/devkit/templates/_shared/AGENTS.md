# Notes for AI assistants

This folder is the Breezell plugin `{{id}}` ({{displayName}}): a VS Code extension whose `package.json`
has a `breezell` object and which uses `vscode.breezell`.

Before changing anything, read `.agents/skills/breezell-plugin/SKILL.md`, then the reference page in
`.agents/skills/breezell-plugin/references/` for what you touch. The typings of `vscode.breezell` are in
`types/breezell.d.ts`.

| Command | What it does |
|---|---|
| `npm install` | Install the tools |
| `npm run build` / `npm run watch` | Build `src/` into `dist/` (not in a Pack: it has no code) |
| `npm run typecheck` | Type check (not in a Pack) |
| `npm run validate` | Check `package.json` as Breezell reads it |
| `npm run package:open` / `package:closed` | Pack a `.vsix` |

Done means `validate` passes and, for a plugin with code, `typecheck` passes and the build works. Declare only the permissions the code uses,
handle refusals by the error's `name`, and keep the market texts (README, package.json) in English.
