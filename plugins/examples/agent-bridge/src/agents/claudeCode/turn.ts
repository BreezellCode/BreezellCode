/*
 * A turn of a Breezell conversation, answered by the user's own Claude Code. It runs in print mode with
 * streamed JSON both ways and asks before a tool runs through its stdio permission channel, as
 * Anthropic's own Agent SDK does (`--permission-prompt-tool=stdio`): each `can_use_tool` request goes
 * to Breezell's approval card and its answer goes back as a `control_response`. The conversation's
 * session goes on with `--resume`. Nothing here reads Claude Code's files or its credentials.
 */
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type { Target } from '../../core/cli';
import { withoutArg, type KeptProcess } from '../../core/keepAlive';
import { AgentChild, AgentProcess, type ChildListener } from '../../core/process';
import { BREEZELL_MCP_SERVER, UNASKED_BREEZELL_TOOLS, createBreezellToolHost, mcpToolViews } from '../../core/tools';
import { attachedOutside, EFFORTS, firstLine, planCardOf, PLAN_SHOWN, promptOf, rulesTextOf, sentWithMessage, type Cancel, type ModelUsage, type Reply, type Turn, type TurnControls, type TurnFiles, type TurnResult } from '../../core/turn';
import { addUsage, hasTokens, tokenCount } from '../../core/usage';
import { memoriesViewOf, withUri, type ToolView } from '../../core/views';
import { contextOfReport, contextWindowOf, rememberContextWindows, requestRows, requestUsageOf, turnUsageOf, usageSince } from './tokens';
import { BREEZELL_EDIT_TOOL, BREEZELL_TERMINAL_TOOL, BREEZELL_WRITE_TOOL, isSubagentTool, partialInput, UNSHOWN_TOOLS, viewOfResult, viewOfUse as ownViewOfUse, viewOfWrite } from './views';

/**
 * Claude Code's own tools that Breezell's take over when offered: its shell (Bash, and Monitor, which runs commands
 * too) while Breezell's terminal is, its file edits while Breezell's are (MultiEdit: older versions).
 */
const OWN_TOOLS_REPLACED: Readonly<Record<string, readonly string[]>> = {
	run_terminal_cmd: ['Bash', 'Monitor'],
	edit_file: ['Edit', 'MultiEdit'],
	write_to_file: ['Write'],
};
/** A call being written is told again at most this often (its input so far, as it grows). */
export const WRITING_TOLD_MS = 150;

/** After a background subagent ended with the turn told over: how long nothing may follow before Claude Code's input closes. */
export const AFTER_BACKGROUND_QUIET_MS = 10_000;

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
 * Its thinking as a summary (`--thinking-display summarized`), shown as Breezell shows a model's thinking; without
 * it a thought is only its size. The flag is not in Claude Code's help (2.1.330 has it; the `showThinkingSummaries`
 * setting does the same, but not with -p): an install that refuses it ("unknown option") runs without it from then.
 */
const THINKING_DISPLAY = ['--thinking-display', 'summarized'];
/** The Claude Code installs (by where and path) that refused THINKING_DISPLAY. */
const refusedThinkingDisplay = new Set<string>();
const installKey = (target: Target) => `${target.where}\0${target.path}`;

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
	const rules: string[] = [];
	for (const { path: at, folder } of attachedOutside(turn, pathFor)) {
		// Claude Code matches Windows paths in POSIX form: C:\a\b is /c/a/b; an absolute path in a rule starts with //.
		const drive = /^([A-Za-z]):[\\/]/.exec(at);
		const posix = drive ? `/${drive[1].toLowerCase()}/${at.slice(3).replace(/\\/g, '/')}` : at.startsWith('/') ? at : undefined;
		if (!posix || /[,*?[\]{}()!\\"']/.test(posix)) {
			continue;
		}
		const spelled = `/${posix.replace(/\/+$/, '')}`;
		rules.push(...(folder ? ['Read', 'Glob', 'Grep'].map(tool => `${tool}(${spelled}/**)`) : [`Read(${spelled})`]));
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

/** What a new session's system prompt gets of the user's Breezell rules. */
export function rulesPromptOf(rules: string): string {
	return `# The user's rules from Breezell\n\n${rulesTextOf(rules, 'CLAUDE.md')}\n`;
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

/**
 * Claude Code's own variables that have its subagents work on the conversation's model, whatever would pick another
 * (a model the lead names for one, an agent type's own, one Anthropic moves a subagent to), and at its effort when one
 * is picked (none lowered from it).
 */
export function followingSubagentsEnv(turn: Pick<Turn, 'effort'>): Record<string, string> {
	const effort = turn.effort && (EFFORTS as readonly string[]).includes(turn.effort) ? turn.effort : undefined;
	return {
		CLAUDE_CODE_SUBAGENT_MODEL_FORCE: '1',
		CLAUDE_CODE_DISABLE_EXPLORE_INHERIT_CAP: '1',
		...(effort ? { CLAUDE_CODE_SUBAGENT_EFFORT: effort, CLAUDE_CODE_EFFORT_LEVEL: effort } : {}),
	};
}

/**
 * What Claude Code says that is work: its model's output, a question to the user, a tool's result, a task of its own.
 * Said between turns by a kept program, it has no turn to go to (keepAlive.ts).
 */
export function claudeIsWork(message: Record<string, unknown>): boolean {
	switch (message.type) {
		case 'assistant': case 'user': case 'stream_event': case 'control_request': case 'result':
			return true;
		case 'system':
			return typeof message.subtype === 'string' && /^(init|task_|api_retry|compact_boundary|thinking_tokens)/.test(message.subtype);
		default:
			return false;
	}
}

/**
 * Runs one turn. Resolves with the session to go on with, and the error Claude Code ended with; rejects
 * only when it could not be run at all. With its program kept between turns (controls.keepAlive), the turn goes on in
 * the conversation's kept program when it is fit for it, and a turn that ended well leaves its program kept.
 */
export async function runTurn(target: Target, turn: Turn, reply: Reply, token: Cancel, pathFor: (path: string) => string = p => p, files?: TurnFiles, controls?: TurnControls): Promise<TurnResult> {
	const named = (view: ToolView | undefined) => files ? withUri(view, path => files.uriOf(path)) : view;
	// Breezell's tools, as the MCP server this plugin hosts: Claude Code names each call (its tool_use id), and has
	// asked for it already (can_use_tool) when it is one Breezell asks about. Loaded at the start: see EAGER_BREEZELL_TOOLS.
	const host = createBreezellToolHost(controls, {
		toolPathOf: files?.toolPathOf,
		callIdOf: params => typeof (params?._meta as Record<string, unknown> | undefined)?.['claudecode/toolUseId'] === 'string' ? (params!._meta as Record<string, string>)['claudecode/toolUseId'] : undefined,
		listed: (_name, eager) => eager ? { _meta: { 'anthropic/alwaysLoad': true } } : undefined,
	});
	// A tool of one of the user's MCP servers in Breezell (under this plugin's server): its server and tool, for Breezell's MCP row.
	const mcpViews = mcpToolViews(controls, name => `mcp__${BREEZELL_MCP_SERVER}__${name}`);
	const viewOfUse = (name: string, input: Parameters<typeof ownViewOfUse>[1]): ToolView | undefined => mcpViews.get(name) ?? ownViewOfUse(name, input);
	// Breezell's tools it is offered: a lookup or a wait runs without asking; a command or a change is asked about
	// as Breezell's own are, and Claude Code's own tools for those are off, so every command and change goes there.
	const offered = host.offered;
	const allowed = [...offered.filter(tool => UNASKED_BREEZELL_TOOLS.has(tool.name)).map(tool => `mcp__${BREEZELL_MCP_SERVER}__${tool.name}`), ...attachedReadRules(turn, pathFor)];
	const replaced = [...new Set([...offered.flatMap(tool => OWN_TOOLS_REPLACED[tool.name] ?? []), ...toolsOffIn(turn.mode)])];
	const args = [
		...turnArgs(turn, !refusedThinkingDisplay.has(installKey(target))),
		...(allowed.length ? ['--allowedTools', allowed.join(',')] : []),
		...(replaced.length ? ['--disallowedTools', replaced.join(',')] : []),
	];
	// Only Breezell's MCP servers (and this plugin's): Claude Code's own are left out when the user said so.
	const strict = controls?.ownMcpServers === false ? ['--strict-mcp-config'] : [];
	const env = controls?.subagentsFollowModel ? followingSubagentsEnv(turn) : undefined;
	// Its program kept between this conversation's turns: the kept one, when it was started just so (its session aside).
	const keep = controls?.keepAlive?.pool.enabled ? controls.keepAlive : undefined;
	const key = JSON.stringify({ args: [...withoutArg(args, '--resume'), ...strict], cwd: turn.cwd ?? '', env: env ?? {}, tools: host.listTools() });
	const taken = keep ? await keep.pool.take(keep.conversation, key, turn.session, turn.session ? keep.recordOf?.(turn.session) : undefined) : undefined;
	let agent: AgentChild;
	let kept: KeptProcess | undefined;
	// A new session's rules from Breezell, in its system prompt: through a file (a command line has a length limit), gone once read.
	const rulesFile = !taken?.kept && !turn.session && turn.rules?.trim() ? path.join(os.tmpdir(), `breezell-rules-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.md`) : undefined;
	const dropRulesFile = () => { if (rulesFile) { try { fs.rmSync(rulesFile, { force: true }); } catch { /* already gone */ } } };
	if (taken?.kept) {
		kept = taken.kept;
		agent = kept.agent;
	} else {
		try {
			if (rulesFile) {
				fs.writeFileSync(rulesFile, rulesPromptOf(turn.rules!), 'utf8');
			}
			agent = new AgentChild(target.start([...args, ...(rulesFile ? ['--append-system-prompt-file', pathFor(rulesFile)] : []), ...strict], turn.cwd, env));
		} catch (error) {
			dropRulesFile();
			throw error;
		}
		// Kept from here, unless a turn of this conversation is under way in the kept one (this one is then its own).
		if (keep && !taken?.busy) {
			const candidate: KeptProcess = { agent, key, session: undefined, isWork: claudeIsWork };
			kept = keep.pool.adopt(keep.conversation, candidate) ? candidate : undefined;
		}
	}
	const started = !taken?.kept;
	return new Promise((resolve, reject) => {
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
		/** The lead's request under way: its model (message_start), told as a request record when it ends (message_delta). */
		let leadModel: string | undefined;
		/** The lead's requests told since the last result, per model; its subagents' requests since then, by message. */
		let toldSince = new Map<string, ModelUsage>();
		let subagentRequests = new Map<string, ModelUsage>();
		/**
		 * What the session had used before, per model (usageSince): nothing for a new one; unknown (undefined) for one
		 * this plugin has not seen end a turn, whose first result then tells this turn's own count instead.
		 */
		const before = turn.session ? controls?.usageTotals?.of(turn.session) : {};
		let usageTold: Map<string, ModelUsage> | undefined = before ? new Map(Object.entries(before)) : undefined;
		/** A model response is coming (message_start to message_stop): silence then is a stalled model (MODEL_STALL_MS). */
		let streaming = false;
		let nextRequest = 1;
		const stallMs = controls?.stallMs ?? MODEL_STALL_MS;
		// Asked to stop as the SDK asks it (an interrupt), its input closed; ended if it does not within the grace period.
		const proc = new AgentProcess(agent, {
			token,
			askToStop: why => {
				proc.write({ type: 'control_request', request_id: `breezell-${why}-${nextRequest++}`, request: { subtype: 'interrupt' } });
				proc.endInput();
			},
			// A response that went silent (MODEL_STALL_MS): taken for a dead connection, it stops as a model error Breezell sends on.
			stall: { ms: stallMs, counts: () => streaming, onStall: () => { error = `No answer from the model for ${Math.round(stallMs / 1000)} s.`; apiError = 'stalled'; } },
		});
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
		const write = (message: unknown) => proc.write(message);
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
		const answer = (requestId: string, allowed: boolean, input: unknown) => write({
			type: 'control_response',
			response: { subtype: 'success', request_id: requestId, response: allowed ? { behavior: 'allow', updatedInput: input ?? {} } : { behavior: 'deny', message: 'The user did not allow this in Breezell.' } },
		});
		const handle = (message: Record<string, unknown>) => {
			proc.heard();
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
						// turn ends with that turn's end; if nothing comes, after a while.
						if (resultWhileBusy && !tasksRunning() && !quietClose) {
							quietClose = setTimeout(endTurn, AFTER_BACKGROUND_QUIET_MS);
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
					const event = (message.event ?? {}) as { type?: string; index?: number; message?: { id?: string; model?: string }; usage?: unknown; content_block?: { type?: string; id?: string; name?: string }; delta?: { type?: string; text?: string; thinking?: string; partial_json?: string } };
					// A request of the lead: a record of its own when it ends, as Breezell's own requests have; the ring follows it.
					if (event.type === 'message_start' && typeof event.message?.model === 'string') {
						leadModel = event.message.model;
					} else if (event.type === 'message_delta' && leadModel && reply.usage) {
						const row = requestUsageOf(leadModel, event.usage);
						if (row && hasTokens(row)) {
							const sum = toldSince.get(leadModel);
							toldSince.set(leadModel, sum ? addUsage(sum, row) : row);
							const tokens = row.inputTokens + row.cacheReadTokens + row.cacheWriteTokens;
							const window = contextWindowOf(leadModel);
							reply.usage({ ...(window && tokens ? { context: { tokens, window } } : {}), models: [row] });
						}
					}
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
					// A subagent's request: its input and cache as they are, its output so far (the result settles the rest).
					if (subagent && typeof m.id === 'string' && typeof m.model === 'string') {
						const row = requestUsageOf(m.model, m.usage);
						const before = subagentRequests.get(m.id);
						if (row) {
							subagentRequests.set(m.id, before ? { ...row, outputTokens: Math.max(before.outputTokens, row.outputTokens) } : row);
						}
					}
					// How much of its context the conversation takes: its last request's input, cached parts too (not a subagent's).
					if (!subagent && m.usage && typeof m.usage === 'object') {
						const tokens = tokenCount(m.usage.input_tokens) + tokenCount(m.usage.cache_read_input_tokens) + tokenCount(m.usage.cache_creation_input_tokens);
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
						const found = seen?.kind === 'memories' ? memoriesViewOf(seen, host.recalled(call?.input)) : seen;
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
					if (request.subtype === 'mcp_message' && host.names.length) {
						const mcp = request as { server_name?: unknown; message?: { id?: unknown; method?: unknown } };
						if (mcp.server_name === BREEZELL_MCP_SERVER && mcp.message && typeof mcp.message === 'object') {
							void host.answer(mcp.message).then(response => write({ type: 'control_response', response: { subtype: 'success', request_id: requestId, response: { mcp_response: response } } }));
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
						endTurn();
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
					rememberContextWindows(message.modelUsage);
					const usage = message.modelUsage as Record<string, { contextWindow?: unknown }> | undefined;
					// The request records not told yet (its subagents', and what no request said), adding up to its count.
					const rows = requestRows(models, toldSince, [...subagentRequests.values()]);
					toldSince = new Map();
					subagentRequests = new Map();
					if (reply.usage && (rows.length || context)) {
						const window = context?.model ? usage?.[context.model]?.contextWindow : undefined;
						reply.usage({ ...(context ? { context: { tokens: context.tokens, ...(typeof window === 'number' && window > 0 ? { window } : {}) } } : {}), models: rows });
					}
					if (typeof message.session_id === 'string') {
						session = message.session_id;
					}
					// Stopped as stalled: what the interruption ends with is not the error.
					if (!proc.stalled && (message.is_error || (typeof message.subtype === 'string' && message.subtype !== 'success'))) {
						error = firstLine(message.result, 600) ?? `Claude Code ended with ${String(message.subtype ?? 'an error')}.`;
					}
					// The context compressed: its size now, asked before the run ends.
					if (turn.compact && !error && compacted) {
						sizeAsked = true;
						write({ type: 'user', message: { role: 'user', content: '/context' }, parent_tool_use_id: null });
						return;
					}
					// The turn is told. Not while a subagent still works in the background: Claude Code goes on once it
					// ends (and may ask approvals for it meanwhile).
					if (tasksRunning()) {
						resultWhileBusy = true;
					} else {
						endTurn();
					}
					return;
				}
			}
		};
		let settled = false;
		/** What the turn ends with: its session, its last record, the error Claude Code ended with (none when the user stopped it). */
		const outcome = (): TurnResult => {
			const failure = error && !token.isCancellationRequested ? error : undefined;
			return { ...(session ? { session } : {}), ...(failure ? { error: failure } : {}), ...(entry ? { entry } : {}), ...(failure && apiError ? { apiError } : {}) };
		};
		const listener: ChildListener = {
			message: handle,
			error: err => {
				if (settled) {
					return;
				}
				settled = true;
				agent.unlisten(listener);
				proc.dispose();
				dropRulesFile();
				reject(err);
			},
			close: code => {
				if (settled) {
					return;
				}
				settled = true;
				agent.unlisten(listener);
				dropRulesFile();
				proc.dispose();
				if (quietClose) { clearTimeout(quietClose); }
				// An install without the thinking display flag: it refused the arguments before doing anything; once more without it.
				if (!gotResult && !session && code !== 0 && !token.isCancellationRequested && !refusedThinkingDisplay.has(installKey(target)) && /unknown option '--thinking-display'/.test(proc.stderr)) {
					refusedThinkingDisplay.add(installKey(target));
					runTurn(target, turn, reply, token, pathFor, files, controls).then(resolve, reject);
					return;
				}
				if (!gotResult && !token.isCancellationRequested && code !== 0) {
					error = error ?? proc.exitError('Claude Code', code);
				}
				// Stopped by the user, what Claude Code ends with (error_during_execution) is no error.
				resolve(outcome());
			},
		};
		/**
		 * The turn is over. Its program kept (keepAlive): at rest for the conversation's next turn, when the turn ended
		 * well; otherwise its input closes and Claude Code ends, and the turn with it (its close above).
		 */
		function endTurn(): void {
			if (quietClose) {
				clearTimeout(quietClose);
				quietClose = undefined;
			}
			if (settled) {
				return;
			}
			const keepIt = !!kept && !!keep && keep.pool.holds(keep.conversation, kept) && gotResult && !error && !proc.stopAsked && !token.isCancellationRequested && agent.alive;
			if (!keepIt) {
				proc.endInput();
				return;
			}
			settled = true;
			agent.unlisten(listener);
			proc.dispose();
			dropRulesFile();
			kept!.session = session ?? kept!.session;
			const record = kept!.session ? keep!.recordOf?.(kept!.session) : undefined;
			void keep!.pool.release(keep!.conversation, kept!, record).then(() => resolve(outcome()), () => resolve(outcome()));
		}
		agent.listen(listener);
		// Breezell's tools, through the MCP server this plugin hosts here (named before the first message, as the SDK
		// does): once a program, which keeps them.
		if (started && host.names.length) {
			write({ type: 'control_request', request_id: `breezell-init-${nextRequest++}`, request: { subtype: 'initialize', sdkMcpServers: [BREEZELL_MCP_SERVER] } });
		}
		write({ type: 'user', message: { role: 'user', content: contentOf(turn, pathFor) }, parent_tool_use_id: null });
	});
}
