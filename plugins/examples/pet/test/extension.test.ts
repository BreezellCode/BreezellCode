import assert from 'node:assert/strict';
import { suite, test } from 'node:test';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const Module = require('node:module');

const shared: Record<string, unknown> = { ConfigurationTarget: undefined, commands: undefined, window: undefined, workspace: undefined, breezell: undefined };
const load = Module._load;
Module._load = function (request: string, ...rest: unknown[]) {
	return request === 'vscode' ? shared : load.call(this, request, ...rest);
};

interface FakeSurface {
	surfaceId: string;
	sent: unknown[];
	postMessage(message: unknown): Promise<boolean>;
	onDidReceiveMessage(listener: (message: unknown) => void): { dispose(): void };
	onDidClose(listener: () => void): { dispose(): void };
	say(message: unknown): void;
	close(): void;
}

function harness(options: { noBreezell?: boolean; kept?: unknown } = {}) {
	const config: Record<string, unknown> = {};
	const store = new Map<string, unknown>(options.kept ? [['deskPet.progress', options.kept]] : []);
	const commands = new Map<string, () => unknown>();
	const notes: string[] = [];
	let onConfig: ((e: { affectsConfiguration(section: string): boolean }) => void) | undefined;
	let onSurface: ((surface: FakeSurface) => void) | undefined;
	const vscode = {
		ConfigurationTarget: { Global: 1 },
		commands: { registerCommand: (id: string, run: () => unknown) => (commands.set(id, run), { dispose() { } }) },
		window: { showInformationMessage: (text: string) => (notes.push(text), Promise.resolve()) },
		workspace: {
			getConfiguration: () => ({
				get: (key: string, fallback: unknown) => key in config ? config[key] : fallback,
				update: async (key: string, value: unknown) => {
					config[key] = value;
				},
			}),
			onDidChangeConfiguration: (listener: typeof onConfig) => (onConfig = listener, { dispose() { } }),
		},
		breezell: options.noBreezell ? undefined : {
			language: 'zh-TW',
			ui: { onDidOpenSurface: (listener: typeof onSurface) => (onSurface = listener, { dispose() { } }) },
		},
	};
	// The plugin is loaded once and reads `vscode` as it goes: each test swaps what is behind it.
	Object.assign(shared, vscode);
	// eslint-disable-next-line @typescript-eslint/no-require-imports
	const { activate } = require('../src/extension');
	activate({ subscriptions: [], globalState: { get: (key: string) => store.get(key), update: async (key: string, value: unknown) => void store.set(key, value) } });
	const open = (surfaceId = 'pet'): FakeSurface => {
		let receive: (message: unknown) => void = () => { };
		let closed: () => void = () => { };
		const surface: FakeSurface = {
			surfaceId,
			sent: [],
			postMessage: async message => (surface.sent.push(message), true),
			onDidReceiveMessage: listener => (receive = listener, { dispose: () => { receive = () => { }; } }),
			onDidClose: listener => (closed = listener, { dispose() { } }),
			say: message => receive(message),
			close: () => closed(),
		};
		onSurface?.(surface);
		return surface;
	};
	return { config, store, commands, notes, open, hasSurfaces: () => !!onSurface, changeConfig: (section = 'deskPet') => onConfig?.({ affectsConfiguration: s => s === section }) };
}

const first = (surface: FakeSurface) => surface.sent[0] as { type: string; greet: boolean; progress: unknown; settings: Record<string, unknown> };

suite('the plugin keeps what the pet must not forget', () => {
	test('in an editor with no companions it only keeps its command', () => {
		const h = harness({ noBreezell: true });
		assert.ok(h.commands.has('deskPet.toggle'));
		assert.equal(h.hasSurfaces(), false);
	});
	test('a page is told who it is', () => {
		const kept = { xp: 12 };
		const surface = harness({ kept }).open();
		assert.equal(first(surface).type, 'init');
		assert.deepEqual(first(surface).progress, kept);
		assert.deepEqual(first(surface).settings, { visible: true, size: 'medium', speech: true });
	});
	test('it says hello once in a window, not at every page', () => {
		const h = harness();
		assert.equal(first(h.open()).greet, true);
		assert.equal(first(h.open()).greet, false);
	});
	test('a page that was not listening yet asks again, and hears the same without another hello', () => {
		const surface = harness().open();
		surface.say({ hello: true });
		assert.equal(surface.sent.length, 2);
		assert.equal((surface.sent[1] as { greet: boolean }).greet, false);
	});
	test('what a page saves is kept and told to the others, not to itself', () => {
		const h = harness();
		const a = h.open();
		const b = h.open();
		const before = [a.sent.length, b.sent.length];
		a.say({ save: { xp: 3 } });
		assert.deepEqual(h.store.get('deskPet.progress'), { xp: 3 });
		assert.equal(a.sent.length, before[0]);
		assert.deepEqual(b.sent.at(-1), { type: 'progress', progress: { xp: 3 } });
	});
	test('a save from a page that knew less goes on top of what is stored: two windows add up', () => {
		const NOW = Date.now();
		const base = { xp: 10, turns: 10, fed: 0, played: 0, mood: 70, moodAt: NOW, bornAt: NOW, fedAt: 0, playedAt: 0, perch: 0.5 };
		const h = harness({ kept: base });
		const a = h.open();
		a.say({ save: { ...base, xp: 11, turns: 11 }, before: base });
		const b = h.open();
		const told = b.sent.length;
		// This page opened before that save, as a page in another window does.
		b.say({ save: { ...base, xp: 11, turns: 11 }, before: base });
		const stored = h.store.get('deskPet.progress') as typeof base;
		assert.deepEqual([stored.xp, stored.turns], [12, 12]);
		// It knew less than there is, so it hears what there is now, and so does the other.
		assert.equal(((b.sent.at(-1) as { progress: typeof base }).progress).turns, 12);
		assert.equal(b.sent.length, told + 1);
		assert.equal(((a.sent.at(-1) as { progress: typeof base }).progress).turns, 12);
	});
	test('what is saved reaches a page opened later', () => {
		const h = harness();
		h.open().say({ save: { xp: 9 } });
		assert.deepEqual(first(h.open()).progress, { xp: 9 });
	});
	test('hiding turns the setting off and says how to bring it back, in the language of Breezell', () => {
		const h = harness();
		h.open().say({ hide: true });
		assert.equal(h.config.visible, false);
		assert.equal(h.notes.length, 1);
		assert.match(h.notes[0], /[一-鿿]/);
	});
	test('its settings go to every page as they change, and other settings do not', () => {
		const h = harness();
		const a = h.open();
		const b = h.open();
		h.config.size = 'large';
		h.changeConfig();
		for (const surface of [a, b]) {
			assert.deepEqual(surface.sent.at(-1), { type: 'settings', settings: { visible: true, size: 'large', speech: true } });
		}
		const count = a.sent.length;
		h.changeConfig('editor');
		assert.equal(a.sent.length, count);
	});
	test('a closed page is told nothing and heard no more', () => {
		const h = harness();
		const a = h.open();
		const b = h.open();
		a.close();
		const count = a.sent.length;
		b.say({ save: { xp: 1 } });
		h.changeConfig();
		assert.equal(a.sent.length, count);
		a.say({ save: { xp: 99 } });
		assert.deepEqual(h.store.get('deskPet.progress'), { xp: 1 });
	});
	test('another page of the plugin is left alone', () => {
		assert.deepEqual(harness().open('other').sent, []);
	});
	test('nonsense from a page is ignored', () => {
		const h = harness();
		const surface = h.open();
		const count = surface.sent.length;
		for (const message of [undefined, null, 3, 'x', {}, { other: true }]) {
			surface.say(message);
		}
		assert.equal(surface.sent.length, count);
		assert.equal(h.store.size, 0);
	});
	test('the command shows and hides', async () => {
		const h = harness();
		await h.commands.get('deskPet.toggle')!();
		assert.equal(h.config.visible, false);
		await h.commands.get('deskPet.toggle')!();
		assert.equal(h.config.visible, true);
	});
});
