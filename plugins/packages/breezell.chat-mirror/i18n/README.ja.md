# Chat Mirror

Breezell の会話を専用のウィンドウで：会話を選び、ツール呼び出しや呼び出されたメモリーと一緒に読み、返信し、ツール呼び出しを承認し、チャットのモデルを切り替えます。

会話を読み取り、会話に参加する Breezell プラグインの公式サンプルです。ソース：[`plugins/examples/chat-mirror`](https://github.com/BreezellCode/BreezellCode/tree/main/plugins/examples/chat-mirror)。

## 使い方

- Box サイドバーの「**プラグイン**」から開くか、Breezell Console › プラグイン で「**開く**」を押します。
- 左側にこのワークスペースの会話が新しい順に並びます。処理中の会話には点が付きます（黄色：承認待ち）。
- 会話を選ぶと読めます：あなたのメッセージとそれに使われたメモリー（Breezell のチャットと同じく常駐と関連に分けて数えます）、返信と推論、そして各ツール呼び出しのパラメーターと結果。
- Breezell が返信を作っている間、最後の吹き出しに今していること（考え中、ツール実行中、承認待ち）と経過時間、推論、書かれている途中の文章が表示されます。
- メッセージを書いて **Send**（Ctrl+Enter）で返信、**New conversation** で新しい会話を始めます。AI は Breezell であなたが入力したのと同じように答えます。
- ツール呼び出しが承認を待っているときは、ここで **Approve**（承認）または **Reject**（拒否）できます。
- **Open in Breezell** で Breezell のチャットにその会話を表示します。
- **Send** の横の **Model** で Breezell のチャットのモデルを切り替えます。Breezell のチャットのモデル選択と同じ設定なので、どちらで変えてももう一方に反映されます（このウィンドウではフォーカスが戻ったときに更新）。
- 会話一覧の下の **Pinned notes**（ピン留めしたメモ）：Breezell の Agent が Chat Mirror の `pin_note` ツールでピン留めしたメモ。新しいものが上です。**Unpin** で外します。
- プラグインのツール呼び出しには、プラグイン名と **Plugin tool** の印が付きます（Chat Mirror 自身の `pin_note` も同じ）。MCP ツールにはサーバー名が付きます。

ウィンドウ自体の表示は英語です。

## Agent ツール

Chat Mirror は、Breezell の Agent に独自のツールを 2 つ提供します（`agent.tools`、「Agent ツール登録」）。どのツールも、使えるモードを指定しています。ほかのモードでは、Agent はそのツールを見ることも呼び出すこともできません。

| ツール | モード | 内容 |
|---|---|---|
| `pin_note` | チャット、Agent、エンタングルメント | このウィンドウにメモ（タイトルと本文）をピン留めする |
| `list_notes` | チャット、Agent、エンタングルメント、分析、チーム | ピン留めしたメモを新しい順に読み返す |

チャットモードで試してみてください：「Chat Mirror にメモをピン留めして：月曜に 1.4.42 をリリース」。メモはプラグインのデータと一緒にこのコンピューターに保存され、ウィンドウを閉じていても残ります。呼び出しはほかの MCP ツールと同じく「**MCP ツールを自動承認**」の設定に従います。

## 権限

| 権限 | 用途 |
|---|---|
| `chat.read` | 会話の一覧、会話とその変化、Open in Breezell |
| `chat.send` | Send と New conversation |
| `chat.approve` | Approve と Reject |
| `models.select` | Model（モデルの一覧と切り替え） |
| `agent.tools` | Agent 用の `pin_note` と `list_notes` ツール |

Chat Mirror が各 `chat.*` 権限を初めて使うとき、Breezell が確認します。`models.select` はリスクがないため確認せず、オフにしない限りオンのままです。どれかを拒否すると、Chat Mirror はできないことを表示し、ほかの機能はそのまま動きます。Breezell Console › プラグイン › インストール済み › Chat Mirror で、それぞれ、またはすべてをまとめてオン・オフできます。送ったメッセージはあなた自身のメッセージと同じように課金されます。

`agent.tools` は一度だけ確認されます：Chat Mirror が初めて起動したときです。拒否すると、この権限をオンにするまで 2 つのツールはオフのままで、ウィンドウはこれまでどおり使えます。

## しくみ

- `window/` はページです。表示だけを担当し、すべてのテキストを HTML ではなく `textContent` で表示します：メッセージには何が含まれていてもおかしくないからです。
- `src/extension.ts` はウィンドウを開き、ウィンドウと `vscode.breezell.chat`（`listConversations`、`getConversation`、`onDidChangeConversation`、`send`、`approve`/`reject`、`show`）の間を中継します。
- Model は `vscode.breezell.models` を使います。ウィンドウを開いたときとフォーカスが戻ったときに `list`、切り替えるときに `select`。
- 返信が書かれている間は変化が届きます（多くても 1 秒に数回）。Breezell のしていること（考え中、書き込み中、ツール呼び出し、完了）が変わるたびに、プラグインは会話を読み直します。メモリーは各メッセージの `recalledMemories` と `memoryUse` から表示します。
- 拒否された権限の呼び出しは `BreezellPermissionDenied` で失敗し、ページがそれを文章にして表示します。
- ツールは `package.json` で宣言し（`contributes.breezell.tools`：名前、説明、`inputSchema`、`modes`）、`src/extension.ts` で `vscode.breezell.tools.register` によって実行します。起動時（`onStartupFinished`）に登録されるので、ウィンドウを開く前から Agent が使えます。
- `chat.read` で読んだ会話では、プラグインのツール呼び出しに `plugin`（`{ id, name }`）が付きます。ページは `plugin:<id>` というサーバー名の代わりにその名前を表示します。
