#!/usr/bin/env node

import { access, cp, lstat, mkdir, readFile, rename, rm, symlink, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const knownFlags = new Set(["--check", "--dry-run", "--no-enable", "--help"]);
const args = new Set(process.argv.slice(2));
for (const arg of args) {
	if (!knownFlags.has(arg)) {
		console.error(`Unknown option: ${arg}`);
		process.exit(2);
	}
}

if (args.has("--help")) {
	console.log(`dsh-hub-oauth-gateway installer

Usage:
  npx --yes dsh-hub-oauth-gateway-install [options]

Options:
  --check      Verify the installed package and Cordis patch without changing them
  --dry-run    Print the resolved paths and planned changes
  --no-enable  Install files without editing cordis.patch.yml
  --help       Show this help

Set DSH_HOME to override the default ~/.dsh location.`);
	process.exit(0);
}

const sourceRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const sourcePackage = JSON.parse(await readFile(join(sourceRoot, "package.json"), "utf8"));
const dshHome = process.env.DSH_HOME ?? join(homedir(), ".dsh");
const target = join(dshHome, "profiles", "node_modules", "dsh-hub-oauth-gateway");
const patchPath = join(dshHome, "profiles", "web", "cordis.patch.yml");
const pluginLine = /^\s+name:\s*dsh-hub-oauth-gateway\s*$/gm;
const patchBlock = `# dsh-hub-oauth-gateway: local usage, cost, account, and quota dashboard
- insert:
    - id: usage-stats
      name: dsh-hub-oauth-gateway
`;
const emptySequenceRoot = /^\[\](?:[ \t]+#.*)?$/;

function meaningfulPatchLines(text) {
	return String(text)
		.split(/\r?\n/)
		.map((line, index) => ({
			index,
			indent: line.match(/^[ \t]*/)?.[0].length ?? 0,
			content: line.trim(),
		}))
		.filter(({ content }) => content !== "" && !content.startsWith("#") && content !== "---" && content !== "...");
}

/** Remove a YAML document whose only value is the empty root sequence `[]`. */
function withoutEmptySequenceRoot(text) {
	const meaningful = meaningfulPatchLines(text);
	if (meaningful.length === 0) return text;
	const rootIndent = Math.min(...meaningful.map(({ indent }) => indent));
	const emptyRoot = meaningful.find(({ indent, content }) => indent === rootIndent && emptySequenceRoot.test(content));
	if (emptyRoot === void 0) return text;
	const lines = String(text).split(/\r?\n/);
	const inlineComment = lines[emptyRoot.index].match(/^([ \t]*)\[\][ \t]+(#.*)$/);
	if (inlineComment === null) lines.splice(emptyRoot.index, 1);
	else lines[emptyRoot.index] = `${inlineComment[1]}${inlineComment[2]}`;
	return lines
		.filter((line) => line.trim() !== "...")
		.join("\n")
		.trimEnd();
}

/** Detect the exact invalid shape produced by older installers: `[]` plus list entries. */
function assertNoEmptyRootConflict(text) {
	const meaningful = meaningfulPatchLines(text);
	if (meaningful.length < 2) return;
	const rootIndent = Math.min(...meaningful.map(({ indent }) => indent));
	const roots = meaningful.filter(({ indent }) => indent === rootIndent);
	if (roots.some(({ content }) => emptySequenceRoot.test(content)) && roots.length > 1) {
		throw new Error(
			`invalid YAML in ${patchPath}: empty root sequence [] cannot be combined with patch entries; rerun the installer to repair it`,
		);
	}
}

/** Preserve existing YAML/comments while adding exactly one plugin patch entry. */
function enablePluginInPatch(text) {
	const base = withoutEmptySequenceRoot(text);
	if ([...base.matchAll(pluginLine)].length > 0) return base;
	return base.trim() === "" ? patchBlock : `${base.trimEnd()}\n\n${patchBlock}`;
}

async function readOptional(path) {
	try {
		return await readFile(path, "utf8");
	} catch (error) {
		if (error?.code === "ENOENT") return null;
		throw error;
	}
}

async function linkPeerModules(root) {
	const peers = Object.keys(sourcePackage.peerDependencies ?? {});
	const sourceModules = join(sourceRoot, "node_modules");
	const destinationRoot = join(root, "node_modules");
	for (const name of peers) {
		if (name === "@deepseek-ai/dsh-tools") continue;
		const source = join(sourceModules, name);
		const destination = join(destinationRoot, name);
		try {
			await access(source);
		} catch {
			continue;
		}
		await mkdir(dirname(destination), { recursive: true });
		try {
			const existing = await lstat(destination);
			if (existing.isSymbolicLink() || existing.isDirectory()) await rm(destination, { recursive: true, force: true });
		} catch {
			// destination may not exist yet
		}
		await symlink(source, destination, "dir");
	}
}

async function validatePackageRoot(root) {
	const installedRaw = await readOptional(join(root, "package.json"));
	if (installedRaw === null) throw new Error(`package manifest is missing from ${root}`);
	const installed = JSON.parse(installedRaw);
	if (installed.name !== sourcePackage.name || installed.version !== sourcePackage.version) {
		throw new Error(
			`installed package is ${installed.name ?? "unknown"}@${installed.version ?? "unknown"}; expected ${sourcePackage.name}@${sourcePackage.version}`,
		);
	}
	const client = await readOptional(join(root, "lib", "client.js"));
	if (client === null || (client.match(/window\.__ModuleLoader__\.load\(/g) ?? []).length !== 1) {
		throw new Error(`client bundle validation failed in ${root}`);
	}
	const serverPath = join(root, "lib", "index.js");
	if ((await readOptional(serverPath)) === null) throw new Error(`server bundle is missing from ${root}`);
	await linkPeerModules(root);
	const plugin = await import(`${pathToFileURL(serverPath).href}?installer=${Date.now()}`);
	if (plugin.name !== "usage-stats" || typeof plugin.apply !== "function") {
		throw new Error(`server plugin contract validation failed in ${root}`);
	}
}

function asPlainObject(value) {
	return value !== null && typeof value === "object" && !Array.isArray(value) ? value : null;
}

function parseWebProfileManifest(raw, path) {
	let parsed;
	try {
		parsed = JSON.parse(raw);
	} catch {
		throw new Error(`invalid JSON in ${path}; refusing to install until the web profile manifest can be parsed`);
	}
	const manifest = asPlainObject(parsed);
	if (manifest === null) {
		throw new Error(`invalid web profile manifest in ${path}; refusing to install`);
	}
	if (manifest.dsh === undefined) return false;
	const dsh = asPlainObject(manifest.dsh);
	if (dsh === null) throw new Error(`invalid dsh field in ${path}; refusing to install`);
	if (dsh.profile === undefined) return false;
	const profile = asPlainObject(dsh.profile);
	if (profile === null) throw new Error(`invalid dsh.profile in ${path}; refusing to install`);
	if (profile.bundles === undefined) return false;
	if (!Array.isArray(profile.bundles) || profile.bundles.some((bundle) => typeof bundle !== "string")) {
		throw new Error(`invalid dsh.profile.bundles in ${path}; refusing to install`);
	}
	return profile.bundles.includes("dsh-hub-oauth-gateway");
}

async function managedByPluginManager() {
	const path = join(dshHome, "profiles", "web", "package.json");
	const raw = await readOptional(path);
	if (raw === null) return false;
	return parseWebProfileManifest(raw, path);
}

function injectFault(stage) {
	if (process.env.DSH_USAGE_STATS_INSTALL_FAULT === stage) {
		throw new Error(`injected ${stage} failure`);
	}
}

async function writeTextAtomic(path, value) {
	const temporary = `${path}.install-${process.pid}`;
	await mkdir(dirname(path), { recursive: true });
	await rm(temporary, { force: true });
	try {
		await writeFile(temporary, value, "utf8");
		await rename(temporary, path);
	} finally {
		await rm(temporary, { force: true });
	}
}

async function restorePackage(backup, installed) {
	await rm(installed, { recursive: true, force: true });
	if (backup !== null) await rename(backup, installed);
}

async function restorePatch(previous, path) {
	if (previous === null) await rm(path, { force: true });
	else await writeTextAtomic(path, previous);
}

async function verify(expectEnabled) {
	await validatePackageRoot(target);
	if (expectEnabled) {
		const patch = await readOptional(patchPath);
		const count = patch === null ? 0 : [...patch.matchAll(pluginLine)].length;
		if (count !== 1)
			throw new Error(`expected exactly one dsh-hub-oauth-gateway entry in ${patchPath}; found ${count}`);
		assertNoEmptyRootConflict(patch);
	}
	console.log(`Verified ${sourcePackage.name}@${sourcePackage.version}`);
	console.log(`  package: ${target}`);
	if (expectEnabled) console.log(`  patch:   ${patchPath}`);
}

const enable = !args.has("--no-enable");
if (await managedByPluginManager()) {
	throw new Error(
		"dsh-hub-oauth-gateway is registered in dsh.profile.bundles; use `dsh plugin --profile web update dsh-hub-oauth-gateway` instead of the fallback installer",
	);
}
if (args.has("--dry-run")) {
	console.log(`Would install ${sourcePackage.name}@${sourcePackage.version}`);
	console.log(`  package: ${target}`);
	console.log(`  patch:   ${enable ? patchPath : "unchanged (--no-enable)"}`);
	process.exit(0);
}

if (args.has("--check")) {
	await verify(enable);
	process.exit(0);
}

const staging = `${target}.install-${process.pid}`;
const packageBackup = `${target}.backup-${process.pid}`;
const patchBackup = `${patchPath}.backup-${process.pid}`;
await mkdir(dirname(target), { recursive: true });
await rm(staging, { recursive: true, force: true });
await rm(packageBackup, { recursive: true, force: true });
await rm(patchBackup, { force: true });
await mkdir(staging, { recursive: true });
for (const entry of ["lib", "cordis.patch.yml", "package.json", "README.md", "LICENSE", "SECURITY.md"]) {
	await cp(join(sourceRoot, entry), join(staging, entry), { recursive: true, force: true });
}
await mkdir(join(staging, "scripts"), { recursive: true });
await cp(fileURLToPath(import.meta.url), join(staging, "scripts", "install.mjs"), { force: true });
await validatePackageRoot(staging);

const previousPatch = enable ? await readOptional(patchPath) : null;
let packageBackedUp = false;
let packageInstalled = false;
let succeeded = false;
try {
	try {
		await rename(target, packageBackup);
		packageBackedUp = true;
	} catch (error) {
		if (error?.code !== "ENOENT") throw error;
	}
	if (previousPatch !== null) await writeFile(patchBackup, previousPatch, "utf8");

	await rename(staging, target);
	packageInstalled = true;
	injectFault("package");

	if (enable) {
		await mkdir(dirname(patchPath), { recursive: true });
		const enabledPatch = enablePluginInPatch(previousPatch ?? "");
		if (enabledPatch !== (previousPatch ?? "")) await writeTextAtomic(patchPath, enabledPatch);
		injectFault("patch");
	}

	await verify(enable);
	injectFault("verify");
	succeeded = true;
} catch (error) {
	try {
		if (packageInstalled || packageBackedUp) {
			await restorePackage(packageBackedUp ? packageBackup : null, target);
		}
		if (enable) await restorePatch(previousPatch, patchPath);
		await rm(packageBackup, { recursive: true, force: true });
		await rm(patchBackup, { force: true });
	} catch (rollbackError) {
		throw new Error(
			`${error instanceof Error ? error.message : error}; rollback failed: ${rollbackError instanceof Error ? rollbackError.message : rollbackError}`,
		);
	}
	throw error;
} finally {
	await rm(staging, { recursive: true, force: true });
	if (succeeded) {
		await rm(packageBackup, { recursive: true, force: true });
		await rm(patchBackup, { force: true });
	}
}

console.log("Installation complete. Restart dsh web manually when convenient, then refresh the browser.");
console.log("Credentials are optional and can be managed in Settings → Usage Center.");
