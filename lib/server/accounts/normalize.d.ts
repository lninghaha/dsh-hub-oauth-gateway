/**
 * Normalization primitives and the single mapping from raw adapter results
 * to the zod-validated `AccountSnapshot` domain shape.
 */
import { type AccountSnapshot, type AccountStatus, type BalanceSnapshot, type QuotaWindow } from "../../shared/domain.js";
import type { AccountSpec, ProviderStatus, RawAccountResult, RawBalance, RawQuotaWindow, WarningThresholds } from "./types.js";
export declare function nonEmptyString(value: unknown): string | null;
export declare function numberOrNull(value: unknown): number | null;
export declare function booleanOrNull(value: unknown): boolean | null;
export declare function round1(value: number): number;
export declare function clampPercent(value: unknown): number | null;
/** Coerce epoch seconds/ms or date-ish strings to an ISO timestamp. */
export declare function toIso(value: unknown): string | null;
/** Classify an arbitrary thrown value into the raw status vocabulary. */
export declare function statusOfError(error: unknown): ProviderStatus;
/** Map the raw adapter status vocabulary onto the domain `AccountStatus`. */
export declare function toDomainStatus(status: ProviderStatus): AccountStatus;
type DomainWindowKind = QuotaWindow["kind"];
/** Map free-form adapter window kinds onto the domain kind enum. */
export declare function toDomainWindowKind(kind: string): DomainWindowKind;
/** Map one raw percent window to a domain `QuotaWindow` (percent unit). */
export declare function toQuotaWindow(raw: RawQuotaWindow, id: string): QuotaWindow;
/** Map raw windows to domain windows, guaranteeing unique stable ids. */
export declare function toQuotaWindows(windows: readonly RawQuotaWindow[], providerId: string): QuotaWindow[];
/** Map a raw balance to the domain `BalanceSnapshot` (null-safe numerics). */
export declare function toBalanceSnapshot(raw: RawBalance): BalanceSnapshot;
export type AlertLevel = "normal" | "warning" | "critical" | "unknown";
export interface AccountAlert {
    readonly level: AlertLevel;
    readonly metric: "balance" | "remaining-percent";
    readonly value: number | null;
    readonly threshold?: number;
}
/** Balance alert honoring explicit warning thresholds, else ratio bands. */
export declare function balanceAlert(balance: RawBalance | null | undefined, warning?: WarningThresholds): AccountAlert;
/** Subscription alert: the worst remaining-percent across quota windows. */
export declare function subscriptionAlert(windows: readonly RawQuotaWindow[]): AccountAlert;
/** Encode an alert as the domain `warningCode` (null when nothing to flag). */
export declare function warningCodeOf(alert: AccountAlert): string | null;
/** Nearest reset among quota windows (epoch ms); prefers a future timestamp. */
export declare function nextResetAt(windows: readonly {
    resetsAt?: number | null;
}[], now?: number): number | null;
/**
 * Build the zod-validated domain snapshot for one adapter result. This is
 * the single place raw provider data crosses into the shared domain shape.
 */
export declare function buildAccountSnapshot(spec: AccountSpec, result: RawAccountResult, now: number): AccountSnapshot;
/** Snapshot for a failed query: no balance, no windows, status classified. */
export declare function buildErrorSnapshot(spec: AccountSpec, status: ProviderStatus, now: number): AccountSnapshot;
/** Snapshot for providers that have no usable adapter binding. */
export declare function unsupportedSnapshot(spec: AccountSpec | null | undefined, now: number): AccountSnapshot;
export {};
//# sourceMappingURL=normalize.d.ts.map