import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const require = createRequire(import.meta.url);

describe("vendored dsh-coding-oauth-core publish prep", () => {
	it("is publishable 0.1.2 with lib subpath exports", async () => {
		const manifest = JSON.parse(await readFile(join(root, "vendor/dsh-coding-oauth-core/package.json"), "utf8"));
		expect(manifest.name).toBe("dsh-coding-oauth-core");
		expect(manifest.version).toBe("0.1.2");
		expect(manifest.private).not.toBe(true);
		expect(manifest.main).toBe("./lib/index.js");
		expect(manifest.files).toEqual(["lib", "README.md", "CHANGELOG.md", "LICENSE"]);
		for (const key of [
			".",
			"./contracts",
			"./http-json",
			"./grok-errors",
			"./kimi-errors",
			"./gateway-protocol",
			"./package.json",
		]) {
			expect(manifest.exports?.[key]).toBeTruthy();
		}

		const resolved = require.resolve("dsh-coding-oauth-core");
		expect(resolved.replaceAll("\\", "/")).toMatch(/vendor\/dsh-coding-oauth-core\/lib\/index\.js$/);

		const core = await import("dsh-coding-oauth-core");
		expect(core.CODING_OAUTH_CORE_ABI).toBe("dsh-coding-oauth-core/v1");
		expect(typeof core.isXaiCapacityError).toBe("function");
		expect(typeof core.readJsonRequest).toBe("function");
		expect(typeof core.isThinkingLevel).toBe("function");

		const httpJson = await import("dsh-coding-oauth-core/http-json");
		expect(httpJson.JSON_BODY_LIMIT_BYTES).toBe(64 * 1024);
	});
});
