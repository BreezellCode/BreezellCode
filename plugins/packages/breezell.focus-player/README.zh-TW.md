# Focus Player

專注用的環境音和你自己的音樂，並與 Breezell 同步：AI 完成一輪回覆時會響起提示音。

Breezell 面板插件的官方範例。原始碼：[`plugins/examples/focus-player`](https://github.com/BreezellCode/BreezellCode/tree/main/plugins/examples/focus-player)。

## 功能

- **環境音**：雨聲、深度專注（棕噪音加低音）和柔和和弦，全部用 Web Audio 即時合成，插件裡沒有任何音檔。
- **我的音樂**：選一個資料夾（mp3、ogg、wav、flac、m4a、opus、webm）依序播放。
- **與 Breezell 同步**（權限 `chat.events`：只有模式、結果與耗時，不含對話內容）：
  - 對話完成一輪時響起提示音，失敗或被中止時是另一種聲音；
  - 可選：Agent 工作時自動播放，完成後暫停；
  - 面板中顯示最近的對話活動。

## 使用

- 從 Box 側邊欄的「**插件**」開啟，或在 Breezell Console › 插件 按「**開啟**」。
- 狀態列的 **▶ Focus** 可以播放或暫停。
- 面板是一個編輯器分頁：可以拖出去，或執行「Move Editor into New Window」，讓它有自己的視窗。
- 設定：`focusPlayer.chimeWhenTurnFinishes`、`focusPlayer.playWhileAgentWorks`、`focusPlayer.musicFolder`。

和所有 Breezell 插件一樣，它只在登入 Breezell 時運作。

## 開發

```bash
npm install
npm run typecheck
npm run package:open      # 開源套件
npm run package:closed    # 閉源套件
```

在 Breezell 開啟這個資料夾並按 F5，就會在開發視窗中執行。
