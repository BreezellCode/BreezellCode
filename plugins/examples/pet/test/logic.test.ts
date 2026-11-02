import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { suite, test } from 'node:test';
import {
	applyPetEvent, DEFAULT_PERCH, frameAround, IPetProgress, newPetProgress, petDaysTogether, petFloatLift, petFloatSteps, petHairShift, petLeft, petLevel, PET_LEVEL_XP, PET_MAX_LEVEL, petMood,
	petPerchAt, petWidth, PET_POSES, PET_POSE_MS, PET_SIZES, petSizeOf, readPetProgress, resolvePetPose, restFrame,
} from '../src/logic';
import { PET_STRINGS, petStrings } from '../src/strings';

const NOW = 1_800_000_000_000;
const HOUR = 3_600_000;
const root = join(__dirname, '..', '..');

suite('what it is doing', () => {
	test('being held comes before everything', () => {
		assert.equal(resolvePetPose({ dragging: true, floating: true, moment: 'celebrate', activity: 'waiting', typing: true, asleep: true }), 'drag');
	});
	test('floating down comes before anything but being held', () => {
		assert.equal(resolvePetPose({ floating: true, moment: 'celebrate', activity: 'waiting' }), 'float');
	});
	test('a moment plays over what the chat is doing', () => {
		assert.equal(resolvePetPose({ moment: 'celebrate', activity: 'working' }), 'celebrate');
	});
	test('each state of the chat has its pose', () => {
		assert.equal(resolvePetPose({ activity: 'waiting' }), 'wait');
		assert.equal(resolvePetPose({ activity: 'working' }), 'work');
		assert.equal(resolvePetPose({ activity: 'writing' }), 'write');
		assert.equal(resolvePetPose({ activity: 'thinking' }), 'think');
	});
	test('the chat comes before the user typing, walking and sleep, in that order', () => {
		assert.equal(resolvePetPose({ activity: 'thinking', typing: true, walking: true, asleep: true }), 'think');
		assert.equal(resolvePetPose({ activity: 'none', typing: true, walking: true, asleep: true }), 'watch');
		assert.equal(resolvePetPose({ activity: 'none', walking: true, asleep: true }), 'walk');
		assert.equal(resolvePetPose({ activity: 'none', asleep: true }), 'sleep');
		assert.equal(resolvePetPose({ activity: 'none' }), 'idle');
	});
	test('every moment is a pose and ends', () => {
		for (const [pose, ms] of Object.entries(PET_POSE_MS)) {
			assert.ok(PET_POSES.includes(pose as never), pose);
			assert.ok(ms > 0 && ms < 10_000, pose);
		}
	});
});

suite('growing up', () => {
	test('the levels start at nothing and only go up', () => {
		assert.equal(PET_LEVEL_XP[0], 0);
		for (let i = 1; i < PET_LEVEL_XP.length; i++) {
			assert.ok(PET_LEVEL_XP[i] > PET_LEVEL_XP[i - 1]);
		}
	});
	test('a level is reached exactly at its experience', () => {
		for (let i = 0; i < PET_LEVEL_XP.length; i++) {
			assert.equal(petLevel(PET_LEVEL_XP[i]).level, i + 1);
			if (i > 0) {
				assert.equal(petLevel(PET_LEVEL_XP[i] - 1).level, i);
			}
		}
	});
	test('how far into a level', () => {
		assert.deepEqual(petLevel(7), { level: 2, into: 2, needed: 10 });
	});
	test('the last level has nothing further, however much there is', () => {
		assert.deepEqual(petLevel(1e9), { level: PET_MAX_LEVEL, into: 0, needed: 0 });
	});
	test('a finished turn earns experience and cheers it up', () => {
		const { progress } = applyPetEvent(newPetProgress(NOW), 'turnDone', NOW);
		assert.equal(progress.xp, 1);
		assert.equal(progress.turns, 1);
		assert.equal(progress.mood, 73);
	});
	test('the turn that crosses a level says so, the one after does not', () => {
		const start = { ...newPetProgress(NOW), xp: 4 };
		const first = applyPetEvent(start, 'turnDone', NOW);
		assert.equal(first.levelUp, 2);
		assert.equal(applyPetEvent(first.progress, 'turnDone', NOW).levelUp, undefined);
	});
	test('a failed turn costs a little mood and no experience', () => {
		const { progress } = applyPetEvent(newPetProgress(NOW), 'turnFailed', NOW);
		assert.equal(progress.xp, 0);
		assert.equal(progress.turns, 0);
		assert.equal(progress.mood, 68);
	});
	test('patting earns no experience', () => {
		assert.equal(applyPetEvent(newPetProgress(NOW), 'pat', NOW).progress.xp, 0);
	});
	test('it refuses food when full, and nothing changes', () => {
		const fed = applyPetEvent(newPetProgress(NOW), 'feed', NOW).progress;
		const again = applyPetEvent(fed, 'feed', NOW + 59_000);
		assert.equal(again.refused, true);
		assert.equal(again.progress, fed);
		assert.equal(applyPetEvent(fed, 'feed', NOW + 60_000).refused, undefined);
	});
	test('feeding and playing over and over is not growing up', () => {
		let progress = newPetProgress(NOW);
		for (let i = 0; i < 20; i++) {
			progress = applyPetEvent(applyPetEvent(progress, 'feed', NOW + i * 61_000).progress, 'play', NOW + i * 61_000).progress;
		}
		assert.equal(progress.fed, 20);
		assert.equal(progress.played, 20);
		assert.equal(progress.xp, 2); // the first feed and the first play
	});
	test('care counts again after half an hour', () => {
		const fed = applyPetEvent(newPetProgress(NOW), 'feed', NOW).progress;
		assert.equal(applyPetEvent(fed, 'feed', NOW + 30 * 60_000).progress.xp, fed.xp + 1);
	});
	test('its mood stays between 0 and 100', () => {
		let progress = newPetProgress(NOW);
		for (let i = 0; i < 30; i++) {
			progress = applyPetEvent(progress, 'play', NOW).progress;
		}
		assert.equal(progress.mood, 100);
		for (let i = 0; i < 80; i++) {
			progress = applyPetEvent(progress, 'turnFailed', NOW).progress;
		}
		assert.equal(progress.mood, 0);
	});
	test('left alone its mood sinks slowly, not past a floor', () => {
		const start = newPetProgress(NOW);
		assert.equal(petMood(start, NOW), 70);
		assert.equal(petMood(start, NOW + 5 * HOUR), 60);
		assert.equal(petMood(start, NOW + 10_000 * HOUR), 30);
	});
	test('a mood already under the floor does not rise by itself or sink', () => {
		const low: IPetProgress = { ...newPetProgress(NOW), mood: 10 };
		assert.equal(petMood(low, NOW + 100 * HOUR), 10);
	});
	test('a clock that went back does not raise its mood', () => {
		assert.equal(petMood(newPetProgress(NOW), NOW - 100 * HOUR), 70);
	});
	test('days together count from the first', () => {
		const start = newPetProgress(NOW);
		assert.equal(petDaysTogether(start, NOW), 1);
		assert.equal(petDaysTogether(start, NOW + 24 * HOUR), 2);
		assert.equal(petDaysTogether(start, NOW - 48 * HOUR), 1);
	});
});

suite('what was kept', () => {
	test('nothing kept, or nonsense, is a new pet', () => {
		for (const raw of [undefined, null, 3, 'x', [], true]) {
			assert.deepEqual(readPetProgress(raw, NOW), newPetProgress(NOW));
		}
	});
	test('a good record comes back whole', () => {
		const kept = applyPetEvent({ ...newPetProgress(NOW - 9 * HOUR), perch: 0.2, xp: 40 }, 'turnDone', NOW).progress;
		assert.deepEqual(readPetProgress(JSON.parse(JSON.stringify(kept)), NOW), kept);
	});
	test('damaged fields are put right one by one', () => {
		const read = readPetProgress({ xp: -4, turns: 'many', fed: NaN, played: 2.9, mood: 900, moodAt: -1, bornAt: Infinity, fedAt: 'x', perch: 7 }, NOW);
		assert.deepEqual(read, { xp: 0, turns: 0, fed: 0, played: 2, mood: 100, moodAt: NOW, bornAt: NOW, fedAt: 0, playedAt: 0, perch: 1 });
	});
	test('a missing perch is the usual one', () => {
		assert.equal(readPetProgress({ xp: 1 }, NOW).perch, DEFAULT_PERCH);
	});
});

suite('where it stands', () => {
	test('it stays on the box at both ends', () => {
		assert.equal(petLeft(0, 600, 64), 8);
		assert.equal(petLeft(1, 600, 64), 600 - 64 - 8);
		assert.equal(petLeft(-3, 600, 64), 8);
		assert.equal(petLeft(9, 600, 64), 600 - 64 - 8);
	});
	test('a box too small for it does not push it off', () => {
		assert.equal(petLeft(0.5, 40, 64), 8);
	});
	test('dropping it where it stands keeps its perch', () => {
		for (const perch of [0, 0.25, 0.86, 1]) {
			assert.ok(Math.abs(petPerchAt(petLeft(perch, 600, 64), 600, 64) - perch) < 1e-9);
		}
	});
	test('dropped past the ends, or on a box with no room', () => {
		assert.equal(petPerchAt(-50, 600, 64), 0);
		assert.equal(petPerchAt(5000, 600, 64), 1);
		assert.equal(petPerchAt(10, 40, 64), DEFAULT_PERCH);
	});
	test('the sizes, and anything else is medium', () => {
		assert.equal(petSizeOf('small'), 'small');
		assert.equal(petSizeOf('large'), 'large');
		for (const size of ['medium', 'huge', 3, undefined]) {
			assert.equal(petSizeOf(size), 'medium');
		}
	});
	test('its usual frame has room for its jumps, and fits what Breezell allows', () => {
		for (const size of Object.values(PET_SIZES)) {
			const frame = restFrame(size);
			assert.ok(frame.width > petWidth(size) && frame.height > size);
			assert.ok(frame.width <= 240 && frame.height <= 240);
		}
	});
	test('floating down takes longer from higher up', () => {
		assert.ok(petFloatSteps(600) > petFloatSteps(100));
		assert.equal(petFloatSteps(0), 12);
	});
	test('no step of it is large, from any height: fast movement leaves pieces on the screen', () => {
		for (const from of [20, 100, 300, 700, 1400]) {
			const steps = petFloatSteps(from);
			let last = from;
			for (let i = 1; i <= steps; i++) {
				const lift = petFloatLift(from, i / steps);
				assert.ok(last - lift <= 6.4, `${from} step ${i}: ${last - lift}`);
				assert.ok(lift <= last);
				last = lift;
			}
			assert.equal(last, 0);
		}
	});
	test('it starts where it was and ends on the box', () => {
		assert.equal(petFloatLift(300, 0), 300);
		assert.equal(petFloatLift(300, 1), 0);
		assert.equal(petFloatLift(300, 2), 0);
		assert.equal(petFloatLift(300, -1), 300);
	});
	test('her hair stays still at her head and moves towards the ends', () => {
		for (const seconds of [0, .7, 1.9, 40]) {
			assert.equal(Math.abs(petHairShift(0, seconds)), 0);
			assert.equal(Math.abs(petHairShift(.19, seconds)), 0);
		}
		const reach = (row: number) => Math.max(...Array.from({ length: 200 }, (_, i) => Math.abs(petHairShift(row, i / 20))));
		assert.ok(reach(.8) > reach(.4));
		assert.ok(reach(.4) > 0);
	});
	test('never far, so it stays hair, and it keeps moving', () => {
		for (let i = 0; i < 500; i++) {
			assert.ok(Math.abs(petHairShift(i / 500, i / 7)) <= .034);
		}
		assert.notEqual(petHairShift(.8, 1), petHairShift(.8, 2));
	});
	test('more wind blows it further, and none not at all', () => {
		assert.equal(Math.abs(petHairShift(.8, 1, 0)), 0);
		assert.ok(Math.abs(petHairShift(.8, 1, 2)) > Math.abs(petHairShift(.8, 1, 1)));
	});
	test('the frame is centred on the pet', () => {
		assert.deepEqual(frameAround(300, 64, 96, 600), { left: 284, petX: 16 });
	});
	test('the ends of the box push the frame aside and the pet stays where it is', () => {
		const atLeft = frameAround(8, 64, 190, 600);
		assert.equal(atLeft.left + atLeft.petX, 8);
		assert.equal(atLeft.left, 0);
		const atRight = frameAround(528, 64, 190, 600);
		assert.equal(atRight.left + atRight.petX, 528);
		assert.equal(atRight.left + 190, 600);
	});
	test('a frame wider than the box starts at its left end', () => {
		assert.equal(frameAround(100, 64, 190, 150).left, 0);
	});
});

suite('its words', () => {
	const languages = Object.keys(PET_STRINGS);
	test('every language Breezell has', () => {
		assert.deepEqual([...languages].sort(), ['en', 'es', 'ja', 'ko', 'pt-BR', 'ru', 'zh-CN', 'zh-TW']);
	});
	test('another language, or none, is English', () => {
		for (const language of ['de', undefined, 3, 'constructor', '__proto__']) {
			assert.equal(petStrings(language), PET_STRINGS.en);
		}
	});
	for (const language of languages) {
		test(`${language} says everything`, () => {
			const t = petStrings(language);
			assert.equal(t.titles.length, PET_MAX_LEVEL);
			assert.ok(t.turns.includes('{count}'), 'turns');
			assert.ok(t.days.includes('{count}'), 'days');
			assert.ok(t.levelup.includes('{title}'), 'levelup');
			for (const [key, value] of Object.entries(t)) {
				for (const line of Array.isArray(value) ? value : [value]) {
					assert.ok(typeof line === 'string' && line.trim(), `${key} is empty`);
				}
				if (Array.isArray(value)) {
					assert.ok(value.length > 0, key);
				}
			}
			assert.deepEqual(Object.keys(t), Object.keys(PET_STRINGS.en));
		});
	}
});

suite('the files', () => {
	const css = readFileSync(join(root, 'ui', 'pet.css'), 'utf8');
	const html = readFileSync(join(root, 'ui', 'pet.html'), 'utf8');
	const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));

	test('the page loads nothing from anywhere else', () => {
		assert.doesNotMatch(html, /https?:|\/\//);
		assert.doesNotMatch(css, /url\(|@import|https?:/);
	});
	test('she blinks in the usual picture, briefly and often, and sleeps with her eyes shut', () => {
		assert.match(css, /\[data-image="base"\] #figure img\[data-name="blink"\] \{[^}]*animation: pet-blink/);
		assert.match(css, /\[data-pet-pose="sleep"\]\[data-image="base"\] #figure img\[data-name="blink"\] \{[^}]*opacity: 1/);
		assert.match(css, /@keyframes pet-blink/);
	});
	test('nothing in the page can be selected or show a selection', () => {
		assert.match(css, /\* \{[^}]*user-select: none/);
		assert.match(css, /::selection \{ background: transparent; \}/);
	});
	test('its background lets the chat show through', () => {
		assert.match(css, /html, body \{[^}]*background: transparent/);
		assert.match(css, /html, body \{[^}]*pointer-events: none/);
	});
	test('the moments have something to play', () => {
		for (const pose of Object.keys(PET_POSE_MS)) {
			assert.ok(css.includes(`[data-pet-pose="${pose}"]`), pose);
		}
	});
	test('every animation used is defined, under its own name', () => {
		const used = new Set([...css.matchAll(/animation:\s*(pet-[\w-]+)/g)].map(m => m[1]));
		assert.ok(used.size > 5);
		for (const name of used) {
			assert.ok(css.includes(`@keyframes ${name}`), name);
		}
	});
	test('the manifest declares a companion and what it needs', () => {
		const [surface] = manifest.contributes.breezell.ui.surfaces;
		assert.equal(surface.slot, 'chat.input.companion');
		assert.equal(surface.entry, 'ui/pet.html');
		assert.deepEqual([...manifest.breezell.optionalPermissions].sort(), ['chat.events', 'ui.contribute', 'ui.modify']);
		assert.deepEqual(manifest.breezell.permissions, []);
	});
	test('its card in Feature Options has every setting it declares, in every language', () => {
		const { options } = manifest.contributes.breezell.ui;
		const declared = manifest.contributes.configuration.properties;
		assert.deepEqual(options.items.map((i: { setting: string }) => i.setting).sort(), Object.keys(declared).sort());
		const languages = Object.keys(PET_STRINGS).filter(l => l !== 'en').sort();
		const translated = (l10n: object) => assert.deepEqual(Object.keys(l10n).sort(), languages);
		translated(options.l10n);
		for (const item of options.items) {
			translated(item.l10n);
			if (declared[item.setting].enum) {
				assert.deepEqual(item.choices.map((c: { value: string }) => c.value), declared[item.setting].enum);
				item.choices.forEach((c: { l10n: object }) => translated(c.l10n));
			} else {
				assert.equal(declared[item.setting].type, 'boolean');
			}
		}
	});
	test('nothing is named after Breezell, which a plugin could not run', () => {
		for (const { command } of manifest.contributes.commands) {
			assert.doesNotMatch(command, /breezell/i);
		}
		for (const key of Object.keys(manifest.contributes.configuration.properties)) {
			assert.doesNotMatch(key, /breezell/i);
		}
	});
});
