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

/* ------------------------------------------------------------------ *
 * Enums
 * ------------------------------------------------------------------ */

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
export const ProviderConnectionSchema = z.enum([
	"connected",
	"signing-in",
	"configured-failing",
	"configured-unknown",
	"unconfigured",
	"expired",
	"expiring",
	"unavailable",
	"unsupported",
]);
export type ProviderConnection = z.infer<typeof ProviderConnectionSchema>;

/**
 * How the provider is authenticated / where credentials come from.
 * - api-key:  a static API key
 * - oauth:    OAuth / device-code authorization
 * - local-cli: the operator's locally-authenticated CLI session
 * - mixed:    multiple sources combined
 * - none:     no authentication is required or configured
 */
export const AuthSourceSchema = z.enum(["api-key", "oauth", "local-cli", "mixed", "none"]);
export type AuthSource = z.infer<typeof AuthSourceSchema>;

/**
 * Lifecycle status of the credential/token used for monitoring.
 * - valid:            tokens are present and not near expiry
 * - expiring:         present but approaching expiry
 * - refresh-required: needs a refresh / re-authentication before use
 * - unknown:          lifecycle could not be determined
 * - none:             no token/credential involved
 */
export const TokenLifecycleSchema = z.enum(["valid", "expiring", "refresh-required", "unknown", "none"]);
export type TokenLifecycle = z.infer<typeof TokenLifecycleSchema>;

/**
 * Whether provider models are available to monitor.
 * - enabled:             at least one model is monitored (selected)
 * - available-not-enabled: models exist but none are selected for monitoring
 * - none:                no models are known/available
 * - unknown:             model availability could not be determined
 */
export const ModelStateSchema = z.enum(["enabled", "available-not-enabled", "none", "unknown"]);
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
export const QuotaStateSchema = z.enum(["available", "stale", "disabled", "unavailable", "not-supported", "unlinked"]);
export type QuotaState = z.infer<typeof QuotaStateSchema>;

/* ------------------------------------------------------------------ *
 * Bounded leaf schemas
 * ------------------------------------------------------------------ */

/** Max length of a human-readable label/message/warning string. */
const LABEL_MAX = 256;
/** Max length of a reference name (credential ref / route / adapter id). */
const REF_NAME_MAX = 128;
/** Max length of a single model id. */
const MODEL_ID_MAX = 128;
/** Max number of model ids retained in a summary. */
const MODEL_LIST_MAX = 64;
/** Max total characters across all warnings on a record. */
const _WARNINGS_TOTAL_MAX = 2048;

/** Sanitized provider id. Never contains a raw payload or credential value. */
const ProviderIdSchema = z.string().min(1).max(128);

/**
 * Metadata about a configured credential source.
 *
 * `ref` is the credential's reference *name* (the alias used to look it up) —
 * never the credential value and never an absolute filesystem path.
 * `value` is intentionally excluded from this schema so GET snapshots can
 * never carry credential material.
 */
export const ProviderCredentialMetaSchema = z
	.object({
		label: z.string().min(1).max(LABEL_MAX),
		ref: z.string().min(1).max(REF_NAME_MAX),
		configured: z.boolean(),
		source: AuthSourceSchema,
		// A credential is writable when the provider transport can update or
		// refresh it programmatically; read-only credentials are not writable.
		writable: z.boolean(),
	})
	.strict();
export type ProviderCredentialMeta = z.infer<typeof ProviderCredentialMetaSchema>;

/**
 * Aggregate model availability for one provider. Keeps only ids and counts so
 * no raw provider model payload is exposed. Cap is 64 ids to bound the size of
 * the summary both on the wire and when rendered.
 */
export const ProviderModelSummarySchema = z
	.object({
		availableCount: z.number().int().nonnegative(),
		selectedCount: z.number().int().nonnegative(),
		available: z.array(ProviderIdSchema.max(MODEL_ID_MAX)).max(MODEL_LIST_MAX),
		selected: z.array(ProviderIdSchema.max(MODEL_ID_MAX)).max(MODEL_LIST_MAX),
	})
	.strict();
export type ProviderModelSummary = z.infer<typeof ProviderModelSummarySchema>;

/** Micro-summary of quota freshness for one provider. */
export const ProviderQuotaSummarySchema = z
	.object({
		state: QuotaStateSchema,
		lastSuccessfulAt: z.number().int().nonnegative().nullable(),
		lastAttemptAt: z.number().int().nonnegative().nullable(),
		stale: z.boolean(),
		disabledReason: z.string().max(LABEL_MAX).nullable(),
	})
	.strict();
export type ProviderQuotaSummary = z.infer<typeof ProviderQuotaSummarySchema>;

/* ------------------------------------------------------------------ *
 * OAuth challenge schemas
 *
 * The GET snapshot (ProviderOAuthChallengeSnapshotSchema) exposes only the
 * sanitized fields needed to render/start the flow. The user code is added
 * only by the OAuth *action* response schema, which is a superset used when
 * the operator explicitly initiates a sign-in.
 * ------------------------------------------------------------------ */

/** Sanitized OAuth challenge — safe for GET snapshots. No user code. */
export const ProviderOAuthChallengeSnapshotSchema = z
	.object({
		method: z.enum(["device-code", "authorization-code"]),
		// Verification URL is always required to be HTTPS so the operator never
		// opens a non-secure endpoint to authorize.
		verificationUrl: z
			.string()
			.url()
			.refine((value) => value.startsWith("https://"), "verification URL must be HTTPS"),
		pollIntervalMs: z.number().int().positive().nullable(),
	})
	.strict();
export type ProviderOAuthChallengeSnapshot = z.infer<typeof ProviderOAuthChallengeSnapshotSchema>;

/**
 * OAuth challenge as returned by explicit action responses (e.g. after the
 * user begins a device sign-in). This is the only place the user code is
 * exposed; GET snapshots must use ProviderOAuthChallengeSnapshotSchema.
 */
export const ProviderOAuthChallengeActionSchema = ProviderOAuthChallengeSnapshotSchema.extend({
	userCode: z.string().min(1).max(128),
}).strict();
export type ProviderOAuthChallengeAction = z.infer<typeof ProviderOAuthChallengeActionSchema>;

/* ------------------------------------------------------------------ *
 * Provider record & summary
 * ------------------------------------------------------------------ */

/**
 * Full public record for one provider. `displayName` is the only free-form
 * human label; `id` and `route` are stable identifiers. Everything else is a
 * bounded enum or boolean to keep the snapshot compact and predictable.
 */
export const ProviderRecordSchema = z
	.object({
		id: ProviderIdSchema,
		displayName: z.string().min(1).max(LABEL_MAX),
		/** Stable route key used to address the adapter (never a filesystem path). */
		route: z.string().min(1).max(REF_NAME_MAX),
		connection: ProviderConnectionSchema,
		authSource: AuthSourceSchema,
		tokenLifecycle: TokenLifecycleSchema,
		modelState: ModelStateSchema,
		quotaState: QuotaStateSchema,
		capabilities: z
			.object({
				canRefresh: z.boolean(),
				canDisconnect: z.boolean(),
				supportsOAuth: z.boolean(),
				supportsModelSelection: z.boolean(),
				supportsQuota: z.boolean(),
			})
			.strict(),
		lastSuccessfulAt: z.number().int().nonnegative().nullable(),
		lastAttemptAt: z.number().int().nonnegative().nullable(),
		warnings: z.array(z.string().min(1).max(LABEL_MAX)).max(16),
	})
	.strict();
export type ProviderRecord = z.infer<typeof ProviderRecordSchema>;

/** Aggregate counts over the provider set. */
export const ProvidersSummarySchema = z
	.object({
		total: z.number().int().nonnegative(),
		connected: z.number().int().nonnegative(),
		needsAttention: z.number().int().nonnegative(),
		unconfigured: z.number().int().nonnegative(),
		withQuota: z.number().int().nonnegative(),
	})
	.strict();
export type ProvidersSummary = z.infer<typeof ProvidersSummarySchema>;

/**
 * Top-level wrapper returned by the provider-management API.
 *
 * `schemaVersion` is fixed at 1 and coordinated with ProvidersSummarySchema so
 * a client can detect incompatible protocol changes. Per the security contract
 * above, records never contain secrets, tokens, raw provider payloads, or
 * absolute credential paths.
 */
export const ProvidersDataSchema = z
	.object({
		schemaVersion: z.literal(1),
		summary: ProvidersSummarySchema,
		providers: z.array(ProviderRecordSchema),
	})
	.strict();
export type ProvidersData = z.infer<typeof ProvidersDataSchema>;
