/*
 * What an agent's model requests used, as Breezell keeps it (vscode.breezell.AgentUsage): a row of tokens a model
 * request (input, output, cache read, cache write). Each agent reads its own counts (Claude Code's Anthropic usage
 * objects, agy's step usage); adding them up and telling them is the same for each.
 */
import type { ModelUsage } from './turn';

/** The four counts of a row, in the order Breezell's records name them. */
export const USAGE_KEYS = ['inputTokens', 'outputTokens', 'cacheReadTokens', 'cacheWriteTokens'] as const;

/** A count an agent says (tokens): a whole number of them, or none. */
export const tokenCount = (value: unknown): number => typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0;

/** A row of one model's tokens, from what the agent says of each count (anything not a count is none). */
export function usageRow(model: string, counts: { readonly input?: unknown; readonly output?: unknown; readonly cacheRead?: unknown; readonly cacheWrite?: unknown }): ModelUsage {
	return { model, inputTokens: tokenCount(counts.input), outputTokens: tokenCount(counts.output), cacheReadTokens: tokenCount(counts.cacheRead), cacheWriteTokens: tokenCount(counts.cacheWrite) };
}

/** Whether a row counts anything: one that counts nothing is not told. */
export const hasTokens = (row: ModelUsage): boolean => USAGE_KEYS.some(key => row[key] > 0);

/** Two rows of one model added up (the model is the first's). */
export function addUsage(a: ModelUsage, b: ModelUsage): ModelUsage {
	return { model: a.model, inputTokens: a.inputTokens + b.inputTokens, outputTokens: a.outputTokens + b.outputTokens, cacheReadTokens: a.cacheReadTokens + b.cacheReadTokens, cacheWriteTokens: a.cacheWriteTokens + b.cacheWriteTokens };
}

/** What `total` counts beyond `before` (never below none), per count. */
export function usageBeyond(total: ModelUsage, before: ModelUsage | undefined): ModelUsage {
	return before
		? { model: total.model, inputTokens: Math.max(0, total.inputTokens - before.inputTokens), outputTokens: Math.max(0, total.outputTokens - before.outputTokens), cacheReadTokens: Math.max(0, total.cacheReadTokens - before.cacheReadTokens), cacheWriteTokens: Math.max(0, total.cacheWriteTokens - before.cacheWriteTokens) }
		: total;
}
