# Phone plugins

A phone plugin changes the **Breezell phone app**: a theme of its own, or a file of a kind shown another way than as
code (a preview in the app's code view). It is not an extension and nothing of it runs: it is one JSON file,
`phone-plugin.json`, that the app reads and draws. It cannot fetch anything, show HTML or reach the computer.

On the phone, plugins are under **Plugins** (This phone › Plugins, or the computer's Market and Installed rows):

- **Installed › On this phone**: each phone plugin with its switch, built in or from the market, an update the
  market offers, what it adds. Opened: its themes as cards (**Use this theme**), Update, Uninstall, its README.
- **Market › For this phone**: the phone plugins of this market, each with its first theme's card. Installing
  downloads the manifest, checks its size and SHA-256 against `phone/index.json`, reads it with the app's rules and
  keeps it on the phone. The phone's market is fetched from GitHub and the jsDelivr mirrors, and through the
  connected computer when it can fetch for the phone (a network that reaches neither still installs).

The computer's own plugins are listed beside them, as they were. For now the market lists Breezell's own phone
plugins; plugins from others will be taken by pull request later.

## The manifest

```json
{
	"id": "my-name.night",
	"version": "1.0.0",
	"phoneApi": 1,
	"displayName": "Night",
	"description": "A darker night for long sessions.",
	"l10n": { "zh-TW": { "displayName": "夜", "description": "適合長時間使用的更暗主題。" } },
	"author": { "name": "My Name", "url": "https://example.com" },
	"license": "MIT",
	"categories": ["Themes"],
	"tags": ["dark"],
	"themes": [
		{ "id": "night", "name": { "en": "Night", "zh-TW": "夜" }, "base": "dark", "palette": { "bg": "#0e1117", "surface": "#161b22", "ink": "#e6edf3" } }
	],
	"viewers": [
		{ "id": "ssv", "name": "Semicolon table", "renderer": "table", "extensions": ["ssv"], "options": { "separator": ";" } }
	]
}
```

| Field | |
|---|---|
| `id` | `publisher.name`, lower case (a-z, 0-9, -). One namespace with Breezell plugins: it cannot be a Breezell plugin's id in the market. |
| `version` | `1.0.0` (semver). A published version never changes; raise it for every change. |
| `phoneApi` | `1`. A manifest asking for more is listed as needing a newer version of the app. |
| `displayName`, `description` | English, at most 60 and 400 characters. |
| `l10n` | The name and description by README locale (`zh-TW`, `ja`, `ko`, ...). The app's Chinese is Traditional Chinese: it reads `zh-TW`, never `zh-CN`. |
| `author`, `license` | Who made it (a link only over https), its license. |
| `categories`, `tags` | What the market lists it under and finds it by (the app does not read them). |
| `onByDefault` | `true`: on without being switched on. A plugin from the market is switched on when it is installed. |
| `themes` | Up to 8 themes, below. |
| `viewers` | Up to 8 viewers, below. |

A key the app does not know is passed over, so a manifest for a newer app still reads on an older one. A plugin
must add at least one theme or one viewer the app can use.

## Themes

A theme starts from the app's dark or light theme (`base`) and sets some of its colours (`palette`). What it
leaves out is the base's. `name` is text or words by locale (`{ "en": …, "zh-TW": … }`).

| Variable | What it colours |
|---|---|
| `bg` | The page |
| `surface` | Lists, cards, the composer |
| `border`, `divider`, `border-strong` | Edges, lines between rows, strong edges (a switch's track, a radio) |
| `ink`, `muted` | Text, quiet text |
| `accent`, `on-accent` | Buttons, switches and the current choice; text on them |
| `accent-soft`, `accent-ink` | The chosen tab and pills; their text, marks and links |
| `ring` | The ring around a field in focus |
| `error-ink` | Errors |
| `icon-shadow`, `icon-shadow-lg` | The shadow under the app's icon (small, large) |
| `bubble` | The user's messages, pressed rows |
| `code-bg` | Code |
| `scrim` | What covers the page under a sheet |
| `syn-plain`, `syn-kw`, `syn-str`, `syn-num`, `syn-cmt`, `syn-type`, `syn-gutter` | Code: plain text, keywords, strings, numbers, comments, types, line numbers |
| `file-code`, `file-data` | Icons of code files and of data files |
| `link-hover` | A link under the pointer |

Values:

- A colour is written out: `#rgb`, `#rrggbb` (with alpha too), `rgb()`, `rgba()`, `hsl()`, `hsla()`. No colour
  names, no `var()`, no `env()`, nothing that loads (`url()`, `image-set()`), at most 120 characters.
- A shadow is at most 3 layers of `[inset] <x> <y> [blur] [spread] <colour>` in px (offsets up to 32, blur up to
  80, spread up to 8), each colour written out.
- What must read, reads: over the base, `ink` on `bg` and on `surface`, and `on-accent` on `accent`, at least 4.5:1;
  `muted` on `bg` at least 3:1; `bg`, `surface`, `ink`, `muted`, `accent` and `on-accent` with nothing showing
  through. A theme that fails is left out: a theme nobody can read could hide the switch that turns it off.

## Viewers

A viewer binds file extensions (lower case, without the dot, up to 12) to a renderer the app ships. In the code
view such a file gets a Preview button.

| `renderer` | What it shows | `options` |
|---|---|---|
| `markdown` | The page a Markdown file makes, drawn as the Agent's answers are | none |
| `table` | Separated values as rows of cards, each row opened to edit and save back | `separator`: `"auto"` (a tab for `.tsv`, a comma otherwise), `","`, `"\t"`, `";"` or `"\|"`; `header`: `false` when the first row is not the columns' names |

The app's own plugins use the same: [Markdown preview](../phone/packages/breezell.markdown-preview) binds `md`,
`markdown` and `mdx` to `markdown`; [Table](../phone/packages/breezell.table) binds `csv` and `tsv` to `table`.

## Limits

| What | Limit |
|---|---|
| The manifest | 32 KB |
| Themes, viewers | 8 each |
| Extensions of a viewer | 12, each at most 16 characters |
| A name, a description | 60, 400 characters |
| A palette value | 120 characters |
| Plugins from the market on one phone | 40 |

## Make one, check it, publish it

```bash
curl -O https://raw.githubusercontent.com/BreezellCode/BreezellCode/main/plugins/devkit/breezell-plugin.mjs
node breezell-plugin.mjs init night --id my-name.night --display-name "Night" --template phone
cd night
node tools/breezell-plugin.mjs phone-validate
```

`phone-validate` reads `phone-plugin.json` with the very rules the app reads it with and fails on anything the
app would leave out. Write a `README.md` (and `README.<locale>.md` translations in `i18n/`): the market shows it
on the plugin's page.

To publish, fork this repository, then:

```bash
node tools/breezell-plugin.mjs phone-submit --market <your clone>
```

It copies the manifest to `phone/packages/<id>/<version>/<id>-<version>.json`, its READMEs beside it, writes
`phone/packages/<id>/plugin.json` and `phone/index.json`. Then open a pull request. The market's check
(`index plugins --check`) reads every phone plugin with the app's rules too.

The [blocklist](publishing.md#blocklist) applies to phone plugins: a blocked one is not offered, and an installed
one is turned off with the reason.

The market's own phone plugins and their sources: [`examples/phone`](../examples/phone).
