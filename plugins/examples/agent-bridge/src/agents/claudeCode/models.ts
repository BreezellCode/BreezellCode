/*
 * The models Claude Code offers, as Breezell's model picker shows them: those its own picker lists (its answer to
 * the Agent SDK's `initialize`, no message sent and nothing used), or from an older Claude Code the aliases `/model`
 * lists.
 */
import type { ChildProcess } from 'node:child_process';
import type { Target } from '../../core/cli';
import { onJsonLines } from '../../core/lines';
import { EFFORTS, STOP_GRACE_MS } from '../../core/turn';

/**
 * A model of Claude Code's: always one of Claude's, which Breezell's model picker shows with its Claude
 * icon; `efforts`: the levels it takes, which Breezell's model menu offers.
 */
export type ClaudeModel = { id: string; title: string; description?: string; family: 'claude'; efforts?: Effort[]; /** The model it stands for (`resolvedModel`): what a message it wrote names. */ resolved?: string };
type Effort = typeof EFFORTS[number];

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
