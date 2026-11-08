// Bundles the island's two pages (page/titlebar.ts, page/overlay.ts) into ui/, beside the pages that load them, or into another folder.
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const root = join(dirname(fileURLToPath(import.meta.url)), '..');
export const esbuild = join(root, 'node_modules', '.bin', 'esbuild');

export function buildPages(outdir = 'ui') {
	for (const page of ['titlebar', 'overlay']) {
		execFileSync(esbuild, [join('page', `${page}.ts`), '--bundle', '--format=iife', '--target=chrome120', `--outfile=${join(outdir, `${page}.js`)}`, '--log-level=warning'], { cwd: root, stdio: 'inherit' });
	}
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
	buildPages();
}
