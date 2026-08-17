import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { estimateUsageCost, selectPriceRule } from "../../../src/server/pricing/engine.js";
import { PricingRepository } from "../../../src/server/pricing/repository.js";
import { PreferencesRepository } from "../../../src/server/settings/repository.js";
import { UsageDatabase } from "../../../src/server/storage/database.js";
import { defaultUserPreferences } from "../../../src/shared/preferences.js";

const now = 1_700_000_000_000;

const builtin = {
	id: "builtin",
	providerPattern: "*",
	modelPattern: "model-*",
	effectiveFrom: 0,
	currency: "USD",
	inputPerMillion: 1,
	outputPerMillion: 2,
	cacheReadPerMillion: 0.1,
	cacheWritePerMillion: null,
	source: "builtin" as const,
	updatedAt: now,
};

const user = {
	...builtin,
	id: "user",
	providerPattern: "provider-a",
	modelPattern: "model-exact",
	inputPerMillion: 3,
	outputPerMillion: 4,
	cacheReadPerMillion: 0.2,
	cacheWritePerMillion: 5,
	source: "user" as const,
	updatedAt: now + 1,
};

describe("pricing and preferences repositories", () => {
	let database: UsageDatabase;

	beforeEach(async () => {
		database = await UsageDatabase.open(":memory:");
	});

	afterEach(() => database.close());

	it("selects the most specific user price rule and reports token-weighted coverage", () => {
		const fact = {
			providerId: "provider-a",
			modelId: "model-exact",
			occurredAt: now,
			inputTokens: 1_000_000,
			outputTokens: 500_000,
			cacheReadTokens: 100_000,
			cacheWriteTokens: 10_000,
		};
		expect(selectPriceRule(fact, [builtin, user], "USD")?.id).toBe("user");
		expect(estimateUsageCost([fact], [builtin, user], "USD")).toEqual({
			amount: 5.07,
			currency: "USD",
			coverageRatio: 1,
			estimated: true,
		});

		const partial = estimateUsageCost([{ ...fact, modelId: "model-generic" }], [builtin], "USD");
		expect(partial.amount).toBeCloseTo(2.01);
		expect(partial.coverageRatio).toBeCloseTo(1_600_000 / 1_610_000);
	});

	it("persists validated user rules and prevents builtin deletion", () => {
		const repository = new PricingRepository(database);
		repository.upsert(builtin);
		repository.upsert(user);
		expect(repository.list().map(({ id }) => id)).toEqual(expect.arrayContaining(["builtin", "user"]));
		expect(repository.delete("builtin")).toBe(false);
		expect(repository.delete("user")).toBe(true);
	});

	it("round-trips versioned preferences", () => {
		const repository = new PreferencesRepository(database);
		const defaults = repository.load("Asia/Shanghai");
		expect(defaults.display.timeZone).toBe("Asia/Shanghai");
		const changed = {
			...defaultUserPreferences("UTC"),
			display: { ...defaultUserPreferences("UTC").display, preset: "cost" as const },
		};
		repository.save(changed, now);
		expect(repository.load().display.preset).toBe("cost");
	});
});
