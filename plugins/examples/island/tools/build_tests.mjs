// Bundles the tests and the pages they drive (test/dist).
import { join } from 'node:path';
import { buildPages, esbuild, root } from './build_page.mjs';

esbuild.buildSync({ absWorkingDir: root, entryPoints: [join('test', 'logic.test.ts'), join('test', 'island.test.ts'), join('test', 'page.test.ts')], bundle: true, platform: 'node', external: ['vscode', 'jsdom'], format: 'cjs', target: 'node20', outdir: join('test', 'dist'), outExtension: { '.js': '.cjs' }, logLevel: 'warning' });
buildPages(join('test', 'dist'));
