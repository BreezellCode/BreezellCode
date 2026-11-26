/*
 * The tiles' "Keep running between messages" button: how long a conversation's agent program may stay idle before it
 * is closed, or off (the default). One setting for every agent (keepAlive.ts).
 */
import * as vscode from 'vscode';
import { SECTION } from './bridge';
import { KEEP_ALIVE_MAX_MINUTES, KEEP_ALIVE_SETTING, keepAliveMs } from './keepAlive';
import { KEEP_ALIVE_TEXTS, fill, languageKey } from './texts';

/** The command of the tiles' button. */
export const KEEP_ALIVE_COMMAND = 'agentBridge.keepAlive.configure';
/** The times offered at once, in minutes; 0: off. */
export const KEEP_ALIVE_CHOICES = [0, 5, 15, 30, 60] as const;

/** A number of minutes the user typed: a whole number from 1 to KEEP_ALIVE_MAX_MINUTES, or none. */
export function minutesOf(text: string): number | undefined {
	const value = Number(text.trim());
	return Number.isInteger(value) && value >= 1 && value <= KEEP_ALIVE_MAX_MINUTES ? value : undefined;
}

/** Asks the user, and keeps what they chose (for every window: an application setting). */
export async function pickKeepAlive(): Promise<void> {
	const texts = KEEP_ALIVE_TEXTS[languageKey(vscode.breezell?.language || vscode.env.language)];
	const now = Math.round(keepAliveMs(vscode.workspace.getConfiguration(SECTION).get<number>(KEEP_ALIVE_SETTING, 0)) / 60_000);
	type Item = vscode.QuickPickItem & { readonly minutes?: number };
	const label = (minutes: number) => minutes === 0 ? texts.offChoice : minutes === 60 ? texts.hourChoice : fill(texts.minutesChoice, { minutes: String(minutes) });
	const items: Item[] = [
		...KEEP_ALIVE_CHOICES.map(minutes => ({ label: label(minutes), minutes, ...(minutes === 0 ? { detail: texts.offDetail } : {}), ...(minutes === now ? { description: texts.current } : {}) })),
		{ label: texts.custom, ...(!(KEEP_ALIVE_CHOICES as readonly number[]).includes(now) ? { description: `${texts.current}: ${label(now)}` } : {}) },
	];
	const picked = await vscode.window.showQuickPick(items, { title: texts.title, placeHolder: texts.placeholder });
	if (!picked) {
		return;
	}
	let minutes = picked.minutes;
	if (minutes === undefined) {
		const typed = await vscode.window.showInputBox({
			title: texts.title,
			prompt: fill(texts.customPrompt, { max: String(KEEP_ALIVE_MAX_MINUTES) }),
			value: now > 0 ? String(now) : '',
			validateInput: text => minutesOf(text) === undefined ? fill(texts.customInvalid, { max: String(KEEP_ALIVE_MAX_MINUTES) }) : undefined,
		});
		minutes = typed === undefined ? undefined : minutesOf(typed);
	}
	if (minutes !== undefined && minutes !== now) {
		await vscode.workspace.getConfiguration(SECTION).update(KEEP_ALIVE_SETTING, minutes, vscode.ConfigurationTarget.Global);
	}
}
