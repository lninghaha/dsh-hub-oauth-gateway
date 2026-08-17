import { z } from "zod";
import { CurrencyCodeSchema } from "./domain.js";

function isValidTimeZone(value: string): boolean {
	try {
		new Intl.DateTimeFormat("en", { timeZone: value }).format(0);
		return true;
	} catch {
		return false;
	}
}

const TimeZoneSchema = z.string().min(1).max(128).refine(isValidTimeZone, "invalid time zone");
const ProviderIdSchema = z.string().min(1).max(128);
const ProviderColorSchema = z.string().regex(/^#[0-9a-f]{6}$/i, "invalid provider color");

export const DashboardPresetSchema = z.enum(["minimal", "quota", "cost", "analyst"]);
export type DashboardPreset = z.infer<typeof DashboardPresetSchema>;

export const SidebarMetricSchema = z.enum(["todayTokens", "todayCost", "lowestQuota", "alerts"]);
export type SidebarMetric = z.infer<typeof SidebarMetricSchema>;

export const UserPreferencesSchema = z
	.object({
		version: z.literal(1),
		display: z
			.object({
				preset: DashboardPresetSchema,
				sidebarMetric: SidebarMetricSchema,
				defaultRange: z.enum(["today", "7d", "30d", "month"]),
				comparePrevious: z.boolean(),
				density: z.enum(["compact", "comfortable"]),
				reducedMotion: z.enum(["system", "always", "never"]),
				timeZone: TimeZoneSchema,
				weekStartsOn: z.union([z.literal(0), z.literal(1), z.literal(6)]),
				baseCurrency: CurrencyCodeSchema,
			})
			.strict(),
		providers: z
			.object({
				hidden: z.array(ProviderIdSchema).max(256),
				order: z.array(ProviderIdSchema).max(256),
				aliases: z.record(ProviderIdSchema, z.string().trim().max(128)),
				colors: z.record(ProviderIdSchema, ProviderColorSchema),
			})
			.strict()
			.superRefine(({ aliases, colors }, context) => {
				if (Object.keys(aliases).length > 256)
					context.addIssue({ code: "custom", path: ["aliases"], message: "too many provider aliases" });
				if (Object.keys(colors).length > 256)
					context.addIssue({ code: "custom", path: ["colors"], message: "too many provider colors" });
			}),
		privacy: z
			.object({
				showSessionIdentifiers: z.boolean(),
				redactExports: z.boolean(),
			})
			.strict(),
		alerts: z
			.object({
				enabled: z.boolean(),
				quotaRemainingRatio: z.number().min(0).max(1),
				dailyCostThreshold: z.number().nonnegative().nullable(),
			})
			.strict()
			.default({ enabled: true, quotaRemainingRatio: 0.2, dailyCostThreshold: null }),
	})
	.strict();

export type UserPreferences = z.infer<typeof UserPreferencesSchema>;

export function defaultUserPreferences(timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone): UserPreferences {
	return {
		version: 1,
		display: {
			preset: "analyst",
			sidebarMetric: "todayTokens",
			defaultRange: "30d",
			comparePrevious: true,
			density: "comfortable",
			reducedMotion: "system",
			timeZone,
			weekStartsOn: 1,
			baseCurrency: "USD",
		},
		providers: {
			hidden: [],
			order: [],
			aliases: {},
			colors: {},
		},
		privacy: {
			showSessionIdentifiers: false,
			redactExports: true,
		},
		alerts: {
			enabled: true,
			quotaRemainingRatio: 0.2,
			dailyCostThreshold: null,
		},
	};
}
