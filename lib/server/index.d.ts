import { type RuntimeConfig } from "./config.js";
import type { UsageStatsHostContext } from "./context.js";
export declare const name = "usage-stats";
export declare const inject: readonly ["webServer"];
export declare const Config: import("zod").ZodPreprocess<import("zod").ZodPipe<import("zod").ZodObject<{
    refresh: import("zod").ZodDefault<import("zod").ZodObject<{
        usageSeconds: import("zod").ZodDefault<import("zod").ZodNumber>;
        accountMinutes: import("zod").ZodDefault<import("zod").ZodNumber>;
        accountConcurrency: import("zod").ZodDefault<import("zod").ZodNumber>;
        timeoutMs: import("zod").ZodDefault<import("zod").ZodNumber>;
        accountMode: import("zod").ZodDefault<import("zod").ZodEnum<{
            fixed: "fixed";
            adaptive: "adaptive";
        }>>;
        accountAdaptiveMinMinutes: import("zod").ZodDefault<import("zod").ZodNumber>;
        accountAdaptiveMaxMinutes: import("zod").ZodDefault<import("zod").ZodNumber>;
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
        retryPolicy: import("zod").ZodOptional<import("zod").ZodRecord<import("zod").ZodString, import("zod").ZodUnknown>>;
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
        ownerRequest: import("zod").ZodOptional<import("zod").ZodObject<{
            loopbackAccessMode: import("zod").ZodOptional<import("zod").ZodEnum<{
                loopback: "loopback";
                "ssh-tunnel": "ssh-tunnel";
            }>>;
            trustedProxy: import("zod").ZodOptional<import("zod").ZodObject<{
                peers: import("zod").ZodArray<import("zod").ZodString>;
                origins: import("zod").ZodArray<import("zod").ZodString>;
                ownerProof: import("zod").ZodString;
                csrfToken: import("zod").ZodString;
            }, import("zod/v4/core").$strict>>;
        }, import("zod/v4/core").$strict>>;
    }, import("zod/v4/core").$strict>>;
    localMonitor: import("zod").ZodDefault<import("zod").ZodObject<{
        enabled: import("zod").ZodDefault<import("zod").ZodBoolean>;
    }, import("zod/v4/core").$strict>>;
    localUsage: import("zod").ZodDefault<import("zod").ZodObject<{
        enabled: import("zod").ZodDefault<import("zod").ZodBoolean>;
        intervalMinutes: import("zod").ZodDefault<import("zod").ZodNumber>;
        maxFileBytes: import("zod").ZodDefault<import("zod").ZodNumber>;
        maxTotalBytes: import("zod").ZodDefault<import("zod").ZodNumber>;
        retentionDays: import("zod").ZodDefault<import("zod").ZodNumber>;
    }, import("zod/v4/core").$strict>>;
    debug: import("zod").ZodDefault<import("zod").ZodBoolean>;
}, import("zod/v4/core").$strict>, import("zod").ZodTransform<{
    accounts: {};
    refresh: {
        usageSeconds: number;
        accountMinutes: number;
        accountConcurrency: number;
        timeoutMs: number;
        accountMode: "fixed" | "adaptive";
        accountAdaptiveMinMinutes: number;
        accountAdaptiveMaxMinutes: number;
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
        retryPolicy?: Record<string, unknown> | undefined;
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
        ownerRequest?: {
            loopbackAccessMode?: "loopback" | "ssh-tunnel" | undefined;
            trustedProxy?: {
                peers: string[];
                origins: string[];
                ownerProof: string;
                csrfToken: string;
            } | undefined;
        } | undefined;
    };
    localMonitor: {
        enabled: boolean;
    };
    localUsage: {
        enabled: boolean;
        intervalMinutes: number;
        maxFileBytes: number;
        maxTotalBytes: number;
        retentionDays: number;
    };
    debug: boolean;
}, {
    refresh: {
        usageSeconds: number;
        accountMinutes: number;
        accountConcurrency: number;
        timeoutMs: number;
        accountMode: "fixed" | "adaptive";
        accountAdaptiveMinMinutes: number;
        accountAdaptiveMaxMinutes: number;
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
        retryPolicy?: Record<string, unknown> | undefined;
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
        ownerRequest?: {
            loopbackAccessMode?: "loopback" | "ssh-tunnel" | undefined;
            trustedProxy?: {
                peers: string[];
                origins: string[];
                ownerProof: string;
                csrfToken: string;
            } | undefined;
        } | undefined;
    };
    localMonitor: {
        enabled: boolean;
    };
    localUsage: {
        enabled: boolean;
        intervalMinutes: number;
        maxFileBytes: number;
        maxTotalBytes: number;
        retentionDays: number;
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
export declare function apply(ctx: UsageStatsHostContext, rawConfig?: RuntimeConfig, dependencies?: ApplyDependencies): Promise<void>;
//# sourceMappingURL=index.d.ts.map