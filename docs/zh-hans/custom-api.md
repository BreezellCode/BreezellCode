---
title: 自定义 API
description: 了解如何在 Breezell 中配置自己的 API 提供商，而不是使用官方额度。
---

# 自定义 API

如果你不想使用 Breezell 的官方额度，或者想使用自己的 API 密钥，可以在 Breezell 设置页面中配置自定义 API 提供商。

这样，你就可以将 Breezell 连接到自己的模型提供商、自定义网关、API 密钥和模型名称。

## 打开 Breezell 设置页面

首先，在编辑器右上方区域找到设置图标。

设置图标看起来像一个小齿轮，位于其他工具栏图标附近。

点击设置图标，打开设置菜单。

在菜单顶部，点击 **Breezell Settings**。

点击 **Breezell Settings** 后，Breezell 设置页面就会打开。

![Breezell 设置菜单中选中的 Breezell Settings](/custom-api/settings-menu.png)

## 进入 Models 页面

打开 Breezell 设置后，通常会默认进入 **Models** 页面。

如果当前不在此页面，请查看左侧边栏并点击 **Models**。

**Models** 页面用于管理可用模型、官方模型、第三方提供商和自定义 API 提供商。

在页面顶部，你会看到多个已启用的模型，例如 Claude、GPT、Gemini、Kimi 和 Grok 模型。

在模型列表下方，你会看到 **Providers** 区域。

![Breezell Models 页面中的 Providers 区域](/custom-api/models-page.png)

## 选择提供商

Breezell 支持多种不同的模型提供商。

例如，你可以找到以下提供商：

- OpenRouter
- Anthropic
- OpenAI
- OpenAI Codex
- Kimi Code
- GitHub Copilot
- DeepSeek
- Gemini
- Groq
- Mistral
- Qwen
- Google Vertex AI
- Microsoft Azure
- NVIDIA NIM
- Together AI
- Cohere
- Fireworks
- DeepInfra
- Cerebras
- Perplexity
- Moonshot AI
- ByteDance
- Hugging Face
- Baseten

每个提供商可能有不同的配置方式。

例如，如果你使用 **OpenAI Codex**，可以在提供商列表中选择 **OpenAI Codex**，然后直接使用 ChatGPT 账户登录。

登录后，Breezell 可以通过官方 Codex 后端转发 Codex 请求。此选项不需要单独的 API 密钥。

![OpenAI Codex 提供商页面中的 ChatGPT 账户登录和 Codex 用量详情](/custom-api/openai-codex-provider.png)

## 使用 OpenAI-Compatible 配置自定义 API

如果你想使用第三方 API 或自托管 API 网关，请选择 **OpenAI-Compatible**。

这是默认的自定义 API 提供商。

与固定提供商不同，**OpenAI-Compatible** 允许你手动配置自己的连接信息。

你可以设置以下信息：

- 提供商昵称
- Base URL
- API key
- Protocol
- Endpoint preset
- Model name
- Custom headers

这适用于自定义网关、第三方 API 平台、代理服务或兼容 OpenAI 的模型提供商。

![Providers 区域中的 OpenAI-Compatible](/custom-api/providers-section.png)

## 打开自定义 API 配置面板

在 **OpenAI-Compatible** 区域中，找到默认插槽。

它可能显示为 **OpenAI-Compatible 1**。

你可以点击插槽区域，或点击右侧的 **Manage slots**。

![包含默认插槽和 Manage slots 操作的 OpenAI-Compatible 插槽条目](/custom-api/open-slot-entry.png)

这会打开自定义 API 配置面板。

在此面板中，你可以为自定义 API 提供商配置连接、身份验证、协议、端点和可用模型。

![包含连接和模型设置的 OpenAI-Compatible 提供商配置面板](/custom-api/custom-api-panel-current.png)

## 管理提供商插槽

在 **OpenAI-Compatible Providers** 面板的左上角，你会看到 **Available** 选择器。

此选择器会显示可用的自定义 API 插槽。

Breezell 最多支持 **50 个 OpenAI-Compatible 提供商插槽**。每个插槽都可以配置为独立的自定义 API 通道。

例如，你可以为不同的提供商、网关、API 密钥或模型组使用不同的插槽。

点击 **Available** 选择器，打开插槽列表。

![显示 1 到 50 个自定义 API 插槽的 Available 选择器](/custom-api/provider-slots-current.png)

你会看到编号从 **1** 到 **50** 的插槽。

如果当前正在配置 **Slot 1**，可以选择 **Slot 2** 来配置另一个自定义 API 通道。

选择其他插槽后，配置面板会切换到该插槽。然后，你可以为新通道输入不同的提供商名称、Base URL、API key、Protocol、Endpoint 和模型列表。

## 配置连接

返回主配置面板。

在 **Connection** 区域中，你可以配置此自定义 API 提供商的基本连接信息。

![包含昵称、Base URL、API key、Protocol 和模型的自定义 API 提供商 Connection 区域](/custom-api/configure-connection-current.png)

你可以设置：

- Nickname
- Base URL
- API Key
- Protocol
- Endpoint preset
- Custom headers
- Model names

**Nickname** 用于识别此自定义提供商。你可以输入提供商名称、网关名称或任何便于识别此通道的标签。

**Base URL** 是 API 网关地址。

Base URL 必须以以下内容之一开头：

```text
http://
```

或：

```text
https://
```

例如：

```text
https://api.example.com/v1
```

或：

```text
http://127.0.0.1
```

如果 Base URL 不以 `http://` 或 `https://` 开头，请求可能会失败。

## 检查最终请求 URL

输入 Base URL 并选择端点预设后，请检查 Protocol 区域下方显示的 **Request URL**。

这里会显示 Breezell 实际使用的最终请求地址。

例如，如果 Base URL 是：

```text
http://127.0.0.1
```

并且端点预设是 **OpenAI Generic**，Breezell 可能会生成：

```text
http://127.0.0.1/v1/chat/completions
```

你应仔细确认最终的 Request URL 是否正确。

这一点很重要，因为不同提供商可能以不同方式定义网关 URL。

有些提供商要求 Base URL 包含 `/v1`，而另一些提供商只要求根域名。

例如，一个提供商可能要求：

```text
https://api.example.com/v1
```

而另一个提供商可能要求：

```text
https://api.example.com
```

如果提供商使用非标准网关格式，自动补全端点可能无法正确工作。

这可能导致最终请求路径（例如 `/v1/chat/completions`）重复、缺失或组合错误。

在保存或使用提供商之前，请始终检查生成的 **Request URL**，确保它与提供商的 API 文档一致。

![OpenAI-Compatible 提供商 Protocol 区域下方的 Request URL 预览](/custom-api/request-url-current.png)

## 选择请求协议

在 **Protocol** 区域中，选择与你的提供商匹配的请求协议。

常见选项包括：

- OpenAI
- Responses
- Anthropic

对于大多数兼容 OpenAI 的第三方 API，请选择 **OpenAI**。

如果你的提供商使用 OpenAI Responses API，请选择 **Responses**。

如果你的提供商或网关需要兼容 Anthropic 的请求，请选择 **Anthropic**。

请根据提供商要求的 API 格式选择协议。如果协议与提供商不匹配，即使 Base URL 和 API key 正确，请求也可能失败。

## 选择端点预设

协议选择非常重要，因为它决定了模型能否被正确请求。

即使提供商声称兼容 OpenAI API，实际请求路径也可能不同于官方 OpenAI API 规范。

一些提供商会修改标准端点结构。Breezell 已适配其中许多提供商特有的变体。

点击端点预设下拉菜单，查看可用预设。

![显示提供商特定请求路径选项的 Endpoint preset 下拉菜单](/custom-api/endpoint-preset-current.png)

你可能会看到以下选项：

- OpenAI Generic
- Zhipu GLM
- Volcengine Ark
- Volcengine Coding
- DashScope Qwen
- DeepSeek
- Images

每个预设代表不同的请求路径。

例如，**OpenAI Generic** 可能使用：

```text
/v1/chat/completions
```

其他提供商可能使用不同的端点路径，例如：

```text
/api/paas/v4/chat/completions
```

```text
/api/v3/chat/completions
```

```text
/compatible-mode/v1/chat/completions
```

```text
/chat/completions
```

请选择与你的提供商匹配的端点预设。

如果不确定应使用哪个预设，请查看提供商的 API 文档，并将其与 Breezell 中显示的最终 **Request URL** 进行比较。

如果你的提供商使用 Breezell 尚未适配的格式，请联系我们，以便我们添加对该提供商的支持。

## 配置自定义请求头

**Custom Headers** 区域是可选的。

仅当你的提供商、网关或代理服务需要额外的 HTTP 请求头时，才使用此区域。

自定义请求头会附加到通过当前自定义 API 插槽发送的每个请求中。

该值必须是有效的 JSON。

![带有 JSON 示例和预设快捷方式的 Custom Headers 字段](/custom-api/custom-headers-current.png)

例如：

```json
{
  "X-Custom-Header": "value"
}
```

你可以使用自定义请求头满足提供商特定的要求，例如：

- 特殊路由请求头
- 组织或项目请求头
- 代理身份验证请求头
- Beta 功能请求头
- 长上下文功能请求头

如果你的提供商不需要自定义请求头，可以将此区域留空，或保留为空 JSON 对象。

```json
{}
```

请确保 JSON 格式有效。

键和值都必须使用双引号。不要使用注释、尾随逗号或单引号。

正确示例：

```json
{
  "X-Provider-Mode": "compatible"
}
```

错误示例：

```json
{
  'X-Provider-Mode': 'compatible',
}
```

在自定义请求头字段下方，Breezell 可能会提供预设快捷方式。

例如，**Claude 1M** 预设可以自动填入启用 Claude 1M 上下文支持所需的请求头。

如果提供商文档要求特定请求头，请将该请求头复制到此区域，并在发送请求前确认它是有效的 JSON。

## 获取并添加可用模型

完成连接信息配置后，点击面板右侧的 **Fetch Available Models**。

Breezell 会尝试请求提供商并加载可用模型列表。

如果请求成功，可用模型会出现在模型选择列表中。

![Fetch Available Models 按钮及已加载到选择列表中的可用模型](/custom-api/fetch-available-models-current.png)

确认提供商设置正确后，可以点击此按钮获取并选择自己的模型。

然后选择想要使用的模型，并点击 **Add 1 Model**。

例如，你可以选择以下模型：

```text
gpt-5.5
```

然后点击 **Add 1 Model**，将它添加到当前自定义 API 提供商。

如果此时左侧区域仍然为空，请重启 Breezell 后重试。

![获取可用模型后左侧区域仍为空](/custom-api/fetch-results-empty.png)

配置提供商并尝试加载模型后，你还可以使用 **Check All** 检查网关连接是否正常。

![用于测试提供商和网关健康状态的 Check All 按钮](/custom-api/check-gateway-health-button.png)

如果检查成功，连接卡片可能会显示 **Healthy** 等状态。更改配置后，也可以使用 **Recheck** 再次测试网关。

![检查成功后显示健康网关状态的连接卡片](/custom-api/check-gateway-health-result.png)

## 手动添加模型

你也可以手动添加模型。

在模型输入框中输入 API 提供商提供的模型名称。

然后点击 **Add**。

当提供商不提供模型列表端点，或者想使用的模型没有出现在 **Fetch Available Models** 返回结果中时，这个功能很有用。

请确保模型名称与提供商要求的模型 ID 完全一致。

![带有 Add 按钮的手动模型输入框](/custom-api/manual-model-add-current.png)

## 启用、禁用或删除模型

添加模型后，它们会出现在 **Models** 列表中。

每个模型项目都可以单独管理。

你可以使用模型项目右侧的开关启用或禁用模型。

模型启用后，Breezell 就可以使用它发送请求。

模型禁用后，Breezell 会保留配置，但不会使用该模型。

将鼠标移到模型项目上，可以显示更多操作。

点击删除按钮即可删除模型。

当你不再希望模型出现在当前提供商中时，可以使用此功能。

![包含启用、禁用、设置和删除控制项的模型列表](/custom-api/model-management-current.png)

## 打开高级模型设置

如果你想为模型配置更详细的行为，请点击模型项目上的设置按钮。

这会打开 **Advanced Settings** 面板。

高级设置是可选的。除非你了解提供商要求的模型限制和请求格式，否则大多数用户不需要修改这些设置。

## Advanced Settings

在高级设置面板中，你可以自定义模型级行为。

![自定义 API 模型的 Advanced Settings 面板](/custom-api/advanced-settings-original.png)

### 启用自定义设置

**Enable custom settings** 开关控制此模型是否使用自己的高级配置。

如果此开关关闭，Breezell 会使用模型默认识别出的设置。

如果此开关开启，高级设置面板中的值会覆盖此模型的默认行为。

### Context Window

**Context Window** 定义模型支持的最大上下文长度。

这通常表示模型在一次请求中可以处理的最大令牌数，包括对话历史、系统消息、用户消息、工具结果和其他上下文。

例如，以下值：

```text
400000
```

表示模型配置了 400k 的上下文窗口。

此字段支持自动转换 `k` 后缀。

例如：

```text
128k
```

会被转换为：

```text
128000
```

请使用模型提供商提供的值。如果模型实际上不支持这么大的上下文，将此值设置得过高可能会导致请求失败。

### Output Token Space

**Output Token Space** 定义为模型响应预留的最大输出令牌空间。

例如，以下值：

```text
128000
```

表示模型最多可以为输出预留 128k 个令牌。

此字段同样支持自动转换 `k` 后缀。

例如：

```text
8k
```

会被转换为：

```text
8000
```

请使用与提供商实际输出限制匹配的值。

### System Message

**System Message** 控制 Breezell 如何向模型发送系统级指令。

一些模型要求系统消息使用标准的 `system` 角色。

另一些模型可能要求不同的角色格式，例如 `developer` 角色。

如果提供商要求特定的系统消息格式，请在此处选择匹配的选项。

如果不确定，请保留默认设置。

### Tool Format

**Tool Format** 控制工具如何描述并发送给模型。

对于兼容 OpenAI 的模型，请使用 **OpenAI Style**。

如果提供商要求不同的工具调用格式，请选择与提供商文档匹配的格式。

错误的工具格式设置可能会导致工具调用失败。

### Supports Thinking

**Supports Thinking** 表示模型是否支持推理或思考模式。

仅当模型提供商支持此功能时才启用它。

### Can Disable Thinking

**Can Disable Thinking** 表示是否允许 Breezell 为此模型禁用思考模式。

这适用于同时支持推理模式和非推理模式的模型。

### Can Stream Reasoning

**Can Stream Reasoning** 表示模型是否可以在生成过程中流式传输推理内容。

仅当提供商支持流式推理输出时才启用此选项。

如果提供商不支持此功能，启用它可能会导致请求错误或响应不完整。

## 保存高级设置

修改高级设置后，点击 **Save**。

如果不想应用更改，请点击 **Cancel** 或关闭面板。

只有在了解模型正确配置值的情况下，才应修改高级设置。错误的上下文大小、输出令牌限制、消息格式、工具格式或思考设置可能导致模型行为异常或无法响应。

## 选择自定义模型

添加并启用自定义模型后，返回聊天界面。

点击输入框附近的模型选择器。

在模型列表中，你会看到 Breezell 内置模型、Codex 模型和自定义 OpenAI-Compatible 模型。

自定义提供商会显示在自己的提供商分组下。例如，如果提供商昵称是 **TEST**，你在该提供商下添加的模型会显示在 **TEST** 分组中。

选择想要使用的模型。

如果添加了多个模型，请选择与当前任务匹配的模型。

![显示内置模型和 TEST 自定义提供商分组的模型选择器](/custom-api/select-custom-model-original.png)

## 调整上下文和推理选项

选择模型后，可以打开模型选项面板。

在此面板中，你可能会看到以下选项：

- Context size
- Reasoning mode
- Reasoning strength
- Fast mode

**Context** 选项控制模型可以使用多少对话历史或输入上下文。

**Reasoning** 选项控制是否启用推理模式。

如果启用了推理，可以选择推理强度，例如：

- Low
- Medium
- High
- Extra High

较高的推理强度可能适用于复杂的编码、规划、调试或分析任务。

较低的推理强度可能更适合简单问题或需要更快响应的场景。

如果模型支持 **Fast** 模式，可以启用它来优先提高响应速度。

可用选项可能会根据所选模型和提供商而不同。

![包含上下文和推理设置的模型选项面板](/custom-api/model-options-original.png)

## 开始对话

选择模型并调整选项后，在输入框中输入消息。

然后发送消息，开始对话。

例如，你可以输入：

```text
Hello
```

如果自定义 API 配置正确，Breezell 会通过自定义提供商发送请求，并在聊天中返回模型响应。

现在你已经完成自定义 API 设置。

![通过自定义模型发送消息后的聊天视图](/custom-api/start-conversation-original.png)
