/*
 * The agents Agent Bridge connects, a tile each: what activate() starts, and the commands each tile's page runs.
 * Adding an agent is a folder of its own here and an entry in this list (agents/README.md).
 */
import type { AgentBridge, BridgeDeps } from '../core/bridge';
import { AGY_RECHECK_COMMAND, AGY_TILE, AntigravityBridge } from './antigravity/bridge';
import { ClaudeCodeBridge, RECHECK_COMMAND, SYNC_COMMAND, TILE } from './claudeCode/bridge';

/** One agent: its tile (package.json contributes.breezell.ui.signIns[].id), its bridge, and its commands. */
export interface AgentEntry<B extends AgentBridge<{ readonly kind: string }> = AgentBridge<{ readonly kind: string }>> {
	readonly tile: string;
	readonly create: (deps: BridgeDeps) => B;
	/** Its commands (package.json contributes.commands), each run on its bridge. */
	readonly commands: Readonly<Record<string, (bridge: B) => unknown>>;
}

/** An agent's entry, typed by its own bridge. */
const agent = <B extends AgentBridge<{ readonly kind: string }>>(entry: AgentEntry<B>): AgentEntry => entry as unknown as AgentEntry;

/** Claude Code's tile first: activate() hands its bridge back (the tests drive it). */
export const AGENTS: readonly AgentEntry[] = [
	agent<ClaudeCodeBridge>({
		tile: TILE,
		create: deps => new ClaudeCodeBridge(deps),
		commands: { [RECHECK_COMMAND]: bridge => bridge.check(true), [SYNC_COMMAND]: bridge => bridge.syncNow() },
	}),
	agent<AntigravityBridge>({
		tile: AGY_TILE,
		create: deps => new AntigravityBridge(deps),
		commands: { [AGY_RECHECK_COMMAND]: bridge => bridge.check(true) },
	}),
];
