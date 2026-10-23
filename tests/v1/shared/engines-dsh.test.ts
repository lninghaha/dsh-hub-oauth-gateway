import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const require = createRequire(import.meta.url);
const semver = require(require.resolve("semver", { paths: [require.resolve("vitest/package.json")] })) as {
	satisfies(version: string, range: string, options?: { includePrerelease?: boolean }): boolean;
};

/**
 * Mirror of `@deepseek-ai/dsh-app-boot` evaluatePluginCompatibility when engines.dsh is set:
 * the engines.dsh range alone decides (includePrerelease: true); peers are ignored.
 */
function enginesDshAccepts(runtimeVersion: string, enginesDsh: string): boolean {
	return semver.satisfies(runtimeVersion, enginesDsh, { includePrerelease: true });
}

describe("engines.dsh install gate", () => {
	it("accepts verified 0.1.1-rc.2 and candidate 0.2.1-rc.2, rejects 0.3.0", async () => {
		const manifest = JSON.parse(await readFile(join(root, "package.json"), "utf8")) as {
			engines?: { dsh?: string };
		};
		const range = manifest.engines?.dsh;
		expect(typeof range).toBe("string");
		expect(range).toBe(">=0.1.1-rc.2 <0.3.0");
		if (typeof range !== "string") throw new Error("engines.dsh missing");

		expect(enginesDshAccepts("0.1.1-rc.2", range)).toBe(true);
		expect(enginesDshAccepts("0.2.1-rc.2", range)).toBe(true);
		expect(enginesDshAccepts("0.3.0", range)).toBe(false);
	});
});
