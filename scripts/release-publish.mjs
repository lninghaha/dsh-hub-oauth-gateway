#!/usr/bin/env node
/**
 * Maintainer-only final gate + npm publish.
 * Agent prepares everything else; the operator runs only:
 *   cd <repo>
 *   npm login --registry https://registry.npmjs.org/
 *   pnpm run release:publish
 *
 * Prefers Node from `$HOME/.nvm/versions/node/v$(.nvmrc)/bin` so Cursor Cloud's
 * `/exec-daemon/node` 22.14 does not drive the publish path.
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { delimiter, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const nvmrc = readFileSync(join(root, ".nvmrc"), "utf8").trim();
const nvmBin = join(homedir(), ".nvm", "versions", "node", `v${nvmrc}`, "bin");
const nvmNode = join(nvmBin, "node");

function run(command, args, options = {}) {
	const result = spawnSync(command, args, {
		cwd: root,
		env: process.env,
		stdio: "inherit",
		shell: false,
		...options,
	});
	if (result.error) {
		throw result.error;
	}
	if (result.status !== 0) {
		process.exit(result.status ?? 1);
	}
}

if (existsSync(nvmNode)) {
	process.env.PATH = `${nvmBin}${delimiter}${process.env.PATH ?? ""}`;
	if (process.execPath !== nvmNode) {
		const relaunch = spawnSync(nvmNode, [fileURLToPath(import.meta.url), ...process.argv.slice(2)], {
			cwd: root,
			env: process.env,
			stdio: "inherit",
		});
		process.exit(relaunch.status ?? 1);
	}
}

run(process.execPath, [join(root, "scripts/assert-node.mjs")]);
run("pnpm", ["run", "release:inspect"]);
run("npm", ["publish", "--access", "public", "--registry", "https://registry.npmjs.org/"]);
run("npm", ["view", "dsh-hub-oauth-gateway", "version", "--registry", "https://registry.npmjs.org/"]);
run("npm", ["view", "dsh-hub-oauth-gateway", "dist-tags", "--registry", "https://registry.npmjs.org/"]);
