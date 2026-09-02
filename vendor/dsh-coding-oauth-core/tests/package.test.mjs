import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);

test("package metadata is publishable at 0.1.2", async () => {
	const manifest = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
	assert.equal(manifest.name, "dsh-coding-oauth-core");
	assert.equal(manifest.version, "0.1.2");
	assert.notEqual(manifest.private, true);
	assert.equal(manifest.main, "./lib/index.js");
	assert.equal(manifest.types, "./lib/index.d.ts");
	for (const key of [".", "./contracts", "./http-json", "./grok-errors", "./kimi-errors", "./gateway-protocol", "./package.json"]) {
		assert.ok(manifest.exports?.[key], `missing export ${key}`);
	}
	assert.deepEqual(manifest.files, ["lib", "README.md", "CHANGELOG.md", "LICENSE"]);
});

test("built lib exports resolve and expose helpers", async () => {
	const index = await import(pathToFileURL(join(root, "lib/index.js")).href);
	assert.equal(index.CODING_OAUTH_CORE_ABI, "dsh-coding-oauth-core/v1");
	assert.equal(typeof index.isXaiCapacityError, "function");
	assert.equal(typeof index.isThinkingLevel, "function");
	assert.equal(typeof index.readJsonRequest, "function");
	assert.equal(typeof index.remapAuthFailureIfContextOverflow, "function");

	const httpJson = await import(pathToFileURL(join(root, "lib/http-json.js")).href);
	assert.equal(httpJson.JSON_BODY_LIMIT_BYTES, 64 * 1024);

	const grok = await import(pathToFileURL(join(root, "lib/grok-errors.js")).href);
	assert.equal(grok.isXaiCapacityError("upstream overloaded, retry later"), true);
	assert.equal(grok.isXaiCapacityError("401 invalid token"), false);

	const gateway = await import(pathToFileURL(join(root, "lib/gateway-protocol.js")).href);
	assert.equal(gateway.isThinkingLevel("high"), true);
	assert.equal(gateway.isThinkingLevel("nope"), false);

	const contracts = await import(pathToFileURL(join(root, "lib/contracts.js")).href);
	assert.equal(contracts.CODING_OAUTH_CORE_ABI, "dsh-coding-oauth-core/v1");

	// Ensure package.json resolve works the same way consumers will.
	assert.equal(require.resolve("../package.json"), join(root, "package.json"));
});
