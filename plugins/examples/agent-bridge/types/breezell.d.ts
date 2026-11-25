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
		 * `zh-TW`, `ja`, `ko`, `ru`, `es` or `pt-BR`. Empty for a moment at start, until it is known,
		 * and undefined on an older Breezell.
		 */
		export const language: string;

		/** Breezell's display language changed, or became known. */
		export const onDidChangeLanguage: Event<string>;

		/** What to restart: the plugins only, this window, or all of Breezell. */
		export type RestartScope = 'extensionHost' | 'window' | 'app';

		export interface RestartRequest {
			readonly scope: RestartScope;
			/** Why, at most 300 characters. The user is told. */
			readonly reason: string;
			/** The reason in other languages, by locale: `zh-CN`, `zh-TW`, `ja`, `ko`, `ru`, `es`, `pt-BR`. */
			readonly l10n?: { readonly [locale: string]: string };
			/**
			 * Restart without asking. Needs the `app.forceRestart` permission, which the user is asked
			 * for the first time. It happens once per version of the plugin (after that it asks), after
			 * a reply being written ends, with a few seconds' notice.
			 */
			readonly force?: boolean;
		}

		export namespace app {
			/**
			 * Asks the user to restart (`app.restart`), or tells them it is happening (`force`). True when
			 * the restart will happen. After "Later", further requests within 30 minutes return false
			 * without asking. For after this plugin is installed, updated or removed, when its code
			 * cannot run, declare `contributes.breezell.restart` in package.json instead.
			 */
			export function requestRestart(request: RestartRequest): Thenable<boolean>;

			/** Whether the user is in Breezell. Needs no permission. */
			export interface Focus {
				/** An editor window of Breezell has the keyboard focus (false while the user is in another app, or all are minimized). */
				readonly editorFocused: boolean;
				/** This plugin's editor window is the one that has it, or had it last. */
				readonly lastUsed: boolean;
				/** This editor window's id: what windows.focusEditor takes, and what other windows' broadcasts say they come from. */
				readonly windowId: number;
			}
			export function focus(): Thenable<Focus>;
			/** The user went to another app or came back (a quick switch between Breezell's own windows is not a change). */
			export const onDidChangeFocus: Event<Focus>;
		}

		/**
		 * The permissions this plugin declared in `breezell.permissions`, as an Android app declares
		 * its permissions: nothing undeclared is ever usable. A `normal` permission is
		 * on unless the user turns it off (`chat.events`, `models.select`, `providers.list`, `app.restart`,
		 * `ui.contribute`, `activity.read`). A `dangerous` one (`models.request`, `chat.read`, `chat.send`, `chat.approve`,
		 * `providers.read`, `agent.tools`, `agent.hooks`, `editor.read`, `chat.input`, `chat.intercept`,
		 * `chat.render`, `ui.modify`, `ui.overlay`, `app.forceRestart`) is asked for the first time the plugin uses it; while the user
		 * has not allowed it, its calls fail with `BreezellPermissionDenied`. The user can switch each
		 * permission on and off, or all at once, on the plugin's page in Plugins › Installed.
		 */
		export const permissions: readonly string[];

		/** Where a permission stands: usable, refused, or to be asked for at its first use. */
		export type PermissionState = 'granted' | 'denied' | 'ask';

		/** Where a permission this plugin declared stands. Asks no one. */
		export function permissionState(permission: string): Thenable<PermissionState>;

		/**
		 * Whether the user allows a permission this plugin declared, asking them when it is the first
		 * time; false when they refuse. For permissions a call does not ask for by itself (`editor.read`),
		 * or to ask at a moment of your own choosing.
		 */
		export function requestPermission(permission: string): Thenable<boolean>;

		/** The user changed a permission of this plugin (after permissionState or requestPermission was called once). */
		export const onDidChangePermissions: Event<void>;

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
		 * - `chat.send` (dangerous): send messages, and start conversations, in a mode and with a model
		 *   and files of their own; stop a reply. The AI answers them like the user's own, and they are
		 *   billed the same way. At most 10 a minute.
		 * - `chat.approve` (dangerous): approve or reject the tool call a conversation waits for.
		 */
		/** A message about to be sent, as a plugin with `chat.intercept` sees it. */
		export interface SendInput {
			readonly conversationId: string;
			readonly text: string;
			/** The names of what goes with it (files, folders, images), as `ConversationMessage` names them. Empty on an older Breezell. */
			readonly attachments: readonly string[];
			/**
			 * The plugin's own slash command the message was sent with: a row of `ui.slashCommands` that
			 * has no `command`. The user picked it in the chat box, or typed its name at the start of the
			 * message, and it shows there as a tag. `text` then begins with `/name`, as it always has.
			 *
			 * `null` when the message carries no command of this plugin, whatever its words: text that
			 * merely reads `/name` (pasted, or left as words) is not the command.
			 *
			 * Absent on an older Breezell, which has no such tags: there, text that begins with `/name`
			 * is all there is to go by.
			 */
			readonly slashCommand?: { readonly name: string } | null;
		}

		/**
		 * `text`: send this instead. `cancel`: do not send it; `reason` is shown to the user and the text
		 * stays in the box. `cancel` with `handled`: it was a command of the plugin's own, dealt with
		 * here: the box clears, and telling the user what happened is up to the plugin.
		 *
		 * `context`: text the AI reads with this message (at most 20,000 characters; 50,000 from all
		 * plugins together). The user does not see it in the chat, `chat.read` does not show it, and the
		 * AI is told it came from this plugin. It stays in the conversation's history like the message.
		 */
		export type SendAnswer = { readonly text?: string; readonly cancel?: boolean; readonly reason?: string; readonly handled?: boolean; readonly context?: string } | undefined | void;

		/** What `chat.send` may ask for besides the text. */
		export interface SendOptions {
			/** Without it, in a new conversation. */
			readonly conversationId?: string;
			readonly automated?: boolean;
			/**
			 * The mode of the turn: `normal` (Chat), `agent` or `plan`. As the user would pick it: in the
			 * conversation open in the chat the mode picker switches; another conversation keeps it as
			 * its own. Entanglement, Agent Teams and Dark Selene stay the user's choice.
			 */
			readonly mode?: 'normal' | 'agent' | 'plan';
			/** One of `models.list`'s models, for this conversation from now on, as its model picker sets it. */
			readonly model?: { readonly provider: string; readonly model: string };
			/**
			 * Up to 10 files or folders of the workspace, by absolute path or relative to its first folder.
			 * Images (png, jpg, gif, webp, at most 10 MB) go as images. Links, anything outside the
			 * workspace folders and what Breezell keeps from plugins (sign-ins, stored conversations, the
			 * Super Memory) are refused.
			 */
			readonly attachments?: readonly string[];
		}
		export type SendHandler = (input: SendInput) => SendAnswer | Thenable<SendAnswer>;

		/** One open page of a surface the plugin declared in `contributes.breezell.ui.surfaces`. */
		export interface PluginSurface {
			readonly surfaceId: string;
			/** Where it was opened. A code fence drawn with `chat.render` brings its `language` and `code`. */
			readonly context: { readonly [key: string]: unknown };
			postMessage(message: unknown): Thenable<boolean>;
			readonly onDidReceiveMessage: Event<unknown>;
			readonly onDidClose: Event<void>;
			/** Where the page is on the screen now (to start an overlay from it); undefined once it closed. */
			screenRect(): Thenable<ScreenRect | undefined>;
		}

		/** A rectangle on the screen, in pixels at 100% scale (Electron's DIPs). */
		export interface ScreenRect {
			readonly x: number;
			readonly y: number;
			readonly width: number;
			readonly height: number;
		}

		export namespace ui {
			/** One of this plugin's surfaces opened, or was already open when the plugin started listening. */
			export const onDidOpenSurface: Event<PluginSurface>;
			/**
			 * `ui.contribute`: how one of the plugin's tiles in `contributes.breezell.ui.signIns` stands now,
			 * shown on Box › Models › Sign in while its switch is on. `undefined` forgets what was said.
			 * Text is shown as one plain line each. What was said goes when the extension host stops.
			 * Breezell newer than 1.4.64.
			 */
			export function setSignInStatus(tileId: string, status: SignInStatus | undefined): Thenable<void>;
		}

		/**
		 * `chat.agent`: answer the conversations whose model is one of the plugin's own. The tile in
		 * `contributes.breezell.ui.signIns` declares `"agent": true`; the models listed with `setModels`
		 * go in the chat model picker under it. A turn of such a conversation is not sent to a model by
		 * Breezell: `runTurn` gets the user's message and writes the reply through `reply`. Breezell newer
		 * than 1.4.64.
		 */
		export namespace agents {
			/** The plugin answers its tile's conversations. The user is asked for chat.agent the first time. */
			export function register(tileId: string, agent: Agent): Disposable;
			/** The models it answers with now: they replace the ones listed before. */
			export function setModels(tileId: string, models: readonly AgentModel[]): Thenable<void>;
			/**
			 * One of the agent's own conversations (one session) into Breezell: into the window that has
			 * its folder open, as a conversation on the agent's model that goes on in that session. The same
			 * session again adds only the messages after the last record the conversation shows: the newest
			 * imported, or the `entry` a turn there returned. A conversation the user deleted stays deleted.
			 */
			export function importConversation(tileId: string, conversation: AgentConversation): Thenable<AgentImportStatus>;
			/**
			 * Conversations of the plugin's agents that the user deleted in Breezell, with their sessions: the
			 * plugin may remove its own copies, as its own settings say (only Breezell's copy is gone otherwise).
			 */
			export const onDidDeleteConversations: Event<AgentDeletedConversations>;
		}

		export interface AgentDeletedConversations {
			readonly tileId: string;
			/** `folder`: the folder (a URI as text) the conversation belonged to, when known. */
			readonly conversations: readonly { readonly session: string; readonly folder?: string }[];
		}

		/**
		 * `created`: a new conversation; `updated`: it got the session's newer messages; `unchanged`: nothing new
		 * (or no record to go on from); `deleted`: the user deleted it; `busy`: it runs a turn now, try later;
		 * `elsewhere`: this window does not have its folder open.
		 */
		export type AgentImportStatus = 'created' | 'updated' | 'unchanged' | 'deleted' | 'busy' | 'elsewhere';

		export interface AgentConversation {
			readonly session: string;
			/** The folder it was in, a URI as text, as Breezell names the window's folders. */
			readonly folder: string;
			readonly title?: string;
			/** One of the listed model ids; the first listed otherwise. */
			readonly model?: string;
			/** Oldest first, at most the newest 2000. `entry` is the id of the agent's record each comes from. */
			readonly messages: readonly AgentConversationMessage[];
		}

		export type AgentConversationMessage =
			| { readonly entry: string; readonly role: 'user'; readonly text: string; readonly at?: number }
			| { readonly entry: string; readonly role: 'assistant'; readonly text: string; readonly reasoning?: string; readonly at?: number }
			| { readonly entry: string; readonly role: 'tool'; readonly id: string; readonly name: string; readonly title?: string; readonly input?: Record<string, unknown>; readonly status: 'done' | 'error'; readonly output?: string; readonly view?: AgentToolView; readonly at?: number;
				/** A subagent call's subagent (`view.kind` 'subagent'), as the agent kept it: its task first, then its messages (Breezell gives it its own page). */
				readonly subagent?: { readonly messages: readonly AgentConversationMessage[] } };

		export interface AgentModel {
			/** Letters, digits and `._:@+-[]`, at most 120 characters. */
			readonly id: string;
			/** At most 60 characters. */
			readonly title: string;
			readonly description?: string;
			/** Whose model it is, when it is one Breezell knows ('claude', and in a Breezell newer than 1.4.68 'gemini' and 'openai'): the picker shows Breezell's own icon of its maker. */
			readonly family?: 'claude' | 'gemini' | 'openai';
			/** The effort levels it takes: the model menu offers them, and a turn says the one picked (`AgentTurn.effort`). */
			readonly efforts?: readonly ('low' | 'medium' | 'high' | 'xhigh' | 'max')[];
			/** Its agent compresses its context when asked (AgentTurn.compact): Manual compress asks it, not Breezell's own summary (Breezell newer than 1.4.65). */
			readonly compacts?: boolean;
		}

		export interface AgentAttachment {
			readonly name: string;
			/** `document`: a PDF. */
			readonly kind: 'file' | 'folder' | 'image' | 'document' | 'other';
			/** Where it is on this computer, for a file or a folder (a code selection's file too). */
			readonly path?: string;
			/** A code selection's lines, first and last. */
			readonly lines?: readonly [number, number];
			/**
			 * What Breezell's own model is given of it, when a path is not enough: a code selection's lines, problems, console or
			 * terminal output, a quoted message, a skill and the like. Give it to the agent with the message.
			 */
			readonly text?: string;
			/** A picture's or a PDF's bytes (base64, no `data:` prefix), pasted ones included: give them to the agent as an image or a document. */
			readonly data?: { readonly mimeType: string; readonly base64: string };
		}

		/** A turn of a conversation whose model is one of the plugin's. */
		export interface AgentTurn {
			readonly conversationId: string;
			/** The id of the model picked, one of those listed. */
			readonly model: string;
			/** What the user wrote. */
			readonly text: string;
			readonly attachments: readonly AgentAttachment[];
			/** The conversation's folders (URIs as text), the one it works in first. */
			readonly folders: readonly string[];
			/** What the plugin said of its session (`reply.session` or `session` in its result) in this conversation's last turn. */
			readonly session?: string;
			/** The effort level the user picked for this model, one of its `efforts`; none when the user picked none. */
			readonly effort?: 'low' | 'medium' | 'high' | 'xhigh' | 'max';
			/**
			 * The conversation's messages the agent has not seen, oldest first: those another model answered
			 * since its last turn, or all of them when there is no `session` to go on with (none yet, or the
			 * conversation was rewound or edited since). Tool calls are notes such as `[Breezell used read_file: a.ts (done)]`.
			 */
			readonly history?: readonly AgentHistoryEntry[];
			/**
			 * What Breezell remembers that bears on this message (its memories, as Breezell's own model gets them),
			 * for the agent's prompt. Absent when none were found, and when the turn goes on (`continuing`).
			 */
			readonly memories?: string;
			/**
			 * The turn goes on in `session` after the agent's model request failed (`after`: that error), as Breezell
			 * sends its own requests again (its waits and count, its countdown): continue from where it stopped.
			 * `text` is the message it was answering, which the session has already; there are no attachments.
			 */
			readonly continuing?: { readonly after: string };
			/**
			 * Breezell's notices for the agent with this message: how commands it ran in Breezell's terminal
			 * (`run_terminal_cmd`) ended in the background. A turn Breezell starts for them alone has an empty `text`.
			 */
			readonly notices?: readonly string[];
			/**
			 * The user's rules in Breezell for this conversation's project (its own rules file, else the global ones, and the
			 * plugins' rules for this model). Without `session`: give them to the new session once, where it keeps its
			 * standing instructions. With `session`: they changed since the session got them (`''`: removed); tell it once.
			 * Absent when there is nothing new to tell. Breezell newer than 1.4.65.
			 */
			readonly rules?: string;
			/**
			 * The chat mode the user picked (Breezell newer than 1.4.65). `agent` (or absent): the agent may change files and
			 * run commands. `plan`: it reads and plans and changes nothing; give its plan to `callBreezellTool('update_plan',
			 * { title, markdown, plan: [{ step }] })` and it shows as Breezell's plan card, whose Execute starts an `agent` turn
			 * that asks for it to be carried out. `analyze`: it reads and answers. `chat`: it answers. Breezell's tools for
			 * changes and commands are listed and run in `agent` only: turn the agent's own off in the other modes.
			 */
			readonly mode?: 'agent' | 'plan' | 'analyze' | 'chat';
			/**
			 * The user chose Manual compress (Breezell newer than 1.4.65): compress the agent's context in `session` now, as
			 * it compresses its own. `text` is empty; say how it went with `reply.compaction`.
			 */
			readonly compact?: true;
			/**
			 * The user's auto-approve settings for the agent's own calls, which Breezell never sees before they run
			 * (Breezell newer than 1.4.68). `mcp`: "MCP tools", for the MCP servers the agent has of its own. An agent that
			 * cannot ask the user lets those run only when this says so; absent (an older Breezell): it does not.
			 */
			readonly autoApprove?: { readonly mcp: boolean };
		}

		export interface AgentHistoryEntry {
			readonly role: 'user' | 'assistant';
			readonly text: string;
		}

		/** A tool call of the agent's own: tell it `running`, then `done` or `error`, under the same id. */
		export interface AgentToolEvent {
			readonly id: string;
			readonly name: string;
			/** One line saying what it does, such as the file or the command. */
			readonly title?: string;
			readonly input?: Record<string, unknown>;
			/** `running` again tells how it goes (a subagent's step). */
			readonly status: 'running' | 'done' | 'error';
			readonly output?: string;
			/** What it is, so Breezell draws it as its own tool of that kind; without one it shows under its own name. */
			readonly view?: AgentToolView;
			/** The id of the subagent call (`view.kind: 'subagent'`) this one is part of. */
			readonly parent?: string;
		}

		/**
		 * A tool call as Breezell draws its own: a file read, an edit (what it replaced, for its diff), a new
		 * file, a command and what it printed, a text search, the files a pattern found, a folder listed, a page
		 * fetched, a web search, the agent's to-do list, a subagent (its task, the step it is on, and its report
		 * when done). A file is drawn as Breezell's own only with its `uri` (as Breezell opens it: a `file:` or
		 * `vscode-remote:` URI); `path` is the agent's name of it. The agent's own file changes are its own: Breezell
		 * shows them, and never reviews, keeps or undoes them as it does its own edits; changes made with Breezell's
		 * edit tools (`callBreezellTool('edit_file')`) are reviewed, kept and undone as Breezell's own.
		 */
		export type AgentToolView =
			| { readonly kind: 'read'; readonly path: string; readonly uri?: string; readonly startLine?: number; readonly endLine?: number; readonly totalLines?: number }
			| { readonly kind: 'edit'; readonly path: string; readonly uri?: string; readonly edits?: readonly AgentToolEdit[] }
			| { readonly kind: 'create'; readonly path: string; readonly uri?: string; readonly content?: string }
			| { readonly kind: 'command'; readonly command: string; readonly description?: string; readonly background?: boolean; readonly output?: string }
			| { readonly kind: 'search'; readonly query: string; readonly path?: string }
			| { readonly kind: 'files'; readonly pattern: string; readonly files?: readonly string[] }
			| { readonly kind: 'list'; readonly path: string; readonly uri?: string }
			| { readonly kind: 'fetch'; readonly url: string }
			| { readonly kind: 'webSearch'; readonly query: string }
			| { readonly kind: 'todos'; readonly items: readonly { readonly text: string; readonly status: 'pending' | 'in_progress' | 'completed' }[] }
			| { readonly kind: 'subagent'; readonly description: string; readonly prompt?: string; readonly agentType?: string; readonly step?: string; readonly report?: string; readonly background?: boolean; readonly stopped?: boolean; /** The model it runs on: one of the agent's models (AgentModel.id). */ readonly model?: string }
			/** A lookup in Breezell's memories (`callBreezellTool('memories_recall', …)`): `resultType` and `count` as its result said them. */
			| { readonly kind: 'memories'; readonly query?: string; readonly ids?: readonly string[]; readonly resultType?: 'search' | 'list' | 'open' | 'l0_index'; readonly count?: number }
			/** A tool of one of the user's MCP servers in Breezell (AgentBreezellTool.mcpServer, mcpTool): drawn as Breezell's MCP row of that server (Breezell newer than 1.4.65). */
			| { readonly kind: 'mcp'; readonly server: string; readonly tool: string };

		/** One of Breezell's tools an agent may call through its plugin: its name and its parameters (a JSON schema). */
		export interface AgentBreezellTool {
			readonly name: string;
			readonly inputSchema: { readonly type: 'object'; readonly properties: { readonly [key: string]: unknown }; readonly required: readonly string[] };
			/** `run_terminal_cmd`: the system and shell Breezell's terminal runs its commands in ("windows | PowerShell"); tell the agent. */
			readonly shell?: string;
			/**
			 * A tool of one of the user's MCP servers in Breezell (Breezell newer than 1.4.65): its server, its own name and
			 * what the server says it does. Offer it to the agent under a name of your own; call it with this `name`, and
			 * Breezell runs it with its own connection to the server. Its tool events take `view: { kind: 'mcp', server, tool }`.
			 */
			readonly mcpServer?: string;
			readonly mcpTool?: string;
			readonly description?: string;
		}

		/** What a call of one of Breezell's tools returned: the text for the agent's model; for its row the kind and count. */
		export interface AgentBreezellToolResult {
			readonly text: string;
			readonly isError?: boolean;
			readonly resultType?: string;
			readonly count?: number;
			/** `ask_question`: what the user picked for each question (the options' labels, or their own words); empty: skipped (Breezell newer than 1.4.65). */
			readonly answers?: readonly { readonly question_id: string; readonly selected: readonly string[] }[];
		}

		/** One replacement in a file, as Breezell's edit card draws it. */
		export interface AgentToolEdit {
			readonly oldString: string;
			readonly newString: string;
			readonly replaceAll?: boolean;
		}

		/** Asking before one of the agent's tool calls runs (the call told as `running` first, under `toolId`). */
		export interface AgentApprovalRequest {
			readonly toolId: string;
			readonly name: string;
			readonly title?: string;
			readonly input?: Record<string, unknown>;
			/** Which of the user's auto-approve settings decides it: file changes, commands, or the rest. */
			readonly kind: 'edit' | 'command' | 'other';
			readonly reason?: string;
			/** What the call is, as for AgentToolEvent.view: the card shows it as Breezell's own (a diff, a command). */
			readonly view?: AgentToolView;
		}

		/** The agent compressing its context (AgentReply.compaction). */
		export interface AgentCompaction {
			readonly phase: 'started' | 'done' | 'failed';
			/** `manual`: asked with AgentTurn.compact; `auto`: the agent's own, its context full. */
			readonly trigger: 'manual' | 'auto';
			readonly preTokens?: number;
			readonly postTokens?: number;
		}

		/** What an agent's model requests used (AgentReply.usage). */
		export interface AgentUsage {
			readonly context?: { readonly tokens: number; readonly window?: number };
			readonly models: readonly { readonly model: string; readonly inputTokens: number; readonly outputTokens: number; readonly cacheReadTokens: number; readonly cacheWriteTokens: number }[];
		}

		export interface AgentReply {
			/** More of the reply; `parent`: the subagent call whose words they are. */
			text(text: string, parent?: string): void;
			/** More of its reasoning; `parent` as for text. */
			reasoning(text: string, parent?: string): void;
			/**
			 * How far a thought whose text the model keeps hidden has gone (its estimated tokens, the total so far):
			 * Breezell shows it thinks, for how long, and how much. Not for a thought whose text you give with reasoning,
			 * except one begun with thinkingStarted, whose size may come before its text.
			 */
			thinking(tokens: number): void;
			/**
			 * Its model began a request whose thought the agent tells only after (Breezell newer than 1.4.68): Breezell
			 * shows it thinking from now until its words or a call come. That thought stays, with its time, when its text
			 * (reasoning) or its size (thinking) comes before the next call or the turn's end; otherwise there was none.
			 */
			thinkingStarted?(): void;
			tool(tool: AgentToolEvent): void;
			/** The agent's own session: the next turn of the conversation gets it as `AgentTurn.session`. */
			session(id: string): void;
			/**
			 * The agent's model request failed and it sends it again by itself in `delayMs` (attempt `attempt` of
			 * `maxAttempts`; `error`: its kind of failure): Breezell shows its reconnecting countdown until the agent
			 * goes on (its next event).
			 */
			retrying?(retry: { readonly attempt: number; readonly maxAttempts: number; readonly delayMs: number; readonly error?: string }): void;
			/**
			 * What the agent's model requests used (Breezell newer than 1.4.65), once or more a turn: `context`, how much of
			 * its model's context its conversation now takes (its last request's input, cached parts too) and that model's
			 * window, for the chat's context ring; `models`, the tokens used since it last said this, per model, for Box ›
			 * Usage and the reply's token count.
			 */
			usage?(usage: AgentUsage): void;
			/**
			 * The agent compresses its context (Breezell newer than 1.4.65): when the turn has `compact` (the user chose
			 * Manual compress), or by itself when its context fills up. Say `started`, then `done` with its size before and
			 * after, or `failed`: Breezell shows that it compresses and the context ring its new size.
			 */
			compaction?(compaction: AgentCompaction): void;
			/**
			 * Breezell's own tools the agent may call in this turn (now: `memories_recall`, the user's memories as Breezell's own model looks them up;
			 * `run_terminal_cmd`, a command in Breezell's terminal; `await`, waiting on one in the background; `edit_file` and `write_to_file`,
			 * changes through Breezell's editor that the user reviews as Breezell's own; and, in every mode, its language tools, read-only, on its
			 * language servers: `read_lint_errors`, `find_symbol`, `breezell_lsp_find_definition`, `breezell_lsp_find_references`,
			 * `breezell_lsp_call_hierarchy`, `breezell_lsp_hover`). Offer them to the agent, and run its calls with callBreezellTool.
			 */
			breezellTools?(): Thenable<readonly AgentBreezellTool[]>;
			/**
			 * Runs one of them for this conversation; a failure is its result (`isError`), not a thrown error. `toolUseId`:
			 * the agent's own id of the call (its tool event's `id`), so its row shows what Breezell ran (a command's terminal, a change's review step).
			 */
			callBreezellTool?(name: string, input: Record<string, unknown>, toolUseId?: string): Thenable<AgentBreezellToolResult>;
			/** Shows Breezell's approval card unless the user's auto-approve settings allow it; false when refused or the turn stopped. */
			approve(request: AgentApprovalRequest): Thenable<boolean>;
		}

		/**
		 * How a turn ended. `apiError`: the error came from the agent's model request, of this kind (rate_limit,
		 * overloaded, server_error, unknown for a dropped connection, stalled, or a kind a new attempt cannot get
		 * past, such as billing_error): Breezell then sends the turn on in its `session` (AgentTurn.continuing)
		 * when its own rules would send such a request of its own again.
		 */
		export interface AgentTurnResult {
			readonly session?: string;
			readonly error?: string;
			readonly entry?: string;
			readonly apiError?: string;
		}

		export interface Agent {
			/**
			 * Answers a turn; `token` is cancelled when the user stops it. Throwing, or `error`, shows the error
			 * in the conversation after what was written; `session` is kept either way. `entry`: the id of the
			 * last record of the agent's own this turn made, so that importing the session later
			 * (importConversation) adds only what came after it.
			 */
			runTurn(turn: AgentTurn, reply: AgentReply, token: CancellationToken): Thenable<AgentTurnResult | void>;
			/**
			 * Stops one subagent of the turn running in `conversationId` (`toolId`: its call, the AgentToolEvent with
			 * `view.kind` 'subagent'); the turn goes on. False, or none: it cannot, and the user is told to stop the turn.
			 */
			stopSubagent?(conversationId: string, toolId: string): boolean | Thenable<boolean>;
		}

		/** What a sign-in tile's page shows of the plugin's connection (`ui.setSignInStatus`). */
		export interface SignInStatus {
			readonly connected: boolean;
			/** Still finding out: the page says so rather than connected or not. */
			readonly busy?: boolean;
			/** One line under the state, such as why it is not connected. At most 300 characters. */
			readonly detail?: string;
			/** The account, while connected: at most 8 rows of a label (40 characters) and a value (160). */
			readonly account?: readonly { readonly label: string; readonly value: string }[];
			/**
			 * How much of a limit is used, while connected: at most 6 bars of a label (40 characters), a
			 * percent from 0 to 100, and a line under it (120 characters), such as when it resets.
			 */
			readonly usage?: readonly { readonly label: string; readonly percent: number; readonly detail?: string }[];
		}

		/** What the command of a button in `contributes.breezell.ui.buttons` receives: where it was pressed. */
		export interface ButtonContext {
			readonly slot: 'chat.input.toolbar' | 'chat.message.actions' | 'code.block.actions' | 'chat.input.slash';
			readonly conversationId?: string;
			/** `chat.message.actions`: the index of the message the turn starts at. */
			readonly messageIndex?: number;
			/** `code.block.actions`: the block's language and text. */
			readonly language?: string;
			readonly code?: string;
		}

		/** The chat box, as `chat.readInput` gives it. */
		export interface ChatInput {
			/** What is in the box. */
			readonly text: string;
			/** Its part before the caret. */
			readonly before: string;
			/** The text of the last messages of the current conversation, oldest first. */
			readonly recent: string;
		}

		export namespace chat {
			export const onDidStartTurn: Event<TurnEvent>;
			export const onDidFinishTurn: Event<TurnFinishEvent>;
			/** The chat box (`chat.input`): the one with the focus, else the first there is. */
			export function readInput(): Thenable<ChatInput>;
			/**
			 * Each message before it is sent (`chat.intercept`): change it or stop it. An answer later than
			 * three seconds, or a failure, passes the message on as it was. One handler per plugin.
			 */
			export function registerSendHandler(handler: SendHandler): Disposable;

			/** The conversations, the most recently changed first (`chat.read`). */
			export function listConversations(): Thenable<ConversationSummary[]>;
			/** One conversation with its messages (`chat.read`). */
			export function getConversation(id: string): Thenable<Conversation>;
			/** A conversation changed: a message, a tool call's status, or the reply being written (`chat.read`). */
			export const onDidChangeConversation: Event<ConversationChange>;
			/** Opens the conversation in Breezell's chat (`chat.read`): a subagent's opens in its tab, beside its lead. */
			export function show(id: string): Thenable<void>;
			/**
			 * Sends a message as the user would (`chat.send`); without `conversationId`, in a new
			 * conversation. Resolves once the message is in the conversation; the reply follows
			 * through onDidChangeConversation. Fails while the conversation is busy.
			 *
			 * `automated`: the plugin sends this on its own, not on the user's behalf. It shows in the
			 * chat labelled with the plugin's name, the AI is told the user did not type it, and it does
			 * not count as the user's reaction or end up in memories. It fails with
			 * `BreezellStoppedByUser` after the user pressed Stop on the reply, until they write again,
			 * and with `BreezellInvalidRequest` while a message of the user's waits in the queue.
			 *
			 * To a subagent's conversation: it fails once the subagent is closed, and with a `mode` (a
			 * subagent keeps the mode it started in). `messageSubagent` reaches one that is working.
			 * Subagents need Breezell newer than 1.4.56.
			 */
			export function send(text: string, options?: SendOptions): Thenable<{ readonly conversationId: string }>;
			/**
			 * Stops the reply the conversation is writing (`chat.send`), as Stop does. It is not the
			 * user's Stop: `automated` messages may follow it. Nothing happens when it is not writing.
			 */
			export function stop(conversationId: string): Thenable<void>;
			/** A conversation's subagents, open and closed, oldest first (`chat.read`). Needs Breezell newer than 1.4.56: check that it exists before calling. */
			export function listSubagents(conversationId: string): Thenable<Subagent[]>;
			/**
			 * Starts a subagent for a conversation in Agent or Entanglement mode (`chat.send`): a
			 * conversation of its own, in that conversation's mode, which works on `task` and reports to
			 * the conversation's AI like the subagents it starts itself; the AI is told this plugin
			 * started it. At most 5 subagents of a conversation work at once. Fails with
			 * `BreezellStoppedByUser` after the user pressed Stop in the conversation, until they write
			 * again. When the user picks each subagent's model (Subagent Model off), give `model`.
			 * Needs Breezell newer than 1.4.56: check that it exists before calling.
			 */
			export function startSubagent(conversationId: string, start: SubagentStart): Thenable<{ readonly conversationId: string }>;
			/**
			 * A message to an open subagent (`chat.send`), shown and sent as this plugin's, neither the
			 * user's nor its lead's: read at its next step while it works, started on when it is idle.
			 * Needs Breezell newer than 1.4.56: check that it exists before calling.
			 */
			export function messageSubagent(subagentId: string, text: string): Thenable<{ readonly delivered: 'nextStep' | 'started' }>;
			/**
			 * Closes a subagent (`chat.send`): it stops, its conversation stays in the history, and its
			 * lead is told this plugin closed it. False when it was closed already.
			 * Needs Breezell newer than 1.4.56: check that it exists before calling.
			 */
			export function closeSubagent(subagentId: string): Thenable<boolean>;
			/**
			 * Work over many turns (`chat.send`): the turns of this conversation make no done sound or
			 * system notification until released. Errors still do. It ends by itself when the user
			 * presses Stop, signs out, or this plugin stops.
			 */
			export function holdDoneNotice(conversationId: string): Thenable<void>;
			/** Ends the hold. `announce`: the work is done, play the notice once (only if this plugin held it). */
			export function releaseDoneNotice(conversationId: string, options?: { readonly announce?: boolean }): Thenable<void>;
			/**
			 * The conversation a turn event was about (`chat.read`), as `listConversations` names it:
			 * the event's own `conversationId` is not that id. Undefined for a turn too long ago.
			 */
			export function conversationOfTurn(turnId: string): Thenable<string | undefined>;
			/** Approves the tool call the conversation waits for (`chat.approve`). */
			export function approve(conversationId: string): Thenable<void>;
			/** Rejects the tool call the conversation waits for (`chat.approve`). */
			export function reject(conversationId: string): Thenable<void>;
		}

		/** What a conversation is doing now: `working` also while it waits for its own subagents or teammates (Breezell newer than 1.4.54). */
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
			/** How many commands of this conversation run in the background; `willEnd` leaves out servers and watchers. Absent on an older Breezell. */
			readonly backgroundCommands?: BackgroundCommands;
			/** Set on a subagent's conversation. Absent on an older Breezell (newer than 1.4.56 has subagents). */
			readonly subagent?: Subagent;
		}

		/** A subagent: a conversation another one (its lead) started, that reports to it (Breezell newer than 1.4.56). */
		export interface Subagent {
			/** Its conversation, as `listConversations` names it. */
			readonly id: string;
			/** The conversation that started it and gets its reports. */
			readonly leadConversationId: string;
			readonly name: string;
			/** Its lead's mode when it started; it never changes. */
			readonly mode: 'agent' | 'entanglement';
			readonly status: 'working' | 'awaitingApproval' | 'idle' | 'interrupted' | 'closed';
			/** ISO time it started. */
			readonly createdAt: string;
			/** The plugin that started it; absent when its lead's AI did. */
			readonly startedBy?: { readonly id: string; readonly name: string };
			/** Once closed: by its lead's AI, the user, the withdrawal of the message it came after, or a plugin. */
			readonly closedBy?: 'agent' | 'user' | 'withdrawn' | 'plugin';
		}

		export interface SubagentStart {
			/** Short (60 characters at most), shown in the chat history; made unique among the conversation's open subagents. */
			readonly name?: string;
			/** The whole task, self-contained: the subagent sees nothing of the conversation. */
			readonly task: string;
			/** One of `models.list`'s models; else the conversation's own. */
			readonly model?: { readonly provider: string; readonly model: string };
		}

		export interface BackgroundCommands {
			readonly running: number;
			readonly willEnd: number;
		}

		/**
		 * Tokens as the provider reported them: for a budget of your own, not a bill. Some providers
		 * count cache reads inside `inputTokens`. A reply's are its own; checks that run beside a
		 * conversation are in neither, and nothing here says what tokens cost.
		 */
		export interface TokenUse {
			readonly inputTokens: number;
			readonly outputTokens: number;
			readonly cacheReadTokens: number;
			readonly cacheWriteTokens: number;
		}

		/**
		 * A conversation's replies added up, with what the helpers working for it spent (its subagents, its
		 * analysis subagents, a lead's teammates), growing while they work (Breezell newer than 1.4.54; its
		 * subagents are counted from Breezell newer than 1.4.56). `repliesWithoutUsage` were not counted: their
		 * provider reported nothing.
		 */
		export interface ConversationTokenUse extends TokenUse {
			readonly replies: number;
			readonly repliesWithoutUsage: number;
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
			| { readonly kind: 'user'; readonly index: number; readonly text: string; readonly time?: number; readonly attachments: readonly string[]; readonly recalledMemories: readonly RecalledMemory[]; readonly memoryUse?: MemoryUse; readonly automatedBy?: { readonly id: string; readonly name: string } }
			| { readonly kind: 'assistant'; readonly index: number; readonly text: string; readonly reasoning: string; readonly usage?: TokenUse }
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
			/** What this conversation's replies used. Absent on an older Breezell. */
			readonly usage?: ConversationTokenUse;
		}

		export interface ConversationChange {
			readonly conversationId: string;
			readonly activity: ConversationActivity;
			readonly streaming?: ConversationStream;
			readonly backgroundCommands?: BackgroundCommands;
			/** A subagent's conversation: what it is and does now (Breezell newer than 1.4.56). */
			readonly subagent?: Subagent;
		}

		/** An image for the model: base64 without the `data:` prefix, at most 8,000,000 characters. */
		export interface ModelImage {
			readonly mimeType: 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp';
			readonly data: string;
		}

		export interface ModelMessage {
			readonly role: 'user' | 'assistant';
			readonly content: string;
			/** On a user message: images it shows the model (8 per request at most). A model known not to read images refuses them. */
			readonly images?: readonly ModelImage[];
		}

		export interface ModelRequest {
			readonly messages: readonly ModelMessage[];
			readonly system?: string;
			/** One of `models.list`'s models instead of the chat model. It needs no `models.select`. */
			readonly model?: { readonly provider: string; readonly model: string };
			/**
			 * `json`: the answer is one JSON value, parsed into `ModelResponse.json`. The model is told so;
			 * an answer that holds no JSON fails with `BreezellModelError`.
			 */
			readonly responseFormat?: 'json';
			/**
			 * At most this many tokens of answer, from 16 to 65,536; for a model that reasons, its
			 * reasoning counts too. Some relays (OpenAI Responses) do not apply it.
			 */
			readonly maxOutputTokens?: number;
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
			/** Absent when the provider reported none. */
			readonly usage?: TokenUse;
			readonly text: string;
			/** `provider/model` that answered. */
			readonly model: string;
			/** With `responseFormat: 'json'`: the answer, parsed. */
			readonly json?: unknown;
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
			/**
			 * An overlay's place (`"kind": "overlay"`): within 560 × 480 and on a screen. With
			 * `durationMs` (up to 2000) it moves there on iOS's curve, quick to leave and slow to settle;
			 * a new call stops a move under way. Resolves when it is there.
			 */
			setBounds(bounds: ScreenRect, options?: { readonly durationMs?: number }): Thenable<void>;
			/** An overlay opens hidden; shown, it stays above every app without taking the focus. */
			show(): Thenable<void>;
			hide(): Thenable<void>;
			/**
			 * An overlay takes the keyboard, for a panel the user's click opened, until it loses the
			 * focus (a click anywhere else): then onDidDeactivate, and it no longer takes the focus.
			 */
			activate(): Thenable<void>;
			readonly onDidDeactivate: Event<void>;
		}

		/** What an instance of this plugin in another of Breezell's editor windows broadcast. */
		export interface Broadcast {
			readonly fromWindow: number;
			readonly message: unknown;
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
		/** A custom API without its keys, as `providers.list` gives it. */
		export interface ProviderSummary {
			readonly id: string;
			readonly name: string;
			/** `openai`, `openai-responses` or `anthropic`. */
			readonly protocol: string;
			/** The host requests go to, without path or query. */
			readonly host: string;
			/** The names of the request headers it adds; never their values. */
			readonly headerNames: readonly string[];
			/** How many accounts its pool takes in turn; absent without a pool. */
			readonly poolAccounts?: number;
			readonly models: readonly { readonly id: string; readonly enabled: boolean; readonly current: boolean }[];
		}

		export namespace providers {
			export function listCustom(): Thenable<CustomApi[]>;
			/**
			 * The user's custom APIs without their keys, header values or addresses beyond the host
			 * (`providers.list`, normal: on unless the user turns it off). Any plan.
			 */
			export function list(): Thenable<ProviderSummary[]>;
		}

		export namespace windows {
			/**
			 * Opens a declared window, or returns it when it is open. A window declared with
			 * `"kind": "overlay"` needs `ui.overlay` (asked the first time): small, borderless and
			 * see-through, above every app, never the focus, out of the taskbar; it opens hidden. On
			 * a native Wayland session it fails with `BreezellNotSupported` (check overlaySupported()).
			 */
			export function open(windowId: string): Thenable<PluginWindow>;
			/** Whether overlays can float above other apps here: Windows, macOS and Linux under X11; not native Wayland. */
			export function overlaySupported(): Thenable<boolean>;
			/** The work area (the screen less the taskbar or menu bar) of the screen this editor window is on. */
			export function workArea(): Thenable<ScreenRect>;
			/**
			 * Brings this editor window, or another by its id (app.focus().windowId of the plugin there),
			 * to the front, restored when minimized: for a click on the plugin's overlay (only while it has one open).
			 */
			export function focusEditor(windowId?: number): Thenable<void>;
			/**
			 * Tells this plugin's instances in Breezell's other editor windows (each window runs its own):
			 * JSON, at most 1 MB. False when it is too big. Needs no permission: it reaches this plugin only.
			 */
			export function broadcast(message: unknown): Thenable<boolean>;
			export const onDidReceiveBroadcast: Event<Broadcast>;
		}

		/** A step of the agent's work, as the title bar would say it. */
		export interface AgentStep {
			readonly kind: 'thinking' | 'writing' | 'editing' | 'reading' | 'searching' | 'runningCommand' | 'usingTool' | 'waitingOnSubtasks' | 'condensing' | 'reconnecting';
			/** The file's name (no folder), when it reads or edits one file. */
			readonly file?: string;
		}

		/**
		 * What the agent does across the conversations (the most pressing first: waiting on the user,
		 * then working, then just finished or failed) and the build or test task that runs. The step
		 * and the model, never what the messages say.
		 */
		export interface Activity {
			readonly agent:
			| { readonly kind: 'idle' }
			| { readonly kind: 'awaitingUser'; readonly conversationId: string; readonly conversations: number }
			| { readonly kind: 'working'; readonly conversationId: string; readonly step: AgentStep; readonly conversations: number; readonly startedAt: number; readonly model?: { readonly provider: string; readonly name: string } }
			| { readonly kind: 'finished'; readonly conversationId: string; readonly elapsedMs: number }
			| { readonly kind: 'failed'; readonly conversationId: string };
			readonly task?:
			| { readonly kind: 'running'; readonly name: string; readonly startedAt: number; readonly others: number }
			| { readonly kind: 'succeeded'; readonly name: string; readonly elapsedMs: number }
			| { readonly kind: 'failed'; readonly name: string; readonly exitCode?: number };
		}

		/** `activity.read`: what Breezell is busy with, for a status display. */
		export namespace activity {
			export function current(): Thenable<Activity>;
			export const onDidChange: Event<Activity>;
			/** The model's brand mark as SVG markup (it draws in currentColor where it has one color). */
			export function modelIcon(model: { readonly provider: string; readonly name: string }): Thenable<string | undefined>;
			/** Brings this editor window to the front with the conversation, or with the task's terminal. */
			export function reveal(target?: 'agent' | 'task'): Thenable<void>;
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
		/** A tool call of the agent, as `agent.hooks` shows it. */
		export interface ToolCall {
			/** As `listConversations` names it; a subagent's or teammate's call has an id of its own. */
			readonly conversationId: string;
			readonly toolCallId: string;
			readonly name: string;
			/** As the agent passed them; each text is cut at 20,000 characters. */
			readonly params: { readonly [key: string]: unknown };
			/** The MCP server of an MCP tool (`plugin:<id>` for a plugin's). */
			readonly mcpServer?: string;
			/** The chat mode of the turn, e.g. `agent`, `plan`. */
			readonly mode: string;
		}

		/** `deny`: the call does not run; the agent and the user see `reason` as this plugin's. */
		export type ToolCallAnswer = { readonly deny?: boolean; readonly reason?: string } | undefined | void;
		export type ToolCallHandler = (call: ToolCall) => ToolCallAnswer | Thenable<ToolCallAnswer>;

		export interface ToolRun extends ToolCall {
			readonly status: 'done' | 'failed' | 'rejected';
			/** What the chat shows of the result, cut at 20,000 characters. */
			readonly result: string;
			readonly resultLength: number;
		}

		export namespace tools {
			/** Registers the code of a declared tool; disposing it takes the tool away from the agent. */
			export function register(name: string, tool: Tool): Disposable;
			/**
			 * Each tool call of the agent before it runs, approval or not (`agent.hooks`, dangerous: asked
			 * the first time): refuse it with `{ deny: true, reason }`. An answer later than three seconds,
			 * or a failure, lets the call go on. One handler per plugin; with several plugins, the first
			 * refusal (in plugin id order) decides.
			 */
			export function registerCallHandler(handler: ToolCallHandler): Disposable;
			/** A tool call the plugins were asked about finished: done, failed, or rejected by the user (`agent.hooks`). */
			export const onDidRunTool: Event<ToolRun>;
		}
	}
}
