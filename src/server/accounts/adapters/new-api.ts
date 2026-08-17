/**
 * New API relay adapter: token-scoped usage (`/api/usage/token/`) with an
 * explicit management fallback (`/api/user/self`) and quota-unit discovery
 * (`/api/status`).
 */

import { httpStatusOf, ProviderError } from "../errors.js";
import { booleanOrNull, nonEmptyString, numberOrNull, toIso } from "../normalize.js";
import { requestJson, resolveCredential } from "../transport.js";
import type { AccountAdapter, AdapterContext, RawAccountResult } from "../types.js";

function asRecord(value: unknown): Record<string, unknown> | undefined {
	return value !== null && typeof value === "object" && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: undefined;
}

interface QuotaUnit {
	readonly value: number;
	readonly fallback: boolean;
}

async function quotaPerUnit(ctx: AdapterContext): Promise<QuotaUnit> {
	try {
		const body = await requestJson(
			new URL("/api/status", ctx.spec.baseURL ?? "").href,
			{
				headers: { accept: "application/json" },
			},
			ctx.deps,
		);
		const value = numberOrNull(asRecord(asRecord(body)?.data)?.quota_per_unit);
		if (value !== null && value > 0) return { value, fallback: false };
		// Old status schemas did not expose quota_per_unit.
		return { value: 500000, fallback: true };
	} catch (error) {
		const status = httpStatusOf(error);
		if (status === 404 || status === 405) return { value: 500000, fallback: true };
		throw error;
	}
}

async function queryNewApiFallback(ctx: AdapterContext): Promise<RawAccountResult> {
	const ref = ctx.spec.monitor.fallbackCredentialRef;
	const token = await resolveCredential(ctx.credentials, ref);
	if (token === "") {
		return {
			status: "unsupported",
			balance: null,
			missingCredentials: ref === undefined ? [] : [ref],
		};
	}
	const headers: Record<string, string> = { authorization: `Bearer ${token}`, accept: "application/json" };
	const userId = await resolveCredential(ctx.credentials, ctx.spec.monitor.fallbackUserIdRef);
	if (userId !== "") headers["new-api-user"] = userId;
	const baseURL = ctx.spec.baseURL ?? "";
	const [body, quotaUnit] = await Promise.all([
		requestJson(new URL("/api/user/self", baseURL).href, { headers }, ctx.deps),
		quotaPerUnit(ctx),
	]);
	const unit = quotaUnit.value;
	const root = asRecord(body);
	const data = asRecord(root?.data);
	if (root?.success === false || data === undefined) {
		throw new ProviderError("invalid-response", "New API user response is invalid");
	}
	const remainingQuota = numberOrNull(data.quota);
	const usedQuota = numberOrNull(data.used_quota);
	if (remainingQuota === null) throw new ProviderError("invalid-response", "New API user response is missing quota");
	return {
		status: "ok",
		plan: nonEmptyString(data.group) ?? undefined,
		balance: {
			remaining: remainingQuota / unit,
			...(usedQuota === null ? {} : { used: usedQuota / unit, total: (remainingQuota + usedQuota) / unit }),
			currency: "USD",
			unlimited: false,
			expiresAt: null,
		},
	};
}

/** New API relay: token-scoped quota with explicit management fallback. */
export const newApiAdapter: AccountAdapter = {
	id: "new-api",
	mode: "balance",
	async collect(ctx) {
		let body: unknown;
		try {
			body = await requestJson(
				new URL("/api/usage/token/", ctx.spec.baseURL ?? "").href,
				{
					headers: { authorization: `Bearer ${ctx.credential}`, accept: "application/json" },
				},
				ctx.deps,
			);
		} catch (error) {
			const status = httpStatusOf(error);
			if (status === 404 || status === 405) return queryNewApiFallback(ctx);
			throw error;
		}
		const root = asRecord(body);
		const data = asRecord(root?.data);
		const success =
			root?.success === true || [true, 0, 200, "0", "200"].some((accepted) => Object.is(root?.code, accepted));
		if (!success || data === undefined) {
			throw new ProviderError("invalid-response", "New API token response is invalid");
		}
		const granted = numberOrNull(data.total_granted);
		const used = numberOrNull(data.total_used);
		const available = numberOrNull(data.total_available);
		const quotaUnit = await quotaPerUnit(ctx);
		const unit = quotaUnit.value;
		const unlimited = booleanOrNull(data.unlimited_quota) === true;
		if (!unlimited && available === null) {
			throw new ProviderError("invalid-response", "New API token response is missing total_available");
		}
		const expiresAt = numberOrNull(data.expires_at);
		return {
			status: "ok",
			plan: nonEmptyString(data.name) ?? undefined,
			balance: {
				remaining: available === null ? null : available / unit,
				...(used === null ? {} : { used: used / unit }),
				...(granted === null ? {} : { total: granted / unit }),
				currency: "USD",
				unlimited,
				expiresAt: expiresAt !== null && expiresAt > 0 ? toIso(data.expires_at) : null,
			},
		};
	},
};
