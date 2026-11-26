// Finding Claude Code and reading its answers, with a fake file system and fake programs: where it
// is looked for on Windows, macOS and Linux, how the Claude Code inside WSL is found and run through
// wsl.exe, what each answer of `claude auth status` becomes, and how failures read. No real Claude
// Code runs here.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Reset times are shown in this computer's time zone: the tests pin one.
process.env.TZ = 'Asia/Taipei';

const root = fileURLToPath(new URL('..', import.meta.url));
const require = createRequire(import.meta.url);
const esbuild = require('esbuild');

async function load(entry) {
	const out = mkdtempSync(join(tmpdir(), 'agent-bridge-test-'));
	await esbuild.build({ entryPoints: [join(root, entry)], bundle: true, platform: 'node', format: 'cjs', outfile: join(out, 'm.cjs'), logLevel: 'silent' });
	const m = require(join(out, 'm.cjs'));
	rmSync(out, { recursive: true, force: true });
	return m;
}

const cc = await load('src/agents/claudeCode/index.ts');
const tx = await load('src/agents/claudeCode/texts.ts');

const SIGNED_IN = JSON.stringify({ loggedIn: true, authMethod: 'claude.ai', apiProvider: 'firstParty', email: 'dev@example.com', orgId: 'x', orgName: 'Example Org', subscriptionType: 'max' }, null, 2);
const SIGNED_OUT = JSON.stringify({ loggedIn: false, authMethod: 'none', apiProvider: 'firstParty' }, null, 2);
const TEXT = 'Login method: Claude Max account\nOrganization: Example Org\nEmail: dev@example.com\n';
const ok = stdout => ({ code: 0, stdout, stderr: '' });

/** A Claude Code that answers from a table: `args joined by spaces` → result, or an Error to throw. */
const fakeClaude = answers => async args => {
	const answer = answers[args.join(' ')];
	if (answer instanceof Error) {
		throw answer;
	}
	return answer ?? { code: 1, stdout: '', stderr: `unknown command ${args.join(' ')}` };
};
const target = (answers, extra = {}) => ({ where: 'native', path: '/bin/claude', ask: fakeClaude(answers), ...extra });

test('Windows: PATH, then the native installer, WinGet, npm and the other package managers\' folders, the .exe before npm\'s .cmd', () => {
	const env = { Path: 'C:\\Tools;"C:\\Quoted Dir"', APPDATA: 'C:\\Users\\u\\AppData\\Roaming', LOCALAPPDATA: 'C:\\Users\\u\\AppData\\Local' };
	const folders = [...new Set(cc.candidates(env, 'win32', 'C:\\Users\\u').map(f => f.replace(/\\claude\.(exe|cmd)$/, '')))];
	assert.deepEqual(folders, [
		'C:\\Tools', 'C:\\Quoted Dir',
		'C:\\Users\\u\\.local\\bin',
		'C:\\Users\\u\\AppData\\Local\\Microsoft\\WinGet\\Links',
		'C:\\Users\\u\\AppData\\Roaming\\npm',
		'C:\\Users\\u\\AppData\\Local\\pnpm',
		'C:\\Users\\u\\scoop\\shims',
		'C:\\Users\\u\\.bun\\bin',
		'C:\\Users\\u\\.volta\\bin',
		'C:\\Users\\u\\.claude\\local',
	]);
	assert.deepEqual(cc.candidates(env, 'win32', 'C:\\Users\\u').slice(0, 2), ['C:\\Tools\\claude.exe', 'C:\\Tools\\claude.cmd']);
	assert.equal(cc.envValue({ Path: 'x' }, 'PATH'), 'x', 'Windows names are not case-sensitive');
});

test('macOS: the native installer, Homebrew, then npm, volta, bun, pnpm and every nvm version, newest first', () => {
	const listDir = dir => dir === '/Users/u/.nvm/versions/node' ? ['v18.20.0', 'v22.11.0', 'v20.1.0', 'not-a-version'] : [];
	assert.deepEqual(cc.candidates({ PATH: '/usr/bin:/bin' }, 'darwin', '/Users/u', listDir), [
		'/usr/bin/claude', '/bin/claude',
		'/Users/u/.local/bin/claude',
		'/opt/homebrew/bin/claude', '/usr/local/bin/claude',
		'/Users/u/Library/pnpm/claude',
		'/Users/u/.npm-global/bin/claude', '/Users/u/.volta/bin/claude', '/Users/u/.bun/bin/claude',
		'/Users/u/.nvm/versions/node/v22.11.0/bin/claude', '/Users/u/.nvm/versions/node/v20.1.0/bin/claude', '/Users/u/.nvm/versions/node/v18.20.0/bin/claude',
		'/Users/u/.claude/local/claude',
	]);
});

test('Linux: the native installer, system and Linuxbrew folders, snap, then the per-user package managers; each place once', () => {
	assert.deepEqual(cc.candidates({ PATH: '/usr/bin:/home/u/.local/bin' }, 'linux', '/home/u', () => []), [
		'/usr/bin/claude', '/home/u/.local/bin/claude',
		'/usr/local/bin/claude', '/home/linuxbrew/.linuxbrew/bin/claude', '/snap/bin/claude',
		'/home/u/.local/share/pnpm/claude',
		'/home/u/.npm-global/bin/claude', '/home/u/.volta/bin/claude', '/home/u/.bun/bin/claude',
		'/home/u/.claude/local/claude',
	]);
	assert.equal(cc.findClaude({ PATH: '/usr/bin' }, 'linux', '/home/u', f => f === '/home/u/.local/bin/claude', () => []), '/home/u/.local/bin/claude');
	assert.equal(cc.findClaude({ PATH: '' }, 'linux', '/home/u', () => false, () => []), undefined);
});

test('the version, the sign-in and the plan are read from what Claude Code prints', () => {
	assert.equal(cc.parseVersion('2.1.330 (Claude Code)\n'), '2.1.330');
	assert.equal(cc.parseVersion('nothing here'), undefined);
	assert.deepEqual(cc.parseAuthStatus(SIGNED_IN), { loggedIn: true, authMethod: 'claude.ai', email: 'dev@example.com', orgName: 'Example Org', subscriptionType: 'max', planTier: undefined });
	assert.deepEqual(cc.parseAuthStatus(`warning: something\n${SIGNED_OUT}\n`), { loggedIn: false, authMethod: 'none', email: undefined, orgName: undefined, subscriptionType: undefined, planTier: undefined }, 'lines around the JSON are skipped');
	for (const bad of ['', 'Not logged in. Run claude auth login to authenticate.', '{ broken', '{"email":"x"}']) {
		assert.equal(cc.parseAuthStatus(bad), undefined, bad);
	}
	assert.equal(cc.parseLoginMethod(TEXT), 'Claude Max account');
	assert.equal(cc.parseLoginMethod('Email: x'), undefined);
});

test('signed in: the account in Claude Code\'s own words; a missing plan line does not undo the sign-in', async () => {
	const all = { '--version': ok('2.1.330 (Claude Code)'), 'auth status --json': ok(SIGNED_IN), 'auth status --text': ok(TEXT) };
	assert.deepEqual(await cc.inspect(target(all)), { kind: 'signedIn', where: 'native', location: '/bin/claude', version: '2.1.330', email: 'dev@example.com', organization: 'Example Org', plan: 'Max', authMethod: 'claude.ai' });
	assert.equal((await cc.inspect(target({ ...all, 'auth status --text': new Error('boom') }))).plan, 'Max', 'without the text, the plan comes from the JSON');
});

test('signed out, too old to say, and failures each read as what they are', async () => {
	const asked = [];
	const out = { where: 'native', path: '/bin/claude', ask: async args => { asked.push(args.join(' ')); return fakeClaude({ '--version': ok('2.1.330 (Claude Code)'), 'auth status --json': { code: 1, stdout: SIGNED_OUT, stderr: '' } })(args); } };
	assert.deepEqual(await cc.inspect(out), { kind: 'notSignedIn', where: 'native', location: '/bin/claude', version: '2.1.330' });
	assert.deepEqual(asked, ['--version', 'auth status --json'], 'no plan asked of a signed-out Claude Code');
	assert.deepEqual(await cc.inspect(target({ '--version': ok('1.0.3 (Claude Code)'), 'auth status --json': { code: 1, stdout: '', stderr: 'error: unknown command auth' } })), { kind: 'tooOld', where: 'native', location: '/bin/claude', version: '1.0.3' });
	assert.deepEqual(await cc.inspect(target({ '--version': { code: 127, stdout: '', stderr: 'node: not found\nmore' } })), { kind: 'failed', where: 'native', location: '/bin/claude', message: 'node: not found' });
	assert.deepEqual(await cc.inspect(target({ '--version': ok('2.1.330 (Claude Code)'), 'auth status --json': new Error('no answer within 20 s\nstack') })), { kind: 'failed', where: 'native', location: '/bin/claude', message: 'no answer within 20 s' });
	assert.deepEqual(await cc.detect({ env: { PATH: '' }, platform: 'linux', home: '/home/u', run: async () => ok(''), isFile: () => false, listDir: () => [] }), { check: { kind: 'notInstalled', lookedInWsl: false } });
});

/** wsl.exe and the Claude Code inside it, from a table keyed by the script it is given. */
function fakeWsl({ find = { code: 0, stdout: 'Ubuntu\n/home/u/.local/bin/claude\n', stderr: '' }, claude = { '--version': ok('2.1.330 (Claude Code)'), 'auth status --json': ok(SIGNED_IN), 'auth status --text': ok(TEXT) } } = {}) {
	const calls = [];
	const run = async (file, args, options) => {
		calls.push({ file, args, timeoutMs: options?.timeoutMs });
		if (!/wsl\.exe$/i.test(file)) {
			throw new Error(`not wsl: ${file}`);
		}
		const script = args.at(-1);
		if (script === cc.WSL_FIND_SCRIPT) {
			if (find instanceof Error) {
				throw find;
			}
			return find;
		}
		const words = [...script.matchAll(/'((?:[^']|'\\'')*)'/g)].map(m => m[1]);
		return fakeClaude(claude)(words.slice(2));
	};
	return { run, calls };
}

test('Windows: the Claude Code inside WSL is found and asked through wsl.exe, and said to be there', async () => {
	const { run, calls } = fakeWsl();
	const { check } = await cc.detect({ env: { Path: '', SystemRoot: 'C:\\Windows' }, platform: 'win32', home: 'C:\\Users\\u', run, isFile: () => false });
	assert.deepEqual(check, { kind: 'signedIn', where: 'wsl', location: '/home/u/.local/bin/claude', distro: 'Ubuntu', version: '2.1.330', email: 'dev@example.com', organization: 'Example Org', plan: 'Max', authMethod: 'claude.ai' });
	assert.equal(calls[0].file, 'C:\\Windows\\System32\\wsl.exe');
	assert.deepEqual(calls[0].args, ['--cd', '~', '--exec', 'sh', '-lc', cc.WSL_FIND_SCRIPT], 'the default distribution, through a login shell');
	assert.deepEqual(calls[1].args, ['-d', 'Ubuntu', '--cd', '~', '--exec', 'sh', '-c', "PATH='/home/u/.local/bin':$PATH exec '/home/u/.local/bin/claude' '--version'"], 'then in the distribution found, by its path');
	assert.ok(calls.every(c => c.timeoutMs === cc.WSL_TIMEOUT_MS), 'WSL may have to start first');
	assert.ok(calls.every(c => !c.args.join(' ').includes('"')), 'no double quote, so Windows\' command line passes it unchanged');
});

test('where its sessions are: CLAUDE_CONFIG_DIR or .claude at home; in WSL, asked of the distribution and reached through \\\\wsl$', async () => {
	assert.equal(cc.nativeConfigDir({}, '/home/u', 'linux'), '/home/u/.claude');
	assert.equal(cc.nativeConfigDir({}, 'C:\\Users\\u', 'win32'), 'C:\\Users\\u\\.claude');
	assert.equal(cc.nativeConfigDir({ CLAUDE_CONFIG_DIR: '/data/claude' }, '/home/u', 'linux'), '/data/claude');
	assert.equal(cc.wslUncPath('Ubuntu', '/home/u/.claude'), '\\\\wsl$\\Ubuntu\\home\\u\\.claude');
	const { run, calls } = fakeWsl();
	const wslRun = async (file, args, options) => args.at(-1)?.startsWith('echo ') ? (calls.push({ file, args }), { code: 0, stdout: '/home/u/.claude\n', stderr: '' }) : run(file, args, options);
	const { target } = await cc.detect({ env: { Path: '', SystemRoot: 'C:\\Windows' }, platform: 'win32', home: 'C:\\Users\\u', run: wslRun, isFile: () => false });
	assert.equal(await target.configDir(), '\\\\wsl$\\Ubuntu\\home\\u\\.claude');
	assert.deepEqual(calls.at(-1).args, ['-d', 'Ubuntu', '--cd', '~', '--exec', 'sh', '-c', 'echo ${CLAUDE_CONFIG_DIR:-$HOME/.claude}'], 'no double quote');
	const native = await cc.detect({ env: { PATH: '/bin' }, platform: 'linux', home: '/home/u', run: (_file, args) => fakeClaude({ '--version': ok('2.1.330 (Claude Code)'), 'auth status --json': ok(SIGNED_IN), 'auth status --text': ok(TEXT) })(args), isFile: f => f === '/home/u/.local/bin/claude' });
	assert.equal(await native.target.configDir(), '/home/u/.claude');
});

test('Windows: this computer first in a local window, WSL first in a WSL window (its own distribution)', async () => {
	const native = 'C:\\Users\\u\\.local\\bin\\claude.exe';
	const order = [];
	const run = async (file, args) => {
		order.push(/wsl\.exe$/i.test(file) ? `wsl ${args.slice(0, 2).join(' ')}` : 'native');
		if (/wsl\.exe$/i.test(file)) {
			return fakeWsl().run(file, args);
		}
		return fakeClaude({ '--version': ok('2.1.300 (Claude Code)'), 'auth status --json': ok(SIGNED_IN), 'auth status --text': ok(TEXT) })(args);
	};
	const options = { env: { Path: '', SystemRoot: 'C:\\Windows' }, platform: 'win32', home: 'C:\\Users\\u', run, isFile: f => f === native };
	assert.equal((await cc.detect(options)).check.where, 'native');
	assert.ok(order.every(o => o === 'native'), 'a local window that finds it here does not start WSL');
	order.length = 0;
	const inWsl = (await cc.detect({ ...options, wslWindow: { distro: 'Debian' } })).check;
	assert.equal(inWsl.where, 'wsl');
	assert.equal(order[0], 'wsl -d Debian');
});

test('Windows: no WSL, or none of it there: not installed, having looked in both places', async () => {
	for (const find of [{ code: 1, stdout: 'W\0S\0L\0', stderr: '' }, { code: 3, stdout: 'Ubuntu\n', stderr: '' }, new Error('spawn ENOENT')]) {
		const { run } = fakeWsl({ find });
		assert.deepEqual(await cc.detect({ env: { Path: '' }, platform: 'win32', home: 'C:\\Users\\u', run, isFile: () => false }), { check: { kind: 'notInstalled', lookedInWsl: true } });
	}
});

test('wsl.exe speaks UTF-16 when it talks itself; what runs inside WSL is UTF-8', () => {
	assert.equal(cc.decodeOutput(Buffer.from('沒有發行版\r\n', 'utf16le')), '沒有發行版\r\n');
	assert.equal(cc.decodeOutput(Buffer.from('{"loggedIn":true,"email":"é@x"}', 'utf8')), '{"loggedIn":true,"email":"é@x"}');
	assert.equal(cc.decodeOutput(Buffer.from('\uFEFFok', 'utf16le')), 'ok');
	assert.equal(cc.decodeOutput('text'), 'text');
});

test('the program\'s own folder goes first on PATH, under the name PATH already has', () => {
	assert.equal(cc.withFolderOnPath({ Path: 'C:\\Windows' }, 'C:\\nvm\\v22', true).Path, 'C:\\nvm\\v22;C:\\Windows');
	assert.equal(cc.withFolderOnPath({ Path: 'C:\\Windows' }, 'C:\\nvm\\v22', true).PATH, undefined, 'no second PATH beside Path');
	assert.equal(cc.withFolderOnPath({ PATH: '/usr/bin' }, '/home/u/.nvm/versions/node/v22/bin', false).PATH, '/home/u/.nvm/versions/node/v22/bin:/usr/bin');
	assert.equal(cc.withFolderOnPath({}, '/x', false).PATH, '/x');
});

test('what the page says, in Breezell\'s language; only what is known gets a row', () => {
	assert.equal(tx.languageKey('zh-TW'), 'zh-tw');
	assert.equal(tx.languageKey('zh-HK'), 'zh-tw');
	assert.equal(tx.languageKey('zh-CN'), 'zh-cn');
	assert.equal(tx.languageKey('zh'), 'zh-cn');
	assert.equal(tx.languageKey('ja'), 'en');
	assert.equal(tx.languageKey(undefined), 'en');
	const tw = tx.TEXTS['zh-tw'];
	assert.deepEqual(tx.statusOf({ kind: 'signedIn', where: 'native', version: '2.1.330', location: '/bin/claude', email: 'dev@example.com', plan: 'Ultra', authMethod: 'claude.ai' }, tw), {
		connected: true,
		account: [{ label: '電子郵件', value: 'dev@example.com' }, { label: '訂閱等級', value: 'Ultra' }, { label: '登入方式', value: 'Claude 帳號' }, { label: 'Claude Code 版本', value: '2.1.330' }, { label: '程式位置', value: '/bin/claude' }],
	});
	assert.deepEqual(tx.statusOf({ kind: 'signedIn', where: 'wsl', distro: 'Ubuntu', location: '/home/u/.local/bin/claude' }, tw).account, [{ label: '程式位置', value: 'WSL（Ubuntu）：/home/u/.local/bin/claude' }]);
	assert.deepEqual(tx.statusOf({ kind: 'signedIn', where: 'wsl', location: '/usr/bin/claude' }, tx.TEXTS.en).account, [{ label: 'Program', value: 'WSL: /usr/bin/claude' }]);
	assert.deepEqual(tx.statusOf({ kind: 'notInstalled', lookedInWsl: false }, tw), { connected: false, detail: tw.notInstalled });
	assert.deepEqual(tx.statusOf({ kind: 'notInstalled', lookedInWsl: true }, tw), { connected: false, detail: tw.notInstalledWindows });
	assert.equal(tx.statusOf({ kind: 'notSignedIn', where: 'native', version: '2.1.330', location: 'x' }, tw).detail, '已找到 Claude Code 2.1.330，但尚未登入。請在終端機執行 claude，輸入 /login 登入帳號，再重新檢查。');
	assert.equal(tx.statusOf({ kind: 'notSignedIn', where: 'native', location: 'x' }, tw).detail, '已找到 Claude Code，但尚未登入。請在終端機執行 claude，輸入 /login 登入帳號，再重新檢查。', 'no gap where the version is unknown');
	assert.equal(tx.statusOf({ kind: 'tooOld', where: 'native', location: 'x' }, tx.TEXTS.en).detail, 'This Claude Code cannot report whether it is signed in. Update it with claude update, then check again.');
	assert.equal(tx.statusOf({ kind: 'failed', message: 'spawn EACCES' }, tx.TEXTS['zh-cn']).detail, '无法读取 Claude Code 的状态：spawn EACCES');
	for (const [key, texts] of Object.entries(tx.TEXTS)) {
		assert.deepEqual(Object.keys(texts).sort(), Object.keys(tx.TEXTS.en).sort(), `${key} has every text`);
	}
});

test('npm\'s claude.cmd on Windows goes through cmd.exe with the path quoted; a program runs as itself elsewhere', async () => {
	const childProcess = require('node:child_process');
	const original = childProcess.execFile;
	const calls = [];
	childProcess.execFile = (file, args, options, callback) => { calls.push({ file, args, verbatim: options.windowsVerbatimArguments, cwd: options.cwd, hide: options.windowsHide, path: options.env.Path ?? options.env.PATH }); callback(null, Buffer.from('out'), Buffer.from('')); };
	try {
		const win = cc.createRunner('C:\\Users\\u', { ComSpec: 'C:\\Windows\\system32\\cmd.exe', Path: 'C:\\Windows' }, 'win32');
		assert.deepEqual(await win('C:\\Users\\u\\AppData\\Roaming\\npm\\claude.cmd', ['auth', 'status', '--json']), { code: 0, stdout: 'out', stderr: '' });
		await win('C:\\Users\\u\\.local\\bin\\claude.exe', ['--version']);
		const posix = cc.createRunner('/home/u', { PATH: '/usr/bin' }, 'linux');
		await posix('/home/u/.local/bin/claude', ['--version']);
	} finally {
		childProcess.execFile = original;
	}
	assert.deepEqual(calls, [
		{ file: 'C:\\Windows\\system32\\cmd.exe', args: ['/d', '/s', '/c', '""C:\\Users\\u\\AppData\\Roaming\\npm\\claude.cmd" auth status --json"'], verbatim: true, cwd: 'C:\\Users\\u', hide: true, path: 'C:\\Users\\u\\AppData\\Roaming\\npm;C:\\Windows' },
		{ file: 'C:\\Users\\u\\.local\\bin\\claude.exe', args: ['--version'], verbatim: false, cwd: 'C:\\Users\\u', hide: true, path: 'C:\\Users\\u\\.local\\bin;C:\\Windows' },
		{ file: '/home/u/.local/bin/claude', args: ['--version'], verbatim: false, cwd: '/home/u', hide: true, path: '/home/u/.local/bin:/usr/bin' },
	]);
});

const USAGE = [
	'You are currently using your subscription to power your Claude Code usage',
	'',
	'Current session: 12% used · resets Nov 22, 12:49am (America/Los_Angeles)',
	'Current week (all models): 57% used · resets Nov 27, 11:59pm (America/Los_Angeles)',
	'Current week (Fable): 55% used · resets Nov 27, 11:59pm (America/Los_Angeles)',
	'',
	'What\'s contributing to your usage?',
	'Last 24h · 7938 requests · 6 sessions',
	'  97%  Review sessions active over many hours · whole sessions with requests in 8 or more separate hours',
].join('\n');

test('the plan: Claude Code\'s own name first, else the JSON\'s, none for an API key', () => {
	assert.equal(cc.parsePlan('Claude Ultra account', 'max', 'max_20x'), 'Ultra');
	assert.equal(cc.parsePlan('Claude Pro account'), 'Pro');
	assert.equal(cc.parsePlan(undefined, 'max', 'max_20x'), 'Max 20x');
	assert.equal(cc.parsePlan(undefined, 'pro'), 'Pro');
	assert.equal(cc.parsePlan('Anthropic API key'), undefined);
	assert.equal(cc.parsePlan(undefined), undefined);
});

test('the limits /usage prints for a subscription, and none in what an API key gets', () => {
	assert.deepEqual(cc.parseUsage(USAGE), [
		{ name: 'Current session', percent: 12, resets: 'Nov 22, 12:49am (America/Los_Angeles)' },
		{ name: 'Current week (all models)', percent: 57, resets: 'Nov 27, 11:59pm (America/Los_Angeles)' },
		{ name: 'Current week (Fable)', percent: 55, resets: 'Nov 27, 11:59pm (America/Los_Angeles)' },
	], 'the tips below the limits are not limits');
	assert.deepEqual(cc.parseUsage('Current session: 100% used'), [{ name: 'Current session', percent: 100 }]);
	assert.deepEqual(cc.parseUsage('Estimated cost:        $0.0000\nUsage:                 0 input, 0 output'), []);
});

test('usage is asked through Claude Code\'s own /usage in print mode, kept out of its session history', async () => {
	const asked = [];
	const t = { where: 'native', path: '/bin/claude', ask: async args => { asked.push(args); return ok(USAGE); } };
	assert.equal((await cc.fetchUsage(t)).length, 3);
	assert.deepEqual(asked, [['-p', '/usage', '--no-session-persistence']]);
	assert.equal(await cc.fetchUsage({ ...t, ask: async () => ({ code: 1, stdout: '', stderr: 'x' }) }), undefined);
	assert.equal(await cc.fetchUsage({ ...t, ask: async () => { throw new Error('timeout'); } }), undefined);
});

test('a reset time in the zone Claude Code wrote it in is read as the instant it is', () => {
	const now = new Date('2026-11-22T07:30:00Z'); // 11:30pm the day before in Los Angeles
	assert.equal(cc.resetInstant('Nov 22, 12:49am (America/Los_Angeles)', now)?.toISOString(), '2026-11-22T08:49:00.000Z');
	assert.equal(cc.resetInstant('Nov 27, 11:59pm (America/Los_Angeles)', now)?.toISOString(), '2026-11-28T07:59:00.000Z');
	assert.equal(cc.resetInstant('4pm (Europe/Paris)', now)?.toISOString(), '2026-11-22T15:00:00.000Z', 'no date: the next such time');
	assert.equal(cc.resetInstant('8am (Europe/Paris)', now)?.toISOString(), '2026-11-22T07:00:00.000Z', 'just passed: still that one');
	assert.equal(cc.resetInstant('6am (Europe/Paris)', now)?.toISOString(), '2026-11-23T05:00:00.000Z', 'well passed: tomorrow');
	assert.equal(cc.resetInstant('Jan 2, 1am (America/Los_Angeles)', new Date('2026-12-30T12:00:00Z'))?.toISOString(), '2027-01-02T09:00:00.000Z', 'next year');
	assert.equal(cc.resetInstant('Jul 4, 12pm (America/New_York)', new Date('2026-06-01T00:00:00Z'))?.toISOString(), '2026-07-04T16:00:00.000Z', 'summer time');
	for (const bad of ['Nov 22, 12:49am (Mars/Base)', 'soon', 'Nov 22, 25:00am (UTC)', 'Nov 22, 0am (UTC)', 'Nov 22, 1:75pm (UTC)', 'Foo 22, 1am (UTC)', '']) {
		assert.equal(cc.resetInstant(bad, now), undefined, bad);
	}
});

test('the usage bars: names in the page\'s language, the reset in this computer\'s time, as Claude Code wrote it when unreadable', () => {
	const now = new Date('2026-11-22T07:30:00Z');
	const tw = tx.TEXTS['zh-tw'];
	const status = tx.statusOf({ kind: 'signedIn', where: 'wsl', distro: 'Ubuntu', location: '/home/u/.local/bin/claude', plan: 'Ultra' }, tw, cc.parseUsage(USAGE), now);
	assert.deepEqual(status.usage.map(m => [m.label, m.percent]), [['目前工作階段', 12], ['本週（所有模型）', 57], ['本週（Fable）', 55]]);
	assert.match(status.usage[0].detail, /^重設時間：11月22日 下午4:49$/);
	assert.match(status.usage[1].detail, /^重設時間：11月28日 下午3:59$/);
	assert.equal(tx.statusOf({ kind: 'signedIn', where: 'native', location: 'x' }, tx.TEXTS.en, [{ name: 'Current session', percent: 5, resets: 'whenever' }], now).usage[0].detail, 'Resets whenever');
	assert.equal(tx.usageLabel('Weekly Opus', tw), 'Weekly Opus', 'a limit Claude Code names otherwise is shown as it is');
	assert.equal(tx.statusOf({ kind: 'signedIn', where: 'native', location: 'x' }, tw, []).usage, undefined, 'no limits, no bars');
	assert.equal(tx.statusOf({ kind: 'notSignedIn', where: 'native', location: 'x' }, tw, cc.parseUsage(USAGE)).usage, undefined, 'only while connected');
});
