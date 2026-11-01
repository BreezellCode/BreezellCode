#!/usr/bin/env node
// The input method plugin itself, outside Breezell (on Linux or macOS too): its bundle built
// against bench/fake-vscode.mjs, activated, keys typed into a fake editor and the chat. With
// useSystemHost off it composes here, from the models in <data dir>; with a host's socket it
// composes there.
//   plugin-smoke.mjs <scratch dir> <data dir>
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const [scratch, data] = process.argv.slice(2);
const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const out = join(scratch, 'plugin-smoke', 'extension.mjs');
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
check('the words that may come next are offered', offered?.highlight === -1 && offered.candidates.length > 0, JSON.stringify(offered));
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
check('a digit the chat box types as it is (no words offered after the commit: they went)', plain?.handled && plain.commit === '3' || plain?.commit?.length === 1, JSON.stringify(plain));
const english = await vscode.commands.executeCommand('breezellIme.chatKey', { key: 'h' });
for (const ch of 'ello') await vscode.commands.executeCommand('breezellIme.chatKey', { key: ch });
const hello = await vscode.commands.executeCommand('breezellIme.chatKey', { key: ' ' });
check('English among the candidates: hello', english?.composing && hello?.commit === 'hello', JSON.stringify(hello));

check('no errors logged', !vscode.calls.some(c => c[0] === 'error'), JSON.stringify(vscode.calls.filter(c => c[0] === 'error')));
check('with the models here, the settings page does not open by itself', !vscode.calls.some(c => c[0] === 'webview'));
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
const smallFile = { name: 'zh.bzlm', size: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') };
writeFileSync(join(pluginDir, 'media', 'data-manifest.json'), JSON.stringify({
	version: 1, base: `http://127.0.0.1:${server.address().port}`,
	packs: [{ id: 'chinese', files: [smallFile] }, { id: 'japanese', files: [{ ...smallFile, name: 'ja.bzlm' }] }, { id: 'korean', files: [{ ...smallFile, name: 'ko.bzlm' }] }],
}));
Object.assign(vscode.settings, { dataPath: dataDir, useSystemHost: false, layout: 'pinyin' });
const pageContext = contextAt(pluginDir, 'page-storage');
ext.activate(pageContext);
const pageOf = () => vscode.calls.filter(c => c[0] === 'webview').at(-1)?.[1];
check('a first start with nothing downloaded opens the settings page', !!pageOf());
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
check('still no errors logged', vscode.calls.filter(c => c[0] === 'error').length === errorsBefore, JSON.stringify(vscode.calls.filter(c => c[0] === 'error')));
console.log(failed ? `${failed} failed` : 'all passed');
process.exit(failed ? 1 : 0);
