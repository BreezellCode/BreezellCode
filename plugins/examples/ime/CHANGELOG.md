# Changelog

## 1.1.5

- The words offered after a commit no longer stay on screen. In Breezell's chat box and editor (with a Breezell that has this fix) they close when you click elsewhere or the focus moves, on Esc, and by themselves after five seconds, and what you were composing in the chat box closes the same way. Once they are gone, Tab is Tab again, in the Windows input method too.
- The switch for them on the settings page is now called **Word predictions**. Off, you just type: nothing is offered, in Korean either, and it takes effect at once, whether set on the page or in settings.json.
- Turning the input method off while composing in the chat box no longer puts that text in the editor.
- After an update the engine comes back at once, also when Breezell had only just started it. Before, it stayed away and the next key was lost while the language loaded inside Breezell.

## 1.1.4

- Removing the plugin takes the input method away in every language: it stayed under another language you have (Simplified Chinese when you chose Traditional), because Windows had it enabled for the whole machine.
- Installing shows it only under the language chosen, not once per language you have.

## 1.1.3

- Removing the plugin asks to restart Breezell, which finishes taking the input method off Windows at once (with a Breezell that can ask).

## 1.1.2

- Removing the plugin now really takes the input method off Windows' list: the process that did it did not outlive the removal step.

## 1.1.1

- The Windows input method now installs: a check of regsvr32 stopped the installer halfway in 1.1.0.
- It switches on at once in programs already running, as Win+Space would; none need restarting. Programs holding an older build swap to the new one between keys.
- The plugin's own texts follow Breezell's display language (with a Breezell that says it), and the settings page has a language of its own to choose.

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
