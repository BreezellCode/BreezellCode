/*
 * agy's transcript of one conversation (`brain/<conversation>/.system_generated/logs/transcript_full.jsonl` in its own
 * folder), read as it grows: a JSON line a step, written once the step is done. Its model's steps
 * (`PLANNER_RESPONSE`) carry their thought (`thinking`) and their words (`content`); a subagent's page shows all of
 * its steps.
 *
 * The file stays open while the turn goes on, and only what was written since it was last read is read: a read that
 * finds nothing new asks only its size (for an agy in WSL read from Windows, each file operation is a round trip into
 * WSL). Its model's lines are told from the others before they are decoded, so a big tool output is never turned into
 * text when only the model's steps are wanted.
 */
import * as fs from 'node:fs';
import { LineSplitter } from '../../core/lines';
import { isAgentId, joinFor } from '../../core/paths';
import type { Cancel } from '../../core/turn';

/** Where agy writes down a conversation's steps, in its own folder (program.ts agyConfigDir); none for an id it would not give. */
export function agyTranscriptPath(configDir: string, conversation: string): string | undefined {
	return isAgentId(conversation) ? joinFor(configDir)(configDir, 'brain', conversation, '.system_generated', 'logs', 'transcript_full.jsonl') : undefined;
}

/** How long a model step's thought is waited for once agy said the step is done (it writes the step down right after). */
export const AGY_THOUGHT_WAIT_MS = 2_000;
const THOUGHT_POLL_MS = 40;
/** A line of the transcript longer than this (a huge tool output) is passed over unread. */
const TRANSCRIPT_LINE_MAX = 32 * 1024 * 1024;
/** How long a transcript may show no growth before it is looked at by its name again (written anew in another file). */
const SAME_FILE_CHECK_MS = 2_000;
/** The type of agy's model steps, as it writes it in a step's line. */
const MODEL_STEP = 'PLANNER_RESPONSE';

/** A step as agy writes it down: its model's (`PLANNER_RESPONSE`), a call's result (`GENERIC`), a message to it (`SYSTEM_MESSAGE`). */
export type AgyTranscriptStep = {
	readonly step_index: number;
	readonly type: string;
	readonly status?: string;
	readonly content?: string;
	readonly thinking?: string;
	readonly model?: string;
	readonly input_tokens?: number;
	readonly output_tokens?: number;
	readonly cache_read_tokens?: number;
	readonly tool_calls?: readonly { readonly name?: unknown; readonly args?: unknown }[];
};

/** A model step's thought and words, as its line has them. */
export type AgyWrittenStep = { readonly thinking?: string; readonly content?: string };

export class AgyTranscript {
	private handle: fs.promises.FileHandle | undefined;
	private offset = 0;
	private checkedAt = 0;
	private readonly lines = new LineSplitter(TRANSCRIPT_LINE_MAX);
	private readonly steps = new Map<number, AgyWrittenStep>();
	private reading: Promise<unknown> = Promise.resolve();
	private disposed = false;

	/** `everyStep`: every step is read (a subagent's, whose page shows them); otherwise only its model's. */
	constructor(private readonly file: string, private readonly everyStep = false, private readonly now: () => number = Date.now) { }

	/** What it holds now is of the conversation's earlier turns: only what is written from here on is read. */
	async skipToEnd(): Promise<void> {
		this.offset = await fs.promises.stat(this.file).then(stat => stat.size, () => 0);
	}

	/** Reads what was written since it was last read: those steps, in order. One read at a time. */
	read(): Promise<AgyTranscriptStep[]> {
		const read = this.reading.then(() => this.readMore());
		this.reading = read.catch(() => undefined);
		return read;
	}

	/** A step's line, once it is there. */
	stepOf(index: number): AgyWrittenStep | undefined {
		return this.steps.get(index);
	}

	/** Reads until a step's line is there, for at most `waitMs` (or until the turn is stopped). */
	async waitFor(index: number, waitMs: number, token: Cancel): Promise<AgyWrittenStep | undefined> {
		const until = this.now() + waitMs;
		for (; ;) {
			await this.read();
			const found = this.steps.get(index);
			if (found || token.isCancellationRequested || this.now() >= until) {
				return found;
			}
			await new Promise(resolve => setTimeout(resolve, THOUGHT_POLL_MS));
		}
	}

	/** The turn is over: the file is closed. */
	dispose(): void {
		this.disposed = true;
		const handle = this.handle;
		this.handle = undefined;
		void handle?.close().catch(() => undefined);
	}

	private async readMore(): Promise<AgyTranscriptStep[]> {
		try {
			const handle = await this.opened();
			if (!handle) {
				return [];
			}
			const { size } = await handle.stat();
			if (size === this.offset && this.now() - this.checkedAt >= SAME_FILE_CHECK_MS) {
				// No growth for a while: still the file its name is (not written anew in another one)?
				this.checkedAt = this.now();
				const named = await fs.promises.stat(this.file).catch(() => undefined);
				if (named && named.size !== size) {
					await this.reopen();
					return this.readMore();
				}
			}
			if (size < this.offset) {
				// Written anew: from its start.
				this.offset = 0;
				this.lines.reset();
			}
			if (size === this.offset) {
				return [];
			}
			const chunk = Buffer.alloc(size - this.offset);
			let got = 0;
			while (got < chunk.length) {
				const { bytesRead } = await handle.read(chunk, got, chunk.length - got, this.offset + got);
				if (!bytesRead) {
					break;
				}
				got += bytesRead;
			}
			this.offset += got;
			const out: AgyTranscriptStep[] = [];
			this.lines.push(chunk.subarray(0, got), line => {
				const step = this.stepIn(line);
				if (step) {
					out.push(step);
				}
			});
			return out;
		} catch {
			// Not there (yet), or not readable: nothing of it; opened again next time.
			await this.reopen();
			return [];
		}
	}

	/** A line's step, when it is one of the steps read; its model's steps are kept for stepOf. */
	private stepIn(line: Buffer): AgyTranscriptStep | undefined {
		if (!this.everyStep && line.indexOf(MODEL_STEP) < 0) {
			return undefined;
		}
		let step: Record<string, unknown>;
		try {
			step = JSON.parse(line.toString('utf8')) as Record<string, unknown>;
		} catch {
			// A line that is not one: passed over.
			return undefined;
		}
		if (!step || typeof step.step_index !== 'number' || typeof step.type !== 'string') {
			return undefined;
		}
		if (step.type === MODEL_STEP) {
			this.steps.set(step.step_index, { ...(typeof step.thinking === 'string' ? { thinking: step.thinking } : {}), ...(typeof step.content === 'string' ? { content: step.content } : {}) });
		}
		return step as AgyTranscriptStep;
	}

	private async opened(): Promise<fs.promises.FileHandle | undefined> {
		if (!this.handle && !this.disposed) {
			this.handle = await fs.promises.open(this.file, 'r').catch(() => undefined);
			this.checkedAt = this.now();
			if (this.disposed) {
				void this.handle?.close().catch(() => undefined);
				this.handle = undefined;
			}
		}
		return this.handle;
	}

	private async reopen(): Promise<void> {
		const handle = this.handle;
		this.handle = undefined;
		await handle?.close().catch(() => undefined);
	}
}

/** A call's output as agy writes it down: without the times it puts first. */
export function agyTranscriptOutput(content: string | undefined): string {
	return (content ?? '').replace(/^(?:(?:Created|Completed) At: [^\n]*\n)+/, '');
}

/** A step's thought as Breezell shows it: its text, when it thought (its stream counted tokens of it) and wrote one apart from its words. */
export function agyThoughtOf(step: AgyWrittenStep | undefined, thinkingTokens: number): string | undefined {
	const thought = step?.thinking?.trim();
	// With no thought, agy writes its words there again.
	return thinkingTokens > 0 && thought && thought !== step?.content?.trim() ? thought : undefined;
}
