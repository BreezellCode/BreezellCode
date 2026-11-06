# Models and providers

The user's chat models, from a plugin's own code: a request like one from the chat, the model picker,
and the user's custom APIs.

## A request (`models.request`)

```ts
const answer = await vscode.breezell.models.request({
	system: 'You review code briefly.',
	messages: [{ role: 'user', content: `Review this:\n${selection}` }],
	onText: soFar => panel.update(soFar),                    // streams
}, token);
console.log(answer.model, answer.text, answer.usage?.outputTokens);
```

### More than text

```ts
const checked = await vscode.breezell.models.request({
	model: { provider: 'openAICompatible', model: 'vision-model' },    // one of models.list()
	messages: [{ role: 'user', content: 'What does this screen show?', images: [{ mimeType: 'image/png', data: base64 }] }],
	responseFormat: 'json',                                          // the answer parsed into .json
	maxOutputTokens: 400,
});
const result = checked.json as { broken: boolean; why: string };
```

- `model`: one of the model picker's models (`models.list()`) instead of the chat model. It needs no `models.select`.
- `images` on user messages: base64 without the `data:` prefix, png, jpeg, gif or webp, up to 8 per request.
  A model known not to read images refuses them (`BreezellInvalidRequest`).
- `responseFormat: 'json'`: the model is told to answer with one JSON value, and `json` holds it parsed
  (also out of a code fence). An answer with no JSON fails with `BreezellModelError`.
- `maxOutputTokens` (16 to 65,536) caps the answer; a model's reasoning counts too. Some relays
  (OpenAI Responses) do not apply it.

Rules of `models.request`:

- The first time a plugin uses it, Breezell asks the user. The user can revoke it at any time under
  **Plugins › Installed**.
- A request counts exactly like one the user sends in the chat: Breezell models are billed to the
  user's account, and a custom provider (Custom API) needs a plan that includes Custom API, as the
  server-signed entitlement says.
- The user's rules, skills and memories are not added, and no memory recall runs (no Super Memory quota is used).
- Each plugin may have at most 2 requests running and 20 a minute; a request holds at most 100
  messages and 200,000 characters.
- `onText` gets the whole text so far while the reply streams, `onReasoning` the model's reasoning so
  far while it thinks (models that reason and relays that pass it on), so a plugin can show it is
  working before any text. While a reply is silent Breezell checks that the API still answers (as it
  does for its own background requests): the request fails with `BreezellModelError` when the API
  stopped answering, and after five minutes in all.
- Errors carry a `name`: `BreezellNotSignedIn`, `BreezellPermissionDenied`, `BreezellRateLimited`,
  `BreezellNoModel`, `BreezellInvalidRequest`, `BreezellModelError`, `BreezellCancelled`,
  `BreezellBlocked` (the plugin is on the [blocklist](publishing.md#blocklist)).

## The model picker (`models.select`)

```ts
const models = await vscode.breezell.models.list();   // { provider, model, name, current }[]
await vscode.breezell.models.select({ provider: models[0].provider, model: models[0].model });
```

`select` switches the chat model exactly as the user's picker does, and only to a model it offers.

## Custom APIs

| Call | Permission | Gives |
|---|---|---|
| `providers.list()` | `providers.list` (normal) | Each custom API without keys: id, name, protocol, host, header names, pool size, models |
| `providers.listCustom()` | `providers.read` (dangerous) | Everything the settings page shows, **API keys** included. Only for an account whose plan includes Custom API (`BreezellPlanRequired` otherwise, without asking) |

Requests a plugin sends with those keys go to the provider directly and are billed to the user by it.
