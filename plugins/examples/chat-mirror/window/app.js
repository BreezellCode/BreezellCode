// Chat Mirror's page. It only draws: the plugin's code (src/extension.ts) talks to Breezell and
// relays. Conversation text is shown with textContent, never as HTML: a message can contain
// anything, and a page that rendered it as markup would run what it holds.

const $ = id => document.getElementById(id);
const el = (tag, className, text) => {
	const node = document.createElement(tag);
	if (className) {
		node.className = className;
	}
	if (text !== undefined) {
		node.textContent = text;
	}
	return node;
};

const ACTIVITY = {
	idle: '',
	thinking: 'Thinking…',
	writing: 'Writing…',
	runningTool: 'Running a tool…',
	awaitingApproval: 'Waiting for your approval',
	working: 'Working…',
};
const DOT = { idle: 'transparent', awaitingApproval: 'var(--warn)' };
const STATUS = { invalid: 'Invalid', awaitingApproval: 'Waiting for approval', running: 'Running', done: 'Done', failed: 'Failed', rejected: 'Rejected' };
const PERMISSION_HINT = {
	list: 'Chat Mirror may not read your conversations.',
	open: 'Chat Mirror may not read your conversations.',
	show: 'Chat Mirror may not read your conversations.',
	send: 'Chat Mirror may not send messages.',
	approve: 'Chat Mirror may not approve tool calls.',
	reject: 'Chat Mirror may not approve tool calls.',
	selectModel: 'Chat Mirror may not switch the model.',
};

let conversations = [];
let selectedId;
let current;

function when(iso) {
	const date = new Date(iso);
	return Number.isNaN(date.getTime()) ? '' : date.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function showError(text) {
	$('error').textContent = text;
	$('error').hidden = !text;
}

function drawList() {
	const list = $('list');
	list.replaceChildren(...conversations.map(c => {
		const item = el('li', c.id === selectedId ? 'selected' : '');
		item.tabIndex = 0;
		item.append(el('span', 'name', c.title || 'Untitled conversation'), el('span', 'when', `${when(c.updatedAt)} · ${c.messageCount} messages`));
		const dot = el('span', 'dot');
		dot.style.background = DOT[c.activity] ?? 'var(--accent)';
		dot.title = ACTIVITY[c.activity] || 'Idle';
		item.append(dot);
		const select = () => {
			selectedId = c.id;
			showError('');
			drawList();
			window.breezell.postMessage({ type: 'select', id: c.id });
		};
		item.addEventListener('click', select);
		item.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); select(); } });
		return item;
	}));
}

function details(label, body) {
	const box = el('details');
	box.append(el('summary', '', label));
	if (typeof body === 'string') {
		box.append(el('div', 'body', body));
	} else {
		box.append(body);
	}
	return box;
}

// The memories used for a message, worded like the memory row in Breezell's chat. `memoryUse`
// counts them (a Breezell from before it lists the recalled ones only); the list may be shorter.
function drawMemories(message) {
	const use = message.memoryUse;
	const entries = message.recalledMemories ?? [];
	if (!use && !entries.length) {
		return undefined;
	}
	let label;
	if (!use) {
		label = `Recalled ${entries.length} memories`;
	} else if (use.resident + use.relevant === 0 && !entries.length) {
		label = use.inThisConversation ? 'The related memories are in this conversation above' : 'No memories used this turn';
	} else {
		label = `Injected ${use.resident + use.relevant} memories (${use.resident} resident · ${use.relevant} relevant)`;
	}
	const list = el('div');
	for (const memory of entries) {
		const row = el('div', 'memory');
		if (memory.source) {
			row.append(el('span', 'tag', memory.source === 'resident' ? 'Resident' : 'Relevant'));
		}
		if (memory.priority) {
			row.append(el('span', 'tag', memory.priority));
		}
		row.append(el('b', '', memory.summary));
		if (memory.detail) {
			row.append(el('div', 'detail', memory.detail));
		}
		list.append(row);
	}
	if (!entries.length) {
		list.append(el('div', 'note', use?.complete === false ? 'Memory retrieval was incomplete; the turn continued with available context.' : 'No relevant context was injected in this turn'));
	}
	const box = details(label, list);
	box.classList.add('memories');
	return box;
}

function drawMessage(message, isLatestTool) {
	switch (message.kind) {
		case 'user': {
			const bubble = el('div', 'msg user', message.text);
			if (message.attachments.length) {
				const chips = el('div', 'chips');
				chips.append(...message.attachments.map(name => el('span', 'chip', name)));
				bubble.append(chips);
			}
			const memories = drawMemories(message);
			if (memories) {
				bubble.append(memories);
			}
			return bubble;
		}
		case 'assistant': {
			const bubble = el('div', 'msg assistant', message.text);
			if (message.reasoning) {
				bubble.append(details('Reasoning', message.reasoning));
			}
			return bubble;
		}
		case 'tool': {
			const card = el('div', 'tool');
			const head = el('div', 'head');
			head.append(el('span', 'name', message.mcpServer ? `${message.mcpServer} · ${message.name}` : message.name), el('span', `status ${message.status}`, STATUS[message.status] ?? message.status));
			card.append(head);
			const params = JSON.stringify(message.params, null, 2);
			if (params && params !== '{}') {
				card.append(details('Parameters', el('pre', '', params)));
			}
			if (message.result) {
				const cut = message.resultLength > message.result.length ? ` (first ${message.result.length} of ${message.resultLength} characters)` : '';
				card.append(details(`Result${cut}`, el('pre', '', message.result)));
			}
			if (message.status === 'awaitingApproval' && isLatestTool && current?.activity === 'awaitingApproval') {
				const actions = el('div', 'actions');
				const approve = el('button', 'good', 'Approve');
				const reject = el('button', 'bad', 'Reject');
				approve.addEventListener('click', () => { approve.disabled = reject.disabled = true; window.breezell.postMessage({ type: 'approve' }); });
				reject.addEventListener('click', () => { approve.disabled = reject.disabled = true; window.breezell.postMessage({ type: 'reject' }); });
				actions.append(approve, reject);
				card.append(actions);
			}
			return card;
		}
		case 'error':
			return el('div', 'msg error', message.text);
		default:
			return el('div');
	}
}

function drawConversation() {
	const box = $('messages');
	$('show').disabled = !current;
	if (!current) {
		$('title').textContent = selectedId ? 'Loading…' : 'New conversation';
		$('activity').textContent = '';
		box.replaceChildren(el('p', 'empty', selectedId ? '' : 'Write a message below to start a conversation in Breezell, or pick one on the left.'));
		drawLive();
		return;
	}
	$('title').textContent = current.title || 'Untitled conversation';
	$('activity').textContent = ACTIVITY[current.activity] ?? '';
	const nearBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 80;
	const lastTool = [...current.messages].reverse().find(m => m.kind === 'tool');
	box.replaceChildren(...current.messages.map(m => drawMessage(m, m === lastTool)));
	if (!current.messages.length && current.activity === 'idle') {
		box.append(el('p', 'empty', 'No messages yet.'));
	}
	if (nearBottom) {
		box.scrollTop = box.scrollHeight;
	}
	drawLive(nearBottom);
}

// Breezell's model picker, as Breezell lists it ("model (provider)"), the current one chosen.
// An option's value is its index into `models`.
let models = [];

function drawModels(items, allowed = true) {
	const box = $('modelBox');
	const select = $('model');
	if (items === undefined && allowed) {
		box.hidden = true; // a Breezell without models.list
		return;
	}
	box.hidden = false;
	models = items ?? [];
	if (!allowed || !models.length) {
		const option = el('option', '', allowed ? 'No models' : 'Not allowed');
		option.value = '';
		select.replaceChildren(option);
	} else {
		select.replaceChildren(...models.map((m, i) => {
			const option = el('option', '', m.name);
			option.value = String(i);
			return option;
		}));
		// Chosen by index: an option marked selected before it is inserted loses to a later one.
		const current = models.findIndex(m => m.current);
		if (current < 0) {
			// The chosen model is not in the picker (turned off since): say so instead of showing another one.
			const option = el('option', '', 'Choose a model');
			option.value = '';
			option.disabled = true;
			select.prepend(option);
			select.selectedIndex = 0;
		} else {
			select.selectedIndex = current;
		}
	}
	select.disabled = !allowed || !models.length;
	box.title = allowed ? "Breezell's chat model: switching it here switches it in Breezell too" : 'Chat Mirror may not see the models. You can allow it under Plugins › Installed › Chat Mirror.';
}

// The reply on its way, last in the conversation from the moment Breezell starts until it is
// done: what it is doing and for how long, the tail of its reasoning, and the text so far.
const live = el('div', 'msg assistant live');
const liveLabel = el('span', 'label');
const liveElapsed = el('span', 'elapsed');
const liveReasoning = el('div', 'reasoning');
const liveText = el('div', 'text');
live.append((() => {
	const head = el('div', 'head');
	head.append(el('span', 'pulse'), liveLabel, liveElapsed);
	return head;
})(), liveReasoning, liveText);
let busySince;
let clock;

function drawLive(stickToBottom) {
	const box = $('messages');
	const activity = current?.activity ?? 'idle';
	live.classList.remove('done');
	if (!current || activity === 'idle') {
		live.remove();
		busySince = undefined;
		clearInterval(clock);
		clock = undefined;
		return;
	}
	const follow = stickToBottom ?? box.scrollHeight - box.scrollTop - box.clientHeight < 80;
	const streaming = current.streaming;
	liveLabel.textContent = streaming?.tool && activity === 'runningTool' ? `Running ${streaming.tool}…` : ACTIVITY[activity] || 'Working…';
	live.classList.toggle('waiting', activity === 'awaitingApproval');
	// The last lines are enough to see it think; the whole reasoning comes with the reply.
	liveReasoning.textContent = streaming?.reasoning ? streaming.reasoning.slice(-600) : '';
	liveText.textContent = streaming?.text ?? '';
	if (box.lastElementChild !== live) {
		box.append(live);
	}
	busySince ??= Date.now();
	const tick = () => { liveElapsed.textContent = `${Math.round((Date.now() - busySince) / 1000)}s`; };
	tick();
	clock ??= setInterval(tick, 1000);
	if (follow) {
		box.scrollTop = box.scrollHeight;
	}
}

window.breezell.onMessage(message => {
	switch (message?.type) {
		case 'conversations':
			conversations = message.items;
			drawList();
			return;
		case 'conversation':
			current = message.conversation;
			if (current) {
				selectedId = current.id;
			}
			drawList();
			drawConversation();
			return;
		case 'change':
			if (current && message.change.conversationId === current.id) {
				current = { ...current, activity: message.change.activity, streaming: message.change.streaming };
				$('activity').textContent = ACTIVITY[current.activity] ?? '';
				if (current.activity === 'idle' && live.isConnected && liveText.textContent) {
					// Done: the reply stays as it is until the conversation, read again, brings it.
					live.classList.add('done');
					clearInterval(clock);
					clock = undefined;
					busySince = undefined;
					return;
				}
				drawLive();
			}
			return;
		case 'models':
			drawModels(message.items);
			return;
		case 'sent':
			$('text').value = '';
			$('send').disabled = false;
			selectedId = message.conversationId;
			return;
		case 'error': {
			$('send').disabled = false;
			if (message.action === 'models') {
				// Turned off by the user: a disabled picker says so; no banner each time the window opens.
				drawModels([], message.name !== 'BreezellPermissionDenied');
				if (message.name === 'BreezellPermissionDenied') {
					return;
				}
			}
			const hint = message.name === 'BreezellPermissionDenied'
				? `${PERMISSION_HINT[message.action] ?? 'Chat Mirror may not do that.'} You can allow it under Plugins › Installed › Chat Mirror.`
				: message.message;
			showError(hint);
			return;
		}
	}
});

$('refresh').addEventListener('click', () => { showError(''); window.breezell.postMessage({ type: 'refresh' }); });
$('new').addEventListener('click', () => {
	selectedId = undefined;
	current = undefined;
	showError('');
	drawList();
	drawConversation();
	window.breezell.postMessage({ type: 'new' });
	$('text').focus();
});
$('show').addEventListener('click', () => window.breezell.postMessage({ type: 'show' }));
$('composer').addEventListener('submit', e => {
	e.preventDefault();
	const text = $('text').value.trim();
	if (!text) {
		return;
	}
	showError('');
	$('send').disabled = true;
	window.breezell.postMessage({ type: 'send', text });
});
$('model').addEventListener('change', () => {
	const choice = models[Number($('model').value)];
	if (!choice) {
		return;
	}
	showError('');
	$('model').disabled = true; // until Breezell answers with the list again
	window.breezell.postMessage({ type: 'selectModel', provider: choice.provider, model: choice.model });
});
window.addEventListener('focus', () => window.breezell.postMessage({ type: 'models' }));
$('text').addEventListener('keydown', e => {
	if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
		e.preventDefault();
		$('composer').requestSubmit();
	}
});

drawConversation();
window.breezell.postMessage({ type: 'ready' });
