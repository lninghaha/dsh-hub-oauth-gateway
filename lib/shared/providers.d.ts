import { z } from "zod";
/**
 * Shared schemas and types for the unified provider-management API.
 *
 * Security contract (applies to every GET snapshot regardless of adapter):
 * - GET snapshots NEVER include secrets, tokens, raw provider payloads, or
 *   absolute credential paths. Any such data is dropped before serialization.
 * - Credential metadata carries only booleans and the credential's reference
 *   *name* (the alias used by the provider adapter), never the credential
 *   value or its location on disk.
 * - OAuth challenge snapshots expose only the sanitized fields needed to drive
 *   the device/authorization-code flow (method + https verification URL). The
 *   user code is returned ONLY by explicit action responses (e.g. after the
 *   user starts a sign-in), never by GET snapshots.
 */
/**
 * High-level connectivity status of a provider's account connection.
 * - connected:       verification succeeded and is current
 * - signing-in:      an OAuth or device sign-in flow is in progress
 * - configured-failing: configured but recent verification failed
 * - configured-unknown: configured but no freshness information available
 * - unconfigured:    no credential / connection has been set up
 * - expired:         the token/credential has expired
 * - expiring:        still valid but near its expiry threshold
 * - unavailable:     the provider endpoint could not be reached
 * - unsupported:     the provider does not support programmatic monitoring
 */
export declare const ProviderConnectionSchema: z.ZodEnum<{
    unsupported: "unsupported";
    unavailable: "unavailable";
    "signing-in": "signing-in";
    expired: "expired";
    connected: "connected";
    "configured-failing": "configured-failing";
    "configured-unknown": "configured-unknown";
    unconfigured: "unconfigured";
    expiring: "expiring";
}>;
export type ProviderConnection = z.infer<typeof ProviderConnectionSchema>;
/**
 * How the provider is authenticated / where credentials come from.
 * - api-key:  a static API key
 * - oauth:    OAuth / device-code authorization
 * - local-cli: the operator's locally-authenticated CLI session
 * - mixed:    multiple sources combined
 * - none:     no authentication is required or configured
 */
export declare const AuthSourceSchema: z.ZodEnum<{
    none: "none";
    "api-key": "api-key";
    oauth: "oauth";
    "local-cli": "local-cli";
    mixed: "mixed";
}>;
export type AuthSource = z.infer<typeof AuthSourceSchema>;
/**
 * Lifecycle status of the credential/token used for monitoring.
 * - valid:            tokens are present and not near expiry
 * - expiring:         present but approaching expiry
 * - refresh-required: needs a refresh / re-authentication before use
 * - unknown:          lifecycle could not be determined
 * - none:             no token/credential involved
 */
export declare const TokenLifecycleSchema: z.ZodEnum<{
    unknown: "unknown";
    none: "none";
    valid: "valid";
    expiring: "expiring";
    "refresh-required": "refresh-required";
}>;
export type TokenLifecycle = z.infer<typeof TokenLifecycleSchema>;
/**
 * Whether provider models are available to monitor.
 * - enabled:             at least one model is monitored (selected)
 * - available-not-enabled: models exist but none are selected for monitoring
 * - none:                no models are known/available
 * - unknown:             model availability could not be determined
 */
export declare const ModelStateSchema: z.ZodEnum<{
    unknown: "unknown";
    none: "none";
    enabled: "enabled";
    "available-not-enabled": "available-not-enabled";
}>;
export type ModelState = z.infer<typeof ModelStateSchema>;
/**
 * Quality/freshness of the quota snapshot for a provider.
 * - available:     quota data present and fresh
 * - stale:         quota data present but outdated
 * - disabled:      quota monitoring is turned off for this provider
 * - unavailable:   quota could not be fetched for this provider
 * - not-supported: provider does not support snapshotting quota
 * - unlinked:      credential present but not linked to any quota source
 */
export declare const QuotaStateSchema: z.ZodEnum<{
    unavailable: "unavailable";
    stale: "stale";
    available: "available";
    disabled: "disabled";
    "not-supported": "not-supported";
    unlinked: "unlinked";
}>;
export type QuotaState = z.infer<typeof QuotaStateSchema>;
/**
 * Metadata about a configured credential source.
 *
 * `ref` is the credential's reference *name* (the alias used to look it up) —
 * never the credential value and never an absolute filesystem path.
 * `value` is intentionally excluded from this schema so GET snapshots can
 * never carry credential material.
 */
export declare const ProviderCredentialMetaSchema: z.ZodObject<{
    label: z.ZodString;
    ref: z.ZodString;
    configured: z.ZodBoolean;
    source: z.ZodEnum<{
        none: "none";
        "api-key": "api-key";
        oauth: "oauth";
        "local-cli": "local-cli";
        mixed: "mixed";
    }>;
    writable: z.ZodBoolean;
}, z.core.$strict>;
export type ProviderCredentialMeta = z.infer<typeof ProviderCredentialMetaSchema>;
/**
 * Aggregate model availability for one provider. Keeps only ids and counts so
 * no raw provider model payload is exposed. Cap is 64 ids to bound the size of
 * the summary both on the wire and when rendered.
 */
export declare const ProviderModelSummarySchema: z.ZodObject<{
    availableCount: z.ZodNumber;
    selectedCount: z.ZodNumber;
    available: z.ZodArray<z.ZodString>;
    selected: z.ZodArray<z.ZodString>;
}, z.core.$strict>;
export type ProviderModelSummary = z.infer<typeof ProviderModelSummarySchema>;
/** Micro-summary of quota freshness for one provider. */
export declare const ProviderQuotaSummarySchema: z.ZodObject<{
    state: z.ZodEnum<{
        unavailable: "unavailable";
        stale: "stale";
        available: "available";
        disabled: "disabled";
        "not-supported": "not-supported";
        unlinked: "unlinked";
    }>;
    lastSuccessfulAt: z.ZodNullable<z.ZodNumber>;
    lastAttemptAt: z.ZodNullable<z.ZodNumber>;
    stale: z.ZodBoolean;
    disabledReason: z.ZodNullable<z.ZodString>;
}, z.core.$strict>;
export type ProviderQuotaSummary = z.infer<typeof ProviderQuotaSummarySchema>;
/** Sanitized OAuth challenge — safe for GET snapshots. No user code. */
export declare const ProviderOAuthChallengeSnapshotSchema: z.ZodObject<{
    method: z.ZodEnum<{
        "device-code": "device-code";
        "authorization-code": "authorization-code";
    }>;
    verificationUrl: z.ZodString;
    pollIntervalMs: z.ZodNullable<z.ZodNumber>;
}, z.core.$strict>;
export type ProviderOAuthChallengeSnapshot = z.infer<typeof ProviderOAuthChallengeSnapshotSchema>;
/**
 * OAuth challenge as returned by explicit action responses (e.g. after the
 * user begins a device sign-in). This is the only place the user code is
 * exposed; GET snapshots must use ProviderOAuthChallengeSnapshotSchema.
 */
export declare const ProviderOAuthChallengeActionSchema: z.ZodObject<{
    method: z.ZodEnum<{
        "device-code": "device-code";
        "authorization-code": "authorization-code";
    }>;
    verificationUrl: z.ZodString;
    pollIntervalMs: z.ZodNullable<z.ZodNumber>;
    userCode: z.ZodString;
}, z.core.$strict>;
export type ProviderOAuthChallengeAction = z.infer<typeof ProviderOAuthChallengeActionSchema>;
/**
 * Full public record for one provider. `displayName` is the only free-form
 * human label; `id` and `route` are stable identifiers. Everything else is a
 * bounded enum or boolean to keep the snapshot compact and predictable.
 */
export declare const ProviderRecordSchema: z.ZodObject<{
    id: z.ZodString;
    displayName: z.ZodString;
    route: z.ZodString;
    connection: z.ZodEnum<{
        unsupported: "unsupported";
        unavailable: "unavailable";
        "signing-in": "signing-in";
        expired: "expired";
        connected: "connected";
        "configured-failing": "configured-failing";
        "configured-unknown": "configured-unknown";
        unconfigured: "unconfigured";
        expiring: "expiring";
    }>;
    authSource: z.ZodEnum<{
        none: "none";
        "api-key": "api-key";
        oauth: "oauth";
        "local-cli": "local-cli";
        mixed: "mixed";
    }>;
    tokenLifecycle: z.ZodEnum<{
        unknown: "unknown";
        none: "none";
        valid: "valid";
        expiring: "expiring";
        "refresh-required": "refresh-required";
    }>;
    modelState: z.ZodEnum<{
        unknown: "unknown";
        none: "none";
        enabled: "enabled";
        "available-not-enabled": "available-not-enabled";
    }>;
    quotaState: z.ZodEnum<{
        unavailable: "unavailable";
        stale: "stale";
        available: "available";
        disabled: "disabled";
        "not-supported": "not-supported";
        unlinked: "unlinked";
    }>;
    capabilities: z.ZodObject<{
        canRefresh: z.ZodBoolean;
        canDisconnect: z.ZodBoolean;
        supportsOAuth: z.ZodBoolean;
        supportsModelSelection: z.ZodBoolean;
        supportsQuota: z.ZodBoolean;
    }, z.core.$strict>;
    lastSuccessfulAt: z.ZodNullable<z.ZodNumber>;
    lastAttemptAt: z.ZodNullable<z.ZodNumber>;
    warnings: z.ZodArray<z.ZodString>;
}, z.core.$strict>;
export type ProviderRecord = z.infer<typeof ProviderRecordSchema>;
/** Aggregate counts over the provider set. */
export declare const ProvidersSummarySchema: z.ZodObject<{
    total: z.ZodNumber;
    connected: z.ZodNumber;
    needsAttention: z.ZodNumber;
    unconfigured: z.ZodNumber;
    withQuota: z.ZodNumber;
}, z.core.$strict>;
export type ProvidersSummary = z.infer<typeof ProvidersSummarySchema>;
/**
 * Top-level wrapper returned by the provider-management API.
 *
 * `schemaVersion` is fixed at 1 and coordinated with ProvidersSummarySchema so
 * a client can detect incompatible protocol changes. Per the security contract
 * above, records never contain secrets, tokens, raw provider payloads, or
 * absolute credential paths.
 */
export declare const ProvidersDataSchema: z.ZodObject<{
    schemaVersion: z.ZodLiteral<1>;
    summary: z.ZodObject<{
        total: z.ZodNumber;
        connected: z.ZodNumber;
        needsAttention: z.ZodNumber;
        unconfigured: z.ZodNumber;
        withQuota: z.ZodNumber;
    }, z.core.$strict>;
    providers: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        displayName: z.ZodString;
        route: z.ZodString;
        connection: z.ZodEnum<{
            unsupported: "unsupported";
            unavailable: "unavailable";
            "signing-in": "signing-in";
            expired: "expired";
            connected: "connected";
            "configured-failing": "configured-failing";
            "configured-unknown": "configured-unknown";
            unconfigured: "unconfigured";
            expiring: "expiring";
        }>;
        authSource: z.ZodEnum<{
            none: "none";
            "api-key": "api-key";
            oauth: "oauth";
            "local-cli": "local-cli";
            mixed: "mixed";
        }>;
        tokenLifecycle: z.ZodEnum<{
            unknown: "unknown";
            none: "none";
            valid: "valid";
            expiring: "expiring";
            "refresh-required": "refresh-required";
        }>;
        modelState: z.ZodEnum<{
            unknown: "unknown";
            none: "none";
            enabled: "enabled";
            "available-not-enabled": "available-not-enabled";
        }>;
        quotaState: z.ZodEnum<{
            unavailable: "unavailable";
            stale: "stale";
            available: "available";
            disabled: "disabled";
            "not-supported": "not-supported";
            unlinked: "unlinked";
        }>;
        capabilities: z.ZodObject<{
            canRefresh: z.ZodBoolean;
            canDisconnect: z.ZodBoolean;
            supportsOAuth: z.ZodBoolean;
            supportsModelSelection: z.ZodBoolean;
            supportsQuota: z.ZodBoolean;
        }, z.core.$strict>;
        lastSuccessfulAt: z.ZodNullable<z.ZodNumber>;
        lastAttemptAt: z.ZodNullable<z.ZodNumber>;
        warnings: z.ZodArray<z.ZodString>;
    }, z.core.$strict>>;
}, z.core.$strict>;
export type ProvidersData = z.infer<typeof ProvidersDataSchema>;
//# sourceMappingURL=providers.d.ts.map