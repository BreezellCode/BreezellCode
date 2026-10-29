# Focus Player

集中のための環境音と自分の音楽を、Breezell と連動して再生します。AI が 1 ターンを終えるとチャイムが鳴ります。

Breezell パネルプラグインの公式サンプルです。ソース：[`plugins/examples/focus-player`](https://github.com/BreezellCode/BreezellCode/tree/main/plugins/examples/focus-player)。

## 機能

- **環境音**：雨、ディープフォーカス（ブラウンノイズと低いドローン）、やわらかなコードパッド。すべて Web Audio でその場で合成するため、音声ファイルは同梱していません。
- **自分の音楽**：フォルダー（mp3、ogg、wav、flac、m4a、opus、webm）を選んで順番に再生します。
- **Breezell との連動**（権限 `chat.events`：モード、結果、所要時間のみで、内容は含みません）：
  - 会話のターンが終わるとチャイムが鳴り、失敗や中止のときは別の音になります；
  - オプション：エージェントの作業中に再生し、終わったら一時停止します；
  - パネルに最近のアクティビティを表示します。

## 使い方

- Box サイドバーの「**プラグイン**」から開くか、Breezell Console › プラグイン で「**開く**」を押します。
- ステータスバーの **▶ Focus** で再生と一時停止ができます。
- パネルはエディターのタブです。ドラッグして外に出すか、「Move Editor into New Window」を実行すると独立したウィンドウになります。
- 設定：`focusPlayer.chimeWhenTurnFinishes`、`focusPlayer.playWhileAgentWorks`、`focusPlayer.musicFolder`。

ほかの Breezell プラグインと同じく、Breezell にサインインしている間だけ動作します。

## 開発

```bash
npm install
npm run typecheck
npm run package:open      # オープンソースのパッケージ
npm run package:closed    # クローズドソースのパッケージ
```

このフォルダーを Breezell で開いて F5 を押すと、開発用ウィンドウで実行されます。
