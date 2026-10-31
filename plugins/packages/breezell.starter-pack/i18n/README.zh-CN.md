# Starter Pack

代码审查与测试技能、简短的团队规则、一个思考用的 MCP 服务器和一个柔和的深色主题：完全不需要代码。

Breezell 插件包的官方示例：所有内容都声明在 `package.json` › `contributes.breezell`（以及 `contributes.themes`）里，插件包本身不编译也不运行任何代码。源代码：[`plugins/examples/starter-pack`](https://github.com/BreezellCode/BreezellCode/tree/main/plugins/examples/starter-pack)。

## 它会加入什么

| | 位置 | 在 Breezell 中看到的 |
|---|---|---|
| 技能 `code-review`、`write-tests` | `skills/<名称>/SKILL.md` | 出现在技能列表中并标注插件包名称；任务合适时 Agent 会加载 |
| 团队规则 | `rules/house-rules.md` | 插件包启用时加入 AI 的指示 |
| MCP 服务器 `sequential-thinking` | `contributes.breezell.mcpServers` | 出现在 MCP 列表中并标注插件包名称；运行 `npx -y @modelcontextprotocol/server-sequential-thinking`（需要 Node.js） |
| 主题“Breezell Calm Dark” | `themes/calm-dark.json` | 出现在颜色主题选择器中 |

在 **Breezell Console › 插件 › 已安装** 停用或移除插件包，以上内容都会一并消失。你自己的同名技能或 MCP 服务器优先于插件包的。

MCP 服务器会给 Agent 工具，所以插件包声明了 `agent.tools` 权限（「Agent 工具注册」）。插件包第一次运行时 Breezell 会问你一次，你允许后才会启动这个服务器；之后可以在 **Breezell Console › 插件 › 已安装** › Starter Pack 开启或关闭。

## 自己做一个

从 **Pack** 模板开始（Breezell Console › 插件 › 开发，或 `node breezell-plugin.mjs init my-pack --id me.my-pack --template pack`），再运行 `npm run package:open`。
