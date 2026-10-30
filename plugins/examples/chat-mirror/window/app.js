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

function drawMessage(message, isLatestTool) {
	switch (message.kind) {
		case 'user': {
			const bubble = el('div', 'msg user', message.text);
			if (message.attachments.length) {
				const chips = el('div', 'chips');
				chips.append(...message.attachments.map(name => el('span', 'chip', name)));
				bubble.append(chips);
			}
			if (message.recalledMemories.length) {
				const list = el('div');
				for (const memory of message.recalledMemories) {
					const row = el('div', 'memory');
					row.append(el('b', '', memory.summary));
					if (memory.detail) {
						row.append(el('div', '', memory.detail));
					}
					list.append(row);
				}
				bubble.append(details(`${message.recalledMemories.length} memories recalled`, list));
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
		drawStreaming(undefined);
		return;
	}
	$('title').textContent = current.title || 'Untitled conversation';
	$('activity').textContent = ACTIVITY[current.activity] ?? '';
	const nearBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 80;
	const lastTool = [...current.messages].reverse().find(m => m.kind === 'tool');
	box.replaceChildren(...current.messages.map(m => drawMessage(m, m === lastTool)));
	if (!current.messages.length) {
		box.append(el('p', 'empty', 'No messages yet.'));
	}
	if (nearBottom) {
		box.scrollTop = box.scrollHeight;
	}
	drawStreaming(current.streaming);
}

function drawStreaming(streaming) {
	const box = $('streaming');
	const text = streaming ? (streaming.text || (streaming.tool ? `Using ${streaming.tool}…` : streaming.reasoning ? `Thinking… (${streaming.reasoning.length} characters)` : '')) : '';
	box.hidden = !text;
	box.textContent = text;
	box.scrollTop = box.scrollHeight;
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
				drawStreaming(current.streaming);
			}
			return;
		case 'sent':
			$('text').value = '';
			$('send').disabled = false;
			selectedId = message.conversationId;
			return;
		case 'error': {
			$('send').disabled = false;
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
$('text').addEventListener('keydown', e => {
	if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
		e.preventDefault();
		$('composer').requestSubmit();
	}
});

drawConversation();
window.breezell.postMessage({ type: 'ready' });
