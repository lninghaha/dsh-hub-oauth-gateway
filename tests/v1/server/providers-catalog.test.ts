import { describe, expect, it } from "vitest";
import { collectProvidersData } from "../../../src/server/providers/catalog.js";
import type { AccountSnapshot } from "../../../src/shared/domain.js";
import { ProvidersDataSchema } from "../../../src/shared/providers.js";

const NOW = 1_700_000_100_000;

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

function signedInGrokRuntime(subscriptions: unknown[] = []) {
	return {
		grok: {
			store: {
				read: async () => ({ type: "oauth", access: "x", refresh: "y", expires: Date.now() + 60_000 }),
			},
			availableModels: () => [{ id: "grok-3" }],
			selectedModelIds: () => ["grok-3"],
			models: { getAuth: async () => undefined },
		},
		subscriptions,
		readCodexUsage: async () => ({}),
		currentCapabilities: () => ({}),
		onCredentialChange: () => () => undefined,
	} as never;
}

function codexSession(authenticated: boolean) {
	return {
		definition: {
			slug: "codex",
			route: "codex-oauth",
			nativeProviderId: "openai-codex",
			displayName: "OpenAI Codex (ChatGPT Plus/Pro)",
		},
		status: async () =>
			authenticated ? { authenticated: true, expiresAt: NOW + 3_600_000 } : { authenticated: false },
		availableModels: () => [{ id: "gpt-5-codex" }],
		selectedModelIds: () => ["gpt-5-codex"],
	};
}

function codexAccount(overrides: Partial<AccountSnapshot> = {}): AccountSnapshot {
	return snapshot({
		providerId: "codex",
		displayName: "Codex",
		adapterId: "codex-wham",
		mode: "subscription",
		balance: null,
		windows: [
			{
				id: "codex:session",
				kind: "session",
				label: "Session",
				unit: "percent",
				used: 40,
				remaining: 60,
				limit: 100,
				usedRatio: 0.4,
				resetsAt: null,
				rolling: true,
			},
		],
		...overrides,
	});
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
			now: () => NOW,
		});
		expect(ProvidersDataSchema.parse(data).schemaVersion).toBe(1);
		expect(data.summary.total).toBe(2);
		expect(data.summary.connected).toBe(1);
		expect(data.summary.unconfigured).toBe(1);
		expect(data.providers[0]?.connection).toBe("connected");
		expect(data.providers[0]?.authSource).toBe("api-key");
		expect(data.providers[0]?.accountProviderId).toBe("deepseek-official");
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
			codingOAuth: signedInGrokRuntime(),
			now: () => NOW,
		});
		const grok = data.providers.find((provider) => provider.id === "grok-build");
		expect(grok?.quotaState).toBe("available");
		expect(grok?.connection).toBe("connected");
		expect(grok?.accountProviderId).toBe("grok");
		// Both grok snapshots are absorbed by the OAuth card: no duplicates.
		expect(data.providers.filter((provider) => provider.id === "grok")).toHaveLength(0);
		expect(data.providers.filter((provider) => provider.id === "grok-build")).toHaveLength(1);
	});

	it("merges subscription accounts into their OAuth record instead of duplicating cards", async () => {
		const data = await collectProvidersData({
			accounts: [codexAccount()],
			codingOAuth: signedInGrokRuntime([codexSession(true)]),
			credentialRefs: new Map([["codex", "CODEX_ACCESS_TOKEN"]]),
			credentialsWritable: true,
			now: () => NOW,
		});
		expect(ProvidersDataSchema.parse(data).schemaVersion).toBe(1);
		const codex = data.providers.find((provider) => provider.id === "codex-oauth");
		expect(codex?.connection).toBe("connected");
		expect(codex?.authSource).toBe("oauth");
		expect(codex?.quotaState).toBe("available");
		expect(codex?.accountProviderId).toBe("codex");
		expect(codex?.credentials).toEqual([
			{
				label: "Codex",
				ref: "CODEX_ACCESS_TOKEN",
				configured: true,
				source: "oauth",
				writable: true,
			},
		]);
		expect(data.providers.filter((provider) => provider.id === "codex")).toHaveLength(0);
	});

	it("keeps signed-out OAuth providers on the oauth auth source so the UI can route to Subscriptions", async () => {
		const data = await collectProvidersData({
			accounts: [codexAccount({ status: "not-configured", configured: false, windows: [] })],
			codingOAuth: signedInGrokRuntime([codexSession(false)]),
			credentialRefs: new Map([["codex", "CODEX_ACCESS_TOKEN"]]),
			now: () => NOW,
		});
		const codex = data.providers.find((provider) => provider.id === "codex-oauth");
		expect(codex?.connection).toBe("unconfigured");
		expect(codex?.authSource).toBe("oauth");
		expect(codex?.tokenLifecycle).toBe("none");
		expect(codex?.capabilities.supportsOAuth).toBe(true);
		expect(codex?.credentials[0]?.configured).toBe(false);
		expect(data.providers.filter((provider) => provider.id === "codex")).toHaveLength(0);
	});

	it("merges the antigravity account into the externally-managed route record", async () => {
		const data = await collectProvidersData({
			accounts: [
				snapshot({
					providerId: "antigravity",
					displayName: "Antigravity",
					adapterId: "antigravity-quota",
					mode: "subscription",
					balance: null,
					windows: [
						{
							id: "antigravity:daily",
							kind: "daily",
							label: "Daily",
							unit: "percent",
							used: 10,
							remaining: 90,
							limit: 100,
							usedRatio: 0.1,
							resetsAt: null,
							rolling: false,
						},
					],
				}),
			],
			codingOAuth: signedInGrokRuntime(),
			credentialRefs: new Map([["antigravity", "ANTIGRAVITY_ACCESS_TOKEN"]]),
			credentialsWritable: true,
			now: () => NOW,
		});
		const agy = data.providers.find((provider) => provider.id === "agy");
		expect(agy?.connection).toBe("connected");
		expect(agy?.displayName).toBe("Google Antigravity");
		expect(agy?.quotaState).toBe("available");
		expect(agy?.accountProviderId).toBe("antigravity");
		expect(agy?.credentials[0]?.ref).toBe("ANTIGRAVITY_ACCESS_TOKEN");
		expect(agy?.warnings).toContain("managed-externally");
		expect(data.providers.filter((provider) => provider.id === "antigravity")).toHaveLength(0);
	});

	it("keeps the antigravity route unsupported when no monitorable account exists", async () => {
		const data = await collectProvidersData({
			accounts: [],
			codingOAuth: signedInGrokRuntime(),
			now: () => NOW,
		});
		const agy = data.providers.find((provider) => provider.id === "agy");
		expect(agy?.connection).toBe("unsupported");
		expect(agy?.quotaState).toBe("not-supported");
		expect(agy?.warnings).toContain("managed-externally");
	});

	it("marks accounts with a credential reference as api-key even before a value is saved", async () => {
		const data = await collectProvidersData({
			accounts: [
				snapshot({
					providerId: "zai",
					displayName: "Z.ai",
					adapterId: "zai-token-plan",
					status: "not-configured",
					configured: false,
					balance: null,
				}),
			],
			credentialRefs: new Map([["zai", "ZAI_API_KEY"]]),
			credentialsWritable: false,
			now: () => NOW,
		});
		const zai = data.providers.find((provider) => provider.id === "zai");
		expect(zai?.authSource).toBe("api-key");
		expect(zai?.connection).toBe("unconfigured");
		expect(zai?.credentials).toEqual([
			{
				label: "Z.ai",
				ref: "ZAI_API_KEY",
				configured: false,
				source: "api-key",
				writable: false,
			},
		]);
	});

	it("exposes only reference names and booleans in credential metadata", async () => {
		const data = await collectProvidersData({
			accounts: [codexAccount(), snapshot()],
			codingOAuth: signedInGrokRuntime([codexSession(true)]),
			credentialRefs: new Map([
				["codex", "CODEX_ACCESS_TOKEN"],
				["deepseek-official", "DEEPSEEK_API_KEY"],
			]),
			credentialsWritable: true,
			now: () => NOW,
		});
		const parsed = ProvidersDataSchema.parse(data);
		let metaCount = 0;
		for (const provider of parsed.providers) {
			for (const meta of provider.credentials) {
				metaCount += 1;
				expect(Object.keys(meta).sort()).toEqual(["configured", "label", "ref", "source", "writable"]);
			}
		}
		expect(metaCount).toBeGreaterThanOrEqual(2);
		// Credential values can never appear: the catalog only ever sees refs.
		expect(JSON.stringify(parsed)).not.toContain('"value"');
	});
});
