/*
 * What an agent's tool call is, so that Breezell draws it as its own tool of that kind
 * (vscode.breezell.AgentToolView): the shapes every agent's views take, and the views of Breezell's own tools,
 * whichever agent calls them. Each agent reads its own tools' inputs and results (agents/<agent>/views.ts). Paths stay
 * the agent's; `withUri` adds Breezell's name of a file.
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
	| { kind: 'memories'; query?: string; ids?: string[]; resultType?: 'search' | 'list' | 'open' | 'l0_index'; count?: number }
	/** A tool of one of the user's MCP servers in Breezell: Breezell draws it as its MCP row of that server. */
	| { kind: 'mcp'; server: string; tool: string };

export const VIEW_LIMITS = {
	/** An edit's old and new text, and a new file's content, all of a call together. */
	editChars: 200_000,
	files: 500,
	todos: 50,
} as const;

/** A tool's input or result, as JSON: any value of it. */
export type Input = Record<string, unknown> | undefined;
/** A string with something in it. */
export const nonEmpty = (value: unknown): string | undefined => typeof value === 'string' && value ? value : undefined;
/** A line number or a count (a whole number above none). */
export const positive = (value: unknown): number | undefined => typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : undefined;
/** A JSON object (not an array). */
export const objectOf = (value: unknown): Record<string, unknown> | undefined => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined;

/**
 * Which of Breezell's tools a tool name is, under the name an agent knows it by: Claude Code's
 * `mcp__breezell__<tool>`, Antigravity CLI's `mcp_breezell_<tool>`. Undefined for any other tool.
 */
export function breezellToolOf(name: string): string | undefined {
	return /^mcp__breezell__(.+)$/.exec(name)?.[1] ?? /^mcp_breezell_(.+)$/.exec(name)?.[1];
}

/** Edits within the limit: all of them, or none (the card then shows the file without its diff). */
export function editsWithin(edits: ViewEdit[]): ViewEdit[] | undefined {
	const size = edits.reduce((sum, edit) => sum + edit.oldString.length + edit.newString.length, 0);
	return edits.length && size <= VIEW_LIMITS.editChars ? edits : undefined;
}

/** Replacements as tools write them (`old_string`, `new_string`, `replace_all`). */
export const editsOf = (value: unknown): ViewEdit[] => (Array.isArray(value) ? value : []).flatMap(item => {
	const e = objectOf(item);
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

/**
 * A call of one of Breezell's own tools (`breezell`: its name, breezellToolOf), from its input: Breezell's memory
 * lookup, its edits and new files, its terminal. Undefined for its other tools, which have no view of their own.
 */
export function breezellToolView(breezell: string | undefined, input: Input): ToolView | undefined {
	const i = input ?? {};
	switch (breezell) {
		case 'memories_recall': {
			const ids = Array.isArray(i.ids) ? i.ids.filter((id): id is string => typeof id === 'string' && !!id).slice(0, 8) : typeof i.ids === 'string' ? i.ids.split(/[\s,]+/).filter(Boolean).slice(0, 8) : [];
			return { kind: 'memories', ...(nonEmpty(i.query) ? { query: nonEmpty(i.query) } : {}), ...(ids.length ? { ids } : {}) };
		}
		case 'edit_file': {
			const file = nonEmpty(i.uri) ?? nonEmpty(i.file_path) ?? nonEmpty(i.notebook_path);
			const edits = editsWithin(editsOf(Array.isArray(i.edits) && i.edits.length ? i.edits : [i]));
			return file ? { kind: 'edit', path: file, ...(edits ? { edits } : {}) } : undefined;
		}
		case 'write_to_file': {
			const file = nonEmpty(i.uri) ?? nonEmpty(i.file_path) ?? nonEmpty(i.notebook_path);
			const content = typeof i.content === 'string' && i.content.length <= VIEW_LIMITS.editChars ? i.content : undefined;
			return file ? { kind: 'create', path: file, ...(content !== undefined ? { content } : {}) } : undefined;
		}
		case 'run_terminal_cmd': {
			const command = nonEmpty(i.command);
			const description = nonEmpty(i.explanation);
			return command ? { kind: 'command', command, ...(description ? { description } : {}), ...(i.background === true || i.block_until_ms === 0 || i.purpose === 'serve' ? { background: true } : {}) } : undefined;
		}
		default:
			return undefined;
	}
}

/** The view with its file named as Breezell opens it (`uriOf` the path), when it names one. */
export function withUri(view: ToolView | undefined, uriOf: (path: string) => string | undefined): ToolView | undefined {
	if (!view || (view.kind !== 'read' && view.kind !== 'edit' && view.kind !== 'create' && view.kind !== 'list')) {
		return view;
	}
	const uri = uriOf(view.path);
	return uri ? { ...view, uri } : view;
}

/** A memory lookup's view once it returned: what kind of result and how many, as the call came to them (BreezellToolHost.recalled). */
export function memoriesViewOf(view: ToolView | undefined, recalled: { readonly resultType?: string; readonly count?: number } | undefined): ToolView | undefined {
	if (view?.kind !== 'memories' || !recalled) {
		return view;
	}
	const kind = recalled.resultType;
	return { ...view, ...(kind === 'search' || kind === 'list' || kind === 'open' || kind === 'l0_index' ? { resultType: kind } : {}), ...(typeof recalled.count === 'number' ? { count: recalled.count } : {}) };
}
