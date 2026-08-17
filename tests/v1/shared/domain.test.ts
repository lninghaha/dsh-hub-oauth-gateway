import { describe, expect, it } from "vitest";
import { totalTokens, UsageBucketsSchema, UsageQuerySchema } from "../../../src/shared/domain.js";
import { defaultUserPreferences, UserPreferencesSchema } from "../../../src/shared/preferences.js";

describe("usage domain", () => {
	it("keeps all provider token buckets disjoint", () => {
		const buckets = UsageBucketsSchema.parse({
			inputTokens: 10,
			outputTokens: 4,
			cacheReadTokens: 20,
			cacheWriteTokens: 3,
		});
		expect(totalTokens(buckets)).toBe(37);
	});

	it("rejects inverted query ranges", () => {
		expect(() =>
			UsageQuerySchema.parse({
				from: 200,
				to: 100,
				timeZone: "UTC",
				granularity: "day",
				metric: "tokens",
				groupBy: "provider",
				providers: [],
				models: [],
				compare: true,
			}),
		).toThrow(/from must be earlier than to/);
	});
});

describe("user preferences", () => {
	it("creates a versioned, parseable default", () => {
		const preferences = defaultUserPreferences("Asia/Shanghai");
		expect(UserPreferencesSchema.parse(preferences).display.timeZone).toBe("Asia/Shanghai");
	});

	it("accepts presentation presets and bounded provider customization", () => {
		const preferences = defaultUserPreferences("UTC");
		const parsed = UserPreferencesSchema.parse({
			...preferences,
			display: { ...preferences.display, preset: "analyst", density: "compact", reducedMotion: "always" },
			providers: {
				hidden: ["provider-b"],
				order: ["provider-a", "provider-b"],
				aliases: { "provider-a": "Primary" },
				colors: { "provider-a": "#123abc" },
			},
		});
		expect(parsed).toMatchObject({
			display: { preset: "analyst", density: "compact", reducedMotion: "always" },
			providers: { hidden: ["provider-b"], aliases: { "provider-a": "Primary" }, colors: { "provider-a": "#123abc" } },
		});
		expect(() =>
			UserPreferencesSchema.parse({
				...preferences,
				providers: { ...preferences.providers, colors: { "provider-a": "red" } },
			}),
		).toThrow();
	});

	it("rejects invalid time zones and currency labels", () => {
		const preferences = defaultUserPreferences("UTC");
		expect(() =>
			UserPreferencesSchema.parse({
				...preferences,
				display: { ...preferences.display, timeZone: "Mars/Olympus", baseCurrency: "US dollars" },
			}),
		).toThrow();
		expect(() =>
			UserPreferencesSchema.parse({
				...preferences,
				display: { ...preferences.display, timeZone: "UTC", baseCurrency: "$" },
			}),
		).toThrow();
	});
});
