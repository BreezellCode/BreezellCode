# Doc Writer

Writes doc comments and explains code with your Breezell chat model.

The official example of a Breezell plugin that calls the model (`vscode.breezell.models.request`).
Source: [`plugins/examples/doc-writer`](https://github.com/BreezellCode/BreezellCode/tree/main/plugins/examples/doc-writer).

## Use

Select some code, right-click, then:

- **Write Doc Comment**: inserts a doc comment above the selection, in the comment syntax of the file's language.
- **Explain Selection**: streams an explanation into a Markdown document beside the code.

Both are also in the command palette under "Doc Writer". The setting `docWriter.language` sets the
language of the comments and explanations (English by default).

## Permissions and cost

Doc Writer asks for one permission, `models.request`. Breezell asks you once before its first
request, and you can revoke it under **Breezell Console › Plugins › Installed**. Requests run on
your current chat model and count exactly like your own chat requests.

## What the example shows

- Checking for `vscode.breezell` (undefined outside Breezell).
- A plain request (`writeDoc`) and a streamed one with `onText` (`explain`).
- Cancelling through the progress notification's cancellation token.
- Handling each error `name`: `BreezellNotSignedIn`, `BreezellPermissionDenied`, `BreezellNoModel`,
  `BreezellRateLimited`, `BreezellCancelled`.
- Checking that the answer is a comment before it goes into the code (`src/comment.ts`): models do not always follow the instructions, and an answer that is not a comment is shown beside the code instead.
- `"extensionKind": ["ui", "workspace"]`, so it also works in WSL and SSH windows.
