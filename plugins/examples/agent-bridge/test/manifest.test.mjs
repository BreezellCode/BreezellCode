// What package.json promises: a tile on Box › Models › Sign in for each agent (Claude Code, Antigravity CLI)
// whose switch is off until the user turns it on, a consent that names what is read and where conversations go,
// no permission beyond ui.contribute and chat.agent, nothing that passes for Breezell or uses anyone's logo, and
// every text in English, Traditional and Simplified Chinese.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = path => JSON.parse(readFileSync(new URL(`../${path}`, import.meta.url), 'utf8'));
const pkg = read('package.json');
const tile = pkg.contributes.breezell.ui.signIns[0];
const agy = pkg.contributes.breezell.ui.signIns[1];

test('a tile for each agent, each turned by the plugin\'s own setting, which is off by default and the user\'s alone', () => {
	assert.deepEqual(pkg.contributes.breezell.ui.signIns.map(t => [t.id, t.setting]), [['claudeCode', 'agentBridge.claudeCode.enabled'], ['antigravity', 'agentBridge.antigravity.enabled']]);
	for (const each of [tile, agy]) {
		const setting = pkg.contributes.configuration.properties[each.setting];
		assert.equal(setting.type, 'boolean');
		assert.equal(setting.default, false);
		assert.equal(setting.scope, 'application');
		assert.equal(each.agent, true);
		assert.ok(pkg.contributes.commands.some(c => c.command === each.command), each.id);
	}
	assert.equal(agy.command, 'agentBridge.antigravity.recheck');
});

test('only ui.contribute and chat.agent (the tile answers conversations); runs on the user\'s own computer, where their Claude Code is', () => {
	assert.deepEqual(pkg.breezell.permissions, ['ui.contribute', 'chat.agent', 'chat.events']);
	assert.equal(tile.agent, true);
	assert.deepEqual(pkg.extensionKind, ['ui']);
	assert.deepEqual(pkg.activationEvents, ['onStartupFinished']);
	assert.ok(pkg.contributes.commands.some(c => c.command === tile.command));
});

test('its page in Box is the tile\'s, with a button that brings the conversations in; the command is its own', () => {
	assert.deepEqual(pkg.contributes.breezell.launcher, { signIn: 'claudeCode', sidebar: true });
	assert.deepEqual(tile.actions.map(a => a.command), ['agentBridge.claudeCode.sync']);
	assert.deepEqual(Object.keys(tile.actions[0].l10n).sort(), ['zh-CN', 'zh-TW']);
	assert.ok(pkg.contributes.commands.some(c => c.command === 'agentBridge.claudeCode.sync'));
});

test('deleting in Claude Code too: a switch of its page, off by default, that says what it does and asks before it turns on', () => {
	const [option] = tile.options;
	assert.equal(option.setting, 'agentBridge.claudeCode.deleteSessions');
	const setting = pkg.contributes.configuration.properties[option.setting];
	assert.deepEqual([setting.type, setting.default, setting.scope], ['boolean', false, 'application']);
	assert.deepEqual(Object.keys(option.l10n).sort(), ['zh-CN', 'zh-TW']);
	assert.deepEqual(Object.keys(option.descriptionL10n).sort(), ['zh-CN', 'zh-TW']);
	assert.match(option.descriptionL10n['zh-TW'], /關閉：只刪除 Breezell 這邊/);
	for (const field of ['l10n', 'messageL10n', 'agreeL10n']) {
		assert.deepEqual(Object.keys(option.confirm[field]).sort(), ['zh-CN', 'zh-TW'], `confirm.${field}`);
	}
	assert.match(option.confirm.messageL10n['zh-TW'], /無法復原/);
});

test('a plain codicon, not a brand logo; no name that passes for Breezell; the plugin is not named after Claude Code', () => {
	assert.equal(tile.icon, 'sparkle', 'a codicon: Breezell draws it, no image of anyone\'s logo');
	assert.equal(pkg.icon, 'media/icon.png', 'its market icon is its own drawing (a bridge), no one\'s logo');
	for (const text of [tile.title, ...Object.values(tile.l10n ?? {})]) {
		assert.doesNotMatch(text, /breezell/i);
	}
	for (const nls of ['package.nls.json', 'i18n/package.nls.zh-tw.json', 'i18n/package.nls.zh-cn.json']) {
		assert.doesNotMatch(read(nls).displayName, /claude|anthropic/i, nls);
	}
});

test('Antigravity CLI\'s tile: a plain codicon, its note and consent say who signs in, what is read, where conversations go and that agy\'s settings are left alone', () => {
	assert.equal(agy.icon, 'rocket');
	assert.equal(agy.title, 'Antigravity CLI');
	for (const field of ['switchL10n', 'descriptionL10n']) {
		assert.deepEqual(Object.keys(agy[field]).sort(), ['zh-CN', 'zh-TW'], field);
	}
	for (const field of ['l10n', 'messageL10n', 'agreeL10n']) {
		assert.deepEqual(Object.keys(agy.consent[field]).sort(), ['zh-CN', 'zh-TW'], `consent.${field}`);
	}
	for (const note of [agy.description, ...Object.values(agy.descriptionL10n)]) {
		assert.ok(note.length <= 600, 'within Breezell\'s note limit');
		assert.match(note, /Google/);
	}
	for (const consent of [agy.consent.message, agy.consent.messageL10n['zh-TW'], agy.consent.messageL10n['zh-CN']]) {
		assert.ok(consent.length <= 1200, 'within Breezell\'s consent limit');
		assert.match(consent, /Google/);
		assert.match(consent, /(憑證|凭证|credentials)/);
		assert.match(consent, /(對話的資料夾|对话的文件夹|conversation's folder)/, 'says where what is sent goes');
		assert.match(consent, /(自動核准|自动批准|auto-approve)/, 'and what decides its calls');
		assert.match(consent, /(不會寫入 agy 自己的設定|不会写入 agy 自己的设置|writes nothing to agy's own settings)/, 'and that agy\'s settings are left alone');
	}
});

test('the note and the consent say what the user asked them to say, in every language', () => {
	assert.match(tile.descriptionL10n['zh-TW'], /因為 Anthropic 的規定.*無法採用直接登入帳號的方式.*在 Claude Code 中登入帳號/);
	for (const consent of [tile.consent.messageL10n['zh-TW'], tile.consent.messageL10n['zh-CN'], tile.consent.message]) {
		assert.match(consent, /Anthropic/);
		assert.match(consent, /(電子郵件|电子邮件|email)/);
		assert.match(consent, /(憑證|凭证|credentials)/);
		assert.match(consent, /(對話的資料夾|对话的文件夹|conversation's folder)/, 'says where what is sent goes');
		assert.match(consent, /(自動核准|自动批准|auto-approve)/, 'and what decides its calls');
		assert.match(consent, /(專案的 Claude Code 對話|项目的 Claude Code 对话|Claude Code conversations of the projects)/, 'and that it reads the projects\' conversations');
	}
	for (const field of ['switchL10n', 'descriptionL10n']) {
		assert.deepEqual(Object.keys(tile[field]).sort(), ['zh-CN', 'zh-TW'], field);
	}
	for (const field of ['l10n', 'messageL10n', 'agreeL10n']) {
		assert.deepEqual(Object.keys(tile.consent[field]).sort(), ['zh-CN', 'zh-TW'], `consent.${field}`);
	}
	const en = read('package.nls.json');
	for (const nls of ['i18n/package.nls.zh-tw.json', 'i18n/package.nls.zh-cn.json']) {
		assert.deepEqual(Object.keys(read(nls)).sort(), Object.keys(en).sort(), nls);
	}
});
