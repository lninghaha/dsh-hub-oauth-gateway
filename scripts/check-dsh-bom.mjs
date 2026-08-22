import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, parse, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { readDshClientPlatformContract } from "../build/dsh-client-platform.mjs";
import assert from "node:assert/strict";

const require = createRequire(import.meta.url);
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const bom = JSON.parse(await readFile(resolve(root, "compatibility/dsh-bom.json"), "utf8"));
const manifest = JSON.parse(await readFile(resolve(root, "package.json"), "utf8"));
const failures = [];

async function installedVersion(name) {
	try {
		return JSON.parse(await readFile(require.resolve(`${name}/package.json`), "utf8")).version;
	} catch {
		let directory = dirname(fileURLToPath(import.meta.resolve(name)));
		const rootDirectory = parse(directory).root;
		while (directory !== rootDirectory) {
			try {
				const candidate = JSON.parse(await readFile(resolve(directory, "package.json"), "utf8"));
				if (candidate.name === name && typeof candidate.version === "string") return candidate.version;
			} catch {
				// Continue towards the package root when an intermediate directory has no manifest.
			}
			directory = dirname(directory);
		}
		throw new Error(`${name}: package manifest is unavailable`);
	}
}

if (manifest.dsh?.compatibility?.coreAbi !== bom.coreAbi) {
	failures.push("package.json dsh.compatibility.coreAbi does not match the verified BOM");
}
if (manifest.dsh?.compatibility?.verifiedBom !== "./compatibility/dsh-bom.json") {
	failures.push("package.json dsh.compatibility.verifiedBom must point to ./compatibility/dsh-bom.json");
}
try {
	assert.deepEqual(manifest.dsh?.compatibility?.verified, bom.verified);
} catch {
	failures.push("package.json dsh.compatibility.verified does not exactly match compatibility/dsh-bom.json");
}

for (const [name, expected] of Object.entries(bom.verified.packages)) {
	try {
		const actual = await installedVersion(name);
		if (actual !== expected) failures.push(`${name}: expected ${expected}, found ${actual}`);
	} catch {
		failures.push(`${name}: package is unavailable`);
	}
}

const platform = await readDshClientPlatformContract().catch((error) => {
	failures.push(error instanceof Error ? error.message : "client platform contract is unavailable");
	return null;
});
if (platform !== null && platform.version !== bom.verified.packages["@deepseek-ai/dsh-client-web"]) {
	failures.push(`client platform version ${platform.version} does not match verified BOM`);
}

if (failures.length > 0) {
	throw new Error(`DSH BOM check failed:\n${failures.map((failure) => `- ${failure}`).join("\n")}`);
}
console.log(`verified ${bom.verified.id} (${Object.keys(bom.verified.packages).length} exact packages)`);
