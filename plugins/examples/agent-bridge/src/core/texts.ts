/*
 * What every tile's page is made of, in Breezell's display language: the languages this plugin speaks, the status
 * Breezell draws (vscode.breezell.SignInStatus), a usage bar with when it resets, where the program is. Each agent's
 * own words are its texts.ts; the tile's own texts (title, switch, note, consent) are in package.json, where Breezell
 * reads them before the plugin runs.
 */
import { resetInstant, type UsageLine } from './limits';

export type LanguageKey = 'en' | 'zh-tw' | 'zh-cn';

/** `zh-TW`, `zh-HK`, `zh-Hant`: Traditional; other `zh`: Simplified; anything else: English. */
export function languageKey(language: string | undefined): LanguageKey {
	const l = (language ?? '').toLowerCase();
	if (/^zh-(tw|hk|mo|hant)/.test(l)) {
		return 'zh-tw';
	}
	return l.startsWith('zh') ? 'zh-cn' : 'en';
}

/** What Breezell shows on the tile's page (vscode.breezell.SignInStatus). */
export interface SignInStatus {
	readonly connected: boolean;
	readonly busy?: boolean;
	readonly detail?: string;
	readonly account?: readonly { readonly label: string; readonly value: string }[];
	readonly usage?: readonly { readonly label: string; readonly percent: number; readonly detail?: string }[];
}

/** A text with its `{name}`s filled in; one left empty takes the space and brackets around it along. */
export const fill = (text: string, values: Record<string, string | undefined>): string =>
	text.replace(/\{(\w+)\}/g, (_, name: string) => values[name] ?? '').replace(/\s+([，。（）])/g, '$1').replace(/（）/g, '').replace(/\(\)/g, '').replace(/\s{2,}/g, ' ').trim();

/** The texts a usage bar takes: how a reset is said, and the locale its time is written in. */
export interface ResetTexts {
	/** {time} */
	readonly resets: string;
	readonly locale: string;
}

/** When a limit resets, in this computer's time; as the agent wrote it when it cannot be read. */
export function resetText(raw: string, texts: ResetTexts, now: Date): string {
	const at = resetInstant(raw, now);
	const time = at ? at.toLocaleString(texts.locale, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : raw;
	return texts.resets.replace('{time}', time);
}

/** A limit's bar: its name in the page's language, how much is used, and when it resets. */
export function usageMeter(line: UsageLine, label: string, texts: ResetTexts, now: Date): { label: string; percent: number; detail?: string } {
	return { label: label.slice(0, 40), percent: line.percent, ...(line.resets ? { detail: resetText(line.resets, texts, now).slice(0, 120) } : {}) };
}

/**
 * Keeping the agents' programs between a conversation's messages (keepAlive.ts), in the page's language: the row on
 * each tile's page, and the choices of its button.
 */
export interface KeepAliveTexts {
	readonly label: string;
	readonly off: string;
	/** {minutes} */
	readonly on: string;
	/** {count} */
	readonly running: string;
	/** The choices: what each is called, and what the picker asks. */
	readonly title: string;
	readonly placeholder: string;
	readonly offChoice: string;
	readonly offDetail: string;
	/** {minutes} */
	readonly minutesChoice: string;
	readonly hourChoice: string;
	readonly custom: string;
	readonly customPrompt: string;
	/** {max} */
	readonly customInvalid: string;
	readonly current: string;
}

export const KEEP_ALIVE_TEXTS: Readonly<Record<LanguageKey, KeepAliveTexts>> = {
	'en': {
		label: 'Kept running',
		off: 'Off',
		on: 'Closed after {minutes} min idle',
		running: '{count} kept now',
		title: 'Keep agents running between messages',
		placeholder: 'Faster replies (Claude Code: about 1 s each), but each kept conversation holds about 200–300 MB of memory until it has been idle this long.',
		offChoice: 'Off',
		offDetail: 'Each message starts the agent anew (the default)',
		minutesChoice: '{minutes} minutes',
		hourChoice: '1 hour',
		custom: 'Other…',
		customPrompt: 'Minutes a conversation\'s agent may stay idle before it is closed (1–{max})',
		customInvalid: 'A whole number of minutes from 1 to {max}',
		current: 'current',
	},
	'zh-tw': {
		label: '常駐程序',
		off: '關閉',
		on: '閒置 {minutes} 分鐘後關閉',
		running: '目前保持 {count} 個',
		title: '訊息之間保持代理程式執行',
		placeholder: '回覆開始得比較快（Claude Code 每則約快 1 秒），但每個保持中的對話會一直佔用約 200–300 MB 記憶體，直到閒置這麼久才關閉。',
		offChoice: '關閉',
		offDetail: '每則訊息都重新啟動代理程式（預設）',
		minutesChoice: '{minutes} 分鐘',
		hourChoice: '1 小時',
		custom: '自訂…',
		customPrompt: '對話的代理程式閒置多少分鐘後關閉（1–{max}）',
		customInvalid: '請輸入 1 到 {max} 的整數分鐘',
		current: '目前',
	},
	'zh-cn': {
		label: '常驻进程',
		off: '关闭',
		on: '闲置 {minutes} 分钟后关闭',
		running: '当前保持 {count} 个',
		title: '消息之间保持代理程序运行',
		placeholder: '回复开始得更快（Claude Code 每条约快 1 秒），但每个保持中的对话会一直占用约 200–300 MB 内存，直到闲置这么久才关闭。',
		offChoice: '关闭',
		offDetail: '每条消息都重新启动代理程序（默认）',
		minutesChoice: '{minutes} 分钟',
		hourChoice: '1 小时',
		custom: '自定义…',
		customPrompt: '对话的代理程序闲置多少分钟后关闭（1–{max}）',
		customInvalid: '请输入 1 到 {max} 的整数分钟',
		current: '当前',
	},
};

/** The tile's row for it: off, or after how long idle a program is closed (and how many are kept now). */
export function keepAliveRow(minutes: number, kept: number, language: LanguageKey): { label: string; value: string } {
	const texts = KEEP_ALIVE_TEXTS[language];
	const value = minutes > 0 ? fill(texts.on, { minutes: String(minutes) }) : texts.off;
	return { label: texts.label, value: minutes > 0 && kept > 0 ? `${value} · ${fill(texts.running, { count: String(kept) })}` : value };
}

/** The program's place: its path, or the WSL distribution and the path inside it (`wslLocation`: {distro}, {path}). */
export function locationText(install: { readonly where: 'native' | 'wsl'; readonly location: string; readonly distro?: string }, wslLocation: string): string {
	return install.where === 'wsl' ? fill(wslLocation, { distro: install.distro ?? 'WSL', path: install.location }).replace(/^WSL \(WSL\): |^WSL（WSL）：/, 'WSL: ') : install.location;
}
