/**
 * Shared internal types for the account-monitor subsystem.
 *
 * The subsystem keeps two shapes apart on purpose:
 *   - the raw provider result (`RawAccountResult`) uses the historical status
 *     vocabulary and percent-based quota windows produced by adapters;
 *   - the normalized snapshot (`AccountSnapshot` from `src/shared/domain.ts`)
 *     is the only shape that crosses the module boundary and is validated
 *     with zod before it is returned.
 *
 * Secrets never appear in either shape: adapters receive credential values
 * through the context and return only metadata (refs, plans, windows).
 */

/** Historical adapter status vocabulary (pre-normalization). */
export type ProviderStatus =
	| "ok"
	| "not-configured"
	| "unauthorized"
	| "rate-limited"
	| "unavailable"
	| "invalid-response"
	| "unsupported";

/** Raw percent-based quota window as produced by subscription adapters. */
export interface RawQuotaWindow {
	readonly kind: string;
	readonly usedPercent: number;
	readonly remainingPercent: number;
	readonly resetsAt?: string | undefined;
	readonly remaining?: number | undefined;
}

export interface RawBalanceBreakdown {
	readonly granted: number | null;
	readonly toppedUp: number | null;
}

/** Raw monetary balance as produced by balance adapters. */
export interface RawBalance {
	readonly remaining: number | null;
	readonly used?: number | undefined;
	readonly total?: number | undefined;
	readonly currency: string;
	readonly unlimited: boolean;
	readonly expiresAt: string | null;
	readonly available?: boolean | undefined;
	readonly breakdown?: RawBalanceBreakdown | undefined;
}

/** One adapter's raw collection result; normalized centrally. */
export interface RawAccountResult {
	readonly status: ProviderStatus;
	readonly mode?: "balance" | "subscription" | undefined;
	readonly plan?: string | undefined;
	readonly balance?: RawBalance | null | undefined;
	readonly windows?: readonly RawQuotaWindow[] | undefined;
	readonly missingCredentials?: readonly string[] | undefined;
	readonly region?: string | undefined;
	/** Secret-free failure reason for UI (e.g. missing-chatgpt-account-id). */
	readonly diagnosticCode?: string | undefined;
}

/** Harness credential seam: refs in, values out, never persisted here. */
export interface CredentialResolver {
	resolve(ref: string): Promise<{ value: string } | undefined>;
	set?(ref: string, value: string): Promise<void>;
}

/** Minimal provider descriptor bound to an adapter. */
export interface ProviderDescriptor {
	readonly id: string;
	readonly displayName?: string;
	readonly apiKeyEnv?: string;
	readonly baseURL?: string;
}

export interface FetchInitLike {
	readonly method?: string;
	readonly headers?: Record<string, string>;
	readonly body?: string;
	readonly signal?: AbortSignal;
	readonly redirect?: "manual" | "follow" | "error";
}

/** Structural subset of the Fetch `Response` used by this subsystem. */
export interface FetchResponseLike {
	readonly ok: boolean;
	readonly status: number;
	readonly headers?: { get?(name: string): string | null };
	json?(): Promise<unknown>;
	text?(): Promise<string>;
	arrayBuffer?(): Promise<ArrayBuffer>;
}

export type FetchLike = (url: string | URL, init?: FetchInitLike) => Promise<FetchResponseLike>;

export type DnsLookup = (
	hostname: string,
	options: { all: true; verbatim: true },
) => Promise<Array<{ address: string; family?: number }>>;

/** Injectable transport/environment dependencies (tests stub all of these). */
export interface AccountDeps {
	readonly fetch?: FetchLike;
	readonly oauthClientIds?: Readonly<Record<string, string>>;
	readonly targetPolicy?: {
		readonly allowInsecure?: boolean | undefined;
		readonly allowPrivateNetwork?: boolean | undefined;
		readonly allowCrossOrigin?: boolean | undefined;
		readonly enforceSameOrigin: boolean;
		readonly providerBaseURL?: string | undefined;
	};
	readonly lookup?: DnsLookup;
	readonly timeoutMs?: number;
	readonly maxResponseBytes?: number;
	readonly now?: () => number;
	readonly readFile?: (path: string, encoding: "utf8") => Promise<string>;
	readonly homedir?: () => string;
}

export interface WarningThresholds {
	readonly warnBelow?: number;
	readonly criticalBelow?: number;
}

export interface DeclarativeAuth {
	readonly type: "bearer" | "raw" | "x-api-key";
	readonly credentialRef?: string | undefined;
}

export interface DeclarativeRequest {
	readonly path: string;
	readonly method?: "GET";
	readonly auth?: DeclarativeAuth;
	readonly headers?: Record<string, string>;
}

/** JSON Pointer field mapping with an optional numeric divisor. */
export interface FieldMapping {
	readonly pointer: string;
	readonly divisor?: number;
}

export type ExtractField = string | FieldMapping;

export interface DeclarativeExtract {
	readonly root?: string;
	readonly valid?: ExtractField;
	readonly invalidMessage?: ExtractField;
	readonly plan?: ExtractField;
	readonly remaining?: ExtractField;
	readonly used?: ExtractField;
	readonly total?: ExtractField;
	readonly currency?: ExtractField;
	readonly currencyValue?: string;
	readonly unlimited?: ExtractField;
	readonly expiresAt?: ExtractField;
	readonly items?: ExtractField;
	readonly kind?: ExtractField;
	readonly usedPercent?: ExtractField;
	readonly remainingPercent?: ExtractField;
	readonly resetsAt?: ExtractField;
	readonly divisor?: number;
}

/** One credential profile under a provider monitor (optional multi-account). */
export interface MonitorProfileConfig {
	readonly id: string;
	readonly label?: string | undefined;
	readonly credentialRef?: string | undefined;
	readonly secretKeyRef?: string | undefined;
	readonly usageBaseURL?: string | undefined;
	readonly region?: string | undefined;
	readonly fallbackCredentialRef?: string | undefined;
	readonly fallbackUserIdRef?: string | undefined;
}

/** Non-secret per-provider monitor configuration (validated shape). */
export interface MonitorConfig {
	readonly providerId?: string | undefined;
	readonly adapter?: string | undefined;
	readonly mode?: "balance" | "subscription" | undefined;
	readonly credentialRef?: string | undefined;
	readonly secretKeyRef?: string | undefined;
	readonly usageBaseURL?: string | undefined;
	readonly allowInsecure?: boolean | undefined;
	readonly allowCrossOrigin?: boolean | undefined;
	readonly allowPrivateNetwork?: boolean | undefined;
	/** Explicit cookie / session opt-in for adapters that require it (e.g. ollama-cloud). */
	readonly allowCookieSession?: boolean | undefined;
	readonly region?: string | undefined;
	readonly warning?: WarningThresholds | undefined;
	readonly fallbackCredentialRef?: string | undefined;
	readonly fallbackUserIdRef?: string | undefined;
	readonly request?: DeclarativeRequest | undefined;
	readonly extract?: DeclarativeExtract | undefined;
	readonly profiles?: readonly MonitorProfileConfig[] | undefined;
}

export interface AccountConfig {
	readonly monitors: Record<string, MonitorConfig>;
}

/** One provider bound to its adapter and effective configuration. */
export interface AccountSpec {
	readonly id: string;
	/** Empty string = default / single-profile monitor. */
	readonly profileId: string;
	readonly displayName: string;
	readonly adapter: string | null;
	readonly mode: "balance" | "subscription" | null;
	readonly apiKeyRef?: string;
	readonly baseURL?: string;
	readonly providerBaseURL?: string;
	readonly monitor: MonitorConfig;
	readonly configKey: string;
}

/** Stable cache / repository identity for one account card. */
export function accountIdentityKey(providerId: string, profileId = ""): string {
	return profileId === "" ? providerId : `${providerId}\u0000${profileId}`;
}

/** Context handed to an adapter's `collect`. */
export interface AdapterContext {
	readonly spec: AccountSpec;
	readonly credentials: CredentialResolver | undefined;
	/** Transport deps; `fetch` is already policy-pinned when not injected. */
	readonly deps: AccountDeps;
	/** Millisecond epoch captured once per query. */
	readonly now: number;
	/** Primary credential value resolved centrally ("" when absent). */
	readonly credential: string;
}

/** Typed account adapter registered under a stable id. */
export interface AccountAdapter {
	readonly id: string;
	readonly mode: "balance" | "subscription";
	collect(ctx: AdapterContext): Promise<RawAccountResult>;
}
