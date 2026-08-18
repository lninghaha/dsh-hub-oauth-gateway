import type { UsageStatsHostContext } from "./context.js";
export declare const name = "usage-stats";
export declare const inject: readonly ["webServer", "credentials", "sessions", "sessionPersistence", "settings", "llm"];
export declare const Config: import("zod").ZodPreprocess<import("zod").ZodPipe<import("zod").ZodObject<{
    refresh: import("zod").ZodDefault<import("zod").ZodObject<{
        usageSeconds: import("zod").ZodDefault<import("zod").ZodNumber>;
        accountMinutes: import("zod").ZodDefault<import("zod").ZodNumber>;
        accountConcurrency: import("zod").ZodDefault<import("zod").ZodNumber>;
        timeoutMs: import("zod").ZodDefault<import("zod").ZodNumber>;
    }, import("zod/v4/core").$strip>>;
    retention: import("zod").ZodDefault<import("zod").ZodObject<{
        usageDays: import("zod").ZodDefault<import("zod").ZodNumber>;
        accountSnapshotDays: import("zod").ZodDefault<import("zod").ZodNumber>;
        preserveDeletedSessions: import("zod").ZodDefault<import("zod").ZodBoolean>;
    }, import("zod/v4/core").$strip>>;
    accounts: import("zod").ZodOptional<import("zod").ZodUnknown>;
    monitors: import("zod").ZodOptional<import("zod").ZodUnknown>;
    oauthDevice: import("zod").ZodDefault<import("zod").ZodObject<{
        copilotClientId: import("zod").ZodOptional<import("zod").ZodString>;
    }, import("zod/v4/core").$strip>>;
    pricing: import("zod").ZodDefault<import("zod").ZodObject<{
        baseCurrency: import("zod").ZodDefault<import("zod").ZodPipe<import("zod").ZodString, import("zod").ZodTransform<string, string>>>;
    }, import("zod/v4/core").$strip>>;
    codingOAuth: import("zod").ZodDefault<import("zod").ZodObject<{
        enabled: import("zod").ZodDefault<import("zod").ZodBoolean>;
        proxy: import("zod").ZodOptional<import("zod").ZodString>;
        proxyKimi: import("zod").ZodDefault<import("zod").ZodBoolean>;
        retryPolicy: import("zod").ZodOptional<import("zod").ZodPipe<import("zod").ZodUnknown, import("zod").ZodTransform<import("@deepseek-ai/dsh-llm").NormalRetryPolicyConfig | import("@deepseek-ai/dsh-llm").AlwaysRetryPolicyConfig, unknown>>>;
        capabilities: import("zod").ZodOptional<import("zod").ZodObject<{
            codexSearch: import("zod").ZodOptional<import("zod").ZodBoolean>;
            codexImages: import("zod").ZodOptional<import("zod").ZodBoolean>;
            codexImageEdits: import("zod").ZodOptional<import("zod").ZodBoolean>;
            codexUsage: import("zod").ZodOptional<import("zod").ZodBoolean>;
            codexFast: import("zod").ZodOptional<import("zod").ZodBoolean>;
            grokImagineImage: import("zod").ZodOptional<import("zod").ZodBoolean>;
            grokImagineVideo: import("zod").ZodOptional<import("zod").ZodBoolean>;
            searchResults: import("zod").ZodOptional<import("zod").ZodNumber>;
            imageCount: import("zod").ZodOptional<import("zod").ZodNumber>;
            videoArtifactTtlMs: import("zod").ZodOptional<import("zod").ZodNumber>;
        }, import("zod/v4/core").$strict>>;
        gateway: import("zod").ZodOptional<import("zod").ZodObject<{
            enabled: import("zod").ZodDefault<import("zod").ZodBoolean>;
            bind: import("zod").ZodDefault<import("zod").ZodString>;
            port: import("zod").ZodDefault<import("zod").ZodNumber>;
            apiKey: import("zod").ZodOptional<import("zod").ZodString>;
            rateLimit: import("zod").ZodDefault<import("zod").ZodNumber>;
        }, import("zod/v4/core").$strict>>;
    }, import("zod/v4/core").$strict>>;
    debug: import("zod").ZodDefault<import("zod").ZodBoolean>;
}, import("zod/v4/core").$strict>, import("zod").ZodTransform<{
    accounts: {};
    refresh: {
        usageSeconds: number;
        accountMinutes: number;
        accountConcurrency: number;
        timeoutMs: number;
    };
    retention: {
        usageDays: number;
        accountSnapshotDays: number;
        preserveDeletedSessions: boolean;
    };
    oauthDevice: {
        copilotClientId?: string | undefined;
    };
    pricing: {
        baseCurrency: string;
    };
    codingOAuth: {
        enabled: boolean;
        proxyKimi: boolean;
        proxy?: string | undefined;
        retryPolicy?: import("@deepseek-ai/dsh-llm").NormalRetryPolicyConfig | import("@deepseek-ai/dsh-llm").AlwaysRetryPolicyConfig | undefined;
        capabilities?: {
            codexSearch?: boolean | undefined;
            codexImages?: boolean | undefined;
            codexImageEdits?: boolean | undefined;
            codexUsage?: boolean | undefined;
            codexFast?: boolean | undefined;
            grokImagineImage?: boolean | undefined;
            grokImagineVideo?: boolean | undefined;
            searchResults?: number | undefined;
            imageCount?: number | undefined;
            videoArtifactTtlMs?: number | undefined;
        } | undefined;
        gateway?: {
            enabled: boolean;
            bind: string;
            port: number;
            rateLimit: number;
            apiKey?: string | undefined;
        } | undefined;
    };
    debug: boolean;
}, {
    refresh: {
        usageSeconds: number;
        accountMinutes: number;
        accountConcurrency: number;
        timeoutMs: number;
    };
    retention: {
        usageDays: number;
        accountSnapshotDays: number;
        preserveDeletedSessions: boolean;
    };
    oauthDevice: {
        copilotClientId?: string | undefined;
    };
    pricing: {
        baseCurrency: string;
    };
    codingOAuth: {
        enabled: boolean;
        proxyKimi: boolean;
        proxy?: string | undefined;
        retryPolicy?: import("@deepseek-ai/dsh-llm").NormalRetryPolicyConfig | import("@deepseek-ai/dsh-llm").AlwaysRetryPolicyConfig | undefined;
        capabilities?: {
            codexSearch?: boolean | undefined;
            codexImages?: boolean | undefined;
            codexImageEdits?: boolean | undefined;
            codexUsage?: boolean | undefined;
            codexFast?: boolean | undefined;
            grokImagineImage?: boolean | undefined;
            grokImagineVideo?: boolean | undefined;
            searchResults?: number | undefined;
            imageCount?: number | undefined;
            videoArtifactTtlMs?: number | undefined;
        } | undefined;
        gateway?: {
            enabled: boolean;
            bind: string;
            port: number;
            rateLimit: number;
            apiKey?: string | undefined;
        } | undefined;
    };
    debug: boolean;
    accounts?: unknown;
    monitors?: unknown;
}>>>;
export interface ApplyDependencies {
    readonly databasePath?: string;
    readonly disableBackgroundRefresh?: boolean;
    readonly now?: () => number;
}
export declare function apply(ctx: UsageStatsHostContext, rawConfig?: unknown, dependencies?: ApplyDependencies): Promise<void>;
//# sourceMappingURL=index.d.ts.map