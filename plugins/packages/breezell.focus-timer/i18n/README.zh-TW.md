# Focus Timer

一個擁有獨立視窗的番茄鐘，也能從開始選單直接開啟，不必開啟編輯器。

Breezell 視窗插件的官方範例。原始碼：[`plugins/examples/focus-timer`](https://github.com/BreezellCode/BreezellCode/tree/main/plugins/examples/focus-timer)。

## 使用

- 從 Box 側邊欄的「**插件**」開啟、在 Breezell Console › 插件 按「**開啟**」，或點狀態列的 **⌚ Timer**。計時時，狀態列會顯示剩餘時間。
- 不開編輯器：在 Breezell Console › 插件 › 已安裝 按「**加到開始選單**」（Windows），會加入一個只開啟這個視窗的捷徑。和所有插件一樣需要登入 Breezell，否則會照常開啟 Breezell。

專注與休息的長度、結束時的提示音和今天的完成次數，都存在視窗自己的儲存空間。由 Breezell 開啟視窗時，AI 的對話進度也會顯示在視窗裡（權限 `chat.events`）。

## 製作方式

- `package.json` › `contributes.breezell.windows` 宣告這個視窗：頁面、大小，以及讓它能單獨開啟的 `"requiresEditor": false`；`contributes.breezell.launcher` 讓它能從插件頁和側邊欄開啟。
- `window/` 是頁面。它載入 `/__breezell/api.js` 取得 `window.breezell`（`postMessage`、`onMessage`、`connected`）。視窗在沙箱中執行：沒有 Node、不能連網，只能讀插件自己的檔案。
- `src/extension.ts` 用 `vscode.breezell.windows.open('timer')` 開啟視窗，並轉送對話事件。
- `"extensionKind": ["ui", "workspace"]`：視窗需要插件在這台電腦上。
