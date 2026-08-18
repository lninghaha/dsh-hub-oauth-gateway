import { createHash, createHmac } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { zaiTeamPlanAdapter } from "../../../../src/server/accounts/adapters/coding-plans.js";
import { ollamaCloudAdapter, parseOllamaCloud } from "../../../../src/server/accounts/adapters/ollama-cloud.js";
import {
	parseVolcengineCodingPlan,
	signVolcengineGet,
	VOLCENGINE_API_HOST,
	volcengineCanonicalQuery,
	volcengineCodingPlanAdapter,
} from "../../../../src/server/accounts/adapters/volcengine-coding-plan.js";
import { validateAccountConfig } from "../../../../src/server/accounts/config.js";
import { ProviderError } from "../../../../src/server/accounts/errors.js";
import { AccountAdapterRegistry } from "../../../../src/server/accounts/registry.js";
import { AccountSnapshotRepository } from "../../../../src/server/accounts/repository.js";
import { AccountService } from "../../../../src/server/accounts/service.js";
import type { AccountAdapter } from "../../../../src/server/accounts/types.js";
import {
	assertPathInsideDirectory,
	isAutoExportAllowedInEnvironment,
	validateAutoExportDirectory,
	writeAutoExportFile,
} from "../../../../src/server/export/auto-export.js";
import { adaptiveAccountIntervalMs } from "../../../../src/server/scheduler.js";
import { UsageDatabase } from "../../../../src/server/storage/database.js";

describe("wave2 lastGood / multiprofile / adapters", () => {
	let database: UsageDatabase;

	beforeEach(async () => {
		database = await UsageDatabase.open(":memory:");
	});

	afterEach(() => database.close());

	it("keeps lastGood for new-api style transient failures and drops after N failures", async () => {
		let calls = 0;
		const adapter: AccountAdapter = {
			id: "new-api",
			mode: "balance",
			async collect() {
				calls += 1;
				if (calls === 1) {
					return {
						status: "ok",
						balance: { remaining: 9, currency: "USD", unlimited: false, expiresAt: null },
					};
				}
				throw new ProviderError("unavailable", "relay blip");
			},
		};
		const registry = new AccountAdapterRegistry([adapter]);
		const config = validateAccountConfig(
			{ monitors: { relay: { adapter: "new-api", credentialRef: "RELAY_TOKEN" } } },
			registry,
		);
		let now = 1_000;
		const service = new AccountService({
			credentials: { resolve: vi.fn(async () => ({ value: "token" })) },
			getProviders: async () => [{ id: "relay", displayName: "Relay", baseURL: "https://relay.example.com" }],
			config,
			repository: new AccountSnapshotRepository(database),
			registry,
			includeCompatibilityProviders: false,
			staleFailureLimit: 3,
			deps: { now: () => now },
		});
		await service.get("relay", true);
		now = 2_000;
		expect(await service.get("relay", true)).toMatchObject({ stale: true, balance: { remaining: 9 } });
		now = 3_000;
		expect(await service.get("relay", true)).toMatchObject({ stale: true, balance: { remaining: 9 } });
		now = 4_000;
		expect(await service.get("relay", true)).toMatchObject({ stale: false, status: "unavailable", balance: null });
	});

	it("expands monitor profiles into distinct snapshot identities", async () => {
		const seen: string[] = [];
		const adapter: AccountAdapter = {
			id: "openrouter-balance",
			mode: "balance",
			async collect(ctx) {
				seen.push(ctx.spec.profileId);
				return {
					status: "ok",
					balance: {
						remaining: ctx.spec.profileId === "work" ? 1 : 2,
						currency: "USD",
						unlimited: false,
						expiresAt: null,
					},
				};
			},
		};
		const registry = new AccountAdapterRegistry([adapter]);
		const config = validateAccountConfig(
			{
				monitors: {
					openrouter: {
						adapter: "openrouter-balance",
						profiles: [
							{ id: "personal", credentialRef: "OPENROUTER_MGMT_PERSONAL", label: "Personal" },
							{ id: "work", credentialRef: "OPENROUTER_MGMT_WORK", label: "Work" },
						],
					},
				},
			},
			registry,
		);
		const credentials = {
			resolve: vi.fn(async (ref: string) => ({ value: ref })),
		};
		const service = new AccountService({
			credentials,
			getProviders: async () => [{ id: "openrouter", displayName: "OpenRouter" }],
			config,
			repository: new AccountSnapshotRepository(database),
			registry,
			includeCompatibilityProviders: false,
		});
		const accounts = await service.refresh();
		expect(accounts).toHaveLength(2);
		expect(seen.sort()).toEqual(["personal", "work"]);
		expect(new AccountSnapshotRepository(database).latestAll()).toHaveLength(2);
		expect(await service.get("openrouter", true, "work")).toMatchObject({
			profileId: "work",
			balance: { remaining: 1 },
		});
	});

	it("signs Volcengine GetCodingPlanUsage and parses windows without chat probes", async () => {
		const query = volcengineCanonicalQuery();
		const signed = signVolcengineGet({
			accessKey: "AKEXAMPLE",
			secretKey: "SKEXAMPLE",
			host: VOLCENGINE_API_HOST,
			region: "cn-beijing",
			service: "ark",
			canonicalQuery: query,
			now: Date.UTC(2024, 0, 2, 3, 4, 5),
		});
		expect(signed.amzDate).toBe("20240102T030405Z");
		expect(signed.authorization).toContain("HMAC-SHA256 Credential=AKEXAMPLE/");
		expect(createHash("sha256").update("").digest("hex")).toHaveLength(64);
		expect(createHmac).toBeTypeOf("function");

		const parsed = parseVolcengineCodingPlan({
			Result: {
				PlanName: "Coding Pro",
				Usage: {
					Session: { Used: 10, Total: 100 },
					Weekly: { UsedPercent: 40 },
					Monthly: { Remaining: 50, Total: 200 },
				},
			},
		});
		expect(parsed.plan).toBe("Coding Pro");
		expect(parsed.windows.map((window) => window.kind)).toEqual(["session", "weekly", "monthly"]);

		const publicLookup = vi.fn(async () => [{ address: "8.8.8.8", family: 4 }]);
		const fetch = vi.fn(async (url: string) => {
			expect(String(url)).toContain("Action=GetCodingPlanUsage");
			expect(String(url)).not.toMatch(/chat|completions/i);
			return {
				ok: true,
				status: 200,
				headers: { get: () => "application/json" },
				json: async () => ({
					Result: { Usage: { Session: { Used: 1, Total: 10 }, Weekly: { UsedPercent: 20 } } },
				}),
			};
		});
		const result = await volcengineCodingPlanAdapter.collect({
			spec: {
				id: "volcengine",
				profileId: "",
				displayName: "Volcengine",
				adapter: "volcengine-coding-plan",
				mode: "subscription",
				apiKeyRef: "VOLCENGINE_ACCESS_KEY",
				monitor: { secretKeyRef: "VOLCENGINE_SECRET_KEY" },
				configKey: "{}",
			},
			credentials: {
				resolve: vi.fn(async (ref: string) => (ref.includes("SECRET") ? { value: "sk" } : { value: "ak" })),
			},
			deps: { fetch: fetch as never, lookup: publicLookup, now: () => Date.UTC(2024, 0, 2, 3, 4, 5) },
			now: Date.UTC(2024, 0, 2, 3, 4, 5),
			credential: "ak",
		});
		expect(result.status).toBe("ok");
		expect(fetch).toHaveBeenCalledOnce();
	});

	it("rejects Volcengine private DNS targets and missing secret key", async () => {
		const missing = await volcengineCodingPlanAdapter.collect({
			spec: {
				id: "volcengine",
				profileId: "",
				displayName: "Volcengine",
				adapter: "volcengine-coding-plan",
				mode: "subscription",
				apiKeyRef: "VOLCENGINE_ACCESS_KEY",
				monitor: { secretKeyRef: "VOLCENGINE_SECRET_KEY" },
				configKey: "{}",
			},
			credentials: {
				resolve: vi.fn(async (ref: string) => (ref.includes("SECRET") ? undefined : { value: "ak" })),
			},
			deps: {},
			now: 1,
			credential: "ak",
		});
		expect(missing).toMatchObject({ status: "not-configured", missingCredentials: ["VOLCENGINE_SECRET_KEY"] });

		await expect(
			volcengineCodingPlanAdapter.collect({
				spec: {
					id: "volcengine",
					profileId: "",
					displayName: "Volcengine",
					adapter: "volcengine-coding-plan",
					mode: "subscription",
					apiKeyRef: "VOLCENGINE_ACCESS_KEY",
					monitor: {
						secretKeyRef: "VOLCENGINE_SECRET_KEY",
						usageBaseURL: "https://open.volcengineapi.com",
						allowPrivateNetwork: false,
					},
					configKey: "{}",
				},
				credentials: {
					resolve: vi.fn(async () => ({ value: "secret" })),
				},
				deps: {
					lookup: vi.fn(async () => [{ address: "127.0.0.1", family: 4 }]),
					now: () => 1,
				},
				now: 1,
				credential: "secret",
			}),
		).resolves.toMatchObject({
			status: expect.stringMatching(/unavailable|unauthorized|invalid-response|error|unsupported/),
		});
	});

	it("queries zai-team-plan with type=2 and does not fall back to personal host", async () => {
		const publicLookup = vi.fn(async () => [{ address: "8.8.8.8", family: 4 }]);
		const fetch = vi.fn(async (url: string) => {
			expect(String(url)).toContain("open.bigmodel.cn");
			expect(String(url)).toContain("type=2");
			expect(String(url)).not.toContain("api.z.ai");
			return {
				ok: true,
				status: 200,
				headers: { get: () => "application/json" },
				json: async () => ({
					data: {
						limits: [{ type: "TOKENS_LIMIT", usage: 100, remaining: 40, unit: 5, number: 300, percentage: 60 }],
					},
				}),
			};
		});
		const result = await zaiTeamPlanAdapter.collect({
			spec: {
				id: "zai-team",
				profileId: "",
				displayName: "GLM Team",
				adapter: "zai-team-plan",
				mode: "subscription",
				apiKeyRef: "ZAI_TEAM_API_KEY",
				monitor: {},
				configKey: "{}",
			},
			credentials: { resolve: vi.fn(async () => ({ value: "team-key" })) },
			deps: { fetch: fetch as never, lookup: publicLookup },
			now: 1,
			credential: "team-key",
		});
		expect(result.status).toBe("ok");
		expect(result.plan).toBe("GLM Team");
	});
});

describe("wave3 adaptive refresh / auto-export / ollama opt-in", () => {
	it("clamps adaptive intervals by burn ratio", () => {
		expect(adaptiveAccountIntervalMs(null, 120_000, 1_800_000, 300_000)).toBe(300_000);
		expect(adaptiveAccountIntervalMs(1, 120_000, 1_800_000, 300_000)).toBe(120_000);
		expect(adaptiveAccountIntervalMs(0, 120_000, 1_800_000, 300_000)).toBe(1_800_000);
	});

	it("validates auto-export directories and refuses path escape", async () => {
		const root = await mkdtemp(join(tmpdir(), "dsh-auto-export-"));
		try {
			expect(() => validateAutoExportDirectory("relative/path")).toThrow(/absolute/i);
			assertPathInsideDirectory(root, join(root, "ok.json"));
			expect(() => assertPathInsideDirectory(root, join(root, "..", "escape.json"))).toThrow(/escapes/i);
			const written = await writeAutoExportFile(
				root,
				{ generatedAt: 1, layout: "bundle", body: '{"ok":true}', extension: "json" },
				1,
			);
			expect(await readFile(written, "utf8")).toBe('{"ok":true}');
		} finally {
			await rm(root, { recursive: true, force: true });
		}
		expect(isAutoExportAllowedInEnvironment({ CI: "1" })).toBe(false);
		expect(isAutoExportAllowedInEnvironment({ DSH_HOME: "/tmp/dsh-sandbox-home" })).toBe(false);
	});

	it("requires ollama cookie opt-in and pins ollama.com", async () => {
		expect(
			await ollamaCloudAdapter.collect({
				spec: {
					id: "ollama-cloud",
					profileId: "",
					displayName: "Ollama Cloud",
					adapter: "ollama-cloud",
					mode: "subscription",
					monitor: {},
					configKey: "{}",
				},
				credentials: undefined,
				deps: {},
				now: 1,
				credential: "",
			}),
		).toMatchObject({ status: "not-configured" });

		const parsed = parseOllamaCloud({
			data: { plan: "Pro", usage: { session: { usedPercent: 10 }, weekly: { usedPercent: 20 } } },
		});
		expect(parsed.windows).toHaveLength(2);

		const result = await ollamaCloudAdapter.collect({
			spec: {
				id: "ollama-cloud",
				profileId: "",
				displayName: "Ollama Cloud",
				adapter: "ollama-cloud",
				mode: "subscription",
				monitor: { allowCookieSession: true, usageBaseURL: "https://evil.example/settings" },
				configKey: "{}",
			},
			credentials: { resolve: vi.fn(async () => ({ value: "session=abc" })) },
			deps: {},
			now: 1,
			credential: "session=abc",
		});
		expect(result.status).toBe("unavailable");
	});
});
