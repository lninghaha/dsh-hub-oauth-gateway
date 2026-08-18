import { describe, expect, it } from "vitest";
import { totalTokens, UsageBucketsSchema, UsageQuerySchema } from "../../../src/shared/domain.js";
import {
	applyPresetToPreferences,
	defaultUserPreferences,
	effectiveModules,
	resetModulesToPreset,
	UserPreferencesSchema,
} from "../../../src/shared/preferences.js";

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

	it("fills Wave 1 module defaults when older preference payloads omit them", () => {
		const preferences = defaultUserPreferences("UTC");
		const { modules: _modules, modulesCustomized: _customized, streakMinTokens: _streak, ...legacyDisplay } =
			preferences.display;
		const parsed = UserPreferencesSchema.parse({
			...preferences,
			display: legacyDisplay,
		});
		expect(parsed.display.modules.order).toContain("heatmap");
		expect(parsed.display.modulesCustomized).toBe(false);
		expect(parsed.display.streakMinTokens).toBe(0);
	});

	it("applies preset module templates until the layout is customized", () => {
		const base = defaultUserPreferences("UTC");
		const cost = applyPresetToPreferences(base, "cost");
		expect(effectiveModules(cost)).toEqual(["kpi", "heatmap", "trend", "accounts", "breakdown"]);
		const customized = {
			...cost,
			display: {
				...cost.display,
				modulesCustomized: true,
				modules: {
					order: [...cost.display.modules.order],
					hidden: [...new Set([...cost.display.modules.hidden, "heatmap" as const])],
				},
			},
		};
		const afterPreset = applyPresetToPreferences(customized, "minimal");
		expect(afterPreset.display.preset).toBe("minimal");
		expect(effectiveModules(afterPreset)).toEqual(["kpi", "trend", "accounts", "breakdown"]);
		expect(effectiveModules(resetModulesToPreset(afterPreset))).toEqual(["kpi"]);
	});
});
