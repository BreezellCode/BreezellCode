/*---------------------------------------------------------------------------------------------
 *  Breezell plugin API — typings for plugin authors. MIT License.
 *
 *  Put this file in your plugin (the devkit does: types/breezell.d.ts) next to @types/vscode.
 *  It adds `vscode.breezell`, which Breezell provides to extensions whose package.json has a
 *  "breezell" object: { "apiVersion": 1, "permissions": [...] }. In other editors
 *  `vscode.breezell` is undefined, so check it before use.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

	export namespace breezell {

		/**
		 * The plugin API generation this Breezell implements. A plugin declares the one it
		 * was written for in `breezell.apiVersion`.
		 */
		export const apiVersion: number;

		/**
		 * Breezell's display language, which `vscode.env.language` does not follow: `en`, `zh-CN`,
		 * `zh-TW`, `ja`, `ko`, `ru`, `es` or `pt-BR`. Empty for a moment at start, until it is known.
		 */
		export const language: string;

		/** Breezell's display language changed, or became known. */
		export const onDidChangeLanguage: Event<string>;

		/**
		 * The permissions this plugin declared in `breezell.permissions`, as an Android app declares
		 * its permissions: nothing undeclared is ever usable. A `normal` permission is
		 * on unless the user turns it off (`chat.events`, `models.select`). A `dangerous` one
		 * (`models.request`, `chat.read`, `chat.send`, `chat.approve`, `providers.read`, `agent.tools`) is asked for
		 * the first time the plugin uses it; while the user
		 * has not allowed it, its calls fail with `BreezellPermissionDenied`. The user can switch each
		 * permission on and off, or all at once, on the plugin's page in Plugins › Installed.
		 */
		export const permissions: readonly string[];

		export namespace account {
			/**
			 * Whether a Breezell account is signed in. Plugins run only while one is: signing
			 * out turns them off, and every call below fails with `BreezellNotSignedIn`.
			 */
			export const isSignedIn: boolean;

			export const onDidChangeSignIn: Event<boolean>;
		}

		export interface TurnEvent {
			/** The same for a turn's start and finish events. */
			readonly turnId: string;
			/** Stable per conversation for this window; not the conversation's own id. */
			readonly conversationId: string;
			/** The chat mode, e.g. `normal`, `agent`, `plan`, `analyze`. */
			readonly mode: string;
		}

		export interface TurnFinishEvent extends TurnEvent {
			readonly outcome: 'completed' | 'error' | 'stopped';
			readonly durationMs: number;
		}

		/**
		 * The user's conversations in Breezell's chat.
		 *
		 * - `chat.events` (normal: on unless the user turns it off): when turns start and finish,
		 *   without their content.
		 * - `chat.read` (dangerous: asked the first time): the conversations of this workspace as the
		 *   user sees them, including tool calls with their results and the memories recalled for
		 *   each message; `show` opens one in Breezell's chat.
		 * - `chat.send` (dangerous): send messages, and start conversations. The AI answers them like
		 *   the user's own, and they are billed the same way. At most 10 a minute.
		 * - `chat.approve` (dangerous): approve or reject the tool call a conversation waits for.
		 */
		export namespace chat {
			export const onDidStartTurn: Event<TurnEvent>;
			export const onDidFinishTurn: Event<TurnFinishEvent>;

			/** The conversations, the most recently changed first (`chat.read`). */
			export function listConversations(): Thenable<ConversationSummary[]>;
			/** One conversation with its messages (`chat.read`). */
			export function getConversation(id: string): Thenable<Conversation>;
			/** A conversation changed: a message, a tool call's status, or the reply being written (`chat.read`). */
			export const onDidChangeConversation: Event<ConversationChange>;
			/** Opens the conversation in Breezell's chat (`chat.read`). */
			export function show(id: string): Thenable<void>;
			/**
			 * Sends a message as the user would (`chat.send`); without `conversationId`, in a new
			 * conversation. Resolves once the message is in the conversation; the reply follows
			 * through onDidChangeConversation. Fails while the conversation is busy.
			 */
			export function send(text: string, options?: { readonly conversationId?: string }): Thenable<{ readonly conversationId: string }>;
			/** Approves the tool call the conversation waits for (`chat.approve`). */
			export function approve(conversationId: string): Thenable<void>;
			/** Rejects the tool call the conversation waits for (`chat.approve`). */
			export function reject(conversationId: string): Thenable<void>;
		}

		/** What a conversation is doing now. */
		export type ConversationActivity = 'idle' | 'thinking' | 'writing' | 'runningTool' | 'awaitingApproval' | 'working';

		export interface ConversationSummary {
			readonly id: string;
			readonly title: string;
			readonly createdAt: string;
			readonly updatedAt: string;
			readonly messageCount: number;
			/** It is the conversation open in Breezell's chat. */
			readonly current: boolean;
			readonly activity: ConversationActivity;
		}

		export interface RecalledMemory {
			readonly id: string;
			readonly summary: string;
			readonly detail?: string;
			readonly priority?: string;
			/** In every prompt (`resident`), or picked for this message (`relevant`). Absent on old turns. */
			readonly source?: 'resident' | 'relevant';
		}

		/**
		 * The memories put in the prompt for one of the user's messages, as the chat's memory row
		 * counts them ("Injected 5 memories (3 resident · 2 relevant)"). `recalledMemories` lists
		 * those it can show; it may list fewer. Absent on messages from before Breezell recorded it.
		 */
		export interface MemoryUse {
			readonly resident: number;
			readonly relevant: number;
			/** False when finding memories failed partway and the turn went on with what it had. */
			readonly complete: boolean;
			/** The related memories were left out because they are in this conversation already. */
			readonly inThisConversation: boolean;
		}

		export type ToolCallStatus = 'invalid' | 'awaitingApproval' | 'running' | 'done' | 'failed' | 'rejected';

		/**
		 * What the chat shows, in order. `index` is the message's position in the conversation.
		 * A tool's parameters and result are cut at 20,000 characters (`resultLength` is the full length).
		 */
		export type ConversationMessage =
			| { readonly kind: 'user'; readonly index: number; readonly text: string; readonly time?: number; readonly attachments: readonly string[]; readonly recalledMemories: readonly RecalledMemory[]; readonly memoryUse?: MemoryUse }
			| { readonly kind: 'assistant'; readonly index: number; readonly text: string; readonly reasoning: string }
			/** `mcpServer`: the MCP server of an MCP tool; `plugin`: set for a Breezell plugin's agent tool (server `plugin:<id>`), with the plugin's name. */
			| { readonly kind: 'tool'; readonly index: number; readonly id: string; readonly name: string; readonly status: ToolCallStatus; readonly params: { readonly [key: string]: unknown }; readonly result: string; readonly resultLength: number; readonly mcpServer?: string; readonly plugin?: { readonly id: string; readonly name: string } }
			| { readonly kind: 'error'; readonly index: number; readonly text: string };

		/** The reply being written now. */
		export interface ConversationStream {
			readonly text: string;
			readonly reasoning: string;
			/** The tool the model is calling or Breezell is running. */
			readonly tool?: string;
		}

		export interface Conversation extends ConversationSummary {
			readonly messages: readonly ConversationMessage[];
			readonly streaming?: ConversationStream;
		}

		export interface ConversationChange {
			readonly conversationId: string;
			readonly activity: ConversationActivity;
			readonly streaming?: ConversationStream;
		}

		export interface ModelMessage {
			readonly role: 'user' | 'assistant';
			readonly content: string;
		}

		export interface ModelRequest {
			readonly messages: readonly ModelMessage[];
			readonly system?: string;
			/** Called with the whole text so far while the reply streams. */
			readonly onText?: (textSoFar: string) => void;
			/**
			 * Called with the model's whole reasoning so far while it thinks, before and between
			 * text (models that reason, and relays that pass it on). Lets a plugin show that the
			 * model is working while no text has come yet.
			 */
			readonly onReasoning?: (reasoningSoFar: string) => void;
		}

		export interface ModelResponse {
			readonly text: string;
			/** `provider/model` that answered. */
			readonly model: string;
		}

		/**
		 * The user's chat model. Needs the `models.request` permission, and the user allows
		 * it once per plugin. A request is the same as one from the chat: a Breezell model is
		 * billed to the user's account, a custom provider needs a plan that includes Custom
		 * API. Errors carry a `name`: `BreezellNotSignedIn`, `BreezellPermissionDenied`,
		 * `BreezellRateLimited`, `BreezellNoModel`, `BreezellInvalidRequest`, `BreezellModelError`,
		 * `BreezellCancelled`, `BreezellBlocked` (the plugin is on the market's blocklist). While a
		 * reply is silent Breezell checks that the API still answers: the request fails with
		 * `BreezellModelError` when it does not, and after five minutes in all.
		 */
		/** A model of Breezell's model picker. */
		export interface ModelChoice {
			readonly provider: string;
			readonly model: string;
			/** As the picker shows it. */
			readonly name: string;
			/** It is the chat model now. */
			readonly current: boolean;
		}

		export namespace models {
			/** The models of Breezell's model picker (`models.select`, normal: on unless the user turns it off). */
			export function list(): Thenable<ModelChoice[]>;
			/** Switches Breezell's chat model to one of the picker's models (`models.select`). */
			export function select(choice: { readonly provider: string; readonly model: string }): Thenable<void>;
			export function request(request: ModelRequest, token?: CancellationToken): Thenable<ModelResponse>;
		}

		/**
		 * A plugin window: a separate window showing the plugin's own page, declared in package.json
		 * `contributes.breezell.windows` ({ "id", "title", "entry", "width", "height", ... }). The page
		 * loads `/__breezell/api.js` to get `window.breezell.postMessage(...)` and `onMessage(...)`.
		 */
		export interface PluginWindow {
			readonly windowId: string;
			/** Sends JSON to the page (its `breezell.onMessage` listeners). */
			postMessage(message: unknown): Thenable<boolean>;
			/** What the page sends with `breezell.postMessage`. */
			readonly onDidReceiveMessage: Event<unknown>;
			readonly onDidClose: Event<void>;
			close(): Thenable<void>;
		}

		/**
		 * Windows the plugin declares. Opening one needs a signed-in account, and the plugin must
		 * run on the user's computer ("extensionKind": ["ui", ...]). Opening an open window brings
		 * it to the front and returns it again.
		 */
		export interface CustomApiAccount {
			readonly name: string;
			readonly enabled: boolean;
			readonly baseUrl: string;
			readonly apiKey: string;
			readonly protocol: string;
			readonly apiPath: string;
			readonly requestUrl: string;
			readonly headers: { readonly [name: string]: string };
			readonly model?: string;
		}

		/** One custom API (an OpenAI-compatible slot of Box › Models), as its settings page shows it. */
		export interface CustomApi {
			/** The slot: `openAICompatible`, `openAICompatible2`, ... */
			readonly id: string;
			readonly name: string;
			readonly baseUrl: string;
			readonly apiKey: string;
			/** `openai` (Chat Completions), `openai-responses` or `anthropic`. */
			readonly protocol: string;
			readonly apiPath: string;
			/** The address requests go to. */
			readonly requestUrl: string;
			readonly headers: { readonly [name: string]: string };
			/** `direct`, `system`, `global` or `custom` (proxy); absent: Breezell's default. */
			readonly network?: string;
			readonly models: readonly {
				readonly id: string;
				readonly enabled: boolean;
				readonly current: boolean;
				/** Per million tokens. */
				readonly price?: { readonly input: number; readonly output: number; readonly cacheRead?: number };
			}[];
			readonly accountPool?: { readonly enabled: boolean; readonly strategy: string; readonly accounts: readonly CustomApiAccount[] };
		}

		/**
		 * The user's custom APIs with their keys (`providers.read`, dangerous: asked the first time).
		 * Only for an account whose Breezell plan includes Custom API; otherwise the call fails with
		 * `BreezellPlanRequired` and nobody is asked. Requests a plugin sends with these keys go to
		 * the provider directly and are billed to the user by it.
		 */
		export namespace providers {
			export function listCustom(): Thenable<CustomApi[]>;
		}

		export namespace windows {
			export function open(windowId: string): Thenable<PluginWindow>;
		}

		/**
		 * What a tool answers the agent: text, or `{ text, isError }` to report a failure the agent
		 * should see as one. Longer than 400,000 characters is cut.
		 */
		export type ToolResult = string | { readonly text: string; readonly isError?: boolean };

		/** The code of an agent tool. A thrown error reaches the agent as a failed call. */
		export interface Tool {
			/**
			 * Runs one call. `input` is what the agent passed, checked against the tool's
			 * `inputSchema` (required properties present; undeclared ones removed unless the schema
			 * allows additionalProperties). `token` is
			 * cancelled when the user stops the agent or the call takes over 5 minutes.
			 */
			invoke(input: { readonly [name: string]: unknown }, token: CancellationToken): ToolResult | Thenable<ToolResult>;
		}

		/**
		 * Tools for Breezell's agent (`agent.tools`, "Agent tool registration", dangerous: asked the
		 * first time). Each tool is declared in package.json `contributes.breezell.tools`:
		 * `{ "name": "lowercase_name", "description": "what it does, for the agent",
		 * "inputSchema": { "type": "object", "properties": { ... }, "required": [ ... ] },
		 * "modes": ["chat", "agent", "entanglement"], "displayName": "shown to the user" }` (up to 16),
		 * and its code is registered here, usually when the plugin activates
		 * (`"activationEvents": ["onStartupFinished"]`).
		 *
		 * `modes` picks the chat modes the tool is offered in, one or several: `chat`, `agent`,
		 * `entanglement`, `analyze`, `teams` (default `["agent"]`). The agent reaches the tools as
		 * those of the server `plugin:<publisher.name>`; in another mode it neither sees nor can call
		 * them. The user's "MCP tools" auto-approve setting applies to their calls, and conversations
		 * read with `chat.read` show each call with its plugin (`plugin` on the tool message).
		 *
		 * They are offered only while the user allows `agent.tools`; a refusal keeps the code
		 * registered but unused, and turning the permission on later brings the tools back. The same
		 * permission lets the MCP servers the plugin declares (`contributes.breezell.mcpServers`) start.
		 */
		export namespace tools {
			/** Registers the code of a declared tool; disposing it takes the tool away from the agent. */
			export function register(name: string, tool: Tool): Disposable;
		}
	}
}
