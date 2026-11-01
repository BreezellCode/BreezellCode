#!/usr/bin/env node
// What the plugin installs in the system, into dist/system (the package ships dist/):
// the engine host (bundled here), the text service DLLs (prebuilt on Windows by
// system/windows/build.bat: system/windows/prebuilt) and the installer scripts.
import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'dist', 'system');
mkdirSync(out, { recursive: true });
execFileSync(join(root, 'node_modules', '.bin', 'esbuild'), [join('system', 'host', 'host.ts'), '--bundle', '--platform=node', '--format=cjs', '--target=node20',
	`--outfile=${join(out, 'host.cjs')}`, '--log-level=warning'], { cwd: root, stdio: 'inherit' });
execFileSync(join(root, 'node_modules', '.bin', 'esbuild'), [join('src', 'uninstall-hook.ts'), '--bundle', '--platform=node', '--format=cjs', '--target=node20',
	`--outfile=${join(out, 'uninstall-hook.cjs')}`, '--log-level=warning'], { cwd: root, stdio: 'inherit' });
for (const name of ['install.ps1', 'uninstall.ps1']) {
	copyFileSync(join(root, 'system', 'windows', 'installer', name), join(out, name));
}
for (const name of ['BreezellIME64.dll', 'BreezellIME32.dll']) {
	copyFileSync(join(root, 'system', 'windows', 'prebuilt', name), join(out, name));
}
copyFileSync(join(root, 'THIRD_PARTY_NOTICES.md'), join(root, 'dist', 'THIRD_PARTY_NOTICES.md'));
// The build the DLLs say they are: TIP_VERSION of the source they were built from.
const build = /#define TIP_VERSION (\d+)/.exec(readFileSync(join(root, 'system', 'windows', 'BreezellIME.cpp'), 'utf8'))?.[1];
writeFileSync(join(out, 'tip-build.txt'), `${build}\n`);
