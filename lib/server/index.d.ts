import { type RuntimeConfig } from "./config.js";
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