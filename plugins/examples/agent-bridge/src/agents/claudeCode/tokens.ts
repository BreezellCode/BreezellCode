/*
 * What Claude Code's model requests used, as Breezell keeps it: a request record each (its lead's requests as they
 * end, its subagents' when the turn's result counts them), adding up to Claude Code's own count, and the context the
 * conversation takes of its model's window.
 */
import { addUsage, hasTokens, USAGE_KEYS, usageBeyond, usageRow } from '../../core/usage';
import type { ModelUsage } from '../../core/turn';

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

/** Each model's context window, as Claude Code's results said it: the context ring's size while a turn is under way. */
const contextWindows = new Map<string, number>();
export const contextWindowOf = (model: string): number | undefined => contextWindows.get(model);

/** The windows a result's `modelUsage` names, kept for the turns after it. */
export function rememberContextWindows(modelUsage: unknown): void {
	for (const [model, used] of Object.entries(modelUsage && typeof modelUsage === 'object' ? modelUsage as Record<string, { contextWindow?: unknown }> : {})) {
		if (typeof used?.contextWindow === 'number' && used.contextWindow > 0) {
			contextWindows.set(model, used.contextWindow);
		}
	}
}

/** One model request's tokens as an Anthropic usage object says them (input, output, cache read, cache write). */
export function requestUsageOf(model: string, usage: unknown): ModelUsage | undefined {
	const u = usage && typeof usage === 'object' ? usage as Record<string, unknown> : undefined;
	return u ? usageRow(model, { input: u.input_tokens, output: u.output_tokens, cacheRead: u.cache_read_input_tokens, cacheWrite: u.cache_creation_input_tokens }) : undefined;
}

/**
 * The request records a result settles, Breezell's own way (a row a model request). The lead's requests were told as
 * they ended (`told`); its subagents' are told now (`subagents`: their input and cache exact, their output in part);
 * what the result counts beyond all of them (the subagents' output, a compression, Claude Code's own small requests)
 * goes onto that model's last subagent request, or a row of its own, so that the rows add up to Claude Code's count.
 */
export function requestRows(counted: readonly ModelUsage[], told: ReadonlyMap<string, ModelUsage>, subagents: readonly ModelUsage[]): ModelUsage[] {
	const out: ModelUsage[] = [];
	for (const model of [...new Set([...counted.map(c => c.model), ...subagents.map(s => s.model)])]) {
		const rows = subagents.filter(s => s.model === model).map(s => ({ ...s }));
		const total = counted.find(c => c.model === model);
		if (total) {
			const before = told.get(model);
			const rest = { model } as ModelUsage;
			for (const key of USAGE_KEYS) {
				rest[key] = Math.max(0, total[key] - (before?.[key] ?? 0) - rows.reduce((sum, row) => sum + row[key], 0));
			}
			if (rows.length) {
				rows[rows.length - 1] = addUsage(rows[rows.length - 1], rest);
			} else if (hasTokens(rest)) {
				rows.push(rest);
			}
		}
		out.push(...rows.filter(hasTokens));
	}
	return out;
}

/** What a result says this turn used (its `usage`: the lead's requests), as the tokens of one model. */
export function turnUsageOf(usage: unknown, model: string): ModelUsage[] {
	const used = requestUsageOf(model, usage && typeof usage === 'object' ? usage : {})!;
	return hasTokens(used) ? [used] : [];
}

/**
 * What Claude Code's result says it used, per model, less what was told before in the same run (`told`, kept up to
 * date): its totals grow when it goes on after a background subagent and ends again.
 */
export function usageSince(modelUsage: unknown, told: Map<string, ModelUsage>): ModelUsage[] {
	const out: ModelUsage[] = [];
	for (const [model, raw] of Object.entries(modelUsage && typeof modelUsage === 'object' ? modelUsage as Record<string, Record<string, unknown>> : {})) {
		const total = usageRow(model, { input: raw?.inputTokens, output: raw?.outputTokens, cacheRead: raw?.cacheReadInputTokens, cacheWrite: raw?.cacheCreationInputTokens });
		const since = usageBeyond(total, told.get(model));
		told.set(model, total);
		if (hasTokens(since)) {
			out.push(since);
		}
	}
	return out;
}
