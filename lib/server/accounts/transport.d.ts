/**
 * Centralized transport seam for the account-monitor subsystem.
 *
 * All upstream HTTP goes through `requestJson`/`requestText`, which apply
 * timeouts, manual redirects, HTTP-status classification, content-type and
 * response-size guards. When the caller does not inject `deps.fetch`, the
 * DNS-pinned transport connects to the exact address the security policy
 * layer validated, closing DNS-rebinding gaps between check and connect.
 */
import { type TargetPolicy } from "./security.js";
import type { AccountDeps, CredentialResolver, FetchInitLike, FetchLike, FetchResponseLike } from "./types.js";
export declare const DEFAULT_TIMEOUT_MS = 15000;
export declare const MAX_RESPONSE_BYTES: number;
/** HTTP status → raw provider-status classification (accounts vocabulary). */
export declare function responseStatus(status: number): "unauthorized" | "rate-limited" | "unsupported" | "unavailable" | "invalid-response";
/** Resolve a credential ref through the Harness seam; "" when absent. */
export declare function resolveCredential(credentials: CredentialResolver | undefined, ref: unknown): Promise<string>;
/** Parse a JSON response body with content-type and size guards. */
export declare function parseJsonResponse(response: FetchResponseLike, maxBytes?: number): Promise<unknown>;
export declare function fetchWithPolicy(policy: TargetPolicy, deps: AccountDeps): FetchLike;
/** GET/POST a JSON document with timeout, redirect, status, and size guards. */
export declare function requestJson(url: string, init: FetchInitLike, deps?: AccountDeps, policy?: TargetPolicy): Promise<unknown>;
export declare function parseTextResponse(response: FetchResponseLike, maxBytes?: number): Promise<string>;
/** GET a text document (dashboard HTML/JS) with timeout and status guards. */
export declare function requestText(url: string, init: FetchInitLike, deps?: AccountDeps, policy?: TargetPolicy): Promise<string>;
/**
 * HTTPS/HTTP transport that pins the DNS answer checked by the policy layer.
 * Returns a Fetch-compatible response so adapters cannot tell the difference.
 */
export declare function pinnedFetch(rawUrl: string | URL, init: FetchInitLike | undefined, policy: TargetPolicy, deps: AccountDeps): Promise<FetchResponseLike>;
//# sourceMappingURL=transport.d.ts.map