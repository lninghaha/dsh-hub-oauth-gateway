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

export const DashboardModuleIdSchema = z.enum(["kpi", "heatmap", "trend", "accounts", "alerts", "breakdown", "local"]);
export type DashboardModuleId = z.infer<typeof DashboardModuleIdSchema>;

export const ALL_DASHBOARD_MODULES: readonly DashboardModuleId[] = Object.freeze([
	"kpi",
	"heatmap",
	"trend",
	"accounts",
	"alerts",
	"breakdown",
	"local",
]);

export function modulesForPreset(preset: DashboardPreset): {
	readonly order: DashboardModuleId[];
	readonly hidden: DashboardModuleId[];
} {
	const visible: DashboardModuleId[] =
		preset === "minimal"
			? ["kpi"]
			: preset === "quota"
				? ["kpi", "accounts", "alerts"]
				: preset === "cost"
					? ["kpi", "heatmap", "trend", "accounts", "breakdown", "local"]
					: [...ALL_DASHBOARD_MODULES];
	return {
		order: [...ALL_DASHBOARD_MODULES],
		hidden: ALL_DASHBOARD_MODULES.filter((id) => !visible.includes(id)),
	};
}

const ModulesSchema = z
	.object({
		order: z.array(DashboardModuleIdSchema).min(1).max(16),
		hidden: z.array(DashboardModuleIdSchema).max(16),
	})
	.strict()
	.superRefine(({ order, hidden }, context) => {
		if (new Set(order).size !== order.length) {
			context.addIssue({ code: "custom", path: ["order"], message: "duplicate module id" });
		}
		if (new Set(hidden).size !== hidden.length) {
			context.addIssue({ code: "custom", path: ["hidden"], message: "duplicate module id" });
		}
		for (const id of hidden) {
			if (!order.includes(id)) {
				context.addIssue({ code: "custom", path: ["hidden"], message: `hidden module missing from order: ${id}` });
			}
		}
	});

const DEFAULT_MODULES = modulesForPreset("analyst");

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
				modules: ModulesSchema.default(DEFAULT_MODULES),
				modulesCustomized: z.boolean().default(false),
				streakMinTokens: z.number().int().nonnegative().default(0),
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
				autoExportEnabled: z.boolean().default(false),
				autoExportDirectory: z.string().max(1024).default(""),
				autoExportLayout: z.enum(["filtered", "daily", "bundle"]).default("bundle"),
				autoExportIntervalMinutes: z.number().int().min(5).max(1440).default(60),
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
	const modules = modulesForPreset("analyst");
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
			modules: { order: [...modules.order], hidden: [...modules.hidden] },
			modulesCustomized: false,
			streakMinTokens: 0,
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
			autoExportEnabled: false,
			autoExportDirectory: "",
			autoExportLayout: "bundle",
			autoExportIntervalMinutes: 60,
		},
		alerts: {
			enabled: true,
			quotaRemainingRatio: 0.2,
			dailyCostThreshold: null,
		},
	};
}

export function effectiveModules(preferences: UserPreferences): DashboardModuleId[] {
	const modules = preferences.display.modulesCustomized
		? preferences.display.modules
		: modulesForPreset(preferences.display.preset);
	const hidden = new Set(modules.hidden);
	return modules.order.filter((id) => !hidden.has(id));
}

export function applyPresetToPreferences(preferences: UserPreferences, preset: DashboardPreset): UserPreferences {
	if (preferences.display.modulesCustomized) {
		return { ...preferences, display: { ...preferences.display, preset } };
	}
	const modules = modulesForPreset(preset);
	return {
		...preferences,
		display: {
			...preferences.display,
			preset,
			modules: { order: [...modules.order], hidden: [...modules.hidden] },
			modulesCustomized: false,
		},
	};
}

export function resetModulesToPreset(preferences: UserPreferences): UserPreferences {
	const modules = modulesForPreset(preferences.display.preset);
	return {
		...preferences,
		display: {
			...preferences.display,
			modules: { order: [...modules.order], hidden: [...modules.hidden] },
			modulesCustomized: false,
		},
	};
}
