---
title: Mode Selection
description: Overview of Breezell work modes and when to use each one.
---

# Mode Selection

Breezell provides multiple work modes for different levels of autonomy, depth, and workflow control. Agent is the default mode and the recommended automatic workflow for most tasks.

Use another mode when you want a more specific interaction style, such as quick conversation, read-only analysis, planning before edits, deeper causal reasoning, or parallel AI teammates.

## Chat

Chat is for quick questions and answers.

Use Chat when you want to ask about code, explain an idea, compare options, or get a fast response without asking Breezell to edit files or run tools autonomously.

In Chat mode, the model cannot edit files.

## Agent

Agent lets Breezell inspect the project, edit files, use tools, run commands, and complete coding tasks.

Use Agent for most development work. It is the default mode because it can choose a reasonable workflow automatically, gather the context it needs, make changes, and verify the result before delivery.

## Analyze

Analyze is for read-only investigation.

Use Analyze when you want Breezell to inspect code, diagnose issues, review architecture, or audit behavior without changing files. It is useful when you need a technical finding before deciding what to modify.

## Plan

Plan creates a structured implementation path before editing.

Use Plan for complex features, larger refactors, unclear requirements, or work that needs a design decision before code changes begin.

Tip: In Agent mode, Breezell may decide to switch to Plan when the task requires a structured implementation path. You can allow or reject the switch. If full auto mode is enabled, Breezell can confirm the switch automatically when it is appropriate.

## Entanglement

Entanglement uses causal reasoning and context awareness for deeper product and code decisions.

Entanglement is independently researched and released by Breezell. It is a Breezell-exclusive mode and unique across the web.

Use Entanglement when a request depends on intent, trade-offs, hidden causes, emotional nuance, or multi-step reasoning that needs more than a direct answer.

Tip: This mode can greatly improve model capability, but it consumes more resources than standard workflows. Its side effects are unknown.

Tip: Because the Entanglement context has already been injected, switching from Entanglement to Agent inside the same conversation will not fully disable Entanglement behavior. The conversation will still keep Entanglement capabilities and resource consumption. Start a new conversation if you want to return to a normal Agent workflow.

## Teams

Teams coordinates multiple AI teammates for large features and parallel workflows.

Use Teams when a task can be split into independent workstreams, such as researching multiple areas, comparing implementations, or moving several parts of a larger project forward at the same time.

Tip: This mode can greatly improve model capability, but it consumes more resources than standard workflows.

Limitation: Teams can still be constrained by read and write conflicts between parallel teammates. Breezell works to reduce these conflicts, but large parallel tasks may still become harder to coordinate and can create confusion if multiple teammates touch overlapping areas.

## Choosing a Mode

For most tasks, keep the default Agent mode. Switch modes only when the task clearly needs a different workflow.

| Mode | Best for |
| --- | --- |
| Chat | Fast conversation and quick explanations |
| Agent | Default coding workflow, file edits, tools, and verification |
| Analyze | Read-only diagnosis, reviews, and architecture investigation |
| Plan | Structured implementation planning before changes |
| Entanglement | Deep causal reasoning and context-aware decisions |
| Teams | Parallel AI teammates for large or independent workstreams |
