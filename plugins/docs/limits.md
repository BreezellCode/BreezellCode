# Limits

What Breezell allows a plugin, in one place. Pages explain each.

## Calls

| What | Limit |
|---|---|
| `models.request` | 2 at a time and 20 a minute per plugin; 100 messages, 200,000 characters, a system text of 20,000; 8 images (8,000,000 base64 characters each, 24,000,000 in all); `maxOutputTokens` 16 to 65,536; 5 minutes in all |
| `chat.send` | 10 messages a minute per plugin; 50,000 characters; 10 attachments, images up to 10 MB |
| `chat.read` | Tool parameters and results cut at 20,000 characters; changes every 150 ms per conversation; `conversationOfTurn` remembers 200 turns |
| Send handler | 3 seconds per plugin, 6 for all; a changed message up to 400,000 characters; a stop reason 300; context 20,000 per plugin, 50,000 for all |
| Tool call handler | 3 seconds per plugin, 6 for all; a refusal's reason 500 characters |
| Agent tools | 16 per plugin; a description 2,000 characters, a schema 16,000; 5 minutes per call; a result 400,000 characters |
| Rules | 8,000 characters per file, 24,000 for all plugins |
| Restart | A reason 300 characters; after **Later**, 30 minutes of quiet; forcing once per plugin version, waiting up to 10 minutes for a reply to end |

## Screens (`contributes.breezell.ui`)

| What | Limit |
|---|---|
| Buttons | 8, at most 2 in one place; a title 40 characters, a tooltip 120 |
| Slash menu rows | 8 |
| Pages | 6; height at least 32 (or 0) and up to 320 above the box or the messages, 480 on the empty chat, 2,000 elsewhere; a page's HTML 2 MB; 8 network origins; a message 1,000,000 characters |
| Companion | 1; 32 to 240 pixels |
| Patches | 32, with those of variants |
| Token sets | 16, with those of variants |
| Fonts | 8, 2 MB each |
| Images (`plugin:`) | 2 MB each |
| Stylesheet | 64 KB |
| Code fences | 8 languages |
| Modes | 4; instructions 8,000 characters |
| Settings in Feature Options | 12; 2 to 6 choices; a text 200 characters |
| Descriptions | 200 characters |
