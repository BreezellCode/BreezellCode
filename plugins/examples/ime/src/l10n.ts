/**
 * The plugin's own texts, in Breezell's display language. That is Breezell's setting, which
 * vscode.env.language does not follow, so vscode.l10n would stay in English; this reads
 * media/l10n/bundle.l10n.<language>.json itself. The language: what the user chose on the settings
 * page, else Breezell's (vscode.breezell.language), else on a Breezell without it the editor's
 * or the system's.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as vscode from 'vscode';

let folder = '';
let bundle: Record<string, string> = {};
let shown = '';

function normalized(language: string): string {
	const l = language.toLowerCase();
	if (/^zh-(tw|hk|mo|hant)/.test(l)) {
		return 'zh-tw';
	}
	return l.startsWith('zh') ? 'zh-cn' : l.startsWith('pt') ? 'pt-br' : /^(ja|ko|ru|es)/.exec(l)?.[0] ?? 'en';
}

/** The language Breezell is in, as well as this Breezell says. */
export function appLanguage(): string {
	const breezell = vscode.breezell?.language;
	if (breezell) {
		return normalized(breezell);
	}
	const editor = vscode.env.language;
	return normalized(editor && editor !== 'en' ? editor : Intl.DateTimeFormat().resolvedOptions().locale);
}

/** The language the plugin's texts are in: the settings page's choice, else Breezell's. */
export function displayLanguage(): string {
	const chosen = vscode.workspace.getConfiguration('breezellIme').get<string>('displayLanguage', 'auto');
	return chosen && chosen !== 'auto' ? normalized(chosen) : appLanguage();
}

/** Reads the texts of the display language when it changed. True when it did. */
export function refreshL10n(extensionPath?: string): boolean {
	if (extensionPath) {
		folder = join(extensionPath, 'media', 'l10n');
	}
	const language = displayLanguage();
	if (language === shown) {
		return false;
	}
	shown = language;
	bundle = {};
	if (language !== 'en') {
		try {
			bundle = JSON.parse(readFileSync(join(folder, `bundle.l10n.${language}.json`), 'utf8')) as Record<string, string>;
		} catch {
			// No such file: English.
		}
	}
	return true;
}

export const l10n = {
	/** The text in the display language (the English is the key), with {0}… filled in. */
	t(message: string, ...args: (string | number)[]): string {
		return (bundle[message] ?? message).replace(/\{(\d+)\}/g, (m, i) => (args[Number(i)] !== undefined ? String(args[Number(i)]) : m));
	},
};
