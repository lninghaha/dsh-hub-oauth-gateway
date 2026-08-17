import type { CostEstimate, UsageAlert } from "../../shared/contracts.js";
import type { AccountSnapshot, QuotaWindow } from "../../shared/domain.js";
import type { UserPreferences } from "../../shared/preferences.js";

function remainingRatio(window: QuotaWindow): number | null {
	if (window.usedRatio !== null) return Math.max(0, Math.min(1, 1 - window.usedRatio));
	if (window.limit !== null && window.remaining !== null && window.limit > 0) {
		return Math.max(0, Math.min(1, window.remaining / window.limit));
	}
	return null;
}

export function evaluateUsageAlerts(
	accounts: readonly AccountSnapshot[],
	dailyCost: CostEstimate,
	preferences: UserPreferences,
	now = Date.now(),
): UsageAlert[] {
	if (!preferences.alerts.enabled) return [];
	const alerts: UsageAlert[] = [];
	const threshold = preferences.alerts.quotaRemainingRatio;
	for (const account of accounts) {
		if (account.configured && (account.status === "auth-error" || account.status === "error")) {
			alerts.push({
				id: `account:${account.providerId}:${account.status}`,
				kind: "account",
				level: account.status === "auth-error" ? "critical" : "warning",
				title: `${account.displayName}: ${account.status}`,
				providerId: account.providerId,
				value: null,
				threshold: null,
				createdAt: now,
			});
		}
		for (const window of account.windows) {
			const remaining = remainingRatio(window);
			if (remaining === null || remaining > threshold) continue;
			alerts.push({
				id: `quota:${account.providerId}:${window.kind}:${window.label}`,
				kind: "quota",
				level: remaining <= Math.min(0.05, threshold / 2) ? "critical" : "warning",
				title: `${account.displayName}: ${window.label}`,
				providerId: account.providerId,
				value: remaining,
				threshold,
				createdAt: now,
			});
		}
	}
	const costThreshold = preferences.alerts.dailyCostThreshold;
	if (costThreshold !== null && dailyCost.amount !== null && dailyCost.amount >= costThreshold) {
		alerts.push({
			id: `cost:daily:${dailyCost.currency}`,
			kind: "cost",
			level: dailyCost.amount >= costThreshold * 1.5 ? "critical" : "warning",
			title: `Daily estimated cost (${dailyCost.currency})`,
			providerId: null,
			value: dailyCost.amount,
			threshold: costThreshold,
			createdAt: now,
		});
	}
	return alerts.sort((left, right) => {
		const rank = { critical: 2, warning: 1, info: 0 } as const;
		return rank[right.level] - rank[left.level] || left.title.localeCompare(right.title);
	});
}
