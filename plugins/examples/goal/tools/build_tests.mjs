// Bundles the tests and the page they drive (test/dist).
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { buildPage, esbuild, root } from './build_page.mjs';

execFileSync(esbuild, [join('test', 'logic.test.ts'), join('test', 'strings.test.ts'), join('test', 'page.test.ts'), '--bundle', '--platform=node', '--format=cjs', '--outdir=test/dist', '--out-extension:.js=.cjs', '--external:jsdom', '--log-level=warning'], { cwd: root, stdio: 'inherit' });
buildPage('test/dist/page.js');
