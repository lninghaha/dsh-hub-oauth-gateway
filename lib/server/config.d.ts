import { z } from "zod";
export declare const RuntimeConfigSchema: z.ZodPreprocess<z.ZodPipe<z.ZodObject<{
    refresh: z.ZodDefault<z.ZodObject<{
        usageSeconds: z.ZodDefault<z.ZodNumber>;
        accountMinutes: z.ZodDefault<z.ZodNumber>;
        accountConcurrency: z.ZodDefault<z.ZodNumber>;
        timeoutMs: z.ZodDefault<z.ZodNumber>;
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
    debug: z.ZodDefault<z.ZodBoolean>;
}, z.core.$strict>, z.ZodTransform<{
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
export type RuntimeConfig = z.infer<typeof RuntimeConfigSchema>;
export declare const DEFAULT_RUNTIME_CONFIG: RuntimeConfig;
//# sourceMappingURL=config.d.ts.map