import { describe, expect, it } from "vitest";
import type { AccountSnapshot } from "../../../src/shared/domain.js";
import { ProvidersDataSchema } from "../../../src/shared/providers.js";
import { collectProvidersData } from "../../../src/server/providers/catalog.js";

function snapshot(overrides: Partial<AccountSnapshot> = {}): AccountSnapshot {
	return {
		providerId: "deepseek-official",
		displayName: "DeepSeek",
		adapterId: "deepseek-balance",
		mode: "balance",
		status: "ok",
		configured: true,
		fetchedAt: 1_700_000_000_000,
		stale: false,
		plan: null,
		balance: {
			remaining: 12,
			used: null,
			limit: null,
			currency: "USD",
			unlimited: false,
		},
		windows: [],
		missingCredentials: [],
		warningCode: null,
		...overrides,
	};
}

describe("provider catalog", () => {
	it("maps configured API-key accounts without OAuth runtime", async () => {
		const data = await collectProvidersData({
			accounts: [
				snapshot(),
				snapshot({
					providerId: "missing-key",
					displayName: "Missing",
					adapterId: "general",
					status: "not-configured",
					configured: false,
					fetchedAt: null,
					balance: null,
				}),
			],
			now: () => 1_700_000_100_000,
		});
		expect(ProvidersDataSchema.parse(data).schemaVersion).toBe(1);
		expect(data.summary.total).toBe(2);
		expect(data.summary.connected).toBe(1);
		expect(data.summary.unconfigured).toBe(1);
		expect(data.providers[0]?.connection).toBe("connected");
		expect(data.providers[0]?.authSource).toBe("api-key");
		expect(data.providers[1]?.connection).toBe("unconfigured");
	});

	it("keeps quota failure separate from an absent OAuth owner", async () => {
		const data = await collectProvidersData({
			accounts: [
				snapshot({
					providerId: "relay-a",
					displayName: "Relay",
					adapterId: "new-api",
					status: "error",
					stale: true,
					warningCode: "upstream-error",
				}),
			],
		});
		expect(data.providers[0]?.connection).toBe("configured-failing");
		expect(data.providers[0]?.quotaState).toBe("unavailable");
		expect(data.summary.needsAttention).toBe(1);
	});
});
