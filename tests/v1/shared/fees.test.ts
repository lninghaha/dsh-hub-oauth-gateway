import { describe, expect, it } from "vitest";
import {
	type AccountFeeRecord,
	AccountFeeRecordSchema,
	monthlyEquivalent,
	paybackMultiplier,
} from "../../../src/shared/fees.js";

function fee(overrides: Partial<AccountFeeRecord> = {}): AccountFeeRecord {
	return AccountFeeRecordSchema.parse({
		id: "fee-1",
		providerId: "provider-a",
		accountLabel: null,
		kind: "subscription",
		planName: "Pro",
		amount: 20,
		currency: "USD",
		interval: "month",
		anchorDate: null,
		nextRenewalDate: "2024-04-01",
		topups: [],
		notes: null,
		updatedAt: 1,
		...overrides,
	});
}

describe("fee display helpers", () => {
	it("converts yearly subscriptions to a monthly equivalent", () => {
		expect(monthlyEquivalent(fee({ interval: "year", amount: 120 }))).toBe(10);
		expect(monthlyEquivalent(fee({ interval: "month", amount: 20 }))).toBe(20);
	});

	it("only reports payback when currency matches and monthly cost is covered", () => {
		expect(paybackMultiplier(fee(), 40, "USD")).toBe(2);
		expect(paybackMultiplier(fee({ currency: "CNY" }), 40, "USD")).toBeNull();
		expect(paybackMultiplier(fee(), null, "USD")).toBeNull();
	});
});
