// Focus Timer window. Runs sandboxed (no Node, no network); the settings and today's count are
// kept in this plugin's own storage, which survives restarts.
(() => {
	const $ = id => document.getElementById(id);
	const RING = 2 * Math.PI * 88;
	const today = new Date().toISOString().slice(0, 10);

	const load = () => {
		try {
			return JSON.parse(localStorage.getItem('focus-timer') || '{}');
		} catch {
			return {};
		}
	};
	const saved = load();
	const state = {
		focusMinutes: saved.focusMinutes || 25,
		breakMinutes: saved.breakMinutes || 5,
		sound: saved.sound !== false,
		sessions: saved.day === today ? saved.sessions || 0 : 0,
		phase: 'idle',         // idle | focus | break
		running: false,
		endsAt: 0,
		remainingMs: (saved.focusMinutes || 25) * 60_000,
	};
	const save = () => localStorage.setItem('focus-timer', JSON.stringify({ focusMinutes: state.focusMinutes, breakMinutes: state.breakMinutes, sound: state.sound, sessions: state.sessions, day: today }));

	const lengthOf = phase => (phase === 'break' ? state.breakMinutes : state.focusMinutes) * 60_000;
	const format = ms => {
		const total = Math.max(0, Math.round(ms / 1000));
		return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
	};

	function chime() {
		if (!state.sound) {
			return;
		}
		const ctx = new AudioContext();
		[659.25, 880, 1046.5].forEach((freq, i) => {
			const osc = ctx.createOscillator();
			const gain = ctx.createGain();
			const t = ctx.currentTime + i * 0.18;
			osc.frequency.value = freq;
			gain.gain.setValueAtTime(0, t);
			gain.gain.linearRampToValueAtTime(0.2, t + 0.02);
			gain.gain.exponentialRampToValueAtTime(0.001, t + 1.2);
			osc.connect(gain).connect(ctx.destination);
			osc.start(t);
			osc.stop(t + 1.3);
		});
		setTimeout(() => ctx.close(), 2000);
	}

	function render() {
		const remaining = state.running ? state.endsAt - Date.now() : state.remainingMs;
		const length = lengthOf(state.phase === 'idle' ? 'focus' : state.phase);
		$('time').textContent = format(remaining);
		$('phase').textContent = state.phase === 'idle' ? 'Ready' : state.phase === 'focus' ? (state.running ? 'Focus' : 'Focus · paused') : (state.running ? 'Break' : 'Break · paused');
		document.body.dataset.phase = state.phase;
		$('progress').style.strokeDashoffset = String(RING * (1 - Math.min(1, Math.max(0, 1 - remaining / length))));
		$('start').textContent = state.running ? 'Pause' : state.phase === 'idle' ? 'Start' : 'Resume';
		$('sessions').textContent = `${state.sessions} session${state.sessions === 1 ? '' : 's'} today`;
		document.title = state.phase === 'idle' ? 'Focus Timer' : `${format(remaining)} · Focus Timer`;
	}

	let lastReported = '';
	function report() {
		if (!window.breezell.connected) {
			return;
		}
		const remaining = format(state.running ? state.endsAt - Date.now() : state.remainingMs);
		const key = `${state.phase}|${remaining.slice(0, 2)}|${state.running}`;
		if (key !== lastReported) {
			lastReported = key;
			window.breezell.postMessage({ type: 'state', phase: state.phase, running: state.running, remaining });
		}
	}

	function begin(phase) {
		state.phase = phase;
		state.remainingMs = lengthOf(phase);
		state.endsAt = Date.now() + state.remainingMs;
		state.running = true;
	}

	function finishPhase() {
		chime();
		if (state.phase === 'focus') {
			state.sessions++;
			save();
			begin('break');
		} else {
			state.phase = 'idle';
			state.running = false;
			state.remainingMs = lengthOf('focus');
		}
	}

	function tick() {
		if (state.running && Date.now() >= state.endsAt) {
			finishPhase();
		}
		render();
		report();
	}

	$('start').addEventListener('click', () => {
		if (state.running) {
			state.remainingMs = state.endsAt - Date.now();
			state.running = false;
		} else if (state.phase === 'idle') {
			begin('focus');
		} else {
			state.endsAt = Date.now() + state.remainingMs;
			state.running = true;
		}
		tick();
	});
	$('reset').addEventListener('click', () => {
		state.phase = 'idle';
		state.running = false;
		state.remainingMs = lengthOf('focus');
		tick();
	});
	$('skip').addEventListener('click', () => {
		if (state.phase !== 'idle') {
			state.endsAt = Date.now();
			tick();
		}
	});
	for (const [id, key, max] of [['focusMinutes', 'focusMinutes', 120], ['breakMinutes', 'breakMinutes', 60]]) {
		$(id).value = String(state[key]);
		$(id).addEventListener('change', e => {
			state[key] = Math.min(max, Math.max(1, Math.round(Number(e.target.value) || 1)));
			e.target.value = String(state[key]);
			if (state.phase === 'idle') {
				state.remainingMs = lengthOf('focus');
			}
			save();
			tick();
		});
	}
	$('sound').checked = state.sound;
	$('sound').addEventListener('change', e => {
		state.sound = e.target.checked;
		save();
	});

	// Breezell: AI turns from the plugin (only while an editor relays them).
	$('link').textContent = window.breezell.connected ? '● Breezell' : '○ On its own';
	$('link').title = window.breezell.connected ? 'Connected to Breezell' : 'Opened without an editor: AI activity shows up when Breezell opens it';
	$('activityHint').textContent = window.breezell.connected ? 'Conversation turns show up here.' : 'Open this window from Breezell to see the AI\'s turns here.';
	window.breezell.onMessage(message => {
		if (message?.type !== 'turn') {
			return;
		}
		const list = $('activity');
		$('activityHint')?.remove();
		const item = document.createElement('li');
		item.textContent = message.phase === 'start' ? `Working… (${message.mode})` : `${message.outcome === 'completed' ? 'Done' : message.outcome} in ${message.seconds} s`;
		list.prepend(item);
		while (list.children.length > 6) {
			list.lastElementChild.remove();
		}
	});

	render();
	setInterval(tick, 250);
})();
