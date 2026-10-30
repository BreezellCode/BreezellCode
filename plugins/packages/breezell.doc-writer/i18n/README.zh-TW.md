# Doc Writer

用你的 Breezell 對話模型撰寫文件註解並解說程式碼。

Breezell 呼叫模型（`vscode.breezell.models.request`）的插件官方範例。原始碼：[`plugins/examples/doc-writer`](https://github.com/BreezellCode/BreezellCode/tree/main/plugins/examples/doc-writer)。

## 使用

選取一段程式碼，按右鍵，然後：

- **Write Doc Comment**：在選取範圍上方插入文件註解，使用該檔案語言的註解語法。
- **Explain Selection**：在程式碼旁的 Markdown 文件中逐字顯示解說。

這兩個指令也在命令選擇區的「Doc Writer」下。設定 `docWriter.language` 決定註解和解說的語言（預設英文）。

## 權限與費用

Doc Writer 只要求一個權限：`models.request`。第一次請求前 Breezell 會先問你，你也可以隨時在 **Breezell Console › 插件 › 已安裝** 撤銷。請求使用你目前的對話模型，計算方式和你自己的對話完全相同。

## 這個範例示範了什麼

- 檢查 `vscode.breezell`（Breezell 以外的編輯器中為 undefined）。
- 使用 `onText` 的串流請求：逐字寫進程式碼旁的文件（`explain`），以及在進度通知裡即時顯示、整段檢查過才插入的註解（`writeDoc`）；正文出來前，用 `onReasoning` 顯示模型正在思考。
- 透過進度通知的取消權杖取消請求。
- 處理每一種錯誤 `name`：`BreezellNotSignedIn`、`BreezellPermissionDenied`、`BreezellNoModel`、`BreezellRateLimited`、`BreezellCancelled`。
- 插入前先檢查回覆真的是註解（`src/comment.ts`）：模型不一定照指示回答，不是註解的回覆不會插進程式碼，而是顯示在旁邊。
- `"extensionKind": ["ui", "workspace"]`，所以在 WSL 和 SSH 視窗中也能使用。
