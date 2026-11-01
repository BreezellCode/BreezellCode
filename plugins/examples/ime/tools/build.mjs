// Bundles the engine, its tests and the benchmark harness for running them here (engine/dist).
import { execFileSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const esbuild = join(root, 'node_modules', '.bin', 'esbuild');
const tests = readdirSync(join(root, 'engine', 'test')).filter(f => f.endsWith('.test.ts')).map(f => join('engine', 'test', f));
const entries = [join('engine', 'src', 'index.ts'), join('bench', 'engine-harness.ts'), ...tests];
execFileSync(esbuild, [...entries, '--bundle', '--platform=node', '--format=esm', '--target=node20', '--sourcemap', `--outdir=${join(root, 'engine', 'dist')}`, '--outbase=.', '--log-level=warning'], { cwd: root, stdio: 'inherit' });
