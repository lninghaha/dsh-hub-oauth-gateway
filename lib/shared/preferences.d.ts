import { z } from "zod";
export declare const DashboardPresetSchema: z.ZodEnum<{
    minimal: "minimal";
    cost: "cost";
    quota: "quota";
    analyst: "analyst";
}>;
export type DashboardPreset = z.infer<typeof DashboardPresetSchema>;
export declare const SidebarMetricSchema: z.ZodEnum<{
    alerts: "alerts";
    todayTokens: "todayTokens";
    todayCost: "todayCost";
    lowestQuota: "lowestQuota";
}>;
export type SidebarMetric = z.infer<typeof SidebarMetricSchema>;
/** How the Usage Center surfaces its primary chrome entry. Extensible enum. */
export declare const EntryModeSchema: z.ZodEnum<{
    sidebar: "sidebar";
    floating: "floating";
}>;
export type EntryMode = z.infer<typeof EntryModeSchema>;
export declare const HudPositionSchema: z.ZodObject<{
    left: z.ZodNumber;
    top: z.ZodNumber;
}, z.core.$strict>;
export type HudPosition = z.infer<typeof HudPositionSchema>;
export declare const DashboardModuleIdSchema: z.ZodEnum<{
    accounts: "accounts";
    breakdown: "breakdown";
    alerts: "alerts";
    kpi: "kpi";
    heatmap: "heatmap";
    trend: "trend";
    local: "local";
}>;
export type DashboardModuleId = z.infer<typeof DashboardModuleIdSchema>;
export declare const ALL_DASHBOARD_MODULES: readonly DashboardModuleId[];
export declare function modulesForPreset(preset: DashboardPreset): {
    readonly order: DashboardModuleId[];
    readonly hidden: DashboardModuleId[];
};
export declare const UserPreferencesSchema: z.ZodObject<{
    version: z.ZodLiteral<1>;
    display: z.ZodObject<{
        preset: z.ZodEnum<{
            minimal: "minimal";
            cost: "cost";
            quota: "quota";
            analyst: "analyst";
        }>;
        sidebarMetric: z.ZodEnum<{
            alerts: "alerts";
            todayTokens: "todayTokens";
            todayCost: "todayCost";
            lowestQuota: "lowestQuota";
        }>;
        entryMode: z.ZodDefault<z.ZodEnum<{
            sidebar: "sidebar";
            floating: "floating";
        }>>;
        hudPosition: z.ZodDefault<z.ZodNullable<z.ZodObject<{
            left: z.ZodNumber;
            top: z.ZodNumber;
        }, z.core.$strict>>>;
        defaultRange: z.ZodEnum<{
            month: "month";
            "7d": "7d";
            today: "today";
            "30d": "30d";
        }>;
        comparePrevious: z.ZodBoolean;
        density: z.ZodEnum<{
            compact: "compact";
            comfortable: "comfortable";
        }>;
        reducedMotion: z.ZodEnum<{
            never: "never";
            system: "system";
            always: "always";
        }>;
        timeZone: z.ZodString;
        weekStartsOn: z.ZodUnion<readonly [z.ZodLiteral<0>, z.ZodLiteral<1>, z.ZodLiteral<6>]>;
        baseCurrency: z.ZodPipe<z.ZodString, z.ZodTransform<string, string>>;
        modules: z.ZodDefault<z.ZodObject<{
            order: z.ZodArray<z.ZodEnum<{
                accounts: "accounts";
                breakdown: "breakdown";
                alerts: "alerts";
                kpi: "kpi";
                heatmap: "heatmap";
                trend: "trend";
                local: "local";
            }>>;
            hidden: z.ZodArray<z.ZodEnum<{
                accounts: "accounts";
                breakdown: "breakdown";
                alerts: "alerts";
                kpi: "kpi";
                heatmap: "heatmap";
                trend: "trend";
                local: "local";
            }>>;
        }, z.core.$strict>>;
        modulesCustomized: z.ZodDefault<z.ZodBoolean>;
        streakMinTokens: z.ZodDefault<z.ZodNumber>;
    }, z.core.$strict>;
    providers: z.ZodObject<{
        hidden: z.ZodArray<z.ZodString>;
        order: z.ZodArray<z.ZodString>;
        aliases: z.ZodRecord<z.ZodString, z.ZodString>;
        colors: z.ZodRecord<z.ZodString, z.ZodString>;
    }, z.core.$strict>;
    privacy: z.ZodObject<{
        showSessionIdentifiers: z.ZodBoolean;
        redactExports: z.ZodBoolean;
        autoExportEnabled: z.ZodDefault<z.ZodBoolean>;
        autoExportDirectory: z.ZodDefault<z.ZodString>;
        autoExportLayout: z.ZodDefault<z.ZodEnum<{
            daily: "daily";
            filtered: "filtered";
            bundle: "bundle";
        }>>;
        autoExportIntervalMinutes: z.ZodDefault<z.ZodNumber>;
    }, z.core.$strict>;
    alerts: z.ZodDefault<z.ZodObject<{
        enabled: z.ZodBoolean;
        quotaRemainingRatio: z.ZodNumber;
        dailyCostThreshold: z.ZodNullable<z.ZodNumber>;
    }, z.core.$strict>>;
}, z.core.$strict>;
export type UserPreferences = z.infer<typeof UserPreferencesSchema>;
export declare function defaultUserPreferences(timeZone?: string): UserPreferences;
export declare function effectiveModules(preferences: UserPreferences): DashboardModuleId[];
export declare function applyPresetToPreferences(preferences: UserPreferences, preset: DashboardPreset): UserPreferences;
export declare function resetModulesToPreset(preferences: UserPreferences): UserPreferences;
//# sourceMappingURL=preferences.d.ts.map