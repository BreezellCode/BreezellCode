---
name: write-tests
description: Use when the user asks to add or improve tests for a function, module or bug fix.
---

# Write tests

1. Find the project's test setup: the framework, where tests live, how they are named and run. Follow it.
2. List the cases before writing them: the normal path, edges (empty, one, many, limits), invalid input,
   and the bug being fixed, if any (a test that fails without the fix).
3. One behaviour per test, with a name that says what it checks. Arrange, act, assert.
4. Use real values; mock only what is slow or external (network, clock, file system).
5. Run the tests. Report what passed, what failed, and why a failure is or is not expected.
