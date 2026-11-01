// The settings page: draws the state src/settings.ts posts and asks it for what the user does.
// The page is built once; later states only change what differs, so a focused control keeps focus.
(function () {
	const api = acquireVsCodeApi();
	const root = document.getElementById('page');
	let state;
	const updaters = [];

	const el = (tag, cls, text) => {
		const e = document.createElement(tag);
		if (cls) { e.className = cls; }
		if (text !== undefined) { e.textContent = text; }
		return e;
	};
	const ask = m => api.postMessage(m);
	const button = (cls, onClick) => {
		const b = el('button', cls);
		b.type = 'button';
		b.addEventListener('click', onClick);
		return b;
	};
	const size = n => {
		const mb = n / 1048576;
		return mb >= 1024 ? `${(mb / 1024).toFixed(1)} GB` : `${mb >= 10 ? mb.toFixed(0) : mb.toFixed(1)} MB`;
	};
	const show = (e, on) => { e.hidden = !on; };
	const fill = (t, value) => t.replace('{0}', value);

	function section(title) {
		const s = el('section', 'section');
		const h = el('h2', 'heading');
		updaters.push(() => { h.textContent = title(); });
		s.append(h);
		root.append(s);
		return s;
	}

	function note(parent, text) {
		const p = el('p', 'note');
		updaters.push(() => { p.textContent = text(); });
		parent.append(p);
		return p;
	}

	function packRow(parent, index) {
		const row = el('div', 'pack');
		const head = el('div', 'pack-head');
		const name = el('span', 'pack-name');
		const badge = el('span', 'badge');
		const meta = el('span', 'pack-size');
		head.append(name, badge, meta);
		const use = el('div', 'pack-use');
		const status = el('div', 'pack-status');
		const bar = el('div', 'bar');
		bar.setAttribute('role', 'progressbar');
		bar.setAttribute('aria-valuemin', '0');
		bar.setAttribute('aria-valuemax', '100');
		const fillBar = el('div', 'bar-fill');
		bar.append(fillBar);
		const error = el('div', 'error');
		const actions = el('div', 'pack-actions');
		const get = button('primary', () => ask({ type: 'download', pack: state.packs[index].id }));
		const cancel = button('secondary', () => ask({ type: 'cancel', pack: state.packs[index].id }));
		const remove = button('secondary', () => ask({ type: 'remove', pack: state.packs[index].id }));
		actions.append(get, cancel, remove);
		const left = el('div', 'pack-main');
		left.append(head, use, status, bar, error);
		row.append(left, actions);
		parent.append(row);
		updaters.push(() => {
			const p = state.packs[index];
			const s = state.strings;
			name.textContent = p.name;
			badge.textContent = s.inUse;
			show(badge, p.inUse);
			meta.textContent = size(p.size);
			use.textContent = p.use;
			const downloading = p.state === 'downloading';
			const percent = p.total ? Math.min(100, Math.floor(p.received * 100 / p.total)) : 0;
			status.textContent = downloading
				? `${percent}% · ${size(p.received)} / ${size(p.total)}${p.bytesPerSecond > 1024 ? ` · ${fill(s.speed, size(p.bytesPerSecond))}` : ''}`
				: p.state === 'ready' ? s.ready : p.state === 'outdated' ? s.outdated : p.state === 'missing' ? s.missing : s.checking;
			status.className = `pack-status ${p.state === 'ready' ? 'ok' : ''}`;
			show(bar, downloading);
			fillBar.style.width = `${percent}%`;
			bar.setAttribute('aria-valuenow', String(percent));
			bar.setAttribute('aria-label', p.name);
			error.textContent = p.error;
			show(error, !!p.error);
			get.textContent = p.state === 'outdated' ? s.update : s.download;
			show(get, p.state === 'missing' || p.state === 'outdated');
			cancel.textContent = s.cancel;
			show(cancel, downloading);
			remove.textContent = s.remove;
			show(remove, p.state === 'ready' || p.state === 'outdated');
		});
	}

	function row(parent, label, control, description) {
		const r = el('div', 'row');
		const text = el('div', 'row-text');
		const l = el('label', 'row-label');
		const d = el('div', 'row-note');
		text.append(l, d);
		r.append(text, control);
		const id = `c${parent.childElementCount}-${Math.random().toString(36).slice(2, 8)}`;
		control.id = id;
		l.htmlFor = id;
		parent.append(r);
		updaters.push(() => {
			l.textContent = label();
			const n = description ? description() : '';
			d.textContent = n;
			show(d, !!n);
		});
	}

	function select(key, options) {
		const s = el('select', 'select');
		s.addEventListener('change', () => {
			if (key === 'layout') {
				ask({ type: 'layout', id: s.value });
			} else {
				ask({ type: 'set', key, value: key === 'pageSize' ? Number(s.value) : s.value });
			}
		});
		let shown = '';
		updaters.push(() => {
			const list = options();
			const signature = JSON.stringify(list);
			if (signature !== shown) {
				shown = signature;
				s.replaceChildren(...list.map(o => {
					const opt = el('option', '', o.label);
					opt.value = String(o.id);
					return opt;
				}));
			}
			if (document.activeElement !== s) {
				s.value = String(state[key]);
			}
		});
		return s;
	}

	function toggle(key) {
		const c = el('input', 'toggle');
		c.type = 'checkbox';
		c.addEventListener('change', () => ask({ type: 'set', key, value: c.checked }));
		updaters.push(() => { c.checked = !!state[key]; });
		return c;
	}

	function build() {
		const header = el('header', 'header');
		const title = el('h1', 'title', 'Breezell IME');
		const lede = el('p', 'lede');
		header.append(title, lede);
		root.append(header);
		updaters.push(() => { lede.textContent = state.strings.lede; });

		const data = section(() => state.strings.languages);
		note(data, () => state.strings.languagesNote);
		const needs = el('div', 'callout');
		data.append(needs);
		updaters.push(() => {
			needs.textContent = state.needed ? fill(state.strings.needs, state.needed) : '';
			show(needs, !!state.needed);
		});
		const packs = el('div', 'packs');
		data.append(packs);
		state.packs.forEach((_, i) => packRow(packs, i));
		const folder = el('div', 'folder');
		const folderLabel = el('span', 'folder-label');
		const folderPath = el('code', 'folder-path');
		const folderButton = button('link', () => ask({ type: 'chooseFolder' }));
		folder.append(folderLabel, folderPath, folderButton);
		data.append(folder);
		updaters.push(() => {
			folderLabel.textContent = state.strings.folder;
			folderPath.textContent = state.dataDir;
			folderPath.title = state.dataDir;
			folderButton.textContent = state.strings.change;
		});

		const typing = section(() => state.strings.typing);
		row(typing, () => state.strings.layout, select('layout', () => state.layouts.map(l => ({ id: l.id, label: l.label }))));
		row(typing, () => state.strings.script, select('chineseScript', () => [
			{ id: 'auto', label: state.strings.scriptAuto },
			{ id: 'simplified', label: state.strings.scriptSimplified },
			{ id: 'traditional', label: state.strings.scriptTraditional },
		]), () => state.strings.scriptNote);
		row(typing, () => state.strings.pageSize, select('pageSize', () => [3, 4, 5, 6, 7, 8, 9].map(n => ({ id: n, label: String(n) }))));
		row(typing, () => state.strings.englishInCode, toggle('englishInCode'), () => state.strings.englishInCodeNote);
		row(typing, () => state.strings.prediction, toggle('prediction'), () => state.strings.predictionNote);
		row(typing, () => state.strings.wubiSmartOrder, toggle('wubiSmartOrder'), () => state.strings.wubiSmartOrderNote);
		row(typing, () => state.strings.learning, toggle('learning'), () => state.strings.learningNote);
		const clear = button('secondary', () => ask({ type: 'clearLearning' }));
		const clearRow = el('div', 'row-actions');
		clearRow.append(clear);
		typing.append(clearRow);
		updaters.push(() => { clear.textContent = state.strings.clearLearning; });

		const system = section(() => state.strings.everywhere);
		const systemNote = note(system, () => state.system.supported ? state.strings.everywhereNote : state.strings.notSupported);
		systemNote.classList.add('system-note');
		const systemRow = el('div', 'system');
		const systemStatus = el('span', 'system-status');
		const install = button('primary', () => ask({ type: 'installSystem' }));
		const uninstall = button('secondary', () => ask({ type: 'uninstallSystem' }));
		systemRow.append(systemStatus, install, uninstall);
		const systemError = el('div', 'error');
		system.append(systemRow, systemError);
		updaters.push(() => {
			const s = state.strings;
			const sys = state.system;
			show(systemRow, sys.supported);
			systemStatus.textContent = sys.busy === 'installing' ? s.installing : sys.busy === 'removing' ? s.removing : sys.installed ? s.installed : s.notInstalled;
			systemStatus.className = `system-status ${sys.installed && !sys.busy ? 'ok' : ''}`;
			install.textContent = s.install;
			show(install, !sys.installed);
			install.disabled = !!sys.busy;
			uninstall.textContent = s.uninstall;
			show(uninstall, sys.installed);
			uninstall.disabled = !!sys.busy;
			systemError.textContent = sys.error;
			show(systemError, !!sys.error);
		});

		const keys = section(() => state.strings.keys);
		const list = el('dl', 'keys');
		const keyOn = el('dt'), keyOnWhat = el('dd'), keyLayout = el('dt'), keyLayoutWhat = el('dd');
		list.append(keyOn, keyOnWhat, keyLayout, keyLayoutWhat);
		keys.append(list);
		note(keys, () => state.strings.keysPick);
		updaters.push(() => {
			keyOn.replaceChildren(el('kbd', '', state.toggleKey));
			keyOnWhat.textContent = state.strings.keysOn;
			keyLayout.replaceChildren(el('kbd', '', 'Ctrl+Alt+K'));
			keyLayoutWhat.textContent = state.strings.keysLayout;
		});

		const footer = el('footer', 'footer');
		const privacy = el('p', 'note');
		const log = button('link', () => ask({ type: 'showLog' }));
		footer.append(privacy, log);
		root.append(footer);
		updaters.push(() => {
			privacy.textContent = state.strings.privacy;
			log.textContent = state.strings.showLog;
		});
	}

	window.addEventListener('message', e => {
		if (e.data?.type !== 'state') {
			return;
		}
		const first = !state;
		state = e.data;
		if (first) {
			build();
		}
		for (const update of updaters) {
			update();
		}
	});
	ask({ type: 'ready' });
})();
