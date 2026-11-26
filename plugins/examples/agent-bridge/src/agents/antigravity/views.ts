/*
 * What each of Antigravity CLI's tool calls is, as its stream names it (agy 1.5: read_file { Path }, run_command
 * { CommandLine }, write_file { Path }…), so that Breezell draws it as its own tool of that kind. Its calls of
 * Breezell's tools (mcp_breezell_<tool>) are core/views.ts's.
 */
import { breezellToolOf, breezellToolView, nonEmpty, positive, VIEW_LIMITS, type Input, type ToolView } from '../../core/views';
import { firstLine } from '../../core/turn';

/** A value of an Antigravity CLI tool's parameters, under any of these names (it writes them in PascalCase). */
function agyParam(input: Input, ...names: string[]): unknown {
	const i = input ?? {};
	for (const name of names) {
		const key = Object.keys(i).find(k => k.toLowerCase() === name.toLowerCase());
		if (key !== undefined && i[key] !== undefined && i[key] !== null && i[key] !== '') {
			return i[key];
		}
	}
	return undefined;
}

/** What one of agy's own tool calls is, drawn as Breezell's own of that kind; its calls of Breezell's tools as those. */
export function agyViewOfUse(name: string, input: Input): ToolView | undefined {
	const breezell = breezellToolOf(name);
	if (breezell) {
		return breezellToolView(breezell, input);
	}
	const path = nonEmpty(agyParam(input, 'Path', 'AbsolutePath', 'File', 'FilePath', 'TargetFile'));
	switch (name) {
		case 'read_file': case 'view_file': {
			const startLine = positive(agyParam(input, 'StartLine'));
			const endLine = positive(agyParam(input, 'EndLine'));
			return path ? { kind: 'read', path, ...(startLine ? { startLine } : {}), ...(startLine && endLine ? { endLine } : {}) } : undefined;
		}
		case 'write_file': case 'write_to_file': {
			const content = agyParam(input, 'CodeContent', 'Content');
			return path ? { kind: 'create', path, ...(typeof content === 'string' && content.length <= VIEW_LIMITS.editChars ? { content } : {}) } : undefined;
		}
		case 'replace_file_content': case 'multi_replace_file_content': case 'sed_file':
			return path ? { kind: 'edit', path } : undefined;
		case 'run_command': {
			const command = nonEmpty(agyParam(input, 'CommandLine', 'Command'));
			return command ? { kind: 'command', command } : undefined;
		}
		case 'list_dir': {
			const where = nonEmpty(agyParam(input, 'DirectoryPath', 'Path', 'SearchDirectory'));
			return where ? { kind: 'list', path: where } : undefined;
		}
		case 'grep_search': {
			const query = nonEmpty(agyParam(input, 'Query', 'Pattern', 'SearchPattern'));
			const where = nonEmpty(agyParam(input, 'SearchPath', 'SearchDirectory', 'Path'));
			return query ? { kind: 'search', query, ...(where ? { path: where } : {}) } : undefined;
		}
		case 'find_by_name': {
			const pattern = nonEmpty(agyParam(input, 'Pattern', 'Name', 'Query'));
			return pattern ? { kind: 'files', pattern } : undefined;
		}
		case 'read_url_content': case 'read_url': {
			const url = nonEmpty(agyParam(input, 'Url', 'URL'));
			return url ? { kind: 'fetch', url } : undefined;
		}
		case 'search_web': {
			const query = nonEmpty(agyParam(input, 'Query', 'query'));
			return query ? { kind: 'webSearch', query } : undefined;
		}
	}
	return undefined;
}

/** A call as Breezell shows it: one through agy's generic MCP tool (a server's tool not loaded at the start) as that tool. */
export function agyCallOf(name: string, input: Record<string, unknown> | undefined): { name: string; input: Record<string, unknown> | undefined } {
	if (name === 'call_mcp_tool' && typeof input?.ServerName === 'string' && typeof input.ToolName === 'string') {
		return { name: `mcp_${input.ServerName}_${input.ToolName}`, input: input.Arguments && typeof input.Arguments === 'object' ? input.Arguments as Record<string, unknown> : {} };
	}
	return { name, input };
}

/** One line saying what a call does, from what it is: its command, its file, its query, its page. */
export function viewTitleOf(view: ToolView | undefined): string | undefined {
	switch (view?.kind) {
		case 'command': return firstLine(view.command);
		case 'read': case 'edit': case 'create': case 'list': return firstLine(view.path);
		case 'search': case 'webSearch': return firstLine(view.query);
		case 'files': return firstLine(view.pattern);
		case 'fetch': return firstLine(view.url);
		case 'subagent': return firstLine(view.description);
		default: return undefined;
	}
}

/** What a subagent is on, from its call: its row under the lead says it, as Claude Code's subagents' rows say theirs. */
export function agyStepOf(view: ToolView | undefined, name: string): string {
	const base = (file: string) => file.split(/[\\/]/).filter(Boolean).pop() ?? file;
	switch (view?.kind) {
		case 'read': return `Reading ${base(view.path)}`;
		case 'edit': case 'create': return `Editing ${base(view.path)}`;
		case 'list': return `Listing ${base(view.path)}`;
		case 'command': return `Running ${firstLine(view.command, 120) ?? ''}`.trim();
		case 'search': return `Searching for ${firstLine(view.query, 120) ?? ''}`.trim();
		case 'files': return `Finding ${firstLine(view.pattern, 120) ?? ''}`.trim();
		case 'webSearch': return `Searching the web for ${firstLine(view.query, 120) ?? ''}`.trim();
		case 'fetch': return `Fetching ${firstLine(view.url, 120) ?? ''}`.trim();
		default: return name.replace(/^mcp_[^_]+_/, '').replace(/_/g, ' ');
	}
}
