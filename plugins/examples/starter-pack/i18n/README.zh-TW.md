# Starter Pack

程式碼審查與測試技能、簡短的團隊規則、一個思考用的 MCP 伺服器和一個柔和的深色主題：完全不需要程式碼。

Breezell 插件包的官方範例：所有內容都宣告在 `package.json` › `contributes.breezell`（以及 `contributes.themes`）裡，插件包本身不編譯也不執行任何程式碼。原始碼：[`plugins/examples/starter-pack`](https://github.com/BreezellCode/BreezellCode/tree/main/plugins/examples/starter-pack)。

## 它會加入什麼

| | 位置 | 在 Breezell 中看到的 |
|---|---|---|
| 技能 `code-review`、`write-tests` | `skills/<名稱>/SKILL.md` | 出現在技能清單中並標示插件包名稱；任務合適時 Agent 會載入 |
| 團隊規則 | `rules/house-rules.md` | 插件包啟用時加入 AI 的指示 |
| MCP 伺服器 `sequential-thinking` | `contributes.breezell.mcpServers` | 出現在 MCP 清單中並標示插件包名稱；執行 `npx -y @modelcontextprotocol/server-sequential-thinking`（需要 Node.js） |
| 主題「Breezell Calm Dark」 | `themes/calm-dark.json` | 出現在色彩主題選擇器中 |

在 **Breezell Console › 插件 › 已安裝** 停用或移除插件包，以上內容都會一併消失。你自己的同名技能或 MCP 伺服器優先於插件包的。

MCP 伺服器會給 Agent 工具，所以插件包宣告了 `agent.tools` 權限（「Agent 工具註冊」）。插件包第一次執行時 Breezell 會問你一次，你允許後才會啟動這個伺服器；之後可以在 **Breezell Console › 插件 › 已安裝** › Starter Pack 開啟或關閉。

## 自己做一個

從 **Pack** 範本開始（Breezell Console › 插件 › 開發，或 `node breezell-plugin.mjs init my-pack --id me.my-pack --template pack`），再執行 `npm run package:open`。
