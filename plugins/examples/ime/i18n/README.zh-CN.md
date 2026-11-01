# Breezell 输入法

懂你的代码和对话的输入法：全拼、注音、双拼、五笔 86、日语和韩语，可用于 Breezell 的编辑器和对话框；在 Windows 上，所有程序都能用。

## 功能

- **打整句。** 一口气打完一个分句，语言模型会结合上下文判断，第一个候选就是正确文字的机会，远高于单靠词典。
- **分得清代码和注释。** 在代码中输入英文。在注释、字符串中，或同一行的 `///` 之后，不用切换就能输入你自己的语言。
- **参考光标周围的内容。** 你正在编辑的代码和对话框里的对话都会帮忙选词，`useState` 这类名称也会照那里的写法成为候选词。
- **容许打错。** 在拼音中，按键顺序打错、按到相邻的键，或多按、少按一个键，都还是找得到词（`jain` 能找到“简”）。
- **可以夹杂英文。** 在拼音中打 `hello`，它就会出现在候选词中。
- **提供接下来的词**，在你的中文上屏之后。
- **向你学习**，但不会让一次偶然的选择影响到其他地方。

## 开始使用

1. 从 **Breezell Console › 插件** 安装。
2. 在侧边栏的“**插件**”打开“**Breezell 输入法**”。第一次会自动打开它的页面。
3. 在“**语言**”下载你要的语言：

   | 语言 | 输入法 | 下载大小 |
   |---|---|---|
   | 中文 | 全拼、注音、双拼（小鹤、微软、自然码、搜狗、智能 ABC、紫光、拼音加加）、五笔 86 | 374 MB |
   | 日语 | 罗马字转假名和汉字 | 189 MB |
   | 韩语 | 두벌식韩文，提供词语建议 | 128 MB |

4. 在页面上选择输入法，然后在编辑器中按 **Ctrl+Alt+Space** 开始打字。

语言来自这个插件的 GitHub release；连接中断时，下载会从中断处继续。每个文件在使用前都会校验 SHA-256。你使用的每种语言都会把模型留在内存中：中文约 400 MB。

## 按键

| 按键 | 作用 |
|---|---|
| **Ctrl+Alt+Space**（macOS：**Ctrl+Option+Shift+Space**） | 开启或关闭 |
| **Ctrl+Alt+K** 或状态栏 | 选择输入法 |
| **Space** 或数字（注音：**Shift+数字**） | 选择候选词 |
| 方向键、**Page Up**、**Page Down** | 在候选词间移动 |
| **Enter** | 照你打的内容上屏 |
| **Esc** | 放弃 |
| **Backspace** | 退回一个按键 |
| **Tab** | 选接下来提供的第一个词 |
| 单独按 **Shift**（使用 Windows 输入法时） | 在你的语言和英文之间切换 |

## Windows 上的所有程序

在插件的页面上，“**安装到 Windows…**”会把它添加为 Windows 输入法，引擎和学到的词都和 Breezell 里相同。Windows 会要求一次管理员权限，以注册文本服务。之后它会成为你的默认输入法；**Win+Space** 可切换到其他输入法，“**从 Windows 移除…**”则会移除它。

它会在 `Program Files\BreezellIME` 安装文本服务，在 `%LOCALAPPDATA%\BreezellIME` 安装引擎宿主程序，全都来自这个插件的软件包，不会下载任何代码。安装时已经打开的程序，请按 **Win+Space** 切换到它。

在 Linux 和 macOS 上，它可在 Breezell 的编辑器中使用；系统输入法目前还无法使用。

## 搭配旧版 Breezell

编辑器中的候选词面板和在对话框中打字，都需要较新版的 Breezell。在旧版中，候选词会以文字显示在编辑器的光标之后，对话框则使用你系统的输入法。

## 你的数据

- **你输入的任何内容都不会离开你的电脑。** 组字、光标周围的上下文和它学到的内容都留在电脑上。插件只有在下载你选择的语言时才会联网。
- **权限：** 它不要求任何 Breezell 插件权限。作为输入法，它会收到你在 Breezell 对话框中按的键和最近的对话，用来选词；Breezell 只把这些交给这个插件。
- 它学到的内容在 `%APPDATA%\BreezellIME`（Windows）、`~/Library/Application Support/BreezellIME`（macOS）或 `~/.config/breezell-ime`（Linux）。页面上的“**清除学到的词**”会让它全部忘记。
- 和所有 Breezell 插件一样，它需要你登录。Windows 输入法安装后，退出登录也能继续使用，所以你不会遇到无法打字的情况。

## 准确率

第一个候选词完全正确的分句比例，每组 1,000 个未用于训练的分句，学习功能关闭。参数是用另外的句子调整的；这几组是最后才运行的。

| 输入法 | 文本 | Breezell 输入法 | 其他 |
|---|---|---|---|
| 全拼 | 维基百科 | 66.4 | Rime 33.1, CyIME 38.2 |
| 全拼 | 字幕 | 85.1 | Rime 62.6, CyIME 65.1 |
| 全拼 | 技术文档 | 78.3 | Rime 49.7, CyIME 61.3 |
| 注音 | 台湾字幕 | 82.4 | Rime 62.0, CyIME 54.6 |
| 注音 | Python 文档 | 81.2 | Rime 61.4, CyIME 37.8 |
| 五笔 86，智能排序：无需选词 | 维基百科 | 81.4 | Rime 70.2 |
| 五笔 86，智能排序：无需选词 | 字幕 | 87.6 | Rime 85.0 |
| 五笔 86，智能排序：无需选词 | 技术文档 | 91.9 | Rime 88.8 |
| 日语 | ITA 语料库 | 66.5 | Mozc 58.9, CyIME 24.8 |
| 日语 | 维基百科 | 79.0 | Mozc 59.5, CyIME 33.1 |
| 日语 | 字幕 | 83.8 | Mozc 74.3, CyIME 35.1 |

技术组所依据的 Vue 和 Python 文档从未用于训练。Rime 在拼音使用 rime-ice，在注音使用它官方的 bopomofo 方案。CyIME 的数字来自原版 librime 1.16.1，搭配它的方案和权重，再加上万象语法模型；它自己修改过的 librime 和重排序器没有运行，结果可能更好。日语维基百科和字幕的读音是用 Mozc 的词典生成的，所以读音由人标注的 ITA 是这三者中最公平的。

## 从源代码构建

源代码在 [`plugins/examples/ime`](https://github.com/BreezellCode/BreezellCode/tree/main/plugins/examples/ime)：`src`（插件）、`engine`（输入法引擎）、`system`（Windows 文本服务和宿主程序）和 `tools`（构建模型的工具）。

```bash
npm install
npm test                 # 逻辑测试
npm run package:open     # .vsix，含源代码和 source map
```

文本服务的 DLL 在 Windows 上用 `system/windows/build.bat` 构建。

## 许可证

GPL-3.0-or-later。词典和模型来自 [THIRD_PARTY_NOTICES.md](https://github.com/BreezellCode/BreezellCode/blob/main/plugins/examples/ime/THIRD_PARTY_NOTICES.md) 列出的项目。
