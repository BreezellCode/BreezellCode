/*
 * What each of Claude Code's tool calls is, so Breezell draws it as its own tool of that kind
 * (vscode.breezell.AgentToolView): from its input while it runs, completed from Claude Code's structured
 * result (`tool_use_result` in its stream-json, `toolUseResult` in its session files) once done. Shapes
 * as Claude Code 2.1.330 writes them. Paths stay Claude Code's; `withUri` adds Breezell's name of a file.
 */

/** One replacement in a file, as Breezell's edit card draws it. */
export interface ViewEdit {
	oldString: string;
	newString: string;
	replaceAll?: boolean;
}

/** A tool call's view; the same shape as vscode.breezell.AgentToolView. */
export type ToolView =
	| { kind: 'read'; path: string; uri?: string; startLine?: number; endLine?: number; totalLines?: number }
	| { kind: 'edit'; path: string; uri?: string; edits?: ViewEdit[] }
	| { kind: 'create'; path: string; uri?: string; content?: string }
	| { kind: 'command'; command: string; description?: string; background?: boolean; output?: string }
	| { kind: 'search'; query: string; path?: string }
	| { kind: 'files'; pattern: string; files?: string[] }
	| { kind: 'list'; path: string; uri?: string }
	| { kind: 'fetch'; url: string }
	| { kind: 'webSearch'; query: string }
	| { kind: 'todos'; items: { text: string; status: 'pending' | 'in_progress' | 'completed' }[] }
	| { kind: 'subagent'; description: string; prompt?: string; agentType?: string; step?: string; report?: string; background?: boolean; stopped?: boolean; model?: string }
	| { kind: 'memories'; query?: string; ids?: string[]; resultType?: 'search' | 'list' | 'open' | 'l0_index'; count?: number };

/** Breezell's memory lookup as Claude Code names it: a tool of the "breezell" server the plugin hosts (agent.ts). */
export const BREEZELL_MEMORY_TOOL = 'mcp__breezell__memories_recall';
/** Breezell's terminal tool as Claude Code names it: a command, as its own Bash is. */
export const BREEZELL_TERMINAL_TOOL = 'mcp__breezell__run_terminal_cmd';
/** Breezell's edit tools as Claude Code names them: a change and a new file, as its own Edit and Write are. */
export const BREEZELL_EDIT_TOOL = 'mcp__breezell__edit_file';
export const BREEZELL_WRITE_TOOL = 'mcp__breezell__write_to_file';

export const VIEW_LIMITS = {
	/** An edit's old and new text, and a new file's content, all of a call together. */
	editChars: 200_000,
	files: 500,
	todos: 50,
} as const;

/** Claude Code's own steps that are no action of the user's concern: looking up its tools. Not shown. */
export const UNSHOWN_TOOLS: ReadonlySet<string> = new Set(['ToolSearch']);

/** Claude Code's tool that starts a subagent (called Task before 2.1). */
export const isSubagentTool = (name: string): boolean => name === 'Agent' || name === 'Task';

type Input = Record<string, unknown> | undefined;
const str = (value: unknown): string | undefined => typeof value === 'string' && value ? value : undefined;
const num = (value: unknown): number | undefined => typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : undefined;
const record = (value: unknown): Record<string, unknown> | undefined => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined;

/** Edits within the limit: all of them, or none (the card then shows the file without its diff). */
function editsWithin(edits: ViewEdit[]): ViewEdit[] | undefined {
	const size = edits.reduce((sum, edit) => sum + edit.oldString.length + edit.newString.length, 0);
	return edits.length && size <= VIEW_LIMITS.editChars ? edits : undefined;
}

const editsOf = (value: unknown): ViewEdit[] => (Array.isArray(value) ? value : []).flatMap(item => {
	const e = record(item);
	const oldString = e?.old_string;
	const newString = e?.new_string;
	return typeof oldString === 'string' && typeof newString === 'string' ? [{ oldString, newString, ...(e?.replace_all === true ? { replaceAll: true } : {}) }] : [];
});

/** The one place two texts differ, in whole lines; a line beside an insertion or removal says where it is. */
export function changedLines(before: string, after: string): ViewEdit | undefined {
	if (before === after) {
		return undefined;
	}
	const a = before.split('\n');
	const b = after.split('\n');
	let start = 0;
	while (start < a.length && start < b.length && a[start] === b[start]) {
		start++;
	}
	let end = 0;
	while (end < a.length - start && end < b.length - start && a[a.length - 1 - end] === b[b.length - 1 - end]) {
		end++;
	}
	const oldLines = a.slice(start, a.length - end);
	const newLines = b.slice(start, b.length - end);
	if (!oldLines.length || !newLines.length) {
		if (start > 0) {
			return { oldString: [a[start - 1], ...oldLines].join('\n'), newString: [b[start - 1], ...newLines].join('\n') };
		}
		if (end > 0) {
			return { oldString: [...oldLines, a[a.length - end]].join('\n'), newString: [...newLines, b[b.length - end]].join('\n') };
		}
	}
	return { oldString: oldLines.join('\n'), newString: newLines.join('\n') };
}

const todosOf = (value: unknown): ToolView | undefined => {
	const items = (Array.isArray(value) ? value : []).slice(0, VIEW_LIMITS.todos).flatMap(item => {
		const r = record(item);
		const text = str(r?.content);
		const status = r?.status === 'pending' || r?.status === 'in_progress' || r?.status === 'completed' ? r.status as 'pending' | 'in_progress' | 'completed' : undefined;
		return text && status ? [{ text, status }] : [];
	});
	return items.length ? { kind: 'todos', items } : undefined;
};

/** What a call is from its input alone: while it runs, when it is asked about, and when its result says nothing more. */
export function viewOfUse(name: string, input: Input): ToolView | undefined {
	const i = input ?? {};
	const path = str(i.file_path) ?? str(i.notebook_path);
	if (name === BREEZELL_MEMORY_TOOL) {
		const ids = Array.isArray(i.ids) ? i.ids.filter((id): id is string => typeof id === 'string' && !!id).slice(0, 8) : typeof i.ids === 'string' ? i.ids.split(/[\s,]+/).filter(Boolean).slice(0, 8) : [];
		return { kind: 'memories', ...(str(i.query) ? { query: str(i.query) } : {}), ...(ids.length ? { ids } : {}) };
	}
	if (name === BREEZELL_EDIT_TOOL) {
		const file = str(i.uri) ?? path;
		const edits = editsWithin(editsOf(Array.isArray(i.edits) && i.edits.length ? i.edits : [i]));
		return file ? { kind: 'edit', path: file, ...(edits ? { edits } : {}) } : undefined;
	}
	if (name === BREEZELL_WRITE_TOOL) {
		const file = str(i.uri) ?? path;
		const content = typeof i.content === 'string' && i.content.length <= VIEW_LIMITS.editChars ? i.content : undefined;
		return file ? { kind: 'create', path: file, ...(content !== undefined ? { content } : {}) } : undefined;
	}
	if (name === BREEZELL_TERMINAL_TOOL) {
		const command = str(i.command);
		const description = str(i.explanation);
		return command ? { kind: 'command', command, ...(description ? { description } : {}), ...(i.background === true || i.block_until_ms === 0 || i.purpose === 'serve' ? { background: true } : {}) } : undefined;
	}
	switch (name) {
		case 'Read': {
			const offset = num(i.offset);
			const limit = num(i.limit);
			return path ? { kind: 'read', path, ...(offset ? { startLine: offset } : {}), ...(offset && limit ? { endLine: offset + limit - 1 } : {}) } : undefined;
		}
		case 'Edit': {
			const edits = editsWithin(editsOf([i]));
			return path ? { kind: 'edit', path, ...(edits ? { edits } : {}) } : undefined;
		}
		case 'MultiEdit': {
			const edits = editsWithin(editsOf(i.edits));
			return path ? { kind: 'edit', path, ...(edits ? { edits } : {}) } : undefined;
		}
		case 'NotebookEdit':
			return path ? { kind: 'edit', path } : undefined;
		case 'Write': {
			// A new file until its result says it was there (or the caller knows it is: viewOfWrite).
			const content = typeof i.content === 'string' && i.content.length <= VIEW_LIMITS.editChars ? i.content : undefined;
			return path ? { kind: 'create', path, ...(content !== undefined ? { content } : {}) } : undefined;
		}
		case 'Bash': {
			const command = str(i.command);
			const description = str(i.description);
			return command ? { kind: 'command', command, ...(description ? { description } : {}), ...(i.run_in_background === true ? { background: true } : {}) } : undefined;
		}
		case 'Grep': {
			const query = str(i.pattern);
			const where = str(i.path);
			return query ? { kind: 'search', query, ...(where ? { path: where } : {}) } : undefined;
		}
		case 'Glob': {
			const pattern = str(i.pattern);
			return pattern ? { kind: 'files', pattern } : undefined;
		}
		case 'LS': {
			const where = str(i.path);
			return where ? { kind: 'list', path: where } : undefined;
		}
		case 'WebFetch': {
			const url = str(i.url);
			return url ? { kind: 'fetch', url } : undefined;
		}
		case 'WebSearch': {
			const query = str(i.query);
			return query ? { kind: 'webSearch', query } : undefined;
		}
		case 'TodoWrite':
			return todosOf(i.todos);
	}
	if (isSubagentTool(name)) {
		const description = str(i.description);
		const prompt = str(i.prompt);
		const agentType = str(i.subagent_type);
		return description ? { kind: 'subagent', description, ...(prompt ? { prompt } : {}), ...(agentType ? { agentType } : {}), ...(i.run_in_background === true ? { background: true } : {}) } : undefined;
	}
	return undefined;
}

/** A Write of a file that is there already (`before`, its text now): an edit of it, not a new file. */
export function viewOfWrite(input: Input, before: string | undefined): ToolView | undefined {
	const used = viewOfUse('Write', input);
	if (before === undefined || used?.kind !== 'create') {
		return used;
	}
	const change = used.content !== undefined ? changedLines(before, used.content) : undefined;
	const edits = change ? editsWithin([change]) : undefined;
	return { kind: 'edit', path: used.path, ...(edits ? { edits } : {}) };
}

/** What a finished call was: its input's view, completed from Claude Code's structured result. */
export function viewOfResult(name: string, input: Input, result: unknown): ToolView | undefined {
	const used = viewOfUse(name, input);
	const r = record(result);
	if (!r) {
		return used;
	}
	switch (name) {
		case 'Read': {
			const file = record(r.file);
			const path = str(file?.filePath) ?? (used?.kind === 'read' ? used.path : undefined);
			const startLine = num(file?.startLine);
			const lines = num(file?.numLines);
			const totalLines = num(file?.totalLines);
			return path ? { kind: 'read', path, ...(startLine ? { startLine } : {}), ...(startLine && lines ? { endLine: startLine + lines - 1 } : {}), ...(totalLines ? { totalLines } : {}) } : used;
		}
		case 'Edit': case 'MultiEdit': {
			const path = str(r.filePath) ?? (used?.kind === 'edit' ? used.path : undefined);
			// Its own record of what it replaced, else what it was asked to.
			const recorded = name === 'Edit' ? editsOf([{ old_string: r.oldString, new_string: r.newString, replace_all: r.replaceAll }]) : editsOf(r.edits);
			const edits = editsWithin(recorded.length ? recorded : used?.kind === 'edit' ? used.edits ?? [] : []);
			return path ? { kind: 'edit', path, ...(edits ? { edits } : {}) } : used;
		}
		case 'Write': {
			const path = str(r.filePath) ?? (used?.kind === 'create' ? used.path : undefined);
			const content = typeof r.content === 'string' ? r.content : typeof input?.content === 'string' ? input.content : undefined;
			if (!path) {
				return used;
			}
			if (r.type === 'create' || r.originalFile === null) {
				return { kind: 'create', path, ...(content !== undefined && content.length <= VIEW_LIMITS.editChars ? { content } : {}) };
			}
			const change = typeof r.originalFile === 'string' && content !== undefined ? changedLines(r.originalFile, content) : undefined;
			const edits = change ? editsWithin([change]) : undefined;
			return { kind: 'edit', path, ...(edits ? { edits } : {}) };
		}
		case 'Bash': {
			const output = [str(r.stdout), str(r.stderr)].filter(Boolean).join('\n');
			return used?.kind === 'command' ? { ...used, ...(output ? { output } : {}) } : used;
		}
		case 'Glob': {
			const files = Array.isArray(r.filenames) ? r.filenames.filter((f): f is string => typeof f === 'string').slice(0, VIEW_LIMITS.files) : undefined;
			return used?.kind === 'files' ? { ...used, ...(files ? { files } : {}) } : used;
		}
		case 'TodoWrite':
			return todosOf(r.newTodos) ?? used;
	}
	if (isSubagentTool(name) && used?.kind === 'subagent') {
		const report = (Array.isArray(r.content) ? r.content : []).map(part => str(record(part)?.text)).filter(Boolean).join('\n');
		return { ...used, ...(report ? { report } : {}) };
	}
	return used;
}

/** The view with its file named as Breezell opens it (`uriOf` the path), when it names one. */
export function withUri(view: ToolView | undefined, uriOf: (path: string) => string | undefined): ToolView | undefined {
	if (!view || (view.kind !== 'read' && view.kind !== 'edit' && view.kind !== 'create' && view.kind !== 'list')) {
		return view;
	}
	const uri = uriOf(view.path);
	return uri ? { ...view, uri } : view;
}

/**
 * A tool call's input while Claude Code is still writing it (its stream's input_json_delta pieces): the JSON so
 * far, closed where it stops (an unfinished string, object or array, a key not yet given its value). Undefined
 * while nothing of it reads yet.
 */
export function partialInput(json: string): Record<string, unknown> | undefined {
	let inString = false;
	let escaped = false;
	const closers: string[] = [];
	for (const ch of json) {
		if (inString) {
			if (escaped) {
				escaped = false;
			} else if (ch === '\\') {
				escaped = true;
			} else if (ch === '"') {
				inString = false;
			}
			continue;
		}
		if (ch === '"') {
			inString = true;
		} else if (ch === '{') {
			closers.push('}');
		} else if (ch === '[') {
			closers.push(']');
		} else if (ch === '}' || ch === ']') {
			closers.pop();
		}
	}
	let text = json;
	if (inString) {
		// An escape cut in two (\\ or \\u12) is left out until the rest of it comes.
		text = text.replace(/\\u[0-9a-fA-F]{0,3}$/, '').replace(/(^|[^\\])\\$/, '$1') + '"';
	}
	const close = (body: string) => {
		const trimmed = body.replace(/[\s,]+$/, '');
		return (/:\s*$/.test(trimmed) ? `${trimmed}null` : trimmed) + [...closers].reverse().join('');
	};
	// As it is, or without a key still waiting for its colon.
	for (const body of [text, text.replace(/,?\s*"(?:[^"\\]|\\.)*"\s*$/, '')]) {
		try {
			const value = JSON.parse(close(body));
			if (value && typeof value === 'object' && !Array.isArray(value)) {
				return value as Record<string, unknown>;
			}
		} catch {
			// the next way, or not readable yet
		}
	}
	return undefined;
}
