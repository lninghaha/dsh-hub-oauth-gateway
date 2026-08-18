import { cp, mkdir, readdir, rename, rm } from "node:fs/promises";
import { dirname, extname, join, resolve } from "node:path";

const source = resolve(".next/lib");
const target = resolve("lib");
const staging = resolve(`.release-lib-${process.pid}`);
const backup = resolve(`.release-lib-backup-${process.pid}`);
const runtimeFiles = new Set([
	"index.js",
	"index.js.map",
	"client.js",
	"client.js.map",
	"bin.js",
	"bin.js.map",
	"invariant.js",
	"invariant.js.map",
]);

async function moveDirectory(from, to) {
	try {
		await rename(from, to);
	} catch (error) {
		if (error?.code !== "EXDEV") throw error;
		await cp(from, to, { recursive: true, errorOnExist: true, force: false });
		await rm(from, { recursive: true, force: true });
	}
}

async function copyDeclarations(from, relative = "") {
	for (const entry of await readdir(from, { withFileTypes: true })) {
		const nextRelative = join(relative, entry.name);
		const absolute = join(from, entry.name);
		if (entry.isDirectory()) {
			await copyDeclarations(absolute, nextRelative);
		} else if (
			entry.isFile() &&
			((extname(entry.name) === ".ts" && entry.name.endsWith(".d.ts")) || entry.name.endsWith(".d.ts.map"))
		) {
			await mkdir(dirname(join(staging, nextRelative)), { recursive: true });
			await cp(absolute, join(staging, nextRelative));
		}
	}
}

await rm(staging, { recursive: true, force: true });
await rm(backup, { recursive: true, force: true });
await mkdir(staging, { recursive: true });
for (const name of runtimeFiles) await cp(join(source, name), join(staging, name));
await copyDeclarations(source);

let replacedExisting = false;
try {
	await moveDirectory(target, backup);
	replacedExisting = true;
} catch (error) {
	if (error?.code !== "ENOENT") throw error;
}
try {
	await moveDirectory(staging, target);
} catch (error) {
	await rm(target, { recursive: true, force: true });
	if (replacedExisting) await moveDirectory(backup, target);
	throw error;
}
try {
	await import(`./verify-release.mjs?promotion=${Date.now()}`);
} catch (error) {
	await rm(target, { recursive: true, force: true });
	if (replacedExisting) await moveDirectory(backup, target);
	throw error;
}
await rm(backup, { recursive: true, force: true });
console.log(`promoted and verified ${target}`);
