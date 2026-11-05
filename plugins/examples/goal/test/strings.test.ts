import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { suite, test } from 'node:test';
import { fill, GOAL_STRINGS, goalStrings } from '../src/strings';

const root = join(__dirname, '..', '..');

suite('words', () => {
	const walk = (value: unknown, path: string, out: Map<string, string>) => {
		if (typeof value === 'string') {
			out.set(path, value);
		} else if (value && typeof value === 'object') {
			for (const [key, item] of Object.entries(value)) {
				walk(item, path ? `${path}.${key}` : key, out);
			}
		}
		return out;
	};
	const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map(match => match[1]).sort();
	const english = walk(GOAL_STRINGS.en, '', new Map());

	test('all eight languages, as Breezell names them', () => {
		assert.deepEqual(Object.keys(GOAL_STRINGS).sort(), ['en', 'es', 'ja', 'ko', 'pt-BR', 'ru', 'zh-CN', 'zh-TW']);
	});
	for (const [language, strings] of Object.entries(GOAL_STRINGS)) {
		test(`${language}: everything said, with the same blanks to fill`, () => {
			const words = walk(strings, '', new Map());
			assert.deepEqual([...words.keys()].sort(), [...english.keys()].sort());
			for (const [path, text] of english) {
				assert.ok(words.get(path)!.trim(), path);
				assert.deepEqual(placeholders(words.get(path)!), placeholders(text), `${language}: ${path}`);
			}
		});
		if (language !== 'en') {
			test(`${language}: it says it in its own words`, () => {
				const words = walk(strings, '', new Map());
				const same = [...english].filter(([path, text]) => words.get(path) === text && !/^\{|^\/goal|tokens$|^Token/.test(text)).map(([path]) => path);
				assert.ok(same.length <= 8, `${language} left in English: ${same.join(', ')}`);
			});
		}
	}
	test('languages it is asked for', () => {
		assert.equal(goalStrings('zh-TW'), GOAL_STRINGS['zh-TW']);
		assert.equal(goalStrings('zh-tw'), GOAL_STRINGS['zh-TW']);
		assert.equal(goalStrings('zh-CN'), GOAL_STRINGS['zh-CN']);
		assert.equal(goalStrings('zh'), GOAL_STRINGS['zh-CN']);
		assert.equal(goalStrings('pt-BR'), GOAL_STRINGS['pt-BR']);
		assert.equal(goalStrings('pt'), GOAL_STRINGS['pt-BR']);
		assert.equal(goalStrings(''), GOAL_STRINGS.en, 'empty for a moment at start');
		assert.equal(goalStrings(undefined), GOAL_STRINGS.en);
		assert.equal(goalStrings('de'), GOAL_STRINGS.en);
	});
	test('what fills a blank is text, whatever it holds', () => {
		assert.equal(fill('a {x} b', { x: '$& {y} $1' }), 'a $& {y} $1 b');
		assert.equal(fill('{n}/{max}', { n: 0, max: 5 }), '0/5');
		assert.equal(fill('{unknown}', {}), '{unknown}');
	});
	test('what the manifest shows is in every language', () => {
		const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
		const ui = pkg.contributes.breezell.ui;
		const titled = [...ui.buttons, ...ui.surfaces, ui.options, ...ui.options.items, ...ui.slashCommands];
		for (const item of titled) {
			assert.deepEqual(Object.keys(item.l10n).sort(), ['es', 'ja', 'ko', 'pt-BR', 'ru', 'zh-CN', 'zh-TW'], item.title ?? item.name);
		}
		const nls = JSON.parse(readFileSync(join(root, 'package.nls.json'), 'utf8'));
		for (const match of JSON.stringify(pkg).matchAll(/"%([\w.]+)%"/g)) {
			assert.ok(nls[match[1]], match[1]);
		}
	});
	test('every language names every command', () => {
		const keys = Object.keys(JSON.parse(readFileSync(join(root, 'package.nls.json'), 'utf8'))).sort();
		// In lowercase: that is the name VS Code and the market's devkit look for.
		for (const language of ['es', 'ja', 'ko', 'pt-br', 'ru', 'zh-cn', 'zh-tw']) {
			assert.deepEqual(Object.keys(JSON.parse(readFileSync(join(root, 'i18n', `package.nls.${language}.json`), 'utf8'))).sort(), keys, language);
		}
		assert.deepEqual(readdirSync(join(root, 'i18n')).filter(name => name.startsWith('package.nls.') && name !== name.toLowerCase()), [], 'a translation under a name nothing reads');
	});
	test('the slash menu\'s commands are the plugin\'s own', () => {
		const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
		const own = pkg.contributes.commands.map((command: { command: string }) => command.command);
		for (const row of pkg.contributes.breezell.ui.slashCommands) {
			if (row.command) {
				assert.ok(own.includes(row.command), row.name);
			}
			assert.ok(row.name === 'goal' || row.name.startsWith('goal '), row.name);
		}
		assert.equal(pkg.contributes.breezell.ui.slashCommands[0].command, undefined, '/goal goes in the box to be written on');
	});
	test('the settings agree with the card that sets them', () => {
		const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
		for (const item of pkg.contributes.breezell.ui.options.items) {
			const setting = pkg.contributes.configuration.properties[item.setting];
			assert.deepEqual(item.choices.map((choice: { value: string }) => choice.value), setting.enum, item.setting);
			assert.ok(setting.enum.includes(setting.default), item.setting);
		}
	});
});
