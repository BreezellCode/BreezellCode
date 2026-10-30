# Focus Timer

独立したウィンドウで動くポモドーロタイマー。エディターを開かずにスタートメニューからも起動できます。

Breezell ウィンドウプラグインの公式サンプルです。ソース：[`plugins/examples/focus-timer`](https://github.com/BreezellCode/BreezellCode/tree/main/plugins/examples/focus-timer)。

## 使い方

- Box サイドバーの「**プラグイン**」から開くか、Breezell Console › プラグイン で「**開く**」を押すか、ステータスバーの **⌚ Timer** をクリックします。タイマーの動作中はステータスバーに残り時間が表示されます。
- エディターなしで：Breezell Console › プラグイン › インストール済み で「**スタートメニューに追加**」（Windows）を押すと、このウィンドウだけを開くショートカットが追加されます。ほかのプラグインと同じく Breezell へのサインインが必要で、サインインしていなければ通常どおり Breezell が開きます。

集中と休憩の長さ、終了時のサウンド、今日のセッション数はウィンドウ専用のストレージに保存されます。Breezell からウィンドウを開いた場合は、AI の会話のターンもウィンドウに表示されます（権限 `chat.events`）。

## しくみ

- `package.json` › `contributes.breezell.windows` でウィンドウを宣言します。ページ、サイズ、単独で開けるようにする `"requiresEditor": false`。`contributes.breezell.launcher` でプラグインページとサイドバーから開けるようにします。
- `window/` がページです。`/__breezell/api.js` を読み込んで `window.breezell`（`postMessage`、`onMessage`、`connected`）を使います。ウィンドウはサンドボックスで動作し、Node もネットワークも使えず、プラグイン自身のファイルだけを読み込みます。
- `src/extension.ts` は `vscode.breezell.windows.open('timer')` でウィンドウを開き、会話のターンを転送します。
- `"extensionKind": ["ui", "workspace"]`：ウィンドウにはこのコンピューター上のプラグインが必要です。
