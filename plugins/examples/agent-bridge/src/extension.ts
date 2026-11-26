/*
 * Agent Bridge: the user's own command-line agents in Breezell's chat, each on a tile of its own on Box › Models ›
 * Sign in (agents/index.ts lists them). What every tile does is core/bridge.ts; what is each agent's own is its
 * folder in agents/. While a tile's switch is off, nothing of it runs.
 */
import * as vscode from 'vscode';
import * as os from 'node:os';
import { sharedChecksIn, type BridgeDeps } from './core/bridge';
import { createRunner } from './core/cli';
import { KEEP_ALIVE_COMMAND, pickKeepAlive } from './core/keepAlivePicker';
import { AGENTS } from './agents';
import type { ClaudeCodeBridge } from './agents/claudeCode/bridge';

// What the tests (and other parts) know from here.
export { FOCUS_RECHECK_MS, SECTION, type BridgeDeps, type BridgeTexts } from './core/bridge';
export { folderName, localPathOf, wslWindowOf } from './core/paths';
export { SameMachineHosts, folderFor, uriOfPath } from './core/workspace';
export { ENABLED_KEY, ENABLED_SETTING, TILE, RECHECK_COMMAND, SYNC_COMMAND, DELETE_SESSIONS_KEY, OWN_MCP_SERVERS_KEY, SUBAGENTS_FOLLOW_KEY, AUTO_SYNC_MS, ClaudeCodeBridge } from './agents/claudeCode/bridge';
export { AGY_TILE, AGY_ENABLED_KEY, AGY_RECHECK_COMMAND, AGY_DELETE_KEY, AntigravityBridge } from './agents/antigravity/bridge';
export { CheckCache } from './core/checks';
export { KeptProcesses, KEEP_ALIVE_SETTING } from './core/keepAlive';
export { KEEP_ALIVE_COMMAND, minutesOf } from './core/keepAlivePicker';

/** Starts every agent's tile; hands back Claude Code's bridge (the first). */
export function activate(context: vscode.ExtensionContext, deps?: Partial<BridgeDeps>): ClaudeCodeBridge {
	const home = deps?.home ?? os.homedir();
	const storageDir = deps?.storageDir ?? context.globalStorageUri?.fsPath;
	const full: BridgeDeps = {
		run: deps?.run ?? createRunner(home),
		env: deps?.env ?? process.env,
		platform: deps?.platform ?? process.platform,
		home,
		isFile: deps?.isFile,
		listDir: deps?.listDir,
		now: deps?.now,
		start: deps?.start,
		storageDir,
		memento: deps?.memento ?? context.globalState,
		workspaceMemento: deps?.workspaceMemento ?? context.workspaceState,
		execPath: deps?.execPath ?? process.execPath,
		shared: deps?.shared ?? (storageDir ? sharedChecksIn(storageDir) : undefined),
	};
	const bridges = AGENTS.map(agent => {
		const bridge = agent.create(full);
		context.subscriptions.push(bridge);
		return { agent, bridge };
	});
	for (const { agent, bridge } of bridges) {
		for (const [command, run] of Object.entries(agent.commands)) {
			context.subscriptions.push(vscode.commands.registerCommand(command, () => run(bridge)));
		}
	}
	// Every tile's "Keep running between messages": one setting for all of them.
	context.subscriptions.push(vscode.commands.registerCommand(KEEP_ALIVE_COMMAND, () => pickKeepAlive()));
	return bridges[0].bridge as ClaudeCodeBridge;
}

export function deactivate(): void {
	// The bridges go with the extension's subscriptions; Breezell forgets the tiles' status with the extension host.
}
