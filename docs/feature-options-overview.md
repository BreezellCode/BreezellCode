---
title: Feature Options Overview
description: Overview of Breezell feature options, permissions, editor behavior, intelligence settings, and system access controls.
---

# Feature Options Overview

This page summarizes the main feature options available in Breezell settings. These options control autocomplete, notifications, tool permissions, editor behavior, intelligence features, and system access.

## Help

### Autocomplete and Notifications

| Feature | Description |
| --- | --- |
| Autocomplete | BreezellTab provides AI-powered code completion. Press `Tab` to accept suggestions. |
| System Notifications | Configure system notification behavior. Breezell can show system notifications when the editor is minimized or loses focus. |

## Execution

### Tool Permissions

These options control whether specific tool operations can run automatically without manual confirmation.

| Feature | Description |
| --- | --- |
| Auto-approve Edits | Allow edit operations to run automatically without confirmation. |
| Auto-approve Terminal | Allow terminal operations to run automatically without confirmation. |
| Auto-approve Database Operations | Allow database operations to run automatically without confirmation. |
| Auto-approve Media Generation | Allow media generation operations to run automatically without confirmation. |
| Auto-approve MCP Tools | Allow MCP tool operations to run automatically without confirmation. |
| Auto-approve Teams | Automatically approve team creation without manual confirmation. |

## Editor

### Code Behavior

| Feature | Description |
| --- | --- |
| Auto-fix Lint Errors | Automatically fix lint errors when supported. |
| Auto-accept Code Changes | Automatically accept generated or modified code changes. |
| Auto-open Files While Editing | Automatically open files during editing. |
| Show Inline Suggestions on Selection | Show inline suggestions when text or code is selected. |

### Git Commit Message

Use this option to let Breezell generate a Git commit message from the current code changes. This is useful when you want a clear commit summary without writing it manually.

![Generate commit messages with the chat model](/feature-options/git-commit-message.png)

| Feature | Description |
| --- | --- |
| Generate Commit Messages with Chat Model | Automatically generate Git commit messages based on the current code changes. |

When this option is enabled, Breezell can review the current change set and create a commit message with the selected chat model. Review the generated message before committing if your project requires a specific commit format.

## Intelligence

### Context Management

| Feature | Description |
| --- | --- |
| Auto-run Plan Cards | When enabled, new plan cards run automatically without manual clicks. |

### Superpowers Skills

| Feature | Description |
| --- | --- |
| Enable Superpowers Skills | Allow AI to use structured development workflows such as brainstorming, planning, TDD, and code review. Full content is loaded on demand. |

### ~~Agent Advanced Exploration~~

> **Deprecated after version 1.2.5.** This option has been removed. When a request requires deep multi-source research, Breezell automatically invokes the related capabilities and summarizes the results into a cited research report.

| Feature | Description |
| --- | --- |
| ~~Enable Advanced Exploration~~ | Deprecated after version 1.2.5; the related research capabilities are invoked automatically when needed. |

### Entanglement Mode Panel

| Feature | Description |
| --- | --- |
| Show Panel in Entanglement Mode | Display a real-time structured panel for Entanglement mode, including the current stage, confidence history, active and resolved hypotheses, graded evidence logs, and causal graphs. |

## System

### Network Settings

| Feature | Description |
| --- | --- |
| Use System Proxy | Use the system proxy to send API requests. If no proxy is needed or the proxy is unstable, disabling this option is recommended to improve response speed. |

### External File Access

| Feature | Description |
| --- | --- |
| Allow Read-only Access to External Files | Allow tools to read files outside the workspace. |
| Allow Write Access to External Files | Allow tools to modify files outside the workspace. Both external file access options are enabled by default. |

## Notes

Auto-approval and external access options can improve workflow speed, but they also reduce manual review. Enable them only when they match your workspace policy and trust level.