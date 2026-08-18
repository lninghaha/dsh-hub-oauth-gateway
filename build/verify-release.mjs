import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { access, readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";

const execute = promisify(execFile);

const root = resolve(".");
const manifest = JSON.parse(await readFile(resolve(root, "package.json"), "utf8"));
assert.equal(manifest.name, "dsh-hub-oauth-gateway");
assert.equal(manifest.version, "1.1.0");
assert.notEqual(manifest.private, true, "release package must not be private");

for (const path of [
	"lib/index.js",
	"lib/index.d.ts",
	"lib/index.d.ts.map",
	"lib/client.js",
	"lib/bin.js",
	"lib/invariant.js",
	"cordis.patch.yml",
	"README.md",
	"SECURITY.md",
	"NOTICE",
	"LICENSES/Apache-2.0.txt",
	"docs/oauth-provenance.md",
]) {
	await access(resolve(root, path));
}
for (const path of [manifest.main, manifest.types, manifest.exports?.["."]?.import, manifest.exports?.["."]?.types]) {
	assert.equal(typeof path, "string", "root package entrypoints must be strings");
	await access(resolve(root, path));
}
assert.equal(manifest.exports?.["./client"], "./lib/client.js");
assert.equal(manifest.license, "MIT AND Apache-2.0");
assert.equal(manifest.bin?.["dsh-coding-oauth"], "lib/bin.js");
assert.equal(manifest.bin?.["dsh-grok-build"], "lib/bin.js");
assert.equal(
	manifest.exports?.["./invariant"]?.import ?? manifest.exports?.["./invariant"]?.default,
	"./lib/invariant.js",
);

const files = await readdir(resolve(root, "lib"));
for (const stale of ["usage.js", "accounts.js", "balance.js", "subscriptions.js", "oauth-device.js"]) {
	assert.equal(files.includes(stale), false, `stale legacy runtime must not ship: lib/${stale}`);
}

const serverSource = await readFile(resolve(root, "lib/index.js"), "utf8");
assert.match(
	serverSource.slice(0, 200),
	new RegExp(`dsh-hub-oauth-gateway ${manifest.version.replaceAll(".", "\\.")}`),
);
assert.doesNotMatch(serverSource, /from\s+["'](?:zod|@tanstack|uplot)/);
assert.doesNotMatch(serverSource, /import\(["'](?:zod|@tanstack|uplot)/);
const plugin = await import(`${pathToFileURL(resolve(root, "lib/index.js")).href}?verify=${Date.now()}`);
assert.equal(plugin.name, "usage-stats");
assert.equal(typeof plugin.apply, "function");
assert.equal(plugin.Config?.["~standard"]?.version, 1);

const clientSource = await readFile(resolve(root, "lib/client.js"), "utf8");
assert.match(clientSource.slice(0, 500), /window\.__ModuleLoader__\.load/);
assert.equal((clientSource.match(/window\.__ModuleLoader__\.load\(/g) ?? []).length, 1);
assert.match(clientSource, /["']dsh-hub-oauth-gateway["']/);

const SETTINGS_HTTP_MARKERS = ["/plugins/dsh-grok-build/oauth/status", "/plugins/dsh-grok-build/capabilities"];
for (const marker of SETTINGS_HTTP_MARKERS) {
	assert.ok(serverSource.includes(marker), `server bundle is missing Settings HTTP path ${marker}`);
	assert.ok(clientSource.includes(marker), `client bundle is missing Settings HTTP path ${marker}`);
}

const STALE_PLUGIN_IDS = ["llm-grok-build-oauth", "dsh-coding-subscription-oauth"];
for (const artifact of [
	["lib/index.js", serverSource],
	["lib/client.js", clientSource],
]) {
	const [label, source] = artifact;
	for (const stale of STALE_PLUGIN_IDS) {
		assert.equal(source.includes(stale), false, `${label} must not embed stale plugin id ${stale}`);
	}
}

const binPath = resolve(root, "lib/bin.js");
const binSource = await readFile(binPath, "utf8");
assert.match(binSource.slice(0, 100), /^#!\/usr\/bin\/env node/u);
for (const stale of STALE_PLUGIN_IDS) {
	assert.equal(binSource.includes(stale), false, `lib/bin.js must not embed stale plugin id ${stale}`);
}
await execute(process.execPath, ["--check", binPath]);
const helpEnv = { ...process.env };
for (const key of Object.keys(helpEnv)) {
	if (/proxy/iu.test(key)) delete helpEnv[key];
}
const cliHelp = await execute(process.execPath, [binPath, "--help"], { env: helpEnv, timeout: 10_000 });
assert.match(cliHelp.stdout, /login\|logout\|status\|import/u);
assert.match(cliHelp.stdout, /\blogin\b/);
assert.match(cliHelp.stdout, /\blogout\b/);
assert.match(cliHelp.stdout, /\bstatus\b/);
assert.match(cliHelp.stdout, /\bimport\b/);

console.log(`verified ${manifest.name}@${manifest.version} release artifacts`);
