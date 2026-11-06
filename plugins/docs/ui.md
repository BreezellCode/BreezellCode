# Breezell's screens

How a plugin adds to and changes Breezell's own screens: by declaring it in `contributes.breezell.ui`.

A plugin can add to Breezell's screens and change them, in any look and with any framework it likes,
as far as sign-in, plans, quota, approvals and plugin management stay as they are. It does so by
**declaring** what it wants in `contributes.breezell.ui`, and Breezell draws it. Its scripts and CSS
never run in Breezell's own window: only in its own pages, in frames of their own.

All of this needs a Breezell newer than 1.4.41; tokens, fonts, the stylesheet, variants, the number, text
and colour settings, and the parts and properties marked *new* below come in a later version still. List
its permissions in `optionalPermissions` and an older Breezell still installs the plugin, and ignores what
it declares here that it does not know.

| Layer | Declared in | Permission | What it does |
|---|---|---|---|
| Buttons | `ui.buttons` | `ui.contribute` | Entries in places Breezell opens, drawn in Breezell's look |
| Slash menu | `ui.slashCommands` | `ui.contribute` | Rows in the menu that opens at `/` in the chat box |
| Pages | `ui.surfaces` | `ui.contribute` | The plugin's own HTML, with any framework, in an isolated frame |
| Patches | `ui.patches` | `ui.modify` | Hide, move, restyle or replace named parts of the screens |
| Tokens | `ui.tokens` | `ui.modify` | Set Breezell's own design variables: every screen's palette, the accent, cards, the chat's font and bubbles |
| Fonts | `ui.fonts` | `ui.modify` | Font files of the plugin's, for its tokens and patches |
| Stylesheet | `ui.stylesheet` | `ui.modify` | Tokens and patches written as a CSS file |
| Variants | `ui.variants`, `when` | `ui.modify` | Looks that follow one of the plugin's own settings |
| Fences | `ui.renderers` | `chat.render` | A code fence of a language drawn by one of its pages |
| Modes | `ui.modes` | `ui.contribute` | An entry in the mode picker: a built-in mode plus the plugin's instructions |

A plugin needs the permission whichever list it is in (`permissions` or `optionalPermissions`), and
`validate` says when one is missing. An entry that does not pass is left out and the rest stay, so one
mistake does not cost a plugin everything, and the log says why.

## Buttons

```json
{ "id": "countLines", "slot": "code.block.actions", "title": "Count lines", "icon": "list-ordered",
  "command": "acme.countLines", "l10n": { "zh-TW": "計算行數" }, "order": 0 }
```

| `slot` | Where | The command receives |
|---|---|---|
| `chat.input.toolbar` | The row under the chat box | `{ slot, conversationId }` |
| `chat.message.actions` | The actions under a reply | `{ slot, conversationId, messageIndex }`, the index the turn starts at |
| `code.block.actions` | A code block's actions | `{ slot, language, code }`: pressing it hands over that block |

- `command` must be in the plugin's own `contributes.commands`, and cannot have `breezell` in its name.
- `icon` is a [codicon](https://microsoft.github.io/vscode-codicons/dist/codicon.html)'s name.
- At most 2 of a plugin's buttons in one place and 8 in all. Each shows which plugin it is from, and
  the user can hide it by right-clicking it.

## The slash menu

```json
[
  { "name": "goal", "description": "Set a goal", "icon": "target", "l10n": { "zh-TW": "設定目標" } },
  { "name": "goal pause", "description": "Pause the goal", "icon": "debug-pause", "command": "acme.pause" }
]
```

- `name` is one or two lowercase words without the slash, and cannot have `breezell` in it.
- With `command` (one of the plugin's own), picking the row runs it with `{ slot: "chat.input.slash", conversationId }`.
- With none, picking it puts `/name ` in the box to be written on. What is sent then is for the plugin's
  [send handler](chat.md#a-message-before-it-is-sent): without one it goes to the AI as an ordinary message.
- At most 8 per plugin. Each row says which plugin it is from. Typing a space means the rest are words: the
  menu keeps only names that go on like that, and closes when none does, so the message can be sent.

## Pages

```json
{ "id": "notes", "title": "Notes", "entry": "ui/notes.html", "slot": "chat.input.above", "height": 64,
  "network": ["https://api.example.com"] }
```

| `slot` | Where | Height up to |
|---|---|---|
| `chat.input.above` | Above the chat box | 320 |
| `chat.messages.top` | Above the messages | 320 |
| `chat.landing` | On the empty chat page | 480 |
| `chat.input.companion` | Floating on the chat box, see [below](#a-companion-on-the-chat-box) | 240 |
| none | Only where a patch or a fence puts it | 2000 |

The page runs in a frame with an origin of its own. It cannot reach Breezell's window, its storage or
its commands, and always shows a line saying which plugin it is from. It loads the plugin's own files
and nothing else, unless it lists https origins in `network`: those it may connect to and load images
and media from, but no scripts or styles. A framework is fine: bundle it into the plugin. Breezell's
theme is available as `--vscode-*` CSS variables.

```js
const vscode = acquireVsCodeApi();
addEventListener('message', ({ data }) => {
	if (data?.type === 'breezell.surface.context') {
		draw(data.context);                     // where it is, without any extension code
	}
});
vscode.postMessage({ __breezellSurfaceReady: true });    // tell me again, I am listening now
vscode.postMessage({ __breezellSurfaceHeight: 240 });    // the room it needs, within what its place allows
```

The context has ids (`conversationId`), and for a fence its `language`, `code` and `messageIndex`. To
talk to the plugin's code, listen to `vscode.breezell.ui.onDidOpenSurface`.

A page in one of the framed places with nothing to show can take no room at all: declare `"height": 0`, or
send `{ __breezellSurfaceHeight: 0 }`, and ask for room when it has something. It stays loaded meanwhile.

## A companion on the chat box

A page that floats on top of the chat box with no frame or line of its own, a pet for one. It takes no room, and everything it draws stays inside its rectangle.

```json
{ "id": "pet", "title": "Desk Pet", "entry": "ui/pet.html", "slot": "chat.input.companion", "width": 96, "height": 96 }
```

It floats over Breezell's screen, so it needs `ui.modify`, and a plugin has one. While the mouse is on it, Breezell says whose it is. Make your page's background transparent. It shows from the first thing it asks for. Its whole rectangle catches the mouse unless it names the parts that should, so keep that small:

```js
vscode.postMessage({ __breezellCompanion: { width: 96, height: 96, left: 120, lift: 0, ms: 0, hidden: false } });
```

`left` is from the left end of the box and `lift` up from it, `ms` how long moving there takes. Any of them can be left out. Each request sets the time anew, so don't repeat a place with no `ms` during a move: that ends it at once. Breezell keeps it on the box, between 32 and 240 pixels wide and tall, and answers with where it really is. While something waits on the user it stays on the box at 96 pixels at most, so ask for less then. After a failed turn it does the same until the user has seen it: a click on it, which Breezell takes and the page never hears, or leaving the conversation. Nothing else in the message goes anywhere.

A frame catches everything over its rectangle, whatever is drawn there, so what is empty in it blocks the chat beneath. Name the parts that should catch the mouse, and the rest lets it through:

```js
vscode.postMessage({ __breezellCompanion: { hit: [{ x: 40, y: 8, width: 100, height: 200 }] } });
```

`hit` is at most 4 rectangles from the frame's top left corner, to send again whenever they change. Without it the whole frame catches the mouse, as a page with buttons anywhere needs. With it Breezell sees the mouse only until it gets onto one of them, so tell it when the mouse leaves. The wheel over your page stays in your page unless you pass it on, and Breezell scrolls the chat only with the mouse over the page:

```js
element.addEventListener('pointerleave', () => vscode.postMessage({ __breezellCompanion: { mouseOut: true } }));
document.addEventListener('wheel', e => vscode.postMessage({ __breezellCompanion: { scroll: { deltaX: e.deltaX, deltaY: e.deltaY } } }), { passive: true });
```

Its page is told, with no text from the chat in any of it:

| Message `type` | With | When |
|---|---|---|
| `breezell.surface.context` | `context: { conversationId, language }` | At the start, and when the language changes |
| `breezell.companion.layout` | `left`, `lift`, `width`, `height`, `boxWidth`, `maxLift`, `restricted`, `zoom` (the window's: divide a distance in `screenX` or `screenY` by it to get your pixels) | It moved, or the room changed |
| `breezell.companion.pointer` | `x`, `y` from its own corner | The mouse moved over the chat, a few times a second |
| `breezell.companion.chat` | `activity` (`none`, `thinking`, `writing`, `working`, `waiting`), `tool` while working (`terminal`, `edit`, `search`, `web`, `other`) | What the chat is doing changed. Needs `chat.events` |
| `breezell.companion.turn` | `outcome` (`done`, `failed`) | A turn in its conversation ended. Needs `chat.events` |
| `breezell.companion.typing` | | A key was pressed in the chat box, at most ten times a second. Needs `chat.events` |

A page is made for each chat box and starts over when the user changes conversation, so keep what must last in the plugin's code. [Desk Pet](https://github.com/BreezellCode/BreezellCode/tree/main/plugins/examples/pet) is a whole one.

## Settings in Feature Options

A card with your plugin's settings, in Box > Feature Options, drawn by Breezell and saying whose it is. Box search finds it. It needs `ui.contribute`.

```json
"options": {
  "title": "Desk Pet", "l10n": { "zh-TW": "桌面寵物" },
  "items": [
    { "setting": "deskPet.visible", "title": "Show on the chat box" },
    { "setting": "deskPet.size", "title": "Size", "description": "How big she is.", "choices": [
      { "value": "small", "title": "Small" },
      { "value": "large", "title": "Large", "l10n": { "zh-TW": "大" } }
    ] }
  ]
}
```

Each `setting` must be in your own `contributes.configuration`, and one of these:

| Setting | Shows |
|---|---|
| `"type": "boolean"` | A switch |
| `"type": "string"` with an `enum` | `choices` taken from it (2 to 6) |
| `"type": "number"` or `"integer"` with `minimum` and `maximum` (and `multipleOf` for the step) | A slider *(new)* |
| `"type": "string"`, `"format": "color-hex"` | A colour picker, `#rrggbb` *(new)* |
| `"type": "string"` | A text field, up to its `maxLength` or 200 characters *(new)* |

At most 12 settings. One named after Breezell is refused. Breezell also checks at run time that your plugin is the one that registered the setting, so it writes only your own. Your code hears of a change as usual, with `onDidChangeConfiguration`.

## Patches

```json
{ "region": "chat.input.attach", "hide": true }
{ "region": "chat.input.mcp", "order": -1 }
{ "region": "chat.message.user", "style": { "borderColor": "var(--vscode-focusBorder)", "borderRadius": "12px", "maxWidth": "80%" } }
{ "region": "chat.landing", "replaceWith": "myLanding" }
```

| Part | What it takes |
|---|---|
| `chat.surface` | style: `backgroundColor`, one of the theme's own (below), `backgroundImage` |
| `chat.landing` | hide, replace, text style |
| `chat.landing.hero` | hide, replace |
| `chat.landing.hints` | hide |
| `chat.messages` | replace |
| `chat.rail` | hide |
| `chat.message.user`, `chat.message.assistant` | text style, `width`, `minWidth`, `maxWidth` |
| `chat.turnStats` | hide, text style, `opacity` |
| `chat.input.frame` | frame style, `backgroundColor` one of the theme's own |
| `chat.input.mode` | hide |
| `chat.input.mention`, `.browser`, `.attach`, `.imageMode`, `.quickPhrases`, `.promptOptimize`, `.mcp` | hide, order |
| `box.page` *(new)* | The page behind every Box page: `backgroundColor` one of the theme's own, `backgroundImage` |
| `quickEdit.widget` *(new)* | The Ctrl+K box: frame style, `backgroundColor` one of the theme's own |
| `tooltip` *(new)* | Breezell's tooltips: frame style, `color`, `fontSize`, `fontFamily`, `padding` |

Text style is `backgroundColor`, `backgroundImage`, `color`, `borderColor`, `borderRadius`, `borderWidth`,
`padding`, `margin`, `gap`, `boxShadow`, `fontSize` (9 to 32px), `fontWeight`, `fontFamily`, `lineHeight` (1 to 3),
`textAlign`, `letterSpacing`, `textTransform` and `transition`. Frame style is `backgroundColor`, `borderColor`,
`borderRadius`, `borderWidth`, `boxShadow` and `transition`.

A value is one plain value of that kind: no `url()`, selectors, `calc()` or a second declaration. `var()` takes
`--vscode-*` and `--breezell-*`.

- `borderWidth` goes up to 4px; `padding`, `margin`, `gap` and `borderRadius` up to 64px or 4em; only
  `borderRadius` takes a percentage (up to 50).
- `width` and `height` go up to 2000px or 100% and down to 48px or 20%, so a part cannot be made to vanish
  that way; a minimum may be 0.
- `boxShadow`: up to three layers, offsets up to 16px, blur up to 48px, spread up to 8px, so a shadow cannot
  cover what is beside its part.
- `backgroundImage`: a gradient, or an image file of your plugin's as `plugin:assets/paper.png` (png, jpg, gif,
  webp or avif, up to 2 MB).
- `transition` animates only what a plugin can set (colours, shadow, opacity), for up to a second.
- There is still no way to position, layer, transform, clip or hide anything with style.

What is on `chat.surface`, `chat.input.frame`, `box.page` and `quickEdit.widget` has to stay readable, so their
`backgroundColor` is `transparent` or `var(--vscode-<x>-background)`, with `<x>` one of `editor`, `sideBar`, `panel`,
`input`, `editorWidget`, `dropdown`, `menu`, `quickInput`, `notifications`.

When plugins disagree, the plugin whose id sorts first has it, so the outcome does not depend on which
started first. A part replaced by one plugin stays replaced if another hides it.

A page in place of `chat.messages` or `chat.landing` always offers the user a way back to the original.
And Breezell's message list comes back by itself while a tool waits for approval, a question waits for
an answer or an error is showing, and in the modes behind an unlock. The page stays loaded behind it.
Pages in `chat.messages.top` and `chat.input.above` make room in the same cases, and each of those places
takes at most a quarter of the chat's panel, however many plugins put a page there.

**No plugin can change** the account, plans, billing, upgrades, quota, custom API settings, the model
picker, Send and Stop, the context meter, tool approvals, errors, the Box's cards about these, the plugin
pages, permission dialogs or updates. These are not parts of the list, and naming one gets a clear refusal.
Tokens reach them only as the theme reaches them, and what the user must read keeps its contrast (below).

## Breezell's variables (tokens) *(new)*

```json
"tokens": {
  "bg-1": "#fffbe8", "bg-2": "#f6f1e3", "fg-1": "#2b2b2b", "border-2": "#e2d9c3",
  "accent": "#7a4b1f", "accent-fg": "#ffffff",
  "chat-font-family": "Lora, Georgia, serif", "bubble-radius": "18px", "card-shadow": "0 2px 8px rgba(0,0,0,.08)"
}
```

A token is one of Breezell's own design variables, written with or without `--breezell-`. Breezell's screens
read them where they would read the theme, so a plugin can repaint every screen at once; a token nobody sets
changes nothing.

| Tokens | What they colour or shape |
|---|---|
| `bg-1`, `bg-1-alt`, `bg-2`, `bg-2-alt`, `bg-2-hover`, `bg-3` | Backgrounds of every screen |
| `fg-0` to `fg-4` | Text, from strongest to faintest |
| `border-1` to `border-4`, `field-bg`, `field-border`, `field-border-focus`, `ring-color`, `link-color`, `warning` | Lines, fields, focus, links |
| `accent` + `accent-fg` | Buttons and the current choice (a pair, below) |
| `card`, `card-border`, `card-shadow` | Box cards and the chat's floating panels |
| `chat-font-family`, `chat-font-size`, `chat-background` | The chat panel; `chat-background` is a gradient or `plugin:` image |
| `bubble-radius`, `bubble-padding` | The user's message bubbles |
| `input-radius`, `input-shadow` | The chat box |
| `send-bg` + `send-fg`, `approve-bg` + `approve-fg`, `reject-bg` + `reject-fg`, `error-bg` + `error-fg` | Send, Apply and Reject on tool calls, error cards (pairs) |

Each takes a value of its kind, checked as a style is. **The pairs** colour what the user must always be able to
read: they are set together, both as written-out colours (`#rrggbb`, `rgb()`, `hsl()`), opaque, and with a contrast
of at least 4.5 (WCAG AA); otherwise neither is used. An error card keeps the theme's text colours whatever your
palette is, unless you set the error pair. A token may also take its value from one of your own settings, such as
a colour the user picks in Feature Options: `"link-color": { "setting": "myPlugin.accent" }` (not for a pair).
When plugins set the same token, the plugin whose id sorts first has it.

## Fonts and images *(new)*

```json
"fonts": [{ "family": "Lora", "file": "fonts/Lora.woff2" }, { "family": "Lora", "file": "fonts/Lora-Bold.woff2", "weight": "700" }]
```

A font is a `.woff2`, `.woff`, `.ttf` or `.otf` file in your plugin, up to 2 MB, at most 8. Breezell reads the file
and loads it under a name of its own, so a `fontFamily` or token of yours that names `Lora` gets your font, and no
plugin can replace a font the rest of the screen uses. An image is named as `plugin:<path>` in `backgroundImage`
or `chat-background`, read from your plugin the same way. Nothing is fetched from an address.

## A stylesheet *(new)*

```json
"stylesheet": "look.css"
```

```css
:root { --breezell-bg-1: #fffbe8; --breezell-fg-1: #2b2b2b; --breezell-chat-font-family: Lora, serif; }
::part(chat.message.user), ::part(chat.message.assistant) { border-radius: 16px; padding: 10px 14px; }
::part(box.page) { background-image: linear-gradient(#fffbe8, #f6f1e3); }
```

The file (up to 64 KB) is another way of writing tokens and patches, not CSS the screen runs: Breezell reads
`:root` rules of its variables and `::part(<name>)` rules of the parts above, with comments, and checks every value
as in `package.json`. Any other selector, an at-rule (`@import`, `@font-face`, `@media`) or `!important` is left out,
and `validate` lists each. What `package.json` declares wins over the stylesheet.

## Looks that follow your settings *(new)*

A patch or a set of tokens can hold only while one of your own settings has a value:

```json
"patches": [{ "region": "chat.landing", "style": { "padding": "8px" }, "when": { "setting": "myPlugin.dense", "value": true } }],
"tokens": [
  { "values": { "bg-1": "#fffbe8" } },
  { "values": { "bg-1": "#101418", "fg-1": "#e6e6e6" }, "when": { "setting": "myPlugin.theme", "value": "night" } }
],
"variants": {
  "setting": "myPlugin.theme",
  "values": {
    "paper": { "tokens": { "accent": "#7a4b1f", "accent-fg": "#ffffff" } },
    "night": { "tokens": { "accent": "#c8a97e", "accent-fg": "#101418" }, "patches": [{ "region": "chat.surface", "style": { "backgroundColor": "var(--vscode-editor-background)" } }] }
  }
}
```

`variants` is the same as a `when` on each of its tokens and patches. The setting must be in your own
`contributes.configuration`, and the value of its type. Put the setting in Feature Options (`ui.options`) and
the user switches your looks there; your code can switch them too, by writing its setting, and Breezell redraws.
Within your plugin a later set of tokens wins over an earlier one, so a variant wins over the base. At most 16
sets of tokens and 32 patches in all.

## Code fences

```json
{ "language": "chart", "surface": "chart" }
```

A fence in that language is drawn by that page once it is complete: until then it shows as code, and it
is given the fence's text as its context. A language for code or data, which the user has to be able to
read, copy and apply, cannot be taken (`typescript` and `ts`, `python`, `json`, `bash`, and so on), nor what
Breezell draws itself (`mermaid`, `causal`, `diff`, `markdown`, `math`): `validate` tells you. When plugins
want the same language, the plugin whose id sorts first has it.

## Modes

```json
{ "id": "reviewer", "title": "Reviewer", "description": "Reads before it writes.", "base": "agent",
  "icon": "checklist", "instructions": "modes/reviewer.md", "l10n": { "zh-TW": "審查員" },
  "descriptionL10n": { "zh-TW": "先讀再寫。" } }
```

`base` is `normal`, `plan`, `analyze` or `agent`. The mode is that mode: its tools, approvals, limits and
billing are all that mode's, and the file's text (up to 8,000 characters) is added to what the AI is told
while the mode is picked. The modes behind an unlock cannot be a base. The mode ends when the picker moves
to another mode, and it does not come back by itself. At most 4 per plugin.
