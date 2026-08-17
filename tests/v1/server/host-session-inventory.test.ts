import { describe, expect, it, vi } from "vitest";
import { DshSessionInventory } from "../../../src/server/host/session-inventory.js";

describe("DSH session inventory warnings", () => {
	it("reports a sanitized fallback warning and clears it after recovery", async () => {
		const warnings: Array<string | null> = [];
		const listSnapshots = vi
			.fn()
			.mockRejectedValueOnce(new Error("failed at /home/private/session-index.json"))
			.mockResolvedValueOnce([{ header: { id: "persisted" }, revision: "revision-2" }]);
		const inventory = new DshSessionInventory({
			sessions: undefined,
			persistence: {
				listSnapshots,
				list: async () => [{ id: "persisted" }],
				readFrom: async () => ({ events: [] }),
			},
			onWarning: (warning) => warnings.push(warning),
		});

		expect(await inventory.observeSessions()).toMatchObject([{ id: "persisted", revision: null }]);
		expect(warnings[0]).toBe("session snapshot inventory is degraded; using compatibility listing");
		expect(warnings[0]).not.toContain("/home/private");
		expect(await inventory.observeSessions()).toMatchObject([{ id: "persisted", revision: "revision-2" }]);
		expect(warnings.at(-1)).toBeNull();
	});
});
