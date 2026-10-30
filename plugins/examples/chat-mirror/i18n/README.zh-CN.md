# Chat Mirror

在独立窗口中查看你的 Breezell 对话：选择一则对话，阅读其中的工具调用和召回的记忆、回复，并批准工具调用。

Breezell 读取并参与对话的插件官方示例。源代码：[`plugins/examples/chat-mirror`](https://github.com/BreezellCode/BreezellCode/tree/main/plugins/examples/chat-mirror)。

## 使用

- 从 Box 侧边栏的“**插件**”打开，或在 Breezell Console › 插件 点“**打开**”。
- 左边列出这个工作区的对话，最新的在最上面。正在进行的对话会有圆点（黄色：等待你批准）。
- 选一则对话来阅读：你的消息和为它们召回的记忆、回复和推理过程，以及每个工具调用的参数和结果。正在写的回复会实时显示在下方。
- 在下方输入消息，点 **Send**（Ctrl+Enter）回复；点 **New conversation** 开始新对话。AI 会像你在 Breezell 亲自输入一样回答。
- 工具调用等待批准时，可以在这里点 **Approve**（批准）或 **Reject**（拒绝）。
- **Open in Breezell** 会在 Breezell 的对话框打开这则对话。

窗口本身的界面是英文。

## 权限

| 权限 | 用途 |
|---|---|
| `chat.read` | 对话列表、对话内容和实时变化、Open in Breezell |
| `chat.send` | Send 和 New conversation |
| `chat.approve` | Approve 和 Reject |

Chat Mirror 第一次使用每个权限时，Breezell 会先问你。拒绝其中一个，Chat Mirror 会说明哪件事做不了，其他功能照常运作。你可以在 Breezell Console › 插件 › 已安装 › Chat Mirror 逐一开关，或一次全部开启、关闭。它发送的消息和你自己的消息一样计费。

## 实现方式

- `window/` 是页面，只负责显示，所有文字都用 `textContent` 显示，不当成 HTML：消息里什么内容都可能有。
- `src/extension.ts` 打开窗口，并在窗口和 `vscode.breezell.chat` 之间转发：`listConversations`、`getConversation`、`onDidChangeConversation`、`send`、`approve`/`reject` 和 `show`。
- 回复写作中会持续收到变化，每秒最多几次；每个步骤结束时，插件会重新读取对话。
- 被拒绝的权限会让调用以 `BreezellPermissionDenied` 失败，页面会把它转成一句说明。
