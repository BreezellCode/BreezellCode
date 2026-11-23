# Agent Bridge

把你自己安装、自己登录的 Claude Code 连接到 Breezell。

因为 Anthropic 的规定，其他应用程序不能替你登录 Claude 账号，Breezell 也遵守这项规定，所以不会直接替你登录：请你自行安装 Claude Code，在 Claude Code 中登录账号，再由 Breezell 连接使用。

## 需要什么

- 比 1.4.64 新的 Breezell。较旧的版本无法安装。
- 这台电脑上的 Claude Code（Windows 上可以装在 Windows 或 WSL 里），用你自己的账号或 API 密钥登录。
- 登录的 Breezell 账号，不需要付费套餐。

## 如何连接

1. 在这台电脑上安装 Claude Code。
2. 在终端执行 `claude` 并登录账号（如果没有询问，输入 `/login`）。
3. 在 Breezell 中打开 Box › 模型 › 账号登录，选择 Claude Code 卡片。
4. 开启“连接 Claude Code”，阅读弹出的说明。同意即表示你会遵守 Anthropic 的相关规定，并同意 Breezell 使用 Claude Code 报告的连接状态与账号信息。

会在哪里找：macOS 和 Linux 上，会找原生安装程序、Homebrew、npm 或系统软件包放置 `claude` 的位置。Windows 上会先找 Windows，再找 WSL；在 WSL 中打开的窗口，会优先使用该发行版里的 Claude Code。页面会显示连接的是哪一个。

可以工作的文件夹：这台电脑的文件夹，以及 WSL 窗口中的文件夹（给该发行版里的 Claude Code）。用 SSH 连回同一个 WSL 发行版的窗口（WSL 里的 SSH 服务器，经由 localhost 连接）也可以：插件会先确认该主机的机器标识和这个发行版的相同，Claude Code 才会在里面工作。其他 SSH 主机和容器是别的机器，这台电脑上的 Claude Code 无法在那里工作，对话中会说明。

之后页面会显示“已连接”与你的电子邮件、组织、订阅等级、登录方式和 Claude Code 版本，并用进度条显示每一项用量限制（当前会话与本周）以及重置时间（换算成你电脑的时间），或显示未连接的原因。“重新检查”会再询问 Claude Code 一次；回到 Breezell 时也会自动重新检查。

## 在 Breezell 中和 Claude Code 对话

Claude Code 连接后，它的模型会出现在对话的模型菜单中，位于「账号直登 › Claude Code」：就是 Claude Code 自己的模型菜单提供的那些，并标出版本（Opus 5.5、Opus 4.8、Sonnet 4.6 等）。选一个就能像使用其他模型一样对话：

- Claude Code 会在这个对话的项目中工作：以项目文件夹为工作目录，窗口中的其他文件夹也一并开放给它（`--add-dir`），并在同一个对话中接着上次继续。没有打开文件夹的窗口中，它会在插件自己的一个空文件夹中工作。
- 思考强度可以在模型菜单中按模型调整，选项就是该模型支持的等级；没有调整时使用 Claude Code 自己的默认值。
- 它的回复、思考，以及读取或修改的每个文件、运行的每个命令，都会实时显示在对话中。
- Claude Code 改文件和运行命令，和 Breezell 自己的一样要经过批准：由 Breezell 的批准卡片问你，或由你的设置决定（“自动批准编辑”“自动批准终端”、命令卡片上的 Always allow）。它的其他工具，Claude Code 自己的设置已允许的，会像在终端中一样直接执行，其余由 Breezell 的批准卡片询问（“自动批准 MCP 工具”）。
- 在这些对话中，Claude Code 自己的 Bash、Monitor、Edit 和 Write 会关闭：它只通过 Breezell 运行命令和修改文件。读文件、搜索、上网等其他工具仍是它自己的。
- Claude Code 的每个操作都以 Breezell 原生的方式显示：读文件、修改（含差异）、新文件、命令、搜索、待办清单。
- Claude Code 开的每个子代理，都会像 Breezell 的子代理一样有自己的页面：它的任务、做了什么、它的报告。对话中的子代理行会显示它当前的步骤，点名称即可打开那一页；在那里按停止，只会停止这个子代理。
- 按「停止」会停止 Claude Code。
- 在其他模型回答过的对话中，或你修改了之前的消息之后，Claude Code 会收到它还没看过的内容。
- 对模型的请求中途失败时（连接中断、API 繁忙、被限流，或回复 4 分钟都没有动静），会按 Breezell 自己的方式处理：显示重新连接的倒计时，Claude Code 会在同一个会话从中断处继续，重试次数按 Box › 网络与对话 的设置。在错误上点「重试」也一样。
- Breezell 的记忆会随你的消息发送（消息的记忆行会显示是哪几条），完成的回合也会像 Breezell 自己的回合一样用于学习（超级记忆）。Claude Code 在工作时也能自己用 Breezell 的记忆查询工具查询记忆，每次查询在对话中的显示和 Breezell 自己的一样。
- Claude Code 改的文件都经过 Breezell 的编辑器：和 Breezell 自己的模型一样，可以在编辑器里保留或撤销，也会列在代码审查和待审核文件栏。“自动批准编辑”“自动接受代码更改”“编辑时自动打开文件”都适用，修改后文件的 lint 与类型错误会反馈给 Claude Code（自动修复 Lint 错误）。
- Claude Code 的命令在 Breezell 的终端里执行，用的是这个窗口的默认 shell：卡片实时显示输出，可以打开终端、停止或移到后台，哪些命令不必询问由 Breezell 的批准规则决定。后台命令结束时，Claude Code 会收到通知。

Breezell 会询问一次是否允许这个插件回答对话。

## 你的 Claude Code 对话也会出现在 Breezell

你在 Breezell 打开的文件夹中的 Claude Code 对话，会以第一条消息为名称，出现在该项目的对话列表中。继续其中一个对话时，Claude Code 会接着同一个会话。Claude Code 连接时以及之后每隔几分钟会同步一次，也可以点「同步对话」：

- 之后你在终端中接着说的内容，也会加进 Breezell 中的同一个对话；不会重复出现，在 Breezell 中开始的对话也一样。
- 你在 Breezell 中删除的对话，不会再被同步回来。默认只删除 Breezell 这边；在插件页面开启「删除对话时，一并删除 Claude Code 中的对话」后，Claude Code 中的对话也会一起删除（开启前会先询问，删除后无法恢复）。
- 每个文件夹会读取最新的 200 个对话。
- 对话会同步到它所属的项目：每个窗口同步的是它所开的项目，在 Agents 页中也会显示在该项目下。没有打开项目的窗口不会同步，点「同步对话」时会提示。页面和同步后的通知都会写出同步的是哪个项目。

## 插件的页面

Box › 插件 › Agent Bridge 会显示和 Claude Code 卡片相同的页面：连接状态、账号、用量、上次同步的结果，以及「同步对话」按钮。

## 会读取哪些信息

只读取 Claude Code 执行 `claude --version`、`claude auth status` 和它自己的 `/usage` 命令时打印的内容（以 `claude -p /usage --no-session-persistence` 执行：由 Claude Code 自己回答，不会询问模型、不会消耗你的用量，也不会加入你的会话记录），和你在终端看到的一样。模型菜单是向 Claude Code 询问它提供哪些模型（和 Anthropic 的 Agent SDK 用的是同一个请求；不会发送消息，所以不会使用任何模型）。为了同步对话，它会读取 Breezell 中打开的文件夹的 Claude Code 对话文件（位于 `~/.claude/projects`），只读这些。它不会读取、存储或转交你的登录凭证。账号与用量信息不会发送到任何地方，只留在这台电脑的这一页上。你用 Claude Code 模型发送的内容会交给你的 Claude Code，由它像在终端中一样处理。开关关闭时，插件完全不会执行 Claude Code。
