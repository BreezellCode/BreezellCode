# Chat Mirror

Breezell の会話を専用のウィンドウで：会話を選び、ツール呼び出しや呼び出されたメモリーと一緒に読み、返信し、ツール呼び出しを承認します。

会話を読み取り、会話に参加する Breezell プラグインの公式サンプルです。ソース：[`plugins/examples/chat-mirror`](https://github.com/BreezellCode/BreezellCode/tree/main/plugins/examples/chat-mirror)。

## 使い方

- Box サイドバーの「**プラグイン**」から開くか、Breezell Console › プラグイン で「**開く**」を押します。
- 左側にこのワークスペースの会話が新しい順に並びます。処理中の会話には点が付きます（黄色：承認待ち）。
- 会話を選ぶと読めます：あなたのメッセージとそれに呼び出されたメモリー、返信と推論、そして各ツール呼び出しのパラメーターと結果。書かれている途中の返信は下にリアルタイムで表示されます。
- メッセージを書いて **Send**（Ctrl+Enter）で返信、**New conversation** で新しい会話を始めます。AI は Breezell であなたが入力したのと同じように答えます。
- ツール呼び出しが承認を待っているときは、ここで **Approve**（承認）または **Reject**（拒否）できます。
- **Open in Breezell** で Breezell のチャットにその会話を表示します。

ウィンドウ自体の表示は英語です。

## 権限

| 権限 | 用途 |
|---|---|
| `chat.read` | 会話の一覧、会話とその変化、Open in Breezell |
| `chat.send` | Send と New conversation |
| `chat.approve` | Approve と Reject |

Chat Mirror が各権限を初めて使うとき、Breezell が確認します。どれかを拒否すると、Chat Mirror はできないことを表示し、ほかの機能はそのまま動きます。Breezell Console › プラグイン › インストール済み › Chat Mirror で、それぞれ、またはすべてをまとめてオン・オフできます。送ったメッセージはあなた自身のメッセージと同じように課金されます。

## しくみ

- `window/` はページです。表示だけを担当し、すべてのテキストを HTML ではなく `textContent` で表示します：メッセージには何が含まれていてもおかしくないからです。
- `src/extension.ts` はウィンドウを開き、ウィンドウと `vscode.breezell.chat`（`listConversations`、`getConversation`、`onDidChangeConversation`、`send`、`approve`/`reject`、`show`）の間を中継します。
- 返信が書かれている間は変化が届きます（多くても 1 秒に数回）。ひとつのステップが終わると、プラグインは会話を読み直します。
- 拒否された権限の呼び出しは `BreezellPermissionDenied` で失敗し、ページがそれを文章にして表示します。
