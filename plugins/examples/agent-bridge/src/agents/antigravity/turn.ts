/*
 * A turn of a Breezell conversation, answered by the user's own Antigravity CLI (agy) in its stream mode
 * (`--input-format stream-json --output-format stream-json`): the message goes in as one line, its steps come back as
 * they happen (its words as they are written, its tool calls and their results, what each model request used). The
 * conversation goes on with `--conversation`.
 *
 * Breezell's tools are its MCP server "breezell", named in a folder of the conversation's own that agy is given
 * (`--add-dir`; agy reads `.agents/mcp_config.json` there), so nothing is written to agy's own settings. agy's own
 * tools that write files or run commands are turned off for the run (`--settings` deny rules): its changes and
 * commands go through Breezell's edit and terminal tools, which Breezell asks about (its approval card), shows,
 * reviews and keeps as its own.
 *
 * Its stream says how much its model thought, not what: the text comes from agy's own record of the conversation while
 * it is written (liveSteps.ts), and from its transcript of the conversation, a line a step once the step is done
 * (transcript.ts). Its subagents work off its stream, each in a conversation of its own: their pages follow their
 * transcripts. Those records and transcripts are the one kind of agy's files read here; never its settings or its
 * credentials.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { Target } from '../../core/cli';
import { withoutArg, type KeptProcess } from '../../core/keepAlive';
import type { McpAnswer } from '../../core/mcpHttp';
import { AgentChild, AgentProcess, type ChildListener } from '../../core/process';
import { BREEZELL_MCP_SERVER, EAGER_BREEZELL_TOOLS, createBreezellToolHost, mcpToolViews, type OwnTool } from '../../core/tools';
import { attachedOutside, firstLine, planCardOf, PLAN_SHOWN, promptOf, rulesTextOf, type Attachment, type Cancel, type Reply, type Turn, type TurnControls, type TurnFiles, type TurnResult } from '../../core/turn';
import { hasTokens, tokenCount, usageRow } from '../../core/usage';
import { memoriesViewOf, withUri, type ToolView } from '../../core/views';
import type { AgyLiveSteps } from './liveSteps';
import { AGY_THOUGHT_WAIT_MS, AgyTranscript, agyThoughtOf, agyTranscriptOutput, type AgyTranscriptStep } from './transcript';
import { agyCallOf, agyStepOf, agyViewOfUse, viewTitleOf } from './views';

/** A conversation's folders of its own for agy, each as this computer reaches it and as agy names it. */
export interface AgyFolders {
	/** Given to agy (`--add-dir`): Breezell's MCP server for it (`.agents/mcp_config.json`). Fenced off from its model. */
	readonly tools: { readonly local: string; readonly agent: string };
	/** Where attached pictures and PDFs are saved for agy to open (its stream takes text only). */
	readonly attachments: { readonly local: string; readonly agent: string };
}

/** How agy's MCP config names Breezell's server: an address on this computer, or a program it starts (the relay, for an agy in WSL). */
export type AgyServerEntry =
	| { readonly serverUrl: string; readonly headers: Readonly<Record<string, string>> }
	| { readonly command: string; readonly args: readonly string[]; readonly env: Readonly<Record<string, string>> };

export interface AgyRun {
	readonly folders: AgyFolders;
	/** Opens this turn's MCP server for these answers, and says how agy reaches it. */
	readonly serve: (answer: McpAnswer) => Promise<{ readonly entry: AgyServerEntry; dispose(): void }>;
	/** The id agy's `--model` takes (program.ts agyModelId); none: agy's own. */
	readonly model?: string;
	/** Where agy writes down a conversation's steps, as this computer reaches it (agyTranscriptPath); none: not known. */
	readonly transcriptOf?: (conversation: string) => string | undefined;
	/** agy's record of a conversation, its model steps as they are written (liveSteps.ts); none: not read. */
	readonly liveStepsOf?: (conversation: string) => AgyLiveSteps | undefined;
	/** How often that record is read while its model works (AGY_LIVE_MS); tests give their own. */
	readonly liveMs?: number;
	/** What each of its sessions was last told of its own MCP servers (on or off); none: nothing kept, nothing told again. */
	readonly ownMcpTold?: { get(session: string): boolean | undefined; set(session: string, on: boolean): void };
	/** How long a step's thought is waited for (AGY_THOUGHT_WAIT_MS); tests give their own. */
	readonly thoughtWaitMs?: number;
	/** How often a subagent's transcript is read while it works (AGY_FOLLOW_MS); tests give their own. */
	readonly followMs?: number;
	/** The picker's model a model of agy's is (its effort levels are one): a subagent's row and page show the one it works on. */
	readonly modelIdOf?: (agyModel: string) => string | undefined;
}

/**
 * Breezell's MCP server for one agy program: the turn under way answers its calls; between turns (a kept program) a
 * call has none, and `idle` is told of it (the program went on by itself: it is closed).
 */
type AgyRoute = { answer: McpAnswer | undefined; idle?: McpAnswer };
/** What a kept agy program keeps with it: its MCP route. */
type AgyKept = { readonly route: AgyRoute };

/** A call of Breezell's tools with no turn under way to answer it. */
function noTurnAnswer(rpc: { id?: unknown }): unknown {
	return { jsonrpc: '2.0', id: rpc.id ?? null, error: { code: -32000, message: 'No turn of this conversation is under way in Breezell.' } };
}

/**
 * What agy says that is work: a step of its model or of a tool, its end. Said between turns by a kept program, it has
 * no turn to go to (keepAlive.ts).
 */
export function agyIsWork(message: Record<string, unknown>): boolean {
	return message.event === 'step_update' || message.event === 'result' || message.event === 'init';
}

/** How often agy's record of the conversation is read while its model works: its thought as it is written. */
export const AGY_LIVE_MS = 300;
/** How often a working subagent's transcript is read (its steps are written down as each is done). */
export const AGY_FOLLOW_MS = 400;

/**
 * A model response that went silent (no event of agy's) for this long is taken for a dead connection: the turn stops
 * with a "stalled" model error, which Breezell sends on in the session. agy tells nothing while its model thinks, so
 * this is wider than Claude Code's (claudeCode/turn.ts MODEL_STALL_MS); a call waiting on Breezell (an approval, a
 * command) never counts.
 */
export const AGY_STALL_MS = 600_000;

/** agy's own tools that write files or run commands: off for every run (Breezell's take their place), so never shown. */
const OWN_TOOLS_OFF: ReadonlySet<string> = new Set(['write_file', 'write_to_file', 'replace_file_content', 'multi_replace_file_content', 'sed_file', 'notebook_edit', 'run_command', 'send_command_input']);
/** agy's own steps that are no action of the user's concern. Not shown. */
const UNSHOWN_TOOLS: ReadonlySet<string> = new Set(['finish', 'wait', 'wait_5_seconds', 'list_permissions', 'ask_permission', 'ask_custom_permission']);

/** What the model is told of Breezell's question card and plan card, its tools for asking the user and for a plan. */
const ASK_DESCRIPTION = 'Ask the user one or more questions in Breezell\'s question card, each with choices to pick from, and wait for the answers. Use it whenever you need the user to decide something, instead of asking in your reply.';
const PLAN_DESCRIPTION = 'Give your plan to the user as Breezell\'s plan card, where the user chooses Execute to have you carry it out or tells you what to change. markdown: the whole plan, a title heading first, then its steps as a numbered list.';
/** What the model is told of its own MCP servers while the user does not auto-approve MCP tools, and when that changed. */
export const OWN_MCP_OFF_NOTE = 'Your own MCP servers (all but breezell) are turned off in this conversation: their calls are refused, so do not call their tools.';
export const OWN_MCP_ON_NOTE = 'Your own MCP servers are turned on in this conversation now: you may call their tools.';
/** What a teammate in Breezell's Teams is told instead of how to ask the user (Turn.teammate). */
export const TEAMMATE_NOTE = 'You are a teammate in Breezell\'s Teams: do not ask the user anything (only the lead talks to the user) and do not start subagents of your own (invoke_subagent): do the work yourself, and end your turn with your report to the lead.';
const PLAN_NOTE = 'Breezell is in Plan mode for this message: read and investigate, but change no files and run no commands. When your plan is ready, give it to the user with the breezell tool update_plan (the whole plan as Markdown), then end your turn.';

/** The id of the call an MCP request is for, as agy's stream names its step: its conversation and the step's index. */
export function agyCallIdOf(params: Record<string, unknown> | undefined): string | undefined {
	const meta = params?._meta && typeof params._meta === 'object' ? params._meta as Record<string, unknown> : undefined;
	const conversation = meta?.['antigravity.google/conversation_id'];
	const step = typeof meta?.progressToken === 'string' ? /:(\d+)$/.exec(meta.progressToken)?.[1] : undefined;
	return typeof conversation === 'string' && conversation && step ? `${conversation}:${step}` : undefined;
}

/** What a new session is told before its first message: how it works in Breezell, and the user's rules (agy keeps both with the conversation). */
export function agySessionNote(turn: Pick<Turn, 'cwd' | 'addDirs' | 'rules' | 'teammate'>, pathFor: (path: string) => string, toolsFolder: string, options?: { readonly ownMcp?: boolean }): string {
	const project = turn.cwd ? pathFor(turn.cwd) : undefined;
	const more = turn.addDirs?.length ? ` (with ${turn.addDirs.join(', ')})` : '';
	const lines = [
		'<breezell-session>',
		`Breezell, the user's editor, runs you for this conversation, and the user reads your replies there.${project ? ` The project folder is ${project}${more}.` : ''}`,
		`Your own tools that write files and run commands are turned off here. Change files with the breezell tools edit_file and write_to_file, and run shell commands with the breezell tool run_terminal_cmd, whenever Breezell offers them: Breezell shows each change and each command to the user. ${turn.teammate ? TEAMMATE_NOTE : 'To ask the user something, use the breezell tool ask_question.'}`,
		`The folder ${toolsFolder} only holds Breezell's connection settings: never read or change anything in it.`,
		...(options?.ownMcp ? [] : [OWN_MCP_OFF_NOTE]),
		'</breezell-session>',
	];
	const rules = turn.rules?.trim() ? `\n\n<breezell-rules>\n${rulesTextOf(turn.rules, 'GEMINI.md and AGENTS.md')}\n</breezell-rules>` : '';
	return `${lines.join('\n')}${rules}`;
}

/**
 * The rules of one run: Breezell's MCP server allowed, agy's own MCP servers too when `ownMcp` (the user auto-approves
 * MCP tools; otherwise agy refuses their calls, as it refuses every call it would have to ask about); agy's own writing
 * and commands denied (Breezell's tools do those); the conversation's own folder fenced off; attachments saved for it
 * readable.
 */
export function agySettings(folders: AgyFolders, readable: readonly string[], options?: { readonly ownMcp?: boolean }): Record<string, unknown> {
	const spelled = (folder: string) => [...new Set([folder, folder.replace(/\\/g, '/')])].map(f => `${f.replace(/[\\/]+$/, '')}/`);
	return {
		permissions: {
			allow: [`mcp(${BREEZELL_MCP_SERVER}/*)`, ...(options?.ownMcp ? ['mcp(*)'] : []), ...spelled(folders.attachments.agent).map(f => `read_file(${f})`), ...readable.map(file => `read_file(${file})`)],
			deny: ['command(*)', 'write_file(*)', ...spelled(folders.tools.agent).map(f => `read_file(${f})`)],
		},
	};
}

/** The arguments of one turn. */
export function agyTurnArgs(turn: Turn, run: Pick<AgyRun, 'folders' | 'model'>, settings: Record<string, unknown>): string[] {
	return [
		'--input-format', 'stream-json', '--output-format', 'stream-json', '--print=', '--disable-slash-commands',
		'--add-dir', run.folders.tools.agent,
		...(turn.addDirs ?? []).flatMap(dir => ['--add-dir', dir]),
		'--settings', JSON.stringify(settings),
		...(run.model ? ['--model', run.model] : []),
		...(turn.session ? ['--conversation', turn.session] : []),
	];
}

/** A failed run's model error, of Breezell's kinds (AgentTurnResult.apiError), when its words say it is one; else none. */
export function agyApiErrorOf(error: string | undefined): string | undefined {
	if (!error) {
		return undefined;
	}
	return /quota|rate.?limit|resource.?exhausted|\b429\b|too many requests/i.test(error) ? 'rate_limit'
		: /overload|\bunavailable\b|\b503\b|capacity|try again later/i.test(error) ? 'overloaded'
			: /internal error|\b500\b|server error/i.test(error) ? 'server_error'
				: /network|connection|ECONN|timed? ?out|deadline exceeded|socket|unexpected EOF|stream (?:closed|reset)/i.test(error) ? 'unknown'
					: undefined;
}

/** The text of a tool's output as agy writes it. */
function outputOf(output: unknown): string {
	return typeof output === 'string' ? output : output === undefined ? '' : JSON.stringify(output);
}

/** A file name for an attachment saved for agy: its own name made safe, with the extension its kind has. */
function savedName(attachment: Attachment, index: number): string {
	const base = attachment.name.replace(/[^A-Za-z0-9._-]+/g, '_').replace(/^\.+/, '').slice(0, 80) || 'attachment';
	const ext = /\.[A-Za-z0-9]{1,5}$/.test(base) ? '' : attachment.data?.mimeType === 'application/pdf' ? '.pdf' : `.${(attachment.data?.mimeType.split('/')[1] ?? 'bin').replace(/[^a-z0-9]/gi, '').slice(0, 5) || 'bin'}`;
	return `${index + 1}-${base}${ext}`;
}

/**
 * Runs one turn. Resolves with the session to go on with and the error agy ended with; rejects only when it could not
 * be run at all.
 */
export async function runAgyTurn(target: Target, turn: Turn, reply: Reply, token: Cancel, pathFor: (path: string) => string, run: AgyRun, files?: TurnFiles, controls?: TurnControls): Promise<TurnResult> {
	if (turn.compact) {
		return { error: 'Antigravity CLI cannot compress its context when Breezell asks.' };
	}
	const named = (view: ToolView | undefined) => files ? withUri(view, p => files.uriOf(p)) : view;
	const listed = controls?.callBreezellTool ? controls.breezellTools ?? [] : [];
	const call = controls?.callBreezellTool;
	// Breezell's question card and, in Plan mode, its plan card: agy's model asks and plans with these.
	const own: OwnTool[] = [];
	const asking = listed.find(tool => tool.name === 'ask_question');
	if (asking && call) {
		own.push({ name: 'ask_question', description: ASK_DESCRIPTION, inputSchema: asking.inputSchema, run: (input, callId) => call('ask_question', input, callId) });
	}
	if (turn.mode === 'plan' && call && listed.some(tool => tool.name === 'update_plan')) {
		own.push({
			name: 'update_plan', description: PLAN_DESCRIPTION,
			inputSchema: { type: 'object', properties: { markdown: { type: 'string', description: 'The whole plan, in Markdown.' } }, required: ['markdown'] },
			run: async (input, callId) => {
				const shown = await call('update_plan', planCardOf(typeof input.markdown === 'string' ? input.markdown : ''), callId);
				return shown.isError ? { text: `The plan card could not be shown (${shown.text.slice(0, 300)}). End your turn with the plan written out in your reply; make no changes.`, isError: true } : { text: PLAN_SHOWN };
			},
		});
	}
	/** Tool rows told so far, by id: a call Breezell asks about is told first (its card goes with its row). */
	const told = new Map<string, { name: string; input?: Record<string, unknown>; parent?: string; view?: ToolView }>();
	/** The conversation this run is in (agy's init): steps of another one are a subagent's, under its call. */
	let root: string | undefined;
	const subagentCalls = new Map<string, string>();
	const tell = (id: string, name: string, input: Record<string, unknown> | undefined, status: 'running' | 'done' | 'error', view: ToolView | undefined, parent: string | undefined, output?: string) => {
		told.set(id, { name, ...(input ? { input } : {}), ...(parent ? { parent } : {}), ...(view ? { view } : {}) });
		const title = viewTitleOf(view);
		reply.tool({ id, name, ...(title ? { title } : {}), ...(input ? { input } : {}), status, ...(output !== undefined ? { output } : {}), ...(view ? { view } : {}), ...(parent ? { parent } : {}) });
	};
	// The tools of the user's MCP servers in Breezell, as agy names them: drawn as Breezell's MCP row of that server.
	const mcpViews = mcpToolViews(controls, name => `mcp_${BREEZELL_MCP_SERVER}_${name}`);
	const viewOf = (name: string, input: Record<string, unknown> | undefined): ToolView | undefined => mcpViews.get(name) ?? named(agyViewOfUse(name, input));
	let approvals = 0;
	/** Calls of Breezell's tools under way: an approval or a command waiting is no silence of the model's. */
	let inFlight = 0;
	/** agy's process, once started: a call of Breezell's tools that ends is word from it. */
	let proc: AgentProcess | undefined;
	const host = createBreezellToolHost(controls, {
		own,
		toolPathOf: files?.toolPathOf,
		callIdOf: agyCallIdOf,
		approve: async request => {
			const name = `mcp_${BREEZELL_MCP_SERVER}_${request.name}`;
			const toolId = request.callId ?? `ask-${++approvals}`;
			const view = viewOf(name, request.input);
			const known = told.get(toolId);
			// A subagent's call (its conversation names it): its row is on the subagent's page.
			const conversation = request.callId?.slice(0, request.callId.lastIndexOf(':'));
			const parent = conversation && conversation !== root ? subagentCalls.get(conversation) : undefined;
			if (!known) {
				tell(toolId, name, request.input, 'running', view, parent);
			}
			const title = viewTitleOf(view);
			const allowed = await reply.approve({ toolId, name, kind: request.kind, input: request.input, ...(title ? { title } : {}), ...(view ? { view } : {}) });
			return allowed && !token.isCancellationRequested;
		},
	});
	const answer: McpAnswer = async rpc => {
		inFlight++;
		try {
			return await host.answer(rpc);
		} finally {
			inFlight--;
			proc?.heard();
		}
	};

	// Its own MCP servers (not Breezell's): Breezell never sees their calls, so they run only while the user auto-approves
	// MCP tools, and agy refuses them otherwise. Its model is told they are off when its session starts, and told again
	// when that changed since it was last told (a session told nothing had them as on).
	const ownMcp = turn.autoApprove?.mcp === true;
	const settings = agySettings(run.folders, attachedOutside(turn, pathFor).map(a => a.folder ? `${a.path.replace(/[\\/]+$/, '')}/` : a.path), { ownMcp });
	const args = agyTurnArgs(turn, run, settings);
	const eager = Object.fromEntries(host.names.filter(name => EAGER_BREEZELL_TOOLS.has(name) || own.some(tool => tool.name === name)).map(name => [name, { eager: true }]));
	// Its program kept between this conversation's turns: the kept one, when it was started just so (its session aside).
	const keep = controls?.keepAlive?.pool.enabled ? controls.keepAlive : undefined;
	const key = JSON.stringify({ args: withoutArg(args, '--conversation'), cwd: turn.cwd ?? '', tools: host.listTools(), eager });
	const taken = keep ? await keep.pool.take(keep.conversation, key, turn.session, turn.session ? keep.recordOf?.(turn.session) : undefined) : undefined;
	const started = !taken?.kept;
	// Breezell's MCP server for it, for as long as its program runs (agy connects to it once): answered by the turn under
	// way. A call between turns has no turn to answer it.
	const route: AgyRoute = taken?.kept ? (taken.kept.extra as AgyKept).route : { answer: undefined };
	route.answer = answer;
	let served: Awaited<ReturnType<AgyRun['serve']>> | undefined;
	const saved: Attachment[] = [];
	try {
		// What it is given when it starts: its MCP server in the conversation's own folder (an empty one when it is offered
		// nothing, so an old address is never left there).
		if (started) {
			served = host.names.length ? await run.serve(rpc => route.answer ? route.answer(rpc) : route.idle?.(rpc) ?? Promise.resolve(noTurnAnswer(rpc))) : undefined;
			const config = path.join(run.folders.tools.local, '.agents', 'mcp_config.json');
			await fs.promises.mkdir(path.dirname(config), { recursive: true });
			await fs.promises.writeFile(config, JSON.stringify({ mcpServers: served ? { [BREEZELL_MCP_SERVER]: { ...served.entry, timeoutSeconds: -1, tools: eager } } : {} }, null, 1), 'utf8');
		}
		// Attachments saved where it may read them.
		const media = turn.continuing ? [] : turn.attachments.filter(a => a.data);
		if (media.length) {
			await fs.promises.mkdir(run.folders.attachments.local, { recursive: true });
		}
		for (const [index, attachment] of media.entries()) {
			const file = path.join(run.folders.attachments.local, savedName(attachment, index));
			await fs.promises.writeFile(file, Buffer.from(attachment.data!.base64, 'base64'));
			saved.push({ name: attachment.name, kind: 'file', path: file });
		}
	} catch (error) {
		route.answer = undefined;
		if (taken?.kept) {
			await keep!.pool.retire(keep!.conversation, taken.kept, 'its turn could not be set up');
		}
		served?.dispose();
		throw error;
	}
	const toldOwnMcp = turn.session ? run.ownMcpTold?.get(turn.session) ?? true : undefined;
	const mcpNotice = turn.session && !turn.compact && run.ownMcpTold && toldOwnMcp !== ownMcp ? ownMcp ? OWN_MCP_ON_NOTE : OWN_MCP_OFF_NOTE : undefined;
	const noticed: Turn = mcpNotice ? { ...turn, notices: [...turn.notices ?? [], mcpNotice] } : turn;
	// Pictures and PDFs as files it opens; everything else as every agent gets it.
	const given: Turn = saved.length ? { ...noticed, attachments: [...turn.attachments.filter(a => !a.data), ...saved] } : noticed;
	const content = promptOf(given, pathFor, { media: false, newSession: agySessionNote(turn, pathFor, run.folders.tools.agent, { ownMcp }), modeNotes: { plan: PLAN_NOTE } });

	// Its model's thoughts: Breezell's "Thinking" from each request of the lead's on (agy tells nothing meanwhile), their
	// text from its transcript once each step is done. A Breezell that has no "Thinking" told after gets none of this.
	const thinkingStarted = reply.thinkingStarted ? () => reply.thinkingStarted?.() : undefined;
	const transcripts = new Map<string, AgyTranscript | undefined>();
	const transcriptOf = (conversation: string): AgyTranscript | undefined => {
		if (!transcripts.has(conversation)) {
			const file = run.transcriptOf?.(conversation);
			transcripts.set(conversation, file ? new AgyTranscript(file) : undefined);
		}
		return transcripts.get(conversation);
	};
	/** A step's line did not come in time once: the turn's other steps are not waited for. */
	let thoughtWait = run.thoughtWaitMs ?? AGY_THOUGHT_WAIT_MS;
	/** The lead's calls under way: when the last one ends, its model is asked again. */
	const leadCalls = new Set<string>();
	/** The last step whose words began: its thought, if any, ended then. */
	let wordsOf: string | undefined;
	// The lead's thoughts as they are written (agy's record of the conversation, where it can be read): each step's
	// thought grows while no word of it came; its transcript line, once the step is done, tells only the rest.
	let live: AgyLiveSteps | undefined;
	let liveTimer: ReturnType<typeof setInterval> | undefined;
	/** The step of this turn's message: the steps after it are this turn's. */
	let liveFrom: number | undefined;
	/** Of each step, its thought as shown so far. */
	const shownThoughts = new Map<number, string>();
	const readLive = async () => {
		if (!live || liveFrom === undefined) {
			return;
		}
		for (const [index, written] of await live.read(liveFrom + 1) ?? []) {
			// Its words began: the rest of its thought comes once it is done.
			if (written.text) {
				continue;
			}
			const thought = written.thinking.trim();
			const shown = shownThoughts.get(index) ?? '';
			if (thought.length > shown.length && thought.startsWith(shown)) {
				shownThoughts.set(index, thought);
				reply.reasoning(thought.slice(shown.length));
			}
		}
	};

	// Its subagents: agy runs each in a conversation of its own, off its stream, and its call returns at once. Each is
	// Breezell's subagent working in the background (its row, its page), its page following its transcript: its
	// thoughts, words and calls as each step is done; its report the message it sends the lead.
	type Followed = {
		readonly id: string;
		readonly input: Record<string, unknown>;
		readonly view: Extract<ToolView, { kind: 'subagent' }>;
		readonly parent?: string;
		conversation?: string;
		transcript?: AgyTranscript;
		/** Its calls not done yet, by their step; `hidden`: not shown (its message to the lead, a tool turned off). */
		readonly calls: Map<string, { name: string; input?: Record<string, unknown>; view?: ToolView; hidden?: boolean }>;
		report?: string;
		/** Its last words, its report when it sent none. */
		last?: string;
		/** The model it works on, as the picker names it (its transcript says it). */
		model?: string;
		ended: boolean;
	};
	const followed = new Map<string, Followed>();
	const viewOfFollowed = (f: Followed, more: Partial<Extract<ToolView, { kind: 'subagent' }>> = {}): Extract<ToolView, { kind: 'subagent' }> => ({ ...f.view, ...(f.model ? { model: f.model } : {}), ...more });
	const endFollowed = (f: Followed, outcome: 'done' | 'stopped' | 'failed') => {
		if (f.ended) {
			return;
		}
		f.ended = true;
		const report = f.report ?? f.last;
		const done = outcome === 'done';
		tell(f.id, 'invoke_subagent', f.input, done ? 'done' : 'error', viewOfFollowed(f, { ...(done && report ? { report } : {}), ...(outcome === 'stopped' ? { stopped: true } : {}) }), f.parent, report);
	};
	const sawSubagentStep = (f: Followed, step: AgyTranscriptStep) => {
		if (step.type === 'GENERIC') {
			// A call's result: the call of this step, else the one waiting longest.
			const exact = `${f.conversation}:${step.step_index}`;
			const callId = f.calls.has(exact) ? exact : f.calls.keys().next().value;
			const call = callId ? f.calls.get(callId) : undefined;
			if (!callId || !call) {
				return;
			}
			f.calls.delete(callId);
			if (!call.hidden) {
				tell(callId, call.name, call.input, step.status && step.status !== 'DONE' ? 'error' : 'done', call.view, f.id, agyTranscriptOutput(step.content));
			}
			return;
		}
		if (step.type !== 'PLANNER_RESPONSE') {
			return;
		}
		const row = usageRow(typeof step.model === 'string' && step.model ? step.model : run.model ?? turn.model, { input: step.input_tokens, output: step.output_tokens, cacheRead: step.cache_read_tokens });
		if (reply.usage && hasTokens(row)) {
			reply.usage({ models: [row] });
		}
		// The model it works on (the lead's, unless it was started on another): its row and page say it.
		const model = typeof step.model === 'string' && step.model ? run.modelIdOf?.(step.model) ?? step.model : undefined;
		if (model && model !== f.model) {
			f.model = model;
			tell(f.id, 'invoke_subagent', f.input, 'running', viewOfFollowed(f), f.parent);
		}
		const words = typeof step.content === 'string' ? step.content.trim() : '';
		const thought = typeof step.thinking === 'string' ? step.thinking.trim() : '';
		if (thought && thought !== words) {
			reply.reasoning(thought, f.id);
		}
		if (words) {
			reply.text(step.content!, f.id);
			f.last = words;
		}
		const calls = Array.isArray(step.tool_calls) ? step.tool_calls : [];
		calls.forEach((raw, k) => {
			if (typeof raw?.name !== 'string') {
				return;
			}
			const callId = `${f.conversation}:${step.step_index + 1 + k}`;
			const args = raw.args && typeof raw.args === 'object' ? raw.args as Record<string, unknown> : undefined;
			// Its report: what it tells the lead.
			if (raw.name === 'send_message' && args && root && args.Recipient === root && typeof args.Message === 'string') {
				f.report = args.Message.trim() || f.report;
				f.calls.set(callId, { name: raw.name, hidden: true });
				return;
			}
			const { name, input } = agyCallOf(raw.name, args);
			if (OWN_TOOLS_OFF.has(name) || UNSHOWN_TOOLS.has(name)) {
				f.calls.set(callId, { name, hidden: true });
				return;
			}
			const view = viewOf(name, input);
			f.calls.set(callId, { name, ...(input ? { input } : {}), ...(view ? { view } : {}) });
			if (!told.has(callId)) {
				tell(callId, name, input, 'running', view, f.id);
			}
			tell(f.id, 'invoke_subagent', f.input, 'running', viewOfFollowed(f, { step: agyStepOf(view, name) }), f.parent);
		});
		// A response that calls nothing is its last.
		if (!calls.length) {
			endFollowed(f, 'done');
		}
	};
	let following: ReturnType<typeof setInterval> | undefined;
	let readingSubagents: Promise<void> | undefined;
	const readSubagents = (): Promise<void> => readingSubagents ??= (async () => {
		for (const f of followed.values()) {
			for (const step of f.ended || !f.transcript ? [] : await f.transcript.read()) {
				if (!f.ended) {
					sawSubagentStep(f, step);
				}
			}
		}
	})().catch(() => undefined).finally(() => { readingSubagents = undefined; });
	const follow = () => {
		if (!following) {
			following = setInterval(() => void readSubagents(), run.followMs ?? AGY_FOLLOW_MS);
			following.unref?.();
		}
	};
	/** The turn is over: what they wrote down last, then each still at work ends (done when it reported, or the turn went well). */
	const endSubagents = async (wentWell: boolean) => {
		if (following) {
			clearInterval(following);
			following = undefined;
		}
		await readingSubagents;
		await readSubagents();
		for (const f of followed.values()) {
			endFollowed(f, f.report || wentWell ? 'done' : 'stopped');
		}
	};
	/** The files it kept open for this turn (its transcripts and its subagents'). */
	const closeTranscripts = () => {
		for (const transcript of transcripts.values()) {
			transcript?.dispose();
		}
		for (const f of followed.values()) {
			f.transcript?.dispose();
		}
	};

	// Its program: the conversation's kept one, or one started now (kept from here, unless a turn of this conversation
	// is under way in the kept one: this one is then its own).
	let agent: AgentChild;
	let kept: KeptProcess | undefined = taken?.kept;
	if (kept) {
		agent = kept.agent;
	} else {
		try {
			agent = new AgentChild(target.start(args, turn.cwd));
		} catch (error) {
			route.answer = undefined;
			served?.dispose();
			throw error;
		}
		const ownServer = served;
		agent.onExit(() => ownServer?.dispose());
		if (keep && !taken?.busy) {
			const extra: AgyKept = { route };
			const candidate: KeptProcess = { agent, key, session: undefined, isWork: agyIsWork, extra };
			kept = keep.pool.adopt(keep.conversation, candidate) ? candidate : undefined;
		}
	}
	// A call of Breezell's tools between turns: the program went on by itself, with no turn to show it (it is closed).
	const keptHere = kept;
	route.idle = keptHere && keep ? async rpc => { void keep.pool.retire(keep.conversation, keptHere, 'it called a tool between turns'); return noTurnAnswer(rpc); } : undefined;

	return new Promise<TurnResult>((resolve, reject) => {
		let session: string | undefined;
		let error: string | undefined;
		let apiError: string | undefined;
		let gotResult = false;
		const stallMs = controls?.stallMs ?? AGY_STALL_MS;
		// An agy here ends at its interrupt, as at Ctrl+C; one in WSL ends with wsl.exe. Ended if it does not.
		const running = proc = new AgentProcess(agent, {
			token,
			askToStop: () => {
				running.endInput();
				agent.kill(target.where === 'native' ? 'SIGINT' : undefined);
			},
			killSignal: 'SIGKILL',
			stall: {
				ms: stallMs,
				counts: () => !gotResult && inFlight === 0,
				onStall: () => {
					error = `No answer from the model for ${Math.round(stallMs / 1000)} s.`;
					apiError = 'stalled';
				},
			},
		});
		const step = async (s: Record<string, unknown>) => {
			const conversation = typeof s.conversation_id === 'string' ? s.conversation_id : root;
			const id = `${conversation}:${String(s.step_index)}`;
			const parent = conversation && conversation !== root ? subagentCalls.get(conversation) : undefined;
			const lead = !!conversation && conversation === root;
			// The user's message is in: its model's first request.
			if (s.step_type === 'user_input') {
				if (lead && typeof s.step_index === 'number') {
					liveFrom = Math.max(liveFrom ?? -1, s.step_index);
				}
				if (lead && s.state === 'DONE') {
					thinkingStarted?.();
				}
				return;
			}
			if (s.step_type === 'agent_response') {
				if (typeof s.text_delta === 'string' && s.text_delta) {
					// Its words begin: what is written of its thought is told first.
					if (lead && wordsOf !== id) {
						await readLive();
					}
					wordsOf = id;
					reply.text(s.text_delta, parent);
				}
				// A model request done: its tokens, a record of its own in Breezell's usage; the lead's input is the context it takes.
				const used = s.state === 'DONE' && s.usage && typeof s.usage === 'object' ? s.usage as Record<string, unknown> : undefined;
				if (used && reply.usage) {
					const row = usageRow(run.model ?? turn.model, { input: used.input_tokens, output: used.output_tokens, cacheRead: used.cache_read_tokens });
					if (hasTokens(row)) {
						reply.usage({ ...(!parent && row.inputTokens + row.cacheReadTokens ? { context: { tokens: row.inputTokens + row.cacheReadTokens } } : {}), models: [row] });
					}
				}
				// Its thought: its size while no word of the step came (its calls come next), then its text, as written down.
				const thought = tokenCount(used?.thinking_tokens);
				if (thinkingStarted && thought && conversation && (lead || parent) && typeof s.step_index === 'number') {
					if (lead && wordsOf !== id) {
						reply.thinking?.(thought);
					}
					const transcript = transcriptOf(conversation);
					const written = transcript ? await transcript.waitFor(s.step_index, thoughtWait, token) : undefined;
					if (transcript && !written) {
						thoughtWait = 0;
					}
					const text = agyThoughtOf(written, thought);
					// What was shown of it as it was written: only the rest.
					const shown = lead ? shownThoughts.get(s.step_index) : undefined;
					const rest = !text ? undefined : !shown ? text : text.startsWith(shown) ? text.slice(shown.length) : undefined;
					if (rest) {
						reply.reasoning(rest, parent);
					}
				}
				return;
			}
			// A message to it (a subagent's report, a notice of agy's): its model goes on with it.
			if (s.step_type === 'system_message') {
				if (lead && s.state === 'DONE' && !gotResult) {
					thinkingStarted?.();
				}
				return;
			}
			// A call that starts subagents: each one Breezell's subagent under it, its page following its transcript.
			if (s.step_type === 'subagent') {
				const listed = (s.subagent_info as { subagents?: unknown } | undefined)?.subagents;
				const subagents = Array.isArray(listed) ? listed.filter((sub): sub is Record<string, unknown> => !!sub && typeof sub === 'object') : [];
				const textOf = (value: unknown) => typeof value === 'string' && value.trim() ? value.trim() : undefined;
				subagents.forEach((sub, index) => {
					const rowId = subagents.length === 1 ? id : `${id}/${index}`;
					let f = followed.get(rowId);
					if (!f) {
						const role = textOf(sub.role);
						const type = textOf(sub.type_name);
						const prompt = textOf(sub.initial_prompt);
						const input = { ...(role ? { Role: role } : {}), ...(type ? { TypeName: type } : {}), ...(prompt ? { Prompt: prompt } : {}) };
						const view = { kind: 'subagent' as const, description: role ?? type ?? 'Subagent', ...(prompt ? { prompt } : {}), ...(type ? { agentType: type } : {}), background: true };
						f = { id: rowId, input, view, ...(parent ? { parent } : {}), calls: new Map(), ended: false };
						followed.set(rowId, f);
						tell(rowId, 'invoke_subagent', input, 'running', view, parent);
					}
					const conversation = textOf(sub.conversation_id);
					if (conversation && !f.conversation) {
						f.conversation = conversation;
						subagentCalls.set(conversation, rowId);
						const file = run.transcriptOf?.(conversation);
						if (file) {
							f.transcript = new AgyTranscript(file, true);
							follow();
						}
					} else if (s.state === 'DONE' && !f.conversation) {
						// Its call is over and no subagent started.
						endFollowed(f, 'failed');
					}
				});
				// Its call returns at once (its subagents work on): its model goes on, as after any call.
				if (lead) {
					if (s.state !== 'DONE') {
						leadCalls.add(id);
					} else {
						leadCalls.delete(id);
						if (!leadCalls.size && !gotResult) {
							thinkingStarted?.();
						}
					}
				}
				return;
			}
			if (s.step_type !== 'tool') {
				return;
			}
			const info = (s.tool_info && typeof s.tool_info === 'object' ? s.tool_info : {}) as { name?: unknown; parameters?: unknown; output?: unknown; error?: { message?: unknown } };
			const { name, input } = agyCallOf(typeof s.tool_name === 'string' ? s.tool_name : typeof info.name === 'string' ? info.name : 'tool', info.parameters && typeof info.parameters === 'object' ? info.parameters as Record<string, unknown> : undefined);
			if (OWN_TOOLS_OFF.has(name) || UNSHOWN_TOOLS.has(name)) {
				return;
			}
			const view = viewOf(name, input);
			if (s.state !== 'DONE') {
				if (lead) {
					leadCalls.add(id);
				}
				tell(id, name, input, 'running', view, parent);
				return;
			}
			const failure = info.error && typeof info.error.message === 'string' ? info.error.message : undefined;
			// A lookup in Breezell's memories: its row says what kind of result and how many, as the call returned them.
			const shown = view?.kind === 'memories' ? memoriesViewOf(view, host.recalled(input)) : view;
			tell(id, name, input, failure ? 'error' : 'done', shown, parent, failure ?? outputOf(info.output));
			// Its calls are over: its model is asked again, with what they returned.
			if (lead) {
				leadCalls.delete(id);
				if (!leadCalls.size && !gotResult) {
					thinkingStarted?.();
				}
			}
		};
		const result = (r: Record<string, unknown>) => {
			gotResult = true;
			if (typeof r.conversation_id === 'string' && r.conversation_id) {
				session = r.conversation_id;
			}
			const stoppedByUser = token.isCancellationRequested && (r.status === 'INTERRUPTED' || r.status === 'CANCELED');
			if (r.status !== 'SUCCESS' && !stoppedByUser && !running.stalled) {
				error = firstLine(r.error, 600) ?? `Antigravity CLI ended with ${String(r.status ?? 'an error')}.`;
				apiError = agyApiErrorOf(typeof r.error === 'string' ? r.error : undefined);
			}
			// The turn is told. Its program kept (keepAlive): at rest for the conversation's next turn when the turn went
			// well, once what agy said is told (below); otherwise its input closes, and agy ends.
			keeping = !!kept && !!keep && keep.pool.holds(keep.conversation, kept) && r.status === 'SUCCESS' && !error && !running.stopAsked && !token.isCancellationRequested && agent.alive;
			if (!keeping) {
				running.endInput();
			}
		};
		/** The turn ended well in a kept program: it is left at rest, not ended. */
		let keeping = false;
		let settled = false;
		/** The start of the turn's conversation (agy says it once a program; a kept program's later turns are in it already). */
		const begin = async (conversation: string) => {
			root = conversation;
			session = root;
			reply.session(root);
			// What its session was told of its own MCP servers: kept only when it changed (each write is the plugin's whole state).
			if (!turn.compact && run.ownMcpTold && run.ownMcpTold.get(root) !== ownMcp) {
				run.ownMcpTold.set(root, ownMcp);
			}
			// What its transcript holds already is of the conversation's earlier turns.
			if (thinkingStarted) {
				await transcriptOf(root)?.skipToEnd();
				live ??= run.liveStepsOf?.(root);
				// Read while its model works: not while its calls run, nor once its answer is over.
				liveTimer ??= live && setInterval(() => {
					if (!readingLive && !gotResult && !leadCalls.size && liveFrom !== undefined) {
						readingLive = true;
						queue = queue.then(readLive).catch(() => undefined).then(() => { readingLive = false; });
					}
				}, run.liveMs ?? AGY_LIVE_MS);
				liveTimer?.unref?.();
			}
		};
		// One at a time, in order: a step done waits for its thought (a moment) before its calls are told.
		let queue: Promise<void> = Promise.resolve();
		let readingLive = false;
		const finish = () => {
			running.dispose();
			if (liveTimer) {
				clearInterval(liveTimer);
			}
			live?.dispose();
			closeTranscripts();
			route.answer = undefined;
			// A kept program's MCP server stays with it; a program of the turn's own goes with the turn.
			if (!kept) {
				served?.dispose();
			}
		};
		const outcome = (): TurnResult => {
			const failure = error && !token.isCancellationRequested ? error : undefined;
			return { ...(session ? { session } : {}), ...(failure ? { error: failure } : {}), ...(failure && apiError ? { apiError } : {}) };
		};
		/** Its turn went well: what its subagents wrote last told, the program left at rest for the next turn. */
		const rest = async () => {
			if (settled) {
				return;
			}
			settled = true;
			agent.unlisten(listener);
			await endSubagents(true);
			finish();
			kept!.session = session ?? kept!.session;
			await keep!.pool.release(keep!.conversation, kept!, kept!.session ? keep!.recordOf?.(kept!.session) : undefined).catch(() => undefined);
			resolve(outcome());
		};
		const listener: ChildListener = {
			message: message => {
				running.heard();
				queue = queue.then(async () => {
					if (message.event === 'init' && typeof message.conversation_id === 'string' && message.conversation_id) {
						if (message.conversation_id !== root) {
							await begin(message.conversation_id);
						}
					} else if (message.event === 'step_update' && message.step_update && typeof message.step_update === 'object') {
						await step(message.step_update as Record<string, unknown>);
					} else if (message.event === 'result' && message.result && typeof message.result === 'object') {
						result(message.result as Record<string, unknown>);
						if (keeping) {
							await rest();
						}
					}
				}).catch(() => undefined);
			},
			error: err => {
				if (settled) {
					return;
				}
				settled = true;
				agent.unlisten(listener);
				if (following) {
					clearInterval(following);
				}
				finish();
				reject(err);
			},
			close: code => {
				// Everything it said is told first, its subagents' last steps too.
				void queue.then(async () => {
					if (settled) {
						return;
					}
					settled = true;
					agent.unlisten(listener);
					await endSubagents(!token.isCancellationRequested && !running.stalled && !error && (gotResult || code === 0));
					finish();
					if (!gotResult && !token.isCancellationRequested && !running.stalled && code !== 0) {
						error = error ?? running.exitError('Antigravity CLI', code);
						apiError = apiError ?? agyApiErrorOf(running.lastErrorLine());
					}
					resolve(outcome());
				});
			},
		};
		agent.listen(listener);
		const message = { event: 'user', message: { content } };
		if (started) {
			running.write(message);
		} else {
			// A kept program says nothing of its conversation at its later turns: its start is set here, before the message.
			queue = queue.then(() => begin(kept!.session ?? turn.session!)).catch(() => undefined).then(() => running.write(message));
		}
	});
}
