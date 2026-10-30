# Focus Player

专注用的环境音和你自己的音乐，并与 Breezell 同步：AI 完成一轮回复时会响起提示音。

Breezell 面板插件的官方示例。源代码：[`plugins/examples/focus-player`](https://github.com/BreezellCode/BreezellCode/tree/main/plugins/examples/focus-player)。

## 功能

- **环境音**：雨声、深度专注（棕噪音加低音）和柔和和弦，全部用 Web Audio 实时合成，插件里没有任何音频文件。
- **我的音乐**：选一个文件夹（mp3、ogg、wav、flac、m4a、opus、webm）依次播放。
- **与 Breezell 同步**（权限 `chat.events`：只有模式、结果与耗时，不含对话内容）：
  - 对话完成一轮时响起提示音，失败或被中止时是另一种声音；
  - 可选：Agent 工作时自动播放，完成后暂停；
  - 面板中显示最近的对话活动。

## 使用

- 从 Box 侧边栏的“**插件**”打开，或在 Breezell Console › 插件 点“**打开**”。
- 状态栏的 **▶ Focus** 可以播放或暂停。
- 面板是一个编辑器标签页：可以拖出去，或执行“Move Editor into New Window”，让它有自己的窗口。
- 设置：`focusPlayer.chimeWhenTurnFinishes`、`focusPlayer.playWhileAgentWorks`、`focusPlayer.musicFolder`。

和所有 Breezell 插件一样，它只在登录 Breezell 时运行。

## 开发

```bash
npm install
npm run typecheck
npm run package:open      # 开源包
npm run package:closed    # 闭源包
```

在 Breezell 打开这个文件夹并按 F5，就会在开发窗口中运行。
