// A Claude Code process for tests: the test writes its stream-json output and reads, line by line,
// what was written to its input. Nothing real runs.
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';

export function fakeChild() {
	const child = new EventEmitter();
	child.stdin = new PassThrough();
	child.stdout = new PassThrough();
	child.stderr = new PassThrough();
	child.killed = false;
	child.exitCode = null;
	child.kill = () => { child.killed = true; };
	child.sent = [];
	/** Called with each message written to its input (a test answers like Claude Code here). */
	child.onSent = undefined;
	let pending = '';
	child.stdin.setEncoding('utf8');
	child.stdin.on('data', d => { pending += d; let i; while ((i = pending.indexOf('\n')) >= 0) { const message = JSON.parse(pending.slice(0, i)); pending = pending.slice(i + 1); child.sent.push(message); child.onSent?.(message); } });
	child.stdin.on('finish', () => { child.stdinEnded = true; });
	child.say = obj => child.stdout.write(`${JSON.stringify(obj)}\n`);
	child.end = (code = 0) => { child.exitCode = code; child.stdout.end(); setImmediate(() => child.emit('close', code)); };
	/** Answers `initialize` as Claude Code does, with these models; its input closed, it ends. */
	child.offers = models => {
		child.onSent = message => {
			if (message.type === 'control_request' && message.request?.subtype === 'initialize') {
				child.say({ type: 'control_response', response: { subtype: 'success', request_id: message.request_id, response: { models } } });
			}
		};
		child.stdin.on('finish', () => child.end(0));
		return child;
	};
	return child;
}
