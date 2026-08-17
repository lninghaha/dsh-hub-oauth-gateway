import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { join, relative, resolve } from "node:path";

const [expectedArgument, actualArgument] = process.argv.slice(2);
assert.equal(typeof expectedArgument, "string", "expected tree path is required");
assert.equal(typeof actualArgument, "string", "actual tree path is required");

async function manifest(root, directory = root) {
	const entries = [];
	for (const entry of await readdir(directory, { withFileTypes: true })) {
		const absolute = join(directory, entry.name);
		if (entry.isDirectory()) {
			entries.push(...(await manifest(root, absolute)));
			continue;
		}
		assert.equal(entry.isFile(), true, `unsupported release entry: ${absolute}`);
		const content = await readFile(absolute);
		entries.push({
			path: relative(root, absolute).replaceAll("\\", "/"),
			hash: createHash("sha256").update(content).digest("hex"),
		});
	}
	return entries.sort((left, right) => left.path.localeCompare(right.path));
}

const expected = resolve(expectedArgument);
const actual = resolve(actualArgument);
assert.deepEqual(await manifest(expected), await manifest(actual), `${actual} differs from ${expected}`);
console.log(`verified reproducible tree: ${actual}`);
