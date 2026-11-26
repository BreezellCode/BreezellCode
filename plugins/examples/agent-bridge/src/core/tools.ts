/*
 * Breezell's own tools as an agent's MCP server ("breezell"): which of them an agent is offered and what it is
 * told of each, and the answers to its MCP requests (initialize, tools/list, tools/call). The same for every
 * agent; how the messages travel is the agent's: Claude Code's stdio control channel (its mcp_message requests),
 * Antigravity CLI's own MCP connection to this plugin (mcpHttp.ts).
 */
import type { BreezellTool, BreezellToolResult, TurnControls } from './turn';
import type { ToolView } from './views';

/** The MCP server this plugin hosts for an agent in a turn (its tools are Breezell's). */
export const BREEZELL_MCP_SERVER = 'breezell';

/** What an agent is told of Breezell's tools (a description of each; their parameters come from Breezell). */
export const BREEZELL_TOOL_DESCRIPTIONS: Readonly<Record<string, string>> = {
	memories_recall: 'Look up what Breezell remembers for this user and project: notes and decisions from earlier conversations, lessons learned, records of past runs. Use it when earlier work may bear on the task (conventions, past fixes, what the user asked for before). A lookup lists matches by title with their ids; open the ones you need in full with ids.',
	run_terminal_cmd: 'Run a shell command in Breezell\'s terminal, the one the user watches: it shows the command and its output as it runs, and the user can open the terminal or stop the command. This is the only way to run shell commands here: use it for builds, tests, git, scripts and servers. Write each command for the shell named below. It starts in the project folder; prepend a cd to run elsewhere. A command still running after block_until_ms (default 30 s, longer while it keeps printing) moves to the background and the result says so with its terminal id: check on it or stop it with await, or go on with other work. Start servers and watchers (dev servers, npm run dev / start, watch modes) with purpose "serve" and no block_until_ms: they go to the background at once and the result shows their startup output (the address); never wait on one for it to end. When a background command ends, Breezell tells you in a later message.',
	await: 'Wait on a command that run_terminal_cmd moved to the background (task_id: its terminal id). Returns when the command ends, when its output matches pattern, or after block_until_ms, with what it printed. stop: true stops the command instead.',
	edit_file: 'Change a file through Breezell, the user\'s editor: the change shows there for the user to keep or undo, and the result lists the problems (lint and type errors) the file has afterwards. This is the only way to change an existing file here. Replace old_string with new_string: exact text from the file, its indentation included, that matches once (or set replace_all). For several changes to one file, pass them in edits[], applied in order, all or none. uri: the file\'s full path, with forward slashes.',
	write_to_file: 'Create a new file through Breezell, the user\'s editor, with its whole content: the user can keep or undo it there, and the result lists the problems the file has. It does not replace a file that exists: change those with edit_file. uri: the file\'s full path, with forward slashes.',
	// Breezell's language tools: its language servers, as the user's editor has them (a tree-sitter index for a language
	// with no server, or one still starting). Read-only, in every mode.
	read_lint_errors: 'The problems the user\'s editor reports for a file now (type errors, lint errors and warnings from Breezell\'s language servers and linters), as the user sees them. uri: the file\'s full path, with forward slashes.',
	find_symbol: 'Find classes, functions, methods, types, variables and other symbols by name across the project, through Breezell\'s language servers: a fuzzy match on the name (kind_filter narrows it, e.g. "Function" or "Class,Interface"). Each result gives its file, line and container. Use it before a text search when you look for something by its name.',
	breezell_lsp_find_definition: 'Where a symbol is defined, through Breezell\'s language servers, as the editor\'s Go to Definition finds it: give a file where the symbol is used and its name, and line when the name appears more than once in that file. Use it instead of searching for the definition by text.',
	breezell_lsp_find_references: 'Every place a symbol is used, through Breezell\'s language servers, as the editor\'s Find All References lists them: give a file where the symbol is used or defined and its name, and line when the name appears more than once there. Real references only, not text matches of the name; include_declaration: false leaves the declaration out.',
	breezell_lsp_call_hierarchy: 'What calls a function or method and what it calls, through Breezell\'s language servers: direction incoming, outgoing or both; depth 2 or 3 follows the callers of its callers in one call. Use it to see what a change would reach.',
	breezell_lsp_hover: 'A symbol\'s type and documentation, as the editor shows them on hover, through Breezell\'s language servers: give a file where it appears and its name, and line when the name appears more than once there.',
};

/** Breezell's language tools (its language servers): read-only, so they run without asking. */
export const LANGUAGE_TOOLS = ['read_lint_errors', 'find_symbol', 'breezell_lsp_find_definition', 'breezell_lsp_find_references', 'breezell_lsp_call_hierarchy', 'breezell_lsp_hover'];
/**
 * Breezell's tools an agent loads at the start, not behind a tool search of its own: with its own shell and edits
 * off, the model must see what it has instead (without it, it tried its own and worked around the refusal).
 */
export const EAGER_BREEZELL_TOOLS: ReadonlySet<string> = new Set(['run_terminal_cmd', 'await', 'edit_file', 'write_to_file', ...LANGUAGE_TOOLS]);
/** Breezell's tools that run without asking: a lookup, a wait, its language tools. A command is asked about as Breezell's own are. */
export const UNASKED_BREEZELL_TOOLS: ReadonlySet<string> = new Set(['memories_recall', 'await', ...LANGUAGE_TOOLS]);

/** What an agent is told of a Breezell tool: its description, and for run_terminal_cmd the shell its commands run in. */
export const descriptionOf = (tool: { readonly name: string; readonly shell?: string }): string => tool.name === 'run_terminal_cmd' && tool.shell
	? `${BREEZELL_TOOL_DESCRIPTIONS[tool.name]} Commands run in: ${tool.shell.slice(0, 200)}.`
	: BREEZELL_TOOL_DESCRIPTIONS[tool.name];

/** Which of Breezell's auto-approve settings decides a call of one of Breezell's tools. */
export function breezellToolKind(name: string): 'edit' | 'command' | 'other' {
	return name === 'edit_file' || name === 'write_to_file' ? 'edit' : name === 'run_terminal_cmd' ? 'command' : 'other';
}

/**
 * The name an agent knows a tool of one of the user's MCP servers in Breezell by, under this plugin's server: the
 * server's and the tool's names, kept to what a tool name may hold and to 64 characters with the agent's prefix
 * (Claude Code's mcp__breezell__ is the longest), cut short with a hash of the whole when longer, so that two never meet.
 */
export function mcpToolNameOf(server: string, tool: string): string {
	const plain = (text: string) => text.replace(/[^A-Za-z0-9_-]+/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '') || 'x';
	const name = `${plain(server)}__${plain(tool)}`;
	const room = 64 - `mcp__${BREEZELL_MCP_SERVER}__`.length;
	if (name.length <= room && name === `${server}__${tool}`) {
		return name;
	}
	let hash = 0;
	for (const char of `${server}\n${tool}`) {
		hash = (Math.imul(hash, 31) + char.charCodeAt(0)) | 0;
	}
	const tag = (hash >>> 0).toString(36);
	return `${name.slice(0, room - tag.length - 1)}_${tag}`;
}

/**
 * The tools of the user's MCP servers in Breezell offered in a turn, by the name the agent knows each by under this
 * plugin's server (`nameOf` the name mcpToolNameOf gives it): each is drawn as Breezell's MCP row of its server.
 */
export function mcpToolViews(controls: TurnControls | undefined, nameOf: (name: string) => string): ReadonlyMap<string, Extract<ToolView, { kind: 'mcp' }>> {
	const listed = controls?.callBreezellTool ? controls.breezellTools ?? [] : [];
	return new Map(listed.filter(tool => tool.mcpServer && tool.mcpTool).map(tool => [nameOf(mcpToolNameOf(tool.mcpServer!, tool.mcpTool!)), { kind: 'mcp' as const, server: tool.mcpServer!, tool: tool.mcpTool! }]));
}

/**
 * Commands that start a server or a watcher, as Breezell tells them (its localDevServerUrls.ts): they do not end by
 * themselves, so a fixed wait on one only holds the turn up.
 */
export const SERVER_COMMAND = /(?:\b(?:npm|pnpm|yarn|bun)\s+(?:run\s+)?[^\s;&|]*(?:dev|start|serve|preview)[^\s;&|]*\b|\b(?:vite|next\s+dev|astro\s+dev|ng\s+serve|webpack(?:-dev-server)?|react-scripts\s+start|http-server|uvicorn|hypercorn|flask\s+run|rails\s+server)\b|\bpython(?:3)?(?:\.exe)?\s+-m\s+http\.server\b|\bphp\s+-S\b|\b(?:dotnet|cargo|go)\s+run\b)/i;

/**
 * A command call as Breezell's terminal gets it. A server or watcher is never held for a wait the agent named: started
 * as one (purpose "serve", background), it goes to the background at once; one that only looks like a server gets
 * Breezell's own wait, which ends as soon as the server shows it is up (and a build that only looks like one still
 * runs to its end, or to the background when it takes long). Anything else is passed as it is.
 */
export function terminalInputOf(input: Record<string, unknown>): Record<string, unknown> {
	const wait = input.block_until_ms;
	if (typeof wait !== 'number' || wait <= 0) {
		return input;
	}
	const startsServer = input.purpose === 'serve' || input.background === true;
	const looksLikeServer = typeof input.command === 'string' && SERVER_COMMAND.test(input.command) && input.purpose !== 'verify';
	if (!startsServer && !looksLikeServer) {
		return input;
	}
	const { block_until_ms: _dropped, ...rest } = input;
	return rest;
}

/** The longest a wait on a server in the background holds the turn: it never ends, so waiting for its end only blocks. */
export const SERVER_AWAIT_MAX_MS = 30_000;

/** A wait (await) on a server running in the background (`servers`: their task ids): at most SERVER_AWAIT_MAX_MS, unless it waits for some output (pattern) or stops it. */
export function awaitInputOf(input: Record<string, unknown>, servers: ReadonlySet<string>): Record<string, unknown> {
	const wait = input.block_until_ms;
	if (typeof input.task_id !== 'string' || !servers.has(input.task_id) || input.stop === true || (typeof input.pattern === 'string' && input.pattern) || (typeof wait === 'number' && wait <= SERVER_AWAIT_MAX_MS)) {
		return input;
	}
	return { ...input, block_until_ms: SERVER_AWAIT_MAX_MS };
}

/** A tool of this plugin's own beside Breezell's, for an agent that has no tool of its own for it (Breezell's question card, its plan card). */
export interface OwnTool {
	readonly name: string;
	readonly description: string;
	readonly inputSchema: unknown;
	run(input: Record<string, unknown>, callId: string | undefined): PromiseLike<BreezellToolResult>;
}

export interface ToolHostOptions {
	/** A path the agent names, as Breezell's tools take it (TurnFiles.toolPathOf): their `uri` is the agent's spelling otherwise. */
	readonly toolPathOf?: (path: string) => string | undefined;
	/** Tools of this plugin's own for this agent, listed after Breezell's. */
	readonly own?: readonly OwnTool[];
	/** What tools/list says of a Breezell tool beyond its name, description and schema (Claude Code: load it at the start). */
	readonly listed?: (name: string, eager: boolean) => Record<string, unknown> | undefined;
	/** The agent's own id of the call an MCP request is for (its tool event's id), from the request's parameters. */
	readonly callIdOf: (params: Record<string, unknown> | undefined) => string | undefined;
	/**
	 * Asked before a call that changes something, runs a command or uses one of the user's MCP servers: Breezell's
	 * approval card. For an agent that does not ask itself (Antigravity CLI); Claude Code asks first (can_use_tool).
	 */
	readonly approve?: (call: { readonly name: string; readonly input: Record<string, unknown>; readonly callId?: string; readonly kind: 'edit' | 'command' | 'other'; readonly mcp?: { readonly server: string; readonly tool: string } }) => PromiseLike<boolean>;
}

type Rpc = { id?: unknown; method?: unknown; params?: Record<string, unknown> & { name?: unknown; arguments?: unknown; protocolVersion?: unknown } };

export interface BreezellToolHost {
	/** Breezell's tools offered (those it tells the agent of). */
	readonly offered: readonly BreezellTool[];
	/** The tools of the user's MCP servers in Breezell, by the name the agent knows them by (mcpToolNameOf). */
	readonly mcpOffered: ReadonlyMap<string, BreezellTool>;
	/** Every name it lists, Breezell's, the MCP servers' and its own. */
	readonly names: readonly string[];
	/** What tools/list answers: every tool it offers, as the agent is told of it (an agent kept between turns keeps the list it got). */
	listTools(): unknown[];
	/** The JSON-RPC answer to one MCP message (a notification's is an empty result). */
	answer(rpc: Rpc): Promise<unknown>;
	/** What a memory lookup with this input came to (its row's kind and count). */
	recalled(input: unknown): { resultType?: string; count?: number } | undefined;
}

/** The user did not allow it, as the agent's model is told. */
export const NOT_ALLOWED = 'The user did not allow this in Breezell.';

/** Breezell's tools of a turn, as the MCP server this plugin hosts for the agent. */
export function createBreezellToolHost(controls: TurnControls | undefined, options: ToolHostOptions): BreezellToolHost {
	const listed = controls?.callBreezellTool ? controls.breezellTools ?? [] : [];
	const offered = listed.filter(tool => BREEZELL_TOOL_DESCRIPTIONS[tool.name]);
	// The tools of the user's MCP servers in Breezell, under this plugin's server: Breezell runs them with its own
	// connections. Not loaded at the start: the agent finds them as its own servers' tools.
	const mcpOffered = new Map(listed.filter(tool => tool.mcpServer && tool.mcpTool).map(tool => [mcpToolNameOf(tool.mcpServer!, tool.mcpTool!), tool] as const));
	const own = options.own ?? [];
	const recalled = new Map<string, { resultType?: string; count?: number }>();
	/** The servers it started in Breezell's terminal this turn, by task id (awaitInputOf). */
	const servers = new Set<string>();
	const result = (ran: { text?: string; isError?: boolean }) => ({ content: [{ type: 'text', text: ran.text || '(nothing)' }], ...(ran.isError ? { isError: true } : {}) });
	const failed = (error: unknown) => ({ text: String((error as Error)?.message ?? error), isError: true });
	const call = async (name: string, input: Record<string, unknown>, params: Rpc['params']): Promise<unknown> => {
		const callId = options.callIdOf(params);
		const ownTool = own.find(tool => tool.name === name);
		if (ownTool) {
			return result(await Promise.resolve(ownTool.run(input, callId)).then(r => r, failed));
		}
		const mcpTool = mcpOffered.get(name);
		const breezellTool = offered.find(tool => tool.name === name);
		if ((!breezellTool && !mcpTool) || !controls?.callBreezellTool) {
			return result({ text: `No tool named ${name}.`, isError: true });
		}
		if (options.approve && (mcpTool || !UNASKED_BREEZELL_TOOLS.has(name))) {
			const allowed = await Promise.resolve(options.approve({ name, input, ...(callId ? { callId } : {}), kind: mcpTool ? 'other' : breezellToolKind(name), ...(mcpTool ? { mcp: { server: mcpTool.mcpServer!, tool: mcpTool.mcpTool! } } : {}) })).then(ok => ok, () => false);
			if (!allowed) {
				return result({ text: NOT_ALLOWED, isError: true });
			}
		}
		if (mcpTool) {
			return result(await Promise.resolve(controls.callBreezellTool(mcpTool.name, input, callId)).then(r => r, failed));
		}
		const placed = typeof input.uri === 'string' && options.toolPathOf ? options.toolPathOf(input.uri) : undefined;
		const named = placed ? { ...input, uri: placed } : input;
		const sent = name === 'run_terminal_cmd' ? terminalInputOf(named) : name === 'await' ? awaitInputOf(named, servers) : named;
		const ran = await Promise.resolve(controls.callBreezellTool(name, sent, callId)).then(r => r, failed);
		// A memory lookup's row says what it came to; no other call's input is kept (an edit's or a new file's is large).
		if (name === 'memories_recall') {
			recalled.set(JSON.stringify(input), { resultType: (ran as BreezellToolResult).resultType, count: (ran as BreezellToolResult).count });
		}
		// A server it started, now in the background: its task id, for its waits (awaitInputOf).
		const backgroundTask = name === 'run_terminal_cmd' && (sent.purpose === 'serve' || sent.background === true || (typeof sent.command === 'string' && SERVER_COMMAND.test(sent.command))) ? /task_id:\s*([\w.-]+)/.exec(ran.text ?? '')?.[1] : undefined;
		if (backgroundTask) {
			servers.add(backgroundTask);
		}
		return result(ran);
	};
	const listTools = () => [
		...offered.map(tool => ({ name: tool.name, description: descriptionOf(tool), inputSchema: tool.inputSchema, ...options.listed?.(tool.name, EAGER_BREEZELL_TOOLS.has(tool.name)) })),
		...[...mcpOffered].map(([name, tool]) => ({ name, description: `${tool.description?.trim() || tool.mcpTool}\n\n(Tool "${tool.mcpTool}" of the user's MCP server "${tool.mcpServer}" in Breezell.)`, inputSchema: tool.inputSchema })),
		...own.map(tool => ({ name: tool.name, description: tool.description, inputSchema: tool.inputSchema, ...options.listed?.(tool.name, true) })),
	];
	return {
		offered,
		mcpOffered,
		names: [...offered.map(tool => tool.name), ...mcpOffered.keys(), ...own.map(tool => tool.name)],
		listTools,
		recalled: input => recalled.get(JSON.stringify(input ?? {})),
		answer: async rpc => {
			const reply = (value: unknown) => ({ jsonrpc: '2.0', id: rpc.id ?? null, result: value });
			switch (rpc.method) {
				case 'initialize':
					return reply({ protocolVersion: typeof rpc.params?.protocolVersion === 'string' ? rpc.params.protocolVersion : '2025-06-18', capabilities: { tools: {} }, serverInfo: { name: BREEZELL_MCP_SERVER, version: '1.0.0' } });
				case 'tools/list':
					return reply({ tools: listTools() });
				case 'tools/call': {
					const name = typeof rpc.params?.name === 'string' ? rpc.params.name : '';
					const input = rpc.params?.arguments && typeof rpc.params.arguments === 'object' ? rpc.params.arguments as Record<string, unknown> : {};
					return reply(await call(name, input, rpc.params));
				}
				default:
					// A notification is answered with an empty result; a request it does not know, with an error.
					return rpc.id === undefined ? reply({}) : { jsonrpc: '2.0', id: rpc.id, error: { code: -32601, message: `Method not found: ${String(rpc.method)}` } };
			}
		},
	};
}
