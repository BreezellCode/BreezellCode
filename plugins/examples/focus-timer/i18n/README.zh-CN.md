# Focus Timer

一个拥有独立窗口的番茄钟，也能从快捷方式直接打开，不必打开编辑器。

Breezell 窗口插件的官方示例。源代码：[`plugins/examples/focus-timer`](https://github.com/BreezellCode/BreezellCode/tree/main/plugins/examples/focus-timer)。

## 使用

- 从 Box 侧边栏的“**插件**”打开、在 Breezell Console › 插件 点“**打开**”，或点状态栏的 **⌚ Timer**。计时时，状态栏会显示剩余时间。
- 不打开编辑器：在 Breezell Console › 插件 › 已安装 点“**添加到开始菜单**”（Windows）、“**添加到应用程序菜单**”（Linux）或“**添加到「应用程序」**”（macOS），会添加一个只打开这个窗口的快捷方式。和所有插件一样需要登录 Breezell，否则会照常打开 Breezell。

专注与休息的时长、结束时的提示音和今天的完成次数，都保存在窗口自己的存储空间。由 Breezell 打开窗口时，AI 的对话进度也会显示在窗口里（权限 `chat.events`）。

## 实现方式

- `package.json` › `contributes.breezell.windows` 声明这个窗口：页面、大小，以及让它能单独打开的 `"requiresEditor": false`；`contributes.breezell.launcher` 让它能从插件页和侧边栏打开。
- `window/` 是页面。它加载 `/__breezell/api.js` 获取 `window.breezell`（`postMessage`、`onMessage`、`connected`）。窗口在沙箱中运行：没有 Node、不能联网，只能读取插件自己的文件。
- `src/extension.ts` 用 `vscode.breezell.windows.open('timer')` 打开窗口，并转发对话事件。
- `"extensionKind": ["ui", "workspace"]`：窗口需要插件在这台电脑上。
