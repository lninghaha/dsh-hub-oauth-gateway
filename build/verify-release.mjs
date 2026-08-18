import assert from "node:assert/strict";
import { access, readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const root = resolve(".");
const manifest = JSON.parse(await readFile(resolve(root, "package.json"), "utf8"));
assert.equal(manifest.name, "dsh-hub-oauth-gateway");
assert.equal(manifest.version, "1.2.0");
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

console.log(`verified ${manifest.name}@${manifest.version} release artifacts`);
