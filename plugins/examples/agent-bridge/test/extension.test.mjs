// The plugin against a fake `vscode` and a fake Claude Code: nothing runs while the switch is off,
// turning it on checks with a busy line first, turning it off forgets, "Check again" and coming back
// to Breezell ask again (the latter at most every 30 s and without a busy line), and the page follows
// Breezell's language.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fakeChild } from './fake-child.mjs';

process.env.TZ = 'Asia/Taipei';

const root = fileURLToPath(new URL('..', import.meta.url));
const require = createRequire(import.meta.url);
const esbuild = require('esbuild');

async function load() {
	const out = mkdtempSync(join(tmpdir(), 'agent-bridge-ext-'));
	await esbuild.build({ entryPoints: [join(root, 'src/extension.ts')], bundle: true, platform: 'node', format: 'cjs', outfile: join(out, 'extension.cjs'), logLevel: 'silent', alias: { vscode: join(root, 'test/vscode-stub.cjs') } });
	const ext = require(join(out, 'extension.cjs'));
	rmSync(out, { recursive: true, force: true });
	return ext;
}

const emitter = () => {
	const listeners = [];
	const event = l => { listeners.push(l); return { dispose() { listeners.splice(listeners.indexOf(l), 1); } }; };
	event.fire = v => [...listeners].forEach(l => l(v));
	event.count = () => listeners.length;
	return event;
};

/** Enough of vscode.Uri for the folders a turn names and the files Claude Code names (encoded as VS Code does it, near enough). */
const uriOf = (scheme, authority, path) => ({
	scheme, authority, path, fsPath: path,
	with: change => uriOf(change.scheme ?? scheme, change.authority ?? authority, change.path ?? path),
	toString: () => `${scheme}://${encodeURIComponent(authority)}${path.split('/').map(encodeURIComponent).join('/')}`,
});
const Uri = {
	parse: text => {
		const m = /^([a-zA-Z][\w+.-]*):\/\/([^/?#]*)([^?#]*)/.exec(text);
		if (!m) { throw new Error(`not a URI: ${text}`); }
		return uriOf(m[1], decodeURIComponent(m[2]), decodeURIComponent(m[3] || '/'));
	},
	file: fsPath => {
		const slashed = fsPath.replace(/\\/g, '/');
		const unc = /^\/\/([^/]+)(\/.*)?$/.exec(slashed);
		if (unc) { return uriOf('file', unc[1], unc[2] ?? '/'); }
		return uriOf('file', '', /^[A-Za-z]:/.test(slashed) ? `/${slashed[0].toLowerCase()}${slashed.slice(1)}` : slashed);
	},
};

function fakeVscode({ enabled = false, language = 'zh-TW', breezellUi = true, agents = false } = {}) {
	const config = { enabled, deleteSessions: false };
	const conversationsDeleted = emitter();
	const turnStarted = emitter();
	const configChanged = emitter();
	const languageChanged = emitter();
	const windowState = emitter();
	const foldersChanged = emitter();
	const commands = new Map();
	const reported = [];
	/** Settings the plugin wrote, and what its pickers showed and were answered. */
	const updates = [];
	const picks = [];
	const picker = { pick: undefined, type: undefined };
	/** Notices the plugin showed: [kind, text]. */
	const notices = [];
	/** The agent registered for each tile, the models each was given, and how many registrations ended. */
	const agentLog = { agents: new Map(), models: [], ended: 0, imported: [] };
	const api = {
		Uri,
		env: { language: 'en' },
		breezell: {
			language,
			onDidChangeLanguage: languageChanged,
			chat: { onDidStartTurn: turnStarted },
			ui: breezellUi ? { setSignInStatus: async (tile, status) => { reported.push([tile, status === undefined ? undefined : JSON.parse(JSON.stringify(status))]); } } : {},
			...(agents ? {
				agents: {
					register: (tile, agent) => { agentLog.agents.set(tile, agent); return { dispose() { agentLog.agents.delete(tile); agentLog.ended++; } }; },
					setModels: async (tile, models) => { agentLog.models.push([tile, models.map(m => m.id), models[0]?.title]); },
					importConversation: async (tile, conversation) => { agentLog.imported.push([tile, conversation.session]); return 'created'; },
					onDidDeleteConversations: conversationsDeleted,
				},
			} : {}),
		},
		commands: { registerCommand: (id, run) => { commands.set(id, run); return { dispose() { commands.delete(id); } }; } },
		ConfigurationTarget: { Global: 1 },
		workspace: {
			getConfiguration: section => ({
				get: (key, fallback) => (section !== 'agentBridge' ? fallback : key === 'claudeCode.enabled' ? config.enabled : key === 'claudeCode.deleteSessions' ? config.deleteSessions : key === 'keepAlive.minutes' ? config.keepAliveMinutes ?? fallback : fallback),
				update: async (key, value, target) => { updates.push([key, value, target]); if (key === 'keepAlive.minutes') { config.keepAliveMinutes = value; configChanged.fire({ affectsConfiguration: name => name === `agentBridge.${key}` }); } },
			}),
			onDidChangeConfiguration: configChanged,
			onDidChangeWorkspaceFolders: foldersChanged,
			workspaceFolders: undefined,
		},
		window: {
			onDidChangeWindowState: windowState,
			showInformationMessage: async text => { notices.push(['info', text]); },
			showWarningMessage: async text => { notices.push(['warning', text]); },
			// What the user picks in a quick pick or types in an input box (the test says; none: dismissed).
			showQuickPick: async (items, options) => { picks.push({ items, options }); return picker.pick?.(items); },
			showInputBox: async options => { picks.push({ input: options }); return picker.type; },
		},
	};
	const setEnabled = value => { config.enabled = value; configChanged.fire({ affectsConfiguration: name => name === 'agentBridge.claudeCode.enabled' }); };
	return { api, config, commands, reported, agentLog, setEnabled, languageChanged, windowState, configChanged, foldersChanged, conversationsDeleted, notices, turnStarted, updates, picks, picker };
}

const SIGNED_IN = JSON.stringify({ loggedIn: true, authMethod: 'claude.ai', email: 'dev@example.com', orgName: 'Example Org' });
function fakeClaude() {
	const calls = [];
	let signedIn = true;
	const run = async (file, args) => {
		calls.push(args.join(' '));
		if (args[0] === '--version') {
			return { code: 0, stdout: '2.1.330 (Claude Code)', stderr: '' };
		}
		if (args.join(' ') === 'auth status --json') {
			return { code: signedIn ? 0 : 1, stdout: signedIn ? SIGNED_IN : JSON.stringify({ loggedIn: false }), stderr: '' };
		}
		if (args.join(' ') === '-p /model --no-session-persistence') {
			return { code: 0, stdout: 'Current model: `Opus 5.5` (effort: high)\nUsage: /model <name>. Available: sonnet, opus, default, or a full model ID.\n', stderr: '' };
		}
		if (args.join(' ') === '-p /usage --no-session-persistence') {
			return { code: 0, stdout: 'Current session: 12% used · resets 4pm (Asia/Taipei)\nCurrent week (all models): 57% used\n', stderr: '' };
		}
		return { code: 0, stdout: 'Login method: Claude Max account', stderr: '' };
	};
	return { run, calls, signOut() { signedIn = false; } };
}

const settle = () => new Promise(resolve => setTimeout(resolve, 0));
/** Turns started: the program, its arguments, its folder, and the process the test speaks for. */
/** What Claude Code's model picker offers, as its answer to `initialize` names them. */
const OFFERED = [
	{ value: 'default', resolvedModel: 'claude-opus-5-5', displayName: 'Default (recommended)', description: 'Opus 5.5 · Best for everyday, complex tasks' },
	{ value: 'opus', resolvedModel: 'claude-opus-5-5', displayName: 'Opus 5.5' },
	{ value: 'claude-opus-4-8', resolvedModel: 'claude-opus-4-8', displayName: 'Opus 4.8' },
];
/** Processes started: the program, its arguments, its folder, and the process the test speaks for. A model list is asked with initialize. */
const started = [];
const fakeClaudeProcess = { answersInitialize: true };
const startTurn = (file, args, options) => {
	const child = fakeChild();
	if (args.includes('--no-session-persistence')) {
		if (fakeClaudeProcess.answersInitialize) {
			child.offers(OFFERED);
		} else {
			setImmediate(() => child.end(1));
		}
	}
	started.push({ file, args, cwd: options.cwd, child });
	return child;
};
const turnsStarted = () => started.filter(s => s.args.includes('--permission-prompt-tool=stdio'));
const listsAsked = () => started.filter(s => s.args.includes('--no-session-persistence')).length;
const STORAGE = mkdtempSync(join(tmpdir(), 'agent-bridge-storage-'));
/** Claude Code's config folder in these tests (CLAUDE_CONFIG_DIR): its sessions live under it. */
const CONFIG = mkdtempSync(join(tmpdir(), 'agent-bridge-config-'));
process.on('exit', () => { rmSync(STORAGE, { recursive: true, force: true }); rmSync(CONFIG, { recursive: true, force: true }); });
const deps = (claude, now = () => 0) => ({ run: claude.run, env: { PATH: '/bin', CLAUDE_CONFIG_DIR: CONFIG }, platform: 'linux', home: '/home/u', isFile: f => f === '/bin/claude', now, start: startTurn, storageDir: STORAGE });

async function start(options = {}, nowRef = { t: 0 }) {
	// The stub hands out globalThis.__vscode when the bundle loads: it has to be there first.
	const vs = fakeVscode(options);
	globalThis.__vscode = vs.api;
	const ext = await load();
	const claude = fakeClaude();
	const context = { subscriptions: [] };
	const bridge = ext.activate(context, deps(claude, () => nowRef.t));
	await settle();
	return { ext, vs, claude, context, bridge, nowRef };
}

const ACCOUNT_TW = [
	{ label: '電子郵件', value: 'dev@example.com' }, { label: '組織', value: 'Example Org' }, { label: '訂閱等級', value: 'Max' }, { label: '登入方式', value: 'Claude 帳號' },
	{ label: 'Claude Code 版本', value: '2.1.330' }, { label: '程式位置', value: '/bin/claude' },
	// Keeping its programs between messages: off by default.
	{ label: '常駐程序', value: '關閉' },
];
const CONNECTED_TW = ['claudeCode', { connected: true, account: ACCOUNT_TW }];
/** The connection at once, then the same with the usage bars once /usage answered. */
const usageOf = report => report[1].usage?.map(m => [m.label, m.percent]);
const BUSY = ['claudeCode', { connected: false, busy: true }];

test('while the switch is off nothing runs and nothing is said', async () => {
	const { vs, claude, bridge } = await start();
	assert.deepEqual(claude.calls, []);
	assert.deepEqual(vs.reported, []);
	await vs.commands.get('agentBridge.claudeCode.recheck')();
	vs.windowState.fire({ focused: true });
	await settle();
	assert.deepEqual(claude.calls, [], '"Check again" and coming back do nothing while it is off');
	bridge.dispose();
});

test('turning it on checks, with a busy line first; turning it off forgets what was said', async () => {
	const { vs, claude, bridge } = await start();
	vs.setEnabled(true);
	await settle();
	assert.deepEqual(vs.reported.slice(0, 2), [BUSY, CONNECTED_TW]);
	assert.equal(vs.reported.length, 3);
	assert.deepEqual(vs.reported[2][1].account, ACCOUNT_TW);
	assert.deepEqual(usageOf(vs.reported[2]), [['目前工作階段', 12], ['本週（所有模型）', 57]]);
	assert.match(vs.reported[2][1].usage[0].detail, /^重設時間：\d+月\d+日 下午4:00$/);
	assert.equal(vs.reported[2][1].usage[1].detail, undefined);
	assert.deepEqual(claude.calls, ['--version', 'auth status --json', 'auth status --text', '-p /usage --no-session-persistence']);
	vs.setEnabled(false);
	await settle();
	assert.deepEqual(vs.reported.at(-1), ['claudeCode', undefined]);
	bridge.dispose();
});

test('already on at start: it checks at once', async () => {
	const { vs, bridge } = await start({ enabled: true });
	assert.deepEqual(vs.reported.slice(0, 2), [BUSY, CONNECTED_TW]);
	assert.deepEqual(usageOf(vs.reported[2]), [['目前工作階段', 12], ['本週（所有模型）', 57]]);
	bridge.dispose();
});

test('"Check again" asks again loudly; coming back asks quietly, and not more than every 30 seconds', async () => {
	const nowRef = { t: 0 };
	const { vs, claude, bridge } = await start({ enabled: true }, nowRef);
	claude.signOut();
	vs.reported.length = 0;
	nowRef.t = 10_000;
	vs.windowState.fire({ focused: true });
	await settle();
	assert.deepEqual(vs.reported, [], 'too soon');
	nowRef.t = 40_000;
	vs.windowState.fire({ focused: false });
	await settle();
	assert.deepEqual(vs.reported, [], 'leaving Breezell is no reason');
	vs.windowState.fire({ focused: true });
	await settle();
	assert.equal(vs.reported.length, 1, 'no busy line for a quiet check');
	assert.equal(vs.reported[0][1].connected, false);
	assert.match(vs.reported[0][1].detail, /尚未登入/);
	vs.reported.length = 0;
	await vs.commands.get('agentBridge.claudeCode.recheck')();
	assert.deepEqual(vs.reported[0], BUSY);
	bridge.dispose();
});

test('checks asked for while one runs make one more, not one each', async () => {
	const { vs, claude, bridge } = await start({ enabled: true });
	const first = bridge.check(true);
	bridge.check(false);
	bridge.check(true);
	await first;
	await settle();
	assert.equal(claude.calls.filter(c => c === '--version').length, 3, 'the start-up check, the one asked, then one more for the two asked during it');
	bridge.dispose();
	assert.ok(vs.reported.length > 0);
});

test('turned off while it ran: what it found is not shown', async () => {
	const { vs, claude, bridge } = await start();
	vs.config.enabled = true;
	const running = bridge.check(true);
	vs.config.enabled = false;
	await running;
	assert.deepEqual(vs.reported, [BUSY]);
	assert.ok(claude.calls.length > 0);
	bridge.dispose();
});

test('the page follows Breezell\'s language without running Claude Code again', async () => {
	const { vs, claude, bridge } = await start({ enabled: true });
	const calls = claude.calls.length;
	vs.api.breezell.language = 'en';
	vs.languageChanged.fire('en');
	assert.equal(claude.calls.length, calls);
	assert.deepEqual(vs.reported.at(-1)[1].account[0], { label: 'Email', value: 'dev@example.com' });
	bridge.dispose();
});

test('an older Breezell without sign-in tiles: nothing to tell, and nothing breaks', async () => {
	const { vs, bridge } = await start({ enabled: true, breezellUi: false });
	await bridge.check(true);
	assert.deepEqual(vs.reported, []);
	bridge.dispose();
});

test('everything it listens to goes with it', async () => {
	const { vs, context } = await start({ enabled: true });
	assert.ok(vs.configChanged.count() > 0 && vs.windowState.count() > 0 && vs.languageChanged.count() > 0);
	context.subscriptions.forEach(s => s.dispose());
	assert.equal(vs.configChanged.count(), 0);
	assert.equal(vs.windowState.count(), 0);
	assert.equal(vs.languageChanged.count(), 0);
	assert.equal(vs.commands.size, 0);
});

test('a WSL window names its distribution in its folders\' address; other windows are not in WSL', async () => {
	const { ext, bridge } = await start();
	assert.deepEqual(ext.wslWindowOf('wsl', [{ uri: { authority: 'wsl+Ubuntu-22.04' } }]), { distro: 'Ubuntu-22.04' });
	assert.deepEqual(ext.wslWindowOf('wsl', [{ uri: { authority: 'wsl%2BDebian' } }]), { distro: 'Debian' });
	assert.deepEqual(ext.wslWindowOf('wsl', undefined), {}, 'in WSL, distribution unknown: the default one');
	assert.equal(ext.wslWindowOf(undefined, [{ uri: { authority: '' } }]), undefined);
	assert.equal(ext.wslWindowOf('ssh-remote', [{ uri: { authority: 'ssh-remote+box' } }]), undefined);
	bridge.dispose();
});

test('usage: "Check again" always asks again; a quiet check asks at most every 5 minutes and keeps the bars meanwhile', async () => {
	const nowRef = { t: 0 };
	const { vs, claude, bridge } = await start({ enabled: true }, nowRef);
	const usageCalls = () => claude.calls.filter(c => c.startsWith('-p /usage')).length;
	assert.equal(usageCalls(), 1);
	nowRef.t = 31_000;
	vs.windowState.fire({ focused: true });
	await settle();
	assert.equal(usageCalls(), 1, 'within 5 minutes of the last /usage');
	assert.deepEqual(usageOf(vs.reported.at(-1)), [['目前工作階段', 12], ['本週（所有模型）', 57]], 'the bars stay while not asked again');
	nowRef.t = 240_000;
	vs.windowState.fire({ focused: true });
	await settle();
	assert.equal(usageCalls(), 1, 'still within 5 minutes');
	nowRef.t = 301_000;
	vs.windowState.fire({ focused: true });
	await settle();
	assert.equal(usageCalls(), 2);
	await vs.commands.get('agentBridge.claudeCode.recheck')();
	assert.equal(usageCalls(), 3);
	bridge.dispose();
});

test('usage is not asked of a Claude Code that is not signed in, and the bars go with the sign-in', async () => {
	const nowRef = { t: 0 };
	const { vs, claude, bridge } = await start({ enabled: true }, nowRef);
	claude.signOut();
	claude.calls.length = 0;
	await vs.commands.get('agentBridge.claudeCode.recheck')();
	assert.ok(!claude.calls.some(c => c.startsWith('-p')));
	assert.equal(vs.reported.at(-1)[1].connected, false);
	assert.equal(vs.reported.at(-1)[1].usage, undefined);
	bridge.dispose();
});

const replySink = () => { const log = []; return { log, reply: { text: t => log.push(['text', t]), reasoning: () => { }, tool: () => { }, session: id => log.push(['session', id]), approve: async () => true } }; };
const noToken = { isCancellationRequested: false, onCancellationRequested: () => ({ dispose() { } }) };

test('signed in, the models its own picker offers: asked once, again on "Check again"; signed out or turned off, they go', async () => {
	const nowRef = { t: 0 };
	started.length = 0;
	const { vs, claude, bridge } = await start({ enabled: true, agents: true }, nowRef);
	await settle();
	assert.ok(vs.agentLog.agents.has('claudeCode'));
	assert.deepEqual(vs.agentLog.models, [['claudeCode', ['default', 'opus', 'claude-opus-4-8'], 'Default (Opus 5.5)']], 'with their versions, as Claude Code\'s own picker lists them');
	assert.ok(!claude.calls.some(c => c.startsWith('-p /model')), 'no /model while initialize answers');
	nowRef.t = 40_000;
	vs.windowState.fire({ focused: true });
	await settle();
	assert.equal(listsAsked(), 1, 'a quiet check keeps the models it has');
	await vs.commands.get('agentBridge.claudeCode.recheck')();
	await settle();
	assert.equal(listsAsked(), 2);
	assert.equal(vs.agentLog.ended, 0, 'still the same registration');
	claude.signOut();
	await vs.commands.get('agentBridge.claudeCode.recheck')();
	assert.equal(vs.agentLog.agents.size, 0, 'signed out: no models to pick');
	bridge.dispose();
});

test('turned off, the agent goes with the tile', async () => {
	const { vs, bridge } = await start({ enabled: true, agents: true });
	vs.setEnabled(false);
	await settle();
	assert.equal(vs.agentLog.agents.size, 0);
	bridge.dispose();
});

test('a turn: Claude Code in the conversation\'s folder, with its model and session, told what it has not seen', async () => {
	const { vs, bridge } = await start({ enabled: true, agents: true });
	started.length = 0;
	const { log, reply } = replySink();
	const running = vs.agentLog.agents.get('claudeCode').runTurn({ conversationId: 'c', model: 'opus', effort: 'xhigh', text: 'hi', attachments: [], folders: ['file:///w/p', 'file:///w/q'], session: 's-1', history: [{ role: 'user', text: 'before' }] }, reply, noToken);
	await settle();
	const [turn] = turnsStarted();
	assert.equal(turn.file, '/bin/claude');
	assert.equal(turn.cwd, '/w/p');
	assert.deepEqual(turn.args.slice(-8), ['--model', 'opus', '--effort', 'xhigh', '--add-dir', '/w/q', '--resume', 's-1'], 'the workspace\'s other folder too');
	assert.match(turn.child.sent[0].message.content, /\[User\]\nbefore[\s\S]*The user's new message:\n\nhi$/);
	turn.child.say({ type: 'system', subtype: 'init', session_id: 's-1' });
	turn.child.say({ type: 'result', subtype: 'success', session_id: 's-1', result: 'ok' });
	turn.child.end(0);
	assert.deepEqual(await running, { session: 's-1' });
	assert.deepEqual(log, [['session', 's-1']]);
	bridge.dispose();
});

test('Entanglement picked: the conversation says once, above Claude Code\'s reply, that it works in Agent mode; other modes and later turns say nothing', async () => {
	const nowRef = { t: 1_000 };
	const { vs, bridge } = await start({ enabled: true, agents: true }, nowRef);
	await settle();
	const agent = vs.agentLog.agents.get('claudeCode');
	const turnOf = async (mode, conversationId, extra = {}) => {
		started.length = 0;
		if (mode) vs.turnStarted.fire({ turnId: `t-${nowRef.t}`, conversationId: 'hashed', mode });
		const { log, reply } = replySink();
		const running = agent.runTurn({ conversationId, model: 'opus', text: 'hi', attachments: [], folders: ['file:///w/p'], mode: 'agent', ...extra }, reply, noToken);
		await settle();
		const [turn] = turnsStarted();
		turn.child.say({ type: 'result', subtype: 'success', session_id: 's-1', result: 'ok' });
		turn.child.end(0);
		await running;
		return log.filter(entry => entry[0] === 'text').map(entry => entry[1]);
	};
	const note = '> Claude Code 在這裡以「代理」模式運作。「糾纏」是 Breezell 自己模型的模式，所以不會顯示糾纏模式面板。\n\n';
	assert.deepEqual(await turnOf('entanglement', 'c1'), [note], 'said before its reply');
	assert.deepEqual(await turnOf('entanglement', 'c1'), [], 'once a conversation');
	assert.deepEqual(await turnOf('agent', 'c2'), [], 'Agent: nothing');
	assert.deepEqual(await turnOf('entanglement', 'c3', { continuing: { after: 'x' } }), [], 'going on after a failed request: nothing');
	nowRef.t += 60_000;
	assert.deepEqual(await turnOf(undefined, 'c4'), [], 'no start heard just before it (an old one): nothing');
	bridge.dispose();
});

test('a window without a folder: Claude Code works in a folder of the plugin\'s own; one it cannot reach: the turn says so', async () => {
	const { vs, bridge } = await start({ enabled: true, agents: true });
	await settle();
	started.length = 0;
	const agent = vs.agentLog.agents.get('claudeCode');
	const turn = { conversationId: 'c', model: 'opus', text: 'hi', attachments: [] };
	const running = agent.runTurn({ ...turn, folders: [] }, replySink().reply, noToken);
	// Its folder is made first (a real one): the turn starts once it is there.
	for (let i = 0; i < 200 && !turnsStarted().length; i++) {
		await new Promise(resolve => setTimeout(resolve, 5));
	}
	const [own] = turnsStarted();
	assert.equal(own?.cwd, join(STORAGE, 'claude-code'));
	assert.ok(existsSync(own.cwd), 'made for it');
	own.child.say({ type: 'result', subtype: 'success', session_id: 's-9' });
	own.child.end(0);
	assert.deepEqual(await running, { session: 's-9' });
	started.length = 0;
	await assert.rejects(agent.runTurn({ ...turn, folders: ['vscode-remote://ssh-remote%2Bbox/home/u/p'] }, replySink().reply, noToken), /無法在這個對話的資料夾（vscode-remote:\/\/ssh-remote%2Bbox\/home\/u\/p）/);
	assert.equal(turnsStarted().length, 0);
	bridge.dispose();
});

test('a Claude Code that does not answer initialize: the aliases its /model lists', async () => {
	fakeClaudeProcess.answersInitialize = false;
	try {
		const { vs, claude, bridge } = await start({ enabled: true, agents: true });
		await settle();
		assert.deepEqual(vs.agentLog.models, [['claudeCode', ['default', 'sonnet', 'opus'], 'Default (Opus 5.5)']]);
		assert.ok(claude.calls.includes('-p /model --no-session-persistence'));
		bridge.dispose();
	} finally {
		fakeClaudeProcess.answersInitialize = true;
	}
});

test('a folder as Claude Code sees it: of this computer; in WSL only for the Claude Code in that distribution', async () => {
	const { ext, bridge } = await start();
	const native = { where: 'native' };
	const ubuntu = { where: 'wsl', distro: 'Ubuntu' };
	assert.equal(ext.folderFor('file:///w/p', native), '/w/p');
	assert.equal(ext.folderFor('file:///w/p', ubuntu), '/w/p', 'a folder of this computer, mapped to /mnt/... when the turn starts');
	assert.equal(ext.folderFor('vscode-remote://wsl%2Bubuntu/home/u/p', ubuntu), '/home/u/p');
	assert.equal(ext.folderFor('vscode-remote://wsl%2BDebian/home/u/p', ubuntu), undefined);
	assert.equal(ext.folderFor('vscode-remote://wsl%2BDebian/home/u/p', { where: 'wsl' }), '/home/u/p', 'the distribution not known: the default one');
	assert.equal(ext.folderFor('vscode-remote://wsl%2BUbuntu/home/u/p', native), undefined);
	assert.equal(ext.folderFor(undefined, native), undefined);
	bridge.dispose();
});

test('an SSH window whose host is this Claude Code\'s WSL distribution: its folders are Claude Code\'s, as the machine itself says', async () => {
	const { ext, bridge } = await start();
	const ubuntu = { where: 'wsl', distro: 'Ubuntu' };
	const ssh = 'vscode-remote://ssh-remote%2Bwsl-ubuntu/home/u/p';
	const reads = [];
	const local = { '\\\\wsl.localhost\\Ubuntu\\etc\\machine-id': '0123456789abcdef0123456789abcdef\n' };
	const remote = { 'ssh-remote+wsl-ubuntu': '0123456789abcdef0123456789abcdef\n', 'ssh-remote+box': 'fedcba98765432100123456789abcdef\n', 'ssh-remote+blank': '\n' };
	const hosts = new ext.SameMachineHosts(
		async file => { reads.push(file); if (!(file in local)) { throw new Error('none'); } return local[file]; },
		async uri => { reads.push(`${uri.authority}${uri.path}`); if (!(uri.authority in remote)) { throw new Error('none'); } return remote[uri.authority]; },
	);
	assert.equal(hosts.knownFolderFor(ssh, ubuntu), undefined, 'not asked yet');
	assert.equal(await hosts.folderFor(ssh, ubuntu), '/home/u/p');
	assert.equal(hosts.knownFolderFor(ssh, ubuntu), '/home/u/p');
	assert.equal(await hosts.folderFor('vscode-remote://ssh-remote%2Bwsl-ubuntu/home/u/other', ubuntu), '/home/u/other');
	assert.deepEqual(reads, ['ssh-remote+wsl-ubuntu/etc/machine-id', '\\\\wsl.localhost\\Ubuntu\\etc\\machine-id'], 'each host asked once');
	assert.equal(await hosts.folderFor('vscode-remote://ssh-remote%2Bbox/home/u/p', ubuntu), undefined, 'another machine: its files are not these');
	assert.equal(await hosts.folderFor('vscode-remote://ssh-remote%2Bsilent/home/u/p', ubuntu), undefined, 'a host that does not say');
	assert.equal(await hosts.folderFor('vscode-remote://ssh-remote%2Bblank/home/u/p', ubuntu), undefined, 'nor one with no id');
	assert.equal(await hosts.folderFor(ssh, { where: 'native' }), undefined, 'a Claude Code on Windows is not in that distribution');
	assert.equal(await hosts.folderFor('vscode-remote://wsl%2BUbuntu/home/u/p', ubuntu), undefined, 'not an SSH folder (folderFor takes WSL ones)');
	assert.equal(await hosts.folderFor('vscode-remote://ssh-remote%2Bwsl-ubuntu/home/u/p', { where: 'wsl', distro: 'Debian' }), undefined, 'another distribution\'s Claude Code: its own machine id');
	assert.equal(ext.uriOfPath('/home/u/p/a.ts', ssh, ubuntu, true), 'vscode-remote://ssh-remote%2Bwsl-ubuntu/home/u/p/a.ts', 'its files open in the SSH window');
	assert.equal(ext.uriOfPath('/home/u/p/a.ts', ssh, ubuntu), undefined, 'not known to be this machine: no link');
	hosts.forget();
	assert.equal(hosts.knownFolderFor(ssh, ubuntu), undefined, 'another Claude Code: asked again');
	bridge.dispose();
});

test('a file Claude Code names, as Breezell opens it: in the WSL window\'s distribution, on a drive, through \\\\wsl.localhost, or as it is', async () => {
	const { ext, bridge } = await start();
	const native = { where: 'native' };
	const ubuntu = { where: 'wsl', distro: 'Ubuntu' };
	const wslWindow = 'vscode-remote://wsl%2BUbuntu/home/u/p';
	assert.equal(ext.uriOfPath('/home/u/p/a.ts', wslWindow, ubuntu), 'vscode-remote://wsl%2BUbuntu/home/u/p/a.ts');
	assert.equal(ext.uriOfPath('/mnt/c/x/a.ts', wslWindow, ubuntu), 'vscode-remote://wsl%2BUbuntu/mnt/c/x/a.ts', 'a WSL window opens it in WSL');
	assert.equal(ext.uriOfPath('/home/u/p/a.ts', 'vscode-remote://wsl%2BDebian/home/u/p', ubuntu), undefined, 'another distribution\'s window cannot open it');
	assert.equal(ext.uriOfPath('/mnt/d/Dev/a.ts', 'file:///d%3A/Dev', ubuntu), 'file:///d%3A/Dev/a.ts', 'a Windows window: the drive');
	assert.equal(ext.uriOfPath('/home/u/a.ts', undefined, ubuntu), 'file://wsl.localhost/Ubuntu/home/u/a.ts', 'WSL\'s own files, through \\\\wsl.localhost');
	assert.equal(ext.uriOfPath('/home/u/a.ts', undefined, { where: 'wsl' }), undefined, 'its distribution not known');
	assert.equal(ext.uriOfPath('C:\\p\\a.ts', 'file:///c%3A/p', native), 'file:///c%3A/p/a.ts');
	assert.equal(ext.uriOfPath('/w/p/a.ts', 'file:///w/p', native), 'file:///w/p/a.ts');
	assert.equal(ext.uriOfPath('src/a.ts', 'file:///w/p', native), undefined, 'a relative path is not named');
	assert.equal(ext.uriOfPath('/x/a.ts', 'vscode-remote://ssh-remote%2Bbox/x', native), undefined, 'a remote window this Claude Code is not in');
	assert.equal(ext.localPathOf('/mnt/c/x', ubuntu), 'C:\\x');
	assert.equal(ext.localPathOf('/home/u', ubuntu), '\\\\wsl.localhost\\Ubuntu\\home\\u');
	bridge.dispose();
});

test('the page says what the conversations sync came to, and of which project; "Sync conversations" runs it again and says so in a notice', async () => {
	const { vs, bridge } = await start({ enabled: true, agents: true });
	await settle();
	const row = () => vs.reported.at(-1)[1].account?.find(r => r.label === '對話同步')?.value;
	assert.equal(row(), '這個視窗沒有開啟專案：對話會同步到它所屬的專案，請開啟該專案', 'a window without a project');
	assert.deepEqual(vs.notices, [], 'a sync of its own says nothing in a notice');
	await vs.commands.get('agentBridge.claudeCode.sync')();
	assert.deepEqual(vs.notices, [['info', '這個視窗沒有開啟專案。Claude Code 的對話會同步到它所屬的專案：開啟該專案（開啟時會自動同步）後，對話會出現在那個專案的對話清單，在 Agents 頁中也會顯示在該專案底下。']], 'pressed there: where the conversations go');
	vs.api.workspace.workspaceFolders = [{ uri: { toString: () => 'file:///w/my%20app' }, name: 'My App' }];
	await vs.commands.get('agentBridge.claudeCode.sync')();
	assert.match(row(), /^「My App」還沒有 Claude Code 對話 · /, 'no session files there (this test\'s home has none); the project by the name the window gives it');
	assert.deepEqual(vs.notices.at(-1), ['info', '「My App」還沒有 Claude Code 對話。']);
	vs.api.workspace.workspaceFolders = [{ uri: { toString: () => 'file:///w/my%20app' } }];
	await vs.commands.get('agentBridge.claudeCode.sync')();
	assert.deepEqual(vs.notices.at(-1), ['info', '「my app」還沒有 Claude Code 對話。'], 'no name given: its folder\'s');
	assert.deepEqual(vs.agentLog.imported, []);
	vs.setEnabled(false);
	await settle();
	await vs.commands.get('agentBridge.claudeCode.sync')();
	assert.deepEqual(vs.reported.at(-1), ['claudeCode', undefined], 'off: nothing runs, nothing is said');
	bridge.dispose();
});

test('a conversation deleted in Breezell: deleted in Claude Code too only while the user turned that on', async () => {
	const { vs, bridge } = await start({ enabled: true, agents: true });
	await settle();
	const session = '55555555-5555-4555-8555-555555555555';
	const project = join(CONFIG, 'projects', '-w-p');
	mkdirSync(project, { recursive: true });
	writeFileSync(join(project, `${session}.jsonl`), '{}');
	const deleted = { tileId: 'claudeCode', conversations: [{ session, folder: 'file:///w/p' }] };
	vs.conversationsDeleted.fire(deleted);
	await bridge.deleteSessions(deleted);
	assert.ok(existsSync(join(project, `${session}.jsonl`)), 'off (the default): Claude Code keeps it');
	vs.config.deleteSessions = true;
	await bridge.deleteSessions(deleted);
	assert.ok(!existsSync(join(project, `${session}.jsonl`)), 'on: gone from Claude Code too');
	bridge.dispose();
});

test('kept between messages: off by default; its button sets the time, a conversation\'s turns then go on in one Claude Code, the page says how many are kept, and set off they close', async () => {
	started.length = 0;
	const { vs, bridge } = await start({ enabled: true, agents: true });
	await settle();
	const agent = vs.agentLog.agents.get('claudeCode');
	const waitFor = async what => { for (let i = 0; i < 400 && !what(); i++) { await new Promise(resolve => setTimeout(resolve, 2)); } assert.ok(what()); };
	/** Claude Code answering its n-th message as 2.1.332 does; it ends once its input closes. */
	const answers = async (child, n) => {
		if (!child.wired) {
			child.wired = true;
			child.stdin.on('finish', () => setImmediate(() => child.end(0)));
		}
		await waitFor(() => child.sent.filter(m => m.type === 'user').length >= n);
		child.say({ type: 'system', subtype: 'init', session_id: 's-1' });
		child.say({ type: 'assistant', uuid: `a${n}`, message: { id: `m${n}`, content: [{ type: 'text', text: 'ok' }] } });
		child.say({ type: 'result', subtype: 'success', session_id: 's-1' });
	};
	const turn = n => agent.runTurn({ conversationId: 'conv', model: 'opus', text: `msg ${n}`, attachments: [], folders: [], ...(n > 1 ? { session: 's-1' } : {}) }, replySink().reply, noToken);
	const keptRow = () => vs.reported.filter(([tile]) => tile === 'claudeCode').at(-1)[1].account.at(-1);
	// Off by default: a program a turn.
	const r0 = turn(1);
	await waitFor(() => turnsStarted().length === 1);
	await answers(turnsStarted()[0].child, 1);
	await r0;
	await settle();
	assert.equal(turnsStarted()[0].child.stdinEnded, true, 'off: its input closes at the end of the turn');
	// The button: 15 minutes.
	vs.picker.pick = items => items.find(item => item.minutes === 15);
	await vs.commands.get('agentBridge.keepAlive.configure')();
	assert.deepEqual(vs.updates, [['keepAlive.minutes', 15, 1]], 'kept for every window');
	assert.match(vs.picks[0].options.placeHolder, /200–300 MB/, 'the picker says what it costs');
	assert.deepEqual(vs.picks[0].items.map(item => item.label), ['關閉', '5 分鐘', '15 分鐘', '30 分鐘', '1 小時', '自訂…']);
	assert.equal(vs.picks[0].items[0].description, '目前');
	assert.deepEqual(keptRow(), { label: '常駐程序', value: '閒置 15 分鐘後關閉' });
	const r1 = turn(1);
	await waitFor(() => turnsStarted().length === 2);
	await answers(turnsStarted()[1].child, 1);
	assert.deepEqual(await r1, { session: 's-1', entry: 'a1' });
	assert.equal(turnsStarted()[1].child.stdinEnded, undefined, 'kept');
	assert.deepEqual(keptRow(), { label: '常駐程序', value: '閒置 15 分鐘後關閉 · 目前保持 1 個' });
	const r2 = turn(2);
	await answers(turnsStarted()[1].child, 2);
	assert.deepEqual(await r2, { session: 's-1', entry: 'a2' });
	assert.equal(turnsStarted().length, 2, 'its next turn in the same Claude Code');
	// A time of the user's own, then off: closed at once.
	vs.picker.pick = items => items.at(-1);
	vs.picker.type = '45';
	await vs.commands.get('agentBridge.keepAlive.configure')();
	assert.deepEqual(vs.updates.at(-1), ['keepAlive.minutes', 45, 1]);
	assert.equal(vs.picks.at(-1).input.validateInput('0'), '請輸入 1 到 240 的整數分鐘');
	assert.equal(vs.picks.at(-1).input.validateInput('45'), undefined);
	vs.picker.pick = items => items[0];
	await vs.commands.get('agentBridge.keepAlive.configure')();
	await settle();
	assert.equal(turnsStarted()[1].child.stdinEnded, true, 'off: closed at once');
	assert.deepEqual(keptRow(), { label: '常駐程序', value: '關閉' });
	// Dismissed: nothing written.
	const writes = vs.updates.length;
	vs.picker.pick = () => undefined;
	await vs.commands.get('agentBridge.keepAlive.configure')();
	assert.equal(vs.updates.length, writes);
	bridge.dispose();
});

/** A Claude Code program that is a real file (its stamp can be read), in a folder of its own on PATH. */
function realProgram() {
	const dir = mkdtempSync(join(tmpdir(), 'agent-bridge-program-'));
	const file = join(dir, 'claude');
	writeFileSync(file, '#!/bin/sh\n');
	process.on('exit', () => rmSync(dir, { recursive: true, force: true }));
	return { dir, file };
}

/** The bridge of a window of its own: its own fake Claude Code, its own clock, and what windows share (`pid`: which window). */
async function startWindow({ program, nowRef, pid, sharedFile, clock, agents = true }) {
	const vs = fakeVscode({ enabled: true, agents });
	globalThis.__vscode = vs.api;
	const ext = await load();
	const claude = fakeClaude();
	const caches = [];
	const context = { subscriptions: [] };
	const bridge = ext.activate(context, {
		...deps(claude, () => nowRef.t),
		env: { PATH: program.dir, CLAUDE_CONFIG_DIR: CONFIG },
		isFile: f => f === program.file,
		shared: tile => { const cache = new ext.CheckCache(`${sharedFile}.${tile}.json`, pid, clock); caches.push(cache); return cache; },
	});
	await settle();
	const flushed = () => Promise.all(caches.map(cache => cache.flushed()));
	return { vs, claude, bridge, context, flushed };
}

test('coming back to Breezell asks only what may have changed: the program found before, its version while its file is unchanged, its plan while its account says the same', async () => {
	const program = realProgram();
	const nowRef = { t: 0 };
	const { vs, claude, bridge } = await startWindow({ program, nowRef, pid: 1, sharedFile: join(STORAGE, 'quiet') });
	await settle();
	assert.deepEqual(claude.calls, ['--version', 'auth status --json', 'auth status --text', '-p /usage --no-session-persistence'], 'switched on: everything');
	claude.calls.length = 0;
	nowRef.t = 40_000;
	vs.windowState.fire({ focused: true });
	await settle();
	assert.deepEqual(claude.calls, ['auth status --json'], 'coming back: whether it is still signed in, and nothing else');
	assert.deepEqual(vs.reported.at(-1)[1].account.find(row => row.label === '訂閱等級'), { label: '訂閱等級', value: 'Max' }, 'its plan as before');
	// Updated (its program file changed): its version is asked again.
	claude.calls.length = 0;
	writeFileSync(program.file, '#!/bin/sh\n# 2.1.331\n');
	nowRef.t = 80_000;
	vs.windowState.fire({ focused: true });
	await settle();
	assert.deepEqual(claude.calls, ['--version', 'auth status --json'], 'its usage not again within 5 minutes');
	// Signed out: looked for and asked again, as a check that keeps nothing.
	claude.calls.length = 0;
	claude.signOut();
	nowRef.t = 120_000;
	vs.windowState.fire({ focused: true });
	await settle();
	assert.deepEqual(claude.calls, ['auth status --json', '--version', 'auth status --json']);
	assert.equal(vs.reported.at(-1)[1].connected, false);
	// "Check again": everything, whatever was found before.
	claude.calls.length = 0;
	await vs.commands.get('agentBridge.claudeCode.recheck')();
	assert.deepEqual(claude.calls, ['--version', 'auth status --json']);
	bridge.dispose();
});

test('another window\'s check of moments ago is taken as it is: a window opening (or opened by the Agents page) starts no Claude Code of its own', async () => {
	const program = realProgram();
	const sharedFile = join(STORAGE, 'windows');
	let wall = 1_000_000;
	const clock = () => wall;
	started.length = 0;
	const a = await startWindow({ program, nowRef: { t: 0 }, pid: 101, sharedFile, clock });
	await settle();
	await a.flushed();
	assert.equal(a.claude.calls.length, 4, 'the first window asks');
	assert.equal(listsAsked(), 1, 'and lists the models');
	const b = await startWindow({ program, nowRef: { t: 0 }, pid: 102, sharedFile, clock });
	await settle();
	assert.deepEqual(b.claude.calls, [], 'the second window asks nothing');
	assert.equal(listsAsked(), 1, 'nor lists the models again');
	assert.deepEqual(b.vs.agentLog.models, [['claudeCode', ['default', 'opus', 'claude-opus-4-8'], 'Default (Opus 5.5)']], 'its picker has the same models');
	assert.deepEqual(usageOf(b.vs.reported.at(-1)), [['目前工作階段', 12], ['本週（所有模型）', 57]], 'and its page the same usage');
	// Once what was found is older than a check holds, a window asks itself; "Check again" always does.
	wall += 31_000;
	const c = await startWindow({ program, nowRef: { t: 0 }, pid: 103, sharedFile, clock });
	await settle();
	assert.deepEqual(c.claude.calls.slice(0, 3), ['--version', 'auth status --json', 'auth status --text']);
	await b.vs.commands.get('agentBridge.claudeCode.recheck')();
	assert.ok(b.claude.calls.includes('--version'));
	for (const w of [a, b, c]) {
		w.bridge.dispose();
	}
});
