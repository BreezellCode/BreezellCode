// Focus Player panel. All sound except "My music" is synthesized here with Web Audio.
(function () {
	const vscode = acquireVsCodeApi();
	const $ = id => document.getElementById(id);
	const saved = vscode.getState() || {};

	const SCENES = {
		rain: 'Rain',
		deep: 'Deep focus',
		pad: 'Soft pad',
		tracks: 'My music',
	};

	let scene = SCENES[saved.scene] ? saved.scene : 'rain';
	let volume = typeof saved.volume === 'number' ? saved.volume : 0.6;
	let playing = false;
	let tracks = [];
	let trackIndex = typeof saved.trackIndex === 'number' ? saved.trackIndex : 0;

	/** @type {AudioContext | undefined} */
	let ctx;
	let master;
	let analyser;
	let stopScene = () => { };
	const audio = new Audio();
	audio.preload = 'auto';

	// ------------------------------------------------------------------ audio graph

	function ensureContext() {
		if (!ctx) {
			ctx = new AudioContext();
			master = ctx.createGain();
			master.gain.value = volume;
			analyser = ctx.createAnalyser();
			analyser.fftSize = 1024;
			master.connect(analyser);
			analyser.connect(ctx.destination);
		}
		if (ctx.state === 'suspended') {
			ctx.resume().catch(() => { });
		}
		return ctx;
	}

	function noiseBuffer(kind) {
		const length = ctx.sampleRate * 4;
		const buffer = ctx.createBuffer(2, length, ctx.sampleRate);
		for (let channel = 0; channel < 2; channel++) {
			const data = buffer.getChannelData(channel);
			let last = 0;
			let b0 = 0, b1 = 0, b2 = 0;
			for (let i = 0; i < length; i++) {
				const white = Math.random() * 2 - 1;
				if (kind === 'brown') {
					last = (last + 0.02 * white) / 1.02;
					data[i] = last * 3.5;
				} else {
					// pink-ish (Paul Kellet's economy filter)
					b0 = 0.99765 * b0 + white * 0.0990460;
					b1 = 0.96300 * b1 + white * 0.2965164;
					b2 = 0.57000 * b2 + white * 1.0526913;
					data[i] = (b0 + b1 + b2 + white * 0.1848) * 0.11;
				}
			}
		}
		return buffer;
	}

	function loop(buffer, destination) {
		const source = ctx.createBufferSource();
		source.buffer = buffer;
		source.loop = true;
		source.connect(destination);
		source.start();
		return source;
	}

	function fadeIn(node, to, seconds) {
		node.gain.setValueAtTime(0, ctx.currentTime);
		node.gain.linearRampToValueAtTime(to, ctx.currentTime + seconds);
	}

	function startRain() {
		const bus = ctx.createGain();
		fadeIn(bus, 1, 1.5);
		bus.connect(master);
		const pink = noiseBuffer('pink');
		const high = ctx.createBiquadFilter();
		high.type = 'highpass';
		high.frequency.value = 500;
		const low = ctx.createBiquadFilter();
		low.type = 'lowpass';
		low.frequency.value = 7000;
		const bed = ctx.createGain();
		bed.gain.value = 0.55;
		high.connect(low).connect(bed).connect(bus);
		const sources = [loop(pink, high)];
		// Drops: short filtered bursts at random moments.
		const drops = ctx.createGain();
		drops.gain.value = 0.25;
		drops.connect(bus);
		let alive = true;
		const drop = () => {
			if (!alive) {
				return;
			}
			const source = ctx.createBufferSource();
			source.buffer = pink;
			const band = ctx.createBiquadFilter();
			band.type = 'bandpass';
			band.frequency.value = 1800 + Math.random() * 3500;
			band.Q.value = 6;
			const env = ctx.createGain();
			const t = ctx.currentTime;
			env.gain.setValueAtTime(0, t);
			env.gain.linearRampToValueAtTime(0.4 + Math.random() * 0.6, t + 0.004);
			env.gain.exponentialRampToValueAtTime(0.001, t + 0.06 + Math.random() * 0.08);
			source.connect(band).connect(env).connect(drops);
			source.start(t, Math.random() * 3, 0.2);
			setTimeout(drop, 25 + Math.random() * 140);
		};
		drop();
		return () => {
			alive = false;
			bus.gain.cancelScheduledValues(ctx.currentTime);
			bus.gain.setTargetAtTime(0, ctx.currentTime, 0.2);
			setTimeout(() => { sources.forEach(s => s.stop()); bus.disconnect(); }, 900);
		};
	}

	function startDeep() {
		const bus = ctx.createGain();
		fadeIn(bus, 1, 2);
		bus.connect(master);
		const low = ctx.createBiquadFilter();
		low.type = 'lowpass';
		low.frequency.value = 650;
		const noise = ctx.createGain();
		noise.gain.value = 0.7;
		low.connect(noise).connect(bus);
		const sources = [loop(noiseBuffer('brown'), low)];
		// A quiet fifth that breathes.
		const drone = ctx.createGain();
		drone.gain.value = 0.05;
		drone.connect(bus);
		const lfo = ctx.createOscillator();
		lfo.frequency.value = 0.07;
		const depth = ctx.createGain();
		depth.gain.value = 0.03;
		lfo.connect(depth).connect(drone.gain);
		lfo.start();
		const oscillators = [110, 164.81, 220.5].map(freq => {
			const osc = ctx.createOscillator();
			osc.type = 'sine';
			osc.frequency.value = freq;
			osc.connect(drone);
			osc.start();
			return osc;
		});
		return () => {
			bus.gain.cancelScheduledValues(ctx.currentTime);
			bus.gain.setTargetAtTime(0, ctx.currentTime, 0.3);
			setTimeout(() => { [...sources, lfo, ...oscillators].forEach(n => n.stop()); bus.disconnect(); }, 1200);
		};
	}

	function startPad() {
		const bus = ctx.createGain();
		fadeIn(bus, 1, 1);
		bus.connect(master);
		const tone = ctx.createBiquadFilter();
		tone.type = 'lowpass';
		tone.frequency.value = 1400;
		tone.connect(bus);
		// Cmaj7 – Am7 – Fmaj7 – G6, four seconds each.
		const chords = [
			[130.81, 261.63, 329.63, 392.00, 493.88],
			[110.00, 220.00, 261.63, 329.63, 392.00],
			[87.31, 174.61, 220.00, 261.63, 329.63],
			[98.00, 196.00, 246.94, 293.66, 329.63],
		];
		const crackle = ctx.createGain();
		crackle.gain.value = 0.04;
		const crackleFilter = ctx.createBiquadFilter();
		crackleFilter.type = 'highpass';
		crackleFilter.frequency.value = 3000;
		crackleFilter.connect(crackle).connect(bus);
		const sources = [loop(noiseBuffer('pink'), crackleFilter)];
		let step = 0;
		const voices = [];
		const play = () => {
			const t = ctx.currentTime;
			for (const freq of chords[step % chords.length]) {
				for (const detune of [-6, 6]) {
					const osc = ctx.createOscillator();
					osc.type = 'triangle';
					osc.frequency.value = freq;
					osc.detune.value = detune;
					const env = ctx.createGain();
					env.gain.setValueAtTime(0, t);
					env.gain.linearRampToValueAtTime(0.035, t + 1.2);
					env.gain.setValueAtTime(0.035, t + 3.2);
					env.gain.linearRampToValueAtTime(0, t + 5.2);
					osc.connect(env).connect(tone);
					osc.start(t);
					osc.stop(t + 5.3);
					voices.push(osc);
				}
			}
			step++;
		};
		play();
		const timer = setInterval(play, 4000);
		return () => {
			clearInterval(timer);
			bus.gain.cancelScheduledValues(ctx.currentTime);
			bus.gain.setTargetAtTime(0, ctx.currentTime, 0.3);
			setTimeout(() => { [...sources, ...voices].forEach(n => { try { n.stop(); } catch { /* already stopped */ } }); bus.disconnect(); }, 1200);
		};
	}

	function startTracks() {
		if (!tracks.length) {
			return () => { };
		}
		trackIndex = ((trackIndex % tracks.length) + tracks.length) % tracks.length;
		const track = tracks[trackIndex];
		if (audio.dataset.src !== track.src) {
			audio.src = track.src;
			audio.dataset.src = track.src;
		}
		audio.volume = volume;
		audio.play().catch(() => showHint(true));
		return () => audio.pause();
	}

	function chime(outcome) {
		ensureContext();
		const t = ctx.currentTime;
		const notes = outcome === 'completed' ? [880, 1318.51] : [659.25, 523.25];
		notes.forEach((freq, i) => {
			const osc = ctx.createOscillator();
			osc.type = 'sine';
			osc.frequency.value = freq;
			const env = ctx.createGain();
			const start = t + i * 0.14;
			env.gain.setValueAtTime(0, start);
			env.gain.linearRampToValueAtTime(0.18, start + 0.01);
			env.gain.exponentialRampToValueAtTime(0.0008, start + 1.4);
			osc.connect(env).connect(ctx.destination);
			osc.start(start);
			osc.stop(start + 1.5);
		});
	}

	// ------------------------------------------------------------------ playback

	function title() {
		return scene === 'tracks' && tracks[trackIndex] ? tracks[trackIndex].name : SCENES[scene];
	}

	function report() {
		vscode.setState({ scene, volume, trackIndex });
		vscode.postMessage({ type: 'state', playing, title: playing ? title() : '' });
		$('play').textContent = playing ? '⏸' : '▶';
		$('now').textContent = title();
		$('prev').disabled = $('next').disabled = scene !== 'tracks' || tracks.length < 2;
		document.querySelectorAll('[data-scene]').forEach(b => b.setAttribute('aria-selected', String(b.dataset.scene === scene)));
		$('tracksBox').hidden = scene !== 'tracks';
		document.querySelectorAll('#trackList li').forEach((li, i) => li.classList.toggle('current', scene === 'tracks' && i === trackIndex));
	}

	function showHint(show) {
		$('hint').hidden = !show;
	}

	function play() {
		stopScene();
		if (scene !== 'tracks') {
			ensureContext();
			if (ctx.state !== 'running') {
				showHint(true);
			}
			stopScene = scene === 'rain' ? startRain() : scene === 'deep' ? startDeep() : startPad();
		} else {
			stopScene = startTracks();
		}
		playing = scene !== 'tracks' || tracks.length > 0;
		report();
	}

	function pause() {
		stopScene();
		stopScene = () => { };
		playing = false;
		report();
	}

	function setScene(next) {
		const wasPlaying = playing;
		if (playing) {
			pause();
		}
		scene = next;
		if (wasPlaying) {
			play();
		}
		report();
	}

	function step(delta) {
		if (!tracks.length) {
			return;
		}
		trackIndex = (trackIndex + delta + tracks.length) % tracks.length;
		if (playing && scene === 'tracks') {
			play();
		}
		report();
	}

	audio.addEventListener('ended', () => step(1));

	// ------------------------------------------------------------------ wave

	const canvas = $('wave');
	const g = canvas.getContext('2d');
	const samples = new Uint8Array(1024);
	function draw() {
		const w = canvas.width;
		const h = canvas.height;
		g.clearRect(0, 0, w, h);
		const color = getComputedStyle(document.body).getPropertyValue('--vscode-textLink-foreground') || '#4f8cff';
		g.strokeStyle = color.trim();
		g.lineWidth = 2;
		g.beginPath();
		if (analyser && playing && scene !== 'tracks') {
			analyser.getByteTimeDomainData(samples);
			for (let i = 0; i < samples.length; i++) {
				const x = (i / (samples.length - 1)) * w;
				const y = h / 2 + ((samples[i] - 128) / 128) * (h / 2) * 1.6;
				i ? g.lineTo(x, y) : g.moveTo(x, y);
			}
		} else {
			const t = Date.now() / 900;
			for (let x = 0; x <= w; x += 4) {
				const y = h / 2 + Math.sin(x / 38 + t) * (playing ? 18 : 4);
				x ? g.lineTo(x, y) : g.moveTo(x, y);
			}
		}
		g.stroke();
		requestAnimationFrame(draw);
	}
	requestAnimationFrame(draw);

	// ------------------------------------------------------------------ UI

	document.querySelectorAll('[data-scene]').forEach(button => button.addEventListener('click', () => setScene(button.dataset.scene)));
	$('play').addEventListener('click', () => { showHint(false); playing ? pause() : play(); });
	$('prev').addEventListener('click', () => step(-1));
	$('next').addEventListener('click', () => step(1));
	$('choose').addEventListener('click', () => vscode.postMessage({ type: 'chooseFolder' }));
	$('volume').value = String(Math.round(volume * 100));
	$('volume').addEventListener('input', e => {
		volume = Number(e.target.value) / 100;
		if (master) {
			master.gain.setTargetAtTime(volume, ctx.currentTime, 0.05);
		}
		audio.volume = volume;
		report();
	});
	$('chime').addEventListener('change', e => vscode.postMessage({ type: 'setting', key: 'chime', value: e.target.checked }));
	$('auto').addEventListener('change', e => vscode.postMessage({ type: 'setting', key: 'playWhileAgentWorks', value: e.target.checked }));

	function setBreezell(available, signedIn) {
		const pill = $('breezell');
		pill.textContent = !available ? 'Breezell features off' : signedIn ? 'Breezell ✓' : 'Sign in to Breezell';
		pill.classList.toggle('ok', available && signedIn);
	}

	function log(text) {
		const list = $('log');
		if (list.firstElementChild?.classList.contains('muted')) {
			list.innerHTML = '';
		}
		const item = document.createElement('li');
		item.textContent = `${new Date().toLocaleTimeString()}  ${text}`;
		list.prepend(item);
		while (list.children.length > 8) {
			list.lastElementChild.remove();
		}
	}

	window.addEventListener('message', ({ data }) => {
		switch (data?.type) {
			case 'init': {
				tracks = Array.isArray(data.tracks) ? data.tracks : [];
				$('folder').textContent = data.folder || 'No folder chosen';
				const list = $('trackList');
				list.innerHTML = '';
				tracks.forEach((track, i) => {
					const li = document.createElement('li');
					li.textContent = track.name;
					li.addEventListener('click', () => { trackIndex = i; scene = 'tracks'; play(); });
					list.appendChild(li);
				});
				if (!tracks.length) {
					const li = document.createElement('li');
					li.className = 'muted';
					li.textContent = data.folder ? 'No audio files in this folder.' : 'Choose a folder with your music.';
					list.appendChild(li);
				}
				$('chime').checked = !!data.settings?.chime;
				$('auto').checked = !!data.settings?.playWhileAgentWorks;
				setBreezell(!!data.breezell?.available, !!data.breezell?.signedIn);
				report();
				break;
			}
			case 'signin':
				setBreezell(true, !!data.signedIn);
				break;
			case 'toggle':
				playing ? pause() : play();
				break;
			case 'play':
				if (!playing) {
					play();
				}
				break;
			case 'pause':
				if (playing) {
					pause();
				}
				break;
			case 'chime':
				chime(data.outcome);
				break;
			case 'turn':
				log(data.phase === 'start'
					? `AI turn started (${data.mode})`
					: `AI turn ${data.outcome === 'completed' ? 'finished' : data.outcome} in ${data.seconds} s`);
				break;
		}
	});

	report();
	vscode.postMessage({ type: 'ready' });
})();
