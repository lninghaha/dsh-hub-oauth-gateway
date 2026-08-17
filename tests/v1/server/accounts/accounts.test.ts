import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { validateAccountConfig } from "../../../../src/server/accounts/config.js";
import { ProviderError } from "../../../../src/server/accounts/errors.js";
import {
	AccountAdapterRegistry,
	BUILTIN_ACCOUNT_ADAPTERS,
	defaultAdapterId,
} from "../../../../src/server/accounts/registry.js";
import { AccountSnapshotRepository } from "../../../../src/server/accounts/repository.js";
import { assertTargetPolicy, isPrivateAddress } from "../../../../src/server/accounts/security.js";
import { AccountService } from "../../../../src/server/accounts/service.js";
import { parseJsonResponse, requestJson } from "../../../../src/server/accounts/transport.js";
import type { AccountAdapter } from "../../../../src/server/accounts/types.js";
import { RuntimeConfigSchema } from "../../../../src/server/config.js";
import { UsageDatabase } from "../../../../src/server/storage/database.js";

describe("account adapters, policy, and service", () => {
	let database: UsageDatabase;

	beforeEach(async () => {
		database = await UsageDatabase.open(":memory:");
	});

	afterEach(() => database.close());

	it("registers all compatibility adapters and maps common providers", () => {
		const registry = new AccountAdapterRegistry();
		expect(BUILTIN_ACCOUNT_ADAPTERS.length).toBeGreaterThanOrEqual(21);
		expect(registry.get("claude-oauth")?.mode).toBe("subscription");
		expect(defaultAdapterId({ id: "deepseek-official" })).toBe("deepseek-balance");
		expect(defaultAdapterId({ id: "passion-clone", baseURL: "https://edge.passionapi.com/v1" })).toBe("sub2api");
	});

	it("keeps v0.3 root monitor configuration compatible with the v1 account namespace", () => {
		const config = RuntimeConfigSchema.parse({
			monitors: { relay: { adapter: "general", credentialRef: "RELAY_TOKEN" } },
		});
		expect(config.accounts).toEqual({
			monitors: { relay: { adapter: "general", credentialRef: "RELAY_TOKEN" } },
		});
	});

	it("validates declarative monitor boundaries and private-address classification", () => {
		const registry = new AccountAdapterRegistry();
		expect(() =>
			validateAccountConfig(
				{
					monitors: {
						custom: {
							adapter: "declarative",
							mode: "balance",
							usageBaseURL: "https://api.example.com",
							request: { path: "/usage", headers: { Authorization: "secret" } },
							extract: { remaining: "/balance" },
						},
					},
				},
				registry,
			),
		).toThrow(/cannot override/i);
		expect(isPrivateAddress("127.0.0.1")).toBe(true);
		expect(isPrivateAddress("::ffff:192.168.1.1")).toBe(true);
		expect(isPrivateAddress("8.8.8.8")).toBe(false);
	});

	it("rejects public hostnames that resolve to private targets before transport", async () => {
		await expect(
			assertTargetPolicy(
				"https://api.example.com/usage",
				{ enforceSameOrigin: false },
				{ lookup: vi.fn(async () => [{ address: "127.0.0.1", family: 4 }]) },
			),
		).rejects.toThrow(/private (?:or reserved|network)/i);
	});

	it("does not send provider credentials to a cross-origin monitor override by default", async () => {
		const fetch = vi.fn(async () => ({
			ok: true,
			status: 200,
			headers: { get: () => "application/json" },
			json: async () => ({}),
		}));
		const adapter: AccountAdapter = {
			id: "fixture-policy",
			mode: "balance",
			async collect(ctx) {
				await requestJson(
					`${ctx.spec.baseURL}/usage`,
					{ headers: { authorization: "Bearer should-not-leave-provider-origin" } },
					ctx.deps,
				);
				return { status: "ok" };
			},
		};
		const registry = new AccountAdapterRegistry([adapter]);
		const service = new AccountService({
			credentials: { resolve: vi.fn(async () => ({ value: "credential" })) },
			getProviders: async () => [
				{
					id: "fixture-policy",
					displayName: "Fixture policy",
					apiKeyEnv: "FIXTURE_POLICY_TOKEN",
					baseURL: "https://provider.example",
				},
			],
			config: validateAccountConfig(
				{
					monitors: {
						"fixture-policy": {
							adapter: "fixture-policy",
							usageBaseURL: "https://collector.example",
						},
					},
				},
				registry,
			),
			repository: new AccountSnapshotRepository(database),
			registry,
			includeCompatibilityProviders: false,
			deps: {
				fetch,
				lookup: vi.fn(async () => [{ address: "8.8.8.8", family: 4 }]),
			},
		});
		const snapshot = await service.get("fixture-policy", true);
		expect(snapshot?.status).toBe("unsupported");
		expect(fetch).not.toHaveBeenCalled();
	});

	it("enforces response media and size limits without exposing bodies", async () => {
		await expect(
			parseJsonResponse(
				{
					ok: true,
					status: 200,
					headers: { get: (name) => (name === "content-type" ? "text/html" : null) },
					json: async () => ({ secret: "not-returned" }),
				},
				100,
			),
		).rejects.toThrow(/did not return JSON/);
		await expect(
			parseJsonResponse(
				{
					ok: true,
					status: 200,
					headers: { get: (name) => (name === "content-length" ? "101" : "application/json") },
					json: async () => ({}),
				},
				100,
			),
		).rejects.toThrow(/size limit/);
	});

	it("accepts standard New API success envelopes on the token usage endpoint", async () => {
		const fetch = vi.fn(async (url: string | URL) => ({
			ok: true,
			status: 200,
			headers: { get: (name: string) => (name === "content-type" ? "application/json" : null) },
			json: async () =>
				String(url).endsWith("/api/status")
					? { data: { quota_per_unit: 1 } }
					: { code: 200, data: { total_granted: 100, total_used: 25, total_available: 75 } },
		}));
		const registry = new AccountAdapterRegistry();
		const service = new AccountService({
			credentials: { resolve: vi.fn(async () => ({ value: "relay-token" })) },
			getProviders: async () => [
				{ id: "relay", displayName: "Relay", apiKeyEnv: "RELAY_TOKEN", baseURL: "https://relay.example" },
			],
			config: validateAccountConfig({ monitors: { relay: { adapter: "new-api" } } }, registry),
			repository: new AccountSnapshotRepository(database),
			registry,
			includeCompatibilityProviders: false,
			deps: { fetch, lookup: vi.fn(async () => [{ address: "8.8.8.8", family: 4 }]) },
		});
		const snapshot = await service.get("relay", true);
		expect(snapshot).toMatchObject({ status: "ok", balance: { remaining: 75, used: 25, limit: 100 } });
	});

	it("permits the first-party Z.ai CN quota origin without opening arbitrary cross-origin access", async () => {
		const fetch = vi.fn(async (url: string | URL) => ({
			ok: true,
			status: 200,
			headers: { get: (name: string) => (name === "content-type" ? "application/json" : null) },
			json: async () =>
				String(url).endsWith("/api/biz/subscription/list")
					? { data: [] }
					: {
							data: {
								limits: [{ type: "TOKENS_LIMIT", usage: 100, remaining: 80, unit: 5, number: 5 }],
							},
						},
		}));
		const registry = new AccountAdapterRegistry();
		const service = new AccountService({
			credentials: {
				resolve: vi.fn(async (ref: string) => (ref === "ZAI_API_KEY" ? { value: "zai-token" } : undefined)),
			},
			getProviders: async () => [
				{ id: "zai", displayName: "Z.ai", apiKeyEnv: "ZAI_API_KEY", baseURL: "https://api.z.ai" },
			],
			config: validateAccountConfig(
				{ monitors: { zai: { adapter: "zai-token-plan", region: "bigmodel-cn" } } },
				registry,
			),
			repository: new AccountSnapshotRepository(database),
			registry,
			includeCompatibilityProviders: false,
			deps: { fetch, lookup: vi.fn(async () => [{ address: "8.8.8.8", family: 4 }]) },
		});
		const snapshot = await service.get("zai", true);
		expect(snapshot).toMatchObject({ status: "ok" });
		expect(fetch).toHaveBeenCalledTimes(2);
		expect(fetch.mock.calls.every(([url]) => String(url).startsWith("https://open.bigmodel.cn/"))).toBe(true);
	});

	it("falls back to the legacy MiniMax quota path when the token-plan response has no usable windows", async () => {
		const fetch = vi.fn(async (url: string | URL) => ({
			ok: true,
			status: 200,
			headers: { get: (name: string) => (name === "content-type" ? "application/json" : null) },
			json: async () =>
				String(url).endsWith("/v1/token_plan/remains")
					? { base_resp: { status_code: 0, status_msg: "success" }, model_remains: [] }
					: {
							base_resp: { status_code: 0, status_msg: "success" },
							model_remains: [
								{
									model_name: "MiniMax-M",
									current_interval_remaining_percent: 75,
									current_weekly_status: 1,
									current_weekly_remaining_percent: 50,
									remains_time: 60_000,
									weekly_remains_time: 120_000,
								},
							],
						},
		}));
		const registry = new AccountAdapterRegistry();
		const service = new AccountService({
			credentials: {
				resolve: vi.fn(async (ref: string) => (ref === "MINIMAX_API_KEY" ? { value: "minimax-token" } : undefined)),
			},
			getProviders: async () => [
				{
					id: "minimax-cn",
					displayName: "MiniMax",
					apiKeyEnv: "MINIMAX_API_KEY",
					baseURL: "https://api.minimaxi.com/v1",
				},
			],
			config: validateAccountConfig({}, registry),
			repository: new AccountSnapshotRepository(database),
			registry,
			includeCompatibilityProviders: false,
			deps: {
				fetch,
				lookup: vi.fn(async () => [{ address: "8.8.8.8", family: 4 }]),
				now: () => 1_000,
			},
		});
		const snapshot = await service.get("minimax-cn", true);
		expect(snapshot).toMatchObject({ status: "ok", configured: true });
		expect(snapshot?.windows).toHaveLength(2);
		expect(snapshot?.windows.map(({ usedRatio }) => usedRatio)).toEqual([0.25, 0.5]);
		expect(fetch.mock.calls.map(([url]) => String(url))).toEqual([
			"https://api.minimaxi.com/v1/token_plan/remains",
			"https://api.minimaxi.com/v1/api/openplatform/coding_plan/remains",
		]);
	});

	it.each([
		["an HTTP 404 response", false, 404, { error: "not found" }, "unsupported"],
		["a provider business-level failure", true, 200, { base_resp: { status_code: 1008 } }, "error"],
		["a malformed response without an explicit success envelope", true, 200, {}, "error"],
	])("does not retry MiniMax credentials after %s", async (_case, ok, status, body, expectedStatus) => {
		const fetch = vi.fn(async () => ({
			ok,
			status,
			headers: { get: (name: string) => (name === "content-type" ? "application/json" : null) },
			json: async () => body,
		}));
		const registry = new AccountAdapterRegistry();
		const service = new AccountService({
			credentials: {
				resolve: vi.fn(async (ref: string) => (ref === "MINIMAX_API_KEY" ? { value: "minimax-token" } : undefined)),
			},
			getProviders: async () => [
				{
					id: "minimax-cn",
					displayName: "MiniMax",
					apiKeyEnv: "MINIMAX_API_KEY",
					baseURL: "https://api.minimaxi.com/v1",
				},
			],
			config: validateAccountConfig({}, registry),
			repository: new AccountSnapshotRepository(database),
			registry,
			includeCompatibilityProviders: false,
			deps: { fetch, lookup: vi.fn(async () => [{ address: "8.8.8.8", family: 4 }]) },
		});
		const snapshot = await service.get("minimax-cn", true);
		expect(snapshot).toMatchObject({ status: expectedStatus, configured: true });
		expect(fetch).toHaveBeenCalledTimes(1);
	});

	it("refreshes the compatibility catalog without network calls when credentials are absent", async () => {
		const fetch = vi.fn(async () => {
			throw new Error("network must not be used without credentials");
		});
		const registry = new AccountAdapterRegistry();
		const service = new AccountService({
			credentials: { resolve: vi.fn(async () => undefined) },
			getProviders: async () => [],
			config: validateAccountConfig({}, registry),
			repository: new AccountSnapshotRepository(database),
			registry,
			includeCompatibilityProviders: true,
			deps: {
				fetch,
				homedir: () => "/nonexistent-home",
				readFile: async () => {
					throw Object.assign(new Error("not found"), { code: "ENOENT" });
				},
			},
		});
		const snapshots = await service.refresh();
		expect(snapshots.length).toBeGreaterThanOrEqual(11);
		expect(snapshots.every(({ status }) => status === "not-configured" || status === "unsupported")).toBe(true);
		expect(fetch).not.toHaveBeenCalled();
	});

	it("single-flights refreshes, persists snapshots, and carries stale data on transient failures", async () => {
		let calls = 0;
		let fail = false;
		const adapter: AccountAdapter = {
			id: "fixture",
			mode: "balance",
			async collect() {
				calls += 1;
				await Promise.resolve();
				if (fail) throw new ProviderError("unavailable", "fixture outage");
				return {
					status: "ok",
					plan: "Fixture Pro",
					balance: { remaining: 42, currency: "USD", unlimited: false, expiresAt: null },
				};
			},
		};
		const registry = new AccountAdapterRegistry([adapter]);
		const config = validateAccountConfig(
			{ monitors: { fixture: { adapter: "fixture", credentialRef: "FIXTURE_TOKEN" } } },
			registry,
		);
		let now = 1_000;
		const repository = new AccountSnapshotRepository(database);
		const service = new AccountService({
			credentials: { resolve: vi.fn(async () => ({ value: "token" })) },
			getProviders: async () => [{ id: "fixture", displayName: "Fixture" }],
			config,
			repository,
			registry,
			includeCompatibilityProviders: false,
			refreshMs: 100,
			deps: { now: () => now },
		});

		const first = service.get("fixture", true);
		const second = service.get("fixture", true);
		expect(second).not.toBe(first);
		const [left, right] = await Promise.all([first, second]);
		expect(left).toEqual(right);
		expect(calls).toBe(1);
		expect(repository.latest("fixture")?.balance?.remaining).toBe(42);

		fail = true;
		now = 2_000;
		const stale = await service.get("fixture", true);
		expect(stale).toMatchObject({ status: "unavailable", stale: true, balance: { remaining: 42 } });
		expect(repository.latestAll()).toHaveLength(1);
	});
});
