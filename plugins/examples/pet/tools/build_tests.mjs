// Bundles the tests and the page they drive (test/dist).
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { buildPage, esbuild, root } from './build_page.mjs';

execFileSync(esbuild, [join('test', 'logic.test.ts'), join('test', 'extension.test.ts'), join('test', 'page.test.ts'), '--bundle', '--platform=node', '--external:vscode', '--external:jsdom', '--format=cjs', '--target=node20', '--outdir=test/dist', '--out-extension:.js=.cjs', '--log-level=warning'], { cwd: root, stdio: 'inherit' });
buildPage('test/dist/page.js');
