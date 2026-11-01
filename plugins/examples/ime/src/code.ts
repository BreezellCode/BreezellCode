/**
 * Whether the caret is in code (keys stay English) or in prose (the native language): outside
 * comments and strings of a code file, unless /// comes before it on the line.
 */

/** Languages whose files are code. */
const CODE = new Set([
	'javascript', 'typescript', 'javascriptreact', 'typescriptreact', 'java', 'c', 'cpp', 'csharp', 'go', 'rust', 'swift', 'kotlin', 'scala', 'dart',
	'php', 'objective-c', 'objective-cpp', 'groovy', 'json', 'jsonc', 'css', 'scss', 'less', 'vue', 'svelte', 'html', 'xml', 'python', 'shellscript',
	'ruby', 'perl', 'r', 'yaml', 'toml', 'dockerfile', 'makefile', 'powershell', 'coffeescript', 'elixir', 'julia', 'nim', 'ini', 'properties', 'sql',
	'lua', 'haskell', 'elm', 'clojure', 'scheme', 'lisp', 'bat', 'cmake', 'zig', 'solidity', 'graphql', 'proto', 'proto3', 'terraform', 'hcl', 'vb',
	'fsharp', 'ocaml', 'erlang', 'matlab', 'asm', 'cuda-cpp', 'glsl', 'hlsl', 'verilog', 'vhdl',
]);
const LINE_COMMENT: Record<string, string[]> = {
	python: ['#'], shellscript: ['#'], ruby: ['#'], perl: ['#'], r: ['#'], yaml: ['#'], toml: ['#'], dockerfile: ['#'], makefile: ['#'], powershell: ['#'],
	coffeescript: ['#'], elixir: ['#'], julia: ['#'], nim: ['#'], properties: ['#', '!'], ini: [';', '#'], cmake: ['#'], terraform: ['#', '//'], hcl: ['#', '//'],
	sql: ['--'], lua: ['--'], haskell: ['--'], elm: ['--'], clojure: [';'], scheme: [';'], lisp: [';'], asm: [';'], bat: ['rem ', '::'], vb: ['\''],
	erlang: ['%'], matlab: ['%'], html: [], xml: [], css: [], scss: ['//'], less: ['//'], json: [], vhdl: ['--'],
};
const BLOCK_COMMENT: Record<string, [string, string][]> = {
	html: [['<!--', '-->']], xml: [['<!--', '-->']], vue: [['<!--', '-->'], ['/*', '*/']], svelte: [['<!--', '-->'], ['/*', '*/']],
	python: [['"""', '"""'], ['\'\'\'', '\'\'\'']], lua: [['--[[', ']]']], haskell: [['{-', '-}']], ocaml: [['(*', '*)']], fsharp: [['(*', '*)']],
};

/**
 * Whether keys stay English at the caret: `line` is its line up to the caret, `before` the text
 * before it (some hundred lines are enough for an open block comment).
 */
export function englishAt(languageId: string, line: string, before: string): boolean {
	if (!CODE.has(languageId)) {
		return false;
	}
	if (line.includes('///')) {
		return false;
	}
	if ((LINE_COMMENT[languageId] ?? ['//']).some(m => line.includes(m))) {
		return false;
	}
	// Inside a block comment: the last opening before the caret is not closed yet.
	for (const [open, close] of BLOCK_COMMENT[languageId] ?? [['/*', '*/']]) {
		const o = before.lastIndexOf(open);
		if (o >= 0 && (open === close ? before.split(open).length % 2 === 0 : before.lastIndexOf(close) < o)) {
			return false;
		}
	}
	// Inside a string on this line: an odd number of its quotes before the caret.
	const unescaped = line.replace(/\\./g, '');
	for (const q of ['"', '\'', '`']) {
		if ((unescaped.split(q).length - 1) % 2 === 1) {
			return false;
		}
	}
	return true;
}
