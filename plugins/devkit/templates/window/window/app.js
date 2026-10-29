// The page of the window. It runs sandboxed: no Node, no network, only this plugin's files.
const $ = id => document.getElementById(id);
const log = text => {
	const item = document.createElement('li');
	item.textContent = text;
	$('log').prepend(item);
};

$('status').textContent = window.breezell.connected
	? 'Connected to the plugin in Breezell.'
	: 'Opened on its own: open Breezell to connect.';

$('hello').addEventListener('click', async () => {
	const delivered = await window.breezell.postMessage({ type: 'hello' });
	if (!delivered) {
		log('Not connected: nothing to send to.');
	}
});

window.breezell.onMessage(message => {
	if (message.type === 'greeting') {
		log(message.text);
	} else if (message.type === 'turn') {
		log(message.phase === 'start' ? `AI turn started (${message.mode})` : `AI turn ${message.outcome} in ${message.seconds} s`);
	}
});
