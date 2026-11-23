/*
 * What the tile's page says, in Breezell's display language. The tile's own texts (title, switch,
 * note, consent) are in package.json, where Breezell reads them before the plugin runs.
 */
import { resetInstant, type Check, type UsageLine } from './claudeCode';
import type { SyncState } from './sync';

export type LanguageKey = 'en' | 'zh-tw' | 'zh-cn';

export interface Texts {
	readonly notInstalled: string;
	/** Windows, where WSL was looked at too. */
	readonly notInstalledWindows: string;
	/** Where it is, for one inside WSL: {distro}, {path}. */
	readonly wslLocation: string;
	readonly notSignedIn: string;
	readonly tooOld: string;
	readonly failed: string;
	readonly email: string;
	readonly organization: string;
	readonly plan: string;
	readonly loginMethod: string;
	/** How a Claude account sign-in is named (authMethod `claude.ai`). */
	readonly claudeAccount: string;
	/** Usage bars: the limits Claude Code names, and when each resets. */
	readonly currentSession: string;
	readonly currentWeekAll: string;
	/** {model} */
	readonly currentWeekModel: string;
	/** {time} */
	readonly resets: string;
	/** The locale a reset time is written in. */
	readonly locale: string;
	/** A conversation sent while Claude Code is not connected. */
	readonly notConnected: string;
	/** Said once at the top of a conversation's reply when the user picked Entanglement, which is Breezell's own models' mode. */
	readonly entanglementNote: string;
	/** A conversation whose folder that Claude Code cannot work in: {folder}. */
	readonly folderUnreachable: string;
	/** The row of the conversations brought into Breezell, and what it says. */
	readonly conversations: string;
	/** {project}: the projects synced (projectList), or thisProject. */
	readonly syncRunning: string;
	/** {project}'s {found}, {created} new, {updated} with newer messages, at {time}. */
	readonly syncDone: string;
	readonly syncNone: string;
	readonly syncNoFolder: string;
	readonly syncFailed: string;
	/** What a project is called when its name is not known. */
	readonly thisProject: string;
	/** A project's name as the texts quote it: {name}. */
	readonly projectName: string;
	/** Between two projects' names. */
	readonly projectJoin: string;
	/** The notice after "Sync conversations": {project} {found} {created} {updated}. */
	readonly syncedNotice: string;
	readonly syncedNoneNotice: string;
	readonly syncNoFolderNotice: string;
	readonly syncFailedNotice: string;
	readonly version: string;
	readonly location: string;
}

export const TEXTS: Readonly<Record<LanguageKey, Texts>> = {
	'en': {
		notInstalled: 'Claude Code was not found on this computer. Install Claude Code, run claude in a terminal and sign in, then check again.',
		notInstalledWindows: 'Claude Code was found neither in Windows nor in WSL. Install it in either, run claude in its terminal and sign in, then check again.',
		wslLocation: 'WSL ({distro}): {path}',
		notSignedIn: 'Claude Code {version} is installed but not signed in. Run claude in a terminal, type /login and sign in, then check again.',
		tooOld: 'This Claude Code ({version}) cannot report whether it is signed in. Update it with claude update, then check again.',
		failed: 'Could not read the status of Claude Code: {message}',
		email: 'Email',
		organization: 'Organization',
		plan: 'Plan',
		loginMethod: 'Signed in with',
		claudeAccount: 'Claude account',
		currentSession: 'Current session',
		currentWeekAll: 'This week (all models)',
		currentWeekModel: 'This week ({model})',
		resets: 'Resets {time}',
		locale: 'en-US',
		notConnected: 'Claude Code is not connected. Turn it on in Box › Models › Sign in, then send again.',
		entanglementNote: 'Claude Code works in Agent mode here. Entanglement is a mode of Breezell\'s own models, so the Entanglement Dashboard does not apply.',
		folderUnreachable: 'The Claude Code connected cannot work in this conversation\'s folder ({folder}). Install Claude Code where the folder is (in WSL for a WSL folder), or open a folder of this computer.',
		conversations: 'Conversations',
		syncRunning: 'Bringing the Claude Code conversations of {project} into its conversation list…',
		syncDone: '{project}: {found}, {created} new, {updated} updated · {time}',
		syncNone: '{project} has no Claude Code conversations yet · {time}',
		syncNoFolder: 'No project is open in this window: conversations go to the project they belong to. Open that project.',
		syncFailed: 'Could not bring them in: {message}',
		thisProject: 'this project',
		projectName: '{name}',
		projectJoin: ', ',
		syncedNotice: 'The Claude Code conversations of {project} are in its conversation list: {found} in all, {created} new, {updated} updated.',
		syncedNoneNotice: '{project} has no Claude Code conversations yet.',
		syncNoFolderNotice: 'No project is open in this window. Claude Code conversations go to the project they belong to: open that project (they come in when it opens) and they show in its conversation list, and under that project on the Agents page.',
		syncFailedNotice: 'Could not bring the Claude Code conversations in: {message}',
		version: 'Claude Code version',
		location: 'Program',
	},
	'zh-tw': {
		notInstalled: '這台電腦上找不到 Claude Code。請先安裝 Claude Code，在終端機執行 claude 並登入帳號，再重新檢查。',
		notInstalledWindows: '在 Windows 和 WSL 中都找不到 Claude Code。請在其中一邊安裝 Claude Code，在該處的終端機執行 claude 並登入帳號，再重新檢查。',
		wslLocation: 'WSL（{distro}）：{path}',
		notSignedIn: '已找到 Claude Code {version}，但尚未登入。請在終端機執行 claude，輸入 /login 登入帳號，再重新檢查。',
		tooOld: '這個版本的 Claude Code（{version}）無法回報登入狀態。請執行 claude update 更新後，再重新檢查。',
		failed: '無法讀取 Claude Code 的狀態：{message}',
		email: '電子郵件',
		organization: '組織',
		plan: '訂閱等級',
		loginMethod: '登入方式',
		claudeAccount: 'Claude 帳號',
		currentSession: '目前工作階段',
		currentWeekAll: '本週（所有模型）',
		currentWeekModel: '本週（{model}）',
		resets: '重設時間：{time}',
		locale: 'zh-TW',
		notConnected: 'Claude Code 尚未連接。請在 Box › 模型 › 帳號登入 中開啟後再送出。',
		entanglementNote: 'Claude Code 在這裡以「代理」模式運作。「糾纏」是 Breezell 自己模型的模式，所以不會顯示糾纏模式面板。',
		folderUnreachable: '目前連接的 Claude Code 無法在這個對話的資料夾（{folder}）中工作。請在資料夾所在的環境安裝 Claude Code（WSL 資料夾就裝在 WSL 裡），或開啟這台電腦上的資料夾。',
		conversations: '對話同步',
		syncRunning: '正在把{project}的 Claude Code 對話同步到它的對話清單…',
		syncDone: '{project}有 {found} 個，新增 {created} 個，更新 {updated} 個 · {time}',
		syncNone: '{project}還沒有 Claude Code 對話 · {time}',
		syncNoFolder: '這個視窗沒有開啟專案：對話會同步到它所屬的專案，請開啟該專案',
		syncFailed: '同步失敗：{message}',
		thisProject: '這個專案',
		projectName: '「{name}」',
		projectJoin: '、',
		syncedNotice: '已把{project}的 Claude Code 對話同步到它的對話清單：共 {found} 個，新增 {created} 個，更新 {updated} 個。',
		syncedNoneNotice: '{project}還沒有 Claude Code 對話。',
		syncNoFolderNotice: '這個視窗沒有開啟專案。Claude Code 的對話會同步到它所屬的專案：開啟該專案（開啟時會自動同步）後，對話會出現在那個專案的對話清單，在 Agents 頁中也會顯示在該專案底下。',
		syncFailedNotice: 'Claude Code 對話同步失敗：{message}',
		version: 'Claude Code 版本',
		location: '程式位置',
	},
	'zh-cn': {
		notInstalled: '这台电脑上找不到 Claude Code。请先安装 Claude Code，在终端执行 claude 并登录账号，再重新检查。',
		notInstalledWindows: '在 Windows 和 WSL 中都找不到 Claude Code。请在其中一边安装 Claude Code，在该处的终端执行 claude 并登录账号，再重新检查。',
		wslLocation: 'WSL（{distro}）：{path}',
		notSignedIn: '已找到 Claude Code {version}，但尚未登录。请在终端执行 claude，输入 /login 登录账号，再重新检查。',
		tooOld: '这个版本的 Claude Code（{version}）无法报告登录状态。请执行 claude update 更新后，再重新检查。',
		failed: '无法读取 Claude Code 的状态：{message}',
		email: '电子邮件',
		organization: '组织',
		plan: '订阅等级',
		loginMethod: '登录方式',
		claudeAccount: 'Claude 账号',
		currentSession: '当前会话',
		currentWeekAll: '本周（所有模型）',
		currentWeekModel: '本周（{model}）',
		resets: '重置时间：{time}',
		locale: 'zh-CN',
		notConnected: 'Claude Code 尚未连接。请在 Box › 模型 › 账号登录 中开启后再发送。',
		entanglementNote: 'Claude Code 在这里以“代理”模式运行。“纠缠”是 Breezell 自己模型的模式，所以不会显示纠缠模式面板。',
		folderUnreachable: '当前连接的 Claude Code 无法在这个对话的文件夹（{folder}）中工作。请在文件夹所在的环境安装 Claude Code（WSL 文件夹就装在 WSL 里），或打开这台电脑上的文件夹。',
		conversations: '对话同步',
		syncRunning: '正在把{project}的 Claude Code 对话同步到它的对话列表…',
		syncDone: '{project}有 {found} 个，新增 {created} 个，更新 {updated} 个 · {time}',
		syncNone: '{project}还没有 Claude Code 对话 · {time}',
		syncNoFolder: '这个窗口没有打开项目：对话会同步到它所属的项目，请打开该项目',
		thisProject: '这个项目',
		projectName: '「{name}」',
		projectJoin: '、',
		syncedNotice: '已把{project}的 Claude Code 对话同步到它的对话列表：共 {found} 个，新增 {created} 个，更新 {updated} 个。',
		syncedNoneNotice: '{project}还没有 Claude Code 对话。',
		syncNoFolderNotice: '这个窗口没有打开项目。Claude Code 的对话会同步到它所属的项目：打开该项目（打开时会自动同步）后，对话会出现在那个项目的对话列表，在 Agents 页中也会显示在该项目下。',
		syncFailedNotice: 'Claude Code 对话同步失败：{message}',
		syncFailed: '同步失败：{message}',
		version: 'Claude Code 版本',
		location: '程序位置',
	},
};

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

const fill = (text: string, values: Record<string, string | undefined>): string =>
	text.replace(/\{(\w+)\}/g, (_, name: string) => values[name] ?? '').replace(/\s+([，。（）])/g, '$1').replace(/（）/g, '').replace(/\(\)/g, '').replace(/\s{2,}/g, ' ').trim();

/** The program's place: its path, or the WSL distribution and the path inside it. */
function locationOf(check: { readonly where: 'native' | 'wsl'; readonly location: string; readonly distro?: string }, texts: Texts): string {
	return check.where === 'wsl' ? fill(texts.wslLocation, { distro: check.distro ?? 'WSL', path: check.location }).replace(/^WSL \(WSL\): |^WSL（WSL）：/, 'WSL: ') : check.location;
}

/** A limit's name in the page's language; one Claude Code names otherwise stays as it is. */
export function usageLabel(name: string, texts: Texts): string {
	const n = name.trim();
	if (/^current session$/i.test(n)) {
		return texts.currentSession;
	}
	if (/^current week \(all models\)$/i.test(n)) {
		return texts.currentWeekAll;
	}
	const model = /^current week \((.+)\)$/i.exec(n)?.[1];
	return model ? fill(texts.currentWeekModel, { model }) : n;
}

/** When a limit resets, in this computer's time; as Claude Code wrote it when it cannot be read. */
export function resetText(raw: string, texts: Texts, now: Date): string {
	const at = resetInstant(raw, now);
	const time = at ? at.toLocaleString(texts.locale, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : raw;
	return texts.resets.replace('{time}', time);
}

function usageMeter(line: UsageLine, texts: Texts, now: Date): { label: string; percent: number; detail?: string } {
	return { label: usageLabel(line.name, texts), percent: line.percent, ...(line.resets ? { detail: resetText(line.resets, texts, now) } : {}) };
}

/** The projects a sync covered, as the texts name them; their names unknown, "this project". */
function projectsOf(projects: readonly string[] | undefined, texts: Texts): string {
	const names = (projects ?? []).filter(name => name.trim());
	return names.length ? names.map(name => fill(texts.projectName, { name })).join(texts.projectJoin) : texts.thisProject;
}

/** What the conversations row says of the last sync: which project it was, and what came of it. */
export function syncLine(sync: SyncState, texts: Texts): string {
	switch (sync.kind) {
		case 'running': return fill(texts.syncRunning, { project: projectsOf(sync.projects, texts) });
		case 'noFolder': return texts.syncNoFolder;
		case 'failed': return fill(texts.syncFailed, { message: sync.message });
		case 'done': {
			const time = new Date(sync.at).toLocaleTimeString(texts.locale, { hour: '2-digit', minute: '2-digit' });
			const project = projectsOf(sync.projects, texts);
			return sync.found === 0 ? fill(texts.syncNone, { project, time }) : fill(texts.syncDone, { project, found: String(sync.found), created: String(sync.created), updated: String(sync.updated), time });
		}
	}
}

/** The notice "Sync conversations" ends with: what came of it, and where the conversations went; none while it runs. */
export function syncNotice(sync: SyncState, texts: Texts): { readonly text: string; readonly warning: boolean } | undefined {
	switch (sync.kind) {
		case 'running': return undefined;
		case 'noFolder': return { text: texts.syncNoFolderNotice, warning: false };
		case 'failed': return { text: fill(texts.syncFailedNotice, { message: sync.message }), warning: true };
		case 'done': {
			const project = projectsOf(sync.projects, texts);
			return { text: sync.found === 0 ? fill(texts.syncedNoneNotice, { project }) : fill(texts.syncedNotice, { project, found: String(sync.found), created: String(sync.created), updated: String(sync.updated) }), warning: false };
		}
	}
}

export function statusOf(check: Check, texts: Texts, usage?: readonly UsageLine[], now: Date = new Date(), sync?: SyncState): SignInStatus {
	switch (check.kind) {
		case 'notInstalled':
			return { connected: false, detail: check.lookedInWsl ? texts.notInstalledWindows : texts.notInstalled };
		case 'notSignedIn':
			return { connected: false, detail: fill(texts.notSignedIn, { version: check.version }) };
		case 'tooOld':
			return { connected: false, detail: fill(texts.tooOld, { version: check.version }) };
		case 'failed':
			return { connected: false, detail: fill(texts.failed, { message: check.message }) };
		case 'signedIn': {
			const rows: { label: string; value: string }[] = [];
			const add = (label: string, value: string | undefined) => {
				if (value) {
					rows.push({ label, value });
				}
			};
			add(texts.email, check.email);
			add(texts.organization, check.organization);
			add(texts.plan, check.plan);
			add(texts.loginMethod, check.authMethod === 'claude.ai' ? texts.claudeAccount : check.authMethod);
			add(texts.version, check.version);
			add(texts.location, locationOf(check, texts));
			add(texts.conversations, sync ? syncLine(sync, texts) : undefined);
			const meters = (usage ?? []).map(line => usageMeter(line, texts, now));
			return { connected: true, account: rows, ...(meters.length ? { usage: meters } : {}) };
		}
	}
}
