// Bundles the strip's page (page/main.ts) into ui/goal.js, beside the page that loads it, or into another file.
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const root = join(dirname(fileURLToPath(import.meta.url)), '..');
export const esbuild = join(root, 'node_modules', '.bin', 'esbuild');

export function buildPage(outfile = 'ui/goal.js') {
	execFileSync(esbuild, [join('page', 'main.ts'), '--bundle', '--format=iife', '--target=chrome120', `--outfile=${outfile}`, '--log-level=warning'], { cwd: root, stdio: 'inherit' });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
	buildPage();
}
