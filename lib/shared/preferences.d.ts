import { z } from "zod";
export declare const DashboardPresetSchema: z.ZodEnum<{
    minimal: "minimal";
    quota: "quota";
    cost: "cost";
    analyst: "analyst";
}>;
export type DashboardPreset = z.infer<typeof DashboardPresetSchema>;
export declare const SidebarMetricSchema: z.ZodEnum<{
    todayTokens: "todayTokens";
    todayCost: "todayCost";
    lowestQuota: "lowestQuota";
    alerts: "alerts";
}>;
export type SidebarMetric = z.infer<typeof SidebarMetricSchema>;
export declare const UserPreferencesSchema: z.ZodObject<{
    version: z.ZodLiteral<1>;
    display: z.ZodObject<{
        preset: z.ZodEnum<{
            minimal: "minimal";
            quota: "quota";
            cost: "cost";
            analyst: "analyst";
        }>;
        sidebarMetric: z.ZodEnum<{
            todayTokens: "todayTokens";
            todayCost: "todayCost";
            lowestQuota: "lowestQuota";
            alerts: "alerts";
        }>;
        defaultRange: z.ZodEnum<{
            month: "month";
            today: "today";
            "7d": "7d";
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
    }, z.core.$strict>;
    alerts: z.ZodDefault<z.ZodObject<{
        enabled: z.ZodBoolean;
        quotaRemainingRatio: z.ZodNumber;
        dailyCostThreshold: z.ZodNullable<z.ZodNumber>;
    }, z.core.$strict>>;
}, z.core.$strict>;
export type UserPreferences = z.infer<typeof UserPreferencesSchema>;
export declare function defaultUserPreferences(timeZone?: string): UserPreferences;
//# sourceMappingURL=preferences.d.ts.map