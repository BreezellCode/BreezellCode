# Translations

A plugin's README, name, description and commands in the user's language.

## README in several languages

Breezell shows a plugin's README (as Markdown) on its market page. `README.md` is the English one and is
required. Translations go in the plugin's `i18n/` folder as `i18n/README.<locale>.md`, with these locales:

| Locale | Language |
|---|---|
| `zh-CN` | Simplified Chinese |
| `zh-TW` | Traditional Chinese |
| `ja` | Japanese |
| `ko` | Korean |
| `ru` | Russian |
| `es` | Spanish |
| `pt-BR` | Portuguese (Brazil) |

A user sees the README in Breezell's display language when the plugin has it, and the English one
otherwise. `pack` ships the translations and `submit` publishes them; other `README.*.md` names are left out.

In the README, raw HTML is not shown. Links open outside Breezell (http, https, mailto, or a file of the
market by relative path, shown on GitHub); images load over https or from the market.

## Name, description and commands in several languages

Use VS Code's own mechanism: write `"%key%"` in `package.json`, put the English texts in `package.nls.json`
at the plugin's root and the translations in `i18n/package.nls.<locale>.json` (`zh-cn`, `zh-tw`, `ja`, `ko`,
`ru`, `es`, `pt-br`). `pack` puts the translations at the package's root, where VS Code reads them:

```json
// package.json
"displayName": "%displayName%",
"description": "%description%",
"contributes": { "commands": [{ "command": "focusPlayer.open", "title": "%command.open%", "category": "Focus Player" }] }
```

```json
// i18n/package.nls.es.json
{ "description": "Sonidos ambientales para concentrarte y tu propia música…", "command.open": "Abrir" }
```

So a plugin's root keeps only the English `README.md` and `package.nls.json`; every translation is in `i18n/`
(translations at the root are still accepted).

`submit` puts the translated name and description in the market index: the market shows them in Breezell's
display language, English where a language is missing. Command titles and setting descriptions follow the
editor's display language, as for any VS Code extension. The market also translates the standard categories
(Themes, Programming Languages, Productivity, …); other categories are shown as written.
