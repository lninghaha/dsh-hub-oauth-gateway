import { z } from "zod";
import { DshCompatibilitySchema } from "./compatibility.js";
import { FeesDataSchema } from "./fees.js";
export declare const API_BASE = "/api/usage-stats/v1";
export declare const API_PATHS: Readonly<{
    overview: "/api/usage-stats/v1/overview";
    series: "/api/usage-stats/v1/series";
    breakdown: "/api/usage-stats/v1/breakdown";
    activity: "/api/usage-stats/v1/activity";
    accounts: "/api/usage-stats/v1/accounts";
    account: "/api/usage-stats/v1/account";
    providers: "/api/usage-stats/v1/providers";
    refresh: "/api/usage-stats/v1/refresh";
    settings: "/api/usage-stats/v1/settings";
    pricing: "/api/usage-stats/v1/pricing";
    alerts: "/api/usage-stats/v1/alerts";
    fees: "/api/usage-stats/v1/fees";
    credentials: "/api/usage-stats/v1/credentials";
    credentialImport: "/api/usage-stats/v1/credentials/import";
    oauthDevice: "/api/usage-stats/v1/oauth/device";
    oauthDevicePoll: "/api/usage-stats/v1/oauth/device/poll";
    export: "/api/usage-stats/v1/export";
    health: "/api/usage-stats/v1/health";
    compatibility: "/api/usage-stats/v1/compatibility";
    localAuth: "/api/usage-stats/v1/local/auth";
    localUsage: "/api/usage-stats/v1/local/usage";
    localUsageScan: "/api/usage-stats/v1/local/usage/scan";
}>;
export { DshCompatibilitySchema };
export declare const ExportLayoutSchema: z.ZodEnum<{
    daily: "daily";
    filtered: "filtered";
    bundle: "bundle";
}>;
export type ExportLayout = z.infer<typeof ExportLayoutSchema>;
export type { AccountFeeRecord, FeesData } from "./fees.js";
export { FeesDataSchema };
export declare const UsageFreshnessStateSchema: z.ZodEnum<{
    stale: "stale";
    "not-collected": "not-collected";
    fresh: "fresh";
}>;
export type UsageFreshnessState = z.infer<typeof UsageFreshnessStateSchema>;
export declare const ApiMetaSchema: z.ZodObject<{
    schemaVersion: z.ZodLiteral<1>;
    generatedAt: z.ZodNumber;
    sourceUpdatedAt: z.ZodNullable<z.ZodNumber>;
    usageUpdatedAt: z.ZodNullable<z.ZodNumber>;
    accountsUpdatedAt: z.ZodNullable<z.ZodNumber>;
    usageState: z.ZodEnum<{
        stale: "stale";
        "not-collected": "not-collected";
        fresh: "fresh";
    }>;
    partial: z.ZodBoolean;
    stale: z.ZodBoolean;
    warnings: z.ZodArray<z.ZodString>;
}, z.core.$strict>;
export type ApiMeta = z.infer<typeof ApiMetaSchema>;
export interface ApiSuccess<T> {
    readonly ok: true;
    readonly data: T;
    readonly meta: ApiMeta;
}
export interface ApiFailure {
    readonly ok: false;
    readonly error: {
        readonly code: string;
        readonly message: string;
        readonly details?: Readonly<Record<string, unknown>>;
    };
    readonly meta: ApiMeta;
}
export type ApiResponse<T> = ApiSuccess<T> | ApiFailure;
export declare const CostEstimateSchema: z.ZodObject<{
    amount: z.ZodNullable<z.ZodNumber>;
    currency: z.ZodString;
    coverageRatio: z.ZodNumber;
    estimated: z.ZodLiteral<true>;
}, z.core.$strict>;
export type CostEstimate = z.infer<typeof CostEstimateSchema>;
export declare const OverviewDataSchema: z.ZodObject<{
    current: z.ZodObject<{
        inputTokens: z.ZodNumber;
        outputTokens: z.ZodNumber;
        cacheReadTokens: z.ZodNumber;
        cacheWriteTokens: z.ZodNumber;
    }, z.core.$strict>;
    previous: z.ZodNullable<z.ZodObject<{
        inputTokens: z.ZodNumber;
        outputTokens: z.ZodNumber;
        cacheReadTokens: z.ZodNumber;
        cacheWriteTokens: z.ZodNumber;
    }, z.core.$strict>>;
    requests: z.ZodNumber;
    previousRequests: z.ZodNullable<z.ZodNumber>;
    cacheHitRate: z.ZodNullable<z.ZodNumber>;
    previousCacheHitRate: z.ZodNullable<z.ZodNumber>;
    cost: z.ZodObject<{
        amount: z.ZodNullable<z.ZodNumber>;
        currency: z.ZodString;
        coverageRatio: z.ZodNumber;
        estimated: z.ZodLiteral<true>;
    }, z.core.$strict>;
    previousCost: z.ZodNullable<z.ZodObject<{
        amount: z.ZodNullable<z.ZodNumber>;
        currency: z.ZodString;
        coverageRatio: z.ZodNumber;
        estimated: z.ZodLiteral<true>;
    }, z.core.$strict>>;
    activeProviders: z.ZodNumber;
    alertCount: z.ZodNumber;
}, z.core.$strict>;
export type OverviewData = z.infer<typeof OverviewDataSchema>;
export declare const SeriesValueSchema: z.ZodObject<{
    key: z.ZodString;
    label: z.ZodString;
    value: z.ZodNullable<z.ZodNumber>;
}, z.core.$strict>;
export declare const SeriesPointSchema: z.ZodObject<{
    timestamp: z.ZodNumber;
    values: z.ZodArray<z.ZodObject<{
        key: z.ZodString;
        label: z.ZodString;
        value: z.ZodNullable<z.ZodNumber>;
    }, z.core.$strict>>;
}, z.core.$strict>;
export declare const SeriesDataSchema: z.ZodObject<{
    metric: z.ZodEnum<{
        tokens: "tokens";
        requests: "requests";
        estimatedCost: "estimatedCost";
        cacheHitRate: "cacheHitRate";
    }>;
    groupBy: z.ZodEnum<{
        session: "session";
        none: "none";
        provider: "provider";
        model: "model";
    }>;
    points: z.ZodArray<z.ZodObject<{
        timestamp: z.ZodNumber;
        values: z.ZodArray<z.ZodObject<{
            key: z.ZodString;
            label: z.ZodString;
            value: z.ZodNullable<z.ZodNumber>;
        }, z.core.$strict>>;
    }, z.core.$strict>>;
    forecast: z.ZodArray<z.ZodObject<{
        timestamp: z.ZodNumber;
        values: z.ZodArray<z.ZodObject<{
            key: z.ZodString;
            label: z.ZodString;
            value: z.ZodNullable<z.ZodNumber>;
        }, z.core.$strict>>;
    }, z.core.$strict>>;
}, z.core.$strict>;
export type SeriesData = z.infer<typeof SeriesDataSchema>;
export declare const BreakdownRowSchema: z.ZodObject<{
    key: z.ZodString;
    label: z.ZodString;
    buckets: z.ZodObject<{
        inputTokens: z.ZodNumber;
        outputTokens: z.ZodNumber;
        cacheReadTokens: z.ZodNumber;
        cacheWriteTokens: z.ZodNumber;
    }, z.core.$strict>;
    requests: z.ZodNumber;
    cacheHitRate: z.ZodNullable<z.ZodNumber>;
    cost: z.ZodObject<{
        amount: z.ZodNullable<z.ZodNumber>;
        currency: z.ZodString;
        coverageRatio: z.ZodNumber;
        estimated: z.ZodLiteral<true>;
    }, z.core.$strict>;
}, z.core.$strict>;
export declare const BreakdownDataSchema: z.ZodObject<{
    dimension: z.ZodEnum<{
        session: "session";
        provider: "provider";
        model: "model";
    }>;
    rows: z.ZodArray<z.ZodObject<{
        key: z.ZodString;
        label: z.ZodString;
        buckets: z.ZodObject<{
            inputTokens: z.ZodNumber;
            outputTokens: z.ZodNumber;
            cacheReadTokens: z.ZodNumber;
            cacheWriteTokens: z.ZodNumber;
        }, z.core.$strict>;
        requests: z.ZodNumber;
        cacheHitRate: z.ZodNullable<z.ZodNumber>;
        cost: z.ZodObject<{
            amount: z.ZodNullable<z.ZodNumber>;
            currency: z.ZodString;
            coverageRatio: z.ZodNumber;
            estimated: z.ZodLiteral<true>;
        }, z.core.$strict>;
    }, z.core.$strict>>;
}, z.core.$strict>;
export type BreakdownData = z.infer<typeof BreakdownDataSchema>;
export declare const AccountsDataSchema: z.ZodObject<{
    accounts: z.ZodArray<z.ZodObject<{
        providerId: z.ZodString;
        profileId: z.ZodDefault<z.ZodString>;
        displayName: z.ZodString;
        adapterId: z.ZodNullable<z.ZodString>;
        mode: z.ZodNullable<z.ZodEnum<{
            balance: "balance";
            subscription: "subscription";
            hybrid: "hybrid";
        }>>;
        status: z.ZodEnum<{
            error: "error";
            ok: "ok";
            pending: "pending";
            "not-configured": "not-configured";
            unsupported: "unsupported";
            "auth-error": "auth-error";
            "rate-limited": "rate-limited";
            unavailable: "unavailable";
        }>;
        configured: z.ZodBoolean;
        fetchedAt: z.ZodNullable<z.ZodNumber>;
        stale: z.ZodBoolean;
        plan: z.ZodNullable<z.ZodString>;
        balance: z.ZodNullable<z.ZodObject<{
            remaining: z.ZodNullable<z.ZodNumber>;
            used: z.ZodNullable<z.ZodNumber>;
            limit: z.ZodNullable<z.ZodNumber>;
            currency: z.ZodNullable<z.ZodString>;
            unlimited: z.ZodBoolean;
        }, z.core.$strict>>;
        windows: z.ZodArray<z.ZodObject<{
            id: z.ZodString;
            kind: z.ZodEnum<{
                session: "session";
                daily: "daily";
                weekly: "weekly";
                monthly: "monthly";
                rolling: "rolling";
                custom: "custom";
            }>;
            label: z.ZodString;
            unit: z.ZodEnum<{
                tokens: "tokens";
                requests: "requests";
                currency: "currency";
                percent: "percent";
                unknown: "unknown";
            }>;
            used: z.ZodNullable<z.ZodNumber>;
            remaining: z.ZodNullable<z.ZodNumber>;
            limit: z.ZodNullable<z.ZodNumber>;
            usedRatio: z.ZodNullable<z.ZodNumber>;
            resetsAt: z.ZodNullable<z.ZodNumber>;
            rolling: z.ZodBoolean;
        }, z.core.$strict>>;
        missingCredentials: z.ZodArray<z.ZodString>;
        warningCode: z.ZodNullable<z.ZodString>;
    }, z.core.$strict>>;
}, z.core.$strict>;
export type AccountsData = z.infer<typeof AccountsDataSchema>;
export declare const UsageAlertSchema: z.ZodObject<{
    id: z.ZodString;
    kind: z.ZodEnum<{
        account: "account";
        cost: "cost";
        quota: "quota";
    }>;
    level: z.ZodEnum<{
        info: "info";
        warning: "warning";
        critical: "critical";
    }>;
    title: z.ZodString;
    providerId: z.ZodNullable<z.ZodString>;
    value: z.ZodNullable<z.ZodNumber>;
    threshold: z.ZodNullable<z.ZodNumber>;
    createdAt: z.ZodNumber;
}, z.core.$strict>;
export type UsageAlert = z.infer<typeof UsageAlertSchema>;
export declare const AlertsDataSchema: z.ZodObject<{
    alerts: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        kind: z.ZodEnum<{
            account: "account";
            cost: "cost";
            quota: "quota";
        }>;
        level: z.ZodEnum<{
            info: "info";
            warning: "warning";
            critical: "critical";
        }>;
        title: z.ZodString;
        providerId: z.ZodNullable<z.ZodString>;
        value: z.ZodNullable<z.ZodNumber>;
        threshold: z.ZodNullable<z.ZodNumber>;
        createdAt: z.ZodNumber;
    }, z.core.$strict>>;
}, z.core.$strict>;
export type AlertsData = z.infer<typeof AlertsDataSchema>;
export declare const PricingDataSchema: z.ZodObject<{
    baseCurrency: z.ZodString;
    rules: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        providerPattern: z.ZodString;
        modelPattern: z.ZodString;
        effectiveFrom: z.ZodNumber;
        currency: z.ZodPipe<z.ZodString, z.ZodTransform<string, string>>;
        inputPerMillion: z.ZodNullable<z.ZodNumber>;
        outputPerMillion: z.ZodNullable<z.ZodNumber>;
        cacheReadPerMillion: z.ZodNullable<z.ZodNumber>;
        cacheWritePerMillion: z.ZodNullable<z.ZodNumber>;
        source: z.ZodEnum<{
            builtin: "builtin";
            user: "user";
            imported: "imported";
        }>;
        updatedAt: z.ZodNumber;
    }, z.core.$strict>>;
    catalogUpdatedAt: z.ZodNullable<z.ZodNumber>;
}, z.core.$strict>;
export type PricingData = z.infer<typeof PricingDataSchema>;
export declare const ActivityDaySchema: z.ZodObject<{
    date: z.ZodString;
    tokens: z.ZodNumber;
    cost: z.ZodNullable<z.ZodNumber>;
    requests: z.ZodNumber;
    hasData: z.ZodBoolean;
}, z.core.$strict>;
export declare const ActivityDataSchema: z.ZodObject<{
    metric: z.ZodEnum<{
        tokens: "tokens";
        requests: "requests";
        estimatedCost: "estimatedCost";
        cacheHitRate: "cacheHitRate";
    }>;
    days: z.ZodArray<z.ZodObject<{
        date: z.ZodString;
        tokens: z.ZodNumber;
        cost: z.ZodNullable<z.ZodNumber>;
        requests: z.ZodNumber;
        hasData: z.ZodBoolean;
    }, z.core.$strict>>;
    streak: z.ZodNumber;
    longestStreak: z.ZodNumber;
    weekStartsOn: z.ZodUnion<readonly [z.ZodLiteral<0>, z.ZodLiteral<1>, z.ZodLiteral<6>]>;
    streakMinTokens: z.ZodNumber;
}, z.core.$strict>;
export type ActivityData = z.infer<typeof ActivityDataSchema>;
export type ActivityDay = z.infer<typeof ActivityDaySchema>;
export declare const DailyExportRowSchema: z.ZodObject<{
    date: z.ZodString;
    provider: z.ZodString;
    inputTokens: z.ZodNumber;
    outputTokens: z.ZodNumber;
    cacheReadTokens: z.ZodNumber;
    cacheWriteTokens: z.ZodNumber;
    requests: z.ZodNumber;
    estimatedCost: z.ZodNullable<z.ZodNumber>;
    currency: z.ZodString;
    priceCoverage: z.ZodNumber;
}, z.core.$strict>;
export type DailyExportRow = z.infer<typeof DailyExportRowSchema>;
//# sourceMappingURL=contracts.d.ts.map