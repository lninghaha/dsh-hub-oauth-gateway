import { describe, expect, it } from "vitest";
import { collectProvidersData } from "../../../src/server/providers/catalog.js";
import type { AccountSnapshot } from "../../../src/shared/domain.js";
import { ProvidersDataSchema } from "../../../src/shared/providers.js";

function snapshot(overrides: Partial<AccountSnapshot> = {}): AccountSnapshot {
	return {
		providerId: "deepseek-official",
		profileId: "",
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
					profileId: "",
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
					profileId: "",
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

	it("prefers quota-bearing grok snapshots over unsupported route-id matches", async () => {
		const data = await collectProvidersData({
			accounts: [
				snapshot({
					providerId: "grok-build",
					displayName: "Grok Build route",
					adapterId: null,
					status: "unsupported",
					configured: false,
					balance: null,
					windows: [],
				}),
				snapshot({
					providerId: "grok",
					displayName: "Grok",
					adapterId: "grok-subscription",
					mode: "subscription",
					status: "ok",
					configured: true,
					balance: null,
					windows: [
						{
							id: "session",
							kind: "session",
							label: "Session",
							unit: "percent",
							used: null,
							remaining: null,
							limit: null,
							usedRatio: 0.4,
							resetsAt: null,
							rolling: true,
						},
					],
				}),
			],
			codingOAuth: {
				grok: {
					store: {
						read: async () => ({ type: "oauth", access: "x", refresh: "y", expires: Date.now() + 60_000 }),
					},
					availableModels: () => [{ id: "grok-3" }],
					selectedModelIds: () => ["grok-3"],
					models: { getAuth: async () => undefined },
				},
				subscriptions: [],
				readCodexUsage: async () => ({}),
				currentCapabilities: () => ({}),
				onCredentialChange: () => () => undefined,
			} as never,
			now: () => 1_700_000_100_000,
		});
		const grok = data.providers.find((provider) => provider.id === "grok-build");
		expect(grok?.quotaState).toBe("available");
		expect(grok?.connection).toBe("connected");
	});
});
