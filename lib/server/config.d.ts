import { z } from "zod";
export declare const RuntimeConfigSchema: z.ZodPreprocess<z.ZodPipe<z.ZodObject<{
    refresh: z.ZodDefault<z.ZodObject<{
        usageSeconds: z.ZodDefault<z.ZodNumber>;
        accountMinutes: z.ZodDefault<z.ZodNumber>;
        accountConcurrency: z.ZodDefault<z.ZodNumber>;
        timeoutMs: z.ZodDefault<z.ZodNumber>;
        accountMode: z.ZodDefault<z.ZodEnum<{
            fixed: "fixed";
            adaptive: "adaptive";
        }>>;
        accountAdaptiveMinMinutes: z.ZodDefault<z.ZodNumber>;
        accountAdaptiveMaxMinutes: z.ZodDefault<z.ZodNumber>;
    }, z.core.$strip>>;
    retention: z.ZodDefault<z.ZodObject<{
        usageDays: z.ZodDefault<z.ZodNumber>;
        accountSnapshotDays: z.ZodDefault<z.ZodNumber>;
        preserveDeletedSessions: z.ZodDefault<z.ZodBoolean>;
    }, z.core.$strip>>;
    accounts: z.ZodOptional<z.ZodUnknown>;
    monitors: z.ZodOptional<z.ZodUnknown>;
    oauthDevice: z.ZodDefault<z.ZodObject<{
        copilotClientId: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>>;
    pricing: z.ZodDefault<z.ZodObject<{
        baseCurrency: z.ZodDefault<z.ZodPipe<z.ZodString, z.ZodTransform<string, string>>>;
    }, z.core.$strip>>;
    codingOAuth: z.ZodDefault<z.ZodObject<{
        enabled: z.ZodDefault<z.ZodBoolean>;
        proxy: z.ZodOptional<z.ZodString>;
        proxyKimi: z.ZodDefault<z.ZodBoolean>;
        retryPolicy: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
        capabilities: z.ZodOptional<z.ZodObject<{
            codexSearch: z.ZodOptional<z.ZodBoolean>;
            codexImages: z.ZodOptional<z.ZodBoolean>;
            codexImageEdits: z.ZodOptional<z.ZodBoolean>;
            codexUsage: z.ZodOptional<z.ZodBoolean>;
            codexFast: z.ZodOptional<z.ZodBoolean>;
            grokImagineImage: z.ZodOptional<z.ZodBoolean>;
            grokImagineVideo: z.ZodOptional<z.ZodBoolean>;
            searchResults: z.ZodOptional<z.ZodNumber>;
            imageCount: z.ZodOptional<z.ZodNumber>;
            videoArtifactTtlMs: z.ZodOptional<z.ZodNumber>;
        }, z.core.$strict>>;
        gateway: z.ZodOptional<z.ZodObject<{
            enabled: z.ZodDefault<z.ZodBoolean>;
            bind: z.ZodDefault<z.ZodString>;
            port: z.ZodDefault<z.ZodNumber>;
            apiKey: z.ZodOptional<z.ZodString>;
            rateLimit: z.ZodDefault<z.ZodNumber>;
        }, z.core.$strict>>;
        ownerRequest: z.ZodOptional<z.ZodObject<{
            loopbackAccessMode: z.ZodOptional<z.ZodEnum<{
                loopback: "loopback";
                "ssh-tunnel": "ssh-tunnel";
            }>>;
            trustedProxy: z.ZodOptional<z.ZodObject<{
                peers: z.ZodArray<z.ZodString>;
                origins: z.ZodArray<z.ZodString>;
                ownerProof: z.ZodString;
                csrfToken: z.ZodString;
            }, z.core.$strict>>;
        }, z.core.$strict>>;
        pool: z.ZodDefault<z.ZodObject<{
            mode: z.ZodDefault<z.ZodEnum<{
                off: "off";
                priority: "priority";
                quota_aware: "quota_aware";
            }>>;
            switchMargin: z.ZodDefault<z.ZodNumber>;
        }, z.core.$strict>>;
    }, z.core.$strict>>;
    localMonitor: z.ZodDefault<z.ZodObject<{
        enabled: z.ZodDefault<z.ZodBoolean>;
    }, z.core.$strict>>;
    localUsage: z.ZodDefault<z.ZodObject<{
        enabled: z.ZodDefault<z.ZodBoolean>;
        intervalMinutes: z.ZodDefault<z.ZodNumber>;
        maxFileBytes: z.ZodDefault<z.ZodNumber>;
        maxTotalBytes: z.ZodDefault<z.ZodNumber>;
        retentionDays: z.ZodDefault<z.ZodNumber>;
    }, z.core.$strict>>;
    debug: z.ZodDefault<z.ZodBoolean>;
}, z.core.$strict>, z.ZodTransform<{
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
        pool: {
            mode: "off" | "priority" | "quota_aware";
            switchMargin: number;
        };
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
        pool: {
            mode: "off" | "priority" | "quota_aware";
            switchMargin: number;
        };
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
export type RuntimeConfig = z.infer<typeof RuntimeConfigSchema>;
export declare const DEFAULT_RUNTIME_CONFIG: RuntimeConfig;
//# sourceMappingURL=config.d.ts.map