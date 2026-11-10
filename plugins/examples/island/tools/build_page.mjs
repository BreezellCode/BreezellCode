// Bundles the island's two pages (page/titlebar.ts, page/overlay.ts) into ui/, beside the pages that load them, or into another folder.
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const root = join(dirname(fileURLToPath(import.meta.url)), '..');
// esbuild itself, not its launcher in node_modules/.bin: Windows cannot start that one as a program.
export const esbuild = createRequire(join(root, 'package.json'))('esbuild');

export function buildPages(outdir = 'ui') {
	for (const page of ['titlebar', 'overlay']) {
		esbuild.buildSync({ absWorkingDir: root, entryPoints: [join('page', `${page}.ts`)], bundle: true, format: 'iife', target: 'chrome120', outfile: join(outdir, `${page}.js`), logLevel: 'warning' });
	}
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
	buildPages();
}
