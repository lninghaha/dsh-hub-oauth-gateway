/**
 * Wire contracts for the token-monitor-style local machine surfaces:
 * read-only local CLI authentication snapshots and the opt-in cross-tool
 * usage scan aggregates. No credential material, prompt/response content,
 * or absolute filesystem paths ever appear in these documents.
 */
import { z } from "zod";
export declare const LocalAuthToolKindSchema: z.ZodEnum<{
    grok: "grok";
    codex: "codex";
    kimi: "kimi";
    claude: "claude";
}>;
export type LocalAuthToolKind = z.infer<typeof LocalAuthToolKindSchema>;
export declare const LocalAuthCliStateSchema: z.ZodEnum<{
    unavailable: "unavailable";
    expired: "expired";
    "signed-in": "signed-in";
    "signed-out": "signed-out";
}>;
export type LocalAuthCliState = z.infer<typeof LocalAuthCliStateSchema>;
export declare const LocalAuthCliStatusSchema: z.ZodObject<{
    kind: z.ZodEnum<{
        grok: "grok";
        codex: "codex";
        kimi: "kimi";
        claude: "claude";
    }>;
    displayPath: z.ZodString;
    state: z.ZodEnum<{
        unavailable: "unavailable";
        expired: "expired";
        "signed-in": "signed-in";
        "signed-out": "signed-out";
    }>;
    expiresAt: z.ZodNullable<z.ZodNumber>;
    hasRefreshToken: z.ZodBoolean;
    reason: z.ZodNullable<z.ZodEnum<{
        missing: "missing";
        invalid: "invalid";
        too_large: "too_large";
        unsafe: "unsafe";
    }>>;
}, z.core.$strict>;
export type LocalAuthCliStatus = z.infer<typeof LocalAuthCliStatusSchema>;
export declare const LocalAuthSessionStatusSchema: z.ZodObject<{
    provider: z.ZodEnum<{
        grok: "grok";
        codex: "codex";
        kimi: "kimi";
        claude: "claude";
    }>;
    route: z.ZodString;
    authenticated: z.ZodBoolean;
    expiresAt: z.ZodNullable<z.ZodNumber>;
}, z.core.$strict>;
export type LocalAuthSessionStatus = z.infer<typeof LocalAuthSessionStatusSchema>;
export declare const LocalAuthDataSchema: z.ZodObject<{
    enabled: z.ZodLiteral<true>;
    generatedAt: z.ZodNumber;
    cli: z.ZodArray<z.ZodObject<{
        kind: z.ZodEnum<{
            grok: "grok";
            codex: "codex";
            kimi: "kimi";
            claude: "claude";
        }>;
        displayPath: z.ZodString;
        state: z.ZodEnum<{
            unavailable: "unavailable";
            expired: "expired";
            "signed-in": "signed-in";
            "signed-out": "signed-out";
        }>;
        expiresAt: z.ZodNullable<z.ZodNumber>;
        hasRefreshToken: z.ZodBoolean;
        reason: z.ZodNullable<z.ZodEnum<{
            missing: "missing";
            invalid: "invalid";
            too_large: "too_large";
            unsafe: "unsafe";
        }>>;
    }, z.core.$strict>>;
    sessions: z.ZodArray<z.ZodObject<{
        provider: z.ZodEnum<{
            grok: "grok";
            codex: "codex";
            kimi: "kimi";
            claude: "claude";
        }>;
        route: z.ZodString;
        authenticated: z.ZodBoolean;
        expiresAt: z.ZodNullable<z.ZodNumber>;
    }, z.core.$strict>>;
}, z.core.$strict>;
export type LocalAuthData = z.infer<typeof LocalAuthDataSchema>;
export declare const LocalAuthDisabledSchema: z.ZodObject<{
    enabled: z.ZodLiteral<false>;
}, z.core.$strict>;
export declare const LocalAuthResponseSchema: z.ZodDiscriminatedUnion<[z.ZodObject<{
    enabled: z.ZodLiteral<true>;
    generatedAt: z.ZodNumber;
    cli: z.ZodArray<z.ZodObject<{
        kind: z.ZodEnum<{
            grok: "grok";
            codex: "codex";
            kimi: "kimi";
            claude: "claude";
        }>;
        displayPath: z.ZodString;
        state: z.ZodEnum<{
            unavailable: "unavailable";
            expired: "expired";
            "signed-in": "signed-in";
            "signed-out": "signed-out";
        }>;
        expiresAt: z.ZodNullable<z.ZodNumber>;
        hasRefreshToken: z.ZodBoolean;
        reason: z.ZodNullable<z.ZodEnum<{
            missing: "missing";
            invalid: "invalid";
            too_large: "too_large";
            unsafe: "unsafe";
        }>>;
    }, z.core.$strict>>;
    sessions: z.ZodArray<z.ZodObject<{
        provider: z.ZodEnum<{
            grok: "grok";
            codex: "codex";
            kimi: "kimi";
            claude: "claude";
        }>;
        route: z.ZodString;
        authenticated: z.ZodBoolean;
        expiresAt: z.ZodNullable<z.ZodNumber>;
    }, z.core.$strict>>;
}, z.core.$strict>, z.ZodObject<{
    enabled: z.ZodLiteral<false>;
}, z.core.$strict>], "enabled">;
export type LocalAuthResponse = z.infer<typeof LocalAuthResponseSchema>;
export declare const LocalUsageToolSchema: z.ZodObject<{
    toolId: z.ZodString;
    displayName: z.ZodString;
    available: z.ZodBoolean;
}, z.core.$strip>;
export type LocalUsageTool = z.infer<typeof LocalUsageToolSchema>;
export declare const LocalUsageRowSchema: z.ZodObject<{
    day: z.ZodString;
    toolId: z.ZodString;
    modelId: z.ZodString;
    inputTokens: z.ZodNumber;
    outputTokens: z.ZodNumber;
    cacheReadTokens: z.ZodNumber;
    cacheWriteTokens: z.ZodNumber;
    requests: z.ZodNumber;
}, z.core.$strict>;
export type LocalUsageRow = z.infer<typeof LocalUsageRowSchema>;
export declare const LocalUsageDataSchema: z.ZodObject<{
    enabled: z.ZodLiteral<true>;
    generatedAt: z.ZodNumber;
    lastScanAt: z.ZodNullable<z.ZodNumber>;
    scannedFiles: z.ZodNumber;
    tools: z.ZodArray<z.ZodObject<{
        toolId: z.ZodString;
        displayName: z.ZodString;
        available: z.ZodBoolean;
    }, z.core.$strip>>;
    rows: z.ZodArray<z.ZodObject<{
        day: z.ZodString;
        toolId: z.ZodString;
        modelId: z.ZodString;
        inputTokens: z.ZodNumber;
        outputTokens: z.ZodNumber;
        cacheReadTokens: z.ZodNumber;
        cacheWriteTokens: z.ZodNumber;
        requests: z.ZodNumber;
    }, z.core.$strict>>;
}, z.core.$strict>;
export type LocalUsageData = z.infer<typeof LocalUsageDataSchema>;
export declare const LocalUsageResponseSchema: z.ZodDiscriminatedUnion<[z.ZodObject<{
    enabled: z.ZodLiteral<true>;
    generatedAt: z.ZodNumber;
    lastScanAt: z.ZodNullable<z.ZodNumber>;
    scannedFiles: z.ZodNumber;
    tools: z.ZodArray<z.ZodObject<{
        toolId: z.ZodString;
        displayName: z.ZodString;
        available: z.ZodBoolean;
    }, z.core.$strip>>;
    rows: z.ZodArray<z.ZodObject<{
        day: z.ZodString;
        toolId: z.ZodString;
        modelId: z.ZodString;
        inputTokens: z.ZodNumber;
        outputTokens: z.ZodNumber;
        cacheReadTokens: z.ZodNumber;
        cacheWriteTokens: z.ZodNumber;
        requests: z.ZodNumber;
    }, z.core.$strict>>;
}, z.core.$strict>, z.ZodObject<{
    enabled: z.ZodLiteral<false>;
}, z.core.$strict>], "enabled">;
export type LocalUsageResponse = z.infer<typeof LocalUsageResponseSchema>;
export declare const LocalUsageScanResultSchema: z.ZodObject<{
    enabled: z.ZodBoolean;
    scannedAt: z.ZodNullable<z.ZodNumber>;
    files: z.ZodNumber;
    events: z.ZodNumber;
    skipped: z.ZodNumber;
}, z.core.$strict>;
export type LocalUsageScanResult = z.infer<typeof LocalUsageScanResultSchema>;
//# sourceMappingURL=local-monitor.d.ts.map