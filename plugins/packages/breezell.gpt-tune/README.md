# GPT Tune

GPT models write in a recognisable way: stock phrases ("delve into", "it's worth noting"), contrasts nobody asked for ("This isn't about X. It's about Y"), lists and tables for things that are neither, bold labels in front of every paragraph, and answers far longer or shorter than the question needs. When they polish your text, it comes back in their voice instead of yours.

GPT Tune adds a short set of writing rules to every request Breezell sends, so the replies read like a careful colleague wrote them.

## Turning it on

Open Box and, under "Plugins" in the side bar, click "GPT Tune". Its page has "Less AI tone" with three choices:

- "GPT models" (the default): only for models whose name contains "gpt", from any provider.
- "All models": for every model.
- "Off": nothing is added.

The change applies from the next message you send.

## What changes

- Plain words instead of stock phrases and empty intensifiers, in English and in Chinese.
- Paragraphs by default. Lists only for steps or options, tables only for values compared on the same columns, headings only in long documents.
- No summary of what was just said and no generic offer at the end.
- Answers sized to the question.
- When the AI polishes, shortens or translates your text, it keeps your words, register and sentence length, and fixes only what is wrong or unclear.

## What stays the same

- Code, commands, file paths and tool calls are not touched.
- A format you ask for wins: ask for a table, a numbered list or a long answer and you get it.
- Breezell's own reports after multi-step work keep their shape.

## Notes

- The rules are about 2,500 characters and go into every matching request. They sit with the other rules, which do not change between requests, so the provider's prompt cache keeps working.
- Older Breezell versions do not read this plugin's rule and change nothing; update Breezell to use it.
- It asks for no permissions. Its code only draws the settings page; Breezell adds the rules to requests itself.
