# Breezell IME

An input method that knows your code and your conversation: pinyin, zhuyin, double pinyin, Wubi 86,
Japanese and Korean, in Breezell's editor and chat and, on Windows, in every program.

## What it does

- **Types whole sentences.** Type a clause in one go; a language model reads it in context and gets
  the right characters first far more often than a dictionary alone can.
- **Knows code from comments.** In code it types English. In comments, strings, or after `///` on a
  line it types your own language, without you switching.
- **Uses what is around the caret.** The code you are editing and the conversation in the chat help
  choose the words, and names like `useState` become candidates as they are written there.
- **Forgives slips.** In pinyin, keys pressed in the wrong order, a neighbouring key, or one key too
  many or too few still find the word (`jain` finds 简).
- **Mixes in English.** Type `hello` in pinyin and it is among the candidates.
- **Offers the next words** after you commit Chinese text.
- **Learns from you**, without letting a one-off pick spill into everything else.

## Getting started

1. Install it from **Breezell Console › Plugins**.
2. Open **Breezell IME** under **Plugins** in the sidebar. Its page opens by itself the first time.
3. Under **Languages**, download the ones you want:

   | Language | Input methods | Download |
   |---|---|---|
   | Chinese | Pinyin, zhuyin, double pinyin (Flypy, Microsoft, Ziranma, Sogou, ABC, Ziguang, Pinyin Jiajia), Wubi 86 | 374 MB |
   | Japanese | Romaji to kana and kanji | 189 MB |
   | Korean | 2-set Hangul with word suggestions | 128 MB |

4. Choose your input method on the page and press **Ctrl+Alt+Space** in the editor to start typing.

The languages come from this plugin's GitHub release, and a download goes on from where it stopped if
the connection drops. Every file is checked against its SHA-256 before it is used. Each language you
type in keeps its model in memory: about 400 MB for Chinese.

## Keys

| Key | What it does |
|---|---|
| **Ctrl+Alt+Space** (macOS: **Ctrl+Option+Shift+Space**) | Turn on or off |
| **Ctrl+Alt+K**, or the status bar | Choose the input method |
| **Space** or a digit (zhuyin: **Shift+digit**) | Pick a candidate |
| Arrows, **Page Up**, **Page Down** | Move through the candidates |
| **Enter** | Commit what you typed, as typed |
| **Esc** | Drop it |
| **Backspace** | Take back a key |
| **Tab** | Take the first word offered next |
| **Shift**, alone (with the Windows input method) | Switch between your language and English |

## Every program on Windows

On the plugin's page, **Install in Windows…** adds it as a Windows input method, with the same engine
and the same learned words as in Breezell. Windows asks for administrator permission once, to register
the text service. It then becomes your default input method; **Win+Space** switches to another, and
**Remove from Windows…** takes it away.

It installs a text service in `Program Files\BreezellIME` and the engine host in
`%LOCALAPPDATA%\BreezellIME`, all from this plugin's package; no code is downloaded. In programs
already open when you install, press **Win+Space** to switch to it.

On Linux and macOS it works in Breezell's editor; a system input method is not available yet.

## With older versions of Breezell

The candidate panel in the editor and typing in the chat box need a recent Breezell. In older versions
the candidates show as text after the caret in the editor, and the chat box uses your system's input
method.

## Your data

- **Nothing you type leaves your computer.** Composition, the context around the caret and what it
  learns all stay on it. The plugin connects only to download the languages you choose.
- **Permissions:** it asks for none of Breezell's plugin permissions. As an input method it receives
  the keys you type in Breezell's chat box and the recent conversation, to choose the words; Breezell
  gives these to this plugin alone.
- What it learned is in `%APPDATA%\BreezellIME` (Windows), `~/Library/Application Support/BreezellIME`
  (macOS) or `~/.config/breezell-ime` (Linux). **Clear learned words** on the page forgets it.
- Like every Breezell plugin it needs you to be signed in. The Windows input method, once installed,
  keeps working after you sign out, so you are never left unable to type.

## Accuracy

The share of clauses where the first candidate is exactly right, on 1,000 clauses per set kept out of
training, with learning off. Parameters were tuned on separate sentences; these sets were run at the end.

| Input method | Text | Breezell IME | Others |
|---|---|---|---|
| Pinyin | Wikipedia | 66.4 | Rime 33.1, CyIME 38.2 |
| Pinyin | Subtitles | 85.1 | Rime 62.6, CyIME 65.1 |
| Pinyin | Technical documents | 78.3 | Rime 49.7, CyIME 61.3 |
| Zhuyin | Taiwan subtitles | 82.4 | Rime 62.0, CyIME 54.6 |
| Zhuyin | Python documents | 81.2 | Rime 61.4, CyIME 37.8 |
| Wubi 86, smart order: no picks needed | Wikipedia | 81.4 | Rime 70.2 |
| Wubi 86, smart order: no picks needed | Subtitles | 87.6 | Rime 85.0 |
| Wubi 86, smart order: no picks needed | Technical documents | 91.9 | Rime 88.8 |
| Japanese | ITA corpus | 66.5 | Mozc 58.9, CyIME 24.8 |
| Japanese | Wikipedia | 79.0 | Mozc 59.5, CyIME 33.1 |
| Japanese | Subtitles | 83.8 | Mozc 74.3, CyIME 35.1 |

The Vue and Python documents behind the technical sets were never used for training. Rime is rime-ice
for pinyin and its official bopomofo schema for zhuyin. CyIME's figures are stock librime 1.16.1 with
its schemas and weights, plus the Wanxiang grammar model; its own modified librime and reranker were
not run, and may do better. Japanese Wikipedia and subtitle readings were generated from Mozc's
dictionary, so ITA, with readings by people, is the fairest of the three.

## Building from source

The source is in [`plugins/examples/ime`](https://github.com/BreezellCode/BreezellCode/tree/main/plugins/examples/ime): `src` (the plugin), `engine` (the input method engine), `system` (the
Windows text service and the host) and `tools` (what builds the models).

```bash
npm install
npm test                 # logic tests
npm run package:open     # the .vsix, with its source and source maps
```

The text service DLLs are built on Windows with `system/windows/build.bat`.

## License

GPL-3.0-or-later. The dictionaries and models come from the projects listed in
[THIRD_PARTY_NOTICES.md](https://github.com/BreezellCode/BreezellCode/blob/main/plugins/examples/ime/THIRD_PARTY_NOTICES.md).
