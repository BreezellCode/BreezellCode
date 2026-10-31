# Chat Mirror

在独立窗口中查看你的 Breezell 对话：选择一则对话，阅读其中的工具调用和召回的记忆、回复、批准工具调用，并切换对话模型。

Breezell 读取并参与对话的插件官方示例。源代码：[`plugins/examples/chat-mirror`](https://github.com/BreezellCode/BreezellCode/tree/main/plugins/examples/chat-mirror)。

## 使用

- 从 Box 侧边栏的“**插件**”打开，或在 Breezell Console › 插件 点“**打开**”。
- 左边列出这个工作区的对话，最新的在最上面。正在进行的对话会有圆点（黄色：等待你批准）。
- 选一则对话来阅读：你的消息和为它们使用的记忆（和 Breezell 对话框一样分常驻、相关计数）、回复和推理过程，以及每个工具调用的参数和结果。
- Breezell 回复期间，最后一个气泡会显示它正在做什么、已经多久（思考、执行工具、等待你批准），以及推理过程和正在写的文字。
- 在下方输入消息，点 **Send**（Ctrl+Enter）回复；点 **New conversation** 开始新对话。AI 会像你在 Breezell 亲自输入一样回答。
- 工具调用等待批准时，可以在这里点 **Approve**（批准）或 **Reject**（拒绝）。
- **Open in Breezell** 会在 Breezell 的对话框打开这则对话。
- **Send** 旁的 **Model** 会切换 Breezell 的对话模型。它和 Breezell 对话框里的模型选择是同一个设置，哪一边改了，另一边都会跟着变（这里在窗口获得焦点时更新）。
- 对话列表下方的 **Pinned notes**（已置顶的笔记）：Breezell 的 Agent 用 Chat Mirror 的 `pin_note` 工具置顶的笔记，最新的在最上面。点 **Unpin** 取消置顶。
- 插件的工具调用会显示插件名称和 **Plugin tool** 标记（Chat Mirror 自己的 `pin_note` 也是）；MCP 工具则显示它的服务器。

窗口本身的界面是英文。

## Agent 工具

Chat Mirror 给 Breezell 的 Agent 两个自己的工具（`agent.tools`，「Agent 工具注册」）。每个工具都写明它在哪些模式出现；在其他模式里，Agent 看不到也调用不了。

| 工具 | 模式 | 用途 |
|---|---|---|
| `pin_note` | 聊天、代理、纠缠 | 在这个窗口置顶一条笔记（标题和内容） |
| `list_notes` | 聊天、代理、纠缠、分析、团队 | 读回已置顶的笔记，最新的在前 |

在聊天模式试试：「在 Chat Mirror 置顶一条笔记：周一发布 1.4.42」。笔记和插件的数据一起保存在你的电脑上，窗口关着也在。它们的调用和其他 MCP 工具一样，按照「**自动批准 MCP 工具**」设置。

## 权限

| 权限 | 用途 |
|---|---|
| `chat.read` | 对话列表、对话内容和实时变化、Open in Breezell |
| `chat.send` | Send 和 New conversation |
| `chat.approve` | Approve 和 Reject |
| `models.select` | Model（模型列表和切换） |
| `agent.tools` | 给 Agent 的 `pin_note` 和 `list_notes` 工具 |

Chat Mirror 第一次使用每个 `chat.*` 权限时，Breezell 会先问你；`models.select` 没有风险，不会先问，除非你关掉，否则一直开着。拒绝其中一个，Chat Mirror 会说明哪件事做不了，其他功能照常运作。你可以在 Breezell Console › 插件 › 已安装 › Chat Mirror 逐一开关，或一次全部开启、关闭。它发送的消息和你自己的消息一样计费。

`agent.tools` 只会问一次：Chat Mirror 第一次启动时。拒绝的话，这两个工具会一直关闭，直到你打开这个权限；窗口其他功能照常。

## 实现方式

- `window/` 是页面，只负责显示，所有文字都用 `textContent` 显示，不当成 HTML：消息里什么内容都可能有。
- `src/extension.ts` 打开窗口，并在窗口和 `vscode.breezell.chat` 之间转发：`listConversations`、`getConversation`、`onDidChangeConversation`、`send`、`approve`/`reject` 和 `show`。
- Model 使用 `vscode.breezell.models`：窗口打开或获得焦点时调用 `list`，切换时调用 `select`。
- 回复写作中会持续收到变化，每秒最多几次；Breezell 每次换一件事做（思考、写作、工具调用、完成），插件都会重新读取对话。记忆来自每则消息的 `recalledMemories` 和 `memoryUse`。
- 被拒绝的权限会让调用以 `BreezellPermissionDenied` 失败，页面会把它转成一句说明。
- 工具在 `package.json` 声明（`contributes.breezell.tools`：名称、说明、`inputSchema`、`modes`），在 `src/extension.ts` 用 `vscode.breezell.tools.register` 运行。它们在启动时注册（`onStartupFinished`），所以窗口还没打开，Agent 就能使用。
- 用 `chat.read` 读到的对话里，插件的工具调用带有 `plugin`（`{ id, name }`）：页面显示这个名称，而不是 `plugin:<id>` 服务器。
