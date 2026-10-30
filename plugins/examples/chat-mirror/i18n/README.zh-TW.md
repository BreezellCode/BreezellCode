# Chat Mirror

在獨立視窗中查看你的 Breezell 對話：選擇一則對話，閱讀其中的工具呼叫和召回的記憶、回覆、批准工具呼叫，並切換對話模型。

Breezell 讀取並參與對話的插件官方範例。原始碼：[`plugins/examples/chat-mirror`](https://github.com/BreezellCode/BreezellCode/tree/main/plugins/examples/chat-mirror)。

## 使用

- 從 Box 側邊欄的「**插件**」開啟，或在 Breezell Console › 插件 按「**開啟**」。
- 左邊列出這個工作區的對話，最新的在最上面。正在進行的對話會有圓點（黃色：等待你批准）。
- 選一則對話來閱讀：你的訊息和為它們召回的記憶、回覆和推理過程，以及每個工具呼叫的參數和結果。正在寫的回覆會即時顯示在下方。
- 在下方輸入訊息，按 **Send**（Ctrl+Enter）回覆；按 **New conversation** 開始新對話。AI 會像你在 Breezell 親自輸入一樣回答。
- 工具呼叫等待批准時，可以在這裡按 **Approve**（批准）或 **Reject**（拒絕）。
- **Open in Breezell** 會在 Breezell 的對話框打開這則對話。
- **Send** 旁的 **Model** 會切換 Breezell 的對話模型。它和 Breezell 對話框裡的模型選擇是同一個設定，哪一邊改了，另一邊都會跟著變（這裡在視窗取得焦點時更新）。

視窗本身的介面是英文。

## 權限

| 權限 | 用途 |
|---|---|
| `chat.read` | 對話清單、對話內容和即時變化、Open in Breezell |
| `chat.send` | Send 和 New conversation |
| `chat.approve` | Approve 和 Reject |
| `models.select` | Model（模型清單和切換） |

Chat Mirror 第一次使用每個 `chat.*` 權限時，Breezell 會先問你；`models.select` 沒有風險，不會先問，除非你關掉，否則一直開著。拒絕其中一個，Chat Mirror 會說明哪件事做不了，其他功能照常運作。你可以在 Breezell Console › 插件 › 已安裝 › Chat Mirror 逐一開關，或一次全部開啟、關閉。它傳送的訊息和你自己的訊息一樣計費。

## 製作方式

- `window/` 是頁面，只負責顯示，所有文字都用 `textContent` 顯示，不當成 HTML：訊息裡什麼內容都可能有。
- `src/extension.ts` 開啟視窗，並在視窗和 `vscode.breezell.chat` 之間轉送：`listConversations`、`getConversation`、`onDidChangeConversation`、`send`、`approve`/`reject` 和 `show`。
- Model 使用 `vscode.breezell.models`：視窗開啟或取得焦點時呼叫 `list`，切換時呼叫 `select`。
- 回覆寫作中會持續收到變化，每秒最多幾次；每個步驟結束時，插件會重新讀取對話。
- 被拒絕的權限會讓呼叫以 `BreezellPermissionDenied` 失敗，頁面會把它轉成一句說明。
