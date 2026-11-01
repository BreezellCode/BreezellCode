/**
 * Breezell IME host: the engine for the system input method. The text service (a TSF DLL on
 * Windows) in every program sends keys over a named pipe; this process holds the models (loaded
 * once), one composition per connection, and what the user taught it.
 *
 * Run by Breezell's own runtime: ELECTRON_RUN_AS_NODE=1 Breezell.exe host.cjs. One host per user:
 * a second one finds the pipe taken and leaves.
 *
 * Protocol, one line each way, fields split by TAB, candidates by U+001E:
 *   H <exe> <langid> [<pid> [<text service build>]]  hello → OK <mode n|e> <layout>
 *   T <vk> <char> <mods>           would the key be eaten (no change) → E <0|1>
 *   K <vk> <char> <mods>           the key          → S …
 *   P <index on page>              pick with the mouse → S …
 *   G <-1|1>                       the previous / next page (the panel's ‹ ›) → S …
 *   R                              drop the composition (focus moved) → S …
 *   M                              Shift: switch native / English → S …
 *   C [data]                       config file changed: reload (data: the model files changed too)
 *   Q                              what the host knows (JSON: programs, Breezell windows), for diagnosis
 * S <eaten> <composing> <mode> <highlight> <labels d|s|n> <more> <commit> <preedit> <candidates>
 *   <reading> <previous page 0|1> <badge> <quiet 0|1>
 *   reading: the panel's top line (hen jian dan); badge: 中 · 繁, あ, 한; quiet: the key went to
 *   Breezell's own input method (no sign from the text service).
 * mods: 1 Shift, 2 Ctrl, 4 Alt, 8 Caps Lock. char: the UTF-16 code the key types (0 none).
 *
 * Breezell's input method plugin connects too, to say where its window's focus is:
 *   B <pid of Breezell> <its editor or chat has focus 0|1> <window focused 0|1> <on 0|1> → OK
 * While that holds, the text service in that Breezell steps aside (its keys are not eaten), so the
 * editor and the chat keep Breezell's own input method, with the code and the conversation around
 * the caret.
 *
 * Breezell's plugin composes with this host's models too (one copy for the system and every
 * Breezell window, one user model), one composition per editor id on its connection:
 *   Z <JSON {op, id, arg}> → <JSON {value, state: {composing, preedit, candidates, commit}}> or {error}
 *   ops: open {layout, traditional, smart}, type <key>, space, backspace, select <i>, enter, cancel,
 *   context <text>, forget, other, undo, reading <i>, suggest {wordBefore, previousWords} (Korean),
 *   predict <count> (聯想: words after what was just committed), takePrediction <i>,
 *   merge {name, snapshot} (what the plugin learned before: into this user model), clear {name}, close.
 *
 * Native / English is one state for the whole system: a lone Shift in any program switches it, and
 * Breezell's plugin follows it while this input method is the one on in Breezell (the text
 * service there said hello): the host sends it "EV mode <n|e>", and "EV tip 0" when the text
 * service there is gone (another keyboard was picked). The plugin switched on or off in Breezell
 * (its own shortcut) switches the system's state too.
 */
import { AdaptiveModel, AdaptiveSnapshot } from '../../engine/src/index.js';
import { ChineseComposer, ChineseData, Composer, JapaneseComposer, JapaneseData, KoreanComposer, KoreanData, LocalComposer, WubiComposer } from '../../src/composers.js';
import { Key, KeySession } from '../../src/keys.js';
import { defaultDataDir, hostPipe, imeHome } from '../../src/paths.js';
import { appendFileSync, existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { connect, createServer, Socket } from 'node:net';
import { join } from 'node:path';

interface Config {
	/** The Chinese layout: pinyin, zhuyin, flypy, mspy, ziranma, sogou, abc, ziguang, jiajia, wubi. */
	zhLayout: string;
	dataPath: string;
	pageSize: number;
	wubiSmartOrder: boolean;
	learning: boolean;
	/** Full-width punctuation in native mode. */
	fullWidthPunctuation: boolean;
	/** After a commit, the words that may come next (聯想), picked with a digit (zhuyin: Shift+digit). */
	prediction: boolean;
	/** English words among the Chinese candidates (hello typed in pinyin). */
	englishMix: boolean;
}

const HOME = imeHome();
mkdirSync(HOME, { recursive: true });
const CONFIG_FILE = join(HOME, 'config.json');
const LOG_FILE = join(HOME, 'host.log');
// BREEZELL_IME_PIPE: another pipe or socket (the protocol test runs a host of its own).
const PIPE = hostPipe();

const log = (msg: string) => {
	try {
		appendFileSync(LOG_FILE, `${new Date().toISOString()} ${msg}\n`);
	} catch { /* no log */ }
};

function readConfig(): Config {
	const defaults: Config = {
		zhLayout: 'pinyin', dataPath: defaultDataDir(),
		pageSize: 7, wubiSmartOrder: false, learning: true, fullWidthPunctuation: true, prediction: true, englishMix: true,
	};
	try {
		if (existsSync(CONFIG_FILE)) {
			return { ...defaults, ...JSON.parse(readFileSync(CONFIG_FILE, 'utf8').replace(/^\uFEFF/, '')) };
		}
		writeFileSync(CONFIG_FILE, JSON.stringify(defaults, null, '\t'));
	} catch (e) {
		log(`config: ${e}`);
	}
	return defaults;
}

let config = readConfig();
// The models, loaded once and shared by every program's composition.
let chinese: ChineseData | undefined;
let japanese: JapaneseData | undefined;
let korean: KoreanData | undefined;
const learned = new Map<string, AdaptiveModel>();
let commitsSinceSave = 0;
/** The models were not found (said once in the log). */
let missingModels = false;

function model(name: string): AdaptiveModel {
	let m = learned.get(name);
	if (!m) {
		const file = join(HOME, `learned-${name}.json`);
		try {
			m = existsSync(file) ? AdaptiveModel.fromJSON(JSON.parse(readFileSync(file, 'utf8')) as AdaptiveSnapshot) : new AdaptiveModel();
		} catch {
			m = new AdaptiveModel();
		}
		learned.set(name, m);
	}
	return m;
}

function saveLearning(): void {
	if (!config.learning) {
		return;
	}
	for (const [name, m] of learned) {
		try {
			writeFileSync(join(HOME, `learned-${name}.json`), JSON.stringify(m.toJSON()));
		} catch (e) {
			log(`save ${name}: ${e}`);
		}
	}
}

/** The layout and script a language profile uses. */
function layoutFor(langid: number): { layout: string; traditional: boolean } {
	switch (langid & 0x3ff) {
		case 0x11: return { layout: 'japanese', traditional: false };
		case 0x12: return { layout: 'korean', traditional: false };
		default: {
			// Chinese: Taiwan, Hong Kong and Macao write Traditional; zhuyin always does.
			const traditional = langid === 0x0404 || langid === 0x0c04 || langid === 0x1404;
			return { layout: config.zhLayout, traditional };
		}
	}
}

/** A composer for one program's input (its own composition, the shared models). */
function makeComposer(layout: string, traditional: boolean, smart = config.wubiSmartOrder): Composer {
	const dir = config.dataPath;
	if (!existsSync(dir)) {
		throw new Error(`no data folder ${dir}`);
	}
	const t0 = Date.now();
	let c: Composer;
	if (layout === 'wubi') {
		chinese ??= new ChineseData(dir);
		c = new WubiComposer(chinese, smart, model('zh'));
	} else if (layout === 'japanese') {
		japanese ??= new JapaneseData(dir);
		c = new JapaneseComposer(japanese, model('ja'));
	} else if (layout === 'korean') {
		korean ??= new KoreanData(dir);
		c = new KoreanComposer(korean);
	} else {
		chinese ??= new ChineseData(dir);
		c = new ChineseComposer(chinese, layout, traditional, model('zh'), config.englishMix);
	}
	log(`composer ${layout}${traditional ? ' traditional' : ''} in ${Date.now() - t0} ms`);
	return c;
}

/** The named keys by Windows virtual-key code (others are their character). */
const NAMED: Record<number, string> = {
	0x08: 'Backspace', 0x09: 'Tab', 0x0d: 'Enter', 0x1b: 'Escape', 0x21: 'PageUp', 0x22: 'PageDown', 0x25: 'ArrowLeft', 0x26: 'ArrowUp', 0x27: 'ArrowRight', 0x28: 'ArrowDown',
	0x10: 'Shift', 0xa0: 'Shift', 0xa1: 'Shift', 0x11: 'Control', 0xa2: 'Control', 0xa3: 'Control', 0x12: 'Alt', 0xa4: 'Alt', 0xa5: 'Alt', 0x14: 'CapsLock', 0x5b: 'Meta', 0x5c: 'Meta', 0x5d: 'ContextMenu',
};

/** A key as the text service sends it (virtual-key code, the character it types, mods: 1 Shift, 2 Ctrl, 4 Alt, 8 Caps Lock). */
function keyOf(vk: number, ch: number, mods: number): Key {
	return {
		key: NAMED[vk] ?? (ch ? String.fromCharCode(ch) : 'Unidentified'),
		shift: !!(mods & 1),
		command: !!(mods & 6),
		caps: !!(mods & 8),
		digit: vk >= 0x31 && vk <= 0x39 ? vk - 0x30 : undefined,
	};
}

/** Where a Breezell window's focus is, as its input method plugin last said. */
interface Inside {
	readonly socket: Socket;
	pid: number;
	internal: boolean;
	focused: boolean;
	enabled: boolean;
}
const insides = new Set<Inside>();

/** Native / English, the same in every program. */
let english = false;

/** Whether this input method's text service is on in process `pid` (it said hello there). */
function tipIn(pid: number): boolean {
	for (const c of connections) {
		if (c.session.pid === pid && c.session.exe) {
			return true;
		}
	}
	return false;
}

/** Tells Breezell's plugins in processes where this input method is on the system's state. */
function tellBreezell(only?: number): void {
	for (const i of insides) {
		if ((only === undefined || i.pid === only) && i.pid && tipIn(i.pid)) {
			i.enabled = !english;
			i.socket.write(`EV\tmode\t${english ? 'e' : 'n'}\n`);
		}
	}
}

function setEnglish(value: boolean): void {
	if (english !== value) {
		english = value;
		tellBreezell();
	}
}

/** The Breezell window of process `pid` whose editor or chat has the focus, if any. */
function insideOf(pid: number): Inside | undefined {
	if (!pid) {
		return undefined;
	}
	for (const i of insides) {
		if (i.pid === pid && i.focused && i.internal) {
			return i;
		}
	}
	return undefined;
}

/** One program's input: its composition and what a key does to it (keys.ts, as in Breezell). */
class Session {
	/** The program's process (0: an older text service that does not say) and file name. */
	pid = 0;
	exe = '';
	/** The text service's build (0: one too old to say). */
	build = 0;
	private layout = 'pinyin';
	private traditional = false;
	private keys?: KeySession;
	private langid = 0;
	private nextTry = 0;
	get saidHello(): boolean { return this.langid !== 0; }

	hello(langid: number, pid: number, exe = ''): string {
		this.pid = pid;
		this.exe = exe;
		this.langid = langid;
		this.makeKeys();
		// Breezell in this process follows the system's state from now on.
		setTimeout(() => tellBreezell(pid), 0);
		return ['OK', english ? 'e' : 'n', this.layout].join('\t');
	}

	/**
	 * The composition, from the models. They may not be here yet (the user has not downloaded
	 * them): until they are, keys are left to the program, and each try is a few file checks.
	 */
	makeKeys(): void {
		const want = layoutFor(this.langid);
		this.layout = want.layout;
		this.traditional = want.traditional;
		this.keys = undefined;
		this.nextTry = Date.now() + 5000;
		let composer: Composer;
		try {
			composer = makeComposer(want.layout, want.traditional);
		} catch (e) {
			if (!missingModels) {
				missingModels = true;
				log(`no models yet: ${(e as Error)?.message ?? e}`);
			}
			return;
		}
		missingModels = false;
		this.keys = new KeySession(new LocalComposer(composer), () => ({
			layout: this.layout,
			traditional: this.traditional,
			pageSize: config.pageSize,
			fullWidth: config.fullWidthPunctuation,
			// Only to text services that show them without numbers (build 6 on): an older one would
			// label them 1, 2, 3, though digits now go to the program.
			prediction: config.prediction && this.build >= 6,
			english,
		}));
	}

	/** Models that were not here before may be now. */
	private tryKeys(): void {
		if (!this.keys && this.saidHello && Date.now() >= this.nextTry) {
			this.makeKeys();
		}
	}

	/** Whether the key would be eaten; one that is not is the program's (what comes next follows from it). */
	async wouldEat(k: Key): Promise<boolean> {
		this.tryKeys();
		if (!this.keys) {
			return false;
		}
		if (this.keys.eats(k)) {
			return true;
		}
		await this.keys.passed(k);
		return false;
	}

	async key(k: Key): Promise<string> {
		if (!this.keys) {
			return this.answer(false, '');
		}
		const r = await this.keys.key(k);
		// A mark that stays as typed goes in after the commit (a program types no key of ours).
		return this.answer(r.eaten, r.commit + (r.typeKey && k.key.length === 1 ? k.key : ''));
	}

	async pick(indexOnPage: number): Promise<string> {
		return this.answer(true, this.keys ? await this.keys.pick(indexOnPage) : '');
	}

	/** The panel's ‹ ›. */
	async page(delta: -1 | 1): Promise<string> {
		this.keys?.page(delta);
		return this.answer(true, '');
	}

	async reset(): Promise<string> {
		await this.keys?.reset();
		return this.answer(true, '');
	}

	/** Shift: native ⇄ English. What is being composed goes in as typed (pinyin letters, kana). */
	async toggle(): Promise<string> {
		const commit = this.keys ? await this.keys.flush() : '';
		setEnglish(!english);
		return this.answer(true, commit);
	}

	/** Shift in a Breezell editor or chat: the plugin switches and shows it; the text service shows nothing. */
	async toggleInside(): Promise<string> {
		setEnglish(!english);
		return this.answer(true, '', true);
	}

	/** S <eaten> <composing> <mode> <highlight> <labels> <more> <commit> <preedit> <candidates> <reading> <previous page> <badge> <quiet> */
	async answer(eaten: boolean, commit: string, quiet = false): Promise<string> {
		if (commit && ++commitsSinceSave >= 20) {
			commitsSinceSave = 0;
			saveLearning();
		}
		const clean = (t: string) => t.replace(/[\t\n\r\x1e]/g, ' ');
		const v = this.keys ? await this.keys.view() : undefined;
		const shown = v && (v.composing || v.predicting);
		return ['S', eaten ? 1 : 0, v?.composing ? 1 : 0, english ? 'e' : 'n', v?.highlight ?? 0, v?.labels === 'shift' ? 's' : v?.labels === 'none' ? 'n' : 'd',
			v?.more ? 1 : 0, clean(commit), clean(v?.preedit ?? ''), shown ? v!.candidates.map(clean).join('\x1e') : '',
			clean(v?.reading ?? ''), v?.prev ? 1 : 0, v?.badge ?? '', quiet ? 1 : 0].join('\t');
	}
}

function serve(socket: Socket): void {
	const session = new Session();
	const conn: Connection = { session, socket };
	connections.add(conn);
	let buffer = '';
	let replies: Promise<void> = Promise.resolve();
	socket.setEncoding('utf8');
	socket.on('data', chunk => {
		buffer += chunk;
		let nl: number;
		while ((nl = buffer.indexOf('\n')) >= 0) {
			const line = buffer.slice(0, nl).replace(/\r$/, '');
			buffer = buffer.slice(nl + 1);
			// One request at a time, answered in order.
			replies = replies.then(async () => {
				let reply: string;
				try {
					reply = await handle(conn, line);
				} catch (e) {
					log(`error on "${line.slice(0, 80)}": ${(e as Error)?.stack ?? e}`);
					reply = line[0] === 'T' ? 'E\t0' : line[0] === 'Z' ? JSON.stringify({ error: String((e as Error)?.message ?? e) }) : 'S\t0\t0\tn\t0\td\t0\t\t\t';
				}
				socket.write(reply + '\n');
			});
		}
	});
	socket.on('error', () => { /* the program went away */ });
	socket.on('close', () => {
		connections.delete(conn);
		const pid = conn.session.exe ? conn.session.pid : 0;
		if (pid) {
			setTimeout(() => {
				if (!tipIn(pid)) {
					for (const i of insides) {
						if (i.pid === pid) {
							i.socket.write('EV\ttip\t0\n');
						}
					}
				}
			}, 1500);
		}
		if (conn.inside) {
			insides.delete(conn.inside);
		}
	});
}

const connections = new Set<Connection>();

/** A request from Breezell's plugin about one of its compositions (see Z above). */
function editorRequest(conn: Connection, json: string): string {
	const req = JSON.parse(json) as { op: string; id?: number; arg?: any };
	const editors = conn.editors ??= new Map<number, Composer>();
	const id = Number(req.id) || 0;
	const reply = (value?: unknown) => {
		const c = editors.get(id);
		if (!c) {
			return JSON.stringify({ value });
		}
		const s = c.state();
		if (s.commit && ++commitsSinceSave >= 20) {
			commitsSinceSave = 0;
			saveLearning();
		}
		return JSON.stringify({ value, state: { composing: c.composing, preedit: s.preedit, candidates: s.candidates, commit: s.commit } });
	};
	switch (req.op) {
		case 'open': {
			const a = req.arg ?? {};
			editors.set(id, makeComposer(String(a.layout ?? 'pinyin'), !!a.traditional, a.smart === undefined ? config.wubiSmartOrder : !!a.smart));
			return reply(true);
		}
		case 'close':
			editors.delete(id);
			return JSON.stringify({ value: true });
		case 'clear': {
			const a = req.arg ?? {};
			if (a.name === 'zh' || a.name === 'ja') {
				model(a.name).clear();
				saveLearning();
			}
			return JSON.stringify({ value: true });
		}
		case 'merge': {
			const a = req.arg ?? {};
			if ((a.name === 'zh' || a.name === 'ja') && a.snapshot) {
				model(a.name).merge(a.snapshot as AdaptiveSnapshot);
				saveLearning();
				log(`merged what Breezell learned (${a.name})`);
			}
			return JSON.stringify({ value: true });
		}
	}
	const c = editors.get(id);
	if (!c) {
		return JSON.stringify({ error: `no composition ${id}` });
	}
	switch (req.op) {
		case 'type': c.type(String(req.arg ?? '')); return reply();
		case 'space': return reply(c.space());
		case 'backspace': return reply(c.backspace());
		case 'select': c.select(Number(req.arg)); return reply();
		case 'enter': c.enter(); return reply();
		case 'cancel': c.cancel(); return reply();
		case 'context': c.setContext(String(req.arg ?? '')); return reply();
		case 'forget': c.forget?.(); return reply();
		case 'other': c.afterOther?.(); return reply();
		case 'undo': c.undoLastCommit?.(); return reply();
		case 'reading': return reply(c.reading?.(Number(req.arg)) ?? null);
		case 'predict': return reply(c.predictions?.(Math.max(1, Math.min(9, Number(req.arg) || 5))) ?? []);
		case 'takePrediction': c.takePrediction?.(Number(req.arg)); return reply();
		case 'suggest': {
			if (!(c instanceof KoreanComposer)) {
				return reply([]);
			}
			const a = req.arg ?? {};
			c.wordBefore = String(a.wordBefore ?? '');
			c.previousWords = Array.isArray(a.previousWords) ? a.previousWords.map(String) : [];
			return reply(c.suggestions());
		}
	}
	return JSON.stringify({ error: `unknown op ${req.op}` });
}

interface Connection {
	readonly session: Session;
	readonly socket: Socket;
	/** Breezell's compositions on this connection, by editor id. */
	editors?: Map<number, Composer>;
	/** Set when the other end is Breezell's plugin saying where its focus is. */
	inside?: Inside;
}

async function handle(conn: Connection, line: string): Promise<string> {
	const f = line.split('\t');
	const session = conn.session;
	switch (f[0]) {
		case 'H':
			session.build = Number(f[4] ?? 0);
			return session.hello(Number(f[2] ?? 0x0804), Number(f[3] ?? 0), f[1] ?? '');
		case 'T': {
			if (insideOf(session.pid)) {
				return 'E\t0';
			}
			return `E\t${(await session.wouldEat(keyOf(Number(f[1]), Number(f[2] ?? 0), Number(f[3] ?? 0)))) ? 1 : 0}`;
		}
		case 'K': {
			if (insideOf(session.pid)) {
				return session.answer(false, '');
			}
			return session.key(keyOf(Number(f[1]), Number(f[2] ?? 0), Number(f[3] ?? 0)));
		}
		case 'P': return session.pick(Number(f[1]));
		case 'G': return session.page(Number(f[1]) < 0 ? -1 : 1);
		case 'R': return session.reset();
		case 'M': {
			const inside = insideOf(session.pid);
			log(`shift in ${session.exe || '?'} (pid ${session.pid}): ${inside ? 'to Breezell\'s input method' : 'text service'}`);
			return inside ? session.toggleInside() : session.toggle();
		}
		case 'Z': return editorRequest(conn, line.slice(2));
		case 'Q': return JSON.stringify({
			english,
			programs: [...connections].filter(c => c.session.exe).map(c => ({ exe: c.session.exe, pid: c.session.pid, build: c.session.build })),
			breezell: [...insides].map(i => ({ pid: i.pid, internal: i.internal, focused: i.focused, enabled: i.enabled })),
		});
		case 'B': {
			const first = !conn.inside;
			const inside = conn.inside ??= { socket: conn.socket, pid: 0, internal: false, focused: false, enabled: false };
			insides.add(inside);
			const enabled = f[4] === '1';
			const switched = !first && enabled !== inside.enabled;
			inside.pid = Number(f[1] ?? 0);
			inside.internal = f[2] === '1';
			inside.focused = f[3] === '1';
			inside.enabled = enabled;
			if (first) {
				// Just connected: it takes the system's state if this input method is on there.
				setTimeout(() => tellBreezell(inside.pid), 0);
			} else if (switched && tipIn(inside.pid)) {
				// Switched in Breezell (its own shortcut): the system's state follows.
				setEnglish(!enabled);
			}
			return 'OK';
		}
		case 'C': {
			const dataWas = config.dataPath;
			config = readConfig();
			// The models stay loaded unless they changed: only a new folder or new files need a new read.
			if (f[1] === 'data' || config.dataPath !== dataWas) {
				chinese = japanese = korean = undefined;
			}
			// What is typed in programs follows: their compositions start again, with the new settings.
			for (const c of connections) {
				if (c.session.saidHello) {
					c.session.makeKeys();
				}
			}
			return 'OK';
		}
		default: return 'ERR';
	}
}

let retriedStaleSocket = false;
const server = createServer(serve);
server.on('error', (e: NodeJS.ErrnoException) => {
	if (e.code === 'EADDRINUSE' && process.platform !== 'win32' && !retriedStaleSocket) {
		// A socket file left by a host that died: nobody answers on it, so it goes.
		retriedStaleSocket = true;
		const probe = connect(PIPE);
		probe.on('connect', () => { probe.destroy(); log('another host is running: leaving'); process.exit(0); });
		probe.on('error', () => { try { unlinkSync(PIPE); } catch { /* gone */ } server.listen(PIPE); });
		return;
	}
	if (e.code === 'EADDRINUSE') {
		log('another host is running: leaving');
		process.exit(0);
	}
	log(`server: ${e}`);
	process.exit(1);
});
server.listen(PIPE, () => {
	log(`listening on ${PIPE}, data ${config.dataPath}`);
	// The Chinese models first: most keys will need them.
	try {
		makeComposer(config.zhLayout, true);
	} catch (e) {
		log(`preload: ${e}`);
	}
});
const save = () => saveLearning();
process.on('exit', save);
process.on('SIGTERM', () => { save(); process.exit(0); });
setInterval(save, 5 * 60 * 1000).unref();
