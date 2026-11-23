/*
 * A turn of a Breezell conversation, answered by the user's own Claude Code. It runs in print mode with
 * streamed JSON both ways and asks before a tool runs through its stdio permission channel, as
 * Anthropic's own Agent SDK does (`--permission-prompt-tool=stdio`): each `can_use_tool` request goes
 * to Breezell's approval card and its answer goes back as a `control_response`. The conversation's
 * session goes on with `--resume`. Nothing here reads Claude Code's files or its credentials.
 */
import type { ChildProcess } from 'node:child_process';
import type { Target } from './claudeCode';
import { BREEZELL_EDIT_TOOL, BREEZELL_TERMINAL_TOOL, BREEZELL_WRITE_TOOL, isSubagentTool, partialInput, UNSHOWN_TOOLS, viewOfResult, viewOfUse, viewOfWrite, withUri, type ToolView } from './views';

/** What Breezell gives a turn and takes back (vscode.breezell.AgentTurn / AgentReply, kept plain here for tests). */
export interface Turn {
	readonly model: string;
	readonly text: string;
	readonly attachments: readonly { readonly name: string; readonly kind: string; readonly path?: string }[];
	/** The folder it works in, as a path of this computer or of WSL. */
	readonly cwd?: string;
	readonly session?: string;
	/** The effort level the user picked for the model (`--effort`); none: Claude Code's own. */
	readonly effort?: string;
	/** The window's other folders, as Claude Code reaches them (`--add-dir`): the whole workspace is its to work in. */
	readonly addDirs?: readonly string[];
	/** What was said in the conversation that this session has not seen. */
	readonly history?: readonly { readonly role: 'user' | 'assistant'; readonly text: string }[];
	/** What Breezell remembers that bears on this message: told with it. */
	readonly memories?: string;
	/** Breezell's notices for the agent (how commands it ran in Breezell's terminal ended in the background); with an empty `text`, the whole message. */
	readonly notices?: readonly string[];
	/** Going on in `session` after its model request failed (`after`: that error): asked to continue, not told the message again. */
	readonly continuing?: { readonly after: string };
}

export interface Reply {
	/** `parent`: the subagent call whose words they are. */
	text(text: string, parent?: string): void;
	reasoning(text: string, parent?: string): void;
	/** How far a thought whose text the model keeps hidden has gone (Claude Code's estimate of its tokens). */
	thinking?(tokens: number): void;
	tool(tool: { id: string; name: string; title?: string; input?: Record<string, unknown>; status: 'running' | 'done' | 'error'; output?: string; view?: ToolView; parent?: string }): void;
	session(id: string): void;
	approve(request: { toolId: string; name: string; title?: string; input?: Record<string, unknown>; kind: 'edit' | 'command' | 'other'; reason?: string; view?: ToolView }): PromiseLike<boolean>;
	/** Claude Code sends a failed model request again by itself, in `delayMs` (its api_retry). */
	retrying?(retry: { attempt: number; maxAttempts: number; delayMs: number; error?: string }): void;
}

/** What Breezell may ask of a turn under way: stopping one of its subagents (its call's id), the turn going on. */
export interface TurnControls {
	stopSubagent?: (toolId: string) => boolean;
	/** One of the plugin's models for a model a message names (claude-haiku-5-5 → haiku): a subagent's, for its page. */
	modelIdOf?: (model: string) => string | undefined;
	/** How long a model response may stay silent before the turn stops as stalled (MODEL_STALL_MS); tests set a shorter one. */
	stallMs?: number;
	/** Breezell's tools to offer Claude Code in this turn (its memory lookup), and how to run its calls of them. */
	breezellTools?: readonly { readonly name: string; readonly inputSchema: unknown; readonly shell?: string }[];
	callBreezellTool?: (name: string, input: Record<string, unknown>, toolUseId?: string) => PromiseLike<{ text: string; isError?: boolean; resultType?: string; count?: number }>;
}

/** The MCP server this plugin hosts for Claude Code in a turn (its tools are Breezell's: mcp__breezell__<name>). */
export const BREEZELL_MCP_SERVER = 'breezell';

/** What Claude Code is told of Breezell's tools (a description of each; their parameters come from Breezell). */
const BREEZELL_TOOL_DESCRIPTIONS: Readonly<Record<string, string>> = {
	memories_recall: 'Look up what Breezell remembers for this user and project: notes and decisions from earlier conversations, lessons learned, records of past runs. Use it when earlier work may bear on the task (conventions, past fixes, what the user asked for before). A lookup lists matches by title with their ids; open the ones you need in full with ids.',
	run_terminal_cmd: 'Run a shell command in Breezell\'s terminal, the one the user watches: it shows the command and its output as it runs, and the user can open the terminal or stop the command. This is the only way to run shell commands here: use it for builds, tests, git, scripts and servers. Write each command for the shell named below. It starts in the project folder; prepend a cd to run elsewhere. A command still running after block_until_ms (default 30 s, longer while it keeps printing) moves to the background and the result says so with its terminal id: check on it or stop it with await, or go on with other work. Start servers and watchers with background: true or purpose "serve". When a background command ends, Breezell tells you in a later message.',
	await: 'Wait on a command that run_terminal_cmd moved to the background (task_id: its terminal id). Returns when the command ends, when its output matches pattern, or after block_until_ms, with what it printed. stop: true stops the command instead.',
	edit_file: 'Change a file through Breezell, the user\'s editor: the change shows there for the user to keep or undo, and the result lists the problems (lint and type errors) the file has afterwards. This is the only way to change an existing file here. Replace old_string with new_string: exact text from the file, its indentation included, that matches once (or set replace_all). For several changes to one file, pass them in edits[], applied in order, all or none. uri: the file\'s full path, with forward slashes.',
	write_to_file: 'Create a new file through Breezell, the user\'s editor, with its whole content: the user can keep or undo it there, and the result lists the problems the file has. It does not replace a file that exists: change those with edit_file. uri: the file\'s full path, with forward slashes.',
};
/**
 * Claude Code's own tools that Breezell's take over when offered: its shell (Bash, and Monitor, which runs commands
 * too) while Breezell's terminal is, its file edits while Breezell's are (MultiEdit: older versions).
 */
const OWN_TOOLS_REPLACED: Readonly<Record<string, readonly string[]>> = {
	run_terminal_cmd: ['Bash', 'Monitor'],
	edit_file: ['Edit', 'MultiEdit'],
	write_to_file: ['Write'],
};
/**
 * Breezell's tools Claude Code loads at the start (`anthropic/alwaysLoad`), not behind its ToolSearch: with its own
 * shell and edits off, the model must see what it has instead (without it, it tried Bash and worked around the refusal).
 */
const ALWAYS_LOADED_BREEZELL_TOOLS = new Set(['run_terminal_cmd', 'await', 'edit_file', 'write_to_file']);
/** Breezell's tools that run without asking: a lookup, a wait. A command is asked about as Breezell's own are. */
const UNASKED_BREEZELL_TOOLS = new Set(['memories_recall', 'await']);
/** What Claude Code is told of a Breezell tool: its description, and for run_terminal_cmd the shell its commands run in. */
const descriptionOf = (tool: { readonly name: string; readonly shell?: string }) => tool.name === 'run_terminal_cmd' && tool.shell
	? `${BREEZELL_TOOL_DESCRIPTIONS[tool.name]} Commands run in: ${tool.shell.slice(0, 200)}.`
	: BREEZELL_TOOL_DESCRIPTIONS[tool.name];

/** The files Claude Code names, as Breezell reaches them: their URIs, and (for a Write it asks about) their text now. */
export interface TurnFiles {
	uriOf(path: string): string | undefined;
	textOf(path: string): Promise<string | undefined>;
}

export interface Cancel {
	readonly isCancellationRequested: boolean;
	onCancellationRequested(listener: () => void): { dispose(): void };
}

/** A call being written is told again at most this often (its input so far, as it grows). */
export const WRITING_TOLD_MS = 150;

/** After a background subagent ended with the turn told over: how long nothing may follow before Claude Code's input closes. */
export const AFTER_BACKGROUND_QUIET_MS = 10_000;

/** After asking it to stop, how long Claude Code may take before its process is ended. */
export const STOP_GRACE_MS = 3000;

/**
 * A model response that went silent (no event of Claude Code's) for this long is taken for a dead connection:
 * the turn stops with a "stalled" model error, which Breezell sends on in the session. Breezell's own wide
 * net for a silent reasoning (REASONING_STALL_TIMEOUT_MS); Claude Code tells a hidden thought's progress about
 * once a second, so a healthy thought is never this quiet.
 */
export const MODEL_STALL_MS = 240_000;
/** The ids of the stop_task requests this plugin sends (Claude Code's answer to them is not waited for). */
const STOP_TASK = 'breezell-stop-task';

/** Which of Breezell's auto-approve settings decides a tool of Claude Code's. */
export function toolKind(name: string): 'edit' | 'command' | 'other' {
	if (/^(Write|Edit|MultiEdit|NotebookEdit)$/.test(name)) {
		return 'edit';
	}
	if (name === BREEZELL_EDIT_TOOL || name === BREEZELL_WRITE_TOOL) {
		return 'edit';
	}
	return /^(Bash|BashOutput|KillShell|KillBash)$/.test(name) || name === BREEZELL_TERMINAL_TOOL ? 'command' : 'other';
}

const firstLine = (value: unknown, max = 160): string | undefined => {
	if (typeof value !== 'string') {
		return undefined;
	}
	const line = value.split(/\r?\n/).map(l => l.trim()).find(Boolean);
	return line ? (line.length > max ? `${line.slice(0, max - 1)}…` : line) : undefined;
};

/** One line saying what a tool call does: the command, the file, the pattern, the page. */
export function toolTitle(name: string, input: Record<string, unknown> | undefined): string | undefined {
	const i = input ?? {};
	switch (name) {
		case 'Bash': return firstLine(i.command);
		case 'Read': case 'Write': case 'Edit': case 'MultiEdit': return firstLine(i.file_path);
		case 'NotebookEdit': return firstLine(i.notebook_path);
		case 'Grep': case 'Glob': return firstLine(i.pattern);
		case 'WebFetch': return firstLine(i.url);
		case 'WebSearch': return firstLine(i.query);
		case 'Task': case 'Agent': return firstLine(i.description);
		default: return firstLine(i.description) ?? firstLine(i.file_path) ?? firstLine(i.command);
	}
}

/** A tool result's text: its text parts, whatever shape Claude Code sent. */
function resultText(content: unknown): string {
	if (typeof content === 'string') {
		return content;
	}
	if (Array.isArray(content)) {
		return content.map(part => part && typeof part === 'object' && typeof (part as { text?: unknown }).text === 'string' ? (part as { text: string }).text : '').filter(Boolean).join('\n');
	}
	return '';
}

/**
 * What the user sends, with the attachments named so Claude Code can read them where they are, after
 * what was said in the conversation that its session has not seen.
 */
export function promptOf(turn: Turn, pathFor: (path: string) => string): string {
	// Going on after a failed model request: its session has the message and what was done so far.
	if (turn.continuing) {
		const after = turn.continuing.after.split(/\r?\n/)[0].trim().slice(0, 300);
		return `Your previous request to the model failed before you finished${after ? ` (${after})` : ''}. Continue the task from where you stopped. Do not start over, and do not repeat steps that are already done.`;
	}
	const files = turn.attachments.filter(a => a.path).map(a => `- ${a.kind === 'folder' ? 'Folder' : 'File'}: ${pathFor(a.path!)}`);
	const others = turn.attachments.filter(a => !a.path).map(a => `- ${a.name} (${a.kind}, not passed on)`);
	const lines = [...files, ...others];
	const remembered = turn.memories?.trim()
		? `\n\n<breezell-memories>\nWhat Breezell remembers that may bear on this message (notes from earlier work: check them against the code before relying on them):\n\n${turn.memories.trim()}\n</breezell-memories>`
		: '';
	const notices = turn.notices?.map(notice => notice.trim()).filter(Boolean) ?? [];
	const noticed = notices.length ? `<breezell-notices>\nFrom Breezell, not from the user:\n\n${notices.join('\n\n')}\n</breezell-notices>` : '';
	const text = turn.text.trim() ? turn.text : 'No new message from the user. Breezell has news of commands you ran in its terminal:';
	const message = [(lines.length ? `${text}\n\nAttached in Breezell:\n${lines.join('\n')}` : text) + remembered, noticed].filter(Boolean).join('\n\n');
	if (!turn.history?.length) {
		return message;
	}
	const said = turn.history.map(entry => `[${entry.role === 'user' ? 'User' : 'Assistant'}]\n${entry.text}`).join('\n\n');
	return `Earlier in this Breezell conversation, in messages you have not seen (oldest first):\n\n${said}\n\n---\nThe user's new message:\n\n${message}`;
}

/**
 * Its thinking as a summary (`--thinking-display summarized`), shown as Breezell shows a model's thinking; without
 * it a thought is only its size. The flag is not in Claude Code's help (2.1.330 has it; the `showThinkingSummaries`
 * setting does the same, but not with -p): an install that refuses it ("unknown option") runs without it from then.
 */
const THINKING_DISPLAY = ['--thinking-display', 'summarized'];
/** The Claude Code installs (by where and path) that refused THINKING_DISPLAY. */
const refusedThinkingDisplay = new Set<string>();
const installOf = (target: Target) => `${target.where}\0${target.path}`;

/** The arguments of one turn; `summaries`: ask for its thinking as a summary (THINKING_DISPLAY). */
export function turnArgs(turn: Turn, summaries = true): string[] {
	return [
		'-p', '--output-format', 'stream-json', '--verbose', '--input-format', 'stream-json', '--include-partial-messages',
		'--permission-prompt-tool=stdio',
		...(summaries ? THINKING_DISPLAY : []),
		...(turn.model && turn.model !== 'default' ? ['--model', turn.model] : []),
		...(turn.effort && (EFFORTS as readonly string[]).includes(turn.effort) ? ['--effort', turn.effort] : []),
		...(turn.addDirs ?? []).flatMap(dir => ['--add-dir', dir]),
		...(turn.session ? ['--resume', turn.session] : []),
	];
}

/** Each JSON object a Claude Code writes on `stream`, one a line (stream-json); other lines are passed over. */
export function onJsonLines(stream: NodeJS.ReadableStream | null | undefined, handle: (message: Record<string, unknown>) => void): void {
	let buffer = '';
	stream?.setEncoding('utf8');
	stream?.on('data', (data: string) => {
		buffer += data;
		for (let i = buffer.indexOf('\n'); i >= 0; i = buffer.indexOf('\n')) {
			const line = buffer.slice(0, i).trim();
			buffer = buffer.slice(i + 1);
			if (!line.startsWith('{')) {
				continue;
			}
			let parsed: unknown;
			try {
				parsed = JSON.parse(line);
			} catch {
				continue;
			}
			if (parsed && typeof parsed === 'object') {
				handle(parsed as Record<string, unknown>);
			}
		}
	});
}

/**
 * Runs one turn. Resolves with the session to go on with, and the error Claude Code ended with; rejects
 * only when it could not be run at all.
 */
export function runTurn(target: Target, turn: Turn, reply: Reply, token: Cancel, pathFor: (path: string) => string = p => p, files?: TurnFiles, controls?: TurnControls): Promise<{ session?: string; error?: string; entry?: string; apiError?: string }> {
	const named = (view: ToolView | undefined) => files ? withUri(view, path => files.uriOf(path)) : view;
	return new Promise((resolve, reject) => {
		let child: ChildProcess;
		try {
			// Breezell's tools it is offered: a lookup or a wait runs without asking; a command or a change is asked about
			// as Breezell's own are, and Claude Code's own tools for those are off, so every command and change goes there.
			const tools = (controls?.callBreezellTool ? controls.breezellTools ?? [] : []).filter(tool => BREEZELL_TOOL_DESCRIPTIONS[tool.name]);
			const allowed = tools.filter(tool => UNASKED_BREEZELL_TOOLS.has(tool.name)).map(tool => `mcp__${BREEZELL_MCP_SERVER}__${tool.name}`);
			const replaced = tools.flatMap(tool => OWN_TOOLS_REPLACED[tool.name] ?? []);
			child = target.start([
				...turnArgs(turn, !refusedThinkingDisplay.has(installOf(target))),
				...(allowed.length ? ['--allowedTools', allowed.join(',')] : []),
				...(replaced.length ? ['--disallowedTools', replaced.join(',')] : []),
			], turn.cwd);
		} catch (error) {
			reject(error);
			return;
		}
		// Only a session Claude Code itself names: one it could not go on with (removed, say) is not echoed back.
		let session: string | undefined;
		/** The last record of the session this turn made (a message's uuid, as its session file keeps it). */
		let entry: string | undefined;
		let error: string | undefined;
		/**
		 * The error came from its model request, of this kind: Claude Code's (an API error message names it:
		 * rate_limit, overloaded, server_error, unknown, billing_error…), or "stalled" (MODEL_STALL_MS).
		 */
		let apiError: string | undefined;
		let gotResult = false;
		let stderr = '';
		let killTimer: ReturnType<typeof setTimeout> | undefined;
		/** A model response is coming (message_start to message_stop), and when Claude Code last said anything. */
		let streaming = false;
		let lastHeardAt = Date.now();
		let stalled = false;
		/** Tool calls by id, for the results and progress that name only the id: hidden ones are not told at all. */
		const tools = new Map<string, { name: string; input?: Record<string, unknown>; parent?: string; hidden: boolean; async?: boolean }>();
		const told = (id: string, name: string, input: Record<string, unknown> | undefined, parent: string | undefined) => ({ id, name, ...(toolTitle(name, input) ? { title: toolTitle(name, input) } : {}), ...(input ? { input } : {}), ...(parent ? { parent } : {}) });
		/**
		 * Subagents (Agent calls) by their calls' ids: Claude Code's task for each (task_started), whether it works in
		 * the background (its call returns at once: its end comes as task_notification), stopped, or over.
		 */
		const tasks = new Map<string, { id: string; stopped: boolean; background: boolean; ended: boolean; status?: unknown; summary?: string }>();
		/** A background subagent's call at its end (task_notification): done with its report, failed, or stopped. */
		const endAsync = (callId: string, call: { name: string; input?: Record<string, unknown>; parent?: string; async?: boolean }, task: { stopped: boolean; status?: unknown; summary?: string }) => {
			const view = viewOfUse(call.name, call.input);
			if (view?.kind !== 'subagent') {
				return;
			}
			call.async = false;
			const done = task.status === 'completed';
			const report = task.summary;
			reply.tool({ ...told(callId, call.name, call.input, call.parent), status: done ? 'done' : 'error', ...(report ? { output: report } : {}), view: { ...view, background: true, ...(done && report ? { report } : {}), ...(task.stopped ? { stopped: true } : {}) } });
		};
		/** Subagent calls whose model (their messages name it) was told: their page shows the model they run on. */
		const modelTold = new Set<string>();
		/** Calls Claude Code is still writing, by their blocks in the message (stream_event): their input so far. */
		const writing = new Map<number, { id: string; name: string; json: string; toldAt: number }>();
		/**
		 * A turn told it is over (result) while a subagent still worked in the background: Claude Code goes on once it
		 * ends, and its input stays open for what it asks meanwhile. Should nothing follow that end, the input closes.
		 */
		let resultWhileBusy = false;
		let quietClose: ReturnType<typeof setTimeout> | undefined;
		const tasksRunning = () => [...tasks.values()].some(task => !task.ended);
		const taskByTaskId = (taskId: unknown) => [...tasks.values()].find(task => task.id === taskId);
		/** Messages whose words came as they were written (`--include-partial-messages`): not told again when whole. */
		const streamed = new Set<string>();
		let current: string | undefined;
		/**
		 * Per speaker (the lead, or a subagent by its call): the message its last words came from, and whether it
		 * made a call since. Breezell starts a new reply at a call; words of a new message with no call between
		 * (Claude Code going on after a background subagent ended) start a new paragraph, not the same line.
		 */
		const lastWords = new Map<string, { message: string | undefined; called: boolean }>();
		const say = (text: string, message: string | undefined, parent?: string) => {
			const before = lastWords.get(parent ?? '');
			const apart = !!before && !before.called && before.message !== undefined && message !== undefined && before.message !== message;
			lastWords.set(parent ?? '', { message, called: false });
			reply.text(apart ? `\n\n${text}` : text, parent);
		};
		const called = (parent?: string) => {
			const before = lastWords.get(parent ?? '');
			if (before) {
				before.called = true;
			}
		};
		let nextRequest = 1;
		const write = (message: unknown) => {
			if (child.stdin && !child.stdin.destroyed && child.stdin.writable) {
				child.stdin.write(`${JSON.stringify(message)}\n`);
			}
		};
		if (controls) {
			controls.stopSubagent = toolId => {
				const task = tasks.get(toolId);
				if (!task || token.isCancellationRequested) {
					return false;
				}
				write({ type: 'control_request', request_id: `${STOP_TASK}-${nextRequest++}`, request: { subtype: 'stop_task', task_id: task.id } });
				return true;
			};
		}
		/** Breezell's tools offered in this turn, and what each call of them came to (its row shows the kind and count). */
		const offered = (controls?.callBreezellTool ? controls.breezellTools ?? [] : []).filter(tool => BREEZELL_TOOL_DESCRIPTIONS[tool.name]);
		const recalled = new Map<string, { resultType?: string; count?: number }>();
		/** One MCP message for the server this plugin hosts (Claude Code's mcp_message): its JSON-RPC answer. */
		const answerMcp = async (rpc: { id?: unknown; method?: unknown; params?: { name?: unknown; arguments?: unknown; protocolVersion?: unknown; _meta?: Record<string, unknown> } }): Promise<unknown> => {
			const reply = (result: unknown) => ({ jsonrpc: '2.0', id: rpc.id ?? null, result });
			switch (rpc.method) {
				case 'initialize':
					return reply({ protocolVersion: typeof rpc.params?.protocolVersion === 'string' ? rpc.params.protocolVersion : '2025-06-18', capabilities: { tools: {} }, serverInfo: { name: BREEZELL_MCP_SERVER, version: '1.0.0' } });
				case 'tools/list':
					return reply({ tools: offered.map(tool => ({ name: tool.name, description: descriptionOf(tool), inputSchema: tool.inputSchema, ...(ALWAYS_LOADED_BREEZELL_TOOLS.has(tool.name) ? { _meta: { 'anthropic/alwaysLoad': true } } : {}) })) });
				case 'tools/call': {
					const name = typeof rpc.params?.name === 'string' ? rpc.params.name : '';
					const input = rpc.params?.arguments && typeof rpc.params.arguments === 'object' ? rpc.params.arguments as Record<string, unknown> : {};
					if (!offered.some(tool => tool.name === name) || !controls?.callBreezellTool) {
						return reply({ content: [{ type: 'text', text: `No tool named ${name}.` }], isError: true });
					}
					// The call's own id (Claude Code names it): Breezell shows what it ran on that call's row.
					const toolUseId = typeof rpc.params?._meta?.['claudecode/toolUseId'] === 'string' ? rpc.params._meta['claudecode/toolUseId'] as string : undefined;
					const result = await Promise.resolve(controls.callBreezellTool(name, input, toolUseId)).then(r => r, error => ({ text: String(error?.message ?? error), isError: true }));
					recalled.set(JSON.stringify(input), { resultType: (result as { resultType?: string }).resultType, count: (result as { count?: number }).count });
					return reply({ content: [{ type: 'text', text: result.text || '(nothing)' }], ...(result.isError ? { isError: true } : {}) });
				}
				default:
					// A notification is answered with an empty result; a request it does not know, with an error.
					return rpc.id === undefined ? reply({}) : { jsonrpc: '2.0', id: rpc.id, error: { code: -32601, message: `Method not found: ${String(rpc.method)}` } };
			}
		};
		const answer = (requestId: string, allowed: boolean, input: unknown) => write({
			type: 'control_response',
			response: { subtype: 'success', request_id: requestId, response: allowed ? { behavior: 'allow', updatedInput: input ?? {} } : { behavior: 'deny', message: 'The user did not allow this in Breezell.' } },
		});
		const handle = (message: Record<string, unknown>) => {
			lastHeardAt = Date.now();
			// A subagent's messages carry the call that started it (Agent): its words and calls show under that call.
			const parent = typeof message.parent_tool_use_id === 'string' && message.parent_tool_use_id ? message.parent_tool_use_id : undefined;
			const subagent = parent !== undefined;
			// Claude Code goes on after a background subagent ended: the input stays open for that turn.
			if (quietClose && (message.type === 'stream_event' || message.type === 'assistant' || message.type === 'control_request')) {
				clearTimeout(quietClose);
				quietClose = undefined;
			}
			if ((message.type === 'user' || message.type === 'assistant') && !subagent && typeof message.uuid === 'string') {
				entry = message.uuid;
			}
			switch (message.type) {
				case 'system': {
					if (message.subtype === 'init' && typeof message.session_id === 'string') {
						session = message.session_id;
						reply.session(session);
					}
					// A subagent's task: what stop_task names; a stopped one ends as an error of its call (marked stopped below).
					if (message.subtype === 'task_started' && typeof message.tool_use_id === 'string' && typeof message.task_id === 'string') {
						const background = message.is_backgrounded === true;
						tasks.set(message.tool_use_id, { id: message.task_id, stopped: false, background, ended: false });
						// Claude Code sends one to the background on its own too: Breezell shows it as one at work there.
						const started = tools.get(message.tool_use_id);
						const view = started && background ? viewOfUse(started.name, started.input) : undefined;
						if (started && view?.kind === 'subagent') {
							reply.tool({ ...told(message.tool_use_id, started.name, started.input, started.parent), status: 'running', view: { ...view, background: true } });
						}
					}
					if (message.subtype === 'task_notification') {
						const callId = typeof message.tool_use_id === 'string' ? message.tool_use_id : [...tasks].find(([, task]) => task.id === message.task_id)?.[0];
						const task = callId ? tasks.get(callId) : undefined;
						if (task) {
							task.ended = true;
							task.stopped = task.stopped || message.status === 'stopped' || message.status === 'killed';
							task.status = message.status;
							task.summary = typeof message.summary === 'string' ? message.summary : undefined;
							// One in the background: its call returned at once, and this is its end, with its report.
							const ended = callId ? tools.get(callId) : undefined;
							if (ended?.async && callId) {
								endAsync(callId, ended, task);
							}
						}
						// Its turn told its end while this one still worked: Claude Code goes on with what it reported, and the
						// input closes with that turn's end; if nothing comes, after a while.
						if (resultWhileBusy && !tasksRunning() && !quietClose) {
							quietClose = setTimeout(() => child.stdin?.end(), AFTER_BACKGROUND_QUIET_MS);
						}
					}
					// A thought whose text the model keeps hidden: how far it has gone.
					if (message.subtype === 'thinking_tokens' && !subagent && typeof message.estimated_tokens === 'number') {
						reply.thinking?.(message.estimated_tokens);
					}
					// Its model request failed, and Claude Code sends it again by itself after a wait (its own retries).
					if (message.subtype === 'api_retry' && !subagent && typeof message.attempt === 'number' && typeof message.retry_delay_ms === 'number') {
						streaming = false;
						reply.retrying?.({ attempt: message.attempt, maxAttempts: typeof message.max_retries === 'number' ? message.max_retries : message.attempt, delayMs: Math.max(0, message.retry_delay_ms), ...(typeof message.error === 'string' && message.error ? { error: message.error } : {}) });
					}
					if (message.subtype === 'task_updated' && (message.patch as { status?: unknown } | undefined)?.status === 'killed') {
						const task = taskByTaskId(message.task_id);
						if (task) {
							task.stopped = true;
						}
					}
					// How a subagent goes: the step it is on, under its call.
					const call = typeof message.tool_use_id === 'string' ? tools.get(message.tool_use_id) : undefined;
					if (message.subtype === 'task_progress' && call && !call.hidden && isSubagentTool(call.name) && typeof message.description === 'string') {
						const view = viewOfUse(call.name, call.input);
						const step = firstLine(message.description, 200);
						const background = tasks.get(message.tool_use_id as string)?.background === true;
						reply.tool({ ...told(message.tool_use_id as string, call.name, call.input, call.parent), status: 'running', ...(view?.kind === 'subagent' ? { view: { ...view, ...(step ? { step } : {}), ...(background ? { background: true } : {}) } } : {}) });
					}
					return;
				}
				case 'stream_event': {
					if (subagent) {
						return;
					}
					const event = (message.event ?? {}) as { type?: string; index?: number; message?: { id?: string }; content_block?: { type?: string; id?: string; name?: string }; delta?: { type?: string; text?: string; thinking?: string; partial_json?: string } };
					// A call as Claude Code writes it: shown from its first words, growing (a file's content, a command).
					if (event.type === 'content_block_start' && event.content_block?.type === 'tool_use' && event.content_block.id && event.content_block.name && typeof event.index === 'number') {
						called();
						writing.set(event.index, { id: event.content_block.id, name: event.content_block.name, json: '', toldAt: 0 });
						if (!tools.has(event.content_block.id)) {
							tools.set(event.content_block.id, { name: event.content_block.name, hidden: UNSHOWN_TOOLS.has(event.content_block.name) });
						}
					} else if (event.type === 'content_block_delta' && event.delta?.type === 'input_json_delta' && typeof event.index === 'number') {
						const call = writing.get(event.index);
						const known = call ? tools.get(call.id) : undefined;
						// A subagent's call is told once whole: its half-written task would name its page.
						if (call && known && !known.hidden && !isSubagentTool(call.name) && typeof event.delta.partial_json === 'string') {
							call.json += event.delta.partial_json;
							const now = Date.now();
							if (now - call.toldAt >= WRITING_TOLD_MS) {
								const input = partialInput(call.json);
								const view = input ? named(viewOfUse(call.name, input)) : undefined;
								if (input && view) {
									call.toldAt = now;
									known.input = input;
									reply.tool({ ...told(call.id, call.name, input, undefined), status: 'running', view });
								}
							}
						}
					} else if (event.type === 'content_block_stop' && typeof event.index === 'number') {
						writing.delete(event.index);
					}
					if (event.type === 'message_stop') {
						streaming = false;
					}
					if (event.type === 'message_start') {
						streaming = true;
						current = event.message?.id;
					} else if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta' && event.delta.text) {
						if (current) { streamed.add(current); }
						say(event.delta.text, current);
					} else if (event.type === 'content_block_delta' && event.delta?.type === 'thinking_delta' && event.delta.thinking) {
						if (current) { streamed.add(current); }
						reply.reasoning(event.delta.thinking);
					}
					return;
				}
				case 'assistant': {
					const m = (message.message ?? {}) as { id?: string; content?: unknown[]; model?: unknown };
					// A subagent's first message names the model it runs on (maybe not its lead's): told with its call.
					const call = parent ? tools.get(parent) : undefined;
					if (parent && call && !modelTold.has(parent) && typeof m.model === 'string' && m.model) {
						modelTold.add(parent);
						const view = viewOfUse(call.name, call.input);
						if (view?.kind === 'subagent') {
							reply.tool({ ...told(parent, call.name, call.input, call.parent), status: 'running', view: { ...view, model: controls?.modelIdOf?.(m.model) ?? m.model, ...(tasks.get(parent)?.background ? { background: true } : {}) } });
						}
					}
					// Claude Code's message for a model request that failed for good ("API Error: …", its kind in `error`):
					// the error the turn ends with says it, not a reply.
					const failed = !subagent && typeof message.error === 'string' && message.error ? message.error : undefined;
					if (failed) {
						apiError = failed;
					}
					// A subagent's words never stream here: they come whole, under its call.
					const whole = !m.id || !streamed.has(m.id);
					for (const block of Array.isArray(m.content) ? m.content : []) {
						const b = block as { type?: string; text?: string; thinking?: string; id?: string; name?: string; input?: Record<string, unknown> };
						if (b.type === 'text' && b.text && whole && !failed) {
							say(b.text, m.id, parent);
						} else if (b.type === 'thinking' && b.thinking && whole) {
							reply.reasoning(b.thinking, parent);
						} else if (b.type === 'tool_use' && b.id && b.name) {
							called(parent);
							const hidden = UNSHOWN_TOOLS.has(b.name);
							tools.set(b.id, { name: b.name, input: b.input, parent, hidden });
							if (!hidden) {
								const view = named(viewOfUse(b.name, b.input));
								reply.tool({ ...told(b.id, b.name, b.input, parent), status: 'running', ...(view ? { view } : {}) });
							}
						}
					}
					return;
				}
				case 'user': {
					const content = ((message.message ?? {}) as { content?: unknown }).content;
					const results = (Array.isArray(content) ? content : []).filter(block => (block as { type?: string })?.type === 'tool_result');
					for (const block of results) {
						const b = block as { tool_use_id?: string; is_error?: boolean; content?: unknown };
						const call = b.tool_use_id ? tools.get(b.tool_use_id) : undefined;
						if (!b.tool_use_id || call?.hidden) {
							continue;
						}
						const name = call?.name ?? 'Tool';
						// A subagent sent to the background: its call returns at once with a note for the model (never shown);
						// it goes on, and its end comes as task_notification.
						const structured = results.length === 1 && message.tool_use_result && typeof message.tool_use_result === 'object' ? message.tool_use_result as { status?: unknown; isAsync?: unknown } : undefined;
						if (call && isSubagentTool(name) && !b.is_error && (structured?.status === 'async_launched' || structured?.isAsync === true)) {
							call.async = true;
							const task = tasks.get(b.tool_use_id);
							const launched = viewOfUse(name, call.input);
							if (task?.ended) {
								endAsync(b.tool_use_id, call, task);
							} else if (launched?.kind === 'subagent') {
								reply.tool({ ...told(b.tool_use_id, name, call.input, call.parent ?? parent), status: 'running', view: { ...launched, background: true } });
							}
							continue;
						}
						// Claude Code's structured result is of the message's one result.
						const seen = named(b.is_error ? viewOfUse(name, call?.input) : viewOfResult(name, call?.input, results.length === 1 ? message.tool_use_result : undefined));
						// A lookup in Breezell's memories: its row says what kind of result and how many, as the call returned them.
						const lookedUp = seen?.kind === 'memories' ? recalled.get(JSON.stringify(call?.input ?? {})) : undefined;
						const found: ToolView | undefined = seen?.kind === 'memories' && lookedUp ? { ...seen, ...(lookedUp.resultType === 'search' || lookedUp.resultType === 'list' || lookedUp.resultType === 'open' || lookedUp.resultType === 'l0_index' ? { resultType: lookedUp.resultType } : {}), ...(typeof lookedUp.count === 'number' ? { count: lookedUp.count } : {}) } : seen;
						// A subagent the user stopped ends as an error of its call: it was stopped, not failed.
						const view = found?.kind === 'subagent' && b.is_error && tasks.get(b.tool_use_id)?.stopped ? { ...found, stopped: true } : found;
						const output = view?.kind === 'subagent' && view.report ? view.report : resultText(b.content);
						reply.tool({ ...told(b.tool_use_id, name, call?.input, call?.parent ?? parent), status: b.is_error ? 'error' : 'done', output, ...(view ? { view } : {}) });
					}
					return;
				}
				case 'control_request': {
					const request = (message.request ?? {}) as { subtype?: string; tool_name?: string; input?: Record<string, unknown>; tool_use_id?: string; description?: string; decision_reason?: string };
					const requestId = typeof message.request_id === 'string' ? message.request_id : undefined;
					if (!requestId) {
						return;
					}
					// A message for the MCP server this plugin hosts (Breezell's tools): answered with its reply.
					if (request.subtype === 'mcp_message' && offered.length) {
						const mcp = request as { server_name?: unknown; message?: { id?: unknown; method?: unknown } };
						if (mcp.server_name === BREEZELL_MCP_SERVER && mcp.message && typeof mcp.message === 'object') {
							void answerMcp(mcp.message).then(response => write({ type: 'control_response', response: { subtype: 'success', request_id: requestId, response: { mcp_response: response } } }));
						} else {
							write({ type: 'control_response', response: { subtype: 'error', request_id: requestId, error: `No MCP server named ${String(mcp.server_name)} here.` } });
						}
						return;
					}
					if (request.subtype !== 'can_use_tool' || !request.tool_name) {
						// Nothing else is asked of a host like this one: say so rather than leave it waiting.
						write({ type: 'control_response', response: { subtype: 'error', request_id: requestId, error: `Breezell does not answer ${request.subtype ?? 'this request'}.` } });
						return;
					}
					const name = request.tool_name;
					const toolId = request.tool_use_id ?? `ask-${requestId}`;
					const title = toolTitle(name, request.input) ?? firstLine(request.description);
					// A Write of a file that is there: the card shows what it changes, not a new file.
					const writes = name === 'Write' && typeof request.input?.file_path === 'string' && files ? files.textOf(request.input.file_path).catch(() => undefined) : Promise.resolve(undefined);
					writes.then(before => {
						const view = named(name === 'Write' ? viewOfWrite(request.input, before) : viewOfUse(name, request.input));
						return reply.approve({ toolId, name, kind: toolKind(name), input: request.input, ...(title ? { title } : {}), ...(request.decision_reason ? { reason: firstLine(request.decision_reason, 400) } : {}), ...(view ? { view } : {}) });
					}).then(allowed => answer(requestId, allowed && !token.isCancellationRequested, request.input), () => answer(requestId, false, request.input));
					return;
				}
				case 'result':
					gotResult = true;
					if (typeof message.session_id === 'string') {
						session = message.session_id;
					}
					// Stopped as stalled: what the interruption ends with is not the error.
					if (!stalled && (message.is_error || (typeof message.subtype === 'string' && message.subtype !== 'success'))) {
						error = firstLine(message.result, 600) ?? `Claude Code ended with ${String(message.subtype ?? 'an error')}.`;
					}
					// The turn is told: its input closes, and Claude Code ends. Not while a subagent still works in the
					// background: Claude Code goes on once it ends (and may ask approvals for it meanwhile).
					if (tasksRunning()) {
						resultWhileBusy = true;
					} else {
						if (quietClose) {
							clearTimeout(quietClose);
							quietClose = undefined;
						}
						child.stdin?.end();
					}
					return;
			}
		};
		onJsonLines(child.stdout, handle);
		// A response that went silent (MODEL_STALL_MS): taken for a dead connection, it stops as a model error Breezell sends on.
		const stallMs = controls?.stallMs ?? MODEL_STALL_MS;
		const watchdog = setInterval(() => {
			if (!streaming || stalled || token.isCancellationRequested || Date.now() - lastHeardAt < stallMs) {
				return;
			}
			stalled = true;
			error = `No answer from the model for ${Math.round(stallMs / 1000)} s.`;
			apiError = 'stalled';
			write({ type: 'control_request', request_id: `breezell-stall-${nextRequest++}`, request: { subtype: 'interrupt' } });
			child.stdin?.end();
			killTimer = setTimeout(() => child.kill(), STOP_GRACE_MS);
		}, Math.max(10, Math.min(5_000, Math.floor(stallMs / 4))));
		child.stderr?.setEncoding('utf8');
		child.stderr?.on('data', (data: string) => { stderr = (stderr + data).slice(-4000); });
		const stopping = token.onCancellationRequested(() => {
			// Asked to stop as the SDK asks it; ended if it does not within the grace period.
			write({ type: 'control_request', request_id: `breezell-stop-${nextRequest++}`, request: { subtype: 'interrupt' } });
			child.stdin?.end();
			killTimer = setTimeout(() => child.kill(), STOP_GRACE_MS);
		});
		child.on('error', err => {
			clearInterval(watchdog);
			stopping.dispose();
			if (killTimer) { clearTimeout(killTimer); }
			reject(err);
		});
		child.on('close', code => {
			clearInterval(watchdog);
			stopping.dispose();
			if (killTimer) { clearTimeout(killTimer); }
			if (quietClose) { clearTimeout(quietClose); }
			// An install without the thinking display flag: it refused the arguments before doing anything; once more without it.
			if (!gotResult && !session && code !== 0 && !token.isCancellationRequested && !refusedThinkingDisplay.has(installOf(target)) && /unknown option '--thinking-display'/.test(stderr)) {
				refusedThinkingDisplay.add(installOf(target));
				runTurn(target, turn, reply, token, pathFor, files, controls).then(resolve, reject);
				return;
			}
			if (!gotResult && !token.isCancellationRequested && code !== 0) {
				const last = stderr.split(/\r?\n/).map(l => l.trim()).filter(Boolean).pop();
				error = error ?? `Claude Code exited with code ${code}${last ? `: ${last}` : ''}`;
			}
			// Stopped by the user, what Claude Code ends with (error_during_execution) is no error.
			const failure = error && !token.isCancellationRequested ? error : undefined;
			resolve({ ...(session ? { session } : {}), ...(failure ? { error: failure } : {}), ...(entry ? { entry } : {}), ...(failure && apiError ? { apiError } : {}) });
		});
		// Breezell's tools, through the MCP server this plugin hosts here (named before the message, as the SDK does).
		if (offered.length) {
			write({ type: 'control_request', request_id: `breezell-init-${nextRequest++}`, request: { subtype: 'initialize', sdkMcpServers: [BREEZELL_MCP_SERVER] } });
		}
		write({ type: 'user', message: { role: 'user', content: promptOf(turn, pathFor) }, parent_tool_use_id: null });
	});
}

/** The effort levels `--effort` takes. */
export const EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max'] as const;

/**
 * A model of Claude Code's: always one of Claude's, which Breezell's model picker shows with its Claude
 * icon; `efforts`: the levels it takes, which Breezell's model menu offers.
 */
export type ClaudeModel = { id: string; title: string; description?: string; family: 'claude'; efforts?: Effort[]; /** The model it stands for (`resolvedModel`): what a message it wrote names. */ resolved?: string };
export type Effort = typeof EFFORTS[number];

/**
 * The models Claude Code's own model picker offers, from its answer to `initialize` (each `value` is what
 * `--model` takes: an alias such as `opus`, or a full id such as `claude-opus-4-8`). "Default" is named
 * after the model it stands for: Default (Opus 5.5).
 */
export function modelsOfInitialize(raw: unknown): ClaudeModel[] {
	type Listed = { value: string; displayName?: unknown; description?: unknown; resolvedModel?: unknown; supportsEffort?: unknown; supportedEffortLevels?: unknown };
	const listed = (Array.isArray(raw) ? raw : []).filter((m): m is Listed => !!m && typeof m === 'object' && typeof (m as Listed).value === 'string' && !!(m as Listed).value);
	const nameOf = (m: Listed) => typeof m.displayName === 'string' && m.displayName.trim() ? m.displayName.trim() : m.value;
	const named = new Map<unknown, string>(listed.filter(m => m.value !== 'default').map(m => [m.resolvedModel, nameOf(m)]));
	return listed.map(m => {
		const description = typeof m.description === 'string' && m.description.trim() ? m.description.trim() : undefined;
		const title = m.value === 'default' && named.has(m.resolvedModel) ? `Default (${named.get(m.resolvedModel)})` : nameOf(m);
		const levels = m.supportsEffort === true && Array.isArray(m.supportedEffortLevels) ? m.supportedEffortLevels : [];
		const efforts = EFFORTS.filter(level => levels.includes(level));
		const resolved = typeof m.resolvedModel === 'string' && m.resolvedModel ? m.resolvedModel : undefined;
		return { id: m.value, title, ...(description ? { description } : {}), family: 'claude' as const, ...(efforts.length ? { efforts } : {}), ...(resolved ? { resolved } : {}) };
	});
}

/** Asking Claude Code what it offers takes no turn: no message is sent, so no model is asked. */
const INITIALIZE = 'breezell-initialize';

/** Claude Code's answer to `initialize`, as the Agent SDK asks it: its models; undefined when it gave none in time. */
export function initializeModels(target: Target, timeoutMs = 45_000): Promise<ClaudeModel[] | undefined> {
	return new Promise(resolve => {
		let child: ChildProcess;
		try {
			child = target.start(['-p', '--output-format', 'stream-json', '--verbose', '--input-format', 'stream-json', '--no-session-persistence'], undefined);
		} catch {
			resolve(undefined);
			return;
		}
		let done = false;
		const finish = (models: ClaudeModel[] | undefined) => {
			if (done) {
				return;
			}
			done = true;
			clearTimeout(timer);
			// Its input closed, it ends; ended if it does not.
			child.stdin?.end();
			setTimeout(() => { if (child.exitCode === null) { child.kill(); } }, STOP_GRACE_MS).unref?.();
			resolve(models);
		};
		const timer = setTimeout(() => finish(undefined), timeoutMs);
		onJsonLines(child.stdout, message => {
			const response = message.type === 'control_response' ? message.response as { request_id?: unknown; response?: { models?: unknown } } | undefined : undefined;
			if (response?.request_id === INITIALIZE) {
				finish(modelsOfInitialize(response.response?.models));
			}
		});
		child.on('error', () => finish(undefined));
		child.on('close', () => finish(undefined));
		child.stdin?.write(`${JSON.stringify({ type: 'control_request', request_id: INITIALIZE, request: { subtype: 'initialize' } })}\n`);
	});
}

/** The models `/model` lists: `Current model: `Opus 5.5`` and `Available: sonnet, opus, …, or a full model ID.` */
export function parseModels(stdout: string): ClaudeModel[] {
	const current = /Current model:\s*`?([^`(\n]+?)`?\s*(?:\(|$)/m.exec(stdout)?.[1]?.trim();
	const listed = /Available:\s*([^\n]+)/.exec(stdout)?.[1] ?? '';
	const ids = listed.replace(/,?\s*or a full model ID\.?\s*$/i, '').split(',').map(s => s.trim()).filter(id => /^[A-Za-z0-9][A-Za-z0-9._:@+\-[\]]*$/.test(id));
	const titleOf = (id: string) => {
		if (id === 'default') {
			return current ? `Default (${current})` : 'Default';
		}
		const long = /\[1m\]$/i.test(id);
		const base = id.replace(/\[1m\]$/i, '');
		const word = base === 'opusplan' ? 'Opus Plan' : base.charAt(0).toUpperCase() + base.slice(1);
		return long ? `${word} 1M` : word;
	};
	const ordered = ['default', ...ids.filter(id => id !== 'default')];
	return ordered.filter((id, i) => ordered.indexOf(id) === i).map(id => ({ id, title: titleOf(id), family: 'claude' }));
}

/**
 * The models of a Claude Code: those its model picker offers (initialize); from an older one that does not
 * say, the aliases its `/model` lists. Answered by Claude Code itself, nothing used.
 */
export async function fetchModels(target: Target): Promise<ClaudeModel[]> {
	const offered = await initializeModels(target);
	if (offered?.length) {
		return offered;
	}
	try {
		const result = await target.ask(['-p', '/model', '--no-session-persistence']);
		const models = result.code === 0 ? parseModels(result.stdout) : [];
		return models.length > 1 ? models : [{ id: 'default', title: 'Default', family: 'claude' }];
	} catch {
		return [{ id: 'default', title: 'Default', family: 'claude' }];
	}
}
