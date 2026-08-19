import { describe, expect, it } from "vitest";
import { evaluateUsageAlerts } from "../../../src/server/alerts/service.js";
import { defaultUserPreferences } from "../../../src/shared/preferences.js";

const account = {
	providerId: "provider-a",
	profileId: "",
	displayName: "Provider A",
	adapterId: "test",
	mode: "subscription" as const,
	status: "ok" as const,
	configured: true,
	fetchedAt: 1_000,
	stale: false,
	plan: "Pro",
	balance: null,
	windows: [
		{
			id: "five-hour",
			kind: "rolling" as const,
			label: "5-hour",
			used: null,
			remaining: null,
			limit: null,
			unit: "percent" as const,
			usedRatio: 0.9,
			resetsAt: 2_000,
			rolling: true,
		},
	],
	missingCredentials: [],
	warningCode: null,
};

describe("soft usage alerts", () => {
	it("evaluates quota and daily cost thresholds without exposing account payloads", () => {
		const preferences = defaultUserPreferences("UTC");
		preferences.alerts.dailyCostThreshold = 2;
		const alerts = evaluateUsageAlerts(
			[account],
			{ amount: 3.2, currency: "USD", coverageRatio: 1, estimated: true },
			preferences,
			5_000,
		);
		expect(alerts.map(({ kind }) => kind).sort()).toEqual(["cost", "quota"]);
		expect(alerts.every(({ createdAt }) => createdAt === 5_000)).toBe(true);
		expect(alerts.find(({ kind }) => kind === "cost")?.title).toBe("USD");
	});

	it("can be disabled globally", () => {
		const preferences = defaultUserPreferences("UTC");
		preferences.alerts.enabled = false;
		expect(
			evaluateUsageAlerts([account], { amount: 100, currency: "USD", coverageRatio: 1, estimated: true }, preferences),
		).toEqual([]);
	});
});
