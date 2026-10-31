# Starter Pack

コードレビューとテストのスキル、短いハウスルール、思考用の MCP サーバー、落ち着いたダークテーマ。コードは不要です。

Breezell プラグインパックの公式サンプルです。すべて `package.json` › `contributes.breezell`（と `contributes.themes`）で宣言され、パック自身がコードをコンパイルしたり実行したりすることはありません。ソース：[`plugins/examples/starter-pack`](https://github.com/BreezellCode/BreezellCode/tree/main/plugins/examples/starter-pack)。

## 追加されるもの

| | 場所 | Breezell での見え方 |
|---|---|---|
| スキル `code-review`、`write-tests` | `skills/<名前>/SKILL.md` | スキル一覧にパック名付きで表示。タスクに合うときエージェントが読み込みます |
| ハウスルール | `rules/house-rules.md` | パックがオンの間、AI の指示に追加 |
| MCP サーバー `sequential-thinking` | `contributes.breezell.mcpServers` | MCP 一覧にパック名付きで表示。`npx -y @modelcontextprotocol/server-sequential-thinking` を実行（Node.js が必要） |
| テーマ「Breezell Calm Dark」 | `themes/calm-dark.json` | カラーテーマの選択に表示 |

**Breezell Console › プラグイン › インストール済み** でパックをオフにするか削除すると、これらはすべて消えます。同じ名前の自分のスキルや MCP サーバーがパックのものより優先されます。

MCP サーバーは Agent にツールを提供するので、パックは `agent.tools` 権限（「Agent ツール登録」）を宣言しています。パックが初めて動くときに Breezell が一度だけ確認し、許可した場合にだけサーバーを起動します。**Breezell Console › プラグイン › インストール済み** › Starter Pack でオン・オフできます。

## 自分で作る

**Pack** テンプレートから始め（Breezell Console › プラグイン › 開発、または `node breezell-plugin.mjs init my-pack --id me.my-pack --template pack`）、`npm run package:open` を実行します。
