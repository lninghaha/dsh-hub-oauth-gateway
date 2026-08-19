import { describe, expect, it } from "vitest";
import { pickTightestQuotaAccounts } from "../../../src/client/components/PeekQuotaSummary.js";
import { materializePresetRules, PRICING_PRESETS } from "../../../src/client/pricing-presets.js";
import type { AccountSnapshot } from "../../../src/shared/domain.js";

const baseAccount: AccountSnapshot = {
	providerId: "provider-a",
	profileId: "",
	displayName: "Provider A",
	adapterId: "fixture",
	mode: "subscription",
	status: "ok",
	configured: true,
	fetchedAt: 1_000,
	stale: false,
	plan: "Pro",
	balance: null,
	windows: [
		{
			id: "rolling-five",
			kind: "rolling",
			label: "Five hour",
			unit: "percent",
			used: null,
			remaining: null,
			limit: null,
			usedRatio: 0.8,
			resetsAt: 2_000,
			rolling: true,
		},
	],
	missingCredentials: [],
	warningCode: null,
};

const quotaWindow = baseAccount.windows[0] as (typeof baseAccount.windows)[number];

describe("UI enhancement helpers", () => {
	it("ranks the tightest quota accounts first", () => {
		const loose: AccountSnapshot = {
			...baseAccount,
			providerId: "loose",
			displayName: "Loose",
			windows: [{ ...quotaWindow, usedRatio: 0.2 }],
		};
		const tight: AccountSnapshot = {
			...baseAccount,
			providerId: "tight",
			displayName: "Tight",
			windows: [{ ...quotaWindow, usedRatio: 0.92 }],
		};
		const picked = pickTightestQuotaAccounts([loose, tight], 1);
		expect(picked).toHaveLength(1);
		expect(picked[0]?.providerId).toBe("tight");
	});

	it("materializes pricing presets with stable user source", () => {
		const preset = PRICING_PRESETS.find((entry) => entry.id === "openai");
		if (preset === undefined) throw new Error("missing openai preset");
		const rules = materializePresetRules(preset, "USD", 1_700_000_000_000);
		expect(rules.length).toBeGreaterThan(0);
		expect(rules.every((rule) => rule.source === "user" && rule.currency === "USD")).toBe(true);
	});
});
