/*
 * What Antigravity CLI's tile page says, in Breezell's display language: its connection, its version and models, and
 * its plan's limits (core/texts.ts has what every tile's page is made of).
 */
import { fill, locationText, usageMeter, type LanguageKey, type SignInStatus } from '../../core/texts';
import type { UsageLine } from '../../core/limits';
import type { AgyCheck } from './program';

/** What Antigravity CLI's tile says (its page and its conversations), in Breezell's display language. */
export interface AgyTexts {
	readonly notInstalled: string;
	/** Windows, where WSL was looked at too. */
	readonly notInstalledWindows: string;
	readonly wslLocation: string;
	/** {version}; {said}: saidAs, when agy said something when asked for its models. */
	readonly notSignedIn: string;
	/** What agy said, quoted: {said}. */
	readonly saidAs: string;
	readonly failed: string;
	readonly signedInWith: string;
	readonly googleAccount: string;
	readonly version: string;
	readonly location: string;
	readonly models: string;
	/** {count} */
	readonly modelCount: string;
	readonly notConnected: string;
	readonly entanglementNote: string;
	readonly folderUnreachable: string;
	/** Usage bars: a limit of a group of models, {limit} {group}. */
	readonly limitOf: string;
	readonly fiveHourLimit: string;
	readonly weeklyLimit: string;
	readonly geminiModels: string;
	readonly claudeGptModels: string;
	/** {time} */
	readonly resets: string;
	/** The locale a reset time is written in. */
	readonly locale: string;
}

export const AGY_TEXTS: Readonly<Record<LanguageKey, AgyTexts>> = {
	'en': {
		notInstalled: 'Antigravity CLI (agy) was not found on this computer. Install it from antigravity.google, run agy in a terminal and sign in with your Google account, then check again.',
		notInstalledWindows: 'Antigravity CLI (agy) was found neither in Windows nor in WSL. Install it in either from antigravity.google, run agy in its terminal and sign in with your Google account, then check again.',
		wslLocation: 'WSL ({distro}): {path}',
		notSignedIn: 'Antigravity CLI {version} is installed but not signed in. Run agy in a terminal and sign in with your Google account, then check again. {said}',
		saidAs: '(agy: {said})',
		failed: 'Could not read the status of Antigravity CLI: {message}',
		signedInWith: 'Signed in with',
		googleAccount: 'Google account',
		version: 'Antigravity CLI version',
		location: 'Program',
		models: 'Models',
		modelCount: '{count} available',
		notConnected: 'Antigravity CLI is not connected. Turn it on in Box › Models › Sign in, then send again.',
		entanglementNote: 'Antigravity CLI works in Agent mode here. Entanglement is a mode of Breezell\'s own models, so the Entanglement Dashboard does not apply.',
		folderUnreachable: 'The Antigravity CLI connected cannot work in this conversation\'s folder ({folder}). Install agy where the folder is (in WSL for a WSL folder), or open a folder of this computer.',
		limitOf: '{limit} ({group})',
		fiveHourLimit: '5-hour limit',
		weeklyLimit: 'Weekly limit',
		geminiModels: 'Gemini models',
		claudeGptModels: 'Claude and GPT models',
		resets: 'Resets {time}',
		locale: 'en-US',
	},
	'zh-tw': {
		notInstalled: '這台電腦上找不到 Antigravity CLI（agy）。請到 antigravity.google 安裝，在終端機執行 agy 並用 Google 帳號登入，再重新檢查。',
		notInstalledWindows: '在 Windows 和 WSL 中都找不到 Antigravity CLI（agy）。請到 antigravity.google 下載，在其中一邊安裝，在該處的終端機執行 agy 並用 Google 帳號登入，再重新檢查。',
		wslLocation: 'WSL（{distro}）：{path}',
		notSignedIn: '已找到 Antigravity CLI {version}，但尚未登入。請在終端機執行 agy，用 Google 帳號登入，再重新檢查。{said}',
		saidAs: '（agy：{said}）',
		failed: '無法讀取 Antigravity CLI 的狀態：{message}',
		signedInWith: '登入方式',
		googleAccount: 'Google 帳號',
		version: 'Antigravity CLI 版本',
		location: '程式位置',
		models: '模型',
		modelCount: '可用 {count} 個',
		notConnected: 'Antigravity CLI 尚未連接。請在 Box › 模型 › 帳號登入 中開啟後再送出。',
		entanglementNote: 'Antigravity CLI 在這裡以「代理」模式運作。「糾纏」是 Breezell 自己模型的模式，所以不會顯示糾纏模式面板。',
		folderUnreachable: '目前連接的 Antigravity CLI 無法在這個對話的資料夾（{folder}）中工作。請在資料夾所在的環境安裝 agy（WSL 資料夾就裝在 WSL 裡），或開啟這台電腦上的資料夾。',
		limitOf: '{limit}（{group}）',
		fiveHourLimit: '5 小時限額',
		weeklyLimit: '每週限額',
		geminiModels: 'Gemini 模型',
		claudeGptModels: 'Claude 與 GPT 模型',
		resets: '重設時間：{time}',
		locale: 'zh-TW',
	},
	'zh-cn': {
		notInstalled: '这台电脑上找不到 Antigravity CLI（agy）。请到 antigravity.google 安装，在终端执行 agy 并用 Google 账号登录，再重新检查。',
		notInstalledWindows: '在 Windows 和 WSL 中都找不到 Antigravity CLI（agy）。请到 antigravity.google 下载，在其中一边安装，在该处的终端执行 agy 并用 Google 账号登录，再重新检查。',
		wslLocation: 'WSL（{distro}）：{path}',
		notSignedIn: '已找到 Antigravity CLI {version}，但尚未登录。请在终端执行 agy，用 Google 账号登录，再重新检查。{said}',
		saidAs: '（agy：{said}）',
		failed: '无法读取 Antigravity CLI 的状态：{message}',
		signedInWith: '登录方式',
		googleAccount: 'Google 账号',
		version: 'Antigravity CLI 版本',
		location: '程序位置',
		models: '模型',
		modelCount: '可用 {count} 个',
		notConnected: 'Antigravity CLI 尚未连接。请在 Box › 模型 › 账号登录 中开启后再发送。',
		entanglementNote: 'Antigravity CLI 在这里以“代理”模式运行。“纠缠”是 Breezell 自己模型的模式，所以不会显示纠缠模式面板。',
		folderUnreachable: '当前连接的 Antigravity CLI 无法在这个对话的文件夹（{folder}）中工作。请在文件夹所在的环境安装 agy（WSL 文件夹就装在 WSL 里），或打开这台电脑上的文件夹。',
		limitOf: '{limit}（{group}）',
		fiveHourLimit: '5 小时限额',
		weeklyLimit: '每周限额',
		geminiModels: 'Gemini 模型',
		claudeGptModels: 'Claude 与 GPT 模型',
		resets: '重置时间：{time}',
		locale: 'zh-CN',
	},
};

/** A limit agy's `/usage` names, in the page's language: `5-hour limit (Gemini models)`; one it names otherwise as it is. */
export function agyLimitLabel(line: UsageLine, texts: AgyTexts): string {
	const limit = /^five[\s-]?hour limit$|^5[\s-]?hour limit$/i.test(line.name) ? texts.fiveHourLimit : /^weekly limit$/i.test(line.name) ? texts.weeklyLimit : line.name;
	const group = !line.group ? undefined : /^gemini models$/i.test(line.group) ? texts.geminiModels : /^claude and gpt models$/i.test(line.group) ? texts.claudeGptModels : line.group;
	return group ? fill(texts.limitOf, { limit, group }) : limit;
}

/** What Antigravity CLI's tile page shows of a check, and of its limits (agy's `/usage`) while connected. */
export function agyStatusOf(check: AgyCheck, texts: AgyTexts, usage?: readonly UsageLine[], now: Date = new Date()): SignInStatus {
	switch (check.kind) {
		case 'notInstalled':
			return { connected: false, detail: check.lookedInWsl ? texts.notInstalledWindows : texts.notInstalled };
		case 'notSignedIn':
			return { connected: false, detail: fill(texts.notSignedIn, { version: check.version, said: check.message ? texts.saidAs.replace('{said}', check.message) : '' }).slice(0, 300) };
		case 'failed':
			return { connected: false, detail: fill(texts.failed, { message: check.message }).slice(0, 300) };
		case 'signedIn':
			return {
				connected: true,
				account: [
					{ label: texts.signedInWith, value: texts.googleAccount },
					...(check.version ? [{ label: texts.version, value: check.version }] : []),
					{ label: texts.location, value: locationText(check, texts.wslLocation) },
					{ label: texts.models, value: fill(texts.modelCount, { count: String(check.models.length) }) },
				],
				...(usage?.length ? { usage: usage.slice(0, 6).map(line => usageMeter(line, agyLimitLabel(line, texts), texts, now)) } : {}),
			};
	}
}
