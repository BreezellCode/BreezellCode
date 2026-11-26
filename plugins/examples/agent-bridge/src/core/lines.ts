/*
 * Reading what an agent writes one JSON object a line: its stream-json output as it comes, and the files it writes
 * down a line at a time (agy's transcripts). Only whole lines are read, however the output is cut into chunks, and a
 * line costs its own length once: a long one (a big tool result) arriving in many chunks is gathered, not copied and
 * searched again at each chunk.
 */

/** A line as an agent's JSON object; none for a line that is not one. */
function objectOf(raw: string): Record<string, unknown> | undefined {
	const line = raw.trim();
	if (!line.startsWith('{')) {
		return undefined;
	}
	try {
		const parsed: unknown = JSON.parse(line);
		return parsed && typeof parsed === 'object' ? parsed as Record<string, unknown> : undefined;
	} catch {
		return undefined;
	}
}

/** Each JSON object an agent writes on `stream`, one a line (stream-json); other lines are passed over. */
export function onJsonLines(stream: NodeJS.ReadableStream | null | undefined, handle: (message: Record<string, unknown>) => void): void {
	/** The line begun in earlier chunks, in pieces. */
	let pieces: string[] = [];
	stream?.setEncoding('utf8');
	stream?.on('data', (data: string) => {
		let start = 0;
		for (let end = data.indexOf('\n'); end >= 0; end = data.indexOf('\n', start)) {
			let line = data.slice(start, end);
			if (pieces.length) {
				pieces.push(line);
				line = pieces.join('');
				pieces = [];
			}
			start = end + 1;
			const message = objectOf(line);
			if (message) {
				handle(message);
			}
		}
		if (start < data.length) {
			pieces.push(start ? data.slice(start) : data);
		}
	});
}

/**
 * Whole lines out of bytes read a piece at a time (a file read as it grows). A newline is never inside a character's
 * bytes, so a line is cut there safely. A line longer than `maxLine` is passed over unread, up to its end.
 */
export class LineSplitter {
	private pieces: Buffer[] = [];
	private pending = 0;
	private skipping = false;

	constructor(private readonly maxLine = Number.POSITIVE_INFINITY) { }

	/** Calls `line` with each line `chunk` ends (with what came of it before), without its newline. */
	push(chunk: Buffer, line: (bytes: Buffer) => void): void {
		let start = 0;
		for (let end = chunk.indexOf(0x0a, start); end >= 0; end = chunk.indexOf(0x0a, start)) {
			const tail = chunk.subarray(start, end);
			start = end + 1;
			if (this.skipping) {
				this.skipping = false;
				continue;
			}
			if (this.pieces.length) {
				const whole = Buffer.concat([...this.pieces, tail], this.pending + tail.length);
				this.pieces = [];
				this.pending = 0;
				line(whole);
			} else {
				line(tail);
			}
		}
		if (start >= chunk.length || this.skipping) {
			return;
		}
		const rest = chunk.subarray(start);
		if (this.pending + rest.length > this.maxLine) {
			this.skipping = true;
			this.pieces = [];
			this.pending = 0;
			return;
		}
		// A copy: the caller may read its next chunk into the same memory.
		this.pieces.push(Buffer.from(rest));
		this.pending += rest.length;
	}

	/** What was gathered of an unfinished line goes (the file was written anew). */
	reset(): void {
		this.pieces = [];
		this.pending = 0;
		this.skipping = false;
	}
}
