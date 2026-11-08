// Bundles the tests and the pages they drive (test/dist).
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { buildPages, esbuild, root } from './build_page.mjs';

execFileSync(esbuild, [join('test', 'logic.test.ts'), join('test', 'island.test.ts'), join('test', 'page.test.ts'), '--bundle', '--platform=node', '--external:vscode', '--external:jsdom', '--format=cjs', '--target=node20', '--outdir=test/dist', '--out-extension:.js=.cjs', '--log-level=warning'], { cwd: root, stdio: 'inherit' });
buildPages('test/dist');
