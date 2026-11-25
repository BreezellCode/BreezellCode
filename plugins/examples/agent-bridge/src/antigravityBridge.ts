/*
 * Antigravity CLI's tile: its switch is the setting `agentBridge.antigravity.enabled`, which Breezell turns on only
 * after the user agreed to its consent. While it is on, the bridge asks the user's own agy whether it is signed in
 * (`agy models` answers only then) and answers conversations on its models (antigravityAgent.ts). Breezell's tools
 * reach agy as its MCP server, hosted here on the loopback (mcpHttp.ts), through the relay for an agy in WSL.
 * Everything agy is given lives in this plugin's own folder: nothing is written to agy's settings.
 */
import * as vscode from 'vscode';
import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { agyModelId, detectAgy, fetchAgyUsage, groupAgyModels, type AgyCheck, type AgyModel } from './antigravity';
import { deleteAgyConversations } from './agyConversations';
import { agyDatabasePath, agyLiveSteps } from './agyLiveSteps';
import { agyTranscriptPath, runAgyTurn, type AgyFolders, type AgyRun } from './antigravityAgent';
import { AgentBridge, asReply, SECTION, type BridgeDeps } from './bridge';
import { wslPathOf, type Target } from './cli';
import type { UsageLine } from './limits';
import { MCP_RELAY_SCRIPT, McpHttpServer, type McpAnswer } from './mcpHttp';
import { AGY_TEXTS, agyStatusOf, languageKey } from './texts';
import type { Turn, TurnControls, TurnFiles, TurnResult } from './turn';

export const AGY_TILE = 'antigravity';
export const AGY_ENABLED_KEY = 'antigravity.enabled';
export const AGY_RECHECK_COMMAND = 'agentBridge.antigravity.recheck';
/** On: a conversation deleted in Breezell is deleted in agy too (agyConversations.ts). */
export const AGY_DELETE_KEY = 'antigravity.deleteConversations';
/** What an agy session was last told of its own MCP servers, kept with the plugin (antigravityAgent.ts AgyRun.ownMcpTold). */
const OWN_MCP_TOLD_PREFIX = 'antigravity.ownMcpTold.';

export class AntigravityBridge extends AgentBridge<AgyCheck> {
	/** The models offered last, with the agy id of each effort level (agyModelId). */
	private models: AgyModel[] = [];
	private readonly mcp = new McpHttpServer();
	/** Each agy's own folder, as this computer reaches it (asked of WSL once). */
	private readonly configDirs = new WeakMap<Target, Promise<string | undefined>>();
	/** Installs whose `/usage` printed no limits: not asked again this run (Breezell sends it nothing it could take for a message). */
	private readonly noUsage = new Set<string>();

	constructor(deps: BridgeDeps) {
		super(deps, AGY_TILE, AGY_ENABLED_KEY, 'antigravity');
		const deleted = this.agentsApi()?.onDidDeleteConversations;
		if (typeof deleted === 'function') {
			this.listeners.push(deleted(e => { void this.deleteConversations(e); }));
		}
		this.start();
	}

	/**
	 * Conversations the user deleted in Breezell: what this plugin kept of them goes; in agy, they and their subagents'
	 * are deleted only while the user turned that on (AGY_DELETE_KEY), and stay otherwise.
	 */
	async deleteConversations(e: vscode.breezell.AgentDeletedConversations): Promise<void> {
		if (e.tileId !== AGY_TILE) {
			return;
		}
		for (const { session } of e.conversations) {
			void this.deps.memento?.update(`${OWN_MCP_TOLD_PREFIX}${session}`, undefined);
		}
		const target = this.target;
		if (!target || !this.enabled() || vscode.workspace.getConfiguration(SECTION).get<boolean>(AGY_DELETE_KEY, false) !== true) {
			return;
		}
		const configDir = await this.configDirOf(target);
		if (!configDir) {
			return;
		}
		await deleteAgyConversations(configDir, e.conversations.map(c => c.session)).catch(error => console.warn(`[Agent Bridge] an Antigravity CLI conversation was not deleted: ${error?.message ?? error}`));
	}

	protected detect(wslWindow: { distro?: string } | undefined): Promise<{ check: AgyCheck; target?: Target }> {
		return detectAgy({ env: this.deps.env, platform: this.deps.platform, home: this.deps.home, run: this.deps.run, isFile: this.deps.isFile, listDir: this.deps.listDir, start: this.deps.start, wslWindow });
	}

	protected isSignedIn(check: AgyCheck): boolean {
		return check.kind === 'signedIn';
	}

	protected modelsKey(check: AgyCheck): string {
		return check.kind === 'signedIn' ? `${check.version ?? ''}:${check.models.map(m => m.id).join(',')}` : '';
	}

	/** Its models, as `agy models` listed them when it was checked (signed in): one a model, its effort levels in Breezell's menu. */
	protected async listModels(_target: Target, check: AgyCheck): Promise<readonly vscode.breezell.AgentModel[]> {
		this.models = check.kind === 'signedIn' ? groupAgyModels(check.models) : [];
		return this.models.map(({ variants: _variants, ...model }) => model as vscode.breezell.AgentModel);
	}

	protected statusOf(check: AgyCheck) {
		return agyStatusOf(check, this.texts(), this.limits);
	}

	/** Its plan's limits, through its own `/usage`. */
	protected async fetchLimits(target: Target, check: AgyCheck): Promise<UsageLine[] | undefined> {
		const key = `${target.where}:${target.distro ?? ''}:${target.path}:${check.kind === 'signedIn' ? check.version ?? '' : ''}`;
		if (check.kind !== 'signedIn' || this.noUsage.has(key)) {
			return undefined;
		}
		const limits = await fetchAgyUsage(target, check.version);
		if (limits && !limits.length) {
			this.noUsage.add(key);
		}
		return limits?.length ? limits : undefined;
	}

	protected texts() {
		return AGY_TEXTS[languageKey(vscode.breezell?.language || vscode.env.language)];
	}

	protected async runOn(target: Target, turn: Turn, reply: vscode.breezell.AgentReply, token: vscode.CancellationToken, pathFor: (path: string) => string, files: TurnFiles, controls: TurnControls, conversationId: string): Promise<TurnResult> {
		const configDir = await this.configDirOf(target);
		const run: AgyRun = {
			folders: this.foldersOf(conversationId, target),
			model: agyModelId(this.models, turn.model, turn.effort),
			serve: answer => this.serve(answer, target),
			...(configDir ? {
				transcriptOf: (conversation: string) => agyTranscriptPath(configDir, conversation),
				liveStepsOf: (conversation: string) => {
					const file = agyDatabasePath(configDir, conversation);
					return file ? agyLiveSteps(file) : undefined;
				},
			} : {}),
			ownMcpTold: {
				get: session => {
					const told = this.deps.memento?.get<boolean>(`${OWN_MCP_TOLD_PREFIX}${session}`);
					return typeof told === 'boolean' ? told : undefined;
				},
				set: (session, on) => { void this.deps.memento?.update(`${OWN_MCP_TOLD_PREFIX}${session}`, on); },
			},
			modelIdOf: agyModel => this.models.find(m => m.id === agyModel || Object.values(m.variants ?? {}).includes(agyModel))?.id,
		};
		return runAgyTurn(target, turn, asReply(reply), token, pathFor, run, files, controls);
	}

	private configDirOf(target: Target): Promise<string | undefined> {
		let dir = this.configDirs.get(target);
		if (!dir) {
			dir = target.configDir().catch(() => undefined);
			this.configDirs.set(target, dir);
		}
		return dir;
	}

	/** A conversation's own folders for agy: the same each turn, so what its session was given stays where it was. */
	private foldersOf(conversationId: string, target: Target): AgyFolders {
		const key = createHash('sha1').update(conversationId).digest('hex').slice(0, 16);
		const base = path.join(this.storageRoot(), 'antigravity', 'conversations', key);
		const agentPath = (local: string) => target.where === 'wsl' ? wslPathOf(local) : local;
		const tools = path.join(base, 'tools');
		const attachments = path.join(base, 'attachments');
		return { tools: { local: tools, agent: agentPath(tools) }, attachments: { local: attachments, agent: agentPath(attachments) } };
	}

	/**
	 * This turn's MCP server for agy: its address on this computer; for an agy in WSL (whose loopback is not this
	 * computer's), the relay, which Breezell's own program runs as Node on this side and agy starts through WSL.
	 */
	private async serve(answer: McpAnswer, target: Target): Promise<Awaited<ReturnType<AgyRun['serve']>>> {
		const endpoint = await this.mcp.open(answer);
		if (target.where !== 'wsl') {
			return { entry: { serverUrl: endpoint.url, headers: { Authorization: `Bearer ${endpoint.token}` } }, dispose: () => endpoint.dispose() };
		}
		try {
			const relay = await this.relayScript();
			return {
				entry: {
					command: wslPathOf(this.deps.execPath ?? process.execPath),
					args: [relay],
					// Windows' side gets only the variables WSLENV names.
					env: { ELECTRON_RUN_AS_NODE: '1', BREEZELL_MCP_URL: endpoint.url, BREEZELL_MCP_TOKEN: endpoint.token, WSLENV: 'ELECTRON_RUN_AS_NODE:BREEZELL_MCP_URL:BREEZELL_MCP_TOKEN' },
				},
				dispose: () => endpoint.dispose(),
			};
		} catch (error) {
			endpoint.dispose();
			throw error;
		}
	}

	/** The relay script in the plugin's folder (written again when this version's differs). */
	private async relayScript(): Promise<string> {
		const file = path.join(this.storageRoot(), 'antigravity', 'mcp-relay.js');
		const now = await fs.promises.readFile(file, 'utf8').catch(() => undefined);
		if (now !== MCP_RELAY_SCRIPT) {
			await fs.promises.mkdir(path.dirname(file), { recursive: true });
			await fs.promises.writeFile(file, MCP_RELAY_SCRIPT, 'utf8');
		}
		return file;
	}

	dispose(): void {
		super.dispose();
		this.mcp.close();
	}
}
