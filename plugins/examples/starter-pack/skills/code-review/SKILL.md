---
name: code-review
description: Use when the user asks for a review of a change, a diff, a file or a pull request.
---

# Code review

Review what changed, not the whole codebase.

1. Find the change: the diff, the files named, or the selection. Read the code around it.
2. Look for, in this order:
   - Bugs: wrong conditions, missing cases, off-by-one, null or undefined, races, error paths that swallow failures.
   - Security: input that reaches a shell, a query, a path or HTML without checks; secrets in code or logs.
   - Behaviour changes the change did not mean to make.
   - Missing or weak tests for what changed.
   - Only then: naming, duplication, clarity.
3. For each finding give the file and line, what goes wrong, and a concrete fix. Say how sure you are.
4. End with a one-line verdict: ready, ready after small fixes, or needs another pass.

Do not rewrite code that works just to match a style.
