import type { CostEstimate } from "../shared/contracts.js";
import type { UsageBuckets, UsageMetric } from "../shared/domain.js";
import { totalTokens } from "../shared/domain.js";

export function formatCompact(value: number): string {
	return new Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 1 }).format(value);
}

export function formatNumber(value: number): string {
	return new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(value);
}

export function formatCurrency(amount: number | null, currency: string): string {
	if (amount === null) return "—";
	try {
		return new Intl.NumberFormat(undefined, {
			style: "currency",
			currency,
			maximumFractionDigits: amount < 1 ? 4 : 2,
		}).format(amount);
	} catch {
		return `${formatNumber(amount)} ${currency}`;
	}
}

export function formatPercent(ratio: number | null): string {
	return ratio === null ? "—" : `${Math.round(ratio * 1_000) / 10}%`;
}

export function deltaRatio(current: number, previous: number | null): number | null {
	if (previous === null || previous === 0) return current === 0 ? 0 : null;
	return (current - previous) / previous;
}

export function metricValue(
	metric: UsageMetric,
	buckets: UsageBuckets,
	requests: number,
	cacheHitRate: number | null,
	cost: CostEstimate,
): number | null {
	switch (metric) {
		case "tokens":
			return totalTokens(buckets);
		case "requests":
			return requests;
		case "cacheHitRate":
			return cacheHitRate;
		case "estimatedCost":
			return cost.amount;
	}
}

export function formatMetric(metric: UsageMetric, value: number | null, currency = "USD"): string {
	if (value === null) return "—";
	switch (metric) {
		case "tokens":
		case "requests":
			return formatCompact(value);
		case "cacheHitRate":
			return formatPercent(value);
		case "estimatedCost":
			return formatCurrency(value, currency);
	}
}

export function formatDurationUntil(timestamp: number | null, now = Date.now()): string {
	if (timestamp === null) return "—";
	const seconds = Math.max(0, Math.ceil((timestamp - now) / 1_000));
	if (seconds < 60) return `${seconds}s`;
	const minutes = Math.ceil(seconds / 60);
	if (minutes < 60) return `${minutes}m`;
	const hours = Math.ceil(minutes / 60);
	if (hours < 48) return `${hours}h`;
	return `${Math.ceil(hours / 24)}d`;
}

export function formatRelativeTime(timestamp: number | null, now = Date.now()): string {
	if (timestamp === null) return "—";
	const seconds = Math.max(0, Math.round((now - timestamp) / 1_000));
	if (seconds < 60) return `${seconds}s`;
	const minutes = Math.round(seconds / 60);
	if (minutes < 60) return `${minutes}m`;
	const hours = Math.round(minutes / 60);
	if (hours < 48) return `${hours}h`;
	return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(timestamp);
}
