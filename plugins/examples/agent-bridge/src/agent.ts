/*
 * A turn of a Breezell conversation, answered by the user's own Claude Code. It runs in print mode with
 * streamed JSON both ways and asks before a tool runs through its stdio permission channel, as
 * Anthropic's own Agent SDK does (`--permission-prompt-tool=stdio`): each `can_use_tool` request goes
 * to Breezell's approval card and its answer goes back as a `control_response`. The conversation's
 * session goes on with `--resume`. Nothing here reads Claude Code's files or its credentials.
 */
import type { ChildProcess } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type { Target } from './claudeCode';
import { BREEZELL_EDIT_TOOL, BREEZELL_TERMINAL_TOOL, BREEZELL_WRITE_TOOL, isSubagentTool, partialInput, UNSHOWN_TOOLS, viewOfResult, viewOfUse as ownViewOfUse, viewOfWrite, withUri, type ToolView } from './views';

export type Attachment = { readonly name: string; readonly kind: string; readonly path?: string; readonly lines?: readonly [number, number]; readonly text?: string; readonly data?: { readonly mimeType: string; readonly base64: string } };

/** What Breezell gives a turn and takes back (vscode.breezell.AgentTurn / AgentReply, kept plain here for tests). */
export interface Turn {
	readonly model: string;
	readonly text: string;
	/**
	 * What the user attached in Breezell. A file or a folder: its path, Claude Code opens it. A picture or a PDF: its
	 * bytes, sent with the message. Anything else: the text Breezell's own model is given of it (a code selection's
	 * lines, problems, console or terminal output, a quoted message, a skill…). None of these: its name only.
	 */
	readonly attachments: readonly Attachment[];
	/**
	 * Breezell's chat mode, as Claude Code works in it (vscode.breezell.AgentTurn.mode). `plan`: its own plan mode, its
	 * plan shown as Breezell's plan card; `analyze` and `chat`: it reads and answers, with no tool that changes a file or
	 * runs a command. None or `agent`: as it is set up to work.
	 */
	readonly mode?: 'agent' | 'plan' | 'analyze' | 'chat';
	/** Breezell's Manual compress: Claude Code compresses the session's context (/compact), and nothing else. */
	readonly compact?: true;
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
	/**
	 * The user's rules in Breezell for this conversation's project. Without `session`: a new session takes them in its
	 * system prompt (Claude Code keeps them with the session, as it keeps CLAUDE.md; resuming never repeats them). With
	 * `session`: they changed since the session started (`''`: they were removed), told once with this message.
	 */
	readonly rules?: string;
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
	/** What its model requests used (a Breezell newer than 1.4.65): the context ring, Box › Usage, the reply's tokens. */
	usage?(usage: Usage): void;
	/** Claude Code compresses its context (a Breezell newer than 1.4.65): Breezell's "Compressing…", then the ring's new size. */
	compaction?(compaction: { phase: 'started' | 'done' | 'failed'; trigger: 'manual' | 'auto'; preTokens?: number; postTokens?: number }): void;
}

export type ModelUsage = { model: string; inputTokens: number; outputTokens: number; cacheReadTokens: number; cacheWriteTokens: number };
export type Usage = { context?: { tokens: number; window?: number }; models: ModelUsage[] };

/**
 * What Claude Code's result says it used, per model, less what was told before in the same run (`told`, kept up to
 * date): its totals grow when it goes on after a background subagent and ends again.
 */
/**
 * The context size Claude Code's /context reports ("**Tokens:** 30.1k / 1m (3%)"): what the conversation takes of its
 * model's window, without a model request. Undefined when the report does not say it so.
 */
export function contextOfReport(report: unknown): { tokens: number; window: number } | undefined {
	const found = typeof report === 'string' ? /\*\*Tokens:\*\*\s*([\d.,]+)\s*([km]?)\s*\/\s*([\d.,]+)\s*([km]?)/i.exec(report) : null;
	if (!found) {
		return undefined;
	}
	const count = (digits: string, unit: string) => Math.round(Number(digits.replace(/,/g, '')) * (/m/i.test(unit) ? 1_000_000 : /k/i.test(unit) ? 1_000 : 1));
	const tokens = count(found[1], found[2]);
	const window = count(found[3], found[4]);
	return Number.isFinite(tokens) && Number.isFinite(window) && window > 0 ? { tokens, window } : undefined;
}

/** What a result says this turn used (its `usage`: the lead's requests), as the tokens of one model. */
export function turnUsageOf(usage: unknown, model: string): ModelUsage[] {
	const u = usage && typeof usage === 'object' ? usage as Record<string, unknown> : {};
	const count = (value: unknown) => typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0;
	const used = { model, inputTokens: count(u.input_tokens), outputTokens: count(u.output_tokens), cacheReadTokens: count(u.cache_read_input_tokens), cacheWriteTokens: count(u.cache_creation_input_tokens) };
	return used.inputTokens || used.outputTokens || used.cacheReadTokens || used.cacheWriteTokens ? [used] : [];
}

export function usageSince(modelUsage: unknown, told: Map<string, ModelUsage>): ModelUsage[] {
	const out: ModelUsage[] = [];
	const count = (value: unknown) => typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0;
	for (const [model, raw] of Object.entries(modelUsage && typeof modelUsage === 'object' ? modelUsage as Record<string, Record<string, unknown>> : {})) {
		const total: ModelUsage = { model, inputTokens: count(raw?.inputTokens), outputTokens: count(raw?.outputTokens), cacheReadTokens: count(raw?.cacheReadInputTokens), cacheWriteTokens: count(raw?.cacheCreationInputTokens) };
		const before = told.get(model);
		told.set(model, total);
		const since: ModelUsage = before
			? { model, inputTokens: Math.max(0, total.inputTokens - before.inputTokens), outputTokens: Math.max(0, total.outputTokens - before.outputTokens), cacheReadTokens: Math.max(0, total.cacheReadTokens - before.cacheReadTokens), cacheWriteTokens: Math.max(0, total.cacheWriteTokens - before.cacheWriteTokens) }
			: total;
		if (since.inputTokens || since.outputTokens || since.cacheReadTokens || since.cacheWriteTokens) {
			out.push(since);
		}
	}
	return out;
}

/** What Breezell may ask of a turn under way: stopping one of its subagents (its call's id), the turn going on. */
export interface TurnControls {
	stopSubagent?: (toolId: string) => boolean;
	/** One of the plugin's models for a model a message names (claude-haiku-5-5 → haiku): a subagent's, for its page. */
	modelIdOf?: (model: string) => string | undefined;
	/** How long a model response may stay silent before the turn stops as stalled (MODEL_STALL_MS); tests set a shorter one. */
	stallMs?: number;
	/** Breezell's tools to offer Claude Code in this turn (its memory lookup), and how to run its calls of them. */
	breezellTools?: readonly { readonly name: string; readonly inputSchema: unknown; readonly shell?: string; readonly mcpServer?: string; readonly mcpTool?: string; readonly description?: string }[];
	/** Claude Code's own MCP servers (its settings, its plugins, claude.ai's connectors) stay on beside Breezell's. Default: on. */
	ownMcpServers?: boolean;
	callBreezellTool?: (name: string, input: Record<string, unknown>, toolUseId?: string) => PromiseLike<{ text: string; isError?: boolean; resultType?: string; count?: number; answers?: readonly { question_id: string; selected: readonly string[] }[] }>;
	/**
	 * What each session has used so far, per model, as Claude Code last said it: its totals are the whole session's,
	 * so a turn tells only what it added to them.
	 */
	usageTotals?: { of(session: string): Readonly<Record<string, ModelUsage>> | undefined; keep(session: string, totals: Record<string, ModelUsage>): void };
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
	const files = turn.attachments.filter(a => a.path && !a.text && !a.data).map(a => `- ${a.kind === 'folder' ? 'Folder' : 'File'}: ${pathFor(a.path!)}`);
	const withMessage = sentWithMessage(turn.attachments);
	const sent = withMessage.map(a => `- ${a.kind === 'document' ? 'PDF' : 'Image'}: ${a.name} (with this message)`);
	// Neither a path to open, nor sent, nor told as text (a video, a kind Claude does not take, one too large): its name.
	const others = turn.attachments.filter(a => !a.text && !withMessage.includes(a) && !(a.path && !a.data)).map(a => `- ${a.name} (${a.kind}, not passed on)`);
	const lines = [...files, ...sent, ...others];
	// Code selections, problems, console output and the like, as Breezell's own model is given them: with the agent's paths.
	const texts = turn.attachments.filter(a => a.text).map(a => a.path ? a.text!.split(a.path).join(pathFor(a.path)) : a.text!);
	const remembered = turn.memories?.trim()
		? `\n\n<breezell-memories>\nWhat Breezell remembers that may bear on this message (notes from earlier work: check them against the code before relying on them):\n\n${turn.memories.trim()}\n</breezell-memories>`
		: '';
	// The rules changed while the session went on: Claude Code keeps the ones it started with, so this message says the new ones.
	const rulesChange = turn.session && turn.rules !== undefined
		? turn.rules.trim()
			? `<breezell-rules>\nThe user changed their rules in Breezell. These replace the Breezell rules you were given at the start of this conversation:\n\n${turn.rules.trim()}\n</breezell-rules>`
			: '<breezell-rules>\nThe user removed their rules in Breezell: the Breezell rules you were given at the start of this conversation no longer apply.\n</breezell-rules>'
		: '';
	const notices = turn.notices?.map(notice => notice.trim()).filter(Boolean) ?? [];
	const noticed = notices.length ? `<breezell-notices>\nFrom Breezell, not from the user:\n\n${notices.join('\n\n')}\n</breezell-notices>` : '';
	const text = turn.text.trim() ? turn.text : 'No new message from the user. Breezell has news of commands you ran in its terminal:';
	const message = [(lines.length ? `${text}\n\nAttached in Breezell:\n${lines.join('\n')}` : text), ...texts, remembered.trim(), rulesChange, noticed, modeNoteOf(turn.mode)].filter(Boolean).join('\n\n');
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

/** Pictures and PDFs whose bytes go with the message (Claude Code takes them as image and document blocks). */
function sentWithMessage(attachments: readonly Attachment[]): Attachment[] {
	return attachments.filter(a => a.data && (a.kind === 'image' ? /^image\/(png|jpeg|gif|webp)$/.test(a.data.mimeType) : a.kind === 'document' && a.data.mimeType === 'application/pdf'));
}

/** The user message Claude Code gets: the prompt, and the pictures and PDFs attached in Breezell as blocks of their own. */
export function contentOf(turn: Turn, pathFor: (path: string) => string): string | unknown[] {
	// Breezell's Manual compress: Claude Code's own command, alone.
	if (turn.compact) {
		return '/compact';
	}
	const prompt = promptOf(turn, pathFor);
	const media = turn.continuing ? [] : sentWithMessage(turn.attachments);
	if (!media.length) {
		return prompt;
	}
	return [{ type: 'text', text: prompt }, ...media.map(a => ({ type: a.kind === 'document' ? 'document' : 'image', source: { type: 'base64', media_type: a.data!.mimeType, data: a.data!.base64 } }))];
}

/**
 * Permission rules for the files and folders the user attached from outside the folders Claude Code works in, so that
 * it opens them without asking: the user gave them. Paths a rule cannot spell plainly (commas, wildcards, brackets…)
 * get none, and Claude Code asks as usual.
 */
export function attachedReadRules(turn: Turn, pathFor: (path: string) => string): string[] {
	const comparable = (p: string) => p.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();
	const roots = [turn.cwd, turn.cwd && pathFor(turn.cwd), ...(turn.addDirs ?? [])].filter((dir): dir is string => !!dir).map(comparable);
	const rules: string[] = [];
	for (const attachment of turn.continuing ? [] : turn.attachments) {
		if (!attachment.path || attachment.data || (attachment.kind !== 'file' && attachment.kind !== 'folder')) {
			continue;
		}
		const at = pathFor(attachment.path);
		if (roots.some(root => comparable(at) === root || comparable(at).startsWith(`${root}/`))) {
			continue;
		}
		// Claude Code matches Windows paths in POSIX form: C:\a\b is /c/a/b; an absolute path in a rule starts with //.
		const drive = /^([A-Za-z]):[\\/]/.exec(at);
		const posix = drive ? `/${drive[1].toLowerCase()}/${at.slice(3).replace(/\\/g, '/')}` : at.startsWith('/') ? at : undefined;
		if (!posix || /[,*?[\]{}()!\\"']/.test(posix)) {
			continue;
		}
		const spelled = `/${posix.replace(/\/+$/, '')}`;
		rules.push(...(attachment.kind === 'folder' ? ['Read', 'Glob', 'Grep'].map(tool => `${tool}(${spelled}/**)`) : [`Read(${spelled})`]));
	}
	return rules;
}

/** Claude Code's own tools a mode turns off: commands always go through Breezell's terminal, and Analyze and Chat change nothing. */
export function toolsOffIn(mode: Turn['mode']): string[] {
	return mode === 'plan' ? ['Bash', 'Monitor']
		: mode === 'analyze' || mode === 'chat' ? ['Bash', 'Monitor', 'Edit', 'MultiEdit', 'Write', 'NotebookEdit', 'ExitPlanMode']
			: [];
}

/**
 * Claude Code's plan (ExitPlanMode's), as Breezell's plan card takes it: its title (the first heading), the plan itself,
 * and its steps for the card's to-dos (the numbered lines, else the bulleted ones outside a Context section, else the
 * sections), at least one.
 */
export function planCardOf(markdown: string): { title?: string; markdown: string; plan: { step: string }[] } {
	const lines = markdown.split(/\r?\n/);
	const heading = lines.map(line => /^#\s+(.+)$/.exec(line.trim())?.[1]).find(Boolean);
	const title = heading?.replace(/^plan\s*:\s*/i, '').trim();
	const plain = (text: string) => text.replace(/\*\*|__/g, '').replace(/\s+/g, ' ').trim().slice(0, 240);
	let section = '';
	const numbered: string[] = [];
	const bulleted: string[] = [];
	const sections: string[] = [];
	for (const line of lines) {
		const sub = /^#{2,3}\s+(.+)$/.exec(line.trim());
		if (sub) {
			section = sub[1].trim();
			if (!/^(context|overview|summary|background|verification|testing|notes?)\b/i.test(section)) {
				sections.push(plain(section));
			}
			continue;
		}
		const aside = /^(context|overview|background)\b/i.test(section);
		const number = /^(\d+)[.)]\s+(.+)$/.exec(line);
		if (number) {
			numbered.push(plain(number[2]));
		} else if (!aside && /^[-*]\s+(.+)$/.test(line)) {
			bulleted.push(plain(line.replace(/^[-*]\s+/, '')));
		}
	}
	const steps = (numbered.length ? numbered : bulleted.length ? bulleted : sections).filter(Boolean).slice(0, 30);
	return { ...(title ? { title } : {}), markdown, plan: (steps.length ? steps : [title || 'Carry out the plan']).map(step => ({ step })) };
}

/**
 * Claude Code's own tools Breezell's own model has the like of and runs without asking (reading and searching files,
 * anywhere; fetching a page, searching the web): Claude Code's run so too, whatever the user's auto-approve settings.
 */
export const UNASKED_OWN_TOOLS: ReadonlySet<string> = new Set(['Read', 'Glob', 'Grep', 'LS', 'NotebookRead', 'WebFetch', 'WebSearch']);

type ClaudeQuestion = { question?: unknown; header?: unknown; multiSelect?: unknown; options?: unknown };

/**
 * Claude Code's questions (AskUserQuestion's) as Breezell's question card takes them: each option's label with its
 * description, so the user sees what Claude Code shows. `labels` turns what the card gives back into Claude Code's labels.
 */
export function questionCardOf(input: unknown): { questions: { id: string; question: string; options: { id: string; label: string }[]; allow_multiple: boolean }[]; labels: Map<string, string>[] } | undefined {
	const raw = input && typeof input === 'object' && Array.isArray((input as { questions?: unknown }).questions) ? (input as { questions: ClaudeQuestion[] }).questions : [];
	const labels: Map<string, string>[] = [];
	const questions = raw.map((q, i) => {
		const own = new Map<string, string>();
		labels.push(own);
		const options = (Array.isArray(q?.options) ? q.options as { label?: unknown; description?: unknown }[] : []).flatMap((o, j) => {
			const label = typeof o?.label === 'string' ? o.label.trim() : '';
			if (!label) {
				return [];
			}
			const description = typeof o.description === 'string' ? o.description.trim() : '';
			// A description that only says the label again (or ends in it) adds nothing.
			const shown = description && description.toLowerCase().replace(/[.\s]+$/, '') !== label.toLowerCase() ? `${label} — ${description}` : label;
			own.set(shown, label);
			return [{ id: `o${j}`, label: shown }];
		});
		return { id: `q${i}`, question: typeof q?.question === 'string' ? q.question : `Question ${i + 1}`, options, allow_multiple: q?.multiSelect === true };
	});
	return questions.length && questions.every(q => q.options.length >= 2) ? { questions, labels } : undefined;
}

/** What the card gave back, as AskUserQuestion's `answers`: each question's text, the labels picked (or the user's own words). */
export function answersOf(input: unknown, card: NonNullable<ReturnType<typeof questionCardOf>>, answers: readonly { question_id: string; selected: readonly string[] }[]): Record<string, string> {
	const raw = (input as { questions: ClaudeQuestion[] }).questions;
	const out: Record<string, string> = {};
	card.questions.forEach((q, i) => {
		const picked = answers.find(a => a.question_id === q.id)?.selected ?? [];
		if (picked.length && typeof raw[i]?.question === 'string') {
			out[raw[i].question as string] = picked.map(shown => card.labels[i].get(shown) ?? shown).join(', ');
		}
	});
	return out;
}

/** What Claude Code is told when its plan went to Breezell's plan card: its turn ends there. */
export const PLAN_SHOWN = 'Breezell shows your plan to the user as a plan card. End your turn now with one short line and make no changes: the user chooses Execute to have you carry it out, or tells you what to change.';

/** A line for the message in a mode that changes nothing: its tools for changes are off, and it should not try. */
function modeNoteOf(mode: Turn['mode']): string {
	return mode === 'analyze' ? 'Breezell is in Analyze mode for this message: read, search and answer. Make no changes and run no commands.'
		: mode === 'chat' ? 'Breezell is in Chat mode for this message: answer in the conversation. Make no changes and run no commands.'
			: '';
}

/**
 * The name Claude Code knows a tool of one of the user's MCP servers in Breezell by, under this plugin's server
 * (mcp__breezell__<name>): the server's and the tool's names, kept to what a tool name may hold and to 64 characters
 * in all, cut short with a hash of the whole when longer, so that two never meet.
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

/** What a new session's system prompt gets of the user's Breezell rules. */
export function rulesPromptOf(rules: string): string {
	return `# The user's rules from Breezell\n\nThe user set these rules in Breezell, the editor this conversation runs in, for this project. Follow them as you follow the instructions in CLAUDE.md.\n\n${rules.trim()}\n`;
}

/** The arguments of one turn; `summaries`: ask for its thinking as a summary (THINKING_DISPLAY). */
export function turnArgs(turn: Turn, summaries = true): string[] {
	return [
		'-p', '--output-format', 'stream-json', '--verbose', '--input-format', 'stream-json', '--include-partial-messages',
		'--permission-prompt-tool=stdio',
		...(summaries ? THINKING_DISPLAY : []),
		...(turn.model && turn.model !== 'default' ? ['--model', turn.model] : []),
		...(turn.effort && (EFFORTS as readonly string[]).includes(turn.effort) ? ['--effort', turn.effort] : []),
		...(turn.addDirs ?? []).flatMap(dir => ['--add-dir', dir]),
		...(turn.mode === 'plan' ? ['--permission-mode', 'plan'] : []),
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
	// A tool of one of the user's MCP servers in Breezell (under this plugin's server): its server and tool, for Breezell's MCP row.
	const mcpViews = new Map((controls?.callBreezellTool ? controls.breezellTools ?? [] : []).filter(tool => tool.mcpServer && tool.mcpTool)
		.map(tool => [`mcp__${BREEZELL_MCP_SERVER}__${mcpToolNameOf(tool.mcpServer!, tool.mcpTool!)}`, { kind: 'mcp' as const, server: tool.mcpServer!, tool: tool.mcpTool! }]));
	const viewOfUse = (name: string, input: Parameters<typeof ownViewOfUse>[1]): ToolView | undefined => mcpViews.get(name) ?? ownViewOfUse(name, input);
	return new Promise((resolve, reject) => {
		let child: ChildProcess;
		// A new session's rules from Breezell, in its system prompt: through a file (a command line has a length limit), gone with the process.
		const rulesFile = !turn.session && turn.rules?.trim() ? path.join(os.tmpdir(), `breezell-rules-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.md`) : undefined;
		const dropRulesFile = () => { if (rulesFile) { try { fs.rmSync(rulesFile, { force: true }); } catch { /* already gone */ } } };
		try {
			if (rulesFile) {
				fs.writeFileSync(rulesFile, rulesPromptOf(turn.rules!), 'utf8');
			}
			// Breezell's tools it is offered: a lookup or a wait runs without asking; a command or a change is asked about
			// as Breezell's own are, and Claude Code's own tools for those are off, so every command and change goes there.
			const tools = (controls?.callBreezellTool ? controls.breezellTools ?? [] : []).filter(tool => BREEZELL_TOOL_DESCRIPTIONS[tool.name]);
			const allowed = [...tools.filter(tool => UNASKED_BREEZELL_TOOLS.has(tool.name)).map(tool => `mcp__${BREEZELL_MCP_SERVER}__${tool.name}`), ...attachedReadRules(turn, pathFor)];
			const replaced = [...new Set([...tools.flatMap(tool => OWN_TOOLS_REPLACED[tool.name] ?? []), ...toolsOffIn(turn.mode)])];
			child = target.start([
				...turnArgs(turn, !refusedThinkingDisplay.has(installOf(target))),
				...(allowed.length ? ['--allowedTools', allowed.join(',')] : []),
				...(replaced.length ? ['--disallowedTools', replaced.join(',')] : []),
				...(rulesFile ? ['--append-system-prompt-file', pathFor(rulesFile)] : []),
				// Only Breezell's MCP servers (and this plugin's): Claude Code's own are left out when the user said so.
				...(controls?.ownMcpServers === false ? ['--strict-mcp-config'] : []),
			], turn.cwd);
		} catch (error) {
			dropRulesFile();
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
		/** Manual compress: /context was sent after /compact. */
		let sizeAsked = false;
		/** It compressed its context in this run. */
		let compacted = false;
		/** Its last request's context (not a subagent's), and the model it went to. */
		let context: { tokens: number; model?: string } | undefined;
		/**
		 * What the session had used before, per model (usageSince): nothing for a new one; unknown (undefined) for one
		 * this plugin has not seen end a turn, whose first result then tells this turn's own count instead.
		 */
		const before = turn.session ? controls?.usageTotals?.of(turn.session) : {};
		let usageTold: Map<string, ModelUsage> | undefined = before ? new Map(Object.entries(before)) : undefined;
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
		// The tools of the user's MCP servers in Breezell, under this plugin's server: Breezell runs them with its own
		// connections. Not loaded at the start: Claude Code finds them with its tool search, as its own servers' tools.
		const mcpOffered = new Map((controls?.callBreezellTool ? controls.breezellTools ?? [] : [])
			.filter(tool => tool.mcpServer && tool.mcpTool)
			.map(tool => [mcpToolNameOf(tool.mcpServer!, tool.mcpTool!), tool] as const));
		const recalled = new Map<string, { resultType?: string; count?: number }>();
		/** One MCP message for the server this plugin hosts (Claude Code's mcp_message): its JSON-RPC answer. */
		const answerMcp = async (rpc: { id?: unknown; method?: unknown; params?: { name?: unknown; arguments?: unknown; protocolVersion?: unknown; _meta?: Record<string, unknown> } }): Promise<unknown> => {
			const reply = (result: unknown) => ({ jsonrpc: '2.0', id: rpc.id ?? null, result });
			switch (rpc.method) {
				case 'initialize':
					return reply({ protocolVersion: typeof rpc.params?.protocolVersion === 'string' ? rpc.params.protocolVersion : '2025-06-18', capabilities: { tools: {} }, serverInfo: { name: BREEZELL_MCP_SERVER, version: '1.0.0' } });
				case 'tools/list':
					return reply({ tools: [
						...offered.map(tool => ({ name: tool.name, description: descriptionOf(tool), inputSchema: tool.inputSchema, ...(ALWAYS_LOADED_BREEZELL_TOOLS.has(tool.name) ? { _meta: { 'anthropic/alwaysLoad': true } } : {}) })),
						...[...mcpOffered].map(([name, tool]) => ({ name, description: `${tool.description?.trim() || tool.mcpTool}\n\n(Tool "${tool.mcpTool}" of the user's MCP server "${tool.mcpServer}" in Breezell.)`, inputSchema: tool.inputSchema })),
					] });
				case 'tools/call': {
					const name = typeof rpc.params?.name === 'string' ? rpc.params.name : '';
					const input = rpc.params?.arguments && typeof rpc.params.arguments === 'object' ? rpc.params.arguments as Record<string, unknown> : {};
					const mcpTool = mcpOffered.get(name);
					if ((!offered.some(tool => tool.name === name) && !mcpTool) || !controls?.callBreezellTool) {
						return reply({ content: [{ type: 'text', text: `No tool named ${name}.` }], isError: true });
					}
					if (mcpTool) {
						const callId = typeof rpc.params?._meta?.['claudecode/toolUseId'] === 'string' ? rpc.params._meta['claudecode/toolUseId'] as string : undefined;
						const ran = await Promise.resolve(controls.callBreezellTool(mcpTool.name, input, callId)).then(r => r, error => ({ text: String(error?.message ?? error), isError: true }));
						return reply({ content: [{ type: 'text', text: ran.text || '(nothing)' }], ...(ran.isError ? { isError: true } : {}) });
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
						// A new session, the old one could not go on: its totals are its own from here.
						if (turn.session && session !== turn.session) {
							usageTold = new Map();
						}
					}
					// It compresses its context: asked (/compact), or by itself, its context full.
					const trigger = turn.compact ? 'manual' as const : 'auto' as const;
					if (message.subtype === 'status' && message.status === 'compacting') {
						reply.compaction?.({ phase: 'started', trigger });
					} else if (message.subtype === 'status' && message.compact_result === 'failed') {
						reply.compaction?.({ phase: 'failed', trigger });
					} else if (message.subtype === 'compact_boundary') {
						compacted = true;
						const meta = (message.compact_metadata ?? {}) as { trigger?: unknown; pre_tokens?: unknown; post_tokens?: unknown };
						const size = (value: unknown) => typeof value === 'number' && Number.isFinite(value) && value >= 0 ? { value } : undefined;
						const pre = size(meta.pre_tokens);
						const post = size(meta.post_tokens);
						reply.compaction?.({ phase: 'done', trigger: meta.trigger === 'manual' ? 'manual' : meta.trigger === 'auto' ? 'auto' : trigger, ...(pre ? { preTokens: pre.value } : {}), ...(post ? { postTokens: post.value } : {}) });
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
					const m = (message.message ?? {}) as { id?: string; content?: unknown[]; model?: unknown; usage?: Record<string, unknown> };
					// How much of its context the conversation takes: its last request's input, cached parts too (not a subagent's).
					if (!subagent && m.usage && typeof m.usage === 'object') {
						const n = (value: unknown) => typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0;
						const tokens = n(m.usage.input_tokens) + n(m.usage.cache_read_input_tokens) + n(m.usage.cache_creation_input_tokens);
						if (tokens > 0) {
							context = { tokens, ...(typeof m.model === 'string' ? { model: m.model } : {}) };
						}
					}
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
					if (request.subtype === 'mcp_message' && (offered.length || mcpOffered.size)) {
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
					// Reading, searching, the web: as Breezell's own model, without asking.
					if (UNASKED_OWN_TOOLS.has(name)) {
						answer(requestId, true, request.input);
						return;
					}
					// Its questions to the user: Breezell's question card, never answered for the user (auto-approve or not).
					const card = name === 'AskUserQuestion' && controls?.callBreezellTool && controls.breezellTools?.some(tool => tool.name === 'ask_question') ? questionCardOf(request.input) : undefined;
					if (card) {
						Promise.resolve(controls!.callBreezellTool!('ask_question', { questions: card.questions }, request.tool_use_id)).then(result => {
							const answers = !result.isError && result.answers ? answersOf(request.input, card, result.answers) : {};
							write({ type: 'control_response', response: { subtype: 'success', request_id: requestId, response: Object.keys(answers).length
								? { behavior: 'allow', updatedInput: { ...(request.input ?? {}), answers } }
								: { behavior: 'deny', message: result.isError ? `The question could not be shown in Breezell: ${result.text.slice(0, 300)}` : 'The user skipped the questions in Breezell.' } } });
						}, () => write({ type: 'control_response', response: { subtype: 'success', request_id: requestId, response: { behavior: 'deny', message: 'The question could not be shown in Breezell.' } } }));
						return;
					}
					// Its own plan in Agent mode (it went into plan mode by itself): the user's request is the approval, as
					// for Breezell's own model in Agent mode.
					if (name === 'ExitPlanMode' && turn.mode !== 'plan') {
						answer(requestId, true, request.input);
						return;
					}
					// Its plan, in Plan mode: Breezell's plan card on its row, where the user chooses Execute. Not carried out here.
					if (name === 'ExitPlanMode' && turn.mode === 'plan' && controls?.callBreezellTool && controls.breezellTools?.some(tool => tool.name === 'update_plan')) {
						const markdown = typeof request.input?.plan === 'string' ? request.input.plan : '';
						Promise.resolve(controls.callBreezellTool('update_plan', planCardOf(markdown), request.tool_use_id))
							.then(shown => shown.isError ? `The plan card could not be shown (${shown.text.slice(0, 300)}). End your turn with the plan written out in your reply; make no changes.` : PLAN_SHOWN, () => 'End your turn with the plan written out in your reply; make no changes.')
							.then(message => write({ type: 'control_response', response: { subtype: 'success', request_id: requestId, response: { behavior: 'deny', message } } }));
						return;
					}
					const title = toolTitle(name, request.input) ?? firstLine(request.description);
					// A Write of a file that is there: the card shows what it changes, not a new file.
					const writes = name === 'Write' && typeof request.input?.file_path === 'string' && files ? files.textOf(request.input.file_path).catch(() => undefined) : Promise.resolve(undefined);
					writes.then(before => {
						const view = named(name === 'Write' ? viewOfWrite(request.input, before) : viewOfUse(name, request.input));
						return reply.approve({ toolId, name, kind: toolKind(name), input: request.input, ...(title ? { title } : {}), ...(request.decision_reason ? { reason: firstLine(request.decision_reason, 400) } : {}), ...(view ? { view } : {}) });
					}).then(allowed => answer(requestId, allowed && !token.isCancellationRequested, request.input), () => answer(requestId, false, request.input));
					return;
				}
				case 'result': {
					gotResult = true;
					// Breezell's Manual compress: after /compact, /context says how much the context takes now (no model request).
					if (turn.compact && sizeAsked) {
						const size = contextOfReport(message.result);
						if (size) {
							reply.usage?.({ context: size, models: [] });
						}
						child.stdin?.end();
						return;
					}
					const resultSession = typeof message.session_id === 'string' ? message.session_id : undefined;
					let models: ModelUsage[];
					if (usageTold) {
						models = usageSince(message.modelUsage, usageTold);
					} else {
						// Totals of a session not seen before: this turn's own count (its lead's model; a subagent's is not in it).
						models = turnUsageOf(message.usage, context?.model ?? (typeof turn.model === 'string' ? turn.model : 'claude'));
						usageTold = new Map();
						usageSince(message.modelUsage, usageTold);
					}
					if (resultSession) {
						controls?.usageTotals?.keep(resultSession, Object.fromEntries(usageTold));
					}
					if (reply.usage && (models.length || context)) {
						const usage = message.modelUsage as Record<string, { contextWindow?: unknown }> | undefined;
						const window = context?.model ? usage?.[context.model]?.contextWindow : undefined;
						reply.usage({ ...(context ? { context: { tokens: context.tokens, ...(typeof window === 'number' && window > 0 ? { window } : {}) } } : {}), models });
					}
					if (typeof message.session_id === 'string') {
						session = message.session_id;
					}
					// Stopped as stalled: what the interruption ends with is not the error.
					if (!stalled && (message.is_error || (typeof message.subtype === 'string' && message.subtype !== 'success'))) {
						error = firstLine(message.result, 600) ?? `Claude Code ended with ${String(message.subtype ?? 'an error')}.`;
					}
					// The context compressed: its size now, asked before the run ends.
					if (turn.compact && !error && compacted) {
						sizeAsked = true;
						write({ type: 'user', message: { role: 'user', content: '/context' }, parent_tool_use_id: null });
						return;
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
			dropRulesFile();
			if (killTimer) { clearTimeout(killTimer); }
			reject(err);
		});
		child.on('close', code => {
			dropRulesFile();
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
		if (offered.length || mcpOffered.size) {
			write({ type: 'control_request', request_id: `breezell-init-${nextRequest++}`, request: { subtype: 'initialize', sdkMcpServers: [BREEZELL_MCP_SERVER] } });
		}
		write({ type: 'user', message: { role: 'user', content: contentOf(turn, pathFor) }, parent_tool_use_id: null });
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
