/*
 * What each of Claude Code's tool calls is, so Breezell draws it as its own tool of that kind
 * (vscode.breezell.AgentToolView): from its input while it runs, completed from Claude Code's structured
 * result (`tool_use_result` in its stream-json, `toolUseResult` in its session files) once done. Shapes
 * as Claude Code 2.1.330 writes them. Paths stay Claude Code's; `withUri` adds Breezell's name of a file.
 */
import { breezellToolOf, breezellToolView, changedLines, editsOf, editsWithin, nonEmpty, objectOf, positive, VIEW_LIMITS, type Input, type ToolView } from '../../core/views';

// What the rest of the plugin (and its tests) know from here: the views every agent shares are core/views.ts.
export { breezellToolOf, changedLines, VIEW_LIMITS, withUri, type ToolView, type ViewEdit } from '../../core/views';

/** Breezell's memory lookup as Claude Code names it: a tool of the "breezell" server the plugin hosts (core/tools.ts). */
export const BREEZELL_MEMORY_TOOL = 'mcp__breezell__memories_recall';
/** Breezell's terminal tool as Claude Code names it: a command, as its own Bash is. */
export const BREEZELL_TERMINAL_TOOL = 'mcp__breezell__run_terminal_cmd';
/** Breezell's edit tools as Claude Code names them: a change and a new file, as its own Edit and Write are. */
export const BREEZELL_EDIT_TOOL = 'mcp__breezell__edit_file';
export const BREEZELL_WRITE_TOOL = 'mcp__breezell__write_to_file';

/** Claude Code's own steps that are no action of the user's concern: looking up its tools. Not shown. */
export const UNSHOWN_TOOLS: ReadonlySet<string> = new Set(['ToolSearch']);

/** Claude Code's tool that starts a subagent (called Task before 2.1). */
export const isSubagentTool = (name: string): boolean => name === 'Agent' || name === 'Task';

const todosOf = (value: unknown): ToolView | undefined => {
	const items = (Array.isArray(value) ? value : []).slice(0, VIEW_LIMITS.todos).flatMap(item => {
		const r = objectOf(item);
		const text = nonEmpty(r?.content);
		const status = r?.status === 'pending' || r?.status === 'in_progress' || r?.status === 'completed' ? r.status as 'pending' | 'in_progress' | 'completed' : undefined;
		return text && status ? [{ text, status }] : [];
	});
	return items.length ? { kind: 'todos', items } : undefined;
};

/** What a call is from its input alone: while it runs, when it is asked about, and when its result says nothing more. */
export function viewOfUse(name: string, input: Input): ToolView | undefined {
	const breezell = breezellToolOf(name);
	if (breezell) {
		return breezellToolView(breezell, input);
	}
	const i = input ?? {};
	const path = nonEmpty(i.file_path) ?? nonEmpty(i.notebook_path);
	switch (name) {
		case 'Read': {
			const offset = positive(i.offset);
			const limit = positive(i.limit);
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
			const command = nonEmpty(i.command);
			const description = nonEmpty(i.description);
			return command ? { kind: 'command', command, ...(description ? { description } : {}), ...(i.run_in_background === true ? { background: true } : {}) } : undefined;
		}
		case 'Grep': {
			const query = nonEmpty(i.pattern);
			const where = nonEmpty(i.path);
			return query ? { kind: 'search', query, ...(where ? { path: where } : {}) } : undefined;
		}
		case 'Glob': {
			const pattern = nonEmpty(i.pattern);
			return pattern ? { kind: 'files', pattern } : undefined;
		}
		case 'LS': {
			const where = nonEmpty(i.path);
			return where ? { kind: 'list', path: where } : undefined;
		}
		case 'WebFetch': {
			const url = nonEmpty(i.url);
			return url ? { kind: 'fetch', url } : undefined;
		}
		case 'WebSearch': {
			const query = nonEmpty(i.query);
			return query ? { kind: 'webSearch', query } : undefined;
		}
		case 'TodoWrite':
			return todosOf(i.todos);
	}
	if (isSubagentTool(name)) {
		const description = nonEmpty(i.description);
		const prompt = nonEmpty(i.prompt);
		const agentType = nonEmpty(i.subagent_type);
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
	const r = objectOf(result);
	if (!r) {
		return used;
	}
	switch (name) {
		case 'Read': {
			const file = objectOf(r.file);
			const path = nonEmpty(file?.filePath) ?? (used?.kind === 'read' ? used.path : undefined);
			const startLine = positive(file?.startLine);
			const lines = positive(file?.numLines);
			const totalLines = positive(file?.totalLines);
			return path ? { kind: 'read', path, ...(startLine ? { startLine } : {}), ...(startLine && lines ? { endLine: startLine + lines - 1 } : {}), ...(totalLines ? { totalLines } : {}) } : used;
		}
		case 'Edit': case 'MultiEdit': {
			const path = nonEmpty(r.filePath) ?? (used?.kind === 'edit' ? used.path : undefined);
			// Its own record of what it replaced, else what it was asked to.
			const recorded = name === 'Edit' ? editsOf([{ old_string: r.oldString, new_string: r.newString, replace_all: r.replaceAll }]) : editsOf(r.edits);
			const edits = editsWithin(recorded.length ? recorded : used?.kind === 'edit' ? used.edits ?? [] : []);
			return path ? { kind: 'edit', path, ...(edits ? { edits } : {}) } : used;
		}
		case 'Write': {
			const path = nonEmpty(r.filePath) ?? (used?.kind === 'create' ? used.path : undefined);
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
			const output = [nonEmpty(r.stdout), nonEmpty(r.stderr)].filter(Boolean).join('\n');
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
		const report = (Array.isArray(r.content) ? r.content : []).map(part => nonEmpty(objectOf(part)?.text)).filter(Boolean).join('\n');
		return { ...used, ...(report ? { report } : {}) };
	}
	return used;
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
