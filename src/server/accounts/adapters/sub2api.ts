/**
 * Sub2API relay adapter: wallet balances, quota-limited plans, and
 * subscription-style daily/weekly/monthly windows from `/v1/usage`.
 */

import { ProviderError } from "../errors.js";
import { nonEmptyString, numberOrNull, round1, toIso } from "../normalize.js";
import { requestJson } from "../transport.js";
import type { AccountAdapter, RawAccountResult, RawQuotaWindow } from "../types.js";

function asRecord(value: unknown): Record<string, unknown> | undefined {
	return value !== null && typeof value === "object" && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: undefined;
}

function amountWindow(
	kind: string,
	usedValue: unknown,
	limitValue: unknown,
	remainingValue: unknown,
	resetsAt: unknown,
): RawQuotaWindow | null {
	const limit = numberOrNull(limitValue);
	if (limit === null || limit <= 0) return null;
	const remaining = numberOrNull(remainingValue);
	const used = numberOrNull(usedValue) ?? (remaining === null ? null : limit - remaining);
	if (used === null) return null;
	const usedPercent = round1(Math.max(0, Math.min(100, (used / limit) * 100)));
	const reset = toIso(resetsAt);
	return {
		kind,
		usedPercent,
		remainingPercent: round1(100 - usedPercent),
		...(reset === null ? {} : { resetsAt: reset }),
	};
}

function sub2ApiWindowKind(value: unknown): string {
	const kind = nonEmptyString(value) ?? "quota";
	if (kind === "5h") return "session";
	if (kind === "1d") return "daily";
	if (kind === "7d") return "weekly";
	return kind;
}

function sub2ApiSubscription(body: Record<string, unknown>): RawAccountResult {
	const windows: RawQuotaWindow[] = [];
	if (body.mode === "quota_limited") {
		const quota = asRecord(body.quota);
		if (quota === undefined) throw new ProviderError("invalid-response", "Sub2API quota response is missing quota");
		const total = amountWindow("quota", quota.used, quota.limit, quota.remaining, body.expires_at);
		if (total !== null) windows.push(total);
		const rateLimits = Array.isArray(body.rate_limits) ? body.rate_limits : [];
		for (const raw of rateLimits) {
			const entry = asRecord(raw);
			if (entry === undefined) continue;
			const window = amountWindow(
				sub2ApiWindowKind(entry.window),
				entry.used,
				entry.limit,
				entry.remaining,
				entry.reset_at,
			);
			if (window !== null) windows.push(window);
		}
	} else {
		const subscription = asRecord(body.subscription);
		if (subscription === undefined) {
			throw new ProviderError("invalid-response", "Sub2API subscription response is missing subscription limits");
		}
		for (const period of ["daily", "weekly", "monthly"]) {
			const window = amountWindow(
				period,
				subscription[`${period}_usage_usd`],
				subscription[`${period}_limit_usd`],
				null,
				null,
			);
			if (window !== null) windows.push(window);
		}
	}
	if (windows.length === 0) {
		throw new ProviderError("invalid-response", "Sub2API response has no usable quota windows");
	}
	return {
		status: "ok",
		mode: "subscription",
		plan: nonEmptyString(body.planName) ?? nonEmptyString(body.plan_name) ?? "Sub2API",
		windows,
	};
}

/** Sub2API relay: wallet balance or quota/subscription windows. */
export const sub2ApiAdapter: AccountAdapter = {
	id: "sub2api",
	mode: "balance",
	async collect(ctx) {
		const body = await requestJson(
			new URL("/v1/usage", ctx.spec.baseURL ?? "").href,
			{
				headers: { authorization: `Bearer ${ctx.credential}`, accept: "application/json" },
			},
			ctx.deps,
		);
		const root = asRecord(body);
		if (root === undefined) throw new ProviderError("invalid-response", "Sub2API response must be an object");
		if (root.isValid === false || root.is_active === false) {
			throw new ProviderError("unauthorized", "Sub2API key is invalid");
		}
		if (root.mode === "quota_limited" || asRecord(root.subscription) !== undefined) {
			return sub2ApiSubscription(root);
		}
		const remaining = numberOrNull(root.balance ?? root.remaining);
		if (remaining === null) {
			throw new ProviderError("invalid-response", "Sub2API response is missing a numeric balance");
		}
		return {
			status: "ok",
			mode: "balance",
			plan: nonEmptyString(root.planName) ?? nonEmptyString(root.plan_name) ?? undefined,
			balance: {
				remaining,
				currency: nonEmptyString(root.unit) ?? "USD",
				unlimited: false,
				expiresAt: toIso(root.expires_at),
			},
		};
	},
};
