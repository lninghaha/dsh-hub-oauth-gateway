import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("generated standalone server bundle", () => {
	it("bundles non-platform dependencies and preserves the Cordis plugin contract", async () => {
		const path = resolve(".next/lib/index.js");
		const source = await readFile(path, "utf8");
		expect(source).not.toMatch(/from\s+["'](?:zod|@tanstack|uplot)/);
		expect(source).not.toMatch(/import\(["'](?:zod|@tanstack|uplot)/);
		const plugin = (await import(`${path}?test=${Date.now()}`)) as {
			name: string;
			apply: unknown;
			Config: { "~standard": { validate(value: unknown): { value?: { accounts?: unknown }; issues?: unknown } } };
		};
		expect(plugin.name).toBe("usage-stats");
		expect(typeof plugin.apply).toBe("function");
		expect(plugin.Config["~standard"].validate({ monitors: {} })).toMatchObject({
			value: { accounts: { monitors: {} } },
		});
	});
});
