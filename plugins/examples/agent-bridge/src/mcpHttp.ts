/*
 * Breezell's tools for an agent that reaches its MCP servers itself (Antigravity CLI): an MCP server on this
 * computer's loopback (127.0.0.1), the Streamable HTTP transport answering each request with plain JSON. One server
 * for the plugin, one path and one token for each turn; nothing is reachable from another computer, and a request
 * without the turn's token is refused. An agent in WSL, which does not reach Windows' loopback, gets the relay
 * script instead: an MCP stdio server that Breezell's own program runs as Node and passes each message on here.
 */
import * as http from 'node:http';
import { randomBytes, timingSafeEqual } from 'node:crypto';

/** One turn's MCP server: where it is and its token, until it is disposed. */
export interface McpEndpoint {
	readonly url: string;
	readonly token: string;
	dispose(): void;
}

/** The answer to one MCP message (breezellTools.ts BreezellToolHost.answer). */
export type McpAnswer = (rpc: { id?: unknown; method?: unknown; params?: Record<string, unknown> }) => Promise<unknown>;

/** The most a request may hold: a new file's whole content goes in one. */
const MAX_BODY_BYTES = 64 * 1024 * 1024;

export class McpHttpServer {
	private server: http.Server | undefined;
	private listening: Promise<number> | undefined;
	private readonly routes = new Map<string, { readonly token: string; readonly answer: McpAnswer }>();

	/** A path of its own for one turn's tools; the server starts with the first. */
	async open(answer: McpAnswer): Promise<McpEndpoint> {
		const port = await this.listen();
		const id = randomBytes(12).toString('hex');
		const token = randomBytes(24).toString('hex');
		this.routes.set(id, { token, answer });
		return {
			url: `http://127.0.0.1:${port}/mcp/${id}`,
			token,
			dispose: () => {
				this.routes.delete(id);
				if (!this.routes.size) {
					this.close();
				}
			},
		};
	}

	close(): void {
		const server = this.server;
		this.server = undefined;
		this.listening = undefined;
		server?.close();
	}

	private listen(): Promise<number> {
		if (!this.listening) {
			const server = http.createServer((req, res) => { void this.handle(req, res); });
			this.server = server;
			this.listening = new Promise<number>((resolve, reject) => {
				server.once('error', reject);
				server.listen(0, '127.0.0.1', () => {
					server.off('error', reject);
					const address = server.address();
					resolve(typeof address === 'object' && address ? address.port : 0);
				});
			});
			this.listening.catch(() => { this.server = undefined; this.listening = undefined; });
		}
		return this.listening;
	}

	private async handle(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
		const id = /^\/mcp\/([0-9a-f]{24})$/.exec((req.url ?? '').split('?')[0])?.[1];
		const route = id ? this.routes.get(id) : undefined;
		const given = /^Bearer\s+(.+)$/i.exec(req.headers.authorization ?? '')?.[1] ?? '';
		if (!route || !sameToken(given, route.token)) {
			res.writeHead(route ? 401 : 404).end();
			req.resume();
			return;
		}
		// Plain JSON answers only: no stream to open, nothing to end.
		if (req.method !== 'POST') {
			res.writeHead(405, { allow: 'POST' }).end();
			req.resume();
			return;
		}
		let body: string;
		try {
			body = await readBody(req);
		} catch {
			res.writeHead(413).end();
			return;
		}
		let message: unknown;
		try {
			message = JSON.parse(body);
		} catch {
			res.writeHead(400, { 'content-type': 'application/json' }).end(JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }));
			return;
		}
		const messages = Array.isArray(message) ? message : [message];
		const requests = messages.filter(m => m && typeof m === 'object' && (m as { id?: unknown }).id !== undefined);
		// Notifications (and answers to nothing asked) are taken without an answer.
		if (!requests.length) {
			res.writeHead(202).end();
			return;
		}
		const answers = await Promise.all(requests.map(m => route.answer(m as Parameters<McpAnswer>[0]).catch(error => ({ jsonrpc: '2.0', id: (m as { id?: unknown }).id ?? null, error: { code: -32603, message: String(error?.message ?? error) } }))));
		res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(Array.isArray(message) ? answers : answers[0]));
	}
}

function sameToken(given: string, token: string): boolean {
	const a = Buffer.from(given);
	const b = Buffer.from(token);
	return a.length === b.length && timingSafeEqual(a, b);
}

function readBody(req: http.IncomingMessage): Promise<string> {
	return new Promise((resolve, reject) => {
		const chunks: Buffer[] = [];
		let size = 0;
		req.on('data', (chunk: Buffer) => {
			size += chunk.length;
			if (size > MAX_BODY_BYTES) {
				reject(new Error('too large'));
				req.destroy();
				return;
			}
			chunks.push(chunk);
		});
		req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
		req.on('error', reject);
	});
}

/**
 * The relay: an MCP stdio server that passes each message to BREEZELL_MCP_URL (with BREEZELL_MCP_TOKEN) and writes
 * back the answer. Written to the plugin's folder and run with Breezell's own program as Node (ELECTRON_RUN_AS_NODE)
 * for an agent in WSL, whose loopback is not this computer's. Messages are passed on as they come: a call waiting on
 * the user's approval holds up no other.
 */
export const MCP_RELAY_SCRIPT = `'use strict';
// Breezell Agent Bridge: passes an agent's MCP messages on to Breezell's tools (written by the plugin; safe to delete).
const url = process.env.BREEZELL_MCP_URL;
const token = process.env.BREEZELL_MCP_TOKEN;
let buffer = '';
let pending = 0;
let ended = false;
const done = () => { if (ended && !pending) { process.exit(0); } };
const say = message => process.stdout.write(JSON.stringify(message) + '\\n');
async function pass(line) {
	let message;
	try { message = JSON.parse(line); } catch { return; }
	const asks = message && typeof message === 'object' && message.id !== undefined;
	try {
		const response = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json', authorization: 'Bearer ' + token }, body: line });
		if (!asks || response.status === 202) { return; }
		const text = (await response.text()).trim();
		if (response.ok && text) { process.stdout.write(text + '\\n'); return; }
		say({ jsonrpc: '2.0', id: message.id, error: { code: -32000, message: 'Breezell answered ' + response.status } });
	} catch (error) {
		if (asks) { say({ jsonrpc: '2.0', id: message.id, error: { code: -32000, message: 'Breezell is not reachable: ' + String(error && error.message || error) } }); }
	}
}
process.stdin.setEncoding('utf8');
process.stdin.on('data', data => {
	buffer += data;
	for (let i = buffer.indexOf('\\n'); i >= 0; i = buffer.indexOf('\\n')) {
		const line = buffer.slice(0, i).trim();
		buffer = buffer.slice(i + 1);
		if (line) { pending++; pass(line).finally(() => { pending--; done(); }); }
	}
});
process.stdin.on('end', () => { ended = true; done(); });
`;
