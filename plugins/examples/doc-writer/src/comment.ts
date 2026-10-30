/**
 * Checks that a model's answer is a comment before Doc Writer puts it into the code. Models do
 * not always follow the instructions: given a piece of code, some answer like a chat ("this looks
 * cut off, here is the rest…"), and that text must not land in the file.
 */

const C_FAMILY = ['//', '/*', '*'];
const HASH = ['#'];
const DOUBLE_DASH = ['--'];

/** How comment lines start in a language (VS Code language id); every known style for the rest. */
export function commentPrefixes(languageId: string): readonly string[] {
	switch (languageId) {
		case 'typescript': case 'typescriptreact': case 'javascript': case 'javascriptreact':
		case 'java': case 'csharp': case 'kotlin': case 'go': case 'rust': case 'swift': case 'c': case 'cpp':
		case 'objective-c': case 'objective-cpp': case 'dart': case 'scala': case 'groovy': case 'fsharp': case 'zig':
		case 'css': case 'scss': case 'less':
			return C_FAMILY;
		case 'php':
			return [...C_FAMILY, '#'];
		case 'python': case 'ruby': case 'shellscript': case 'perl': case 'r': case 'yaml': case 'toml':
		case 'dockerfile': case 'makefile': case 'powershell': case 'coffeescript': case 'julia': case 'elixir': case 'nim':
			return HASH;
		case 'lua': case 'sql': case 'haskell': case 'elm':
			return DOUBLE_DASH;
		default:
			return [...C_FAMILY, ...HASH, ...DOUBLE_DASH, ';', '%', '\'', '<!--', '-->'];
	}
}

const isCommentLine = (line: string, prefixes: readonly string[]) => {
	const trimmed = line.trim();
	return trimmed === '' || prefixes.some(prefix => trimmed.startsWith(prefix));
};

const squash = (text: string) => text.replace(/\s+/g, '');

/**
 * The comment to insert, or undefined when the answer is not one. A comment followed by the
 * selected code itself (some models repeat it) keeps the comment; anything else is refused.
 */
export function commentFromAnswer(answer: string, languageId: string, code: string): string | undefined {
	const lines = answer.replace(/\r\n/g, '\n').trim().split('\n');
	const prefixes = commentPrefixes(languageId);
	let end = 0;
	while (end < lines.length && isCommentLine(lines[end], prefixes)) {
		end++;
	}
	const comment = lines.slice(0, end).join('\n').trim();
	if (!comment) {
		return undefined;
	}
	const rest = lines.slice(end).join('\n');
	return rest.trim() === '' || squash(rest) === squash(code) ? comment : undefined;
}
