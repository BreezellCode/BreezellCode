import * as vscode from 'vscode';

/**
 * Focus Player — an example Breezell plugin.
 *
 * - The sound is made in the panel (Web Audio): rain, deep focus noise and a soft
 *   chord pad, so the plugin ships no audio files. Your own music folder plays too.
 * - With Breezell it follows conversation turns through `vscode.breezell.chat`
 *   (the "chat.events" permission: mode, outcome and duration, never the content):
 *   a chime when a turn finishes, and optionally music while the agent works.
 * - The panel is an editor tab: drag it out, or run "Move Editor into New Window",
 *   to give it a window of its own.
 */

const AUDIO_EXTENSIONS = new Set(['.mp3', '.ogg', '.oga', '.wav', '.flac', '.m4a', '.aac', '.opus', '.webm']);

interface Track { name: string; src: string }

export function activate(context: vscode.ExtensionContext) {
	const breezell = vscode.breezell as typeof vscode.breezell | undefined;
	const mediaRoot = vscode.Uri.joinPath(context.extensionUri, 'media');
	let panel: vscode.WebviewPanel | undefined;
	let playing = false;
	let nowPlaying = '';
	let runningTurns = 0;
	let startedByTurn = false;

	const config = () => vscode.workspace.getConfiguration('focusPlayer');
	const musicFolder = (): vscode.Uri | undefined => {
		const folder = config().get<string>('musicFolder', '').trim();
		return folder ? vscode.Uri.file(folder) : undefined;
	};

	const status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 90);
	status.command = 'focusPlayer.toggle';
	const updateStatus = () => {
		status.text = playing ? `$(debug-pause) ${nowPlaying || 'Focus'}` : '$(play) Focus';
		status.tooltip = playing ? 'Focus Player: pause' : 'Focus Player: play';
		status.show();
	};
	updateStatus();
	context.subscriptions.push(status);

	const post = (message: unknown) => void panel?.webview.postMessage(message);

	const readTracks = async (webview: vscode.Webview): Promise<Track[]> => {
		const folder = musicFolder();
		if (!folder) {
			return [];
		}
		try {
			const entries = await vscode.workspace.fs.readDirectory(folder);
			return entries
				.filter(([name, type]) => type === vscode.FileType.File && AUDIO_EXTENSIONS.has(name.slice(name.lastIndexOf('.')).toLowerCase()))
				.map(([name]) => ({ name: name.replace(/\.[^.]+$/, ''), src: webview.asWebviewUri(vscode.Uri.joinPath(folder, name)).toString() }))
				.sort((a, b) => a.name.localeCompare(b.name));
		} catch {
			return [];
		}
	};

	const sendInit = async () => {
		if (!panel) {
			return;
		}
		post({
			type: 'init',
			tracks: await readTracks(panel.webview),
			folder: musicFolder()?.fsPath ?? '',
			settings: {
				chime: config().get<boolean>('chimeWhenTurnFinishes', true),
				playWhileAgentWorks: config().get<boolean>('playWhileAgentWorks', false),
			},
			breezell: { available: !!breezell, signedIn: breezell?.account.isSignedIn ?? false },
		});
	};

	const openPanel = (focus = true): vscode.WebviewPanel => {
		if (panel) {
			if (focus) {
				panel.reveal();
			}
			return panel;
		}
		const roots = [mediaRoot, ...(musicFolder() ? [musicFolder()!] : [])];
		panel = vscode.window.createWebviewPanel('focusPlayer', 'Focus Player', { viewColumn: vscode.ViewColumn.Beside, preserveFocus: !focus }, {
			enableScripts: true,
			retainContextWhenHidden: true,
			localResourceRoots: roots,
		});
		panel.iconPath = vscode.Uri.joinPath(mediaRoot, 'icon.png');
		panel.webview.html = html(panel.webview, mediaRoot);
		panel.onDidDispose(() => {
			panel = undefined;
			playing = false;
			updateStatus();
		});
		panel.webview.onDidReceiveMessage(async message => {
			switch (message?.type) {
				case 'ready':
					await sendInit();
					break;
				case 'state':
					playing = !!message.playing;
					nowPlaying = typeof message.title === 'string' ? message.title : '';
					updateStatus();
					break;
				case 'chooseFolder':
					await vscode.commands.executeCommand('focusPlayer.chooseFolder');
					break;
				case 'setting':
					if (message.key === 'chime' || message.key === 'playWhileAgentWorks') {
						await config().update(message.key === 'chime' ? 'chimeWhenTurnFinishes' : 'playWhileAgentWorks', !!message.value, vscode.ConfigurationTarget.Global);
					}
					break;
			}
		});
		return panel;
	};

	context.subscriptions.push(
		vscode.commands.registerCommand('focusPlayer.open', () => openPanel()),
		vscode.commands.registerCommand('focusPlayer.toggle', () => {
			if (!panel) {
				openPanel();
				return;
			}
			post({ type: 'toggle' });
		}),
		vscode.commands.registerCommand('focusPlayer.chooseFolder', async () => {
			const picked = await vscode.window.showOpenDialog({ canSelectFolders: true, canSelectFiles: false, canSelectMany: false, openLabel: 'Use this folder' });
			if (!picked?.[0]) {
				return;
			}
			await config().update('musicFolder', picked[0].fsPath, vscode.ConfigurationTarget.Global);
			// localResourceRoots are fixed when the panel is made: make it again to read the new folder.
			if (panel) {
				panel.dispose();
				openPanel();
			}
		}),
		vscode.workspace.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration('focusPlayer')) {
				void sendInit();
			}
		}),
	);

	if (!breezell) {
		return;
	}
	context.subscriptions.push(
		breezell.account.onDidChangeSignIn(signedIn => post({ type: 'signin', signedIn })),
		breezell.chat.onDidStartTurn(turn => {
			runningTurns++;
			if (config().get<boolean>('playWhileAgentWorks', false) && !playing) {
				openPanel(false);
				startedByTurn = true;
				post({ type: 'play' });
			}
			post({ type: 'turn', phase: 'start', mode: turn.mode });
		}),
		breezell.chat.onDidFinishTurn(turn => {
			runningTurns = Math.max(0, runningTurns - 1);
			post({ type: 'turn', phase: 'finish', mode: turn.mode, outcome: turn.outcome, seconds: Math.round(turn.durationMs / 1000) });
			if (config().get<boolean>('chimeWhenTurnFinishes', true)) {
				post({ type: 'chime', outcome: turn.outcome });
			}
			if (runningTurns === 0 && startedByTurn) {
				startedByTurn = false;
				post({ type: 'pause' });
			}
		}),
	);
}

function html(webview: vscode.Webview, mediaRoot: vscode.Uri): string {
	const nonce = Array.from({ length: 24 }, () => Math.floor(Math.random() * 36).toString(36)).join('');
	const script = webview.asWebviewUri(vscode.Uri.joinPath(mediaRoot, 'player.js'));
	const style = webview.asWebviewUri(vscode.Uri.joinPath(mediaRoot, 'player.css'));
	return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource}; media-src ${webview.cspSource} blob:; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<link rel="stylesheet" href="${style}">
<title>Focus Player</title>
</head>
<body>
<main class="player">
	<header>
		<div>
			<h1>Focus Player</h1>
			<p class="muted" id="subtitle">Sounds to focus by</p>
		</div>
		<span class="pill" id="breezell">…</span>
	</header>

	<section class="scenes" role="tablist" aria-label="Sound">
		<button role="tab" data-scene="rain">🌧 <span>Rain</span></button>
		<button role="tab" data-scene="deep">🌊 <span>Deep focus</span></button>
		<button role="tab" data-scene="pad">🎹 <span>Soft pad</span></button>
		<button role="tab" data-scene="tracks">🎧 <span>My music</span></button>
	</section>

	<section class="stage">
		<canvas id="wave" width="560" height="120" aria-hidden="true"></canvas>
		<div class="now" id="now">Rain</div>
		<div class="controls">
			<button class="round" id="prev" title="Previous">⏮</button>
			<button class="round big" id="play" title="Play / Pause">▶</button>
			<button class="round" id="next" title="Next">⏭</button>
		</div>
		<label class="volume">🔈 <input type="range" id="volume" min="0" max="100" value="60"> 🔊</label>
		<p class="hint" id="hint" hidden>Click ▶ once to let the panel play sound.</p>
	</section>

	<section class="tracks" id="tracksBox" hidden>
		<div class="row">
			<span class="muted" id="folder">No folder chosen</span>
			<button id="choose">Choose folder…</button>
		</div>
		<ol id="trackList"></ol>
	</section>

	<section class="settings">
		<label><input type="checkbox" id="chime"> Chime when the AI finishes a turn</label>
		<label><input type="checkbox" id="auto"> Play while the agent works</label>
	</section>

	<section class="activity">
		<h2>Breezell activity</h2>
		<ul id="log"><li class="muted">Conversation turns show up here.</li></ul>
	</section>
</main>
<script nonce="${nonce}" src="${script}"></script>
</body>
</html>`;
}

export function deactivate() { }
