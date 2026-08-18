import { z } from "zod";
export declare const UsageBucketsSchema: z.ZodObject<{
    inputTokens: z.ZodNumber;
    outputTokens: z.ZodNumber;
    cacheReadTokens: z.ZodNumber;
    cacheWriteTokens: z.ZodNumber;
}, z.core.$strict>;
export type UsageBuckets = z.infer<typeof UsageBucketsSchema>;
export declare const EMPTY_USAGE_BUCKETS: Readonly<UsageBuckets>;
export declare function totalTokens(buckets: UsageBuckets): number;
export declare const AccountStatusSchema: z.ZodEnum<{
    error: "error";
    ok: "ok";
    pending: "pending";
    "not-configured": "not-configured";
    unsupported: "unsupported";
    "auth-error": "auth-error";
    "rate-limited": "rate-limited";
    unavailable: "unavailable";
}>;
export type AccountStatus = z.infer<typeof AccountStatusSchema>;
export declare const QuotaWindowSchema: z.ZodObject<{
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
}, z.core.$strict>;
export type QuotaWindow = z.infer<typeof QuotaWindowSchema>;
export declare const BalanceSnapshotSchema: z.ZodObject<{
    remaining: z.ZodNullable<z.ZodNumber>;
    used: z.ZodNullable<z.ZodNumber>;
    limit: z.ZodNullable<z.ZodNumber>;
    currency: z.ZodNullable<z.ZodString>;
    unlimited: z.ZodBoolean;
}, z.core.$strict>;
export type BalanceSnapshot = z.infer<typeof BalanceSnapshotSchema>;
export declare const AccountSnapshotSchema: z.ZodObject<{
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
}, z.core.$strict>;
export type AccountSnapshot = z.infer<typeof AccountSnapshotSchema>;
export declare const CurrencyCodeSchema: z.ZodPipe<z.ZodString, z.ZodTransform<string, string>>;
export declare const PriceRuleSchema: z.ZodObject<{
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
}, z.core.$strict>;
export type PriceRule = z.infer<typeof PriceRuleSchema>;
export declare const UsageMetricSchema: z.ZodEnum<{
    tokens: "tokens";
    requests: "requests";
    estimatedCost: "estimatedCost";
    cacheHitRate: "cacheHitRate";
}>;
export type UsageMetric = z.infer<typeof UsageMetricSchema>;
export declare const UsageGroupBySchema: z.ZodEnum<{
    session: "session";
    none: "none";
    provider: "provider";
    model: "model";
}>;
export type UsageGroupBy = z.infer<typeof UsageGroupBySchema>;
export declare const TimeGranularitySchema: z.ZodEnum<{
    hour: "hour";
    day: "day";
    week: "week";
    month: "month";
}>;
export type TimeGranularity = z.infer<typeof TimeGranularitySchema>;
export declare const UsageQuerySchema: z.ZodObject<{
    from: z.ZodNumber;
    to: z.ZodNumber;
    timeZone: z.ZodString;
    granularity: z.ZodEnum<{
        hour: "hour";
        day: "day";
        week: "week";
        month: "month";
    }>;
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
    providers: z.ZodArray<z.ZodString>;
    models: z.ZodArray<z.ZodString>;
    compare: z.ZodBoolean;
}, z.core.$strict>;
export type UsageQuery = z.infer<typeof UsageQuerySchema>;
//# sourceMappingURL=domain.d.ts.map