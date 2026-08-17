import { describe, expect, it } from "vitest";
import { formatDurationUntil } from "../../../src/client/format.js";
import { filtersFromPreferences, queryString, resolveUsageQuery } from "../../../src/client/range.js";
import { defaultUserPreferences } from "../../../src/shared/preferences.js";

describe("dashboard query controls", () => {
	it("resolves stable range and filter parameters", () => {
		const preferences = defaultUserPreferences("UTC");
		const filters = {
			...filtersFromPreferences(preferences),
			range: "7d" as const,
			providerIds: ["provider-a"],
			modelIds: ["model-a"],
		};
		const now = Date.parse("2025-04-08T12:00:00Z");
		const query = resolveUsageQuery(filters, "UTC", now);
		expect(query.from).toBe(now - 7 * 86_400_000);
		expect(query.granularity).toBe("day");
		expect(queryString(query)).toContain("providers=provider-a");
		expect(queryString(query)).toContain("models=model-a");
	});

	it("formats future quota resets instead of treating them as stale updates", () => {
		expect(formatDurationUntil(3_700_000, 100_000)).toBe("1h");
	});

	it("uses the configured timezone for calendar-day boundaries", () => {
		const preferences = defaultUserPreferences("America/Los_Angeles");
		const now = Date.parse("2025-04-08T01:00:00Z");
		const query = resolveUsageQuery(
			{ ...filtersFromPreferences(preferences), range: "today" },
			"America/Los_Angeles",
			now,
		);
		expect(query.from).toBe(Date.parse("2025-04-07T07:00:00Z"));
	});

	it("uses hourly buckets for the current day", () => {
		const preferences = defaultUserPreferences("UTC");
		const query = resolveUsageQuery(
			{ ...filtersFromPreferences(preferences), range: "today" },
			"UTC",
			new Date(2025, 3, 8, 12, 0, 0).getTime(),
		);
		expect(query.granularity).toBe("hour");
		expect(query.to).toBeGreaterThan(query.from);
	});
});
