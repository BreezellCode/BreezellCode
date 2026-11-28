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
 *    phone-validate [dir]
 *                      check phone-plugin.json, a plugin of the Breezell phone app (data only), with the app's rules
 *    phone-submit [dir] --market <clone of BreezellCode/BreezellCode>
 *                      copy phone-plugin.json into the market's phone part, update its plugin.json and phone/index.json
 *    index <market plugins folder> [--check]
 *                      rebuild index.json from packages/<id>/plugin.json (and phone/index.json from
 *                      phone/packages/<id>/plugin.json); --check verifies every package, every phone plugin
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
const PERMISSIONS = ['chat.events', 'models.request', 'models.select', 'chat.read', 'chat.send', 'chat.approve', 'providers.read', 'providers.list', 'agent.tools', 'agent.hooks', 'app.restart', 'app.forceRestart', 'editor.read', 'chat.input', 'chat.intercept', 'chat.render', 'chat.agent', 'ui.contribute', 'ui.modify', 'ui.overlay', 'activity.read'];
/**
 * What Breezell lets a plugin do to its screens (contributes.breezell.ui). Breezell checks all of this
 * again when it loads a plugin, and what fails there is left out: this is to tell you sooner.
 */
const UI_BUTTON_SLOTS = ['chat.input.toolbar', 'chat.message.actions', 'code.block.actions'];
const UI_SURFACE_SLOTS = ['chat.input.above', 'chat.messages.top', 'chat.landing', 'chat.input.companion', 'titlebar.center'];
/** Places on Breezell's own screen, with no line saying whose they are: they take ui.modify, as a patch does. */
const UI_OWN_SCREEN_SLOTS = ['chat.input.companion', 'titlebar.center'];
const UI_MODE_BASES = ['normal', 'plan', 'analyze', 'agent'];
const UI_FENCES_TAKEN = [
	'mermaid', 'causal', 'diff', 'patch', 'markdown', 'md', 'mdx', 'text', 'txt', 'plain', 'plaintext', 'latex', 'tex', 'math',
	'json', 'jsonc', 'yaml', 'yml', 'toml', 'ini', 'xml', 'html', 'svg', 'css', 'scss', 'less', 'sql', 'graphql',
	'javascript', 'js', 'jsx', 'mjs', 'cjs', 'typescript', 'ts', 'tsx', 'python', 'py', 'bash', 'sh', 'shell', 'zsh', 'fish', 'powershell', 'ps1', 'pwsh', 'bat', 'cmd', 'console',
	'c', 'h', 'cpp', 'c++', 'cc', 'hpp', 'csharp', 'cs', 'java', 'kotlin', 'kt', 'go', 'golang', 'rust', 'rs', 'ruby', 'rb', 'php', 'swift', 'scala', 'lua', 'dart', 'r', 'perl', 'pl',
	'dockerfile', 'makefile', 'vue', 'svelte',
];
const UI_ID = /^[a-z][a-zA-Z0-9_-]{0,63}$/;
const UI_CODICON = /^[a-z0-9][a-z0-9-]{0,63}$/;
const UI_PATH = /^(?!\/)(?!.*(?:^|\/)\.{0,2}(?:\/|$))[A-Za-z0-9._\-/]+$/;
const UI_SURFACE_STYLE = ['backgroundColor', 'backgroundImage'];
/** A frame around something of Breezell's: its box, never what is written in it. */
const UI_FRAME_STYLE = ['backgroundColor', 'borderColor', 'borderRadius', 'borderWidth', 'boxShadow', 'transition'];
const UI_TEXT_STYLE = ['backgroundColor', 'backgroundImage', 'color', 'borderColor', 'borderRadius', 'borderWidth', 'padding', 'margin', 'gap', 'boxShadow', 'fontSize', 'fontWeight', 'fontFamily', 'lineHeight', 'textAlign', 'letterSpacing', 'textTransform', 'transition'];
/** A message: its text, and how wide it may get. */
const UI_BLOCK_STYLE = [...UI_TEXT_STYLE, 'width', 'minWidth', 'maxWidth'];
const UI_STYLE_PROPERTIES = ['backgroundColor', 'color', 'borderColor', 'borderRadius', 'borderWidth', 'padding', 'fontSize', 'fontWeight', 'fontFamily', 'lineHeight', 'opacity',
	'margin', 'gap', 'boxShadow', 'backgroundImage', 'width', 'minWidth', 'maxWidth', 'height', 'minHeight', 'maxHeight', 'textAlign', 'letterSpacing', 'textTransform', 'transition'];
const UI_REGIONS = {
	'chat.surface': { style: UI_SURFACE_STYLE, themeBackgroundOnly: true },
	'chat.landing': { hide: true, replace: true, style: UI_TEXT_STYLE },
	'chat.landing.hero': { hide: true, replace: true },
	'chat.landing.hints': { hide: true },
	'chat.messages': { replace: true },
	'chat.rail': { hide: true },
	'chat.message.user': { style: UI_BLOCK_STYLE },
	'chat.message.assistant': { style: UI_BLOCK_STYLE },
	'chat.turnStats': { hide: true, style: [...UI_TEXT_STYLE, 'opacity'] },
	'chat.input.frame': { style: UI_FRAME_STYLE, themeBackgroundOnly: true },
	'chat.input.mode': { hide: true },
	'chat.input.mention': { hide: true, order: true },
	'chat.input.browser': { hide: true, order: true },
	'chat.input.attach': { hide: true, order: true },
	'chat.input.imageMode': { hide: true, order: true },
	'chat.input.quickPhrases': { hide: true, order: true },
	'chat.input.promptOptimize': { hide: true, order: true },
	'chat.input.mcp': { hide: true, order: true },
	'box.page': { style: UI_SURFACE_STYLE, themeBackgroundOnly: true },
	'quickEdit.widget': { style: UI_FRAME_STYLE, themeBackgroundOnly: true },
	'tooltip': { style: [...UI_FRAME_STYLE, 'color', 'fontSize', 'fontFamily', 'padding'] },
};
/** The Box's own frame (box.page) can be restyled; its cards about these cannot. */
const UI_PROTECTED = ['account', 'signIn', 'plan', 'billing', 'upgrade', 'quota', 'customApi', 'chat.input.model', 'chat.input.send', 'chat.input.context', 'chat.quota', 'chat.toolApproval', 'chat.error',
	'box.account', 'box.plan', 'box.billing', 'box.plugins', 'box.permissions', 'box.updates', 'box.customApi', 'plugins', 'permissions', 'updates'];
const uiProtected = name => UI_PROTECTED.some(area => name === area || name.startsWith(`${area}.`));
const UI_THEME_BACKGROUNDS = ['editor', 'sideBar', 'panel', 'input', 'editorWidget', 'dropdown', 'menu', 'quickInput', 'notifications'];
const UI_THEME_BACKGROUND = new RegExp(`^(transparent|var\\(--vscode-(${UI_THEME_BACKGROUNDS.join('|')})-background\\))$`);
const UI_UNSAFE_CSS = /url|expression|image|import|attr|element|paint|@|;|\{|\}|\\|\/\*|<|>|javascript:/i;
// ---- generated from Breezell's plugin UI definition (breezellPluginUiDefinition.ts) by scripts/breezell-plugin-devkit/sync-ui-definition.mjs: do not edit by hand ----
const UI_DEFINITION = (() => {
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

  // src/vs/workbench/contrib/breezell/common/breezellPluginUiDefinition.ts
  var breezellPluginUiDefinition_exports = {};
  __export(breezellPluginUiDefinition_exports, {
    PLUGIN_ASSET_PREFIX: () => PLUGIN_ASSET_PREFIX,
    PLUGIN_UI_BLOCKS: () => PLUGIN_UI_BLOCKS,
    PLUGIN_UI_CODICON: () => PLUGIN_UI_CODICON,
    PLUGIN_UI_DEFINITION_LIMITS: () => PLUGIN_UI_DEFINITION_LIMITS,
    PLUGIN_UI_ID: () => PLUGIN_UI_ID,
    PLUGIN_UI_SLOTS: () => PLUGIN_UI_SLOTS,
    PluginUiField: () => PluginUiField,
    checkDefinedPluginUi: () => checkDefinedPluginUi,
    describePluginUiSlot: () => describePluginUiSlot,
    isInternalCommand: () => isInternalCommand,
    isPluginUiControlValue: () => isPluginUiControlValue,
    ownCommands: () => ownCommands,
    ownSettings: () => ownSettings,
    plainLine: () => plainLine,
    pluginAssetPath: () => pluginAssetPath,
    pluginUiFields: () => pluginUiFields,
    pluginUiKind: () => pluginUiKind,
    pluginUiPermissionsNeeded: () => pluginUiPermissionsNeeded,
    pluginUiReadContext: () => pluginUiReadContext,
    pluginUiSettingControl: () => pluginUiSettingControl,
    pluginUiStateTypes: () => pluginUiStateTypes,
    pluginUiText: () => pluginUiText,
    pluginUiTypes: () => pluginUiTypes,
    readDefinedPluginUi: () => readDefinedPluginUi,
    readPluginUiState: () => readPluginUiState
  });

  // src/vs/workbench/contrib/breezell/common/pluginMarketShared.ts
  function isSafeMarketPath(path) {
    return path.length > 0 && path.length <= 300 && /^[A-Za-z0-9._\-/]+$/.test(path) && !path.startsWith("/") && path.split("/").every((segment) => segment.length > 0 && segment !== "." && segment !== "..");
  }
  var BREEZELL_PLUGIN_MAX_PACKAGE_BYTES = 50 * 1024 * 1024;

  // src/vs/workbench/contrib/breezell/common/breezellPluginPaths.ts
  function l10nMap(value, maxChars) {
    const out = {};
    if (value && typeof value === "object" && !Array.isArray(value)) {
      for (const [locale, text] of Object.entries(value)) {
        if (typeof text === "string" && text.trim()) {
          out[locale] = text.trim().slice(0, maxChars);
        }
      }
    }
    return out;
  }

  // src/vs/workbench/contrib/breezell/common/breezellPluginUiDefinition.ts
  var PLUGIN_UI_ID = /^[a-z][a-zA-Z0-9_-]{0,63}$/;
  var PLUGIN_UI_CODICON = /^[a-z0-9][a-z0-9-]{0,63}$/;
  var PLUGIN_ASSET_PREFIX = "plugin:";
  var IMAGE_FILE = /\.(png|jpe?g|gif|webp|avif)$/i;
  var STATE_KEY = /^[a-zA-Z][a-zA-Z0-9_]{0,31}$/;
  var HTTPS_ORIGIN = /^https:\/\/[a-z0-9.-]{1,200}(:[0-9]{1,5})?$/i;
  var HTML_FILE = /\.html?$/i;
  var isRecord = (value) => !!value && typeof value === "object" && !Array.isArray(value);
  function pluginAssetPath(value) {
    if (!value.startsWith(PLUGIN_ASSET_PREFIX)) {
      return void 0;
    }
    const path = value.slice(PLUGIN_ASSET_PREFIX.length).replace(/^\.\//, "");
    return isSafeMarketPath(path) && IMAGE_FILE.test(path) ? path : void 0;
  }
  var plainLine = (value, max) => {
    if (typeof value !== "string") {
      return void 0;
    }
    const line = value.replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029\u202a-\u202e\u2066-\u2069]+/g, " ").replace(/\s+/g, " ").trim();
    return line ? line.slice(0, max) : void 0;
  };
  var ownCommands = (packageJson) => {
    const list = isRecord(packageJson) && isRecord(packageJson.contributes) ? packageJson.contributes.commands : void 0;
    const items = Array.isArray(list) ? list : isRecord(list) ? [list] : [];
    return new Set(items.map((c) => isRecord(c) && typeof c.command === "string" ? c.command : "").filter(Boolean));
  };
  var ownSettings = (packageJson) => {
    const settings = /* @__PURE__ */ new Map();
    const contributes = isRecord(packageJson) && isRecord(packageJson.contributes) ? packageJson.contributes : {};
    for (const block of Array.isArray(contributes.configuration) ? contributes.configuration : [contributes.configuration]) {
      if (isRecord(block) && isRecord(block.properties)) {
        for (const [key, schema] of Object.entries(block.properties)) {
          if (isRecord(schema)) {
            settings.set(key, schema);
          }
        }
      }
    }
    return settings;
  };
  var isInternalCommand = (command) => /breezell/i.test(command);
  var PLUGIN_UI_DEFINITION_LIMITS = {
    titleChars: 40,
    /** The line under a space's name in the switcher. */
    subtitleChars: 40,
    descriptionChars: 200,
    /** A text block's paragraph. */
    textChars: 600,
    pagesPerSpace: 12,
    blocksPerPage: 24,
    choices: 6,
    /** A text setting's longest value, and a choice's value. */
    settingTextChars: 200,
    networkOrigins: 8,
    frameMinHeight: 32,
    frameMaxHeight: 2e3,
    frameDefaultHeight: 240,
    /** What a plugin sends at run time (readPluginUiState). */
    stateRows: 12,
    stateLabelChars: 40,
    stateValueChars: 160,
    stateMeters: 6,
    stateMeterDetailChars: 120,
    stateTextLines: 12,
    stateListItems: 50,
    stateItemIdChars: 64,
    stateItemTitleChars: 80,
    stateItemDetailChars: 160
  };
  var L = PLUGIN_UI_DEFINITION_LIMITS;
  function pluginUiReadContext(packageJson, fileExists) {
    return { commands: ownCommands(packageJson), settings: ownSettings(packageJson), ...fileExists ? { fileExists } : {} };
  }
  var PluginUiField = class _PluginUiField {
    constructor(takes, reader, isOptional = false, about = "", holds = []) {
      this.takes = takes;
      this.reader = reader;
      this.isOptional = isOptional;
      this.about = about;
      this.holds = holds;
    }
    /** Reads `key` of a declaration; undefined when it is not there. */
    read(declaration, key, at) {
      const value = declaration[key];
      return value === void 0 ? void 0 : this.reader(value, key, declaration, at);
    }
    /** It may be left out; one that is there but does not pass is left out too (and said), not the whole entry. */
    optional() {
      return new _PluginUiField(this.takes, this.reader, true, this.about, this.holds);
    }
    doc(about) {
      return new _PluginUiField(this.takes, this.reader, this.isOptional, about, this.holds);
    }
  };
  var refuse = (refused) => ({ refused });
  var isRefusal = (value) => isRecord(value) && typeof value.refused === "string" && Object.keys(value).length === 1;
  function pluginUiKind(name, about, fields, finish) {
    return {
      name,
      about,
      fields,
      read(raw, at) {
        if (!isRecord(raw)) {
          at.problems.push(`${at.where} must be an object`);
          return void 0;
        }
        const entry = {};
        let passed = true;
        for (const [key, field] of Object.entries(fields)) {
          const got = field.read(raw, key, at);
          if (!got) {
            if (!field.isOptional) {
              at.problems.push(`${at.where} needs "${key}"`);
              passed = false;
            }
            continue;
          }
          if (got.problem) {
            at.problems.push(`${at.where}: ${got.problem}`);
          }
          if (got.value !== void 0) {
            entry[key] = got.value;
          } else if (!field.isOptional) {
            passed = false;
          }
        }
        if (!passed) {
          return void 0;
        }
        if (!finish) {
          return entry;
        }
        const done = finish(entry, at);
        if (isRefusal(done)) {
          at.problems.push(`${at.where}: ${done.refused}`);
          return void 0;
        }
        return done;
      }
    };
  }
  function pluginUiTypes(name, about, types) {
    return {
      name,
      about,
      fields: {},
      types,
      read(raw, at) {
        if (!isRecord(raw)) {
          at.problems.push(`${at.where} must be an object`);
          return void 0;
        }
        const type = raw.type;
        const kind = typeof type === "string" && Object.prototype.hasOwnProperty.call(types, type) ? types[type] : void 0;
        if (typeof type !== "string" || !kind) {
          at.problems.push(`${at.where}: "type" must be one of ${Object.keys(types).join(", ")}`);
          return void 0;
        }
        const value = kind.read(raw, at);
        return value === void 0 ? void 0 : { type, ...value };
      }
    };
  }
  var pluginUiText = (value, language) => value.l10n[language] ?? value.text;
  var pluginUiFields = {
    /** An id: a letter, then letters, digits, _ or - (64 at most). */
    id: () => new PluginUiField("an id: a letter, then letters, digits, _ or -", (value, key) => typeof value === "string" && PLUGIN_UI_ID.test(value) ? { value } : { problem: `"${key}" must be a letter, then letters, digits, _ or - (64 at most)` }),
    /** A plain value, such as one of a setting's enum. */
    value: (max) => new PluginUiField(`text, at most ${max} characters`, (value, key) => typeof value === "string" && value.length > 0 && value.length <= max ? { value } : { problem: `"${key}" must be a text of at most ${max} characters` }),
    /**
     * A text people read, with its translations beside it (`l10n` for a title, `<key>L10n` for another).
     * `notBreezell`: no text in it may name Breezell, or the plugin's part could pass for Breezell's own.
     */
    text: (max, options = {}) => new PluginUiField(`text, at most ${max} characters; translations in "${options.l10n ?? "<key>L10n"}"`, (value, key, declaration) => {
      if (typeof value !== "string" || !value.trim()) {
        return { problem: `"${key}" must be a text` };
      }
      const l10nKey = options.l10n ?? `${key}L10n`;
      const translations = declaration[l10nKey];
      if (translations !== void 0 && !isRecord(translations)) {
        return { problem: `"${l10nKey}" must map languages to texts, like { "zh-TW": "…" }` };
      }
      const all = [value, ...Object.values(isRecord(translations) ? translations : {}).filter((t) => typeof t === "string")];
      if (options.notBreezell && all.some((t) => /breezell/i.test(t))) {
        return { problem: `"${key}": a name with "Breezell" in it is Breezell's, not a plugin's` };
      }
      const text = { text: value.trim().slice(0, max), l10n: l10nMap(translations, max) };
      return all.some((t) => t.trim().length > max) ? { value: text, problem: `"${key}" is cut to ${max} characters (its translations too)` } : { value: text };
    }),
    /** A codicon's name. */
    codicon: () => new PluginUiField("a codicon's name", (value, key) => typeof value === "string" && PLUGIN_UI_CODICON.test(value) ? { value } : { problem: `"${key}" must be a codicon's name, like "rocket"` }),
    /** A codicon's name, or `plugin:<path>` to an image file of the plugin's own. */
    icon: () => new PluginUiField("a codicon's name, or plugin:<path> to an image (png, jpg, gif, webp, avif)", (value, key, _declaration, at) => {
      if (typeof value === "string" && PLUGIN_UI_CODICON.test(value)) {
        return { value: { codicon: value } };
      }
      const image = typeof value === "string" ? pluginAssetPath(value) : void 0;
      if (!image) {
        return { problem: `"${key}" must be a codicon's name, or plugin:<path> to an image file inside the plugin` };
      }
      return at.context.fileExists && !at.context.fileExists(image) ? { problem: `"${key}": "${image}" does not exist` } : { value: { image } };
    }),
    /** One of the plugin's own commands. */
    command: () => new PluginUiField("one of the plugin's own commands (contributes.commands)", (value, key, _declaration, at) => {
      if (typeof value !== "string" || !at.context.commands.has(value)) {
        return { problem: `"${key}" must be one of the plugin's own commands, in contributes.commands` };
      }
      return isInternalCommand(value) ? { problem: `"${key}": a command with "breezell" in its name is Breezell's: rename "${value}"` } : { value };
    }),
    /** One of the plugin's own settings, none named after Breezell. */
    setting: () => new PluginUiField("one of the plugin's own settings (contributes.configuration)", (value, key, _declaration, at) => {
      if (typeof value !== "string" || !at.context.settings.has(value)) {
        return { problem: `"${key}" must be one of the plugin's own settings, in contributes.configuration` };
      }
      return /breezell/i.test(value) ? { problem: `"${key}": a setting named after Breezell is not for a plugin` } : { value };
    }),
    /** A name what the plugin sends at run time goes under (setState). */
    state: () => new PluginUiField("a name: a letter, then letters, digits or _ (32 at most)", (value, key) => typeof value === "string" && STATE_KEY.test(value) ? { value } : { problem: `"${key}" must be a name: a letter, then letters, digits or _ (32 at most)` }),
    /** A file inside the plugin, of a kind (`file`: what the file must be, said in the problem). */
    file: (kind, file) => new PluginUiField(`${file} inside the plugin`, (value, key, _declaration, at) => {
      const path = typeof value === "string" ? value.replace(/^\.\//, "") : "";
      if (!isSafeMarketPath(path) || !kind.test(path)) {
        return { problem: `"${key}" must be ${file} inside the plugin` };
      }
      return at.context.fileExists && !at.context.fileExists(path) ? { problem: `"${key}": "${path}" does not exist` } : { value: path };
    }),
    /** https origins a page of the plugin's may reach: none unless listed. */
    origins: (max) => new PluginUiField(`https origins, at most ${max}`, (value, key) => {
      const origins = Array.isArray(value) ? value.filter((o) => typeof o === "string" && HTTPS_ORIGIN.test(o)) : [];
      if (!Array.isArray(value) || origins.length !== value.length) {
        return { problem: `"${key}" takes https origins, like ["https://api.example.com"]` };
      }
      return value.length > max ? { value: origins.slice(0, max), problem: `"${key}": at most ${max}` } : { value: origins };
    }),
    /** A whole number from `min` to `max`; one outside is brought within. */
    integer: (min, max) => new PluginUiField(`a whole number from ${min} to ${max}`, (value, key) => {
      if (typeof value !== "number" || !Number.isFinite(value)) {
        return { problem: `"${key}" must be a number` };
      }
      const within = Math.min(max, Math.max(min, Math.round(value)));
      return within === value ? { value } : { value: within, problem: `"${key}" is taken as ${within}: from ${min} to ${max}` };
    }),
    /** One entry of a kind. */
    one: (kind) => new PluginUiField(`a ${kind.name}`, (value, key, _declaration, at) => {
      const entry = kind.read(value, { ...at, where: `${at.where} › ${key}` });
      return entry === void 0 ? { problem: `"${key}" is left out` } : { value: entry };
    }, false, "", [kind]),
    /**
     * A list of entries of a kind. Entries that do not pass are left out (and said), so one bad entry does
     * not take the rest with it; past `max` the rest are left out. `unique`: a key no two may share.
     */
    list: (kind, limits) => new PluginUiField(`a list of ${kind.name}s, at most ${limits.max}`, (value, key, _declaration, at) => {
      if (!Array.isArray(value)) {
        return { problem: `"${key}" must be a list` };
      }
      const listed = at.where ? `${at.where} › ${key}` : `ui.${key}`;
      const entries = [];
      value.slice(0, limits.max).forEach((raw, index) => {
        const name = limits.unique && isRecord(raw) && typeof raw[limits.unique] === "string" ? JSON.stringify(raw[limits.unique]) : `#${index + 1}`;
        const where = `${listed} ${name}`;
        const entry = kind.read(raw, { ...at, where });
        if (entry === void 0) {
          return;
        }
        const unique = limits.unique;
        if (unique && entries.some((e) => e[unique] === entry[unique])) {
          at.problems.push(`${where}: the ${unique} is used twice`);
          return;
        }
        entries.push(entry);
      });
      if (value.length > limits.max) {
        at.problems.push(`${listed}: at most ${limits.max}; the rest are left out`);
      }
      return limits.min && entries.length < limits.min ? { problem: `"${key}" needs at least ${limits.min}` } : { value: entries };
    }, false, "", [kind])
  };
  var F = pluginUiFields;
  function pluginUiSettingControl(schema, choices, at) {
    const known = Array.isArray(schema.enum) ? schema.enum.filter((v) => typeof v === "string") : void 0;
    if (choices && !known?.length) {
      at.problems.push(`${at.where}: "choices" are for a setting with an enum; they are passed over`);
    }
    if (schema.type === "boolean") {
      return { kind: "switch" };
    }
    if ((schema.type === "number" || schema.type === "integer") && !known) {
      const minimum = typeof schema.minimum === "number" && Number.isFinite(schema.minimum) ? schema.minimum : void 0;
      const maximum = typeof schema.maximum === "number" && Number.isFinite(schema.maximum) ? schema.maximum : void 0;
      const step = typeof schema.multipleOf === "number" && schema.multipleOf > 0 ? schema.multipleOf : schema.type === "integer" ? 1 : void 0;
      if (minimum === void 0 || maximum === void 0 || minimum >= maximum) {
        return refuse('a number needs "minimum" and "maximum" in its contributes.configuration entry');
      }
      return { kind: "number", minimum, maximum, ...step ? { step } : {} };
    }
    if (schema.type === "string" && !known && schema.format === "color-hex") {
      return { kind: "color" };
    }
    if (schema.type === "string" && !known) {
      return { kind: "text", maxLength: Math.min(L.settingTextChars, typeof schema.maxLength === "number" && schema.maxLength > 0 ? Math.floor(schema.maxLength) : L.settingTextChars) };
    }
    if (known?.length) {
      const named = (choices ?? []).filter((choice) => {
        if (known.includes(choice.value)) {
          return true;
        }
        at.problems.push(`${at.where}: the choice ${JSON.stringify(choice.value)} is not among the setting's enum`);
        return false;
      });
      return named.length < 2 ? refuse(`needs "choices": at least two of the setting's enum, at most ${L.choices}, each with a title`) : { kind: "choices", choices: named };
    }
    return refuse('a setting here is a boolean, a string (with an enum for choices, "format": "color-hex" for a colour) or a number with a minimum and maximum');
  }
  var HEX_COLOR = /^#[0-9a-f]{6}([0-9a-f]{2})?$/i;
  function isPluginUiControlValue(control, value) {
    switch (control.kind) {
      case "choices":
        return control.choices.some((choice) => choice.value === value);
      case "number":
        return typeof value === "number" && Number.isFinite(value) && value >= control.minimum && value <= control.maximum;
      case "text":
        return typeof value === "string" && value.length <= control.maxLength && !/[\u0000-\u001f\u007f]/.test(value);
      case "color":
        return typeof value === "string" && HEX_COLOR.test(value);
      case "switch":
        return typeof value === "boolean";
    }
  }
  var CHOICE = pluginUiKind("choice", "One value of the setting's enum, as the control names it.", {
    value: F.value(L.settingTextChars).doc("A value of the setting's enum."),
    title: F.text(L.titleChars, { l10n: "l10n" }).doc("What the control calls it.")
  });
  var FRAME = pluginUiKind("frame", "The plugin's own page, in an isolated frame under a line naming the plugin: no script of it runs in Breezell's window.", {
    entry: F.file(HTML_FILE, "an .html page").doc("The page."),
    network: F.origins(L.networkOrigins).optional().doc("https origins it may reach; none unless listed.")
  });
  var PLUGIN_UI_BLOCKS = pluginUiTypes("block", 'One part of a page, picked by "type". Breezell draws every one of them in its own look.', {
    heading: pluginUiKind("heading", "A heading over the blocks after it.", {
      title: F.text(L.titleChars, { l10n: "l10n", notBreezell: true }),
      description: F.text(L.descriptionChars).optional().doc("A line under it.")
    }),
    text: pluginUiKind("text", `A paragraph: the plugin's words, or what it sends at run time under "state" (which then takes their place).`, {
      text: F.text(L.textChars).optional(),
      state: F.state().optional()
    }, (block) => block.text || block.state ? block : refuse('needs "text", "state" or both')),
    rows: pluginUiKind("rows", "Rows of a label and a value, which the plugin sends at run time.", {
      title: F.text(L.titleChars, { l10n: "l10n", notBreezell: true }).optional(),
      state: F.state()
    }),
    meters: pluginUiKind("meters", "Bars of how much of something is used (0 to 100), which the plugin sends at run time.", {
      title: F.text(L.titleChars, { l10n: "l10n", notBreezell: true }).optional(),
      state: F.state()
    }),
    list: pluginUiKind("list", `A list the plugin sends at run time; with "command", picking an item runs it with { item: <the item's id> }.`, {
      title: F.text(L.titleChars, { l10n: "l10n", notBreezell: true }).optional(),
      state: F.state(),
      command: F.command().optional()
    }),
    setting: pluginUiKind("setting", "A control over one of the plugin's own settings, after its type: a switch, a number, a colour, a text, or a choice of its enum.", {
      setting: F.setting(),
      title: F.text(L.titleChars, { l10n: "l10n", notBreezell: true }),
      description: F.text(L.descriptionChars).optional().doc("Said under the control."),
      choices: F.list(CHOICE, { max: L.choices, unique: "value" }).optional().doc("For a setting with an enum: a title for each value offered.")
    }, (block, at) => {
      const control = pluginUiSettingControl(at.context.settings.get(block.setting) ?? {}, block.choices, at);
      return isRefusal(control) ? control : { setting: block.setting, title: block.title, ...block.description ? { description: block.description } : {}, control };
    }),
    button: pluginUiKind("button", "A button that runs one of the plugin's own commands.", {
      command: F.command(),
      title: F.text(L.titleChars, { l10n: "l10n", notBreezell: true }),
      description: F.text(L.descriptionChars).optional().doc("Its tooltip."),
      icon: F.codicon().optional()
    }),
    frame: pluginUiKind("frame", "The plugin's own page among the blocks, in an isolated frame under a line naming the plugin.", {
      entry: F.file(HTML_FILE, "an .html page"),
      height: F.integer(L.frameMinHeight, L.frameMaxHeight).optional().doc(`Pixels; ${L.frameDefaultHeight} when not given.`),
      network: F.origins(L.networkOrigins).optional().doc("https origins it may reach; none unless listed.")
    })
  });
  var PAGE = pluginUiKind("page", "A page of the space: its entry in the space's sidebar, and what it shows: blocks Breezell draws, or a page of the plugin's own.", {
    id: F.id(),
    title: F.text(L.titleChars, { l10n: "l10n", notBreezell: true }),
    description: F.text(L.descriptionChars, { notBreezell: true }).optional().doc("Said under the page's title."),
    blocks: F.list(PLUGIN_UI_BLOCKS, { max: L.blocksPerPage }).optional(),
    frame: F.one(FRAME).optional().doc(`The page is a page of the plugin's own: give this or "blocks".`)
  }, (page) => page.blocks === void 0 === (page.frame === void 0) ? refuse('needs "blocks" or "frame": one of them') : page);
  var SPACE = pluginUiKind("space", "A space of the plugin's own in Box: an entry in the space switcher, and its pages in the sidebar.", {
    id: F.id(),
    title: F.text(L.titleChars, { l10n: "l10n", notBreezell: true }).doc("Its name in the switcher."),
    subtitle: F.text(L.subtitleChars, { notBreezell: true }).optional().doc("The line under its name."),
    icon: F.icon().optional().doc("Its tile in the switcher; the plugins' icon when not given."),
    pages: F.list(PAGE, { max: L.pagesPerSpace, min: 1, unique: "id" })
  }, (space, at) => {
    const typeOf = /* @__PURE__ */ new Map();
    const pages = space.pages.map((page) => page.blocks ? {
      ...page,
      blocks: page.blocks.filter((block) => {
        const state = "state" in block ? block.state : void 0;
        const known = state ? typeOf.get(state) : void 0;
        if (state && !known) {
          typeOf.set(state, block.type);
        } else if (state && known !== block.type) {
          at.problems.push(`${at.where} › pages ${JSON.stringify(page.id)}: "${state}" is shown as ${known} already; a ${block.type} block cannot show it too, so it is left out`);
          return false;
        }
        return true;
      })
    } : page);
    return { ...space, pages };
  });
  var PLUGIN_UI_SLOTS = {
    spaces: { kind: SPACE, max: 1, permission: "ui.contribute", place: "Box: the space switcher, and the space's own sidebar and pages" }
  };
  function readDefinedPluginUi(ui, context, problems) {
    const defined = {};
    for (const [key, slot] of Object.entries(PLUGIN_UI_SLOTS)) {
      const got = F.list(slot.kind, { max: slot.max, unique: "id" }).read(ui, key, { where: "", context, problems });
      if (got?.problem) {
        problems.push(`ui.${key}: ${got.problem}`);
      }
      if (got?.value?.length) {
        defined[key] = got.value;
      }
    }
    return defined;
  }
  function pluginUiPermissionsNeeded(defined) {
    return Object.entries(PLUGIN_UI_SLOTS).filter(([key]) => !!defined[key]?.length).map(([key, slot]) => ({ key, permission: slot.permission }));
  }
  function checkDefinedPluginUi(ui, packageJson, fileExists) {
    if (!isRecord(ui)) {
      return { problems: [], permissions: [] };
    }
    const problems = [];
    const defined = readDefinedPluginUi(ui, pluginUiReadContext(packageJson, fileExists), problems);
    return { problems, permissions: pluginUiPermissionsNeeded(defined) };
  }
  var STATE_READERS = {
    text: (raw) => typeof raw === "string" ? raw.slice(0, L.textChars).split(/\r?\n/).map((line) => plainLine(line, L.textChars)).filter((line) => !!line).slice(0, L.stateTextLines) : void 0,
    rows: (raw) => Array.isArray(raw) ? raw.slice(0, L.stateRows).flatMap((row) => {
      const label = isRecord(row) ? plainLine(row.label, L.stateLabelChars) : void 0;
      const value = isRecord(row) ? plainLine(row.value, L.stateValueChars) : void 0;
      return label && value ? [{ label, value }] : [];
    }) : void 0,
    meters: (raw) => Array.isArray(raw) ? raw.slice(0, L.stateMeters).flatMap((meter) => {
      const label = isRecord(meter) ? plainLine(meter.label, L.stateLabelChars) : void 0;
      const percent = isRecord(meter) && typeof meter.percent === "number" && Number.isFinite(meter.percent) ? Math.round(Math.min(100, Math.max(0, meter.percent)) * 10) / 10 : void 0;
      const detail = isRecord(meter) ? plainLine(meter.detail, L.stateMeterDetailChars) : void 0;
      return label && percent !== void 0 ? [{ label, percent, ...detail ? { detail } : {} }] : [];
    }) : void 0,
    list: (raw) => Array.isArray(raw) ? raw.slice(0, L.stateListItems).flatMap((item) => {
      const id = isRecord(item) ? plainLine(item.id, L.stateItemIdChars) : void 0;
      const title = isRecord(item) ? plainLine(item.title, L.stateItemTitleChars) : void 0;
      const detail = isRecord(item) ? plainLine(item.detail, L.stateItemDetailChars) : void 0;
      const icon = isRecord(item) && typeof item.icon === "string" && PLUGIN_UI_CODICON.test(item.icon) ? item.icon : void 0;
      return id && title ? [{ id, title, ...detail ? { detail } : {}, ...icon ? { icon } : {} }] : [];
    }) : void 0
  };
  function pluginUiStateTypes(space) {
    const types = /* @__PURE__ */ new Map();
    for (const page of space.pages) {
      for (const block of page.blocks ?? []) {
        if ((block.type === "text" || block.type === "rows" || block.type === "meters" || block.type === "list") && block.state) {
          types.set(block.state, block.type);
        }
      }
    }
    return types;
  }
  function readPluginUiState(space, raw) {
    if (!isRecord(raw)) {
      return { values: {}, problems: ["the state must be an object of names and what each shows"] };
    }
    const types = pluginUiStateTypes(space);
    const values = {};
    const problems = [];
    for (const [name, value] of Object.entries(raw)) {
      const type = types.get(name);
      const read = type && value !== null ? STATE_READERS[type](value) : void 0;
      if (!type) {
        problems.push(`"${name}": no block of space "${space.id}" shows it`);
      } else if (value === null) {
        values[name] = null;
      } else if (read === void 0) {
        problems.push(`"${name}" is shown by a ${type} block: ${type === "text" ? "it takes a text" : "it takes a list"}`);
      } else {
        values[name] = read;
      }
    }
    return { values, problems };
  }
  function describePluginUiSlot(key) {
    const slot = PLUGIN_UI_SLOTS[key];
    const out = [`### ui.${key}`, "", `${slot.place}. At most ${slot.max} a plugin; needs the "${slot.permission}" permission.`];
    const seen = /* @__PURE__ */ new Set();
    const describe = (kind, title) => {
      if (seen.has(kind)) {
        return;
      }
      seen.add(kind);
      out.push("", `#### ${title}`, "", kind.about);
      const fields = Object.entries(kind.fields);
      if (fields.length) {
        out.push("", "| Key | Takes | |", "| --- | --- | --- |");
        for (const [name, field] of fields) {
          out.push(`| \`${name}\` | ${field.takes.replace("<key>L10n", `${name}L10n`)} | ${[field.isOptional ? "optional" : "required", field.about].filter(Boolean).join(". ")} |`);
        }
      }
      for (const field of fields.map(([, f]) => f)) {
        field.holds.forEach((held) => describe(held, held.name));
      }
      for (const [type, typed] of Object.entries(kind.types ?? {})) {
        describe(typed, `${kind.name} "${type}"`);
      }
    };
    describe(slot.kind, slot.kind.name);
    return out.join("\n") + "\n";
  }
  return __toCommonJS(breezellPluginUiDefinition_exports);
})();
// ---- end of the generated plugin UI definition ----
const UI_COLOR = /^(#[0-9a-f]{3,8}|(rgb|rgba|hsl|hsla)\([0-9.,%\s/]{1,40}\)|transparent|currentcolor|[a-z]{3,24}|var\(--(vscode|breezell)-[a-zA-Z0-9-]{1,80}\))$/i;
const UI_LITERAL_COLOR = /^(#[0-9a-f]{3,8}|(rgb|rgba|hsl|hsla)\([0-9.,%\s/]{1,40}\))$/i;
const UI_MAX_PX = { padding: 64, margin: 64, gap: 64, borderRadius: 64, borderWidth: 4, size: 2000 };
/** One size: up to `maxPx`, up to 4em or 4rem, and a percentage (up to 50) only where `percent`. */
function uiLengthOk(value, maxPx, percent) {
	if (value === '0') {
		return true;
	}
	const size = /^([0-9]{1,4}(?:\.[0-9]{1,3})?)(px|em|rem|%)$/.exec(value);
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
/** A width or height: up to 2000px or 100%, at least 48px or 20% (a minimum may be 0), auto, or none for a maximum. */
function uiSizeOk(value, property) {
	const isMinimum = /^min/.test(property);
	if (value === 'auto' || (value === 'none' && /^max/.test(property)) || (value === '0' && isMinimum)) {
		return true;
	}
	const size = /^([0-9]{1,4}(?:\.[0-9]{1,2})?)(px|%)$/.exec(value);
	if (!size) {
		return false;
	}
	const n = Number(size[1]);
	return size[2] === 'px' ? n <= UI_MAX_PX.size && (isMinimum || n >= 48) : n <= 100 && (isMinimum || n >= 20);
}
function uiSplitTopLevel(value, separator) {
	const out = [];
	let depth = 0;
	let current = '';
	for (const char of value) {
		if (char === '(') {
			depth++;
		} else if (char === ')') {
			depth = Math.max(0, depth - 1);
		}
		if (char === separator && depth === 0) {
			out.push(current);
			current = '';
		} else {
			current += char;
		}
	}
	out.push(current);
	return out;
}
const uiShadowPx = value => value === '0' ? 0 : /^-?[0-9]{1,3}(\.[0-9]{1,2})?px$/.test(value) ? Number(value.slice(0, -2)) : undefined;
/** Up to three layers of `[inset] <x> <y> [blur] [spread] <colour>`: offsets up to 16px, blur up to 48px, spread up to 8px. */
function uiShadowOk(value) {
	if (value === 'none') {
		return true;
	}
	const layers = uiSplitTopLevel(value, ',');
	return layers.length >= 1 && layers.length <= 3 && layers.every(layer => {
		const parts = uiSplitTopLevel(layer.trim(), ' ').filter(Boolean);
		const sizes = parts.map(uiShadowPx).filter(n => n !== undefined);
		const colors = parts.filter(part => uiShadowPx(part) === undefined && part !== 'inset' && UI_COLOR.test(part));
		const insets = parts.filter(part => part === 'inset');
		if (colors.length > 1 || insets.length > 1 || sizes.length < 2 || sizes.length > 4 || colors.length + sizes.length + insets.length !== parts.length) {
			return false;
		}
		const [x, y, blur = 0, spread = 0] = sizes;
		return Math.abs(x) <= 16 && Math.abs(y) <= 16 && blur >= 0 && blur <= 48 && Math.abs(spread) <= 8;
	});
}
const UI_IMAGE_FILE = /\.(png|jpe?g|gif|webp|avif)$/i;
/** `plugin:<path>` with a path inside the plugin to an image file: the path, or undefined. */
function uiAssetPath(value) {
	if (typeof value !== 'string' || !value.startsWith('plugin:')) {
		return undefined;
	}
	const path = value.slice('plugin:'.length).replace(/^\.\//, '');
	return UI_PATH.test(path) && UI_IMAGE_FILE.test(path) ? path : undefined;
}
const UI_GRADIENT = /^(repeating-)?(linear|radial|conic)-gradient\([a-z0-9#%.,\s()\-/]{1,400}\)$/i;
const UI_TRANSITION_PROPERTIES = ['all', 'background-color', 'color', 'border-color', 'opacity', 'box-shadow', 'background'];
function uiTransitionOk(value) {
	if (value === 'none') {
		return true;
	}
	return uiSplitTopLevel(value, ',').every(part => {
		const words = part.trim().split(/\s+/);
		const duration = /^([0-9]{1,4})(ms|s)$/.exec(words[1] ?? '');
		return words.length >= 2 && words.length <= 3 && UI_TRANSITION_PROPERTIES.includes(words[0]) && !!duration
			&& (duration[2] === 'ms' ? Number(duration[1]) <= 1000 : Number(duration[1]) <= 1)
			&& (words.length === 2 || /^(ease|linear|ease-in|ease-out|ease-in-out)$/.test(words[2]));
	});
}

function uiStyleOk(property, value) {
	if (typeof value !== 'string' || !value || value.length > (property === 'backgroundImage' || property === 'boxShadow' ? 400 : 160)) {
		return false;
	}
	const v = value.trim();
	if (property !== 'fontFamily' && UI_UNSAFE_CSS.test(v.replace(/^var\(--(vscode|breezell)-[a-zA-Z0-9-]+\)$/, '').replace(/^plugin:[A-Za-z0-9._\-/]+$/, ''))) {
		return false;
	}
	switch (property) {
		case 'backgroundColor':
		case 'color':
		case 'borderColor':
			return UI_COLOR.test(v);
		case 'borderRadius':
			return uiLengthsOk(v, UI_MAX_PX.borderRadius, true);
		case 'padding':
			return uiLengthsOk(v, UI_MAX_PX.padding, false);
		case 'margin':
			return uiLengthsOk(v, UI_MAX_PX.margin, false);
		case 'gap':
			return v.split(/\s/).length <= 2 && uiLengthsOk(v, UI_MAX_PX.gap, false);
		case 'borderWidth':
			return uiLengthOk(v, UI_MAX_PX.borderWidth, false) && !/em$/.test(v);
		case 'boxShadow':
			return uiShadowOk(v);
		case 'backgroundImage':
			return v === 'none' || UI_GRADIENT.test(v) || uiAssetPath(v) !== undefined;
		case 'width':
		case 'minWidth':
		case 'maxWidth':
		case 'height':
		case 'minHeight':
		case 'maxHeight':
			return uiSizeOk(v, property);
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
		case 'textAlign':
			return /^(left|right|center|start|end)$/.test(v);
		case 'letterSpacing': {
			const spacing = /^(-?[0-9](\.[0-9]{1,2})?)(px|em)$/.exec(v);
			return v === 'normal' || (!!spacing && (spacing[3] === 'px' ? Math.abs(Number(spacing[1])) <= 4 : Math.abs(Number(spacing[1])) <= 0.3));
		}
		case 'textTransform':
			return /^(none|uppercase|lowercase|capitalize)$/.test(v);
		case 'transition':
			return uiTransitionOk(v);
		case 'opacity':
			return /^[01](\.[0-9]{1,2})?$/.test(v) && Number(v) >= 0.3 && Number(v) <= 1;
		default:
			return false;
	}
}

/**
 * Breezell's variables a plugin may set (`--breezell-<name>`), with the kind of value each takes. The
 * pairs colour what the user must always read: both colours written out, with a contrast of 4.5.
 */
const UI_TOKENS = {
	'bg-1': 'color', 'bg-1-alt': 'color', 'bg-2': 'color', 'bg-2-alt': 'color', 'bg-2-hover': 'color', 'bg-3': 'color',
	'fg-0': 'color', 'fg-1': 'color', 'fg-2': 'color', 'fg-3': 'color', 'fg-4': 'color',
	'warning': 'color',
	'border-1': 'color', 'border-2': 'color', 'border-3': 'color', 'border-4': 'color',
	'field-bg': 'color', 'field-border': 'color', 'field-border-focus': 'color',
	'ring-color': 'color', 'link-color': 'color',
	'accent': 'color', 'accent-fg': 'color',
	'card': 'color', 'card-border': 'color', 'card-shadow': 'shadow',
	'chat-font-family': 'fontFamily', 'chat-font-size': 'fontSize', 'chat-background': 'background',
	'bubble-radius': 'radius', 'bubble-padding': 'length',
	'input-radius': 'radius', 'input-shadow': 'shadow',
	'send-bg': 'color', 'send-fg': 'color', 'approve-bg': 'color', 'approve-fg': 'color',
	'reject-bg': 'color', 'reject-fg': 'color', 'error-bg': 'color', 'error-fg': 'color',
};
const UI_TOKEN_PAIRS = { 'accent': 'accent-fg', 'accent-fg': 'accent', 'send-bg': 'send-fg', 'send-fg': 'send-bg', 'approve-bg': 'approve-fg', 'approve-fg': 'approve-bg', 'reject-bg': 'reject-fg', 'reject-fg': 'reject-bg', 'error-bg': 'error-fg', 'error-fg': 'error-bg' };
const UI_TOKEN_MIN_CONTRAST = 4.5;
function uiTokenOk(name, value) {
	const kind = Object.prototype.hasOwnProperty.call(UI_TOKENS, name) ? UI_TOKENS[name] : undefined;
	if (!kind || typeof value !== 'string') {
		return false;
	}
	const v = value.trim();
	switch (kind) {
		case 'color': return UI_TOKEN_PAIRS[name] ? UI_LITERAL_COLOR.test(v) && uiParseColor(v) !== undefined : uiStyleOk('color', v);
		case 'length': return uiStyleOk('padding', v);
		case 'radius': return uiStyleOk('borderRadius', v);
		case 'shadow': return uiStyleOk('boxShadow', v);
		case 'fontFamily': return uiStyleOk('fontFamily', v);
		case 'fontSize': return uiStyleOk('fontSize', v);
		case 'background': return uiStyleOk('backgroundImage', v);
	}
	return false;
}
/** A colour as [r, g, b, a]; undefined for anything but hex, rgb() and hsl(). */
function uiParseColor(value) {
	const v = value.trim().toLowerCase();
	const hex = /^#([0-9a-f]{3,8})$/.exec(v);
	if (hex) {
		const h = hex[1];
		if (h.length === 3 || h.length === 4) {
			const parts = [...h].map(c => parseInt(c + c, 16));
			return [parts[0], parts[1], parts[2], h.length === 4 ? parts[3] / 255 : 1];
		}
		if (h.length === 6 || h.length === 8) {
			const parts = [0, 2, 4, 6].map(i => parseInt(h.slice(i, i + 2), 16));
			return [parts[0], parts[1], parts[2], h.length === 8 ? parts[3] / 255 : 1];
		}
		return undefined;
	}
	const fn = /^(rgba?|hsla?)\((.*)\)$/.exec(v);
	if (!fn) {
		return undefined;
	}
	const numbers = fn[2].split(/[\s,/]+/).filter(Boolean);
	if (numbers.length < 3 || numbers.length > 4) {
		return undefined;
	}
	const channel = (text, max) => {
		const n = Number(text.replace('%', ''));
		if (!Number.isFinite(n)) {
			return undefined;
		}
		return text.endsWith('%') ? Math.min(max, Math.max(0, n / 100 * max)) : Math.min(max, Math.max(0, n));
	};
	const alpha = numbers.length === 4 ? channel(numbers[3], 1) : 1;
	if (alpha === undefined) {
		return undefined;
	}
	if (fn[1].startsWith('rgb')) {
		const [r, g, b] = numbers.slice(0, 3).map(n => channel(n, 255));
		return r === undefined || g === undefined || b === undefined ? undefined : [r, g, b, alpha];
	}
	const hue = Number(numbers[0].replace(/deg$/, ''));
	const s = channel(numbers[1], 1);
	const l = channel(numbers[2], 1);
	if (!Number.isFinite(hue) || s === undefined || l === undefined || !numbers[1].endsWith('%') || !numbers[2].endsWith('%')) {
		return undefined;
	}
	const k = n => (n + ((hue % 360) + 360) % 360 / 30) % 12;
	const a = s * Math.min(l, 1 - l);
	const f = n => l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1));
	return [Math.round(f(0) * 255), Math.round(f(8) * 255), Math.round(f(4) * 255), alpha];
}
function uiContrast(a, b) {
	const luminance = c => {
		const [r, g, bl] = c.slice(0, 3).map(v => {
			const s = v / 255;
			return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
		});
		return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
	};
	const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
	return (light + 0.05) / (dark + 0.05);
}
/** Why a pair token cannot go as it is with the values beside it; undefined when it reads. */
function uiTokenPairProblem(name, values) {
	const pair = UI_TOKEN_PAIRS[name];
	if (!pair) {
		return undefined;
	}
	const own = uiParseColor(values[name] ?? '');
	const other = uiParseColor(values[pair] ?? '');
	if (!own || !other) {
		return `${name} colours a part the user must be able to read: set it together with ${pair}, both as written-out colours (#rrggbb, rgb(), hsl())`;
	}
	if (own[3] < 1 || other[3] < 1) {
		return `${name} and ${pair} must be opaque, so their contrast can be checked`;
	}
	const ratio = uiContrast(own, other);
	return ratio < UI_TOKEN_MIN_CONTRAST ? `${name} and ${pair} have a contrast of ${ratio.toFixed(1)}: readable text needs ${UI_TOKEN_MIN_CONTRAST}` : undefined;
}

/** The plugin's own settings (contributes.configuration), by name. */
function uiOwnSettings(pkg) {
	const blocks = pkg.contributes?.configuration;
	return Object.assign({}, ...(Array.isArray(blocks) ? blocks : [blocks]).map(block => block?.properties ?? {}));
}
/** `{ setting, value }` on one of the plugin's own settings, with a value of its type: true when it is. */
function uiConditionOk(raw, settings, where, errors) {
	const schema = typeof raw?.setting === 'string' ? settings[raw.setting] : undefined;
	if (!schema) {
		errors.push(`${where}: "when.setting" must be one of the plugin's own, in contributes.configuration`);
		return false;
	}
	if (/breezell/i.test(raw.setting)) {
		errors.push(`${where}: a setting named after Breezell is not for a plugin`);
		return false;
	}
	const value = raw.value;
	const fits = schema.type === 'boolean' ? typeof value === 'boolean' : schema.type === 'number' || schema.type === 'integer' ? typeof value === 'number' && Number.isFinite(value) : typeof value === 'string';
	if (!fits) {
		errors.push(`${where}: "when.value" must be a ${String(schema.type ?? 'string')} the setting can hold`);
		return false;
	}
	return true;
}
/** A set of tokens: names with or without --breezell-, values of their kind or { setting } of the plugin's own. */
function uiTokenSetOk(raw, settings, where, errors) {
	if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
		errors.push(`${where} must be an object of token names and values`);
		return false;
	}
	const literal = {};
	let good = 0;
	for (const [rawName, value] of Object.entries(raw)) {
		const name = rawName.startsWith('--breezell-') ? rawName.slice('--breezell-'.length) : rawName;
		if (!Object.prototype.hasOwnProperty.call(UI_TOKENS, name)) {
			errors.push(`${where}: no token "${rawName}" (there are ${Object.keys(UI_TOKENS).join(', ')})`);
		} else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
			if (UI_TOKEN_PAIRS[name]) {
				errors.push(`${where}: ${name} takes written-out colours only, so their contrast can be checked`);
			} else if (typeof value.setting !== 'string' || !settings || !settings[value.setting] || /breezell/i.test(value.setting)) {
				errors.push(`${where}: ${name}: "setting" must be one of the plugin's own, in contributes.configuration`);
			} else {
				good++;
			}
		} else if (!uiTokenOk(name, value)) {
			errors.push(`${where}: ${JSON.stringify(value)} is no valid value of ${name} (${UI_TOKENS[name]})`);
		} else {
			literal[name] = value.trim();
			good++;
		}
	}
	for (const name of Object.keys(literal)) {
		const problem = uiTokenPairProblem(name, literal);
		if (problem) {
			errors.push(`${where}: ${problem}`);
		}
	}
	return good > 0;
}
/** One patch, as Breezell reads it (checkPluginPatch); `surfaces` for replaceWith. */
function uiPatchOk(p, surfaces, errors, where = `ui.patches: ${JSON.stringify((typeof p?.region === 'string' && p.region) || p)}`) {
	const name = typeof p?.region === 'string' ? p.region : '';
	if (uiProtected(name)) {
		errors.push(`${where} is protected: no plugin may change it`);
		return false;
	}
	const region = Object.prototype.hasOwnProperty.call(UI_REGIONS, name) ? UI_REGIONS[name] : undefined;
	if (!region) {
		errors.push(`${where}: no such part (there are ${Object.keys(UI_REGIONS).join(', ')})`);
		return false;
	}
	let changes = 0;
	if (p.hide !== undefined) {
		if (p.hide === true && region.hide) changes++; else errors.push(`${where} cannot be hidden`);
	}
	if (p.order !== undefined) {
		if (region.order && typeof p.order === 'number' && Number.isFinite(p.order)) changes++; else errors.push(`${where}: its order cannot be set`);
	}
	if (p.replaceWith !== undefined) {
		if (region.replace && surfaces.some(s => s?.id === p.replaceWith)) changes++; else errors.push(`${where}: "replaceWith" must name one of the plugin's surfaces, where a part can be replaced`);
	}
	for (const [property, value] of Object.entries(typeof p.style === 'object' && p.style !== null ? p.style : {})) {
		if (!(region.style ?? []).includes(property)) {
			errors.push(`${where}: its style does not take "${property}"`);
		} else if (!uiStyleOk(property, value)) {
			errors.push(`${where}: ${JSON.stringify(value)} is no valid ${property}`);
		} else if (property === 'backgroundColor' && region.themeBackgroundOnly && !UI_THEME_BACKGROUND.test(value.trim())) {
			errors.push(`${where}: what is on it must stay readable, so "backgroundColor" can only be "transparent" or var(--vscode-<x>-background) with x one of ${UI_THEME_BACKGROUNDS.join(', ')}`);
		} else {
			changes++;
		}
	}
	return changes > 0;
}
/**
 * The plugin's stylesheet, read as Breezell reads it (parsePluginStylesheet): `:root` with Breezell's
 * variables and `::part(<name>)` rules, nothing else.
 */
function uiStylesheetOk(css, errors) {
	const text = css.slice(0, 64 * 1024).replace(/\/\*[\s\S]*?\*\//g, ' ');
	const rule = /([^{}]*)\{([^{}]*)\}/g;
	let consumed = 0;
	const tokens = {};
	for (let match = rule.exec(text); match; match = rule.exec(text)) {
		const between = text.slice(consumed, match.index).trim();
		consumed = match.index + match[0].length;
		if (between) {
			errors.push(`ui.stylesheet: Breezell leaves out "${between.slice(0, 60)}"`);
		}
		const selector = match[1].trim();
		const declarations = uiDeclarations(match[2]);
		if (selector.startsWith('@')) {
			errors.push(`ui.stylesheet: at-rules are left out ("${selector.slice(0, 40)}")`);
			continue;
		}
		if (selector === ':root') {
			for (const [property, value] of declarations) {
				if (!property.startsWith('--breezell-')) {
					errors.push(`ui.stylesheet: :root takes Breezell's variables only (--breezell-...), not "${property}"`);
				} else if (/!important/i.test(value)) {
					errors.push(`ui.stylesheet: ${property}: !important is left out`);
				} else {
					tokens[property] = value;
				}
			}
			continue;
		}
		const parts = selector.split(',').map(part => /^::part\(\s*([a-zA-Z0-9._-]+)\s*\)$/.exec(part.trim())?.[1]);
		if (!parts.length || parts.some(part => !part)) {
			errors.push(`ui.stylesheet: "${selector.slice(0, 60)}" is no rule Breezell reads: write :root or ::part(<name>)`);
			continue;
		}
		const style = {};
		for (const [property, value] of declarations) {
			const camel = property.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
			if (!UI_STYLE_PROPERTIES.includes(camel)) {
				errors.push(`ui.stylesheet: ${selector}: "${property}" is no property a part takes`);
			} else if (/!important/i.test(value)) {
				errors.push(`ui.stylesheet: ${selector}: !important is left out`);
			} else {
				style[camel] = value;
			}
		}
		for (const region of parts) {
			uiPatchOk({ region, style }, [], errors, `ui.stylesheet: ::part(${region})`);
		}
	}
	const rest = text.slice(consumed).trim();
	if (rest) {
		errors.push(`ui.stylesheet: Breezell leaves out "${rest.slice(0, 60)}"`);
	}
	if (Object.keys(tokens).length) {
		uiTokenSetOk(tokens, undefined, 'ui.stylesheet :root', errors);
	}
}
function uiDeclarations(block) {
	const out = [];
	let depth = 0;
	let quote;
	let current = '';
	const flush = () => {
		const colon = current.indexOf(':');
		if (colon > 0) {
			out.push([current.slice(0, colon).trim().toLowerCase(), current.slice(colon + 1).trim()]);
		}
		current = '';
	};
	for (const char of block) {
		if (quote) {
			if (char === quote) {
				quote = undefined;
			}
		} else if (char === '"' || char === '\'') {
			quote = char;
		} else if (char === '(') {
			depth++;
		} else if (char === ')') {
			depth = Math.max(0, depth - 1);
		} else if (char === ';' && depth === 0) {
			flush();
			continue;
		}
		current += char;
	}
	flush();
	return out;
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
	const own = uiOwnSettings(pkg);
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
		} else if ((schema.type === 'number' || schema.type === 'integer') && !known) {
			seen.add(item.setting);
			if (typeof schema.minimum !== 'number' || typeof schema.maximum !== 'number' || schema.minimum >= schema.maximum) {
				errors.push(`${where}: a number needs "minimum" and "maximum" in its contributes.configuration entry`);
			} else {
				good++;
			}
		} else if (schema.type === 'string' && !known) {
			// A colour picker with "format": "color-hex", else a text field (up to 200 characters).
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
			errors.push(`${where}: a setting here is a boolean, a string (with an enum for choices, "format": "color-hex" for a colour) or a number with a minimum and maximum`);
		}
	}
	return good > 0;
}

/**
 * Tiles on Box › Models › Sign in (ui.signIns), at most 2. Keep in step with readPluginSignIn in Breezell.
 * Returns how many pass.
 */
function checkUiSignIns(list, pkg, errors) {
	if (list.length > 2) {
		errors.push('ui.signIns: at most 2');
	}
	const own = uiOwnSettings(pkg);
	const commands = (Array.isArray(pkg.contributes?.commands) ? pkg.contributes.commands : pkg.contributes?.commands ? [pkg.contributes.commands] : []).map(c => c?.command);
	const ids = new Set();
	const settings = new Set();
	let good = 0;
	for (const s of list.slice(0, 2)) {
		const where = `ui.signIns: ${JSON.stringify(s?.id ?? s)}`;
		const schema = typeof s?.setting === 'string' ? own[s.setting] : undefined;
		const titles = [s?.title, ...Object.values(s?.l10n && typeof s.l10n === 'object' ? s.l10n : {})].filter(t => typeof t === 'string');
		if (!UI_ID.test(s?.id ?? '')) {
			errors.push(`${where}: "id" must match ${UI_ID}`);
		} else if (typeof s?.title !== 'string' || !s.title.trim()) {
			errors.push(`${where} needs a title`);
		} else if (titles.some(t => /breezell/i.test(t))) {
			errors.push(`${where}: a title named after Breezell is not for a plugin`);
		} else if (!UI_CODICON.test(s?.icon ?? '')) {
			errors.push(`${where}: "icon" must be a codicon's name`);
		} else if (!schema) {
			errors.push(`${where}: "setting" must be one of the plugin's own, in contributes.configuration`);
		} else if (/breezell/i.test(s.setting)) {
			errors.push(`${where}: a setting named after Breezell is not for a plugin`);
		} else if (schema.type !== 'boolean') {
			errors.push(`${where}: "${s.setting}" must be a boolean`);
		} else if (schema.default === true) {
			errors.push(`${where}: "${s.setting}" must be off by default: the user turns it on`);
		} else if (s.command !== undefined && /breezell/i.test(String(s.command))) {
			errors.push(`${where}: "${s.command}" is Breezell's`);
		} else if (s.command !== undefined && !commands.includes(s.command)) {
			errors.push(`${where}: "command" must be one of the plugin's own, in contributes.commands`);
		} else if (s.actions !== undefined && (!Array.isArray(s.actions) || s.actions.length > 3)) {
			errors.push(`${where}: "actions" must be a list of at most 3`);
		} else if ((s.actions ?? []).some(a => typeof a?.title !== 'string' || !a.title.trim())) {
			errors.push(`${where}: each of "actions" needs a title`);
		} else if ((s.actions ?? []).some(a => /breezell/i.test(String(a?.command)) || !commands.includes(a?.command))) {
			errors.push(`${where}: "actions[].command" must be one of the plugin's own, in contributes.commands`);
		} else if ((s.actions ?? []).some(a => [a.title, ...Object.values(a?.l10n && typeof a.l10n === 'object' ? a.l10n : {})].some(t => typeof t === 'string' && /breezell/i.test(t)))) {
			errors.push(`${where}: a button named after Breezell is not for a plugin`);
		} else if (s.options !== undefined && (!Array.isArray(s.options) || s.options.length > 3)) {
			errors.push(`${where}: "options" must be a list of at most 3`);
		} else if ((s.options ?? []).some(o => typeof o?.setting !== 'string' || o.setting === s.setting || own[o.setting]?.type !== 'boolean')) {
			errors.push(`${where}: each of "options" needs a boolean "setting" of the plugin's own (contributes.configuration), other than the tile's`);
		} else if ((s.options ?? []).some(o => typeof o?.title !== 'string' || !o.title.trim() || [o.title, ...Object.values(o?.l10n && typeof o.l10n === 'object' ? o.l10n : {})].some(t => typeof t === 'string' && /breezell/i.test(t)) || /breezell/i.test(o.setting))) {
			errors.push(`${where}: each of "options" needs a title, and none named after Breezell`);
		} else if ((s.options ?? []).some(o => o.confirm !== undefined && (typeof o.confirm?.title !== 'string' || !o.confirm.title.trim() || typeof o.confirm?.message !== 'string' || !o.confirm.message.trim()))) {
			errors.push(`${where}: an option's "confirm" needs a title and a message`);
		} else if (s.consent !== undefined && (typeof s.consent?.title !== 'string' || !s.consent.title.trim() || typeof s.consent?.message !== 'string' || !s.consent.message.trim())) {
			errors.push(`${where}: "consent" needs a title and a message`);
		} else if (ids.has(s.id)) {
			errors.push(`${where}: the id is used twice`);
		} else if (settings.has(s.setting)) {
			errors.push(`${where}: "${s.setting}" already turns another tile`);
		} else {
			ids.add(s.id);
			settings.add(s.setting);
			good++;
		}
	}
	return good;
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
		if (s?.slot === 'titlebar.center' && surfaces.indexOf(s) !== surfaces.findIndex(o => o?.slot === 'titlebar.center')) {
			errors.push(`${where}: a plugin has one page in the title bar`);
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

	const settings = uiOwnSettings(pkg);
	const patches = list('patches');
	for (const p of patches) {
		const where = `ui.patches: ${JSON.stringify((typeof p?.region === 'string' && p.region) || p)}`;
		if (p?.when !== undefined && !uiConditionOk(p.when, settings, where, errors)) {
			continue;
		}
		uiPatchOk(p, surfaces, errors, where);
	}
	// Breezell's variables: one set, or sets each with a `when`.
	let tokenSets = 0;
	if (Array.isArray(ui.tokens)) {
		for (const set of ui.tokens) {
			if (set?.when !== undefined && !uiConditionOk(set.when, settings, 'ui.tokens', errors)) {
				continue;
			}
			tokenSets++;
			uiTokenSetOk(set?.values, settings, 'ui.tokens', errors);
		}
	} else if (ui.tokens !== undefined) {
		tokenSets++;
		uiTokenSetOk(ui.tokens, settings, 'ui.tokens', errors);
	}
	let variantPatches = 0;
	for (const variant of ui.variants === undefined ? [] : Array.isArray(ui.variants) ? ui.variants : [ui.variants]) {
		const where = `ui.variants: ${JSON.stringify(variant?.setting ?? variant)}`;
		if (typeof variant?.setting !== 'string' || typeof variant.values !== 'object' || variant.values === null || Array.isArray(variant.values)) {
			errors.push(`${where} needs "setting" and "values": { "<value>": { "tokens": {...}, "patches": [...] } }`);
			continue;
		}
		const schema = settings[variant.setting];
		for (const [key, look] of Object.entries(variant.values)) {
			const value = schema?.type === 'boolean' ? (key === 'true' ? true : key === 'false' ? false : key) : schema?.type === 'number' || schema?.type === 'integer' ? Number(key) : key;
			if (!uiConditionOk({ setting: variant.setting, value }, settings, `${where}.${key}`, errors) || typeof look !== 'object' || look === null) {
				continue;
			}
			if (look.tokens !== undefined) {
				tokenSets++;
				uiTokenSetOk(look.tokens, settings, `${where}.${key}.tokens`, errors);
			}
			for (const p of Array.isArray(look.patches) ? look.patches : []) {
				variantPatches++;
				uiPatchOk(p, surfaces, errors, `${where}.${key}: ${JSON.stringify(p?.region ?? p)}`);
			}
		}
	}
	if (tokenSets > 16) {
		errors.push('ui.tokens: at most 16 sets of tokens, with those of ui.variants');
	}
	if (patches.length + variantPatches > 32) {
		errors.push('ui.patches: at most 32, with those of ui.variants');
	}
	const fonts = list('fonts');
	for (const f of fonts) {
		const where = `ui.fonts: ${JSON.stringify(f?.family ?? f)}`;
		const file = typeof f?.file === 'string' ? f.file.replace(/^\.\//, '') : '';
		if (typeof f?.family !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9 _-]{0,39}$/.test(f.family)) {
			errors.push(`${where}: "family" is a name of letters, digits, spaces, _ and -`);
		} else if (!UI_PATH.test(file) || !/\.(woff2|woff|ttf|otf)$/i.test(file)) {
			errors.push(`${where}: "file" must be a .woff2, .woff, .ttf or .otf file inside the plugin`);
		} else if (fileMissing(file)) {
			errors.push(`${where}: "${file}" does not exist`);
		} else if (dir && fs.statSync(path.join(dir, file)).size > 2 * 1024 * 1024) {
			errors.push(`${where}: "${file}" is larger than 2 MB, which Breezell does not load`);
		}
		if ((f?.weight !== undefined && !/^(normal|bold|[1-9]00)$/.test(f.weight)) || (f?.style !== undefined && f.style !== 'normal' && f.style !== 'italic')) {
			errors.push(`${where}: "weight" is normal, bold or 100-900; "style" is normal or italic`);
		}
	}
	if (fonts.length > 8) {
		errors.push('ui.fonts: at most 8');
	}
	// Images named as plugin:<path> must be there, and small enough for Breezell to load.
	const assets = new Set();
	const noteAsset = value => { const asset = uiAssetPath(typeof value === 'string' ? value.trim() : ''); if (asset) assets.add(asset); };
	for (const p of patches) noteAsset(p?.style?.backgroundImage);
	for (const set of Array.isArray(ui.tokens) ? ui.tokens.map(t => t?.values) : [ui.tokens]) Object.values(set ?? {}).forEach(noteAsset);
	for (const asset of assets) {
		if (fileMissing(asset)) {
			errors.push(`"plugin:${asset}" does not exist`);
		} else if (dir && fs.statSync(path.join(dir, asset)).size > 2 * 1024 * 1024) {
			errors.push(`"plugin:${asset}" is larger than 2 MB, which Breezell does not load`);
		}
	}
	let stylesheet = false;
	if (ui.stylesheet !== undefined) {
		const file = typeof ui.stylesheet === 'string' ? ui.stylesheet.replace(/^\.\//, '') : '';
		if (!UI_PATH.test(file) || !/\.css$/i.test(file)) {
			errors.push('ui.stylesheet must be a .css file inside the plugin');
		} else if (fileMissing(file)) {
			errors.push(`ui.stylesheet: "${file}" does not exist`);
		} else {
			stylesheet = true;
			if (dir) {
				const css = fs.readFileSync(path.join(dir, file), 'utf8');
				if (Buffer.byteLength(css) > 64 * 1024) {
					errors.push(`ui.stylesheet: "${file}" is larger than 64 KB; Breezell reads only its start`);
				}
				uiStylesheetOk(css, errors);
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

	const companion = surfaces.some(s => UI_OWN_SCREEN_SLOTS.includes(s?.slot));
	const hasOptions = checkUiOptions(ui.options, pkg, errors);
	const slashCommands = list('slashCommands');
	const slashNames = new Set();
	for (const c of slashCommands) {
		const where = `ui.slashCommands: ${JSON.stringify(c?.name ?? c)}`;
		if (typeof c?.name !== 'string' || !/^[a-z][a-z0-9-]{0,23}( [a-z][a-z0-9-]{0,23})?$/.test(c.name)) {
			errors.push(`${where} needs a name: one or two lowercase words, without the slash`);
		} else if (/breezell/i.test(c.name)) {
			errors.push(`${where}: a name cannot pass for one of Breezell's`);
		} else if (slashNames.has(c.name)) {
			errors.push(`${where}: the name is used twice`);
		}
		slashNames.add(c?.name);
		if (typeof c?.description !== 'string' || !c.description.trim()) {
			errors.push(`${where} needs a description`);
		}
		if (c?.icon !== undefined && !UI_CODICON.test(c.icon)) {
			errors.push(`${where}: "icon" must be a codicon's name`);
		}
		if (c?.command !== undefined && !(pkg.contributes?.commands ?? []).some(o => o?.command === c.command)) {
			errors.push(`${where}: "command" must be one of the plugin's own, in contributes.commands`);
		}
	}
	if (slashCommands.length > 8) {
		errors.push('ui.slashCommands: at most 8');
	}
	const signIns = checkUiSignIns(list('signIns'), pkg, errors);
	if (buttons.length || surfaces.some(s => s?.slot && !UI_OWN_SCREEN_SLOTS.includes(s.slot)) || modes.length || hasOptions || slashCommands.length || signIns) {
		needs('ui.contribute', 'ui.buttons, ui.surfaces, ui.options, ui.modes, ui.slashCommands and ui.signIns');
	}
	if (patches.length || companion || tokenSets || variantPatches || fonts.length || stylesheet) {
		needs('ui.modify', 'ui.patches, ui.tokens, ui.variants, ui.fonts, ui.stylesheet, a companion and a page in the title bar');
	}
	if (renderers.length) {
		needs('chat.render', 'ui.renderers');
	}
	if (list('signIns').some(s => s?.agent === true)) {
		needs('chat.agent', 'a sign-in tile with "agent"');
	}
	// The places Breezell's plugin UI definition opens (ui.spaces...): checked by Breezell's own code, generated above.
	const defined = UI_DEFINITION.checkDefinedPluginUi(ui, pkg, relative => !fileMissing(relative));
	errors.push(...defined.problems);
	for (const { key, permission } of defined.permissions) {
		needs(permission, `ui.${key}`);
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
/** The market's plugins/ folder on GitHub, for links to it from files of a new plugin. */
const GITHUB_PLUGINS_URL = `https://github.com/${MARKET_REPO}/blob/main/plugins/`;
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
			if (w?.kind !== undefined && w.kind !== 'overlay') {
				errors.push(`"contributes.breezell.windows": ${JSON.stringify(w?.id)}: "kind" is "overlay" or left out`);
			}
		}
		const windowPermissions = [...(pkg.breezell?.permissions ?? []), ...(pkg.breezell?.optionalPermissions ?? [])];
		if ((declared.windows ?? []).some(w => w?.kind === 'overlay') && !windowPermissions.includes('ui.overlay')) {
			errors.push('windows of "kind": "overlay" need the "ui.overlay" permission: add it to "breezell.permissions" or "breezell.optionalPermissions"');
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
			const ok = l && typeof l === 'object' && (typeof l.command === 'string' ? own.includes(l.command)
				: typeof l.window === 'string' ? (declared.windows ?? []).some(w => w?.id === l.window)
					: typeof l.signIn === 'string' && (declared.ui?.signIns ?? []).some(s => s?.id === l.signIn));
			if (!ok) {
				errors.push('"contributes.breezell.launcher" needs "command" (one of the plugin\'s contributes.commands), "window" (one of its windows) or "signIn" (one of its ui.signIns, shown as a page in Box); "sidebar": false keeps it out of the Box sidebar');
			}
		}
		const inside = p => typeof p === 'string' && !!p && !p.startsWith('/') && !p.split(/[\\/]/).includes('..');
		const skills = declared.skills ?? [];
		if (!Array.isArray(skills) || skills.some(p => !inside(p))) {
			errors.push('"contributes.breezell.skills" must be an array of paths inside the plugin');
		}
		// A rule: a .md path (every request), or { path, when, models }: while one of the plugin's own
		// settings has a value, and only for some models (`*` for any characters, case ignored).
		const rules = declared.rules ?? [];
		if (!Array.isArray(rules)) {
			errors.push('"contributes.breezell.rules" must be an array of .md paths or { "path", "when", "models" }');
		} else {
			const settings = uiOwnSettings(pkg);
			rules.forEach((rule, i) => {
				const where = `"contributes.breezell.rules[${i}]"`;
				const entry = typeof rule === 'string' ? { path: rule } : rule;
				if (typeof entry !== 'object' || entry === null || Array.isArray(entry) || !inside(entry.path) || !entry.path.toLowerCase().endsWith('.md')) {
					errors.push(`${where} must be a path inside the plugin ending in .md, or { "path", "when", "models" }`);
					return;
				}
				if (entry.when !== undefined) {
					uiConditionOk(entry.when, settings, where, errors);
					const choices = settings[entry.when?.setting]?.enum;
					if (Array.isArray(choices) && !choices.includes(entry.when.value)) {
						errors.push(`${where}: "when.value" ${JSON.stringify(entry.when.value)} is none of the setting's values (${choices.map(v => JSON.stringify(v)).join(', ')}), so the rule would never apply`);
					}
				}
				if (entry.models !== undefined && (!Array.isArray(entry.models) || !entry.models.length || entry.models.length > 16 || entry.models.some(m => typeof m !== 'string' || !/^[A-Za-z0-9*._:/@+-]{1,80}$/.test(m)))) {
					errors.push(`${where}: "models" must be 1 to 16 model names (letters, digits, . _ : / @ + - and * for any characters)`);
				}
				const extra = Object.keys(entry).filter(k => !['path', 'when', 'models'].includes(k));
				if (extra.length) {
					errors.push(`${where}: Breezell reads "path", "when" and "models", not ${extra.map(k => JSON.stringify(k)).join(', ')}`);
				}
			});
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
	const rulePaths = (pkg.contributes?.breezell?.rules ?? []).map(rule => typeof rule === 'string' ? rule : rule?.path);
	for (const rel of [...(pkg.contributes?.breezell?.skills ?? []), ...rulePaths, ...(pkg.contributes?.themes ?? []).map(t => t.path), ...windowFolders]) {
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
// Phone plugins: plugins/phone/, data the Breezell phone app draws (themes, file previews), no code
// ---------------------------------------------------------------------------

// ---- generated from the phone app's plugin rules (packages/protocol/src/phonePlugins.ts) by scripts/breezell-plugin-devkit/sync-phone-plugin.mjs: do not edit by hand ----
const PHONE_PLUGIN = (() => {
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

  // Breezellwangye/breezell-mobile/packages/protocol/src/phone-plugin-rules.ts
  var phone_plugin_rules_exports = {};
  __export(phone_plugin_rules_exports, {
    PHONE_BASE_PALETTES: () => PHONE_BASE_PALETTES,
    PHONE_CONTRAST_PAIRS: () => PHONE_CONTRAST_PAIRS,
    PHONE_LOCALES: () => PHONE_LOCALES,
    PHONE_MARKET_INDEX_PATH: () => PHONE_MARKET_INDEX_PATH,
    PHONE_PLUGIN_API: () => PHONE_PLUGIN_API,
    PHONE_PLUGIN_LIMITS: () => PHONE_PLUGIN_LIMITS,
    PHONE_PREVIEW_VARIABLES: () => PHONE_PREVIEW_VARIABLES,
    PHONE_RENDERERS: () => PHONE_RENDERERS,
    PHONE_THEME_VARIABLES: () => PHONE_THEME_VARIABLES,
    README_LOCALES: () => README_LOCALES,
    addsOf: () => addsOf,
    compareVersions: () => compareVersions,
    effectivePalette: () => effectivePalette,
    isPhoneMarketPath: () => isPhoneMarketPath,
    isPhonePaletteValue: () => isPhonePaletteValue,
    isPhoneReadableMarketPath: () => isPhoneReadableMarketPath,
    isValidPluginId: () => isValidPluginId,
    isValidVersion: () => isValidVersion,
    paletteProblems: () => paletteProblems,
    parsePhoneMarketEntry: () => parsePhoneMarketEntry,
    parsePhoneMarketIndex: () => parsePhoneMarketIndex,
    parsePhonePluginManifest: () => parsePhonePluginManifest,
    phoneBlockReason: () => phoneBlockReason,
    phonePluginBlock: () => phonePluginBlock,
    phoneReadmeOf: () => phoneReadmeOf,
    wordsIn: () => wordsIn,
    writtenWords: () => writtenWords
  });

  // Breezellwangye/breezell-mobile/packages/protocol/src/cssColour.ts
  var UNSAFE_CSS = /url|expression|image|import|attr|element|paint|@|;|\{|\}|\\|\/\*|<|>|javascript:/i;
  var LITERAL_COLOR = /^(#[0-9a-f]{3,8}|(rgb|rgba|hsl|hsla)\([0-9.,%\s/]{1,40}\))$/i;
  function splitTopLevel(value, separator) {
    const out = [];
    let depth = 0;
    let current = "";
    for (const char of value) {
      if (char === "(") {
        depth++;
      } else if (char === ")") {
        depth = Math.max(0, depth - 1);
      }
      if (char === separator && depth === 0) {
        out.push(current);
        current = "";
      } else {
        current += char;
      }
    }
    out.push(current);
    return out;
  }
  var SHADOW_LIMITS = { offset: 16, blur: 48, spread: 8 };
  var shadowPx = (value) => value === "0" ? 0 : /^-?[0-9]{1,3}(\.[0-9]{1,2})?px$/.test(value) ? Number(value.slice(0, -2)) : void 0;
  function isShadow(value, isColour, limits = SHADOW_LIMITS) {
    if (value === "none") {
      return true;
    }
    const layers = splitTopLevel(value, ",");
    return layers.length >= 1 && layers.length <= 3 && layers.every((layer) => {
      const parts = splitTopLevel(layer.trim(), " ").filter(Boolean);
      const sizes = parts.map(shadowPx).filter((n) => n !== void 0);
      const colors = parts.filter((part) => shadowPx(part) === void 0 && part !== "inset" && isColour(part));
      const insets = parts.filter((part) => part === "inset");
      if (colors.length > 1 || insets.length > 1 || sizes.length < 2 || sizes.length > 4 || colors.length + sizes.length + insets.length !== parts.length) {
        return false;
      }
      const [x = 0, y = 0, blur = 0, spread = 0] = sizes;
      return Math.abs(x) <= limits.offset && Math.abs(y) <= limits.offset && blur >= 0 && blur <= limits.blur && Math.abs(spread) <= limits.spread;
    });
  }
  function parseCssColor(value) {
    const v = value.trim().toLowerCase();
    const hex = /^#([0-9a-f]{3,8})$/.exec(v);
    if (hex) {
      const h = hex[1];
      if (h.length === 3 || h.length === 4) {
        const parts = [...h].map((c) => parseInt(c + c, 16));
        return [parts[0], parts[1], parts[2], h.length === 4 ? parts[3] / 255 : 1];
      }
      if (h.length === 6 || h.length === 8) {
        const parts = [0, 2, 4, 6].map((i) => parseInt(h.slice(i, i + 2), 16));
        return [parts[0], parts[1], parts[2], h.length === 8 ? parts[3] / 255 : 1];
      }
      return void 0;
    }
    const fn = /^(rgba?|hsla?)\((.*)\)$/.exec(v);
    if (!fn) {
      return void 0;
    }
    const numbers = fn[2].split(/[\s,/]+/).filter(Boolean);
    if (numbers.length < 3 || numbers.length > 4) {
      return void 0;
    }
    const channel = (text, max) => {
      const n = Number(text.replace("%", ""));
      if (!Number.isFinite(n)) {
        return void 0;
      }
      return text.endsWith("%") ? Math.min(max, Math.max(0, n / 100 * max)) : Math.min(max, Math.max(0, n));
    };
    const alpha = numbers.length === 4 ? channel(numbers[3], 1) : 1;
    if (alpha === void 0) {
      return void 0;
    }
    if (fn[1].startsWith("rgb")) {
      const [r, g, b] = numbers.slice(0, 3).map((n) => channel(n, 255));
      return r === void 0 || g === void 0 || b === void 0 ? void 0 : [r, g, b, alpha];
    }
    const hue = Number(numbers[0].replace(/deg$/, ""));
    const s = channel(numbers[1], 1);
    const l = channel(numbers[2], 1);
    if (!Number.isFinite(hue) || s === void 0 || l === void 0 || !numbers[1].endsWith("%") || !numbers[2].endsWith("%")) {
      return void 0;
    }
    const k = (n) => (n + (hue % 360 + 360) % 360 / 30) % 12;
    const a = s * Math.min(l, 1 - l);
    const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1));
    return [Math.round(f(0) * 255), Math.round(f(8) * 255), Math.round(f(4) * 255), alpha];
  }
  function contrastRatio(a, b) {
    const luminance = (c) => {
      const [r = 0, g = 0, b2 = 0] = c.slice(0, 3).map((v) => {
        const s = v / 255;
        return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
      });
      return 0.2126 * r + 0.7152 * g + 0.0722 * b2;
    };
    const [light = 0, dark = 0] = [luminance(a), luminance(b)].sort((x, y) => y - x);
    return (light + 0.05) / (dark + 0.05);
  }

  // Breezellwangye/breezell-mobile/packages/protocol/src/pluginMarket.ts
  var PLUGIN_ID_PART = /^[a-z0-9][a-z0-9-]{0,62}$/;
  function isValidPluginId(id) {
    const parts = id.split(".");
    return parts.length === 2 && PLUGIN_ID_PART.test(parts[0]) && PLUGIN_ID_PART.test(parts[1]);
  }
  var VERSION = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/;
  function isValidVersion(version) {
    return VERSION.test(version);
  }
  function compareVersions(a, b) {
    const ma = VERSION.exec(a);
    const mb = VERSION.exec(b);
    if (!ma || !mb) {
      return ma ? 1 : mb ? -1 : 0;
    }
    for (let i = 1; i <= 3; i++) {
      const d = Number(ma[i]) - Number(mb[i]);
      if (d !== 0) {
        return d < 0 ? -1 : 1;
      }
    }
    if (ma[4] === mb[4]) {
      return 0;
    }
    if (!ma[4]) {
      return 1;
    }
    if (!mb[4]) {
      return -1;
    }
    return ma[4] < mb[4] ? -1 : 1;
  }
  function isSafeMarketPath(path) {
    return path.length > 0 && path.length <= 300 && /^[A-Za-z0-9._\-/]+$/.test(path) && !path.startsWith("/") && path.split("/").every((segment) => segment.length > 0 && segment !== "." && segment !== "..");
  }
  var BREEZELL_MARKET_BLOCKLIST_PATH = "blocklist.json";
  var BREEZELL_PLUGIN_MAX_PACKAGE_BYTES = 50 * 1024 * 1024;
  var README_LOCALES = ["zh-CN", "zh-TW", "ja", "ko", "ru", "es", "pt-BR"];

  // Breezellwangye/breezell-mobile/packages/protocol/src/phonePlugins.ts
  var PHONE_PLUGIN_API = 1;
  var PHONE_PLUGIN_LIMITS = {
    /** A manifest's bytes (it is kept on the phone whole). */
    manifestBytes: 32 * 1024,
    themes: 8,
    viewers: 8,
    extensions: 12,
    nameChars: 60,
    descriptionChars: 400,
    valueChars: 120,
    /** Plugins of the market kept on one phone. */
    installed: 40
  };
  var PHONE_LOCALES = { en: "en", zh: "zh-TW", ja: "ja", ko: "ko" };
  var wordsIn = (words, lang) => words[lang] ?? words.en;
  var PHONE_THEME_VARIABLES = {
    "bg": "colour",
    "surface": "colour",
    "border": "colour",
    "divider": "colour",
    "border-strong": "colour",
    "ink": "colour",
    "muted": "colour",
    "accent": "colour",
    "on-accent": "colour",
    "accent-soft": "colour",
    "accent-ink": "colour",
    "ring": "colour",
    "error-ink": "colour",
    "icon-shadow": "shadow",
    "icon-shadow-lg": "shadow",
    "bubble": "colour",
    "code-bg": "colour",
    "scrim": "colour",
    "syn-plain": "colour",
    "syn-kw": "colour",
    "syn-str": "colour",
    "syn-num": "colour",
    "syn-cmt": "colour",
    "syn-type": "colour",
    "syn-gutter": "colour",
    "file-code": "colour",
    "file-data": "colour",
    "link-hover": "colour"
  };
  var PHONE_BASE_PALETTES = {
    dark: {
      "bg": "#141311",
      "surface": "#1c1b18",
      "border": "#2f2c27",
      "divider": "#2a2823",
      "border-strong": "#57524a",
      "ink": "#ede9e1",
      "muted": "#a29c90",
      "accent": "#7dd3ae",
      "on-accent": "#10201a",
      "accent-soft": "#23352d",
      "accent-ink": "#7dd3ae",
      "ring": "rgba(125, 211, 174, 0.16)",
      "error-ink": "#ff9a8b",
      "icon-shadow": "0 0 0 1px rgba(255, 255, 255, 0.08), 0 12px 32px rgba(0, 0, 0, 0.5)",
      "icon-shadow-lg": "0 0 0 1px rgba(255, 255, 255, 0.08), 0 24px 60px rgba(0, 0, 0, 0.55)",
      "bubble": "#2a2823",
      "code-bg": "#0e0d0c",
      "scrim": "rgba(0, 0, 0, 0.55)",
      "syn-plain": "#ede9e1",
      "syn-kw": "#c7a6f2",
      "syn-str": "#e8c07d",
      "syn-num": "#f0b27a",
      "syn-cmt": "#8c867a",
      "syn-type": "#8ec5f0",
      "syn-gutter": "#7d776c",
      "file-code": "#8ec5f0",
      "file-data": "#e8c07d",
      "link-hover": "#a6e6ca"
    },
    light: {
      "bg": "#faf8f4",
      "surface": "#ffffff",
      "border": "#e3ded5",
      "divider": "#eeeae3",
      "border-strong": "#b9b2a6",
      "ink": "#1c1a17",
      "muted": "#6b655b",
      "accent": "#1f7a5a",
      "on-accent": "#ffffff",
      "accent-soft": "#dcefe6",
      "accent-ink": "#17664a",
      "ring": "rgba(31, 122, 90, 0.16)",
      "error-ink": "#b3261e",
      "icon-shadow": "0 10px 24px rgba(28, 26, 23, 0.18)",
      "icon-shadow-lg": "0 18px 40px rgba(28, 26, 23, 0.22)",
      "bubble": "#ece8e0",
      "code-bg": "#ffffff",
      "scrim": "rgba(28, 26, 23, 0.32)",
      "syn-plain": "#1c1a17",
      "syn-kw": "#7a3eb8",
      "syn-str": "#8a5a00",
      "syn-num": "#a04b15",
      "syn-cmt": "#6b655b",
      "syn-type": "#1f5f9e",
      "syn-gutter": "#8c867a",
      "file-code": "#2f6fa8",
      "file-data": "#9a6200",
      "link-hover": "#17664a"
    }
  };
  var PHONE_SHADOW_LIMITS = { offset: 32, blur: 80, spread: 8 };
  var PHONE_CONTRAST_PAIRS = [
    ["ink", "bg", 4.5],
    ["ink", "surface", 4.5],
    ["on-accent", "accent", 4.5],
    ["muted", "bg", 3]
  ];
  var OPAQUE = ["bg", "surface", "ink", "muted", "accent", "on-accent"];
  var PHONE_PREVIEW_VARIABLES = ["bg", "bubble", "surface", "border", "border-strong", "accent"];
  var PHONE_RENDERERS = {
    /** A Markdown file as the page it makes. */
    markdown: {},
    /** Separated values as rows of cards: the separator ('auto': a tab for .tsv, a comma otherwise), whether the first row names the columns. */
    table: { separator: ["auto", ",", "	", ";", "|"], header: "boolean" }
  };
  var isRecord = (value) => typeof value === "object" && value !== null && !Array.isArray(value);
  var PART_ID = /^[a-z0-9][a-z0-9-]{0,31}$/;
  var EXTENSION = /^[a-z0-9][a-z0-9+_-]{0,15}$/;
  var SHA256 = /^[0-9a-f]{64}$/;
  var textOf = (value, max) => typeof value === "string" && value.trim() && value.trim().length <= max ? value.trim() : void 0;
  var isHttpsUrl = (value) => {
    if (typeof value !== "string" || value.length > 300) {
      return false;
    }
    try {
      return new URL(value).protocol === "https:";
    } catch {
      return false;
    }
  };
  function phoneWordsOf(value, max, where, problems) {
    const en = textOf(isRecord(value) ? value.en : value, max);
    if (!en) {
      return void 0;
    }
    const words = { en };
    if (isRecord(value)) {
      for (const lang of ["zh", "ja", "ko"]) {
        const raw = value[PHONE_LOCALES[lang]];
        if (raw === void 0) {
          continue;
        }
        const text = textOf(raw, max);
        if (text) {
          words[lang] = text;
        } else {
          problems.push(`${where}: "${PHONE_LOCALES[lang]}" must be text of at most ${max} characters`);
        }
      }
    }
    return words;
  }
  function namedOf(raw, problems) {
    const l10n = isRecord(raw.l10n) ? raw.l10n : {};
    const field = (key, max) => phoneWordsOf({
      en: raw[key],
      ...Object.fromEntries(["zh", "ja", "ko"].flatMap((lang) => {
        const translated = l10n[PHONE_LOCALES[lang]];
        return isRecord(translated) && translated[key] !== void 0 ? [[PHONE_LOCALES[lang], translated[key]]] : [];
      }))
    }, max, key, problems);
    return { name: field("displayName", PHONE_PLUGIN_LIMITS.nameChars), description: field("description", PHONE_PLUGIN_LIMITS.descriptionChars) };
  }
  function isPhonePaletteValue(name, value) {
    const kind = Object.prototype.hasOwnProperty.call(PHONE_THEME_VARIABLES, name) ? PHONE_THEME_VARIABLES[name] : void 0;
    if (!kind || typeof value !== "string" || value.length > PHONE_PLUGIN_LIMITS.valueChars) {
      return false;
    }
    const v = value.trim();
    if (!v || UNSAFE_CSS.test(v) || /var\(|env\(/i.test(v)) {
      return false;
    }
    const isColour = (part) => LITERAL_COLOR.test(part) && parseCssColor(part) !== void 0;
    return kind === "colour" ? isColour(v) : isShadow(v, isColour, PHONE_SHADOW_LIMITS);
  }
  var effectivePalette = (theme) => ({ ...PHONE_BASE_PALETTES[theme.base], ...theme.palette });
  function paletteProblems(theme) {
    const palette = effectivePalette(theme);
    const problems = [];
    const colours = /* @__PURE__ */ new Map();
    for (const name of OPAQUE) {
      const colour = parseCssColor(palette[name]);
      if (!colour || colour[3] < 1) {
        problems.push(`"${name}" must be a colour nothing shows through`);
      } else {
        colours.set(name, colour);
      }
    }
    for (const [text, ground, least] of PHONE_CONTRAST_PAIRS) {
      const a = colours.get(text) ?? parseCssColor(palette[text]);
      const b = colours.get(ground);
      if (a && b) {
        const ratio = contrastRatio(a, b);
        if (ratio < least) {
          problems.push(`"${text}" on "${ground}" reads at ${ratio.toFixed(2)}:1, under ${least}:1`);
        }
      }
    }
    return problems;
  }
  function themeOf(raw, where, problems) {
    if (!isRecord(raw)) {
      problems.push(`${where}: not an object`);
      return void 0;
    }
    const id = typeof raw.id === "string" && PART_ID.test(raw.id) ? raw.id : void 0;
    const at = id ? `theme "${id}"` : where;
    const name = phoneWordsOf(raw.name, PHONE_PLUGIN_LIMITS.nameChars, `${at} name`, problems);
    const base = raw.base === "dark" || raw.base === "light" ? raw.base : void 0;
    if (!id || !name || !base || !isRecord(raw.palette)) {
      problems.push(`${at}: needs an "id" (a-z, 0-9, -), a "name", a "base" ("dark" or "light") and a "palette"`);
      return void 0;
    }
    const palette = {};
    for (const [key, value] of Object.entries(raw.palette)) {
      if (!Object.prototype.hasOwnProperty.call(PHONE_THEME_VARIABLES, key)) {
        problems.push(`${at}: "${key}" is not a variable of the app's themes`);
      } else if (!isPhonePaletteValue(key, value)) {
        problems.push(`${at}: "${key}" must be ${PHONE_THEME_VARIABLES[key] === "colour" ? "a colour written out (#rgb, #rrggbb, rgb(), hsl())" : "a shadow of at most 3 layers in px with colours written out"}, at most ${PHONE_PLUGIN_LIMITS.valueChars} characters`);
      } else {
        palette[key] = value.trim();
      }
    }
    const unreadable = paletteProblems({ base, palette });
    if (unreadable.length) {
      problems.push(...unreadable.map((problem) => `${at} is left out: ${problem}`));
      return void 0;
    }
    return { id, name, base, palette };
  }
  function optionsOf(renderer, raw, at, problems) {
    if (raw === void 0) {
      return {};
    }
    if (!isRecord(raw)) {
      problems.push(`${at}: "options" must be an object`);
      return void 0;
    }
    if (renderer === "markdown") {
      return {};
    }
    const options = {};
    if (raw.separator !== void 0) {
      if (!PHONE_RENDERERS.table.separator.includes(raw.separator)) {
        problems.push(`${at}: "separator" must be one of "auto", ",", "\\t", ";", "|"`);
        return void 0;
      }
      options.separator = raw.separator;
    }
    if (raw.header !== void 0) {
      if (typeof raw.header !== "boolean") {
        problems.push(`${at}: "header" must be true or false`);
        return void 0;
      }
      options.header = raw.header;
    }
    return options;
  }
  function viewerOf(raw, where, problems) {
    if (!isRecord(raw)) {
      problems.push(`${where}: not an object`);
      return void 0;
    }
    const id = typeof raw.id === "string" && PART_ID.test(raw.id) ? raw.id : void 0;
    const at = id ? `viewer "${id}"` : where;
    const renderer = typeof raw.renderer === "string" && Object.prototype.hasOwnProperty.call(PHONE_RENDERERS, raw.renderer) ? raw.renderer : void 0;
    if (!id || !renderer) {
      problems.push(`${at}: needs an "id" (a-z, 0-9, -) and a "renderer" the app has (${Object.keys(PHONE_RENDERERS).join(", ")})`);
      return void 0;
    }
    const extensions = [...new Set((Array.isArray(raw.extensions) ? raw.extensions : []).map((e) => typeof e === "string" ? e.trim().toLowerCase().replace(/^\./, "") : ""))];
    const bad = extensions.filter((e) => !EXTENSION.test(e));
    if (!extensions.length || bad.length || extensions.length > PHONE_PLUGIN_LIMITS.extensions) {
      problems.push(`${at}: "extensions" must list 1 to ${PHONE_PLUGIN_LIMITS.extensions} file extensions ("md", "csv")`);
      return void 0;
    }
    const options = optionsOf(renderer, raw.options, at, problems);
    if (!options) {
      return void 0;
    }
    const name = raw.name === void 0 ? void 0 : phoneWordsOf(raw.name, PHONE_PLUGIN_LIMITS.nameChars, `${at} name`, problems);
    return { id, renderer, extensions, options, ...name ? { name } : {} };
  }
  function listOf(raw, key, max, problems, read) {
    if (raw === void 0) {
      return [];
    }
    if (!Array.isArray(raw)) {
      problems.push(`"${key}" must be a list`);
      return [];
    }
    if (raw.length > max) {
      problems.push(`"${key}": only the first ${max} are read`);
    }
    const out = [];
    raw.slice(0, max).forEach((item, i) => {
      const entry = read(item, `${key}[${i}]`, problems);
      if (entry && out.some((other) => other.id === entry.id)) {
        problems.push(`${key}[${i}]: "${entry.id}" is there twice`);
      } else if (entry) {
        out.push(entry);
      }
    });
    return out;
  }
  function parsePhonePluginManifest(raw) {
    if (!isRecord(raw)) {
      return { reason: "the manifest is not a JSON object", code: "invalid" };
    }
    const id = typeof raw.id === "string" ? raw.id.trim().toLowerCase() : "";
    if (!isValidPluginId(id)) {
      return { reason: `"id" must be publisher.name (a-z, 0-9, -), not ${JSON.stringify(raw.id)}`, code: "invalid" };
    }
    const version = typeof raw.version === "string" ? raw.version.trim() : "";
    if (!isValidVersion(version)) {
      return { reason: `${id}: "version" must be like 1.0.0`, code: "invalid" };
    }
    const phoneApi = raw.phoneApi;
    if (typeof phoneApi !== "number" || !Number.isInteger(phoneApi) || phoneApi < 1) {
      return { reason: `${id}: "phoneApi" must be ${PHONE_PLUGIN_API}`, code: "invalid" };
    }
    if (phoneApi > PHONE_PLUGIN_API) {
      return { reason: `${id} needs a newer version of the app (phoneApi ${phoneApi})`, code: "newer" };
    }
    const problems = [];
    const { name, description } = namedOf(raw, problems);
    if (!name || !description) {
      return { reason: `${id}: needs a "displayName" of at most ${PHONE_PLUGIN_LIMITS.nameChars} characters and a "description" of at most ${PHONE_PLUGIN_LIMITS.descriptionChars}`, code: "invalid" };
    }
    const authorName = isRecord(raw.author) ? textOf(raw.author.name, 100) : textOf(raw.author, 100);
    const authorUrl = isRecord(raw.author) && isHttpsUrl(raw.author.url) ? raw.author.url : void 0;
    const license = textOf(raw.license, 100);
    if (raw.onByDefault !== void 0 && typeof raw.onByDefault !== "boolean") {
      problems.push('"onByDefault" must be true or false');
    }
    const themes = listOf(raw.themes, "themes", PHONE_PLUGIN_LIMITS.themes, problems, themeOf);
    const viewers = listOf(raw.viewers, "viewers", PHONE_PLUGIN_LIMITS.viewers, problems, viewerOf);
    if (!themes.length && !viewers.length) {
      return { reason: `${id} adds nothing the app can use${problems.length ? `: ${problems.join("; ")}` : ""}`, code: "invalid" };
    }
    return {
      manifest: {
        id,
        version,
        phoneApi,
        name,
        description,
        ...authorName ? { author: { name: authorName, ...authorUrl ? { url: authorUrl } : {} } } : {},
        ...license ? { license } : {},
        onByDefault: raw.onByDefault === true,
        themes,
        viewers
      },
      problems
    };
  }
  var writtenWords = (words) => Object.fromEntries(Object.keys(PHONE_LOCALES).flatMap((lang) => words[lang] ? [[PHONE_LOCALES[lang], words[lang]]] : []));
  function addsOf(manifest) {
    return {
      themes: manifest.themes.map((theme) => {
        const palette = effectivePalette(theme);
        return { id: theme.id, name: writtenWords(theme.name), base: theme.base, preview: Object.fromEntries(PHONE_PREVIEW_VARIABLES.map((key) => [key, palette[key]])) };
      }),
      viewers: manifest.viewers.map((viewer) => ({ id: viewer.id, renderer: viewer.renderer, extensions: viewer.extensions }))
    };
  }
  var isPhoneMarketPath = (path) => isSafeMarketPath(path) && path.startsWith("phone/") && /\.(json|md)$/.test(path);
  var isPhoneReadableMarketPath = (path) => isPhoneMarketPath(path) || path === BREEZELL_MARKET_BLOCKLIST_PATH;
  var PHONE_MARKET_INDEX_PATH = "phone/index.json";
  var listText = (value, max, chars) => Array.isArray(value) ? value.flatMap((v) => textOf(v, chars) ?? []).slice(0, max) : [];
  function parsePhoneMarketEntry(raw) {
    if (!isRecord(raw)) {
      return { reason: "not an object" };
    }
    const id = typeof raw.id === "string" ? raw.id.toLowerCase() : "";
    if (!isValidPluginId(id)) {
      return { reason: `invalid id ${JSON.stringify(raw.id)}` };
    }
    const version = typeof raw.version === "string" ? raw.version : "";
    const phoneApi = raw.phoneApi;
    if (!isValidVersion(version) || typeof phoneApi !== "number" || !Number.isInteger(phoneApi) || phoneApi < 1) {
      return { reason: `${id}: invalid version or phoneApi` };
    }
    const pkg = raw.package;
    if (!isRecord(pkg) || typeof pkg.path !== "string" || !isPhoneMarketPath(pkg.path) || !pkg.path.endsWith(".json") || typeof pkg.sha256 !== "string" || !SHA256.test(pkg.sha256) || typeof pkg.size !== "number" || !Number.isInteger(pkg.size) || pkg.size <= 0 || pkg.size > PHONE_PLUGIN_LIMITS.manifestBytes) {
      return { reason: `${id}: invalid package` };
    }
    const problems = [];
    const { name, description } = namedOf(raw, problems);
    const author = isRecord(raw.author) ? textOf(raw.author.name, 100) : void 0;
    const updatedAt = textOf(raw.updatedAt, 40);
    if (!name || !description || !author || !updatedAt) {
      return { reason: `${id}: needs a displayName, a description, an author and updatedAt` };
    }
    const authorUrl = isRecord(raw.author) && isHttpsUrl(raw.author.url) ? raw.author.url : void 0;
    const license = textOf(raw.license, 100);
    const readme = typeof raw.readme === "string" && isPhoneMarketPath(raw.readme) ? raw.readme : void 0;
    const readmes = {};
    for (const lang of ["zh", "ja", "ko"]) {
      const path = isRecord(raw.readmes) ? raw.readmes[PHONE_LOCALES[lang]] : void 0;
      if (typeof path === "string" && isPhoneMarketPath(path)) {
        readmes[lang] = path;
      }
    }
    const rawAdds = isRecord(raw.adds) ? raw.adds : {};
    const themes = (Array.isArray(rawAdds.themes) ? rawAdds.themes : []).slice(0, PHONE_PLUGIN_LIMITS.themes).flatMap((theme) => {
      if (!isRecord(theme) || typeof theme.id !== "string" || !PART_ID.test(theme.id) || theme.base !== "dark" && theme.base !== "light" || !isRecord(theme.preview)) {
        return [];
      }
      const words = phoneWordsOf(theme.name, PHONE_PLUGIN_LIMITS.nameChars, `${id} theme name`, problems);
      const preview = theme.preview;
      if (!words || !PHONE_PREVIEW_VARIABLES.every((key) => isPhonePaletteValue(key, preview[key]))) {
        return [];
      }
      return [{ id: theme.id, name: words, base: theme.base, preview: Object.fromEntries(PHONE_PREVIEW_VARIABLES.map((key) => [key, String(preview[key]).trim()])) }];
    });
    const viewers = (Array.isArray(rawAdds.viewers) ? rawAdds.viewers : []).slice(0, PHONE_PLUGIN_LIMITS.viewers).flatMap((viewer) => {
      if (!isRecord(viewer) || typeof viewer.id !== "string" || !PART_ID.test(viewer.id) || typeof viewer.renderer !== "string" || !Object.prototype.hasOwnProperty.call(PHONE_RENDERERS, viewer.renderer)) {
        return [];
      }
      const extensions = listText(viewer.extensions, PHONE_PLUGIN_LIMITS.extensions, 16).filter((e) => EXTENSION.test(e));
      return extensions.length ? [{ id: viewer.id, renderer: viewer.renderer, extensions }] : [];
    });
    return {
      entry: {
        id,
        version,
        phoneApi,
        name,
        description,
        categories: listText(raw.categories, 6, 40),
        tags: listText(raw.tags, 12, 40),
        author: { name: author, ...authorUrl ? { url: authorUrl } : {} },
        ...license ? { license } : {},
        ...readme ? { readme } : {},
        ...Object.keys(readmes).length ? { readmes } : {},
        adds: { themes, viewers },
        package: { path: pkg.path, sha256: pkg.sha256, size: pkg.size },
        updatedAt
      }
    };
  }
  function parsePhoneMarketIndex(raw) {
    if (!isRecord(raw) || raw.schemaVersion !== 1 || !Array.isArray(raw.plugins)) {
      return { error: 'the phone index is not schemaVersion 1 with a "plugins" list' };
    }
    const updatedAt = textOf(raw.updatedAt, 40) ?? "";
    const plugins = [];
    const skipped = [];
    for (const item of raw.plugins.slice(0, 1e3)) {
      const parsed = parsePhoneMarketEntry(item);
      if ("reason" in parsed) {
        skipped.push(parsed.reason);
      } else if (plugins.some((entry) => entry.id === parsed.entry.id)) {
        skipped.push(`${parsed.entry.id}: listed twice`);
      } else {
        plugins.push(parsed.entry);
      }
    }
    return { index: { schemaVersion: 1, updatedAt, plugins }, skipped };
  }
  var phoneReadmeOf = (entry, lang) => (lang !== "en" ? entry.readmes?.[lang] : void 0) ?? entry.readme;
  function phonePluginBlock(blocks, id, version) {
    const lower = id.toLowerCase();
    const publisher = lower.split(".")[0];
    return blocks.find((block) => (block.id !== void 0 ? block.id === lower : block.publisher === publisher) && (!block.versions || block.versions.includes(version)));
  }
  var phoneBlockReason = (block, lang) => (lang !== "en" ? block.l10n?.[PHONE_LOCALES[lang]] : void 0) ?? block.reason;
  return __toCommonJS(phone_plugin_rules_exports);
})();
// ---- end of the generated phone plugin rules ----

/** A phone plugin's manifest, in its folder. */
const PHONE_MANIFEST = 'phone-plugin.json';

/**
 * A phone plugin's manifest read with the phone app's own rules (PHONE_PLUGIN): the market takes none that the app
 * would leave anything out of, so every problem fails here.
 */
function readPhoneManifest(file) {
	if (!fs.existsSync(file)) {
		fail(`${file} not found: a phone plugin is one ${PHONE_MANIFEST} (run "init --template phone" to start one)`);
	}
	const bytes = fs.readFileSync(file);
	if (bytes.length > PHONE_PLUGIN.PHONE_PLUGIN_LIMITS.manifestBytes) {
		fail(`${file} is ${bytes.length} bytes: a phone plugin's manifest is at most ${PHONE_PLUGIN.PHONE_PLUGIN_LIMITS.manifestBytes}`);
	}
	let raw;
	try {
		raw = JSON.parse(bytes.toString('utf8'));
	} catch (err) {
		fail(`${file} is not JSON: ${err.message}`);
	}
	const parsed = PHONE_PLUGIN.parsePhonePluginManifest(raw);
	if ('reason' in parsed) {
		fail(`${file}: ${parsed.reason}`);
	}
	if (parsed.problems.length) {
		fail(`${file}:\n  - ${parsed.problems.join('\n  - ')}`);
	}
	if (raw.id !== parsed.manifest.id) {
		fail(`${file}: write "id" as ${parsed.manifest.id} (lower case)`);
	}
	return { bytes, raw, manifest: parsed.manifest };
}

/** A phone plugin's categories and tags, as written in its manifest (the market lists them; the app reads neither). */
const phoneListOf = (value, max) => (Array.isArray(value) ? value.filter(v => typeof v === 'string' && v.trim() && v.length <= 40).map(v => v.trim()).slice(0, max) : []);

function phoneValidate(dir) {
	const { manifest } = readPhoneManifest(path.join(dir, PHONE_MANIFEST));
	if (!fs.existsSync(path.join(dir, 'README.md'))) {
		log('warning: no README.md: the market shows it on the plugin\'s page');
	}
	const adds = [...manifest.themes.map(theme => `theme ${theme.id} (over ${theme.base})`), ...manifest.viewers.map(viewer => `${viewer.renderer} viewer for ${viewer.extensions.map(e => `.${e}`).join(' ')}`)];
	log(`${PHONE_MANIFEST} is fine: ${manifest.id} ${manifest.version} adds ${adds.join(', ')}`);
}

function phoneSubmit(dir, flags) {
	if (typeof flags.market !== 'string') {
		fail('--market <path> is required: a clone of your fork of BreezellCode/BreezellCode');
	}
	const marketRoot = path.resolve(flags.market, 'plugins');
	if (!fs.existsSync(path.join(marketRoot, 'index.json'))) {
		fail(`${marketRoot} has no index.json: is --market a clone of BreezellCode/BreezellCode?`);
	}
	const { bytes, raw, manifest } = readPhoneManifest(path.join(dir, PHONE_MANIFEST));
	const { id, version } = manifest;
	// one namespace and one blocklist for both kinds
	if (fs.existsSync(path.join(marketRoot, 'packages', id))) {
		fail(`${id} is a Breezell plugin's id in the market: a phone plugin needs an id of its own`);
	}
	const relPackage = `phone/packages/${id}/${version}/${id}-${version}.json`;
	const target = path.join(marketRoot, relPackage);
	const digest = sha256(bytes);
	if (fs.existsSync(target) && sha256(fs.readFileSync(target)) !== digest) {
		fail(`${id} ${version} is already in the market with other contents: published versions do not change, raise "version"`);
	}
	const metaFile = path.join(marketRoot, 'phone', 'packages', id, 'plugin.json');
	const previous = fs.existsSync(metaFile) ? readJson(metaFile) : undefined;
	if (previous && previous.versions?.some(v => compareVersions(v.version, version) > 0)) {
		fail(`${id} already has a newer version than ${version} in the market`);
	}
	fs.mkdirSync(path.dirname(target), { recursive: true });
	fs.writeFileSync(target, bytes);
	let readme;
	if (fs.existsSync(path.join(dir, 'README.md'))) {
		readme = `phone/packages/${id}/README.md`;
		fs.copyFileSync(path.join(dir, 'README.md'), path.join(marketRoot, readme));
	}
	const readmes = {};
	for (const locale of README_LOCALES) {
		const source = translationFile(dir, `README.${locale}.md`);
		if (source) {
			readmes[locale] = `phone/packages/${id}/${TRANSLATIONS_DIR}/README.${locale}.md`;
			fs.mkdirSync(path.join(marketRoot, 'phone', 'packages', id, TRANSLATIONS_DIR), { recursive: true });
			fs.copyFileSync(source, path.join(marketRoot, readmes[locale]));
		}
	}
	const l10n = {};
	for (const [locale, text] of Object.entries(raw.l10n ?? {})) {
		if (README_LOCALES.includes(locale) && text && typeof text === 'object') {
			const words = Object.fromEntries(['displayName', 'description'].filter(key => typeof text[key] === 'string' && text[key].trim()).map(key => [key, text[key].trim()]));
			if (Object.keys(words).length) {
				l10n[locale] = words;
			}
		}
	}
	const versions = (previous?.versions ?? []).filter(v => v.version !== version);
	versions.push({ version, path: relPackage, sha256: digest, size: bytes.length, phoneApi: manifest.phoneApi, adds: PHONE_PLUGIN.addsOf(manifest), publishedAt: new Date().toISOString() });
	versions.sort((a, b) => compareVersions(b.version, a.version));
	writeJson(metaFile, {
		id,
		displayName: raw.displayName.trim(),
		description: raw.description.trim(),
		categories: phoneListOf(raw.categories, 6).length ? phoneListOf(raw.categories, 6) : [manifest.themes.length ? 'Themes' : 'Viewers'],
		tags: phoneListOf(raw.tags, 12),
		author: manifest.author ?? { name: id.split('.')[0] },
		license: manifest.license,
		readme,
		readmes: Object.keys(readmes).length ? readmes : undefined,
		l10n: Object.keys(l10n).length ? l10n : undefined,
		versions,
	});
	writeJson(path.join(marketRoot, PHONE_PLUGIN.PHONE_MARKET_INDEX_PATH), buildPhoneIndex(marketRoot));
	log(`added the phone plugin ${id} ${version} to ${marketRoot}`);
	log('next, in the market clone:');
	log(`  git checkout -b phone/${id}-${version}`);
	log(`  git add plugins && git commit -m "Phone plugin: ${id} ${version}"`);
	log('  git push, then open a pull request to BreezellCode/BreezellCode');
}

/** plugins/phone/index.json, from every phone/packages/<id>/plugin.json: each plugin at its newest version. */
function buildPhoneIndex(marketRoot) {
	const packagesDir = path.join(marketRoot, 'phone', 'packages');
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
			l10n: meta.l10n && Object.keys(meta.l10n).length ? meta.l10n : undefined,
			version: latest.version,
			phoneApi: latest.phoneApi,
			categories: meta.categories ?? [],
			tags: meta.tags ?? [],
			author: meta.author,
			license: meta.license,
			readme: meta.readme,
			readmes: meta.readmes && Object.keys(meta.readmes).length ? meta.readmes : undefined,
			adds: latest.adds,
			package: { path: latest.path, sha256: latest.sha256, size: latest.size },
			updatedAt: latest.publishedAt,
		});
	}
	const updatedAt = plugins.map(p => p.updatedAt).sort().pop() ?? '1970-01-01T00:00:00.000Z';
	return { schemaVersion: 1, updatedAt, plugins };
}

/**
 * Every phone plugin matches its plugin.json and reads with the phone app's rules with nothing left out, its id is
 * not a Breezell plugin's, its card colours are its manifest's, and phone/index.json is what buildPhoneIndex makes.
 */
function checkPhoneMarket(marketRoot) {
	const indexFile = path.join(marketRoot, PHONE_PLUGIN.PHONE_MARKET_INDEX_PATH);
	if (!fs.existsSync(path.join(marketRoot, 'phone'))) {
		return [];
	}
	const problems = [];
	const index = buildPhoneIndex(marketRoot);
	for (const entry of index.plugins) {
		const where = `phone ${entry.id}@${entry.version}`;
		if (!PHONE_PLUGIN.isValidPluginId(entry.id)) {
			problems.push(`${where}: bad id`);
			continue;
		}
		if (fs.existsSync(path.join(marketRoot, 'packages', entry.id))) {
			problems.push(`${where}: a Breezell plugin of the market has this id`);
		}
		for (const [locale] of Object.entries(entry.readmes ?? {}).filter(([l]) => !README_LOCALES.includes(l))) {
			problems.push(`${where}: unknown README locale ${locale}`);
		}
		for (const rel of [entry.package.path, entry.readme, ...Object.values(entry.readmes ?? {})].filter(Boolean)) {
			if (!PHONE_PLUGIN.isPhoneMarketPath(rel) || !fs.existsSync(path.join(marketRoot, rel))) {
				problems.push(`${where}: missing or unsafe path ${rel}`);
			}
		}
		const listed = PHONE_PLUGIN.parsePhoneMarketEntry(entry);
		if ('reason' in listed) {
			problems.push(`${where}: the phone app would not list it: ${listed.reason}`);
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
		let parsed;
		try {
			parsed = PHONE_PLUGIN.parsePhonePluginManifest(JSON.parse(bytes.toString('utf8')));
		} catch (err) {
			problems.push(`${where}: the manifest is not JSON: ${err.message}`);
			continue;
		}
		if ('reason' in parsed) {
			problems.push(`${where}: ${parsed.reason}`);
			continue;
		}
		parsed.problems.forEach(p => problems.push(`${where}: ${p}`));
		if (parsed.manifest.id !== entry.id || parsed.manifest.version !== entry.version || parsed.manifest.phoneApi !== entry.phoneApi) {
			problems.push(`${where}: the manifest says ${parsed.manifest.id}@${parsed.manifest.version} (phoneApi ${parsed.manifest.phoneApi})`);
		}
		if (JSON.stringify(PHONE_PLUGIN.addsOf(parsed.manifest)) !== JSON.stringify(entry.adds)) {
			problems.push(`${where}: "adds" differs from what the manifest adds`);
		}
	}
	if (!fs.existsSync(indexFile) || JSON.stringify(readJson(indexFile)) !== JSON.stringify(index)) {
		problems.push(`${PHONE_PLUGIN.PHONE_MARKET_INDEX_PATH} is not up to date: run "node plugins/devkit/breezell-plugin.mjs index plugins"`);
	}
	return problems;
}

/** A phone plugin to start from: its manifest, a README, and this devkit to check it with. */
function initPhone(target, values) {
	const files = {
		[PHONE_MANIFEST]: `${JSON.stringify({
			id: values.id,
			version: '0.1.0',
			phoneApi: PHONE_PLUGIN.PHONE_PLUGIN_API,
			displayName: values.displayName,
			description: values.description || 'A theme for the Breezell phone app.',
			author: { name: values.publisher },
			license: 'MIT',
			themes: [{ id: 'night', name: { en: `${values.displayName} night` }, base: 'dark', palette: { bg: '#10141c', surface: '#171d28', border: '#263041', 'border-strong': '#475569', ink: '#e8edf5', muted: '#9aa7bb', accent: '#7cb7ff', 'on-accent': '#0b1220', 'accent-soft': '#1c2a40', 'accent-ink': '#9cc8ff', bubble: '#1c2433' } }],
		}, null, '\t')}\n`,
		'README.md': `# ${values.displayName}\n\n${values.description || 'A theme for the Breezell phone app.'}\n\nA phone plugin is data: the phone app draws the colours and previews it names, no code of it runs. See plugins/docs/phone.md in BreezellCode/BreezellCode.\n\nCheck it with \`node tools/breezell-plugin.mjs phone-validate\`.\n`,
		'tools/breezell-plugin.mjs': fs.readFileSync(SELF, 'utf8'),
	};
	for (const [rel, content] of Object.entries(files)) {
		const file = path.join(target, ...rel.split('/'));
		fs.mkdirSync(path.dirname(file), { recursive: true });
		fs.writeFileSync(file, content);
	}
	log(`created the phone plugin ${values.id} in ${target}`);
	log(`next: edit ${PHONE_MANIFEST}, then node tools/breezell-plugin.mjs phone-validate`);
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
	// The skill for AI assistants, with the guide (plugins/docs) as its references. Links out of the guide
	// point at GitHub, since the rest of the market is not in a new plugin.
	const skill = '.agents/skills/breezell-plugin';
	const docs = path.join(DEVKIT_DIR, '..', 'docs');
	if (!fs.existsSync(path.join(DEVKIT_DIR, 'skill', 'SKILL.md')) || !fs.existsSync(docs)) {
		fail('devkit/skill/SKILL.md or docs/ is missing: run this from the market\'s plugins/devkit');
	}
	shared[`${skill}/SKILL.md`] = fs.readFileSync(path.join(DEVKIT_DIR, 'skill', 'SKILL.md'), 'utf8');
	for (const name of fs.readdirSync(docs).filter(n => n.endsWith('.md')).sort()) {
		shared[`${skill}/references/${name}`] = fs.readFileSync(path.join(docs, name), 'utf8').replace(/\]\(\.\.\//g, `](${GITHUB_PLUGINS_URL}`);
	}
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
	const target = path.resolve(dir ?? name);
	if (fs.existsSync(target) && fs.readdirSync(target).length && !flags.force) {
		fail(`${target} is not empty (use --force to write into it)`);
	}
	const values = { publisher, name, id: `${publisher}.${name}`, displayName, description, source, apiVersion: String(API_VERSION) };
	// a phone plugin is a manifest, not an extension: none of the templates' files
	if (flags.template === 'phone') {
		return initPhone(target, values);
	}
	const set = templateSet() ?? await fetchTemplateSet();
	const templateId = typeof flags.template === 'string' ? flags.template : 'webview';
	const template = set.templates[templateId];
	if (!template) {
		fail(`unknown template "${templateId}" (${[...Object.keys(set.templates), 'phone'].join(', ')})`);
	}
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
             [--template webview|ai|blank|phone] [--source open|closed]
  build [dir] [--closed] [--watch]
  validate [dir]
  pack [dir] --open | --closed [--out <folder>]
  submit [dir] --market <clone of BreezellCode/BreezellCode> [--vsix <file>]
  phone-validate [dir]
  phone-submit [dir] --market <clone of BreezellCode/BreezellCode>
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
		case 'phone-validate':
			return phoneValidate(dir);
		case 'phone-submit':
			return phoneSubmit(dir, flags);
		case 'index': {
			if (!positional[0]) {
				fail('index <market plugins folder>');
			}
			if (flags.check) {
				const { problems, count } = checkMarket(dir);
				problems.push(...checkPhoneMarket(dir));
				if (problems.length) {
					fail(`market check failed:\n  - ${problems.join('\n  - ')}`);
				}
				const phone = buildPhoneIndex(dir).plugins.length;
				return log(`market is consistent: ${count} plugins${phone ? `, ${phone} phone plugins` : ''}`);
			}
			writeJson(path.join(dir, 'index.json'), buildIndex(dir));
			log(`wrote ${path.join(dir, 'index.json')}`);
			if (fs.existsSync(path.join(dir, 'phone'))) {
				writeJson(path.join(dir, PHONE_PLUGIN.PHONE_MARKET_INDEX_PATH), buildPhoneIndex(dir));
				log(`wrote ${path.join(dir, PHONE_PLUGIN.PHONE_MARKET_INDEX_PATH)}`);
			}
			return undefined;
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
