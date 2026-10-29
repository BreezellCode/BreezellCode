#!/usr/bin/env node
/*---------------------------------------------------------------------------------------------
 *  Breezell plugin devkit. MIT License. One file, no dependencies, Node.js 18 or later.
 *
 *    init [dir]        create a plugin from a template
 *    build [dir]       bundle src/extension.ts into dist/extension.js (esbuild from the plugin's node_modules)
 *    validate [dir]    check package.json
 *    pack [dir]        build and write <publisher>.<name>-<version>.vsix
 *                        --open    source included, readable build      (breezell.source = "open")
 *                        --closed  minified build and media scripts only, no source, no maps (breezell.source = "closed")
 *    submit [dir] --market <clone of BreezellCode/BreezellCode>
 *                      copy the .vsix into the market, update its plugin.json and index.json
 *    index <market plugins folder> [--check]
 *                      rebuild index.json from packages/<id>/plugin.json; --check verifies every package
 *    templates-json    print devkit/templates.json (what Breezell's "Create a plugin" uses)
 *    types             print the plugin API typings
 *
 *  Packing never needs an upload: install the .vsix in Breezell (Plugins › Installed › Install
 *  local .vsix) and it works the same as a market plugin.
 *--------------------------------------------------------------------------------------------*/

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const DEVKIT_VERSION = '1.0.0';
const API_VERSION = 1;
const PERMISSIONS = ['chat.events', 'models.request'];
const MARKET_REPO = 'BreezellCode/BreezellCode';
const MARKET_URLS = [
	`https://raw.githubusercontent.com/${MARKET_REPO}/main/plugins/`,
	`https://cdn.jsdelivr.net/gh/${MARKET_REPO}@main/plugins/`,
	`https://fastly.jsdelivr.net/gh/${MARKET_REPO}@main/plugins/`,
];
const MAX_PACKAGE_BYTES = 50 * 1024 * 1024;
const SELF = fileURLToPath(import.meta.url);
const ID_PART = /^[a-z0-9][a-z0-9-]{0,62}$/;
const VERSION = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/;

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

class UserError extends Error { }
const fail = message => { throw new UserError(message); };
const log = message => process.stdout.write(`${message}\n`);
const readJson = file => {
	try {
		return JSON.parse(fs.readFileSync(file, 'utf8'));
	} catch (err) {
		fail(`cannot read ${file}: ${err.message}`);
	}
};
const writeJson = (file, value) => {
	fs.mkdirSync(path.dirname(file), { recursive: true });
	fs.writeFileSync(file, `${JSON.stringify(value, null, '\t')}\n`);
};
const sha256 = buffer => crypto.createHash('sha256').update(buffer).digest('hex');
const isHttps = value => {
	try {
		return new URL(value).protocol === 'https:';
	} catch {
		return false;
	}
};
const compareVersions = (a, b) => {
	const ma = VERSION.exec(a);
	const mb = VERSION.exec(b);
	if (!ma || !mb) {
		return ma ? 1 : mb ? -1 : 0;
	}
	for (let i = 1; i <= 3; i++) {
		const d = Number(ma[i]) - Number(mb[i]);
		if (d) {
			return Math.sign(d);
		}
	}
	return ma[4] === mb[4] ? 0 : !ma[4] ? 1 : !mb[4] ? -1 : ma[4] < mb[4] ? -1 : 1;
};

function parseArgs(argv) {
	const positional = [];
	const flags = {};
	for (let i = 0; i < argv.length; i++) {
		const arg = argv[i];
		if (arg.startsWith('--')) {
			const [key, inline] = arg.slice(2).split('=', 2);
			if (inline !== undefined) {
				flags[key] = inline;
			} else if (i + 1 < argv.length && !argv[i + 1].startsWith('--')) {
				flags[key] = argv[++i];
			} else {
				flags[key] = true;
			}
		} else {
			positional.push(arg);
		}
	}
	return { positional, flags };
}

// ---------------------------------------------------------------------------
// Zip (store + deflate), enough for .vsix files
// ---------------------------------------------------------------------------

const CRC_TABLE = (() => {
	const table = new Uint32Array(256);
	for (let n = 0; n < 256; n++) {
		let c = n;
		for (let k = 0; k < 8; k++) {
			c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
		}
		table[n] = c >>> 0;
	}
	return table;
})();
const crc32 = buffer => {
	let crc = 0xffffffff;
	for (const byte of buffer) {
		crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
	}
	return (crc ^ 0xffffffff) >>> 0;
};

/** Entries in the given order, fixed timestamps, so the same input gives the same bytes (and SHA-256). */
function writeZip(entries) {
	const locals = [];
	const centrals = [];
	let offset = 0;
	const DOS_TIME = 0;
	const DOS_DATE = (0 << 9) | (1 << 5) | 1; // 1980-01-01
	for (const { name, data } of entries) {
		const nameBuffer = Buffer.from(name, 'utf8');
		const deflated = zlib.deflateRawSync(data, { level: 9 });
		const useDeflate = deflated.length < data.length;
		const body = useDeflate ? deflated : data;
		const crc = crc32(data);
		const local = Buffer.alloc(30);
		local.writeUInt32LE(0x04034b50, 0);
		local.writeUInt16LE(20, 4);
		local.writeUInt16LE(0x0800, 6); // UTF-8 names
		local.writeUInt16LE(useDeflate ? 8 : 0, 8);
		local.writeUInt16LE(DOS_TIME, 10);
		local.writeUInt16LE(DOS_DATE, 12);
		local.writeUInt32LE(crc, 14);
		local.writeUInt32LE(body.length, 18);
		local.writeUInt32LE(data.length, 22);
		local.writeUInt16LE(nameBuffer.length, 26);
		local.writeUInt16LE(0, 28);
		locals.push(local, nameBuffer, body);
		const central = Buffer.alloc(46);
		central.writeUInt32LE(0x02014b50, 0);
		central.writeUInt16LE(20, 4);
		central.writeUInt16LE(20, 6);
		central.writeUInt16LE(0x0800, 8);
		central.writeUInt16LE(useDeflate ? 8 : 0, 10);
		central.writeUInt16LE(DOS_TIME, 12);
		central.writeUInt16LE(DOS_DATE, 14);
		central.writeUInt32LE(crc, 16);
		central.writeUInt32LE(body.length, 20);
		central.writeUInt32LE(data.length, 24);
		central.writeUInt16LE(nameBuffer.length, 28);
		central.writeUInt32LE(offset, 42);
		centrals.push(central, nameBuffer);
		offset += 30 + nameBuffer.length + body.length;
	}
	const centralSize = centrals.reduce((n, b) => n + b.length, 0);
	const end = Buffer.alloc(22);
	end.writeUInt32LE(0x06054b50, 0);
	end.writeUInt16LE(entries.length, 8);
	end.writeUInt16LE(entries.length, 10);
	end.writeUInt32LE(centralSize, 12);
	end.writeUInt32LE(offset, 16);
	return Buffer.concat([...locals, ...centrals, end]);
}

/** name → data of every file in a zip. */
function readZip(buffer) {
	let eocd = -1;
	for (let i = buffer.length - 22; i >= Math.max(0, buffer.length - 65557); i--) {
		if (buffer.readUInt32LE(i) === 0x06054b50) {
			eocd = i;
			break;
		}
	}
	if (eocd < 0) {
		fail('not a zip file');
	}
	const count = buffer.readUInt16LE(eocd + 10);
	let pointer = buffer.readUInt32LE(eocd + 16);
	const files = new Map();
	for (let i = 0; i < count; i++) {
		if (buffer.readUInt32LE(pointer) !== 0x02014b50) {
			fail('broken zip central directory');
		}
		const method = buffer.readUInt16LE(pointer + 10);
		const compressedSize = buffer.readUInt32LE(pointer + 20);
		const nameLength = buffer.readUInt16LE(pointer + 28);
		const extraLength = buffer.readUInt16LE(pointer + 30);
		const commentLength = buffer.readUInt16LE(pointer + 32);
		const localOffset = buffer.readUInt32LE(pointer + 42);
		const name = buffer.subarray(pointer + 46, pointer + 46 + nameLength).toString('utf8');
		const localNameLength = buffer.readUInt16LE(localOffset + 26);
		const localExtraLength = buffer.readUInt16LE(localOffset + 28);
		const start = localOffset + 30 + localNameLength + localExtraLength;
		const raw = buffer.subarray(start, start + compressedSize);
		if (method !== 0 && method !== 8) {
			fail(`unsupported zip method ${method} for ${name}`);
		}
		files.set(name, method === 8 ? zlib.inflateRawSync(raw) : Buffer.from(raw));
		pointer += 46 + nameLength + extraLength + commentLength;
	}
	return files;
}

// ---------------------------------------------------------------------------
// package.json checks
// ---------------------------------------------------------------------------

function checkPackage(pkg, { forMarket = false } = {}) {
	const errors = [];
	const warnings = [];
	if (!ID_PART.test(pkg.publisher ?? '')) {
		errors.push('"publisher": lowercase letters, digits and dashes');
	}
	if (!ID_PART.test(pkg.name ?? '')) {
		errors.push('"name": lowercase letters, digits and dashes');
	}
	if (!VERSION.test(pkg.version ?? '')) {
		errors.push('"version": major.minor.patch');
	}
	if (typeof pkg.engines?.vscode !== 'string') {
		errors.push('"engines.vscode" is required (e.g. "^1.90.0")');
	}
	if (typeof pkg.main !== 'string') {
		errors.push('"main" is required (e.g. "./dist/extension.js")');
	}
	const bz = pkg.breezell;
	if (typeof bz !== 'object' || bz === null || Array.isArray(bz)) {
		errors.push('"breezell" object is required: { "apiVersion": 1, "permissions": [] }');
	} else {
		if (!Number.isInteger(bz.apiVersion) || bz.apiVersion < 1 || bz.apiVersion > API_VERSION) {
			errors.push(`"breezell.apiVersion" must be 1..${API_VERSION}`);
		}
		for (const p of bz.permissions ?? []) {
			if (!PERMISSIONS.includes(p)) {
				errors.push(`unknown permission "${p}" (known: ${PERMISSIONS.join(', ')})`);
			}
		}
		if (bz.source !== undefined && bz.source !== 'open' && bz.source !== 'closed') {
			errors.push('"breezell.source" must be "open" or "closed"');
		}
	}
	const kinds = Array.isArray(pkg.extensionKind) ? pkg.extensionKind : pkg.extensionKind ? [pkg.extensionKind] : [];
	if (kinds[0] !== 'ui') {
		warnings.push('"extensionKind" should start with "ui" (e.g. ["ui", "workspace"]): in a remote (WSL, SSH) window the plugin then runs on the local side, where vscode.breezell is always current');
	}
	if (!pkg.displayName) {
		(forMarket ? errors : warnings).push('"displayName" is missing');
	}
	if (!pkg.description) {
		(forMarket ? errors : warnings).push('"description" is missing');
	}
	const repository = typeof pkg.repository === 'string' ? pkg.repository : pkg.repository?.url;
	if (repository !== undefined && !isHttps(repository)) {
		errors.push('"repository" must be an https URL');
	}
	if (forMarket && bz?.source === 'open' && !repository) {
		errors.push('open source plugins need "repository" (https URL of the source)');
	}
	return { errors, warnings };
}

const pluginId = pkg => `${pkg.publisher}.${pkg.name}`.toLowerCase();

// ---------------------------------------------------------------------------
// build / pack
// ---------------------------------------------------------------------------

function loadEsbuild(dir) {
	try {
		return createRequire(path.join(dir, 'package.json'))('esbuild');
	} catch {
		fail('esbuild is not installed in this plugin. Run: npm install --save-dev esbuild');
	}
}

async function build(dir, { closed = false, watch = false } = {}) {
	const pkg = readJson(path.join(dir, 'package.json'));
	const entry = ['src/extension.ts', 'src/extension.js'].map(p => path.join(dir, p)).find(p => fs.existsSync(p));
	if (!entry) {
		fail('no src/extension.ts or src/extension.js');
	}
	const outfile = path.join(dir, pkg.main ?? './dist/extension.js');
	const esbuild = loadEsbuild(dir);
	const options = {
		entryPoints: [entry],
		outfile,
		bundle: true,
		platform: 'node',
		format: 'cjs',
		target: 'node18',
		external: ['vscode'],
		minify: closed,
		sourcemap: closed ? false : 'linked',
		legalComments: closed ? 'none' : 'inline',
		logLevel: 'info',
	};
	if (watch) {
		const context = await esbuild.context(options);
		await context.watch();
		log('watching for changes…');
		return;
	}
	await esbuild.build(options);
	if (closed) {
		fs.rmSync(`${outfile}.map`, { force: true });
	}
}

/** Files of the package (relative, forward slashes). */
function packageFiles(dir, pkg, open) {
	const out = new Set();
	// Only the listed top-level entries are walked (never tools/, types/ or .vscode/); inside them skip these.
	const skip = new Set(['node_modules', '.git', '.DS_Store']);
	const walk = rel => {
		const abs = path.join(dir, rel);
		if (!fs.existsSync(abs)) {
			return;
		}
		if (fs.statSync(abs).isDirectory()) {
			for (const name of fs.readdirSync(abs).sort()) {
				if (!skip.has(name)) {
					walk(rel ? `${rel}/${name}` : name);
				}
			}
		} else if (!rel.endsWith('.vsix') && !(!open && rel.endsWith('.map'))) {
			out.add(rel);
		}
	};
	const top = ['package.json', 'README.md', 'CHANGELOG.md', 'package.nls.json', ...fs.readdirSync(dir).filter(n => /^LICEN[CS]E/i.test(n) || /^package\.nls\..+\.json$/.test(n))];
	for (const name of top) {
		walk(name);
	}
	walk(path.posix.dirname((pkg.main ?? './dist/extension.js').replace(/^\.\//, '')));
	walk('media');
	if (typeof pkg.icon === 'string') {
		walk(pkg.icon.replace(/^\.\//, ''));
	}
	if (open) {
		walk('src');
		walk('tsconfig.json');
	}
	return [...out].sort();
}

const xml = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function vsixManifest(pkg) {
	return `<?xml version="1.0" encoding="utf-8"?>
<PackageManifest Version="2.0.0" xmlns="http://schemas.microsoft.com/developer/vsx-schema/2011" xmlns:d="http://schemas.microsoft.com/developer/vsx-schema-design/2011">
	<Metadata>
		<Identity Language="en-US" Id="${xml(pkg.name)}" Version="${xml(pkg.version)}" Publisher="${xml(pkg.publisher)}" />
		<DisplayName>${xml(pkg.displayName || pkg.name)}</DisplayName>
		<Description xml:space="preserve">${xml(pkg.description)}</Description>
		<Tags>breezell-plugin</Tags>
		<Categories>${xml((pkg.categories ?? ['Other']).join(','))}</Categories>
		<GalleryFlags>Public</GalleryFlags>
		<Properties>
			<Property Id="Microsoft.VisualStudio.Code.Engine" Value="${xml(pkg.engines?.vscode)}" />
		</Properties>
	</Metadata>
	<Installation>
		<InstallationTarget Id="Microsoft.VisualStudio.Code" />
	</Installation>
	<Dependencies />
	<Assets>
		<Asset Type="Microsoft.VisualStudio.Code.Manifest" Path="extension/package.json" Addressable="true" />
	</Assets>
</PackageManifest>
`;
}

function contentTypes(files) {
	const types = { '.json': 'application/json', '.js': 'application/javascript', '.md': 'text/markdown', '.png': 'image/png', '.svg': 'image/svg+xml', '.css': 'text/css', '.html': 'text/html', '.ts': 'text/plain', '.map': 'application/json', '.vsixmanifest': 'text/xml' };
	const exts = [...new Set([...files.map(f => path.extname(f).toLowerCase()), '.vsixmanifest'])].filter(Boolean).sort();
	const defaults = exts.map(ext => `<Default Extension="${xml(ext)}" ContentType="${types[ext] ?? 'application/octet-stream'}" />`).join('');
	return `<?xml version="1.0" encoding="utf-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">${defaults}</Types>`;
}

async function pack(dir, flags) {
	const pkg = readJson(path.join(dir, 'package.json'));
	const mode = flags.closed ? 'closed' : flags.open ? 'open' : pkg.breezell?.source;
	if (mode !== 'open' && mode !== 'closed') {
		fail('say how to publish: pack --open (source included) or pack --closed (minified, no source)');
	}
	pkg.breezell = { ...pkg.breezell, source: mode };
	const { errors, warnings } = checkPackage(pkg);
	warnings.forEach(w => log(`warning: ${w}`));
	if (errors.length) {
		fail(`package.json:\n  - ${errors.join('\n  - ')}`);
	}
	await build(dir, { closed: mode === 'closed' });
	const files = packageFiles(dir, pkg, mode === 'open');
	if (mode === 'closed' && files.some(f => f.startsWith('src/'))) {
		fail('internal: closed package would contain src/');
	}
	const entries = [
		{ name: 'extension.vsixmanifest', data: Buffer.from(vsixManifest(pkg)) },
		{ name: '[Content_Types].xml', data: Buffer.from(contentTypes(files)) },
		...files.map(f => ({
			name: `extension/${f}`,
			// The packed package.json says how it was published; the one on disk is left as it is.
			data: f === 'package.json' ? Buffer.from(`${JSON.stringify(pkg, null, '\t')}\n`) : fs.readFileSync(path.join(dir, f)),
		})),
	];
	if (mode === 'closed') {
		// Closed source: the webview scripts and styles ship minified too, not only the bundle.
		const esbuild = loadEsbuild(dir);
		for (const entry of entries) {
			const loader = entry.name.startsWith('extension/media/') && (entry.name.endsWith('.js') ? 'js' : entry.name.endsWith('.css') ? 'css' : undefined);
			if (loader) {
				entry.data = Buffer.from(esbuild.transformSync(entry.data.toString('utf8'), { loader, minify: true, legalComments: 'none' }).code);
			}
		}
	}
	const zip = writeZip(entries);
	if (zip.length > MAX_PACKAGE_BYTES) {
		fail(`package is ${(zip.length / 1048576).toFixed(1)} MB; the market takes at most 50 MB`);
	}
	const outDir = typeof flags.out === 'string' ? path.resolve(flags.out) : dir;
	fs.mkdirSync(outDir, { recursive: true });
	const outFile = path.join(outDir, `${pluginId(pkg)}-${pkg.version}.vsix`);
	fs.writeFileSync(outFile, zip);
	log(`${mode === 'open' ? 'open source' : 'closed source'} package: ${outFile}`);
	log(`  ${files.length} files, ${(zip.length / 1024).toFixed(1)} KB, sha256 ${sha256(zip)}`);
	log('  install it in Breezell: Plugins › Installed › Install local .vsix');
	return outFile;
}

// ---------------------------------------------------------------------------
// The market: plugin.json per plugin, index.json for all
// ---------------------------------------------------------------------------

/** The package.json inside a .vsix, checked. */
function readVsix(file) {
	const buffer = fs.readFileSync(file);
	const files = readZip(buffer);
	const raw = files.get('extension/package.json');
	if (!raw) {
		fail(`${file}: no extension/package.json`);
	}
	const pkg = JSON.parse(raw.toString('utf8'));
	return { buffer, files, pkg };
}

function submit(dir, flags) {
	if (typeof flags.market !== 'string') {
		fail('--market <path> is required: a clone of your fork of BreezellCode/BreezellCode');
	}
	const marketRoot = path.resolve(flags.market, 'plugins');
	if (!fs.existsSync(path.join(marketRoot, 'index.json'))) {
		fail(`${marketRoot} has no index.json: is --market a clone of BreezellCode/BreezellCode?`);
	}
	const sourcePkg = readJson(path.join(dir, 'package.json'));
	const vsixFile = typeof flags.vsix === 'string' ? path.resolve(flags.vsix) : path.join(dir, `${pluginId(sourcePkg)}-${sourcePkg.version}.vsix`);
	if (!fs.existsSync(vsixFile)) {
		fail(`${vsixFile} not found: run "npm run package:open" or "npm run package:closed" first`);
	}
	const { buffer, pkg } = readVsix(vsixFile);
	const { errors } = checkPackage(pkg, { forMarket: true });
	if (errors.length) {
		fail(`the package's package.json:\n  - ${errors.join('\n  - ')}`);
	}
	const id = pluginId(pkg);
	const folder = path.join(marketRoot, 'packages', id);
	const relPackage = `packages/${id}/${pkg.version}/${id}-${pkg.version}.vsix`;
	const target = path.join(marketRoot, relPackage);
	const digest = sha256(buffer);
	if (fs.existsSync(target) && sha256(fs.readFileSync(target)) !== digest) {
		fail(`${id} ${pkg.version} is already in the market with other contents: published versions do not change, raise "version"`);
	}
	const metaFile = path.join(folder, 'plugin.json');
	const previous = fs.existsSync(metaFile) ? readJson(metaFile) : undefined;
	if (previous && previous.versions?.some(v => compareVersions(v.version, pkg.version) > 0)) {
		fail(`${id} already has a newer version than ${pkg.version} in the market`);
	}
	fs.mkdirSync(path.dirname(target), { recursive: true });
	fs.writeFileSync(target, buffer);
	let icon;
	if (typeof pkg.icon === 'string' && fs.existsSync(path.join(dir, pkg.icon))) {
		const ext = path.extname(pkg.icon).toLowerCase();
		if (!['.png', '.svg', '.jpg', '.jpeg', '.webp'].includes(ext)) {
			fail('"icon" must be a .png, .svg, .jpg or .webp file');
		}
		icon = `packages/${id}/icon${ext}`;
		fs.copyFileSync(path.join(dir, pkg.icon), path.join(marketRoot, icon));
	}
	let readme;
	if (fs.existsSync(path.join(dir, 'README.md'))) {
		readme = `packages/${id}/README.md`;
		fs.copyFileSync(path.join(dir, 'README.md'), path.join(marketRoot, readme));
	}
	const repository = typeof pkg.repository === 'string' ? pkg.repository : pkg.repository?.url;
	const author = typeof pkg.author === 'string' ? { name: pkg.author } : pkg.author ?? { name: pkg.publisher };
	const versions = (previous?.versions ?? []).filter(v => v.version !== pkg.version);
	versions.push({ version: pkg.version, path: relPackage, sha256: digest, size: buffer.length, apiVersion: pkg.breezell.apiVersion, permissions: pkg.breezell.permissions ?? [], publishedAt: new Date().toISOString() });
	versions.sort((a, b) => compareVersions(b.version, a.version));
	const meta = {
		id,
		displayName: pkg.displayName,
		description: pkg.description,
		categories: (pkg.categories ?? []).filter(c => c !== 'Other').slice(0, 6),
		tags: (pkg.keywords ?? []).slice(0, 12),
		source: pkg.breezell.source,
		repository: repository && isHttps(repository) ? repository : undefined,
		author: { name: author.name ?? pkg.publisher, url: author.url && isHttps(author.url) ? author.url : undefined },
		license: pkg.license,
		icon,
		readme,
		versions,
	};
	writeJson(metaFile, meta);
	writeJson(path.join(marketRoot, 'index.json'), buildIndex(marketRoot));
	log(`added ${id} ${pkg.version} to ${marketRoot}`);
	log('next, in the market clone:');
	log(`  git checkout -b plugin/${id}-${pkg.version}`);
	log(`  git add plugins && git commit -m "Plugin: ${id} ${pkg.version}"`);
	log('  git push, then open a pull request to BreezellCode/BreezellCode');
}

function buildIndex(marketRoot) {
	const packagesDir = path.join(marketRoot, 'packages');
	const plugins = [];
	for (const id of fs.existsSync(packagesDir) ? fs.readdirSync(packagesDir).sort() : []) {
		const metaFile = path.join(packagesDir, id, 'plugin.json');
		if (!fs.existsSync(metaFile)) {
			continue;
		}
		const meta = readJson(metaFile);
		const latest = meta.versions?.[0];
		if (!latest) {
			continue;
		}
		plugins.push({
			id: meta.id,
			displayName: meta.displayName,
			description: meta.description,
			version: latest.version,
			apiVersion: latest.apiVersion,
			categories: meta.categories ?? [],
			tags: meta.tags ?? [],
			permissions: latest.permissions ?? [],
			source: meta.source,
			repository: meta.repository,
			author: meta.author,
			license: meta.license,
			icon: meta.icon,
			readme: meta.readme,
			package: { path: latest.path, sha256: latest.sha256, size: latest.size },
			updatedAt: latest.publishedAt,
		});
	}
	const updatedAt = plugins.map(p => p.updatedAt).sort().pop() ?? '1970-01-01T00:00:00.000Z';
	return { schemaVersion: 1, updatedAt, plugins };
}

/** Every package matches its plugin.json, and index.json is what buildIndex makes. */
function checkMarket(marketRoot) {
	const problems = [];
	const index = buildIndex(marketRoot);
	for (const entry of index.plugins) {
		const where = `${entry.id}@${entry.version}`;
		if (!ID_PART.test(entry.id.split('.')[0] ?? '') || entry.id.split('.').length !== 2) {
			problems.push(`${where}: bad id`);
			continue;
		}
		for (const rel of [entry.package.path, entry.icon, entry.readme].filter(Boolean)) {
			if (!/^[A-Za-z0-9._\-/]+$/.test(rel) || rel.split('/').some(s => s === '..' || s === '.' || !s) || !fs.existsSync(path.join(marketRoot, rel))) {
				problems.push(`${where}: missing or unsafe path ${rel}`);
			}
		}
		const file = path.join(marketRoot, entry.package.path);
		if (!fs.existsSync(file)) {
			continue;
		}
		const bytes = fs.readFileSync(file);
		if (sha256(bytes) !== entry.package.sha256 || bytes.length !== entry.package.size) {
			problems.push(`${where}: sha256 or size differs from plugin.json`);
			continue;
		}
		let read;
		try {
			read = readVsix(file);
		} catch (err) {
			problems.push(`${where}: cannot read the package: ${err.message}`);
			continue;
		}
		const { files, pkg } = read;
		if (pluginId(pkg) !== entry.id || pkg.version !== entry.version) {
			problems.push(`${where}: the package says ${pluginId(pkg)}@${pkg.version}`);
		}
		const { errors } = checkPackage(pkg, { forMarket: true });
		errors.forEach(e => problems.push(`${where}: ${e}`));
		const declared = [...(pkg.breezell?.permissions ?? [])].sort().join(',');
		if (declared !== [...entry.permissions].sort().join(',')) {
			problems.push(`${where}: permissions differ from the package (${declared})`);
		}
		if (pkg.breezell?.source !== entry.source) {
			problems.push(`${where}: source differs from the package (${pkg.breezell?.source})`);
		}
		if (entry.source === 'closed' && [...files.keys()].some(f => f.startsWith('extension/src/'))) {
			problems.push(`${where}: a closed source package contains src/`);
		}
		if (entry.source === 'open' && ![...files.keys()].some(f => f.startsWith('extension/src/'))) {
			problems.push(`${where}: an open source package has no src/`);
		}
	}
	const current = path.join(marketRoot, 'index.json');
	if (!fs.existsSync(current) || JSON.stringify(readJson(current)) !== JSON.stringify(index)) {
		problems.push('index.json is not up to date: run "node plugins/devkit/breezell-plugin.mjs index plugins"');
	}
	return { problems, count: index.plugins.length };
}

// ---------------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------------

const DEVKIT_DIR = path.dirname(SELF);

function readTree(root) {
	const out = {};
	const walk = rel => {
		const abs = path.join(root, rel);
		if (fs.statSync(abs).isDirectory()) {
			for (const name of fs.readdirSync(abs).sort()) {
				walk(rel ? `${rel}/${name}` : name);
			}
		} else {
			out[rel] = fs.readFileSync(abs, 'utf8');
		}
	};
	walk('');
	return out;
}

/** templates.json: shared files (with this CLI and the typings) plus every template. */
function templateSet() {
	const root = path.join(DEVKIT_DIR, 'templates');
	if (!fs.existsSync(root)) {
		return undefined;
	}
	const shared = readTree(path.join(root, '_shared'));
	shared['tools/breezell-plugin.mjs'] = fs.readFileSync(SELF, 'utf8');
	shared['types/breezell.d.ts'] = fs.readFileSync(path.join(DEVKIT_DIR, 'breezell.d.ts'), 'utf8');
	const templates = {};
	for (const id of fs.readdirSync(root).filter(n => !n.startsWith('_')).sort()) {
		const files = readTree(path.join(root, id));
		const about = JSON.parse(files['template.json'] ?? '{}');
		delete files['template.json'];
		templates[id] = { label: about.label ?? id, description: about.description ?? '', files };
	}
	return { schemaVersion: 1, devkitVersion: DEVKIT_VERSION, shared, templates };
}

async function fetchTemplateSet() {
	for (const base of MARKET_URLS) {
		try {
			const response = await fetch(`${base}devkit/templates.json`, { signal: AbortSignal.timeout(15000) });
			if (response.ok) {
				return await response.json();
			}
		} catch {
			// next mirror
		}
	}
	fail('could not download the templates from GitHub or jsDelivr');
}

async function init(dir, flags) {
	const [publisher, name] = typeof flags.id === 'string' ? flags.id.toLowerCase().split('.') : [];
	if (!ID_PART.test(publisher ?? '') || !ID_PART.test(name ?? '')) {
		fail('--id publisher.name is required (lowercase letters, digits, dashes), e.g. --id my-name.my-plugin');
	}
	const displayName = typeof flags['display-name'] === 'string' ? flags['display-name'] : name;
	const description = typeof flags.description === 'string' ? flags.description : '';
	for (const [label, value, max] of [['display-name', displayName, 60], ['description', description, 200]]) {
		if (value.length > max || /["\\<>`\u0000-\u001f]/.test(value)) {
			fail(`--${label}: at most ${max} characters, no quotes, backslashes or angle brackets`);
		}
	}
	const source = flags.source === 'closed' ? 'closed' : 'open';
	const set = templateSet() ?? await fetchTemplateSet();
	const templateId = typeof flags.template === 'string' ? flags.template : 'webview';
	const template = set.templates[templateId];
	if (!template) {
		fail(`unknown template "${templateId}" (${Object.keys(set.templates).join(', ')})`);
	}
	const target = path.resolve(dir ?? name);
	if (fs.existsSync(target) && fs.readdirSync(target).length && !flags.force) {
		fail(`${target} is not empty (use --force to write into it)`);
	}
	const values = { publisher, name, id: `${publisher}.${name}`, displayName, description, source, apiVersion: String(API_VERSION) };
	const fillIn = text => text.replace(/\{\{(\w+)\}\}/g, (m, key) => values[key] ?? m);
	for (const [rel, content] of Object.entries({ ...set.shared, ...template.files })) {
		const file = path.join(target, ...rel.split('/'));
		fs.mkdirSync(path.dirname(file), { recursive: true });
		fs.writeFileSync(file, fillIn(content));
	}
	log(`created ${values.id} in ${target}`);
	log('next: npm install, open the folder in Breezell and press F5');
}

// ---------------------------------------------------------------------------

const HELP = `breezell-plugin ${DEVKIT_VERSION}

  init [dir] --id publisher.name [--display-name "My Plugin"] [--description "..."]
             [--template webview|ai|blank] [--source open|closed]
  build [dir] [--closed] [--watch]
  validate [dir]
  pack [dir] --open | --closed [--out <folder>]
  submit [dir] --market <clone of BreezellCode/BreezellCode> [--vsix <file>]
  index <market plugins folder> [--check]
  templates-json [--check <file>]
  types
`;

async function main() {
	const [command, ...rest] = process.argv.slice(2);
	const { positional, flags } = parseArgs(rest);
	const dir = path.resolve(positional[0] ?? '.');
	switch (command) {
		case 'init':
			return init(positional[0], flags);
		case 'build':
			return build(dir, { closed: !!flags.closed, watch: !!flags.watch });
		case 'validate': {
			const { errors, warnings } = checkPackage(readJson(path.join(dir, 'package.json')));
			warnings.forEach(w => log(`warning: ${w}`));
			if (errors.length) {
				fail(`package.json:\n  - ${errors.join('\n  - ')}`);
			}
			return log('package.json is fine');
		}
		case 'pack':
			return void await pack(dir, flags);
		case 'submit':
			return submit(dir, flags);
		case 'index': {
			if (!positional[0]) {
				fail('index <market plugins folder>');
			}
			if (flags.check) {
				const { problems, count } = checkMarket(dir);
				if (problems.length) {
					fail(`market check failed:\n  - ${problems.join('\n  - ')}`);
				}
				return log(`market is consistent: ${count} plugins`);
			}
			writeJson(path.join(dir, 'index.json'), buildIndex(dir));
			return log(`wrote ${path.join(dir, 'index.json')}`);
		}
		case 'templates-json': {
			const set = templateSet();
			if (!set) {
				fail('run this from a clone of the market (plugins/devkit/templates is missing)');
			}
			const text = `${JSON.stringify(set, null, '\t')}\n`;
			if (typeof flags.check === 'string') {
				if (!fs.existsSync(flags.check) || fs.readFileSync(flags.check, 'utf8') !== text) {
					fail(`${flags.check} is not up to date: run "node plugins/devkit/breezell-plugin.mjs templates-json > plugins/devkit/templates.json"`);
				}
				return log(`${flags.check} is up to date`);
			}
			return process.stdout.write(text);
		}
		case 'types':
			return process.stdout.write(fs.existsSync(path.join(DEVKIT_DIR, 'breezell.d.ts'))
				? fs.readFileSync(path.join(DEVKIT_DIR, 'breezell.d.ts'), 'utf8')
				: fs.readFileSync(path.join(DEVKIT_DIR, '..', 'types', 'breezell.d.ts'), 'utf8'));
		case undefined:
		case 'help':
		case '--help':
			return log(HELP);
		default:
			fail(`unknown command "${command}"\n\n${HELP}`);
	}
}

main().catch(err => {
	process.stderr.write(`${err instanceof UserError ? err.message : err.stack ?? err}\n`);
	process.exit(1);
});
