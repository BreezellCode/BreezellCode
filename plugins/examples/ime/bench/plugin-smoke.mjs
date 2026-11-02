#!/usr/bin/env node
// The input method plugin itself, outside Breezell (on Linux or macOS too): its bundle built
// against bench/fake-vscode.mjs, activated, keys typed into a fake editor and the chat. With
// useSystemHost off it composes here, from the models in <data dir>; with a host's socket it
// composes there.
//   plugin-smoke.mjs <scratch dir> <data dir>
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpSync, createReadStream, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const [scratch, data] = process.argv.slice(2);
const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const out = join(scratch, 'plugin-smoke', 'extension.mjs');
const hook = join(root, 'dist', 'system', 'uninstall-hook.cjs');
mkdirSync(dirname(out), { recursive: true });
const esbuild = join(root, 'node_modules', '.bin', 'esbuild');
execFileSync(esbuild, [join(root, 'src', 'extension.ts'), '--bundle', '--platform=node', '--format=esm', '--external:vscode',
	`--outfile=${out}`, '--log-level=warning', '--banner:js=import { createRequire } from "module"; const require = createRequire(import.meta.url);']);
// "vscode" next to the bundle is the fake, the same module the test drives.
const fake = join(dirname(out), 'node_modules', 'vscode');
mkdirSync(fake, { recursive: true });
writeFileSync(join(fake, 'package.json'), JSON.stringify({ name: 'vscode', type: 'module', main: 'index.mjs' }));
writeFileSync(join(fake, 'index.mjs'), `export * from ${JSON.stringify(pathToFileURL(join(here, 'fake-vscode.mjs')).href)};\n`);
// Nothing of the user's: a scratch home (config, learned words), no system host.
process.env.HOME = join(scratch, 'plugin-smoke', 'home');
process.env.XDG_CONFIG_HOME = '';
process.env.XDG_DATA_HOME = '';
mkdirSync(process.env.HOME, { recursive: true });
const vscode = await import(pathToFileURL(join(here, 'fake-vscode.mjs')).href);
const ext = await import(pathToFileURL(out).href);

let failed = 0;
const check = (name, ok, got) => { if (!ok) failed++; console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : `: ${got}`}`); };
const settle = () => new Promise(r => setTimeout(r, 30));
const type = async text => { for (const ch of text) { await vscode.commands.executeCommand('type', { text: ch }); } await settle(); };

Object.assign(vscode.settings, { dataPath: data, useSystemHost: false, chineseScript: 'traditional', prediction: true });
const prose = new vscode.FakeEditor('Notes: ', 'markdown');
vscode.window.activeTextEditor = prose;
const contextAt = (extensionPath, name) => {
	const state = new Map();
	return {
		extensionPath, extensionUri: { fsPath: extensionPath }, extension: { packageJSON: { version: '1.0.0' } },
		globalState: { get: k => state.get(k), update: async (k, v) => { state.set(k, v); } },
		globalStorageUri: { fsPath: join(scratch, 'plugin-smoke', name) }, subscriptions: [],
	};
};
const context = contextAt(root, 'storage');
// This part is not a first start: the setting up has its own part below.
const home = join(process.env.HOME, '.config', 'breezell-ime');
rmSync(home, { recursive: true, force: true });
mkdirSync(home, { recursive: true });
writeFileSync(join(home, 'plugin-set-up'), 'test');
ext.activate(context);
check(`activates on ${process.platform}`, vscode.calls.some(c => c[0] === 'log' && String(c[1]).startsWith('activated')));
await vscode.commands.executeCommand('breezellIme.toggle');
await settle();
check('turns on, composing here (no system host)', vscode.calls.some(c => c[0] === 'log' && String(c[1]).startsWith('loaded pinyin')), JSON.stringify(vscode.calls.filter(c => c[0] !== 'decoration').slice(-4)));
await type('nihao');
const panel = vscode.calls.filter(c => c[0] === 'panel').at(-1)?.[1];
check('composing shows the panel', panel?.candidates?.[0] === '你好' && panel.reading === 'ni hao' && panel.badge === '中 · 繁', JSON.stringify(panel));
await type(' ');
check('Space puts the first candidate in', prose.text === 'Notes: 你好', prose.text);
const offered = vscode.calls.filter(c => c[0] === 'panel').at(-1)?.[1];
check('the words that may come next are offered, with no numbers', offered?.highlight === 0 && offered.labels === 'none' && offered.candidates.length > 0, JSON.stringify(offered));
await type(',');
check('a mark goes in full width (and the words offered go)', prose.text === 'Notes: 你好，', prose.text);
await type('jain');
await vscode.commands.executeCommand('breezellIme.backspace');
await settle();
const decorations = vscode.calls.filter(c => c[0] === 'decoration' && c[1].length).map(c => c[1][0]);
check('Backspace while composing takes back a key', decorations.at(-1) === 'jai', JSON.stringify(decorations.slice(-3)));
await vscode.commands.executeCommand('breezellIme.cancel');
await settle();
check('Escape drops it', prose.text === 'Notes: 你好，', prose.text);

// A digit after a commit is a digit in the editor too.
await type('nihao ');
const beforeDigits = prose.text;
await type('12');
check('a digit after a commit goes in as a digit', prose.text === `${beforeDigits}12`, prose.text);
check('and the words offered go', vscode.calls.filter(c => c[0] === 'panel').at(-1)?.[1] === null, JSON.stringify(vscode.calls.filter(c => c[0] === 'panel').at(-1)));
// Tab takes the first of the words offered, in the editor by its key binding.
await type('nihao ');
const offeredNow = vscode.calls.filter(c => c[0] === 'panel').at(-1)?.[1];
const beforeTab = prose.text;
await vscode.commands.executeCommand('breezellIme.tab');
await settle();
check('Tab takes the first word offered', offeredNow?.labels === 'none' && offeredNow.highlight === 0 && prose.text === beforeTab + offeredNow.candidates[0], `${prose.text} ${JSON.stringify(offeredNow)}`);
await vscode.commands.executeCommand('breezellIme.cancel');
await settle();

// What is on offer does not stay: a click elsewhere, Esc, the time, the switch.
const lastPanel = () => vscode.calls.filter(c => c[0] === 'panel').at(-1)?.[1];
await type('nihao ');
check('offered again', lastPanel()?.labels === 'none', JSON.stringify(lastPanel()));
await vscode.commands.executeCommand('breezellIme.surface', false, 'none');
await settle();
check('the focus leaves the editor: the words offered close', lastPanel() === null, JSON.stringify(lastPanel()));
await vscode.commands.executeCommand('breezellIme.surface', true, 'editor');
await settle();
const beforeDrop = prose.text;
await type('nih');
await vscode.commands.executeCommand('breezellIme.surface', true, 'chat');
await settle();
check('the focus goes to the chat box: the composition and its panel close, nothing goes in', lastPanel() === null && prose.text === beforeDrop, `${prose.text} ${JSON.stringify(lastPanel())}`);
const chatComposing = await vscode.commands.executeCommand('breezellIme.chatKey', { key: 'n' });
check('typing in the chat box does not draw in the editor', chatComposing?.composing && lastPanel() === null, JSON.stringify(lastPanel()));
await vscode.commands.executeCommand('breezellIme.chatKey', { key: 'i' });
await vscode.commands.executeCommand('breezellIme.chatForget', 'FocusLost');
const afterLost = await vscode.commands.executeCommand('breezellIme.chatKey', { key: 'h' });
check('the chat box loses the focus: what it composed goes', afterLost?.preedit === 'h', JSON.stringify(afterLost));
await vscode.commands.executeCommand('breezellIme.chatForget', 'FocusLost');
await vscode.commands.executeCommand('breezellIme.surface', true, 'editor');
await settle();
await type('nihao ');
check('offered in the editor once more', lastPanel()?.labels === 'none', JSON.stringify(lastPanel()));
await vscode.commands.executeCommand('breezellIme.cancel');
await settle();
check('Esc closes them', lastPanel() === null, JSON.stringify(lastPanel()));
await type('nihao ');
const beforeWait = prose.text;
await new Promise(r => setTimeout(r, 5200));
check('left alone, they close by themselves', lastPanel() === null, JSON.stringify(lastPanel()));
await vscode.commands.executeCommand('breezellIme.tab');
await settle();
check('and Tab takes nothing any more', prose.text === beforeWait, prose.text);
await vscode.workspace.getConfiguration('breezellIme').update('prediction', false);
await settle();
await type('nihao ');
const beforeOff = prose.text;
check('the switch off: a commit is just a commit, with no panel', lastPanel() === null && beforeOff.endsWith('你好'), `${beforeOff} ${JSON.stringify(lastPanel())}`);
const chatCommit = await (async () => {
	await vscode.commands.executeCommand('breezellIme.surface', true, 'chat');
	await settle();
	await vscode.commands.executeCommand('breezellIme.chatKey', { key: 'n' });
	await vscode.commands.executeCommand('breezellIme.chatKey', { key: 'i' });
	return vscode.commands.executeCommand('breezellIme.chatKey', { key: ' ' });
})();
check('in the chat box too', chatCommit?.commit?.length === 1 && !chatCommit.predicting && !chatCommit.candidates.length, JSON.stringify(chatCommit));
await vscode.commands.executeCommand('breezellIme.surface', true, 'editor');
await vscode.workspace.getConfiguration('breezellIme').update('prediction', true);
await settle();
await vscode.commands.executeCommand('breezellIme.cancel');
await settle();

// Reading the code and the chat box: with the user's leave (a Breezell that has the permissions).
{
	const reads = { 'editor.read': 'ask', 'chat.input': 'ask' };
	const asked = [];
	let answer = true;
	let chatBox = { text: '', before: '', recent: '' };
	let chatReads = 0;
	vscode.breezell.permissions = ['editor.read', 'chat.input'];
	vscode.breezell.permissionState = async p => reads[p];
	vscode.breezell.requestPermission = async p => { asked.push(p); reads[p] = answer ? 'granted' : 'denied'; return answer; };
	vscode.breezell.chat = { readInput: async () => { chatReads++; return chatBox; } };
	const changed = [];
	vscode.breezell.onDidChangePermissions = fn => { changed.push(fn); return { dispose() { } }; };
	// The plugin was activated before these appeared: a fresh one sees them.
	const permContext = contextAt(root, 'storage-permissions');
	const again = await import(`${pathToFileURL(out).href}?permissions`);
	again.activate(permContext);
	await settle();
	await vscode.commands.executeCommand('breezellIme.toggle');
	await settle();
	await vscode.commands.executeCommand('breezellIme.surface', true, 'editor');
	await settle();
	check('going into the editor asks to read the code, once', asked.join() === 'editor.read' && reads['editor.read'] === 'granted', asked.join());
	await vscode.commands.executeCommand('breezellIme.surface', false, 'none');
	await vscode.commands.executeCommand('breezellIme.surface', true, 'editor');
	await settle();
	check('and does not ask again', asked.join() === 'editor.read', asked.join());
	await vscode.commands.executeCommand('breezellIme.surface', true, 'chat');
	await settle();
	check('going into the chat box asks to read it', asked.join() === 'editor.read,chat.input', asked.join());
	chatBox = { text: '我們需要', before: '我們需要', recent: 'earlier words' };
	const needed = await vscode.commands.executeCommand('breezellIme.chatKey', { key: 'j' });
	for (const ch of 'iejue') await vscode.commands.executeCommand('breezellIme.chatKey', { key: ch });
	const solved = await vscode.commands.executeCommand('breezellIme.chatKey', { key: ' ' });
	check('what the chat box holds is read when a composition starts, once', chatReads === 1 && needed?.composing, String(chatReads));
	check('and the words before lead into what is typed', solved?.commit === '解決', JSON.stringify(solved?.commit));
	// Latin typed into the box counts as the user's own word.
	for (const round of ['放到 breezell ', '放到 breezell 上 breezell ']) {
		chatBox = { text: round, before: round, recent: '' };
		await vscode.commands.executeCommand('breezellIme.chatKey', { key: 'n' });
		await vscode.commands.executeCommand('breezellIme.chatForget', 'FocusLost');
	}
	await vscode.commands.executeCommand('breezellIme.chatKey', { key: 'b' });
	let found;
	for (const ch of 'reezel') found = await vscode.commands.executeCommand('breezellIme.chatKey', { key: ch });
	check('a word typed in the chat box is found by its start', found?.candidates?.[0] === 'breezell', JSON.stringify(found?.candidates?.slice(0, 3)));
	await vscode.commands.executeCommand('breezellIme.chatForget', 'FocusLost');
	// The chat box does not answer: typing does not wait.
	const answering = vscode.breezell.chat.readInput;
	vscode.breezell.chat.readInput = () => new Promise(() => { });
	const waited = Date.now();
	const hung = await vscode.commands.executeCommand('breezellIme.chatKey', { key: 'n' });
	check('a chat box that does not answer holds typing up for a moment at most', hung?.composing && Date.now() - waited < 1000, `${Date.now() - waited} ms`);
	await vscode.commands.executeCommand('breezellIme.chatForget', 'FocusLost');
	vscode.breezell.chat.readInput = answering;
	// Turned off: nothing is read.
	reads['chat.input'] = 'denied';
	for (const fn of changed) fn();
	await settle();
	const readsBefore = chatReads;
	await vscode.commands.executeCommand('breezellIme.chatKey', { key: 'n' });
	check('turned off, the chat box is not read, and typing still works', chatReads === readsBefore, String(chatReads));
	await vscode.commands.executeCommand('breezellIme.chatForget', 'FocusLost');
	reads['editor.read'] = 'denied';
	for (const fn of changed) fn();
	await settle();
	await vscode.commands.executeCommand('breezellIme.surface', true, 'editor');
	const inCode = new vscode.FakeEditor('// 註解裡 ', 'typescript');
	vscode.window.activeTextEditor = inCode;
	await vscode.commands.executeCommand('type', { text: 'a' });
	await settle();
	check('not allowed to read the code: by the kind of file alone', inCode.text.endsWith('a'), inCode.text);
	vscode.window.activeTextEditor = prose;
	// What follows runs on this instance, on a Breezell without these permissions again.
	delete vscode.breezell.permissionState;
	delete vscode.breezell.requestPermission;
	delete vscode.breezell.chat;
	delete vscode.breezell.onDidChangePermissions;
	vscode.breezell.permissions = [];
}

// Code: keys stay English outside comments and strings.
const code = new vscode.FakeEditor('const x = ', 'typescript');
vscode.window.activeTextEditor = code;
await type('abc');
check('in code, letters stay English', code.text === 'const x = abc', code.text);
code.insertAtCaret(' // ');
await type('zhongwen ');
check('in a comment, the native language', code.text.endsWith('// 中文'), code.text);

// The chat box.
const answer = await vscode.commands.executeCommand('breezellIme.chatKey', { key: 'n', context: '我們剛才在聊天' });
check('the chat composes', answer?.handled && answer.composing && answer.preedit === 'n', JSON.stringify(answer));
await vscode.commands.executeCommand('breezellIme.chatKey', { key: 'i' });
const picked = await vscode.commands.executeCommand('breezellIme.chatKey', { key: ' ' });
check('the chat commits', picked?.commit?.length === 1 && !picked.composing, JSON.stringify(picked));
const plain = await vscode.commands.executeCommand('breezellIme.chatKey', { key: '3' });
check('a digit after a commit is a digit in the chat box, and the words offered go', plain?.handled && plain.commit === '3' && !plain.predicting, JSON.stringify(plain));
const english = await vscode.commands.executeCommand('breezellIme.chatKey', { key: 'h' });
for (const ch of 'ello') await vscode.commands.executeCommand('breezellIme.chatKey', { key: ch });
const hello = await vscode.commands.executeCommand('breezellIme.chatKey', { key: ' ' });
check('English among the candidates: hello', english?.composing && hello?.commit === 'hello', JSON.stringify(hello));

check('no errors logged', !vscode.calls.some(c => c[0] === 'error'), JSON.stringify(vscode.calls.filter(c => c[0] === 'error')));
check('not a first start: the settings page does not open by itself', !vscode.calls.some(c => c[0] === 'webview'));
for (const d of context.subscriptions) d.dispose();

// The settings page: a first start with no models, a small "language" on a server here.
const bytes = Buffer.from('small model '.repeat(1000));
const server = createServer((req, res) => {
	const from = Number(/bytes=(\d+)-/.exec(req.headers.range ?? '')?.[1] ?? 0);
	res.writeHead(from ? 206 : 200);
	res.end(bytes.subarray(from));
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const pluginDir = join(scratch, 'plugin-smoke', 'page-plugin');
const dataDir = join(scratch, 'plugin-smoke', 'page-data');
rmSync(dataDir, { recursive: true, force: true });
mkdirSync(join(pluginDir, 'media'), { recursive: true });
cpSync(join(root, 'media', 'l10n'), join(pluginDir, 'media', 'l10n'), { recursive: true });
const smallFile = { name: 'zh.bzlm', size: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') };
writeFileSync(join(pluginDir, 'media', 'data-manifest.json'), JSON.stringify({
	version: 1, base: `http://127.0.0.1:${server.address().port}`,
	packs: [{ id: 'chinese', files: [smallFile] }, { id: 'japanese', files: [{ ...smallFile, name: 'ja.bzlm' }] }, { id: 'korean', files: [{ ...smallFile, name: 'ko.bzlm' }] }],
}));
Object.assign(vscode.settings, { dataPath: dataDir, useSystemHost: false, layout: 'pinyin', displayLanguage: 'en' });
const pageContext = contextAt(pluginDir, 'page-storage');
ext.activate(pageContext);
const pageOf = () => vscode.calls.filter(c => c[0] === 'webview').at(-1)?.[1];
await vscode.commands.executeCommand('breezellIme.openSettings');
await settle();
check('the settings page opens from its command', !!pageOf());
const page = pageOf();
const stateNow = () => page.webview.posted.filter(m => m.type === 'state').at(-1);
const until = async test => { for (let i = 0; i < 200 && !test(); i++) await new Promise(r => setTimeout(r, 10)); return test(); };
await page.ask({ type: 'ready' });
check('the page lists the languages, none here', stateNow()?.packs.length === 3 && stateNow().packs.every(p => p.state === 'missing'), JSON.stringify(stateNow()?.packs));
check('its page holds no script from elsewhere', /default-src 'none'/.test(page.webview.html) && /script-src 'nonce-/.test(page.webview.html));
const errorsBefore = vscode.calls.filter(c => c[0] === 'error').length;
await vscode.commands.executeCommand('breezellIme.toggle');
await settle();
check('turning on without the language says so on the page, no error', stateNow()?.needed === 'Chinese' && vscode.calls.filter(c => c[0] === 'error').length === errorsBefore, JSON.stringify(stateNow()?.needed));
await page.ask({ type: 'download', pack: 'chinese' });
await until(() => stateNow().packs[0].state === 'ready');
check('the download finishes, the language is ready', stateNow().packs[0].state === 'ready' && existsSync(join(dataDir, 'zh.bzlm')), JSON.stringify(stateNow().packs[0]));
check('and the page no longer asks for it', !stateNow().needed);
await page.ask({ type: 'set', key: 'prediction', value: false });
await settle();
// The page's language: its own choice, else Breezell's, as Breezell changes it.
await page.ask({ type: 'set', key: 'displayLanguage', value: 'zh-TW' });
await until(() => stateNow().strings.languages === '語言');
check('the page speaks the language chosen for it', stateNow().strings.languages === '語言' && stateNow().packs[0].name === '中文', stateNow().strings.languages);
await page.ask({ type: 'set', key: 'displayLanguage', value: 'auto' });
vscode.setBreezellLanguage('ja');
await until(() => stateNow().strings.languages === '言語');
check('auto: it follows Breezell\'s language, when that changes', stateNow().strings.languages === '言語', stateNow().strings.languages);
vscode.setBreezellLanguage('');
await page.ask({ type: 'set', key: 'displayLanguage', value: 'en' });
await until(() => stateNow().strings.languages === 'Languages');
check('a setting reaches the plugin and the shared config', vscode.settings.prediction === false && JSON.parse(readFileSync(join(process.env.HOME, '.config', 'breezell-ime', 'config.json'), 'utf8')).prediction === false);
await page.ask({ type: 'layout', id: 'wubi' });
await until(() => stateNow().layout === 'wubi');
check('the input method chosen shows on the page and in the shared config', stateNow().layout === 'wubi' && JSON.parse(readFileSync(join(process.env.HOME, '.config', 'breezell-ime', 'config.json'), 'utf8')).zhLayout === 'wubi');
await page.ask({ type: 'layout', id: 'japanese' });
await until(() => stateNow().layout === 'japanese');
check('Japanese: its language is the one in use', stateNow().packs.find(p => p.id === 'japanese').inUse);
await page.ask({ type: 'layout', id: 'pinyin' });
await until(() => stateNow().layout === 'pinyin');
vscode.setDialogAnswer(undefined);
await page.ask({ type: 'remove', pack: 'chinese' });
await settle();
check('removing asks; no answer, it stays', existsSync(join(dataDir, 'zh.bzlm')));
vscode.setDialogAnswer('Remove');
await page.ask({ type: 'remove', pack: 'chinese' });
await until(() => stateNow().packs[0].state === 'missing');
check('asked and answered, it goes', !existsSync(join(dataDir, 'zh.bzlm')) && stateNow().packs[0].state === 'missing');
vscode.setDialogAnswer(undefined);
check(`the whole computer: ${process.platform === 'win32' ? 'offered' : 'not on this system yet'}`, stateNow().system.supported === (process.platform === 'win32'));
for (const d of pageContext.subscriptions) d.dispose();
server.close();

// Installed from the market: one click, then it is ready. A real language from a server here.
const files = createServer((req, res) => {
	const from = Number(/bytes=(\d+)-/.exec(req.headers.range ?? '')?.[1] ?? 0);
	const file = join(data, decodeURIComponent(req.url.slice(1)));
	if (!existsSync(file)) {
		res.writeHead(404).end();
		return;
	}
	res.writeHead(from ? 206 : 200);
	createReadStream(file, { start: from }).pipe(res);
});
await new Promise(r => files.listen(0, '127.0.0.1', r));
const freshData = join(scratch, 'plugin-smoke', 'fresh-data');
rmSync(freshData, { recursive: true, force: true });
rmSync(join(home, 'plugin-set-up'), { force: true });
Object.assign(vscode.settings, { dataPath: freshData, dataMirror: `http://127.0.0.1:${files.address().port}`, useSystemHost: false });
delete vscode.settings.layout;
vscode.setBreezellLanguage('ko');
Object.assign(vscode.settings, { displayLanguage: 'en' });
const before = vscode.calls.length;
const firstContext = contextAt(root, 'first-storage');
ext.activate(firstContext);
const logged = text => vscode.calls.slice(before).some(c => c[0] === 'log' && String(c[1]).includes(text));
check('first start: it says what it sets up, from Breezell\'s language', logged('first start: setting up korean'), JSON.stringify(vscode.calls.slice(before, before + 6)));
const firstPage = vscode.calls.slice(before).find(c => c[0] === 'webview')?.[1];
check('first start: the page opens by itself', !!firstPage);
const firstState = () => firstPage.webview.posted.filter(m => m.type === 'state').at(-1);
check('first start: the download begins by itself, and the page says so', await until(() => firstState()?.setup?.includes('Korean') || logged('on: korean')), JSON.stringify(firstState()?.setup));
check('first start: the language comes down and it turns on, with nothing clicked', await until(() => logged('on: korean')) && existsSync(join(freshData, 'ko.bzlm')), JSON.stringify(vscode.calls.slice(-4).map(c => c[1]).filter(x => typeof x === 'string')));
check('first start: it says it is ready', vscode.calls.slice(before).some(c => c[0] === 'info' && String(c[1]).includes('is ready')));
check('first start: the setting-up note goes', await until(() => !firstState().setup));
await vscode.commands.executeCommand('breezellIme.toggle');
await settle();
for (const d of firstContext.subscriptions) d.dispose();
// The next start: nothing asked; on again only if it was on.
const nextBefore = vscode.calls.length;
await firstContext.globalState.update('enabled', true);
ext.activate(firstContext);
await until(() => vscode.calls.slice(nextBefore).some(c => c[0] === 'log' && String(c[1]).includes('on: korean')));
check('the next start: no setting up, and on again as it was', !vscode.calls.slice(nextBefore).some(c => c[0] === 'webview') && vscode.calls.slice(nextBefore).some(c => c[0] === 'log' && String(c[1]).includes('on: korean')));
for (const d of firstContext.subscriptions) d.dispose();
files.close();
vscode.setBreezellLanguage('');

// Removing the plugin: the mark goes, so installing it again sets up again; a folder the user chose stays.
execFileSync(process.execPath, [hook], { env: { ...process.env } });
check('removed: the set-up mark goes', !existsSync(join(home, 'plugin-set-up')));
writeFileSync(join(home, 'plugin-set-up'), 'test');
const defaultData = join(process.env.HOME, '.local', 'share', 'breezell-ime');
mkdirSync(defaultData, { recursive: true });
writeFileSync(join(defaultData, 'ko.bzlm'), 'x');
writeFileSync(join(defaultData, 'mine.txt'), 'x');
writeFileSync(join(home, 'config.json'), JSON.stringify({ dataPath: '/somewhere/the/user/chose' }));
execFileSync(process.execPath, [hook], { env: { ...process.env } });
check('removed: a folder the user chose is left alone', existsSync(join(defaultData, 'ko.bzlm')));
writeFileSync(join(home, 'config.json'), '{}');
execFileSync(process.execPath, [hook], { env: { ...process.env } });
check('removed: the default folder loses the languages, and only them', !existsSync(join(defaultData, 'ko.bzlm')) && existsSync(join(defaultData, 'mine.txt')));
check('still no errors logged', vscode.calls.filter(c => c[0] === 'error').length === errorsBefore, JSON.stringify(vscode.calls.filter(c => c[0] === 'error')));
console.log(failed ? `${failed} failed` : 'all passed');
process.exit(failed ? 1 : 0);
