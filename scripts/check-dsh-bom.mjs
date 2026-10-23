import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, parse, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { readDshClientPlatformContract } from "../build/dsh-client-platform.mjs";
import assert from "node:assert/strict";

const require = createRequire(import.meta.url);
const semver = require(require.resolve("semver", { paths: [require.resolve("vitest/package.json")] }));
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

function peerSatisfiesVerified(name, range, expected) {
	if (typeof range !== "string" || range.trim() === "") {
		failures.push(`peerDependencies.${name}: must be a non-empty SemVer range`);
		return;
	}
	if (range === "*" || range.startsWith("workspace:")) {
		failures.push(`peerDependencies.${name}: must not be "*" or a workspace protocol`);
		return;
	}
	if (!semver.satisfies(expected, range, { includePrerelease: true })) {
		failures.push(`peerDependencies.${name}: range ${JSON.stringify(range)} must satisfy verified ${expected}`);
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

const enginesDsh = manifest.engines?.dsh;
if (typeof enginesDsh !== "string" || enginesDsh.trim() === "") {
	failures.push("package.json engines.dsh must be a non-empty SemVer range");
} else {
	const verifiedRuntime = bom.verified.dshVersion;
	if (!semver.satisfies(verifiedRuntime, enginesDsh, { includePrerelease: true })) {
		failures.push(`engines.dsh ${JSON.stringify(enginesDsh)} must satisfy verified runtime ${verifiedRuntime}`);
	}
}

if (!Array.isArray(bom.candidates) || bom.candidates.some((candidate) => candidate?.status !== "unverified")) {
	failures.push("every untested DSH candidate must remain explicitly unverified");
}

for (const [name, expected] of Object.entries(bom.verified.packages)) {
	try {
		const actual = await installedVersion(name);
		if (actual !== expected) failures.push(`${name}: expected ${expected}, found ${actual}`);
	} catch {
		failures.push(`${name}: package is unavailable`);
	}

	const peer = manifest.peerDependencies?.[name];
	if (peer !== undefined) peerSatisfiesVerified(name, peer, expected);

	const sections = ["dependencies", "devDependencies"];
	for (const section of sections) {
		const declared = manifest[section]?.[name];
		if (declared === undefined) continue;
		// Verified DSH runtime packages stay exact in the build lock; other BOM packages
		// may use SemVer ranges that still satisfy the verified exact (e.g. cordis ^4.0.1).
		if (name.startsWith("@deepseek-ai/dsh") || name === "@deepseek-ai/dsh") {
			if (declared !== expected) {
				failures.push(`${section}.${name}: verified DSH build pin must stay exact ${expected}, found ${declared}`);
			}
			continue;
		}
		if (declared === expected) continue;
		if (!semver.satisfies(expected, declared, { includePrerelease: true })) {
			failures.push(`${section}.${name}: range ${JSON.stringify(declared)} must satisfy verified ${expected}`);
		}
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
console.log(
	`verified ${bom.verified.id} (${Object.keys(bom.verified.packages).length} exact packages; engines.dsh=${JSON.stringify(enginesDsh)})`,
);
