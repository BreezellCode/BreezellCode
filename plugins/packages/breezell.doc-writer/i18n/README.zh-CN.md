# Doc Writer

用你的 Breezell 对话模型撰写文档注释并讲解代码。

Breezell 调用模型（`vscode.breezell.models.request`）的插件官方示例。源代码：[`plugins/examples/doc-writer`](https://github.com/BreezellCode/BreezellCode/tree/main/plugins/examples/doc-writer)。

## 使用

选中一段代码，右键，然后：

- **Write Doc Comment**：在选中区域上方插入文档注释，使用该文件语言的注释语法。
- **Explain Selection**：在代码旁的 Markdown 文档中逐字显示讲解。

这两个命令也在命令面板的“Doc Writer”下。设置 `docWriter.language` 决定注释和讲解的语言（默认英文）。

## 权限与费用

Doc Writer 只请求一个权限：`models.request`。第一次请求前 Breezell 会先询问你，你也可以随时在 **Breezell Console › 插件 › 已安装** 撤销。请求使用你当前的对话模型，计费方式和你自己的对话完全相同。

## 这个示例演示了什么

- 检查 `vscode.breezell`（在 Breezell 以外的编辑器中为 undefined）。
- 普通请求（`writeDoc`）和使用 `onText` 的流式请求（`explain`）。
- 通过进度通知的取消令牌取消请求。
- 处理每一种错误 `name`：`BreezellNotSignedIn`、`BreezellPermissionDenied`、`BreezellNoModel`、`BreezellRateLimited`、`BreezellCancelled`。
- 插入前先检查回复确实是注释（`src/comment.ts`）：模型不一定按指示回答，不是注释的回复不会插进代码，而是显示在旁边。
- `"extensionKind": ["ui", "workspace"]`，因此在 WSL 和 SSH 窗口中也能使用。
