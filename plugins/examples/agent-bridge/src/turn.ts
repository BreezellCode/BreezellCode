/*
 * A turn of a Breezell conversation answered by one of the user's own command-line agents (Claude Code,
 * Antigravity CLI): what Breezell gives it and takes back, and what is the same for each agent — the message it
 * is sent (the user's words, the attachments, what Breezell remembers, the rules, the notices, the mode), the
 * plan card it can end with, and reading a JSON line stream. How each agent is run is its own (agent.ts,
 * antigravityAgent.ts).
 */
import type { ToolView } from './views';

export type Attachment = { readonly name: string; readonly kind: string; readonly path?: string; readonly lines?: readonly [number, number]; readonly text?: string; readonly data?: { readonly mimeType: string; readonly base64: string } };

/** What Breezell gives a turn and takes back (vscode.breezell.AgentTurn / AgentReply, kept plain here for tests). */
export interface Turn {
	readonly model: string;
	readonly text: string;
	/**
	 * What the user attached in Breezell. A file or a folder: its path, the agent opens it. A picture or a PDF: its
	 * bytes, sent with the message (or, for an agent that takes text only, saved as a file it opens). Anything else:
	 * the text Breezell's own model is given of it (a code selection's lines, problems, console or terminal output, a
	 * quoted message, a skill…). None of these: its name only.
	 */
	readonly attachments: readonly Attachment[];
	/**
	 * Breezell's chat mode, as the agent works in it (vscode.breezell.AgentTurn.mode). `plan`: it plans, and its
	 * plan shows as Breezell's plan card; `analyze` and `chat`: it reads and answers, with no tool that changes a
	 * file or runs a command. None or `agent`: as it is set up to work.
	 */
	readonly mode?: 'agent' | 'plan' | 'analyze' | 'chat';
	/** Breezell's Manual compress: the agent compresses the session's context, and nothing else. */
	readonly compact?: true;
	/**
	 * The user's auto-approve settings for the agent's own calls, which Breezell never sees before they run
	 * (vscode.breezell.AgentTurn.autoApprove; none from a Breezell up to 1.4.68). `mcp`: its own MCP servers' tools.
	 */
	readonly autoApprove?: { readonly mcp: boolean };
	/** The folder it works in, as a path of this computer or of WSL. */
	readonly cwd?: string;
	readonly session?: string;
	/** The effort level the user picked for the model; none: the agent's own. */
	readonly effort?: string;
	/** The window's other folders, as the agent reaches them: the whole workspace is its to work in. */
	readonly addDirs?: readonly string[];
	/** What was said in the conversation that this session has not seen. */
	readonly history?: readonly { readonly role: 'user' | 'assistant'; readonly text: string }[];
	/** What Breezell remembers that bears on this message: told with it. */
	readonly memories?: string;
	/**
	 * The user's rules in Breezell for this conversation's project. Without `session`: a new session takes them once
	 * (Claude Code in its system prompt, an agent without one in its first message); resuming never repeats them.
	 * With `session`: they changed since the session started (`''`: they were removed), told once with this message.
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
	/** How far a thought whose text the model keeps hidden has gone (its estimate of its tokens). */
	thinking?(tokens: number): void;
	/** Its model began a request whose thought is told after (a Breezell newer than 1.4.68): "Thinking" from now. */
	thinkingStarted?(): void;
	tool(tool: { id: string; name: string; title?: string; input?: Record<string, unknown>; status: 'running' | 'done' | 'error'; output?: string; view?: ToolView; parent?: string }): void;
	session(id: string): void;
	approve(request: { toolId: string; name: string; title?: string; input?: Record<string, unknown>; kind: 'edit' | 'command' | 'other'; reason?: string; view?: ToolView }): PromiseLike<boolean>;
	/** The agent sends a failed model request again by itself, in `delayMs`. */
	retrying?(retry: { attempt: number; maxAttempts: number; delayMs: number; error?: string }): void;
	/** What its model requests used (a Breezell newer than 1.4.65): the context ring, Box › Usage, the reply's tokens. */
	usage?(usage: Usage): void;
	/** The agent compresses its context (a Breezell newer than 1.4.65): Breezell's "Compressing…", then the ring's new size. */
	compaction?(compaction: { phase: 'started' | 'done' | 'failed'; trigger: 'manual' | 'auto'; preTokens?: number; postTokens?: number }): void;
}

export type ModelUsage = { model: string; inputTokens: number; outputTokens: number; cacheReadTokens: number; cacheWriteTokens: number };
export type Usage = { context?: { tokens: number; window?: number }; models: ModelUsage[] };

/** One of Breezell's tools an agent may call through this plugin (vscode.breezell.AgentBreezellTool, kept plain here). */
export type BreezellTool = { readonly name: string; readonly inputSchema: unknown; readonly shell?: string; readonly mcpServer?: string; readonly mcpTool?: string; readonly description?: string };
/** What a call of one of them returned (vscode.breezell.AgentBreezellToolResult). */
export type BreezellToolResult = { text: string; isError?: boolean; resultType?: string; count?: number; answers?: readonly { question_id: string; selected: readonly string[] }[] };

/** What Breezell may ask of a turn under way: stopping one of its subagents (its call's id), the turn going on. */
export interface TurnControls {
	stopSubagent?: (toolId: string) => boolean;
	/** One of the plugin's models for a model a message names (claude-haiku-5-5 → haiku): a subagent's, for its page. */
	modelIdOf?: (model: string) => string | undefined;
	/** How long a model response may stay silent before the turn stops as stalled; tests set a shorter one. */
	stallMs?: number;
	/** Breezell's tools to offer the agent in this turn (its memory lookup, its terminal, its edits…), and how to run its calls of them. */
	breezellTools?: readonly BreezellTool[];
	/** Claude Code's own MCP servers (its settings, its plugins, claude.ai's connectors) stay on beside Breezell's. Default: on. */
	ownMcpServers?: boolean;
	/** Its subagents work on the conversation's model and at its effort, whatever the agent would pick for them. Default: off. */
	subagentsFollowModel?: boolean;
	callBreezellTool?: (name: string, input: Record<string, unknown>, toolUseId?: string) => PromiseLike<BreezellToolResult>;
	/**
	 * What each session has used so far, per model, as Claude Code last said it: its totals are the whole session's,
	 * so a turn tells only what it added to them.
	 */
	usageTotals?: { of(session: string): Readonly<Record<string, ModelUsage>> | undefined; keep(session: string, totals: Record<string, ModelUsage>): void };
}

/** The files the agent names, as Breezell reaches them: their URIs, and (for a Write it asks about) their text now. */
export interface TurnFiles {
	uriOf(path: string): string | undefined;
	textOf(path: string): Promise<string | undefined>;
	/**
	 * A path the agent names, as Breezell's own tools take it, when that is not the agent's own spelling: an agent in
	 * WSL working on a folder of this computer names `/mnt/c/…`, which Breezell's window knows as `C:\…`. Undefined: as it is.
	 */
	toolPathOf?(path: string): string | undefined;
}

export interface Cancel {
	readonly isCancellationRequested: boolean;
	onCancellationRequested(listener: () => void): { dispose(): void };
}

/** What a turn ends with: the session to go on with, the error the agent ended with, its last record, the kind of model error. */
export type TurnResult = { session?: string; error?: string; entry?: string; apiError?: string };

/** After asking it to stop, how long the agent may take before its process is ended. */
export const STOP_GRACE_MS = 3000;

/** The effort levels Breezell's model menu offers. */
export const EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max'] as const;
export type Effort = typeof EFFORTS[number];

export const firstLine = (value: unknown, max = 160): string | undefined => {
	if (typeof value !== 'string') {
		return undefined;
	}
	const line = value.split(/\r?\n/).map(l => l.trim()).find(Boolean);
	return line ? (line.length > max ? `${line.slice(0, max - 1)}…` : line) : undefined;
};

/** Pictures and PDFs whose bytes go with the message (Claude Code takes them as image and document blocks). */
export function sentWithMessage(attachments: readonly Attachment[]): Attachment[] {
	return attachments.filter(a => a.data && (a.kind === 'image' ? /^image\/(png|jpeg|gif|webp)$/.test(a.data.mimeType) : a.kind === 'document' && a.data.mimeType === 'application/pdf'));
}

/** How one agent takes its message, beyond what every agent gets. */
export interface PromptOptions {
	/** Pictures and PDFs go with the message as blocks of their own (sentWithMessage). Off: an agent that takes text only. Default: on. */
	readonly media?: boolean;
	/**
	 * What a new session (no `session`) is told before the message: what an agent without a system prompt of its own
	 * for Breezell would find there (how it works in Breezell, the user's rules). Never with `continuing`.
	 */
	readonly newSession?: string;
	/** A note for the message in these modes, besides Breezell's own for Analyze and Chat (modeNoteOf). */
	readonly modeNotes?: Partial<Record<NonNullable<Turn['mode']>, string>>;
}

/**
 * What the user sends, with the attachments named so the agent can read them where they are, after what was
 * said in the conversation that its session has not seen.
 */
export function promptOf(turn: Turn, pathFor: (path: string) => string, options: PromptOptions = {}): string {
	// Going on after a failed model request: its session has the message and what was done so far.
	if (turn.continuing) {
		const after = turn.continuing.after.split(/\r?\n/)[0].trim().slice(0, 300);
		return `Your previous request to the model failed before you finished${after ? ` (${after})` : ''}. Continue the task from where you stopped. Do not start over, and do not repeat steps that are already done.`;
	}
	const files = turn.attachments.filter(a => a.path && !a.text && !a.data).map(a => `- ${a.kind === 'folder' ? 'Folder' : 'File'}: ${pathFor(a.path!)}`);
	const withMessage = options.media === false ? [] : sentWithMessage(turn.attachments);
	const sent = withMessage.map(a => `- ${a.kind === 'document' ? 'PDF' : 'Image'}: ${a.name} (with this message)`);
	// Neither a path to open, nor sent, nor told as text (a video, a kind the agent does not take, one too large): its name.
	const others = turn.attachments.filter(a => !a.text && !withMessage.includes(a) && !(a.path && !a.data)).map(a => `- ${a.name} (${a.kind}, not passed on)`);
	const lines = [...files, ...sent, ...others];
	// Code selections, problems, console output and the like, as Breezell's own model is given them: with the agent's paths.
	const texts = turn.attachments.filter(a => a.text).map(a => a.path ? a.text!.split(a.path).join(pathFor(a.path)) : a.text!);
	const remembered = turn.memories?.trim()
		? `\n\n<breezell-memories>\nWhat Breezell remembers that may bear on this message (notes from earlier work: check them against the code before relying on them):\n\n${turn.memories.trim()}\n</breezell-memories>`
		: '';
	// The rules changed while the session went on: the agent keeps the ones it started with, so this message says the new ones.
	const rulesChange = turn.session && turn.rules !== undefined
		? turn.rules.trim()
			? `<breezell-rules>\nThe user changed their rules in Breezell. These replace the Breezell rules you were given at the start of this conversation:\n\n${turn.rules.trim()}\n</breezell-rules>`
			: '<breezell-rules>\nThe user removed their rules in Breezell: the Breezell rules you were given at the start of this conversation no longer apply.\n</breezell-rules>'
		: '';
	const notices = turn.notices?.map(notice => notice.trim()).filter(Boolean) ?? [];
	const noticed = notices.length ? `<breezell-notices>\nFrom Breezell, not from the user:\n\n${notices.join('\n\n')}\n</breezell-notices>` : '';
	const text = turn.text.trim() ? turn.text : 'No new message from the user. Breezell has news of commands you ran in its terminal:';
	const modeNote = (turn.mode && options.modeNotes?.[turn.mode]) || modeNoteOf(turn.mode);
	const message = [(lines.length ? `${text}\n\nAttached in Breezell:\n${lines.join('\n')}` : text), ...texts, remembered.trim(), rulesChange, noticed, modeNote].filter(Boolean).join('\n\n');
	const preface = !turn.session && options.newSession?.trim() ? `${options.newSession.trim()}\n\n` : '';
	if (!turn.history?.length) {
		return `${preface}${message}`;
	}
	const said = turn.history.map(entry => `[${entry.role === 'user' ? 'User' : 'Assistant'}]\n${entry.text}`).join('\n\n');
	return `${preface}Earlier in this Breezell conversation, in messages you have not seen (oldest first):\n\n${said}\n\n---\nThe user's new message:\n\n${message}`;
}

/**
 * The files and folders the user attached from outside the folders the agent works in, as the agent names them: the
 * user gave them, so it may open them without asking (each agent writes its own rules for them). None when it goes on.
 */
export function attachedOutside(turn: Turn, pathFor: (path: string) => string): { readonly path: string; readonly folder: boolean }[] {
	const comparable = (p: string) => p.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();
	const roots = [turn.cwd, turn.cwd && pathFor(turn.cwd), ...(turn.addDirs ?? [])].filter((dir): dir is string => !!dir).map(comparable);
	const out: { path: string; folder: boolean }[] = [];
	for (const attachment of turn.continuing ? [] : turn.attachments) {
		if (!attachment.path || attachment.data || (attachment.kind !== 'file' && attachment.kind !== 'folder')) {
			continue;
		}
		const at = pathFor(attachment.path);
		if (!roots.some(root => comparable(at) === root || comparable(at).startsWith(`${root}/`))) {
			out.push({ path: at, folder: attachment.kind === 'folder' });
		}
	}
	return out;
}

/** A line for the message in a mode that changes nothing: its tools for changes are off, and it should not try. */
export function modeNoteOf(mode: Turn['mode']): string {
	return mode === 'analyze' ? 'Breezell is in Analyze mode for this message: read, search and answer. Make no changes and run no commands.'
		: mode === 'chat' ? 'Breezell is in Chat mode for this message: answer in the conversation. Make no changes and run no commands.'
			: '';
}

/** The user's Breezell rules, as a new session is told them. */
export function rulesTextOf(rules: string, standsFor: string): string {
	return `The user set these rules in Breezell, the editor this conversation runs in, for this project. Follow them as you follow the instructions in ${standsFor}.\n\n${rules.trim()}`;
}

/**
 * An agent's plan, as Breezell's plan card takes it: its title (the first heading), the plan itself, and its steps
 * for the card's to-dos (the numbered lines, else the bulleted ones outside a Context section, else the sections),
 * at least one.
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

/** What the agent is told when its plan went to Breezell's plan card: its turn ends there. */
export const PLAN_SHOWN = 'Breezell shows your plan to the user as a plan card. End your turn now with one short line and make no changes: the user chooses Execute to have you carry it out, or tells you what to change.';

/** Each JSON object an agent writes on `stream`, one a line (stream-json); other lines are passed over. */
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
