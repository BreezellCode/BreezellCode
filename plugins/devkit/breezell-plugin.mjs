#!/usr/bin/env node
/*---------------------------------------------------------------------------------------------
 *  Breezell plugin devkit. MIT License. One file, no dependencies, Node.js 18 or later.
 *
 *    init [dir]        create a plugin from a template
 *    build [dir]       bundle src/extension.ts into dist/extension.js (esbuild from the plugin's node_modules)
 *    validate [dir]    check package.json
 *    pack [dir]        build and write <publisher>.<name>-<version>.vsix
 *                        --open    source included, readable build      (breezell.source = "open")
 *                        --closed  minified build and media scripts only, no source, no maps (breezell.source = "closed")
 *    submit [dir] --market <clone of BreezellCode/BreezellCode>
 *                      copy the .vsix into the market, update its plugin.json and index.json
 *    index <market plugins folder> [--check]
 *                      rebuild index.json from packages/<id>/plugin.json; --check verifies every package
 *                      and blocklist.json
 *    templates-json    print devkit/templates.json (what Breezell's "Create a plugin" uses)
 *    types             print the plugin API typings
 *
 *  Packing never needs an upload: install the .vsix in Breezell (Plugins › Installed › Install
 *  local .vsix) and it works the same as a market plugin.
 *--------------------------------------------------------------------------------------------*/

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const DEVKIT_VERSION = '1.0.0';
const API_VERSION = 1;
const PERMISSIONS = ['chat.events', 'models.request', 'models.select', 'chat.read', 'chat.send', 'chat.approve', 'providers.read', 'agent.tools', 'app.restart', 'app.forceRestart', 'editor.read', 'chat.input', 'chat.intercept', 'chat.render', 'ui.contribute', 'ui.modify'];
/**
 * What Breezell lets a plugin do to its screens (contributes.breezell.ui). Breezell checks all of this
 * again when it loads a plugin, and what fails there is left out: this is to tell you sooner.
 */
const UI_BUTTON_SLOTS = ['chat.input.toolbar', 'chat.message.actions', 'code.block.actions'];
const UI_SURFACE_SLOTS = ['chat.input.above', 'chat.messages.top', 'chat.landing', 'chat.input.companion'];
const UI_MODE_BASES = ['normal', 'plan', 'analyze', 'agent'];
const UI_TEXT_STYLE = ['backgroundColor', 'color', 'borderColor', 'borderRadius', 'borderWidth', 'padding', 'fontSize', 'fontWeight', 'fontFamily', 'lineHeight'];
const UI_REGIONS = {
	'chat.surface': { style: ['backgroundColor'] },
	'chat.landing': { hide: true, replace: true, style: UI_TEXT_STYLE },
	'chat.landing.hero': { hide: true, replace: true },
	'chat.landing.hints': { hide: true },
	'chat.messages': { replace: true },
	'chat.rail': { hide: true },
	'chat.message.user': { style: UI_TEXT_STYLE },
	'chat.message.assistant': { style: UI_TEXT_STYLE },
	'chat.turnStats': { hide: true, style: [...UI_TEXT_STYLE, 'opacity'] },
	'chat.input.frame': { style: ['backgroundColor', 'borderColor', 'borderRadius', 'borderWidth'] },
	'chat.input.mode': { hide: true },
	'chat.input.mention': { hide: true, order: true },
	'chat.input.browser': { hide: true, order: true },
	'chat.input.attach': { hide: true, order: true },
	'chat.input.imageMode': { hide: true, order: true },
	'chat.input.quickPhrases': { hide: true, order: true },
	'chat.input.promptOptimize': { hide: true, order: true },
	'chat.input.mcp': { hide: true, order: true },
};
const UI_PROTECTED = ['account', 'signIn', 'plan', 'billing', 'upgrade', 'quota', 'customApi', 'chat.input.model', 'chat.input.send', 'chat.input.context', 'chat.quota', 'chat.toolApproval', 'chat.error', 'box', 'plugins', 'permissions', 'updates'];
const UI_FENCES_TAKEN = [
	'mermaid', 'causal', 'diff', 'patch', 'markdown', 'md', 'mdx', 'text', 'txt', 'plain', 'plaintext', 'latex', 'tex', 'math',
	'json', 'jsonc', 'yaml', 'yml', 'toml', 'ini', 'xml', 'html', 'svg', 'css', 'scss', 'less', 'sql', 'graphql',
	'javascript', 'js', 'jsx', 'mjs', 'cjs', 'typescript', 'ts', 'tsx', 'python', 'py', 'bash', 'sh', 'shell', 'zsh', 'fish', 'powershell', 'ps1', 'pwsh', 'bat', 'cmd', 'console',
	'c', 'h', 'cpp', 'c++', 'cc', 'hpp', 'csharp', 'cs', 'java', 'kotlin', 'kt', 'go', 'golang', 'rust', 'rs', 'ruby', 'rb', 'php', 'swift', 'scala', 'lua', 'dart', 'r', 'perl', 'pl',
	'dockerfile', 'makefile', 'vue', 'svelte',
];
/** On these, what is drawn on it must stay readable: only the theme's own backgrounds. */
const UI_THEME_BACKGROUND_ONLY = ['chat.surface', 'chat.input.frame'];
const UI_THEME_BACKGROUNDS = ['editor', 'sideBar', 'panel', 'input', 'editorWidget', 'dropdown', 'menu', 'quickInput', 'notifications'];
const UI_THEME_BACKGROUND = new RegExp(`^(transparent|var\\(--vscode-(${UI_THEME_BACKGROUNDS.join('|')})-background\\))$`);
const UI_ID = /^[a-z][a-zA-Z0-9_-]{0,63}$/;
const UI_CODICON = /^[a-z0-9][a-z0-9-]{0,63}$/;
const UI_PATH = /^(?!\/)(?!.*(?:^|\/)\.{0,2}(?:\/|$))[A-Za-z0-9._\-/]+$/;
/** One size: up to `maxPx`, up to 4em or 4rem, and a percentage (up to 50) only where `percent`. */
function uiLengthOk(value, maxPx, percent) {
	if (value === '0') {
		return true;
	}
	const size = /^([0-9]{1,3}(?:\.[0-9]{1,3})?)(px|em|rem|%)$/.exec(value);
	if (!size) {
		return false;
	}
	const n = Number(size[1]);
	return size[2] === 'px' ? n <= maxPx : size[2] === '%' ? percent && n <= 50 : n <= 4;
}
const uiLengthsOk = (value, maxPx, percent) => {
	const sizes = value.split(/\s/);
	return sizes.length <= 4 && sizes.every(size => uiLengthOk(size, maxPx, percent));
};

function uiStyleOk(property, value) {
	if (typeof value !== 'string' || !value || value.length > 160) {
		return false;
	}
	const v = value.trim();
	if (property !== 'fontFamily' && /url|expression|image|import|attr|element|paint|@|;|\{|\}|\\|\/\*|<|>|javascript:/i.test(v.replace(/^var\(--(vscode|breezell)-[a-zA-Z0-9-]+\)$/, ''))) {
		return false;
	}
	switch (property) {
		case 'backgroundColor':
		case 'color':
		case 'borderColor':
			return /^(#[0-9a-f]{3,8}|(rgb|rgba|hsl|hsla)\([0-9.,%\s/]{1,40}\)|transparent|currentcolor|[a-z]{3,24}|var\(--(vscode|breezell)-[a-zA-Z0-9-]{1,80}\))$/i.test(v);
		case 'borderRadius':
			return uiLengthsOk(v, 64, true);
		case 'padding':
			return uiLengthsOk(v, 64, false);
		case 'borderWidth':
			return uiLengthOk(v, 4, false) && !/em$/.test(v);
		case 'fontSize': {
			const px = /^([0-9]{1,2}(\.[0-9]{1,2})?)px$/.exec(v);
			return !!px && Number(px[1]) >= 9 && Number(px[1]) <= 32;
		}
		case 'fontWeight':
			return /^[1-9]00$/.test(v) || v === 'normal' || v === 'bold';
		case 'fontFamily':
			return /^[a-zA-Z0-9 ,'"-]{1,120}$/.test(v) && !/url|expression/i.test(v);
		case 'lineHeight':
			return /^[0-9](\.[0-9]{1,2})?$/.test(v) && Number(v) >= 1 && Number(v) <= 3;
		case 'opacity':
			return /^[01](\.[0-9]{1,2})?$/.test(v) && Number(v) >= 0.3 && Number(v) <= 1;
		default:
			return false;
	}
}

/** contributes.breezell.ui, and the permissions it needs. */
/** A plugin's card in Feature Options. Keep in step with readPluginOptions in Breezell. */
function checkUiOptions(raw, pkg, errors) {
	if (raw === undefined) {
		return false;
	}
	if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
		errors.push('"ui.options" must be an object');
		return false;
	}
	if (typeof raw.title !== 'string' || !raw.title.trim()) {
		errors.push('ui.options needs a title');
		return false;
	}
	if (!Array.isArray(raw.items)) {
		errors.push('"ui.options.items" must be an array');
		return false;
	}
	if (raw.items.length > 12) {
		errors.push('ui.options.items: at most 12');
	}
	const blocks = pkg.contributes?.configuration;
	const own = Object.assign({}, ...(Array.isArray(blocks) ? blocks : [blocks]).map(block => block?.properties ?? {}));
	const seen = new Set();
	let good = 0;
	for (const item of raw.items.slice(0, 12)) {
		const where = `ui.options: ${JSON.stringify(item?.setting ?? item)}`;
		const schema = typeof item?.setting === 'string' ? own[item.setting] : undefined;
		const known = Array.isArray(schema?.enum) ? schema.enum.filter(v => typeof v === 'string') : undefined;
		if (!schema) {
			errors.push(`${where}: "setting" must be one of the plugin's own, in contributes.configuration`);
		} else if (/breezell/i.test(item.setting)) {
			errors.push(`${where}: a setting named after Breezell is not for a plugin`);
		} else if (typeof item.title !== 'string' || !item.title.trim()) {
			errors.push(`${where} needs a title`);
		} else if (seen.has(item.setting)) {
			errors.push(`${where}: listed twice`);
		} else if (schema.type === 'boolean') {
			seen.add(item.setting);
			good++;
		} else if (known?.length) {
			seen.add(item.setting);
			const values = new Set();
			for (const choice of Array.isArray(item.choices) ? item.choices.slice(0, 6) : []) {
				if (known.includes(choice?.value) && typeof choice?.title === 'string' && choice.title.trim() && !values.has(choice.value)) {
					values.add(choice.value);
				} else {
					errors.push(`${where}: a choice needs a title and a value among the setting's enum`);
				}
			}
			if (values.size < 2) {
				errors.push(`${where}: needs at least two choices, at most 6`);
			} else {
				good++;
			}
		} else {
			errors.push(`${where}: only a boolean setting or a string with an enum can go here`);
		}
	}
	return good > 0;
}

function checkUi(ui, pkg, errors, dir) {
	if (ui === undefined) {
		return;
	}
	if (typeof ui !== 'object' || ui === null || Array.isArray(ui)) {
		errors.push('"contributes.breezell.ui" must be an object');
		return;
	}
	const list = key => {
		if (ui[key] !== undefined && !Array.isArray(ui[key])) {
			errors.push(`"ui.${key}" must be an array`);
			return [];
		}
		return ui[key] ?? [];
	};
	const commands = (Array.isArray(pkg.contributes?.commands) ? pkg.contributes.commands : pkg.contributes?.commands ? [pkg.contributes.commands] : []).map(c => c?.command);
	const declared = [...(pkg.breezell?.permissions ?? []), ...(pkg.breezell?.optionalPermissions ?? [])];
	const needs = (permission, what) => {
		if (!declared.includes(permission)) {
			errors.push(`${what} need the "${permission}" permission: add it to "breezell.permissions" or "breezell.optionalPermissions"`);
		}
	};
	const fileMissing = (relative) => dir && !fs.existsSync(path.join(dir, relative));

	const buttons = list('buttons');
	const perSlot = new Map();
	for (const b of buttons) {
		const where = `ui.buttons: ${JSON.stringify(b?.id ?? b)}`;
		if (!UI_ID.test(b?.id ?? '') || typeof b?.title !== 'string' || !b.title.trim()) {
			errors.push(`${where} needs an id (a letter, then letters, digits, _ or -) and a title`);
		}
		if (!UI_BUTTON_SLOTS.includes(b?.slot)) {
			errors.push(`${where}: no place ${JSON.stringify(b?.slot)} (there are ${UI_BUTTON_SLOTS.join(', ')})`);
		}
		if (!commands.includes(b?.command)) {
			errors.push(`${where}: "command" must be one of the plugin's own, in contributes.commands`);
		} else if (/breezell/i.test(b.command)) {
			errors.push(`${where}: a command name with "breezell" in it is Breezell's: rename "${b.command}"`);
		}
		if (b?.icon !== undefined && !UI_CODICON.test(b.icon)) {
			errors.push(`${where}: "icon" must be a codicon's name`);
		}
		perSlot.set(b?.slot, (perSlot.get(b?.slot) ?? 0) + 1);
		if (perSlot.get(b?.slot) > 2) {
			errors.push(`${where}: at most 2 of a plugin's buttons in ${b?.slot}`);
		}
	}
	if (buttons.length > 8) {
		errors.push('ui.buttons: at most 8');
	}

	const surfaces = list('surfaces');
	for (const s of surfaces) {
		const where = `ui.surfaces: ${JSON.stringify(s?.id ?? s)}`;
		const entry = typeof s?.entry === 'string' ? s.entry.replace(/^\.\//, '') : '';
		if (!UI_ID.test(s?.id ?? '') || typeof s?.title !== 'string' || !s.title.trim()) {
			errors.push(`${where} needs an id and a title`);
		}
		if (!UI_PATH.test(entry) || !/\.html?$/i.test(entry)) {
			errors.push(`${where}: "entry" must be an .html page inside the plugin`);
		} else if (fileMissing(entry)) {
			errors.push(`${where}: "${entry}" does not exist`);
		}
		if (s?.slot !== undefined && !UI_SURFACE_SLOTS.includes(s.slot)) {
			errors.push(`${where}: no place ${JSON.stringify(s.slot)} (there are ${UI_SURFACE_SLOTS.join(', ')})`);
		}
		if (s?.slot === 'chat.input.companion' && surfaces.indexOf(s) !== surfaces.findIndex(o => o?.slot === 'chat.input.companion')) {
			errors.push(`${where}: a plugin has one companion`);
		}
		for (const origin of s?.network ?? []) {
			if (!/^https:\/\/[a-z0-9.-]{1,200}(:[0-9]{1,5})?$/i.test(origin)) {
				errors.push(`${where}: "network" takes https origins, like https://api.example.com; not ${JSON.stringify(origin)}`);
			}
		}
	}
	if (surfaces.length > 6) {
		errors.push('ui.surfaces: at most 6');
	}

	const patches = list('patches');
	for (const p of patches) {
		const name = typeof p?.region === 'string' ? p.region : '';
		const where = `ui.patches: ${JSON.stringify(name || p)}`;
		if (UI_PROTECTED.some(area => name === area || name.startsWith(`${area}.`))) {
			errors.push(`${where} is protected: no plugin may change it`);
			continue;
		}
		const region = Object.prototype.hasOwnProperty.call(UI_REGIONS, name) ? UI_REGIONS[name] : undefined;
		if (!region) {
			errors.push(`${where}: no such part (there are ${Object.keys(UI_REGIONS).join(', ')})`);
			continue;
		}
		if (p.hide !== undefined && !(p.hide === true && region.hide)) {
			errors.push(`${where} cannot be hidden`);
		}
		if (p.order !== undefined && !(region.order && typeof p.order === 'number' && Number.isFinite(p.order))) {
			errors.push(`${where}: its order cannot be set`);
		}
		if (p.replaceWith !== undefined && !(region.replace && surfaces.some(s => s?.id === p.replaceWith))) {
			errors.push(`${where}: "replaceWith" must name one of the plugin's surfaces, where a part can be replaced`);
		}
		for (const [property, value] of Object.entries(p.style ?? {})) {
			if (!(region.style ?? []).includes(property)) {
				errors.push(`${where}: its style does not take "${property}"`);
			} else if (!uiStyleOk(property, value)) {
				errors.push(`${where}: ${JSON.stringify(value)} is no valid ${property}`);
			} else if (property === 'backgroundColor' && UI_THEME_BACKGROUND_ONLY.includes(name) && !UI_THEME_BACKGROUND.test(value.trim())) {
				errors.push(`${where}: what is on it must stay readable, so "backgroundColor" can only be "transparent" or var(--vscode-<x>-background) with x one of ${UI_THEME_BACKGROUNDS.join(', ')}`);
			}
		}
	}
	if (patches.length > 32) {
		errors.push('ui.patches: at most 32');
	}

	const renderers = list('renderers');
	for (const r of renderers) {
		const language = typeof r?.language === 'string' ? r.language.toLowerCase() : '';
		const where = `ui.renderers: ${JSON.stringify(r?.language ?? r)}`;
		if (!/^[a-z][a-z0-9_+-]{0,31}$/.test(language)) {
			errors.push(`${where}: "language" must be a code fence's language`);
		} else if (UI_FENCES_TAKEN.includes(language)) {
			errors.push(`${where}: Breezell draws this language itself`);
		}
		if (!surfaces.some(s => s?.id === r?.surface)) {
			errors.push(`${where}: "surface" must name one of the plugin's surfaces`);
		}
	}
	if (renderers.length > 8) {
		errors.push('ui.renderers: at most 8');
	}

	const modes = list('modes');
	for (const m of modes) {
		const where = `ui.modes: ${JSON.stringify(m?.id ?? m)}`;
		const instructions = typeof m?.instructions === 'string' ? m.instructions.replace(/^\.\//, '') : '';
		if (!UI_ID.test(m?.id ?? '') || typeof m?.title !== 'string' || !m.title.trim()) {
			errors.push(`${where} needs an id and a title`);
		}
		if (!UI_MODE_BASES.includes(m?.base)) {
			errors.push(`${where}: "base" must be one of ${UI_MODE_BASES.join(', ')}`);
		}
		if (!UI_PATH.test(instructions)) {
			errors.push(`${where}: "instructions" must be a file inside the plugin`);
		} else if (fileMissing(instructions)) {
			errors.push(`${where}: "${instructions}" does not exist`);
		}
		if (m?.icon !== undefined && !UI_CODICON.test(m.icon)) {
			errors.push(`${where}: "icon" must be a codicon's name`);
		}
	}
	if (modes.length > 4) {
		errors.push('ui.modes: at most 4');
	}

	const companion = surfaces.some(s => s?.slot === 'chat.input.companion');
	const hasOptions = checkUiOptions(ui.options, pkg, errors);
	if (buttons.length || surfaces.some(s => s?.slot && s.slot !== 'chat.input.companion') || modes.length || hasOptions) {
		needs('ui.contribute', 'ui.buttons, ui.surfaces, ui.options and ui.modes');
	}
	if (patches.length || companion) {
		needs('ui.modify', 'ui.patches and a companion');
	}
	if (renderers.length) {
		needs('chat.render', 'ui.renderers');
	}
}

/** The chat modes an agent tool can be offered in (contributes.breezell.tools[].modes). */
const TOOL_MODES = ['chat', 'agent', 'entanglement', 'analyze', 'teams'];
const MARKET_REPO = 'BreezellCode/BreezellCode';
const MARKET_URLS = [
	`https://raw.githubusercontent.com/${MARKET_REPO}/main/plugins/`,
	`https://cdn.jsdelivr.net/gh/${MARKET_REPO}@main/plugins/`,
	`https://fastly.jsdelivr.net/gh/${MARKET_REPO}@main/plugins/`,
];
const MAX_PACKAGE_BYTES = 50 * 1024 * 1024;
/** README.<locale>.md next to README.md (English): Breezell shows the user's language, else English. */
const README_LOCALES = ['zh-CN', 'zh-TW', 'ja', 'ko', 'ru', 'es', 'pt-BR'];
/**
 * Translations live in this folder of a plugin (README.<locale>.md, package.nls.<locale>.json), so the
 * plugin's root keeps only the English README.md and package.nls.json. `pack` moves the package.nls
 * files to the package root, where VS Code reads them. Files at the root are still accepted.
 */
const TRANSLATIONS_DIR = 'i18n';
/** The plugin's file for a translation: in i18n/, else at the root; undefined when neither exists. */
const translationFile = (dir, name) => [path.join(dir, TRANSLATIONS_DIR, name), path.join(dir, name)].find(f => fs.existsSync(f));
const SELF = fileURLToPath(import.meta.url);
const ID_PART = /^[a-z0-9][a-z0-9-]{0,62}$/;
const VERSION = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/;

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

class UserError extends Error { }
const fail = message => { throw new UserError(message); };
const log = message => process.stdout.write(`${message}\n`);
const readJson = file => {
	try {
		return JSON.parse(fs.readFileSync(file, 'utf8'));
	} catch (err) {
		fail(`cannot read ${file}: ${err.message}`);
	}
};
const writeJson = (file, value) => {
	fs.mkdirSync(path.dirname(file), { recursive: true });
	fs.writeFileSync(file, `${JSON.stringify(value, null, '\t')}\n`);
};
const sha256 = buffer => crypto.createHash('sha256').update(buffer).digest('hex');
const isHttps = value => {
	try {
		return new URL(value).protocol === 'https:';
	} catch {
		return false;
	}
};
const compareVersions = (a, b) => {
	const ma = VERSION.exec(a);
	const mb = VERSION.exec(b);
	if (!ma || !mb) {
		return ma ? 1 : mb ? -1 : 0;
	}
	for (let i = 1; i <= 3; i++) {
		const d = Number(ma[i]) - Number(mb[i]);
		if (d) {
			return Math.sign(d);
		}
	}
	return ma[4] === mb[4] ? 0 : !ma[4] ? 1 : !mb[4] ? -1 : ma[4] < mb[4] ? -1 : 1;
};

function parseArgs(argv) {
	const positional = [];
	const flags = {};
	for (let i = 0; i < argv.length; i++) {
		const arg = argv[i];
		if (arg.startsWith('--')) {
			const [key, inline] = arg.slice(2).split('=', 2);
			if (inline !== undefined) {
				flags[key] = inline;
			} else if (i + 1 < argv.length && !argv[i + 1].startsWith('--')) {
				flags[key] = argv[++i];
			} else {
				flags[key] = true;
			}
		} else {
			positional.push(arg);
		}
	}
	return { positional, flags };
}

// ---------------------------------------------------------------------------
// Zip (store + deflate), enough for .vsix files
// ---------------------------------------------------------------------------

const CRC_TABLE = (() => {
	const table = new Uint32Array(256);
	for (let n = 0; n < 256; n++) {
		let c = n;
		for (let k = 0; k < 8; k++) {
			c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
		}
		table[n] = c >>> 0;
	}
	return table;
})();
const crc32 = buffer => {
	let crc = 0xffffffff;
	for (const byte of buffer) {
		crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
	}
	return (crc ^ 0xffffffff) >>> 0;
};

/** Entries in the given order, fixed timestamps, so the same input gives the same bytes (and SHA-256). */
function writeZip(entries) {
	const locals = [];
	const centrals = [];
	let offset = 0;
	const DOS_TIME = 0;
	const DOS_DATE = (0 << 9) | (1 << 5) | 1; // 1980-01-01
	for (const { name, data } of entries) {
		const nameBuffer = Buffer.from(name, 'utf8');
		const deflated = zlib.deflateRawSync(data, { level: 9 });
		const useDeflate = deflated.length < data.length;
		const body = useDeflate ? deflated : data;
		const crc = crc32(data);
		const local = Buffer.alloc(30);
		local.writeUInt32LE(0x04034b50, 0);
		local.writeUInt16LE(20, 4);
		local.writeUInt16LE(0x0800, 6); // UTF-8 names
		local.writeUInt16LE(useDeflate ? 8 : 0, 8);
		local.writeUInt16LE(DOS_TIME, 10);
		local.writeUInt16LE(DOS_DATE, 12);
		local.writeUInt32LE(crc, 14);
		local.writeUInt32LE(body.length, 18);
		local.writeUInt32LE(data.length, 22);
		local.writeUInt16LE(nameBuffer.length, 26);
		local.writeUInt16LE(0, 28);
		locals.push(local, nameBuffer, body);
		const central = Buffer.alloc(46);
		central.writeUInt32LE(0x02014b50, 0);
		central.writeUInt16LE(20, 4);
		central.writeUInt16LE(20, 6);
		central.writeUInt16LE(0x0800, 8);
		central.writeUInt16LE(useDeflate ? 8 : 0, 10);
		central.writeUInt16LE(DOS_TIME, 12);
		central.writeUInt16LE(DOS_DATE, 14);
		central.writeUInt32LE(crc, 16);
		central.writeUInt32LE(body.length, 20);
		central.writeUInt32LE(data.length, 24);
		central.writeUInt16LE(nameBuffer.length, 28);
		central.writeUInt32LE(offset, 42);
		centrals.push(central, nameBuffer);
		offset += 30 + nameBuffer.length + body.length;
	}
	const centralSize = centrals.reduce((n, b) => n + b.length, 0);
	const end = Buffer.alloc(22);
	end.writeUInt32LE(0x06054b50, 0);
	end.writeUInt16LE(entries.length, 8);
	end.writeUInt16LE(entries.length, 10);
	end.writeUInt32LE(centralSize, 12);
	end.writeUInt32LE(offset, 16);
	return Buffer.concat([...locals, ...centrals, end]);
}

/** name → data of every file in a zip. */
function readZip(buffer) {
	let eocd = -1;
	for (let i = buffer.length - 22; i >= Math.max(0, buffer.length - 65557); i--) {
		if (buffer.readUInt32LE(i) === 0x06054b50) {
			eocd = i;
			break;
		}
	}
	if (eocd < 0) {
		fail('not a zip file');
	}
	const count = buffer.readUInt16LE(eocd + 10);
	let pointer = buffer.readUInt32LE(eocd + 16);
	const files = new Map();
	for (let i = 0; i < count; i++) {
		if (buffer.readUInt32LE(pointer) !== 0x02014b50) {
			fail('broken zip central directory');
		}
		const method = buffer.readUInt16LE(pointer + 10);
		const compressedSize = buffer.readUInt32LE(pointer + 20);
		const nameLength = buffer.readUInt16LE(pointer + 28);
		const extraLength = buffer.readUInt16LE(pointer + 30);
		const commentLength = buffer.readUInt16LE(pointer + 32);
		const localOffset = buffer.readUInt32LE(pointer + 42);
		const name = buffer.subarray(pointer + 46, pointer + 46 + nameLength).toString('utf8');
		const localNameLength = buffer.readUInt16LE(localOffset + 26);
		const localExtraLength = buffer.readUInt16LE(localOffset + 28);
		const start = localOffset + 30 + localNameLength + localExtraLength;
		const raw = buffer.subarray(start, start + compressedSize);
		if (method !== 0 && method !== 8) {
			fail(`unsupported zip method ${method} for ${name}`);
		}
		files.set(name, method === 8 ? zlib.inflateRawSync(raw) : Buffer.from(raw));
		pointer += 46 + nameLength + extraLength + commentLength;
	}
	return files;
}

// ---------------------------------------------------------------------------
// package.json checks
// ---------------------------------------------------------------------------

function checkPackage(pkg, { forMarket = false, nls, dir } = {}) {
	const errors = [];
	const warnings = [];
	for (const field of ['displayName', 'description']) {
		const key = nlsPlaceholder(pkg[field]);
		if (key !== undefined && typeof nls?.[key] !== 'string') {
			errors.push(`"${field}" is "%${key}%" but package.nls.json has no "${key}"`);
		}
	}
	if (!ID_PART.test(pkg.publisher ?? '')) {
		errors.push('"publisher": lowercase letters, digits and dashes');
	}
	if (!ID_PART.test(pkg.name ?? '')) {
		errors.push('"name": lowercase letters, digits and dashes');
	}
	if (!VERSION.test(pkg.version ?? '')) {
		errors.push('"version": major.minor.patch');
	}
	if (typeof pkg.engines?.vscode !== 'string') {
		errors.push('"engines.vscode" is required (e.g. "^1.90.0")');
	}
	if (pkg.main !== undefined && typeof pkg.main !== 'string') {
		errors.push('"main" must be a path (e.g. "./dist/extension.js"), or left out for a pack without code');
	}
	const declared = pkg.contributes?.breezell;
	if (declared !== undefined) {
		for (const w of declared.windows ?? []) {
			if (typeof w?.id !== 'string' || !/^[a-z0-9][a-z0-9-]{0,31}$/.test(w.id) || typeof w.entry !== 'string' || !/\.html?$/i.test(w.entry) || w.entry.startsWith('/') || w.entry.split(/[\\/]/).includes('..')) {
				errors.push('"contributes.breezell.windows": each window needs an "id" (lowercase, digits, dashes) and an .html "entry" inside the plugin');
			}
		}
		if (declared.restart !== undefined) {
			const r = declared.restart;
			if (!r || typeof r !== 'object' || Array.isArray(r)) {
				errors.push('"contributes.breezell.restart" must be an object');
			} else {
				for (const [when, v] of Object.entries(r)) {
					const where = `"contributes.breezell.restart.${when}"`;
					if (!['afterInstall', 'afterUpdate', 'afterUninstall'].includes(when)) {
						errors.push(`${where}: it can be afterInstall, afterUpdate or afterUninstall`);
					} else if (!v || typeof v !== 'object' || !['extensionHost', 'window', 'app'].includes(v.scope)) {
						errors.push(`${where}: "scope" must be extensionHost, window or app`);
					} else if (typeof v.reason !== 'string' || !v.reason.trim() || v.reason.length > 300) {
						errors.push(`${where}: "reason" is needed, at most 300 characters: the user is told why`);
					} else if (v.force === true && when === 'afterUninstall') {
						errors.push(`${where}: a plugin being removed may only ask`);
					} else if (v.force === true && !pkg.breezell?.permissions?.includes('app.forceRestart')) {
						errors.push(`${where}: "force" needs the "app.forceRestart" permission`);
					}
				}
			}
		}
		if (declared.launcher !== undefined) {
			const own = (pkg.contributes?.commands ?? []).map(c => c?.command);
			const l = declared.launcher;
			const ok = l && typeof l === 'object' && (typeof l.command === 'string' ? own.includes(l.command) : typeof l.window === 'string' && (declared.windows ?? []).some(w => w?.id === l.window));
			if (!ok) {
				errors.push('"contributes.breezell.launcher" needs "command" (one of the plugin\'s contributes.commands) or "window" (one of its windows); "sidebar": false keeps it out of the Box sidebar');
			}
		}
		for (const key of ['skills', 'rules']) {
			const list = declared[key] ?? [];
			if (!Array.isArray(list) || list.some(p => typeof p !== 'string' || p.startsWith('/') || p.split(/[\\/]/).includes('..'))) {
				errors.push(`"contributes.breezell.${key}" must be an array of paths inside the plugin`);
			}
		}
		const servers = declared.mcpServers ?? {};
		if (typeof servers !== 'object' || Array.isArray(servers) || Object.values(servers).some(s => typeof s !== 'object' || s === null || (typeof s.command !== 'string' && typeof s.url !== 'string'))) {
			errors.push('"contributes.breezell.mcpServers" maps a name to { "command", "args", "env" } or { "url" }');
		}
		// Agent tools: declared here, run by the plugin's code (vscode.breezell.tools.register).
		const tools = declared.tools ?? [];
		if (!Array.isArray(tools) || tools.length > 16) {
			errors.push('"contributes.breezell.tools" is an array of at most 16 tools');
		} else {
			const names = new Set();
			for (const t of tools) {
				const where = `"contributes.breezell.tools"${typeof t?.name === 'string' ? ` ${t.name}` : ''}`;
				if (typeof t?.name !== 'string' || !/^[a-z][a-z0-9_]{1,47}$/.test(t.name)) {
					errors.push(`${where}: "name" is 2 to 48 lowercase letters, digits and underscores, starting with a letter`);
				} else if (names.has(t.name)) {
					errors.push(`${where}: duplicate name`);
				} else {
					names.add(t.name);
				}
				if (typeof t?.description !== 'string' || !t.description.trim() || t.description.length > 2000) {
					errors.push(`${where}: "description" tells the agent what the tool does and when to use it (1 to 2,000 characters)`);
				}
				const schema = t?.inputSchema;
				if (schema !== undefined && (typeof schema !== 'object' || schema === null || Array.isArray(schema) || (schema.type !== undefined && schema.type !== 'object') || (schema.properties !== undefined && (typeof schema.properties !== 'object' || schema.properties === null)))) {
					errors.push(`${where}: "inputSchema" is a JSON Schema of type "object"`);
				} else if (schema !== undefined && JSON.stringify(schema).length > 16000) {
					errors.push(`${where}: "inputSchema" is longer than 16,000 characters`);
				}
				const modes = t?.modes === undefined ? [] : Array.isArray(t.modes) ? t.modes : [t.modes];
				for (const mode of modes) {
					if (!TOOL_MODES.includes(mode)) {
						errors.push(`${where}: unknown mode ${JSON.stringify(mode)} (use ${TOOL_MODES.join(', ')}; none: agent)`);
					}
				}
			}
			if (tools.length && typeof pkg.main !== 'string') {
				errors.push('"contributes.breezell.tools" need code that runs them: "main", calling vscode.breezell.tools.register for each');
			}
		}
		const reachesAgent = (Array.isArray(tools) && tools.length > 0) || (servers && typeof servers === 'object' && Object.keys(servers).length > 0);
		if (reachesAgent && !(Array.isArray(pkg.breezell?.permissions) && pkg.breezell.permissions.includes('agent.tools'))) {
			errors.push('"contributes.breezell.tools" and "mcpServers" reach the agent only with the "agent.tools" permission: add it to "breezell.permissions"');
		}
		checkUi(declared.ui, pkg, errors, dir);
	}
	if (typeof pkg.main !== 'string' && declared === undefined && !pkg.contributes?.themes) {
		errors.push('a plugin needs code ("main") or declared contents ("contributes.breezell" skills, rules or MCP servers, or "contributes.themes")');
	}
	const bz = pkg.breezell;
	if (typeof bz !== 'object' || bz === null || Array.isArray(bz)) {
		errors.push('"breezell" object is required: { "apiVersion": 1, "permissions": [] }');
	} else {
		if (!Number.isInteger(bz.apiVersion) || bz.apiVersion < 1 || bz.apiVersion > API_VERSION) {
			errors.push(`"breezell.apiVersion" must be 1..${API_VERSION}`);
		}
		for (const p of bz.permissions ?? []) {
			if (!PERMISSIONS.includes(p)) {
				errors.push(`unknown permission "${p}" (known: ${PERMISSIONS.join(', ')})`);
			}
		}
		// Unlike "permissions", an older Breezell leaves out those it does not know, and installs the plugin.
		if (bz.optionalPermissions !== undefined && (!Array.isArray(bz.optionalPermissions) || bz.optionalPermissions.some(p => !PERMISSIONS.includes(p)))) {
			errors.push(`"breezell.optionalPermissions" must list known permissions (${PERMISSIONS.join(', ')})`);
		}
		if (bz.source !== undefined && bz.source !== 'open' && bz.source !== 'closed') {
			errors.push('"breezell.source" must be "open" or "closed"');
		}
	}
	const kinds = Array.isArray(pkg.extensionKind) ? pkg.extensionKind : pkg.extensionKind ? [pkg.extensionKind] : [];
	if (kinds[0] !== 'ui') {
		warnings.push('"extensionKind" should start with "ui" (e.g. ["ui", "workspace"]): in a remote (WSL, SSH) window the plugin then runs on the local side, where vscode.breezell is always current');
	}
	if (!pkg.displayName) {
		(forMarket ? errors : warnings).push('"displayName" is missing');
	}
	if (!pkg.description) {
		(forMarket ? errors : warnings).push('"description" is missing');
	}
	const repository = typeof pkg.repository === 'string' ? pkg.repository : pkg.repository?.url;
	if (repository !== undefined && !isHttps(repository)) {
		errors.push('"repository" must be an https URL');
	}
	if (forMarket && bz?.source === 'open' && !repository) {
		errors.push('open source plugins need "repository" (https URL of the source)');
	}
	return { errors, warnings };
}

const pluginId = pkg => `${pkg.publisher}.${pkg.name}`.toLowerCase();

/**
 * VS Code's way to translate package.json: "%key%" values, with the text in package.nls.json
 * (English) and package.nls.<locale>.json (translations, locale in lowercase: zh-tw, pt-br).
 * `readNls(suffix)` returns that file's object, or undefined.
 */
const nlsPlaceholder = value => typeof value === 'string' ? /^%(.+)%$/.exec(value)?.[1] : undefined;
function resolveNls(value, nls) {
	const key = nlsPlaceholder(value);
	return key === undefined ? value : typeof nls?.[key] === 'string' ? nls[key] : undefined;
}
/** Name and description per README locale, where the plugin translated them. */
function marketL10n(pkg, readNls) {
	const l10n = {};
	for (const locale of README_LOCALES) {
		const nls = readNls(locale.toLowerCase());
		if (!nls) {
			continue;
		}
		const entry = {};
		for (const field of ['displayName', 'description']) {
			const key = nlsPlaceholder(pkg[field]);
			if (key !== undefined && typeof nls[key] === 'string' && nls[key].trim()) {
				entry[field] = nls[key].trim();
			}
		}
		if (Object.keys(entry).length) {
			l10n[locale] = entry;
		}
	}
	return l10n;
}

// ---------------------------------------------------------------------------
// build / pack
// ---------------------------------------------------------------------------

function loadEsbuild(dir) {
	try {
		return createRequire(path.join(dir, 'package.json'))('esbuild');
	} catch {
		fail('esbuild is not installed in this plugin. Run: npm install --save-dev esbuild');
	}
}

async function build(dir, { closed = false, watch = false } = {}) {
	const pkg = readJson(path.join(dir, 'package.json'));
	if (typeof pkg.main !== 'string') {
		// A pack without code (skills, rules, MCP servers, themes, window pages) has nothing to bundle.
		log('nothing to build: package.json has no "main"');
		return;
	}
	const entry = ['src/extension.ts', 'src/extension.js'].map(p => path.join(dir, p)).find(p => fs.existsSync(p));
	if (!entry) {
		fail('no src/extension.ts or src/extension.js');
	}
	const outfile = path.join(dir, pkg.main ?? './dist/extension.js');
	const esbuild = loadEsbuild(dir);
	const options = {
		entryPoints: [entry],
		outfile,
		bundle: true,
		platform: 'node',
		format: 'cjs',
		target: 'node18',
		external: ['vscode'],
		minify: closed,
		sourcemap: closed ? false : 'linked',
		legalComments: closed ? 'none' : 'inline',
		logLevel: 'info',
	};
	if (watch) {
		const context = await esbuild.context(options);
		await context.watch();
		log('watching for changes…');
		return;
	}
	await esbuild.build(options);
	if (closed) {
		fs.rmSync(`${outfile}.map`, { force: true });
	}
}

/** Files of the package (relative, forward slashes). */
function packageFiles(dir, pkg, open) {
	const out = new Set();
	// Only the listed top-level entries are walked (never tools/, types/ or .vscode/); inside them skip these.
	const skip = new Set(['node_modules', '.git', '.DS_Store']);
	const walk = rel => {
		const abs = path.join(dir, rel);
		if (!fs.existsSync(abs)) {
			return;
		}
		if (fs.statSync(abs).isDirectory()) {
			for (const name of fs.readdirSync(abs).sort()) {
				if (!skip.has(name)) {
					walk(rel ? `${rel}/${name}` : name);
				}
			}
		} else if (!rel.endsWith('.vsix') && !(!open && rel.endsWith('.map'))) {
			out.add(rel);
		}
	};
	const top = ['package.json', 'README.md', 'CHANGELOG.md', 'package.nls.json', ...README_LOCALES.map(l => `README.${l}.md`), ...fs.readdirSync(dir).filter(n => /^LICEN[CS]E/i.test(n) || /^package\.nls\..+\.json$/.test(n))];
	for (const name of top) {
		walk(name);
	}
	if (typeof pkg.main === 'string') {
		walk(path.posix.dirname(pkg.main.replace(/^\.\//, '')));
	}
	walk('media');
	walk(TRANSLATIONS_DIR);
	// What a pack declares: skills, rules and themes ship as they are, and each window's folder.
	const windowFolders = (pkg.contributes?.breezell?.windows ?? []).map(w => typeof w?.entry === 'string' ? w.entry.replace(/^\.\//, '') : undefined).filter(Boolean)
		.map(entry => path.posix.dirname(entry) === '.' ? entry : path.posix.dirname(entry));
	for (const rel of [...(pkg.contributes?.breezell?.skills ?? []), ...(pkg.contributes?.breezell?.rules ?? []), ...(pkg.contributes?.themes ?? []).map(t => t.path), ...windowFolders]) {
		if (typeof rel === 'string') {
			walk(rel.replace(/^\.\//, '').replace(/\/$/, ''));
		}
	}
	// The pages of contributes.breezell.ui, with what is beside them, and what its modes tell the AI.
	for (const surface of pkg.contributes?.breezell?.ui?.surfaces ?? []) {
		if (typeof surface?.entry === 'string') {
			const entry = surface.entry.replace(/^\.\//, '');
			walk(path.posix.dirname(entry) === '.' ? entry : path.posix.dirname(entry));
		}
	}
	for (const mode of pkg.contributes?.breezell?.ui?.modes ?? []) {
		if (typeof mode?.instructions === 'string') {
			walk(mode.instructions.replace(/^\.\//, ''));
		}
	}
	if (typeof pkg.icon === 'string') {
		walk(pkg.icon.replace(/^\.\//, ''));
	}
	if (open) {
		walk('src');
		walk('tsconfig.json');
	}
	return [...out].sort();
}

const xml = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function vsixManifest(pkg) {
	return `<?xml version="1.0" encoding="utf-8"?>
<PackageManifest Version="2.0.0" xmlns="http://schemas.microsoft.com/developer/vsx-schema/2011" xmlns:d="http://schemas.microsoft.com/developer/vsx-schema-design/2011">
	<Metadata>
		<Identity Language="en-US" Id="${xml(pkg.name)}" Version="${xml(pkg.version)}" Publisher="${xml(pkg.publisher)}" />
		<DisplayName>${xml(pkg.displayName || pkg.name)}</DisplayName>
		<Description xml:space="preserve">${xml(pkg.description)}</Description>
		<Tags>breezell-plugin</Tags>
		<Categories>${xml((pkg.categories ?? ['Other']).join(','))}</Categories>
		<GalleryFlags>Public</GalleryFlags>
		<Properties>
			<Property Id="Microsoft.VisualStudio.Code.Engine" Value="${xml(pkg.engines?.vscode)}" />
		</Properties>
	</Metadata>
	<Installation>
		<InstallationTarget Id="Microsoft.VisualStudio.Code" />
	</Installation>
	<Dependencies />
	<Assets>
		<Asset Type="Microsoft.VisualStudio.Code.Manifest" Path="extension/package.json" Addressable="true" />
	</Assets>
</PackageManifest>
`;
}

function contentTypes(files) {
	const types = { '.json': 'application/json', '.js': 'application/javascript', '.md': 'text/markdown', '.png': 'image/png', '.svg': 'image/svg+xml', '.css': 'text/css', '.html': 'text/html', '.ts': 'text/plain', '.map': 'application/json', '.vsixmanifest': 'text/xml' };
	const exts = [...new Set([...files.map(f => path.extname(f).toLowerCase()), '.vsixmanifest'])].filter(Boolean).sort();
	const defaults = exts.map(ext => `<Default Extension="${xml(ext)}" ContentType="${types[ext] ?? 'application/octet-stream'}" />`).join('');
	return `<?xml version="1.0" encoding="utf-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">${defaults}</Types>`;
}

async function pack(dir, flags) {
	const pkg = readJson(path.join(dir, 'package.json'));
	const mode = flags.closed ? 'closed' : flags.open ? 'open' : pkg.breezell?.source;
	if (mode !== 'open' && mode !== 'closed') {
		fail('say how to publish: pack --open (source included) or pack --closed (minified, no source)');
	}
	pkg.breezell = { ...pkg.breezell, source: mode };
	const nlsFile = path.join(dir, 'package.nls.json');
	const { errors, warnings } = checkPackage(pkg, { dir, nls: fs.existsSync(nlsFile) ? readJson(nlsFile) : undefined });
	warnings.forEach(w => log(`warning: ${w}`));
	if (errors.length) {
		fail(`package.json:\n  - ${errors.join('\n  - ')}`);
	}
	if (typeof pkg.main === 'string') {
		await build(dir, { closed: mode === 'closed' });
	}
	const files = packageFiles(dir, pkg, mode === 'open');
	if (mode === 'closed' && files.some(f => f.startsWith('src/'))) {
		fail('internal: closed package would contain src/');
	}
	const entries = [
		{ name: 'extension.vsixmanifest', data: Buffer.from(vsixManifest(pkg)) },
		{ name: '[Content_Types].xml', data: Buffer.from(contentTypes(files)) },
		// VS Code reads package.nls.<locale>.json from the extension's root; a copy in i18n/ wins over one at the root.
		...[...new Map([...files].sort((a, b) => Number(a.startsWith(`${TRANSLATIONS_DIR}/`)) - Number(b.startsWith(`${TRANSLATIONS_DIR}/`))).map(f => [
			`extension/${/^i18n\/package\.nls\..+\.json$/.test(f) ? path.posix.basename(f) : f}`,
			f,
		])).entries()].sort(([a], [b]) => a.localeCompare(b)).map(([name, f]) => ({
			name,
			// The packed package.json says how it was published; the one on disk is left as it is.
			data: f === 'package.json' ? Buffer.from(`${JSON.stringify(pkg, null, '\t')}\n`) : fs.readFileSync(path.join(dir, f)),
		})),
	];
	if (mode === 'closed') {
		// Closed source: every script and style ships minified (webview and window pages), not only the bundle.
		let esbuild;
		for (const entry of entries) {
			const loader = entry.name.startsWith('extension/') && !entry.name.startsWith('extension/dist/') && (entry.name.endsWith('.js') ? 'js' : entry.name.endsWith('.css') ? 'css' : undefined);
			if (loader) {
				esbuild ??= loadEsbuild(dir);
				entry.data = Buffer.from(esbuild.transformSync(entry.data.toString('utf8'), { loader, minify: true, legalComments: 'none' }).code);
			}
		}
	}
	const zip = writeZip(entries);
	if (zip.length > MAX_PACKAGE_BYTES) {
		fail(`package is ${(zip.length / 1048576).toFixed(1)} MB; the market takes at most 50 MB`);
	}
	const outDir = typeof flags.out === 'string' ? path.resolve(flags.out) : dir;
	fs.mkdirSync(outDir, { recursive: true });
	const outFile = path.join(outDir, `${pluginId(pkg)}-${pkg.version}.vsix`);
	fs.writeFileSync(outFile, zip);
	log(`${mode === 'open' ? 'open source' : 'closed source'} package: ${outFile}`);
	log(`  ${files.length} files, ${(zip.length / 1024).toFixed(1)} KB, sha256 ${sha256(zip)}`);
	log('  install it in Breezell: Plugins › Installed › Install local .vsix');
	return outFile;
}

// ---------------------------------------------------------------------------
// The market: plugin.json per plugin, index.json for all
// ---------------------------------------------------------------------------

/** The package.json inside a .vsix, checked. */
function readVsix(file) {
	const buffer = fs.readFileSync(file);
	const files = readZip(buffer);
	const raw = files.get('extension/package.json');
	if (!raw) {
		fail(`${file}: no extension/package.json`);
	}
	const pkg = JSON.parse(raw.toString('utf8'));
	return { buffer, files, pkg };
}

function submit(dir, flags) {
	if (typeof flags.market !== 'string') {
		fail('--market <path> is required: a clone of your fork of BreezellCode/BreezellCode');
	}
	const marketRoot = path.resolve(flags.market, 'plugins');
	if (!fs.existsSync(path.join(marketRoot, 'index.json'))) {
		fail(`${marketRoot} has no index.json: is --market a clone of BreezellCode/BreezellCode?`);
	}
	const sourcePkg = readJson(path.join(dir, 'package.json'));
	const vsixFile = typeof flags.vsix === 'string' ? path.resolve(flags.vsix) : path.join(dir, `${pluginId(sourcePkg)}-${sourcePkg.version}.vsix`);
	if (!fs.existsSync(vsixFile)) {
		fail(`${vsixFile} not found: run "npm run package:open" or "npm run package:closed" first`);
	}
	const { buffer, files, pkg } = readVsix(vsixFile);
	const readNls = suffix => {
		const raw = files.get(`extension/package.nls${suffix ? `.${suffix}` : ''}.json`);
		try {
			return raw ? JSON.parse(raw.toString('utf8')) : undefined;
		} catch {
			fail(`package.nls${suffix ? `.${suffix}` : ''}.json in the package is not valid JSON`);
		}
	};
	const { errors } = checkPackage(pkg, { forMarket: true, nls: readNls('') });
	if (errors.length) {
		fail(`the package's package.json:\n  - ${errors.join('\n  - ')}`);
	}
	const id = pluginId(pkg);
	const folder = path.join(marketRoot, 'packages', id);
	const relPackage = `packages/${id}/${pkg.version}/${id}-${pkg.version}.vsix`;
	const target = path.join(marketRoot, relPackage);
	const digest = sha256(buffer);
	if (fs.existsSync(target) && sha256(fs.readFileSync(target)) !== digest) {
		fail(`${id} ${pkg.version} is already in the market with other contents: published versions do not change, raise "version"`);
	}
	const metaFile = path.join(folder, 'plugin.json');
	const previous = fs.existsSync(metaFile) ? readJson(metaFile) : undefined;
	if (previous && previous.versions?.some(v => compareVersions(v.version, pkg.version) > 0)) {
		fail(`${id} already has a newer version than ${pkg.version} in the market`);
	}
	fs.mkdirSync(path.dirname(target), { recursive: true });
	fs.writeFileSync(target, buffer);
	let icon;
	if (typeof pkg.icon === 'string' && fs.existsSync(path.join(dir, pkg.icon))) {
		const ext = path.extname(pkg.icon).toLowerCase();
		if (!['.png', '.svg', '.jpg', '.jpeg', '.webp'].includes(ext)) {
			fail('"icon" must be a .png, .svg, .jpg or .webp file');
		}
		icon = `packages/${id}/icon${ext}`;
		fs.copyFileSync(path.join(dir, pkg.icon), path.join(marketRoot, icon));
	}
	let readme;
	if (fs.existsSync(path.join(dir, 'README.md'))) {
		readme = `packages/${id}/README.md`;
		fs.copyFileSync(path.join(dir, 'README.md'), path.join(marketRoot, readme));
	}
	// Translations: README.<locale>.md, shown to users of that language (English for the others).
	const readmes = {};
	for (const locale of README_LOCALES) {
		const source = translationFile(dir, `README.${locale}.md`);
		if (source) {
			readmes[locale] = `packages/${id}/${TRANSLATIONS_DIR}/README.${locale}.md`;
			fs.mkdirSync(path.join(marketRoot, 'packages', id, TRANSLATIONS_DIR), { recursive: true });
			fs.copyFileSync(source, path.join(marketRoot, readmes[locale]));
		}
	}
	for (const folder of [dir, path.join(dir, TRANSLATIONS_DIR)].filter(f => fs.existsSync(f))) {
		for (const name of fs.readdirSync(folder).filter(n => /^README\..+\.md$/.test(n))) {
			if (!README_LOCALES.some(l => name === `README.${l}.md`)) {
				log(`warning: ${name} is not one of README.<${README_LOCALES.join('|')}>.md and is left out`);
			}
		}
	}
	const repository = typeof pkg.repository === 'string' ? pkg.repository : pkg.repository?.url;
	const author = typeof pkg.author === 'string' ? { name: pkg.author } : pkg.author ?? { name: pkg.publisher };
	const versions = (previous?.versions ?? []).filter(v => v.version !== pkg.version);
	versions.push({ version: pkg.version, path: relPackage, sha256: digest, size: buffer.length, apiVersion: pkg.breezell.apiVersion, permissions: pkg.breezell.permissions ?? [], ...(pkg.breezell.optionalPermissions?.length ? { optionalPermissions: pkg.breezell.optionalPermissions } : {}), publishedAt: new Date().toISOString() });
	versions.sort((a, b) => compareVersions(b.version, a.version));
	const l10n = marketL10n(pkg, readNls);
	const meta = {
		id,
		displayName: resolveNls(pkg.displayName, readNls('')),
		description: resolveNls(pkg.description, readNls('')),
		categories: (pkg.categories ?? []).filter(c => c !== 'Other').slice(0, 6),
		tags: (pkg.keywords ?? []).slice(0, 12),
		source: pkg.breezell.source,
		repository: repository && isHttps(repository) ? repository : undefined,
		author: { name: author.name ?? pkg.publisher, url: author.url && isHttps(author.url) ? author.url : undefined },
		license: pkg.license,
		icon,
		readme,
		readmes: Object.keys(readmes).length ? readmes : undefined,
		l10n: Object.keys(l10n).length ? l10n : undefined,
		versions,
	};
	writeJson(metaFile, meta);
	writeJson(path.join(marketRoot, 'index.json'), buildIndex(marketRoot));
	log(`added ${id} ${pkg.version} to ${marketRoot}`);
	log('next, in the market clone:');
	log(`  git checkout -b plugin/${id}-${pkg.version}`);
	log(`  git add plugins && git commit -m "Plugin: ${id} ${pkg.version}"`);
	log('  git push, then open a pull request to BreezellCode/BreezellCode');
}

function buildIndex(marketRoot) {
	const packagesDir = path.join(marketRoot, 'packages');
	const plugins = [];
	for (const id of fs.existsSync(packagesDir) ? fs.readdirSync(packagesDir).sort() : []) {
		const metaFile = path.join(packagesDir, id, 'plugin.json');
		if (!fs.existsSync(metaFile)) {
			continue;
		}
		const meta = readJson(metaFile);
		const latest = meta.versions?.[0];
		if (!latest) {
			continue;
		}
		plugins.push({
			id: meta.id,
			displayName: meta.displayName,
			description: meta.description,
			version: latest.version,
			apiVersion: latest.apiVersion,
			categories: meta.categories ?? [],
			tags: meta.tags ?? [],
			permissions: latest.permissions ?? [],
			...(latest.optionalPermissions?.length ? { optionalPermissions: latest.optionalPermissions } : {}),
			source: meta.source,
			repository: meta.repository,
			author: meta.author,
			license: meta.license,
			icon: meta.icon,
			readme: meta.readme,
			readmes: meta.readmes && Object.keys(meta.readmes).length ? meta.readmes : undefined,
			l10n: meta.l10n && Object.keys(meta.l10n).length ? meta.l10n : undefined,
			package: { path: latest.path, sha256: latest.sha256, size: latest.size },
			updatedAt: latest.publishedAt,
		});
	}
	const updatedAt = plugins.map(p => p.updatedAt).sort().pop() ?? '1970-01-01T00:00:00.000Z';
	return { schemaVersion: 1, updatedAt, plugins };
}

/** Every package matches its plugin.json, and index.json is what buildIndex makes. */
function checkMarket(marketRoot) {
	const problems = [];
	const index = buildIndex(marketRoot);
	for (const entry of index.plugins) {
		const where = `${entry.id}@${entry.version}`;
		if (!ID_PART.test(entry.id.split('.')[0] ?? '') || entry.id.split('.').length !== 2) {
			problems.push(`${where}: bad id`);
			continue;
		}
		for (const [locale] of Object.entries(entry.readmes ?? {}).filter(([l]) => !README_LOCALES.includes(l))) {
			problems.push(`${where}: unknown README locale ${locale}`);
		}
		for (const rel of [entry.package.path, entry.icon, entry.readme, ...Object.values(entry.readmes ?? {})].filter(Boolean)) {
			if (!/^[A-Za-z0-9._\-/]+$/.test(rel) || rel.split('/').some(s => s === '..' || s === '.' || !s) || !fs.existsSync(path.join(marketRoot, rel))) {
				problems.push(`${where}: missing or unsafe path ${rel}`);
			}
		}
		const file = path.join(marketRoot, entry.package.path);
		if (!fs.existsSync(file)) {
			continue;
		}
		const bytes = fs.readFileSync(file);
		if (sha256(bytes) !== entry.package.sha256 || bytes.length !== entry.package.size) {
			problems.push(`${where}: sha256 or size differs from plugin.json`);
			continue;
		}
		let read;
		try {
			read = readVsix(file);
		} catch (err) {
			problems.push(`${where}: cannot read the package: ${err.message}`);
			continue;
		}
		const { files, pkg } = read;
		const packagedNls = files.get('extension/package.nls.json');
		if (pluginId(pkg) !== entry.id || pkg.version !== entry.version) {
			problems.push(`${where}: the package says ${pluginId(pkg)}@${pkg.version}`);
		}
		const { errors } = checkPackage(pkg, { forMarket: true, nls: packagedNls ? JSON.parse(packagedNls.toString('utf8')) : undefined });
		errors.forEach(e => problems.push(`${where}: ${e}`));
		for (const locale of Object.keys(entry.l10n ?? {})) {
			if (!README_LOCALES.includes(locale)) {
				problems.push(`${where}: unknown l10n locale ${locale}`);
			}
		}
		const declared = [...(pkg.breezell?.permissions ?? [])].sort().join(',');
		if (declared !== [...entry.permissions].sort().join(',')) {
			problems.push(`${where}: permissions differ from the package (${declared})`);
		}
		const optional = [...(pkg.breezell?.optionalPermissions ?? [])].sort().join(',');
		if (optional !== [...(entry.optionalPermissions ?? [])].sort().join(',')) {
			problems.push(`${where}: optional permissions differ from the package (${optional})`);
		}
		if (pkg.breezell?.source !== entry.source) {
			problems.push(`${where}: source differs from the package (${pkg.breezell?.source})`);
		}
		if (entry.source === 'closed' && [...files.keys()].some(f => f.startsWith('extension/src/'))) {
			problems.push(`${where}: a closed source package contains src/`);
		}
		if (entry.source === 'open' && pkg.main && ![...files.keys()].some(f => f.startsWith('extension/src/'))) {
			problems.push(`${where}: an open source package has no src/`);
		}
	}
	const current = path.join(marketRoot, 'index.json');
	if (!fs.existsSync(current) || JSON.stringify(readJson(current)) !== JSON.stringify(index)) {
		problems.push('index.json is not up to date: run "node plugins/devkit/breezell-plugin.mjs index plugins"');
	}
	problems.push(...checkBlocklist(marketRoot).map(p => `blocklist.json: ${p}`));
	return { problems, count: index.plugins.length };
}

// ---------------------------------------------------------------------------
// Blocklist (blocklist.json, edited by the market's maintainers)
// ---------------------------------------------------------------------------

const BLOCK_ID = /^[a-z0-9][a-z0-9_-]{0,127}\.[a-z0-9][a-z0-9_-]{0,127}$/;
const BLOCK_PUBLISHER = /^[a-z0-9][a-z0-9_-]{0,127}$/;
const BLOCK_VERSION = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;
const BLOCK_REASON_CHARS = 500;
const BLOCK_ENTRIES = 5000;

/**
 * The rules Breezell reads blocklist.json by (parsePluginBlocklist): every entry has "id"
 * (publisher.name) or "publisher", optional "versions", a "reason" in English and optional
 * "l10n" translations of it. Breezell leaves out an entry that breaks them; this says which.
 */
function checkBlocklist(marketRoot) {
	const file = path.join(marketRoot, 'blocklist.json');
	if (!fs.existsSync(file)) {
		return [];
	}
	let list;
	try {
		list = JSON.parse(fs.readFileSync(file, 'utf8'));
	} catch (err) {
		return [`not JSON: ${err.message}`];
	}
	if (typeof list !== 'object' || list === null || Array.isArray(list) || !Array.isArray(list.plugins)) {
		return ['must be an object with a "plugins" array'];
	}
	const problems = [];
	const isReason = value => typeof value === 'string' && value.trim() !== '' && value.length <= BLOCK_REASON_CHARS;
	if (list.plugins.length > BLOCK_ENTRIES) {
		problems.push(`at most ${BLOCK_ENTRIES} entries are read`);
	}
	list.plugins.forEach((entry, i) => {
		const where = `entry ${i + 1}`;
		if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
			problems.push(`${where}: not an object`);
			return;
		}
		const hasId = typeof entry.id === 'string';
		const hasPublisher = typeof entry.publisher === 'string';
		if (hasId === hasPublisher) {
			problems.push(`${where}: needs either "id" or "publisher"`);
		} else if (hasId && !BLOCK_ID.test(entry.id.trim().toLowerCase())) {
			problems.push(`${where}: "${entry.id}" is not publisher.name`);
		} else if (hasPublisher && !BLOCK_PUBLISHER.test(entry.publisher.trim().toLowerCase())) {
			problems.push(`${where}: "${entry.publisher}" is not a publisher`);
		}
		if (entry.versions !== undefined && (!Array.isArray(entry.versions) || !entry.versions.length || !entry.versions.every(v => typeof v === 'string' && BLOCK_VERSION.test(v)))) {
			problems.push(`${where}: "versions" must be a non-empty list of versions like "1.0.3"`);
		}
		if (!isReason(entry.reason)) {
			problems.push(`${where}: needs a "reason" of at most ${BLOCK_REASON_CHARS} characters`);
		}
		if (entry.l10n !== undefined) {
			if (typeof entry.l10n !== 'object' || entry.l10n === null || Array.isArray(entry.l10n)) {
				problems.push(`${where}: "l10n" must be an object`);
			} else {
				for (const [locale, text] of Object.entries(entry.l10n)) {
					if (!README_LOCALES.includes(locale) || !isReason(text)) {
						problems.push(`${where}: l10n "${locale}" must be one of ${README_LOCALES.join(', ')} with a reason of at most ${BLOCK_REASON_CHARS} characters`);
					}
				}
			}
		}
	});
	return problems;
}

// ---------------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------------

const DEVKIT_DIR = path.dirname(SELF);

function readTree(root) {
	const out = {};
	const walk = rel => {
		const abs = path.join(root, rel);
		if (fs.statSync(abs).isDirectory()) {
			for (const name of fs.readdirSync(abs).sort()) {
				walk(rel ? `${rel}/${name}` : name);
			}
		} else {
			out[rel] = fs.readFileSync(abs, 'utf8');
		}
	};
	walk('');
	return out;
}

/** templates.json: shared files (with this CLI and the typings) plus every template. */
function templateSet() {
	const root = path.join(DEVKIT_DIR, 'templates');
	if (!fs.existsSync(root)) {
		return undefined;
	}
	const shared = readTree(path.join(root, '_shared'));
	shared['tools/breezell-plugin.mjs'] = fs.readFileSync(SELF, 'utf8');
	shared['types/breezell.d.ts'] = fs.readFileSync(path.join(DEVKIT_DIR, 'breezell.d.ts'), 'utf8');
	const templates = {};
	for (const id of fs.readdirSync(root).filter(n => !n.startsWith('_')).sort()) {
		const files = readTree(path.join(root, id));
		const about = JSON.parse(files['template.json'] ?? '{}');
		delete files['template.json'];
		templates[id] = { label: about.label ?? id, description: about.description ?? '', files };
	}
	return { schemaVersion: 1, devkitVersion: DEVKIT_VERSION, shared, templates };
}

async function fetchTemplateSet() {
	for (const base of MARKET_URLS) {
		try {
			const response = await fetch(`${base}devkit/templates.json`, { signal: AbortSignal.timeout(15000) });
			if (response.ok) {
				return await response.json();
			}
		} catch {
			// next mirror
		}
	}
	fail('could not download the templates from GitHub or jsDelivr');
}

async function init(dir, flags) {
	const [publisher, name] = typeof flags.id === 'string' ? flags.id.toLowerCase().split('.') : [];
	if (!ID_PART.test(publisher ?? '') || !ID_PART.test(name ?? '')) {
		fail('--id publisher.name is required (lowercase letters, digits, dashes), e.g. --id my-name.my-plugin');
	}
	const displayName = typeof flags['display-name'] === 'string' ? flags['display-name'] : name;
	const description = typeof flags.description === 'string' ? flags.description : '';
	for (const [label, value, max] of [['display-name', displayName, 60], ['description', description, 200]]) {
		if (value.length > max || /["\\<>`\u0000-\u001f]/.test(value)) {
			fail(`--${label}: at most ${max} characters, no quotes, backslashes or angle brackets`);
		}
	}
	const source = flags.source === 'closed' ? 'closed' : 'open';
	const set = templateSet() ?? await fetchTemplateSet();
	const templateId = typeof flags.template === 'string' ? flags.template : 'webview';
	const template = set.templates[templateId];
	if (!template) {
		fail(`unknown template "${templateId}" (${Object.keys(set.templates).join(', ')})`);
	}
	const target = path.resolve(dir ?? name);
	if (fs.existsSync(target) && fs.readdirSync(target).length && !flags.force) {
		fail(`${target} is not empty (use --force to write into it)`);
	}
	const values = { publisher, name, id: `${publisher}.${name}`, displayName, description, source, apiVersion: String(API_VERSION) };
	const fillIn = text => text.replace(/\{\{(\w+)\}\}/g, (m, key) => values[key] ?? m);
	for (const [rel, content] of Object.entries({ ...set.shared, ...template.files })) {
		const file = path.join(target, ...rel.split('/'));
		fs.mkdirSync(path.dirname(file), { recursive: true });
		fs.writeFileSync(file, fillIn(content));
	}
	log(`created ${values.id} in ${target}`);
	log('next: npm install, open the folder in Breezell and press F5');
}

// ---------------------------------------------------------------------------

const HELP = `breezell-plugin ${DEVKIT_VERSION}

  init [dir] --id publisher.name [--display-name "My Plugin"] [--description "..."]
             [--template webview|ai|blank] [--source open|closed]
  build [dir] [--closed] [--watch]
  validate [dir]
  pack [dir] --open | --closed [--out <folder>]
  submit [dir] --market <clone of BreezellCode/BreezellCode> [--vsix <file>]
  index <market plugins folder> [--check]
  templates-json [--check <file>]
  types
`;

async function main() {
	const [command, ...rest] = process.argv.slice(2);
	const { positional, flags } = parseArgs(rest);
	const dir = path.resolve(positional[0] ?? '.');
	switch (command) {
		case 'init':
			return init(positional[0], flags);
		case 'build':
			return build(dir, { closed: !!flags.closed, watch: !!flags.watch });
		case 'validate': {
			const nlsFile = path.join(dir, 'package.nls.json');
			const { errors, warnings } = checkPackage(readJson(path.join(dir, 'package.json')), { dir, nls: fs.existsSync(nlsFile) ? readJson(nlsFile) : undefined });
			warnings.forEach(w => log(`warning: ${w}`));
			if (errors.length) {
				fail(`package.json:\n  - ${errors.join('\n  - ')}`);
			}
			return log('package.json is fine');
		}
		case 'pack':
			return void await pack(dir, flags);
		case 'submit':
			return submit(dir, flags);
		case 'index': {
			if (!positional[0]) {
				fail('index <market plugins folder>');
			}
			if (flags.check) {
				const { problems, count } = checkMarket(dir);
				if (problems.length) {
					fail(`market check failed:\n  - ${problems.join('\n  - ')}`);
				}
				return log(`market is consistent: ${count} plugins`);
			}
			writeJson(path.join(dir, 'index.json'), buildIndex(dir));
			return log(`wrote ${path.join(dir, 'index.json')}`);
		}
		case 'templates-json': {
			const set = templateSet();
			if (!set) {
				fail('run this from a clone of the market (plugins/devkit/templates is missing)');
			}
			const text = `${JSON.stringify(set, null, '\t')}\n`;
			if (typeof flags.check === 'string') {
				if (!fs.existsSync(flags.check) || fs.readFileSync(flags.check, 'utf8') !== text) {
					fail(`${flags.check} is not up to date: run "node plugins/devkit/breezell-plugin.mjs templates-json > plugins/devkit/templates.json"`);
				}
				return log(`${flags.check} is up to date`);
			}
			return process.stdout.write(text);
		}
		case 'types':
			return process.stdout.write(fs.existsSync(path.join(DEVKIT_DIR, 'breezell.d.ts'))
				? fs.readFileSync(path.join(DEVKIT_DIR, 'breezell.d.ts'), 'utf8')
				: fs.readFileSync(path.join(DEVKIT_DIR, '..', 'types', 'breezell.d.ts'), 'utf8'));
		case undefined:
		case 'help':
		case '--help':
			return log(HELP);
		default:
			fail(`unknown command "${command}"\n\n${HELP}`);
	}
}

main().catch(err => {
	process.stderr.write(`${err instanceof UserError ? err.message : err.stack ?? err}\n`);
	process.exit(1);
});
