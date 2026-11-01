# Third-party notices

Breezell IME is licensed under the GNU General Public License, version 3 or later (see `LICENSE`).
The code is its own. The dictionaries and language models it downloads are built from the sources
below; `tools/` holds the scripts that build them.

## Dictionaries and tables

| Used in | Source | License |
|---|---|---|
| `zh.bzlx`: Chinese words, readings and weights | [rime-ice](https://github.com/iDvel/rime-ice) | GPL-3.0 |
| `zh.bzlx`: readings of phrases | [phrase-pinyin-data](https://github.com/mozillazg/phrase-pinyin-data), [pinyin-data](https://github.com/mozillazg/pinyin-data) | MIT |
| `zh-tw.bzlx`, `zh-tones.tsv`: Taiwan words, readings and tones | [McBopomofo](https://github.com/openvanilla/McBopomofo) | MIT |
| `zh-t2s.txt`, `zh-s2tw.txt`: script conversion | [OpenCC](https://github.com/BYVoid/OpenCC) | Apache-2.0 |
| `wubi86.bztb`: the Wubi 86 table | [rime-wubi86-jidian](https://github.com/KyleBing/rime-wubi86-jidian) | MIT |
| `ja.bzja`, `romanji-hiragana.tsv`: Japanese dictionary and romaji table | [Mozc](https://github.com/google/mozc) | BSD-3-Clause; its dictionary data as listed in Mozc's `LICENSE` and `data/installer/credits_en.html` |

## Text the language models were trained on

The language models (`zh.bzlm`, `ja.bzlm`, `ko.bzlm`) and the word lists (`en-words.tsv`,
`ko.vocab`) hold word counts and probabilities computed from this text, not the text itself.

| Source | License |
|---|---|
| Wikipedia in Chinese, Japanese, Korean and Simple English ([dumps](https://dumps.wikimedia.org/)) | CC BY-SA 4.0 |
| [OpenSubtitles](https://www.opensubtitles.org/) through the [OPUS](https://opus.nlpl.eu/OpenSubtitles-v2018.php) corpus | As stated by OPUS; P. Lison and J. Tiedemann, 2016, "OpenSubtitles2016: Extracting Large Parallel Corpora from Movie and TV Subtitles" |
| [MDN Web Docs](https://github.com/mdn/translated-content) in Chinese | CC BY-SA 2.5 |
| [Kubernetes documentation](https://github.com/kubernetes/website) in Chinese | CC BY 4.0 |
| [React documentation](https://github.com/reactjs/zh-hans.react.dev) in Chinese | CC BY 4.0 |
| [TensorFlow documentation](https://github.com/tensorflow/docs-l10n) in Chinese | Apache-2.0 |
| [PaddlePaddle documentation](https://github.com/PaddlePaddle/docs) | Apache-2.0 |
| [The Rust Programming Language in Chinese](https://github.com/KaiserY/trpl-zh-cn) | MIT |
| [Rust by Example in Chinese](https://github.com/rust-lang-cn/rust-by-example-cn) | MIT or Apache-2.0 |
| [TypeScript handbook in Chinese](https://github.com/zhongsp/TypeScript) | MIT |
| [Ant Design documentation](https://github.com/ant-design/ant-design) | MIT |
| [Tauri documentation](https://github.com/tauri-apps/tauri-docs) in Chinese | MIT |
| [linux-command](https://github.com/jaywcjlove/linux-command) | MIT |

## Compared against, not included

The accuracy figures in the README were measured against
[librime](https://github.com/rime/librime) with rime-ice, rime-bopomofo, wubi86-jidian and
[CyIME](https://github.com/Cyletix/CyIME)'s schemas, and against Mozc. Test readings for zhuyin came
from [libchewing](https://github.com/chewing/libchewing); Hangul composition was checked against
[libhangul](https://github.com/libhangul/libhangul). Nothing of these ships with the plugin.
