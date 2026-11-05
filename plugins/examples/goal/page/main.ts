/*
 * The strip above the chat box. It takes no room while the conversation has no goal, says how a goal
 * stands while it has one, and gives the plugin's code what the user presses. All it shows comes from
 * that code, and goes on the page as text.
 */

declare function acquireVsCodeApi(): { postMessage(message: unknown): void };

interface View {
	readonly status: string;
	readonly statusText: string;
	readonly condition: string;
	readonly note: string;
	readonly progress: string;
	readonly fractions: readonly number[];
	readonly actions: readonly { readonly id: string; readonly label: string }[];
}

const vscode = acquireVsCodeApi();
const root = document.getElementById('goal') as HTMLElement;
const MIN_HEIGHT = 44;

function element(tag: string, className: string, text?: string): HTMLElement {
	const made = document.createElement(tag);
	made.className = className;
	if (text !== undefined) {
		made.textContent = text;
	}
	return made;
}

/** A line that may be cut short on the strip, whole on hover. */
function cutLine(className: string, text: string): HTMLElement {
	const line = element('div', className, text);
	line.title = text;
	return line;
}

/** No more room than it needs, and none with nothing to show. */
function fit(shown: boolean): void {
	const height = shown ? Math.max(MIN_HEIGHT, Math.ceil(root.scrollHeight)) : 0;
	vscode.postMessage({ __breezellSurfaceHeight: height });
}

function draw(view: View | undefined): void {
	root.replaceChildren();
	root.hidden = !view;
	if (!view) {
		fit(false);
		return;
	}
	root.dataset.status = view.status;
	const head = element('div', 'head');
	head.append(element('span', 'dot'), element('span', 'status', view.statusText), element('span', 'progress', view.progress));
	const actions = element('span', 'actions');
	for (const action of view.actions) {
		const button = element('button', `action ${action.id}`, action.label) as HTMLButtonElement;
		button.type = 'button';
		button.addEventListener('click', () => vscode.postMessage({ action: action.id }));
		actions.append(button);
	}
	head.append(actions);
	root.append(head, cutLine('condition', view.condition));
	if (view.note) {
		root.append(cutLine('note', view.note));
	}
	if (view.status === 'active' && view.fractions.length) {
		const bar = element('div', 'bar');
		const fill = element('div', 'fill');
		fill.style.width = `${Math.round(Math.max(...view.fractions) * 100)}%`;
		bar.append(fill);
		root.append(bar);
	}
	fit(true);
}

window.addEventListener('message', event => {
	const message = event.data as { type?: string; view?: View };
	if (message?.type === 'state') {
		draw(message.view);
	}
});

if (typeof ResizeObserver !== 'undefined') {
	new ResizeObserver(() => { if (!root.hidden) { fit(true); } }).observe(root);
}

fit(false);
vscode.postMessage({ __breezellSurfaceReady: true });
vscode.postMessage({ hello: true });
