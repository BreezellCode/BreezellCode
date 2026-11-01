# Changelog

## 1.1.0

- Install it from the market and it is ready: it asks Windows' permission once, downloads the language for you, and turns on by itself. Nothing else to click.
- It starts on again if it was on when Breezell closed.
- Removing the plugin takes the input method off Windows' list, stops its engine, puts the default input method back, and deletes the languages from the default folder. What it learned stays.

## 1.0.1

- After you commit Chinese text, digits are digits: typing a number no longer picks one of the words offered next. Tab takes the first of them, and a click takes any.
- Removing it from Windows no longer adds languages you do not use to your list, and puts Windows' default input method back.

## 1.0.0

First release.

- Pinyin, zhuyin (Dachen), seven double pinyin schemes, Wubi 86, Japanese (romaji) and Korean (2-set).
- In Breezell's editor: English in code, your own language in comments, strings and after `///`.
- In Breezell's chat box: the conversation helps choose the words.
- Corrects slips of the keys in pinyin, offers the words that may come next, and learns from what you pick.
- English words among pinyin candidates: `hello`, and the names in the code around the caret.
- A settings page: download each language from GitHub, with resuming and checksums.
- On Windows, one click installs it as a system input method for every program.
