import { describe, expect, it, vi } from "vitest";
import { validateAccountConfig } from "../../../src/server/accounts/config.js";
import { AccountAdapterRegistry } from "../../../src/server/accounts/registry.js";
import { AccountSnapshotRepository } from "../../../src/server/accounts/repository.js";
import { AccountService } from "../../../src/server/accounts/service.js";
import type { AccountAdapter } from "../../../src/server/accounts/types.js";
import { RuntimeConfigSchema } from "../../../src/server/config.js";
import { FeesRepository } from "../../../src/server/fees/repository.js";
import { StatusProbeService } from "../../../src/server/status-probes/service.js";
import { UsageDatabase } from "../../../src/server/storage/database.js";

describe("status probes (#35)", () => {
	it("defaults statusProbes.enabled to false", () => {
		expect(RuntimeConfigSchema.parse({}).statusProbes).toEqual({ enabled: false });
		expect(RuntimeConfigSchema.parse({ statusProbes: {} }).statusProbes.enabled).toBe(false);
	});

	it("returns per-target failures without throwing and never attaches credentials", async () => {
		const fetch = vi.fn(async (url: string, init?: { headers?: Record<string, string> }) => {
			expect(String(url)).toMatch(/^https:\/\/status\.(openai|claude|cursor)\.com\//);
			expect(init?.headers?.authorization).toBeUndefined();
			expect(init?.headers?.Authorization).toBeUndefined();
			expect(init?.headers?.cookie).toBeUndefined();
			expect(init?.headers?.Cookie).toBeUndefined();
			if (String(url).includes("openai")) {
				return {
					ok: true,
					status: 200,
					headers: { get: () => "application/json" },
					json: async () => ({ status: { indicator: "none", description: "All Systems Operational" } }),
				};
			}
			throw new Error("upstream blip");
		});
		const service = new StatusProbeService({
			deps: {
				fetch: fetch as never,
				lookup: vi.fn(async () => [{ address: "8.8.8.8", family: 4 }]) as never,
			},
			now: () => 1_700_000_000_000,
		});
		const snapshot = await service.snapshot();
		expect(snapshot.enabled).toBe(true);
		expect(snapshot.probes).toHaveLength(3);
		expect(snapshot.probes.find((probe) => probe.id === "openai")).toMatchObject({
			ok: true,
			indicator: "none",
			errorCode: null,
		});
		expect(snapshot.probes.filter((probe) => !probe.ok).length).toBeGreaterThanOrEqual(1);
		for (const probe of snapshot.probes) {
			expect(JSON.stringify(probe)).not.toMatch(/authorization|Bearer|cookie|api[_-]?key/i);
		}
	});

	it("keeps Usage/account listing working when status probes fail", async () => {
		const database = await UsageDatabase.open(":memory:");
		try {
			const adapter: AccountAdapter = {
				id: "openrouter-balance",
				mode: "balance",
				async collect() {
					return {
						status: "ok",
						balance: { remaining: 3, currency: "USD", unlimited: false, expiresAt: null },
					};
				},
			};
			const registry = new AccountAdapterRegistry([adapter]);
			const config = validateAccountConfig(
				{ monitors: { openrouter: { adapter: "openrouter-balance", credentialRef: "OPENROUTER_MGMT" } } },
				registry,
			);
			const accounts = new AccountService({
				credentials: { resolve: vi.fn(async () => ({ value: "token" })) },
				getProviders: async () => [{ id: "openrouter", displayName: "OpenRouter" }],
				config,
				repository: new AccountSnapshotRepository(database),
				registry,
				includeCompatibilityProviders: false,
			});
			const probes = new StatusProbeService({
				deps: {
					fetch: vi.fn(async () => {
						throw new Error("status page down");
					}) as never,
					lookup: vi.fn(async () => [{ address: "8.8.8.8", family: 4 }]) as never,
				},
			});
			const [accountList, probeSnapshot] = await Promise.all([accounts.refresh(), probes.snapshot()]);
			expect(accountList).toHaveLength(1);
			expect(accountList[0]?.status).toBe("ok");
			expect(probeSnapshot.probes.every((probe) => probe.ok === false)).toBe(true);
		} finally {
			database.close();
		}
	});
});

describe("multi-profile monitor polish (#33)", () => {
	it("emits actionable validation errors for duplicate and invalid profile ids", () => {
		const registry = new AccountAdapterRegistry([
			{ id: "openrouter-balance", mode: "balance", collect: async () => ({ status: "ok" }) },
		]);
		expect(() =>
			validateAccountConfig(
				{
					monitors: {
						openrouter: {
							adapter: "openrouter-balance",
							profiles: [
								{ id: "work", credentialRef: "OPENROUTER_A" },
								{ id: "work", credentialRef: "OPENROUTER_B" },
							],
						},
					},
				},
				registry,
			),
		).toThrow(/duplicate id "work".*providerId \+ profileId/i);

		expect(() =>
			validateAccountConfig(
				{
					monitors: {
						openrouter: {
							adapter: "openrouter-balance",
							profiles: [{ id: "bad id!", credentialRef: "OPENROUTER_A" }],
						},
					},
				},
				registry,
			),
		).toThrow(/invalid characters/i);

		expect(() =>
			validateAccountConfig(
				{
					monitors: {
						openrouter: {
							adapter: "openrouter-balance",
							profiles: [],
						},
					},
				},
				registry,
			),
		).toThrow(/omit the field for a single-profile monitor/i);
	});

	it("persists snapshot and fee rows under (providerId, profileId)", async () => {
		const database = await UsageDatabase.open(":memory:");
		try {
			const adapter: AccountAdapter = {
				id: "openrouter-balance",
				mode: "balance",
				async collect(ctx) {
					return {
						status: "ok",
						balance: {
							remaining: ctx.spec.profileId === "work" ? 1 : 9,
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
								{ id: "personal", credentialRef: "OPENROUTER_PERSONAL", label: "Personal" },
								{ id: "work", credentialRef: "OPENROUTER_WORK", label: "Work" },
							],
						},
					},
				},
				registry,
			);
			const repository = new AccountSnapshotRepository(database);
			const service = new AccountService({
				credentials: { resolve: vi.fn(async (ref: string) => ({ value: ref })) },
				getProviders: async () => [{ id: "openrouter", displayName: "OpenRouter" }],
				config,
				repository,
				registry,
				includeCompatibilityProviders: false,
			});
			await service.refresh();
			expect(repository.latest("openrouter", "personal")?.balance?.remaining).toBe(9);
			expect(repository.latest("openrouter", "work")?.balance?.remaining).toBe(1);
			expect(repository.latest("openrouter", "")).toBeNull();

			const fees = new FeesRepository(database);
			fees.replaceAll(
				[
					{
						id: "fee-personal",
						providerId: "openrouter",
						profileId: "personal",
						accountLabel: "Personal",
						kind: "subscription",
						planName: "Pro",
						amount: 20,
						currency: "USD",
						interval: "month",
						anchorDate: "2026-01-01",
						nextRenewalDate: null,
						topups: [],
						notes: null,
						updatedAt: 1,
					},
					{
						id: "fee-work",
						providerId: "openrouter",
						profileId: "work",
						accountLabel: "Work",
						kind: "subscription",
						planName: "Team",
						amount: 40,
						currency: "USD",
						interval: "month",
						anchorDate: "2026-01-01",
						nextRenewalDate: null,
						topups: [],
						notes: null,
						updatedAt: 1,
					},
				],
				2,
			);
			const listed = fees.list();
			expect(listed.map((fee) => [fee.providerId, fee.profileId, fee.amount])).toEqual([
				["openrouter", "personal", 20],
				["openrouter", "work", 40],
			]);
		} finally {
			database.close();
		}
	});
});
