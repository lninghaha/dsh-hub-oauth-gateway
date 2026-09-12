import { type PreferencePathOperation, type UserPreferences } from "./preferences.js";
export declare function preferenceOperations(base: UserPreferences, draft: UserPreferences): PreferencePathOperation[];
/** 三方合并只重放本地修改；选择远端时也保留没有冲突的本地字段。 */
export declare function rebasePreferences(base: UserPreferences, draft: UserPreferences, latest: UserPreferences, choice?: "local" | "latest"): {
    conflicts: string[];
    preferences: {
        version: 1;
        display: {
            preset: "minimal" | "quota" | "cost" | "analyst";
            sidebarMetric: "todayTokens" | "todayCost" | "lowestQuota" | "alerts";
            entryMode: "sidebar" | "floating";
            hudPosition: {
                left: number;
                top: number;
            } | null;
            defaultRange: "month" | "today" | "7d" | "30d";
            comparePrevious: boolean;
            density: "compact" | "comfortable";
            reducedMotion: "never" | "system" | "always";
            timeZone: string;
            weekStartsOn: 0 | 1 | 6;
            baseCurrency: string;
            modules: {
                order: ("accounts" | "alerts" | "kpi" | "heatmap" | "trend" | "breakdown" | "local")[];
                hidden: ("accounts" | "alerts" | "kpi" | "heatmap" | "trend" | "breakdown" | "local")[];
            };
            modulesCustomized: boolean;
            streakMinTokens: number;
        };
        providers: {
            hidden: string[];
            order: string[];
            aliases: Record<string, string>;
            colors: Record<string, string>;
        };
        privacy: {
            showSessionIdentifiers: boolean;
            redactExports: boolean;
            autoExportEnabled: boolean;
            autoExportDirectory: string;
            autoExportLayout: "daily" | "filtered" | "bundle";
            autoExportIntervalMinutes: number;
        };
        alerts: {
            enabled: boolean;
            quotaRemainingRatio: number;
            dailyCostThreshold: number | null;
        };
    };
};
export declare function acknowledgePreferenceSave(submitted: UserPreferences, currentDraft: UserPreferences, saved: UserPreferences): UserPreferences;
//# sourceMappingURL=preference-draft.d.ts.map