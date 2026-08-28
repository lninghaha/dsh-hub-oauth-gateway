/**
 * Optional multi-account pool for coding-oauth AuthDocument v2 stores.
 * Pure selection helpers plus a CredentialStore proxy that serves a sticky
 * per-request account without rewriting activeAccountId on disk.
 */
import type { Credential, CredentialInfo, CredentialStore, OAuthCredential } from "@earendil-works/pi-ai";
import type { QuotaWindow } from "../../shared/domain.js";
import type { OAuthCredentialFileStore } from "./store.js";
/** Pool scheduling mode. `off` keeps today's active-account-only behavior. */
export type PoolMode = "off" | "priority" | "quota_aware";
export interface PoolPick {
    readonly accountId: string;
    readonly reason: "off" | "priority" | "quota_aware" | "sticky" | "quota_full_fallback";
}
/** A member is taken out of primary rotation once any window crosses this fill. */
export declare const QUOTA_FULL_RATIO = 0.95;
/** Bound on sticky-session memory; oldest entries evict past it. */
export declare const STICKY_SESSION_LIMIT = 1000;
export interface AccountQuotaView {
    /** False when any window is ≥95% used. */
    readonly available: boolean;
    /**
     * Required burn rate (remaining ratio per ms). Higher = spend sooner.
     * Missing telemetry scores 0 (last resort among available peers).
     */
    readonly urgency: number;
}
export interface SelectAccountInput {
    readonly accounts: readonly string[];
    readonly activeId: string | undefined;
    readonly snapshotsByAccountId: ReadonlyMap<string, readonly QuotaWindow[] | undefined>;
    readonly stickyId: string | undefined;
    readonly strategy: Exclude<PoolMode, "off">;
    readonly switchMargin: number;
    readonly now?: number;
}
interface PoolOverride {
    readonly providerId: string;
    readonly accountId: string;
}
/**
 * Required burn rate across windows: remaining ratio / time-until-reset.
 * Windows at or above 95% used mark the account unavailable for primary rotation.
 * Empty / missing windows score urgency 0 (Copilot-style last resort).
 */
export declare function urgencyFromSnapshots(windows: readonly QuotaWindow[] | undefined, now?: number): AccountQuotaView;
/**
 * Pick one account for a request. Sticky hysteresis: a challenger must beat
 * the sticky member's urgency by `switchMargin` (multiplicative) to take over.
 * Quota-exhausted accounts stay as a last-resort tail in pool order.
 */
export declare function selectAccount(input: SelectAccountInput): PoolPick;
/** Full failover order for one request (sticky + strategy ranking). */
export declare function orderPoolAccounts(input: SelectAccountInput): PoolPick[];
/** Bounded sticky map: `sessionId|provider` → accountId. */
export declare class StickyAccountMap {
    #private;
    constructor(limit?: number);
    get(sessionId: string | undefined, providerId: string): string | undefined;
    set(sessionId: string | undefined, providerId: string, accountId: string): void;
    clear(): void;
    get size(): number;
}
/**
 * CredentialStore facade that returns a request-scoped account credential
 * while leaving the on-disk activeAccountId untouched.
 */
export declare class PoolCredentialProxy implements CredentialStore {
    readonly inner: OAuthCredentialFileStore;
    constructor(inner: OAuthCredentialFileStore);
    read(providerId: string): Promise<Credential | undefined>;
    list(): Promise<readonly CredentialInfo[]>;
    modify(providerId: string, fn: (current: Credential | undefined) => Promise<Credential | undefined>): Promise<Credential | undefined>;
    delete(providerId: string): Promise<void>;
}
/** Run `fn` with CredentialStore reads/writes scoped to one account. */
export declare function runWithPoolAccount<T>(providerId: string, accountId: string, fn: () => T): T;
/**
 * Drive an async iterable while keeping pool account overrides active for each
 * pull. Credential refresh during streaming therefore hits the same account.
 */
export declare function iterateWithPoolAccount<T>(providerId: string, accountId: string, source: AsyncIterable<T>): AsyncIterable<T>;
export declare function currentPoolAccountOverride(): PoolOverride | undefined;
export type GetQuotaWindowsContext = {
    readonly providerId: string;
};
export type GetQuotaWindows = (accountId: string, context?: GetQuotaWindowsContext) => readonly QuotaWindow[] | undefined | Promise<readonly QuotaWindow[] | undefined>;
export interface AccountPoolControllerOptions {
    readonly mode: PoolMode;
    readonly switchMargin: number;
    readonly getQuotaWindows?: GetQuotaWindows;
}
/**
 * Per-provider sticky selection + credential proxies for coding-oauth routes.
 * When mode is `off` or a provider has fewer than two accounts, reads fall
 * through to the active account only.
 */
export declare class AccountPoolController {
    #private;
    readonly sticky: StickyAccountMap;
    constructor(options: AccountPoolControllerOptions);
    get mode(): PoolMode;
    setQuotaWindowsSource(getQuotaWindows: GetQuotaWindows): void;
    wrap(store: OAuthCredentialFileStore): PoolCredentialProxy;
    /** Whether this provider should run multi-account selection for a request. */
    shouldPool(store: OAuthCredentialFileStore): Promise<boolean>;
    candidates(store: OAuthCredentialFileStore, providerId: string, sessionId: string | undefined): Promise<PoolPick[]>;
    remember(providerId: string, sessionId: string | undefined, accountId: string): void;
}
/** Clone helper for tests that need an oauth credential shape. */
export declare function asOAuthCredential(credential: Credential | undefined): OAuthCredential | undefined;
export {};
//# sourceMappingURL=quota-pool.d.ts.map