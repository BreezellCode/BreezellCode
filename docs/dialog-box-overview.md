---
title: Dialog Box Overview
description: Overview of the Breezell dialog box, including mentions, context usage, mode selection, model controls, and quick actions.
---

# Dialog Box Overview

The Breezell dialog box is the main place where you write prompts, choose a working mode, select a model, attach context, and control how the agent handles the current request.

This page explains the visible controls shown in the dialog box screenshots.

## Default Input State

The default input state is the normal starting point for a new message. It keeps the prompt field and essential controls visible.

![Default input state](/dialog-box/input-default.png)

Type your request, choose the mode and model if needed, then send the message to Breezell.

## Mode Selector Menu

The pointer highlights the mode selector menu. This menu lists the available working modes.

![Mode selector menu](/dialog-box/mode-selector.png)

Available modes include:

- [**Chat**](/mode-selection#chat) for quick questions and answers
- [**Plan**](/mode-selection#plan) for implementation planning before editing
- [**Analyze**](/mode-selection#analyze) for read-only investigation
- [**Entanglement**](/mode-selection#entanglement) for deeper causal reasoning
- [**Agent**](/mode-selection#agent) for autonomous file edits and tool usage
- [**Teams**](/mode-selection#teams) for parallel AI teammates on complex tasks

For more details, see [Mode Selection](/mode-selection). Choose the mode that matches the amount of autonomy and depth you need.

## Model Selector

The pointer highlights the model selector. The selector shows the current model and lets you switch to another available model before sending the message.

![Model selector](/dialog-box/input-compact-controls.png)

Use this when you want to choose a model with different speed, reasoning, or capability characteristics.

## File Upload

The pointer highlights the file upload control.

![File upload control](/dialog-box/input-model-controls.png)

Click this control to attach local files to the current message before sending it to Breezell. Uploaded files become part of the request context, so Breezell can inspect or reference them while answering.

## ~~Advanced Exploration~~

> **Deprecated after version 1.2.5.** The dedicated Advanced Exploration control is no longer available. When a request requires deeper research, Breezell automatically invokes the related capabilities for active learning, broader investigation, and more thorough exploration.

![Advanced Exploration control](/dialog-box/input-tools-expanded.png)

## Breezell Browser

The pointer highlights the **Breezell Browser** control.

![Breezell Browser control](/dialog-box/input-agent-basic.png)

Breezell Browser is Breezell's built-in browser tool. Use it to open webpages, view online content, search for information, and help AI retrieve and analyze web content without leaving the dialog box.

## Context Usage Breakdown

The pointer highlights the context usage indicator. Opening it shows a detailed breakdown of how the current context window is being used.

![Context usage breakdown](/dialog-box/context-usage-breakdown.png)

The breakdown separates usage into categories such as system prompt, tools, rules, memories, skills, MCP, subagents, and conversation content. Use it to understand which parts of the session are consuming the most tokens.

## Context Manual Compression

The pointer highlights the **Manual compress** control in the context panel. This action summarizes earlier conversation content so the session can keep useful information while reducing context usage.

![Context panel with manual compression](/dialog-box/context-manual-compress.png)

Manual compression is useful during long conversations, especially when the context window is becoming large but you still want to continue in the same session.

## Mention Menu

The pointer highlights the quick context area used to open the mention menu. The mention menu lets you add files, folders, MCP tools, and skills to the current message.

![Mention menu in the Breezell dialog box](/dialog-box/mention-menu.png)

Use this when your request depends on specific workspace content or an external capability. Adding the right context helps Breezell understand what it should inspect or use before answering.

## Usage Tips

- Add file or folder context when the request depends on specific project content.
- Agent is the default mode and the recommended automatic workflow for most tasks.
- Change modes only when you need a specific workflow, such as planning first or analyzing without editing.
- Context compression runs automatically. Use manual compression only when you prefer strict manual control or have a special requirement.
- Review the selected model when accuracy, speed, or reasoning depth matters.