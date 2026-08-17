/**
 * Normalization primitives and the single mapping from raw adapter results
 * to the zod-validated `AccountSnapshot` domain shape.
 */

import {
	type AccountSnapshot,
	AccountSnapshotSchema,
	type AccountStatus,
	type BalanceSnapshot,
	type QuotaWindow,
} from "../../shared/domain.js";
import type {
	AccountSpec,
	ProviderStatus,
	RawAccountResult,
	RawBalance,
	RawQuotaWindow,
	WarningThresholds,
} from "./types.js";

export function nonEmptyString(value: unknown): string | null {
	return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

export function numberOrNull(value: unknown): number | null {
	if (typeof value === "number" && Number.isFinite(value)) return value;
	if (typeof value === "string" && value.trim() !== "") {
		const parsed = Number(value);
		if (Number.isFinite(parsed)) return parsed;
	}
	return null;
}

export function booleanOrNull(value: unknown): boolean | null {
	if (typeof value === "boolean") return value;
	if (value === 1 || value === "1" || value === "true") return true;
	if (value === 0 || value === "0" || value === "false") return false;
	return null;
}

export function round1(value: number): number {
	return Math.round(value * 10) / 10;
}

export function clampPercent(value: unknown): number | null {
	const parsed = numberOrNull(value);
	return parsed === null ? null : Math.max(0, Math.min(100, parsed));
}

/** Coerce epoch seconds/ms or date-ish strings to an ISO timestamp. */
export function toIso(value: unknown): string | null {
	if (value === null || value === undefined || value === "") return null;
	if (typeof value === "number" && Number.isFinite(value)) {
		const date = new Date(value < 20000000000 ? value * 1000 : value);
		return Number.isNaN(date.getTime()) ? null : date.toISOString();
	}
	const date = new Date(String(value));
	return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

const PROVIDER_STATUSES: ReadonlySet<string> = new Set([
	"ok",
	"not-configured",
	"unauthorized",
	"rate-limited",
	"unavailable",
	"invalid-response",
	"unsupported",
]);

interface StatusCarrier {
	providerStatus?: unknown;
	name?: unknown;
}

/** Classify an arbitrary thrown value into the raw status vocabulary. */
export function statusOfError(error: unknown): ProviderStatus {
	const carrier = error as StatusCarrier | null;
	if (typeof carrier?.providerStatus === "string" && PROVIDER_STATUSES.has(carrier.providerStatus)) {
		return carrier.providerStatus as ProviderStatus;
	}
	if (carrier?.name === "TimeoutError" || carrier?.name === "AbortError") return "unavailable";
	if (error instanceof SyntaxError) return "invalid-response";
	return "unavailable";
}

/** Map the raw adapter status vocabulary onto the domain `AccountStatus`. */
export function toDomainStatus(status: ProviderStatus): AccountStatus {
	switch (status) {
		case "ok":
			return "ok";
		case "not-configured":
			return "not-configured";
		case "unsupported":
			return "unsupported";
		case "unauthorized":
			return "auth-error";
		case "rate-limited":
			return "rate-limited";
		case "invalid-response":
			return "error";
		default:
			return "unavailable";
	}
}

type DomainWindowKind = QuotaWindow["kind"];

/** Map free-form adapter window kinds onto the domain kind enum. */
export function toDomainWindowKind(kind: string): DomainWindowKind {
	switch (kind) {
		case "session":
			return "session";
		case "daily":
			return "daily";
		case "weekly":
			return "weekly";
		case "monthly":
		case "billing":
			return "monthly";
		case "rolling":
			return "rolling";
		default:
			return "custom";
	}
}

function windowLabel(kind: string, domain: DomainWindowKind): string {
	if (domain !== "custom") return domain.charAt(0).toUpperCase() + domain.slice(1);
	const cleaned = kind.replace(/[_-]+/g, " ").trim();
	return cleaned === "" ? "Custom" : cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

/** Map one raw percent window to a domain `QuotaWindow` (percent unit). */
export function toQuotaWindow(raw: RawQuotaWindow, id: string): QuotaWindow {
	const domain = toDomainWindowKind(raw.kind);
	const usedPercent = Math.max(0, Math.min(100, raw.usedPercent));
	const remainingPercent = Math.max(0, Math.min(100, raw.remainingPercent));
	const resetsAt = toIso(raw.resetsAt);
	return {
		id,
		kind: domain,
		label: windowLabel(raw.kind, domain),
		unit: "percent",
		used: round1(usedPercent),
		remaining: round1(remainingPercent),
		limit: 100,
		usedRatio: Math.max(0, Math.min(1, Math.round(usedPercent) / 100)),
		resetsAt: resetsAt === null ? null : Date.parse(resetsAt),
		rolling: domain === "session" || domain === "rolling",
	};
}

/** Map raw windows to domain windows, guaranteeing unique stable ids. */
export function toQuotaWindows(windows: readonly RawQuotaWindow[], providerId: string): QuotaWindow[] {
	const seen = new Map<string, number>();
	return windows.map((raw) => {
		const base = `${providerId}:${raw.kind}`;
		const ordinal = seen.get(base) ?? 0;
		seen.set(base, ordinal + 1);
		return toQuotaWindow(raw, ordinal === 0 ? base : `${base}:${ordinal}`);
	});
}

/** Map a raw balance to the domain `BalanceSnapshot` (null-safe numerics). */
export function toBalanceSnapshot(raw: RawBalance): BalanceSnapshot {
	const used = raw.used !== undefined && raw.used >= 0 ? raw.used : null;
	const limit = raw.total !== undefined && raw.total > 0 ? raw.total : null;
	return {
		remaining: raw.remaining,
		used,
		limit,
		currency: nonEmptyString(raw.currency) ?? "USD",
		unlimited: raw.unlimited,
	};
}

export type AlertLevel = "normal" | "warning" | "critical" | "unknown";

export interface AccountAlert {
	readonly level: AlertLevel;
	readonly metric: "balance" | "remaining-percent";
	readonly value: number | null;
	readonly threshold?: number;
}

/** Balance alert honoring explicit warning thresholds, else ratio bands. */
export function balanceAlert(balance: RawBalance | null | undefined, warning?: WarningThresholds): AccountAlert {
	const remaining = numberOrNull(balance?.remaining);
	const warnBelow = numberOrNull(warning?.warnBelow);
	const criticalBelow = numberOrNull(warning?.criticalBelow);
	if (remaining !== null && (warnBelow !== null || criticalBelow !== null)) {
		if (criticalBelow !== null && remaining <= criticalBelow) {
			return { level: "critical", metric: "balance", value: remaining, threshold: criticalBelow };
		}
		if (warnBelow !== null && remaining <= warnBelow) {
			return { level: "warning", metric: "balance", value: remaining, threshold: warnBelow };
		}
		return { level: "normal", metric: "balance", value: remaining };
	}
	const total = numberOrNull(balance?.total);
	if (remaining !== null && total !== null && total > 0) {
		const value = round1(Math.max(0, Math.min(100, (remaining / total) * 100)));
		return { level: value <= 10 ? "critical" : value <= 30 ? "warning" : "normal", metric: "remaining-percent", value };
	}
	return { level: "unknown", metric: "balance", value: remaining };
}

/** Subscription alert: the worst remaining-percent across quota windows. */
export function subscriptionAlert(windows: readonly RawQuotaWindow[]): AccountAlert {
	const remaining = windows
		.map((entry) => numberOrNull(entry.remainingPercent))
		.filter((value): value is number => value !== null);
	if (remaining.length === 0) return { level: "unknown", metric: "remaining-percent", value: null };
	const value = round1(Math.min(...remaining));
	return { level: value <= 10 ? "critical" : value <= 30 ? "warning" : "normal", metric: "remaining-percent", value };
}

/** Encode an alert as the domain `warningCode` (null when nothing to flag). */
export function warningCodeOf(alert: AccountAlert): string | null {
	if (alert.level === "warning" || alert.level === "critical") return `${alert.level}:${alert.metric}`;
	return null;
}

/** Nearest reset among quota windows (epoch ms); prefers a future timestamp. */
export function nextResetAt(windows: readonly { resetsAt?: number | null }[], now = Date.now()): number | null {
	if (!Array.isArray(windows)) return null;
	const times: number[] = [];
	for (const window of windows) {
		const value = window?.resetsAt;
		if (typeof value === "number" && Number.isFinite(value) && value >= 0) times.push(value);
	}
	if (times.length === 0) return null;
	const future = times.filter((value) => value > now);
	return future.length > 0 ? Math.min(...future) : Math.min(...times);
}

function alertForResult(spec: AccountSpec, result: RawAccountResult, mode: "balance" | "subscription"): AccountAlert {
	if (mode === "subscription") return subscriptionAlert(result.windows ?? []);
	return balanceAlert(result.balance, spec.monitor.warning);
}

/**
 * Build the zod-validated domain snapshot for one adapter result. This is
 * the single place raw provider data crosses into the shared domain shape.
 */
export function buildAccountSnapshot(spec: AccountSpec, result: RawAccountResult, now: number): AccountSnapshot {
	const mode = result.mode ?? spec.mode ?? "balance";
	const windows = mode === "subscription" ? toQuotaWindows(result.windows ?? [], spec.id) : [];
	const balance = mode !== "subscription" && result.balance != null ? toBalanceSnapshot(result.balance) : null;
	const alert = alertForResult(spec, result, mode);
	return AccountSnapshotSchema.parse({
		providerId: spec.id,
		displayName: spec.displayName,
		adapterId: spec.adapter,
		mode,
		status: toDomainStatus(result.status),
		configured: result.status !== "not-configured",
		fetchedAt: Math.max(0, Math.trunc(now)),
		stale: false,
		plan: nonEmptyString(result.plan) ?? null,
		balance,
		windows,
		missingCredentials: [...(result.missingCredentials ?? [])],
		warningCode: warningCodeOf(alert),
	});
}

/** Snapshot for a failed query: no balance, no windows, status classified. */
export function buildErrorSnapshot(spec: AccountSpec, status: ProviderStatus, now: number): AccountSnapshot {
	return buildAccountSnapshot(spec, { status, balance: null, windows: [] }, now);
}

const FALLBACK_SPEC: AccountSpec = {
	id: "unknown",
	displayName: "Unknown",
	adapter: null,
	mode: "balance",
	monitor: {},
	configKey: "{}",
};

/** Snapshot for providers that have no usable adapter binding. */
export function unsupportedSnapshot(spec: AccountSpec | null | undefined, now: number): AccountSnapshot {
	return buildErrorSnapshot(spec ?? FALLBACK_SPEC, "unsupported", now);
}
