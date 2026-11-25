// Finding Antigravity CLI and asking it, against fake programs: where agy is looked for, what `agy models` prints
// (agy 1.5.17's own output), the models as Breezell's picker takes them, and the id `--model` gets.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const root = fileURLToPath(new URL('..', import.meta.url));
const require = createRequire(import.meta.url);
const esbuild = require('esbuild');
const out = mkdtempSync(join(tmpdir(), 'agent-bridge-agy-'));
await esbuild.build({ entryPoints: [join(root, 'src/antigravity.ts')], bundle: true, platform: 'node', format: 'cjs', outfile: join(out, 'agy.cjs'), logLevel: 'silent' });
await esbuild.build({ entryPoints: [join(root, 'src/cli.ts')], bundle: true, platform: 'node', format: 'cjs', outfile: join(out, 'cli.cjs'), logLevel: 'silent' });
await esbuild.build({ entryPoints: [join(root, 'src/texts.ts')], bundle: true, platform: 'node', format: 'cjs', outfile: join(out, 'texts.cjs'), logLevel: 'silent' });
await esbuild.build({ entryPoints: [join(root, 'src/limits.ts')], bundle: true, platform: 'node', format: 'cjs', outfile: join(out, 'limits.cjs'), logLevel: 'silent' });
const agy = require(join(out, 'agy.cjs'));
const { createStarter, nativeTarget, programCandidates, versionAtLeast, wslFindScript, wslRunScript } = require(join(out, 'cli.cjs'));
const tx = require(join(out, 'texts.cjs'));
const { resetInstant } = require(join(out, 'limits.cjs'));
rmSync(out, { recursive: true, force: true });

/** What agy 1.5.17 printed for `agy models` (its first line goes to stderr). */
const MODELS = [
	'gemini-4-hydrogen-high\tGemini 4 Hydrogen (High)',
	'gemini-4-hydrogen-xhigh\tGemini 4 Hydrogen (XHigh)',
	'gemini-4-hydrogen-medium\tGemini 4 Hydrogen (Medium)',
	'gemini-4-hydrogen-low\tGemini 4 Hydrogen (Low)',
	'gemini-3.8-flash-high\tGemini 3.8 Flash (High)',
	'gemini-3.8-flash-medium\tGemini 3.8 Flash (Medium)',
	'gemini-3.8-flash-low\tGemini 3.8 Flash (Low)',
	'claude-sonnet-4-6\tClaude Sonnet 4.6 (Thinking)',
	'claude-opus-4-6-thinking\tClaude Opus 4.6 (Thinking)',
	'gpt-oss-120b-medium\tGPT-OSS 120B (Medium)',
].join('\n') + '\n';

test('the models agy lists: one in the picker for each, its effort levels in Breezell\'s menu, each named whose it is', () => {
	const lines = agy.parseAgyModels(`Fetching available models...\n${MODELS}`);
	assert.equal(lines.length, 10);
	assert.deepEqual(agy.groupAgyModels(lines), [
		{ id: 'gemini-4-hydrogen', title: 'Gemini 4 Hydrogen', family: 'gemini', efforts: ['low', 'medium', 'high', 'xhigh'], variants: { high: 'gemini-4-hydrogen-high', xhigh: 'gemini-4-hydrogen-xhigh', medium: 'gemini-4-hydrogen-medium', low: 'gemini-4-hydrogen-low' } },
		{ id: 'gemini-3.8-flash', title: 'Gemini 3.8 Flash', family: 'gemini', efforts: ['low', 'medium', 'high'], variants: { high: 'gemini-3.8-flash-high', medium: 'gemini-3.8-flash-medium', low: 'gemini-3.8-flash-low' } },
		{ id: 'claude-sonnet-4-6', title: 'Claude Sonnet 4.6 (Thinking)', family: 'claude' },
		{ id: 'claude-opus-4-6-thinking', title: 'Claude Opus 4.6 (Thinking)', family: 'claude' },
		// one level alone is no choice: as agy names it
		{ id: 'gpt-oss-120b-medium', title: 'GPT-OSS 120B (Medium)', family: 'openai' },
	]);
});

test('the id agy\'s --model takes: the level picked, else high (or the nearest one), and a model without levels as it is', () => {
	const models = agy.groupAgyModels(agy.parseAgyModels(MODELS));
	assert.equal(agy.agyModelId(models, 'gemini-4-hydrogen', 'xhigh'), 'gemini-4-hydrogen-xhigh');
	assert.equal(agy.agyModelId(models, 'gemini-4-hydrogen', undefined), 'gemini-4-hydrogen-high');
	assert.equal(agy.agyModelId(models, 'gemini-3.8-flash', 'max'), 'gemini-3.8-flash-high', 'a level it does not have: its default');
	assert.equal(agy.agyModelId(models, 'claude-opus-4-6-thinking', 'high'), 'claude-opus-4-6-thinking');
	assert.equal(agy.agyModelId(models, 'gone-model', undefined), 'gone-model');
	// no high: the next in line
	assert.equal(agy.agyModelId(agy.groupAgyModels(agy.parseAgyModels('m-low\tM (Low)\nm-medium\tM (Medium)\n')), 'm', undefined), 'm-medium');
});

test('where agy is looked for: PATH, then the installer\'s ~/.local/bin; agy.exe on Windows; inside WSL by its own script', () => {
	assert.ok(programCandidates(agy.AGY_PROGRAM, { PATH: '/usr/bin' }, 'linux', '/home/u').slice(0, 2).every(f => f.endsWith('/agy')));
	assert.ok(programCandidates(agy.AGY_PROGRAM, { PATH: '/usr/bin' }, 'linux', '/home/u').includes('/home/u/.local/bin/agy'));
	assert.ok(programCandidates(agy.AGY_PROGRAM, { PATH: 'C:\\Tools' }, 'win32', 'C:\\Users\\u').includes('C:\\Users\\u\\.local\\bin\\agy.exe'));
	assert.match(wslFindScript(agy.AGY_PROGRAM), /^for f in \$\(command -v agy 2>\/dev\/null\) \$HOME\/\.local\/bin\/agy /);
	assert.doesNotMatch(wslFindScript(agy.AGY_PROGRAM), /"/, 'no double quotes: the script reaches the shell unchanged through wsl.exe');
});

/** A target whose commands answer as the test says. */
const targetOf = answers => ({ where: 'native', path: '/home/u/.local/bin/agy', configDir: async () => undefined, start: () => { throw new Error('no turns here'); }, ask: async args => answers(args.join(' ')) });

test('asking agy: its version, then its models, which it lists only when signed in', async () => {
	const signedIn = await agy.inspectAgy(targetOf(args => args === '--version' ? { code: 0, stdout: '1.5.17\n', stderr: '' } : { code: 0, stdout: MODELS, stderr: 'Fetching available models...\n' }));
	assert.equal(signedIn.kind, 'signedIn');
	assert.equal(signedIn.version, '1.5.17');
	assert.equal(signedIn.models.length, 10);
	assert.equal(signedIn.location, '/home/u/.local/bin/agy');

	const out = await agy.inspectAgy(targetOf(args => args === '--version' ? { code: 0, stdout: '1.5.17\n', stderr: '' } : { code: 1, stdout: '', stderr: 'Fetching available models...\nError: not signed in. Run agy to sign in.\n' }));
	assert.deepEqual([out.kind, out.version, out.message], ['notSignedIn', '1.5.17', 'Error: not signed in. Run agy to sign in.']);

	const broken = await agy.inspectAgy(targetOf(() => ({ code: 127, stdout: '', stderr: 'agy: cannot execute binary file' })));
	assert.deepEqual([broken.kind, broken.message], ['failed', 'agy: cannot execute binary file']);

	const gone = await agy.inspectAgy({ ...targetOf(() => ({})), ask: async () => { throw new Error('spawn agy ENOENT'); } });
	assert.deepEqual([gone.kind, gone.message], ['failed', 'spawn agy ENOENT']);
});

test('not there: said so, with WSL looked at on Windows', async () => {
	const run = async () => ({ code: 3, stdout: '', stderr: '' });
	assert.deepEqual((await agy.detectAgy({ env: { PATH: '/bin' }, platform: 'linux', home: '/home/u', run, isFile: () => false })).check, { kind: 'notInstalled', lookedInWsl: false });
	assert.deepEqual((await agy.detectAgy({ env: { PATH: 'C:\\bin' }, platform: 'win32', home: 'C:\\Users\\u', run, isFile: () => false })).check, { kind: 'notInstalled', lookedInWsl: true });
	const found = await agy.detectAgy({ env: { PATH: '/bin' }, platform: 'linux', home: '/home/u', run: async (file, args) => (file === '/home/u/.local/bin/agy' && args[0] === '--version' ? { code: 0, stdout: '1.5.17', stderr: '' } : { code: 0, stdout: MODELS, stderr: '' }), isFile: f => f === '/home/u/.local/bin/agy' });
	assert.equal(found.check.kind, 'signedIn');
	assert.equal(found.target.path, '/home/u/.local/bin/agy');
});

/** What agy 1.5.17 printed for `agy -p /usage` (its own command: no model request, no conversation kept). */
const USAGE = [
	'Gemini Models\tWeekly Limit Remaining\t97%\t2026-12-02T09:56:31Z',
	'Gemini Models\tFive Hour Limit Remaining\t96%\t2026-11-25T14:56:31Z',
	'Claude and GPT models\tWeekly Limit Remaining\t100%\t2026-12-02T11:26:44Z',
	'Claude and GPT models\tFive Hour Limit Remaining\t100%\t2026-11-25T16:26:44Z',
].join('\n') + '\n';

test('agy\'s limits as `/usage` prints them: how much is used of each, five hours before the week in each group of models', () => {
	assert.deepEqual(agy.parseAgyUsage(USAGE), [
		{ name: 'Five Hour Limit', group: 'Gemini Models', percent: 4, resets: '2026-11-25T14:56:31Z' },
		{ name: 'Weekly Limit', group: 'Gemini Models', percent: 3, resets: '2026-12-02T09:56:31Z' },
		{ name: 'Five Hour Limit', group: 'Claude and GPT models', percent: 0, resets: '2026-11-25T16:26:44Z' },
		{ name: 'Weekly Limit', group: 'Claude and GPT models', percent: 0, resets: '2026-12-02T11:26:44Z' },
	]);
	assert.deepEqual(agy.parseAgyUsage('Here is the current session status:\n- **Model**: Gemini 4 Hydrogen (High)\n'), [], 'what its model wrote is no table');
	assert.deepEqual(agy.parseAgyUsage('Pro Models\tMonthly Quota Remaining\t12.5%'), [{ name: 'Monthly Quota', group: 'Pro Models', percent: 87.5 }], 'one it names otherwise, as it is');
});

test('asking agy for its limits: only an agy known to answer /usage itself (an older one would pass it to its model), and nothing when it fails', async () => {
	const asked = [];
	const target = { where: 'native', path: '/u/agy', ask: async args => { asked.push(args.join(' ')); return { code: 0, stdout: USAGE, stderr: '' }; } };
	assert.equal(await agy.fetchAgyUsage(target, '1.5.16'), undefined);
	assert.equal(await agy.fetchAgyUsage(target, undefined), undefined);
	assert.deepEqual(asked, [], 'an older agy, or one whose version is not known, is not asked');
	assert.equal((await agy.fetchAgyUsage(target, '1.5.17')).length, 4);
	assert.deepEqual(asked, ['-p /usage']);
	assert.equal(await agy.fetchAgyUsage({ ...target, ask: async () => ({ code: 1, stdout: '', stderr: 'x' }) }, '1.6.0'), undefined);
	assert.equal(await agy.fetchAgyUsage({ ...target, ask: async () => { throw new Error('timeout'); } }, '1.6.0'), undefined);
	assert.deepEqual([versionAtLeast('1.5.17', '1.5.17'), versionAtLeast('1.6.0', '1.5.17'), versionAtLeast('1.5.9', '1.5.17'), versionAtLeast('2.0.0-beta.1', '1.5.17'), versionAtLeast('x', '1.5.17')], [true, true, false, true, false]);
});

test('agy\'s own folder, where it writes its conversations down: here, and inside WSL as WSL tells it', () => {
	assert.equal(agy.agyConfigDir('/home/u', 'linux'), '/home/u/.gemini/antigravity-cli');
	assert.equal(agy.agyConfigDir('C:\\Users\\u', 'win32'), 'C:\\Users\\u\\.gemini\\antigravity-cli');
	assert.equal(agy.AGY_PROGRAM.wslConfigDir, '$HOME/.gemini/antigravity-cli');
});

test('the limits on agy\'s page: each named in the page\'s language, how much is used, when it resets in this computer\'s time', () => {
	const check = { kind: 'signedIn', where: 'native', location: '/u/agy', version: '1.5.17', models: [{ id: 'm', title: 'M' }] };
	const lines = agy.parseAgyUsage(USAGE);
	const now = new Date('2026-11-25T12:00:00Z');
	assert.deepEqual(tx.agyStatusOf(check, tx.AGY_TEXTS['en'], lines, now).usage.map(u => [u.label, u.percent]), [['5-hour limit (Gemini models)', 4], ['Weekly limit (Gemini models)', 3], ['5-hour limit (Claude and GPT models)', 0], ['Weekly limit (Claude and GPT models)', 0]]);
	assert.deepEqual(tx.agyStatusOf(check, tx.AGY_TEXTS['zh-cn'], lines, now).usage.map(u => u.label), ['5 小时限额（Gemini 模型）', '每周限额（Gemini 模型）', '5 小时限额（Claude 与 GPT 模型）', '每周限额（Claude 与 GPT 模型）']);
	const [first] = tx.agyStatusOf(check, tx.AGY_TEXTS['zh-tw'], lines, now).usage;
	assert.equal(first.detail, `重設時間：${new Date('2026-11-25T14:56:31Z').toLocaleString('zh-TW', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}`);
	assert.equal(tx.agyLimitLabel({ name: 'Monthly Quota', group: 'Pro Models', percent: 1 }, tx.AGY_TEXTS['zh-tw']), 'Monthly Quota（Pro Models）');
	assert.equal(tx.agyStatusOf(check, tx.AGY_TEXTS['en'], [], now).usage, undefined, 'none read: no bars');
	assert.equal(tx.agyStatusOf({ kind: 'notSignedIn', where: 'native', location: '/u/agy' }, tx.AGY_TEXTS['en'], lines, now).usage, undefined, 'only while connected');
});

test('a reset time as an agent writes it: an instant (agy), or Claude Code\'s clock of its zone', () => {
	const now = new Date('2026-11-22T07:30:00Z');
	assert.equal(resetInstant('2026-11-25T14:56:31Z', now)?.toISOString(), '2026-11-25T14:56:31.000Z');
	assert.equal(resetInstant('2026-11-25T06:56:31-08:00', now)?.toISOString(), '2026-11-25T14:56:31.000Z');
	assert.equal(resetInstant('Nov 22, 12:49am (America/Los_Angeles)', now)?.toISOString(), '2026-11-22T08:49:00.000Z', 'Claude Code\'s, as before');
	assert.equal(resetInstant('2026-13-45T99:00:00Z', now), undefined);
});

test('a program started with variables of its own: in WSL before its command, here in its environment', async () => {
	assert.equal(wslRunScript('/home/u/.local/bin/claude', ['-p', "it's"], { CLAUDE_CODE_SUBAGENT_MODEL_FORCE: '1', 'BAD-NAME': 'x', EFFORT: "a'b" }),
		"CLAUDE_CODE_SUBAGENT_MODEL_FORCE='1' EFFORT='a'\\''b' PATH='/home/u/.local/bin':$PATH exec '/home/u/.local/bin/claude' '-p' 'it'\\''s'");
	assert.equal(wslRunScript('/u/agy', ['models']), "PATH='/u':$PATH exec '/u/agy' 'models'", 'none: as before');
	const seen = [];
	const target = nativeTarget('/u/claude', async () => ({ code: 0, stdout: '', stderr: '' }), (file, args, options) => { seen.push(options); return {}; });
	target.start(['-p'], '/w', { A: '1' });
	target.start(['-p'], '/w');
	assert.deepEqual(seen, [{ cwd: '/w', env: { A: '1' } }, { cwd: '/w' }]);
	// A real child sees them.
	const child = createStarter(process.env, process.platform)(process.execPath, ['-e', 'process.stdout.write(String(process.env.BZ_TEST_VAR))'], { env: { BZ_TEST_VAR: 'seen' } });
	let printed = '';
	child.stdout.on('data', data => { printed += data; });
	await new Promise(resolve => child.on('close', resolve));
	assert.equal(printed, 'seen');
});
