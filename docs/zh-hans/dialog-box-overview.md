---
title: 对话框概览
description: 概览 Breezell 对话框，包括提及、上下文用量、模式选择、模型控制和快捷操作。
---

# 对话框概览

Breezell 对话框是编写提示词、选择工作模式、选择模型、附加上下文以及控制智能体处理当前请求方式的主要位置。

本页面介绍对话框截图中显示的可见控件。

## 默认输入状态

默认输入状态是新消息的正常起始状态。它会保持提示词输入框和必要控件可见。

![默认输入状态](/dialog-box/input-default.png)

输入请求，并在需要时选择模式和模型，然后将消息发送给 Breezell。

## 模式选择器菜单

指针突出显示模式选择器菜单。此菜单列出可用的工作模式。

![模式选择器菜单](/dialog-box/mode-selector.png)

可用模式包括：

- [**Chat**](/zh-hans/mode-selection#chat)，用于快速提问和回答
- [**Plan**](/zh-hans/mode-selection#plan)，用于编辑前制定实现计划
- [**Analyze**](/zh-hans/mode-selection#analyze)，用于只读调查
- [**Entanglement**](/zh-hans/mode-selection#entanglement)，用于更深入的因果推理
- [**Agent**](/zh-hans/mode-selection#agent)，用于自主编辑文件和使用工具
- [**Teams**](/zh-hans/mode-selection#teams)，用于复杂任务中的并行 AI 队友

更多详情请参阅[模式选择](/zh-hans/mode-selection)。选择符合你所需自主程度和深度的模式。

## 模型选择器

指针突出显示模型选择器。选择器显示当前模型，并允许你在发送消息前切换到其他可用模型。

![模型选择器](/dialog-box/input-compact-controls.png)

当你想要选择具有不同速度、推理能力或功能特征的模型时，可以使用此控件。

## 文件上传

指针突出显示文件上传控件。

![文件上传控件](/dialog-box/input-model-controls.png)

点击此控件，在将当前消息发送给 Breezell 之前附加本地文件。上传的文件会成为请求上下文的一部分，因此 Breezell 可以在回答时检查或引用这些文件。

## ~~高级探索~~

> **1.2.5 版本后已弃用。** 专用的高级探索控件已不再提供。当请求需要更深入的研究时，Breezell 会自动调用相关能力，进行主动学习、更广泛的调查和更彻底的探索。

![高级探索控件](/dialog-box/input-tools-expanded.png)

## Breezell 浏览器

指针突出显示 **Breezell Browser** 控件。

![Breezell Browser 控件](/dialog-box/input-agent-basic.png)

Breezell Browser 是 Breezell 内置的浏览器工具。你可以使用它打开网页、查看在线内容、搜索信息，并帮助 AI 在不离开对话框的情况下获取和分析网页内容。

## 上下文用量明细

指针突出显示上下文用量指示器。打开后会显示当前上下文窗口使用情况的详细明细。

![上下文用量明细](/dialog-box/context-usage-breakdown.png)

明细会将用量分为系统提示词、工具、规则、记忆、技能、MCP、子智能体和对话内容等类别。你可以利用它了解会话中哪些部分消耗了最多令牌。

## 手动压缩上下文

指针突出显示上下文面板中的 **Manual compress** 控件。此操作会总结较早的对话内容，使会话在减少上下文用量的同时保留有用信息。

![带有手动压缩功能的上下文面板](/dialog-box/context-manual-compress.png)

手动压缩适用于长时间对话，尤其是上下文窗口变大但你仍希望继续使用同一会话时。

## 提及菜单

指针突出显示用于打开提及菜单的快捷上下文区域。提及菜单允许你将文件、文件夹、MCP 工具和技能添加到当前消息中。

![Breezell 对话框中的提及菜单](/dialog-box/mention-menu.png)

当请求依赖特定工作区内容或外部能力时，可以使用此功能。添加正确的上下文有助于 Breezell 在回答前理解应该检查或使用哪些内容。

## 使用提示

- 当请求依赖特定项目内容时，添加文件或文件夹上下文。
- Agent 是默认模式，也是大多数任务推荐的自动工作流。
- 只有在需要特定工作流（例如先规划或只分析而不编辑）时才切换模式。
- 上下文压缩会自动运行。只有在偏好严格手动控制或有特殊要求时，才使用手动压缩。
- 当准确性、速度或推理深度很重要时，请检查所选模型。