# Doc Writer

Breezell のチャットモデルでドキュメントコメントを書き、コードを説明します。

モデルを呼び出す Breezell プラグイン（`vscode.breezell.models.request`）の公式サンプルです。ソース：[`plugins/examples/doc-writer`](https://github.com/BreezellCode/BreezellCode/tree/main/plugins/examples/doc-writer)。

## 使い方

コードを選択して右クリックし、次を選びます：

- **Write Doc Comment**：選択範囲の上に、そのファイルの言語のコメント構文でドキュメントコメントを挿入します。
- **Explain Selection**：コードの横の Markdown ドキュメントに説明をストリーミング表示します。

どちらもコマンドパレットの「Doc Writer」にあります。設定 `docWriter.language` でコメントと説明の言語を指定できます（既定は英語）。

## 権限と費用

Doc Writer が求める権限は `models.request` の 1 つだけです。最初のリクエストの前に Breezell が確認し、**Breezell Console › プラグイン › インストール済み** でいつでも取り消せます。リクエストは現在のチャットモデルで実行され、ご自身のチャットとまったく同じように計上されます。

## このサンプルで示していること

- `vscode.breezell` の確認（Breezell 以外では undefined）。
- 通常のリクエスト（`writeDoc`）と `onText` を使うストリーミング（`explain`）。
- 進捗通知のキャンセルトークンによるキャンセル。
- エラーの `name` ごとの処理：`BreezellNotSignedIn`、`BreezellPermissionDenied`、`BreezellNoModel`、`BreezellRateLimited`、`BreezellCancelled`。
- `"extensionKind": ["ui", "workspace"]` により WSL や SSH のウィンドウでも動作します。
