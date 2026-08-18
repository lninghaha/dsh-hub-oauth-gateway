/**
 * Coding-plan subscription adapters: Z.ai (GLM Coding Plan), Kimi For
 * Coding, and MiniMax Coding Plan, normalized into shared quota windows.
 */

import { clampPercent, numberOrNull, round1, statusOfError, toIso } from "../normalize.js";
import { requestJson, resolveCredential } from "../transport.js";
import type { AccountAdapter, RawQuotaWindow } from "../types.js";

const ZAI_HOSTS: Record<string, string> = {
	global: "https://api.z.ai",
	"bigmodel-cn": "https://open.bigmodel.cn",
};
const ZAI_QUOTA_PATH = "/api/monitor/usage/quota/limit";
const ZAI_SUBSCRIPTION_PATH = "/api/biz/subscription/list";
const KIMI_USAGE_URL = "https://api.kimi.com/coding/v1/usages";
const MINIMAX_HOSTS: Record<string, string> = {
	global: "https://api.minimax.io",
	cn: "https://api.minimaxi.com",
};
const MINIMAX_USAGE_PATH = "/v1/api/openplatform/coding_plan/remains";
const MINIMAX_TOKEN_PLAN_PATH = "/v1/token_plan/remains";

export const ZAI_API_KEY_REF = "ZAI_API_KEY";
export const ZAI_REGION_REF = "ZAI_API_REGION";
export const KIMI_API_KEY_REF = "KIMI_API_KEY";
export const MINIMAX_API_KEY_REF = "MINIMAX_API_KEY";
export const MINIMAX_REGION_REF = "MINIMAX_API_REGION";

function asRecord(value: unknown): Record<string, unknown> | undefined {
	return value !== null && typeof value === "object" && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: undefined;
}

function nonEmptyUrl(value: unknown, defaultPath: string): string | null {
	if (typeof value !== "string" || value.trim() === "") return null;
	try {
		const url = new URL(value);
		return url.pathname === "/" || url.pathname === "" ? new URL(defaultPath, url).href : url.href;
	} catch {
		return null;
	}
}

//#region z.ai coding plan
function zaiRegionOf(raw: unknown, fallback = "global"): string {
	const value = String(raw || fallback)
		.trim()
		.toLowerCase();
	return value === "bigmodel-cn" || value === "cn" || value.includes("bigmodel.cn") ? "bigmodel-cn" : "global";
}

function zaiWindowMinutes(limit: Record<string, unknown> | null | undefined): number | null {
	const unit = numberOrNull(limit?.unit);
	const number = numberOrNull(limit?.number);
	if (unit === null || number === null || number <= 0) return null;
	if (unit === 5) return number;
	if (unit === 3) return number * 60;
	if (unit === 1) return number * 24 * 60;
	if (unit === 6) return number * 7 * 24 * 60;
	return null;
}

function zaiUsedPercent(limit: Record<string, unknown> | null | undefined): number | null {
	const total = numberOrNull(limit?.usage);
	const remaining = numberOrNull(limit?.remaining);
	const current = numberOrNull(limit?.currentValue ?? limit?.current_value);
	if (total !== null && total > 0) {
		const used =
			remaining === null ? current : current === null ? total - remaining : Math.max(total - remaining, current);
		if (used !== null) return clampPercent((Math.max(0, Math.min(total, used)) / total) * 100);
	}
	return clampPercent(limit?.percentage ?? limit?.usedPercent ?? limit?.used_percent);
}

function displayPlan(value: unknown): string {
	return String(value ?? "")
		.trim()
		.replace(/[_-]+/g, " ")
		.replace(/\s+/g, " ")
		.replace(/\bglm\b/gi, "GLM")
		.replace(/\b\w/g, (char) => char.toUpperCase());
}

function zaiPlan(quota: unknown, subscription: unknown): string {
	const subscriptionData = asRecord(subscription)?.data;
	const row = Array.isArray(subscriptionData)
		? (subscriptionData.map(asRecord).find((entry) => entry !== undefined) ?? null)
		: null;
	for (const source of [row, asRecord(quota)?.data]) {
		const record = asRecord(source);
		if (record === undefined) continue;
		for (const key of [
			"product_name",
			"productName",
			"plan_name",
			"planName",
			"package_name",
			"packageName",
			"plan_type",
			"planType",
			"level",
		]) {
			const value = displayPlan(record[key]);
			if (value !== "") return value;
		}
	}
	return "GLM Coding Plan";
}

function zaiWindow(
	limit: Record<string, unknown>,
	kind: string,
	fallbackReset: string | null = null,
): RawQuotaWindow | null {
	const usedPercent = zaiUsedPercent(limit);
	if (usedPercent === null) return null;
	const resetsAt = toIso(limit.nextResetTime ?? limit.next_reset_time) ?? fallbackReset;
	const remaining = numberOrNull(limit.remaining);
	return {
		kind,
		usedPercent: round1(usedPercent),
		remainingPercent: round1(100 - usedPercent),
		...(resetsAt === null ? {} : { resetsAt }),
		...(remaining === null ? {} : { remaining }),
	};
}

function parseZai(quota: unknown, subscription: unknown): { plan: string; windows: RawQuotaWindow[] } {
	const quotaData = asRecord(asRecord(quota)?.data);
	const limits = (Array.isArray(quotaData?.limits) ? quotaData.limits : [])
		.map(asRecord)
		.filter((limit) => limit !== undefined);
	const tokenLimits = limits
		.filter(
			(limit) =>
				["TOKENS_LIMIT", "CREDIT_LIMIT"].includes(String(limit.type ?? limit.limit_type ?? "").toUpperCase()) &&
				zaiUsedPercent(limit) !== null,
		)
		.sort(
			(a, b) => (zaiWindowMinutes(a) ?? Number.MAX_SAFE_INTEGER) - (zaiWindowMinutes(b) ?? Number.MAX_SAFE_INTEGER),
		);
	const timeLimit =
		limits.find(
			(limit) =>
				String(limit.type ?? limit.limit_type ?? "").toUpperCase() === "TIME_LIMIT" && zaiUsedPercent(limit) !== null,
		) ?? null;
	const first = tokenLimits[0] ?? null;
	const session =
		tokenLimits.length >= 2
			? first
			: zaiWindowMinutes(first) !== null && (zaiWindowMinutes(first) ?? 0) <= 360
				? first
				: null;
	const weekly =
		tokenLimits.length >= 2 ? (tokenLimits[tokenLimits.length - 1] ?? null) : session === null ? first : null;
	const subscriptionData = asRecord(subscription)?.data;
	const subscriptionRow = Array.isArray(subscriptionData) ? asRecord(subscriptionData[0]) : undefined;
	const renewAt = toIso(subscriptionRow?.next_renew_time ?? subscriptionRow?.nextRenewTime);
	return {
		plan: zaiPlan(quota, subscription),
		windows: [
			session === null ? null : zaiWindow(session, "session"),
			weekly === null ? null : zaiWindow(weekly, "weekly"),
			timeLimit === null ? null : zaiWindow(timeLimit, "billing", renewAt),
		].filter((window): window is RawQuotaWindow => window !== null),
	};
}

/** Z.ai Coding Plan quota endpoints with a normal API key. */
export const zaiTokenPlanAdapter: AccountAdapter = {
	id: "zai-token-plan",
	mode: "subscription",
	async collect(ctx) {
		const apiKeyRef = ctx.spec.apiKeyRef ?? ZAI_API_KEY_REF;
		const [apiKey, configuredRegion] = await Promise.all([
			resolveCredential(ctx.credentials, apiKeyRef),
			resolveCredential(ctx.credentials, ZAI_REGION_REF),
		]);
		const regionFallback =
			ctx.spec.monitor.region ?? (String(ctx.spec.baseURL ?? "").includes("bigmodel.cn") ? "bigmodel-cn" : "global");
		const region = zaiRegionOf(configuredRegion, regionFallback);
		if (apiKey === "") {
			return {
				status: "not-configured",
				plan: "GLM Coding Plan",
				region,
				missingCredentials: [apiKeyRef],
				windows: [],
			};
		}
		const host = ZAI_HOSTS[region] ?? ZAI_HOSTS.global ?? "https://api.z.ai";
		// The Coding Plan endpoint expects the raw API key, unlike the inference API.
		const init = { headers: { authorization: apiKey, accept: "application/json" } };
		const officialTarget = { providerBaseURL: host, enforceSameOrigin: true } as const;
		try {
			const quota = await requestJson(`${host}${ZAI_QUOTA_PATH}`, init, ctx.deps, officialTarget);
			let subscription: unknown = null;
			try {
				subscription = await requestJson(`${host}${ZAI_SUBSCRIPTION_PATH}`, init, ctx.deps, officialTarget);
			} catch {
				/* Plan label/reset metadata is optional when quota succeeded. */
			}
			const parsed = parseZai(quota, subscription);
			return {
				status: parsed.windows.length > 0 ? "ok" : "invalid-response",
				plan: parsed.plan,
				region,
				windows: parsed.windows,
			};
		} catch (error) {
			return { status: statusOfError(error), plan: "GLM Coding Plan", region, windows: [] };
		}
	},
};
//#endregion

//#region kimi token plan
function limitWindow(value: unknown, kind: string): RawQuotaWindow | null {
	const source = asRecord(value);
	if (source === undefined) return null;
	const limit = numberOrNull(source.limit ?? source.total);
	const remaining = numberOrNull(source.remaining);
	if (limit === null || remaining === null || limit <= 0) return null;
	const usedPercent = round1(clampPercent(((limit - remaining) / limit) * 100) ?? 0);
	const resetsAt = toIso(source.resetTime ?? source.reset_time ?? source.resetsAt);
	return {
		kind,
		usedPercent,
		remainingPercent: round1(100 - usedPercent),
		...(resetsAt === null ? {} : { resetsAt }),
	};
}

function parseKimi(body: unknown): { plan: string; windows: RawQuotaWindow[] } {
	const data = asRecord(asRecord(body)?.data) ?? asRecord(body);
	const limits = Array.isArray(data?.limits) ? data.limits : [];
	const session =
		limits.map((entry) => limitWindow(asRecord(entry)?.detail ?? entry, "session")).find((window) => window !== null) ??
		null;
	const weekly = limitWindow(data?.usage, "weekly");
	return {
		plan: String(data?.plan ?? data?.planName ?? "Kimi For Coding"),
		windows: [session, weekly].filter((window): window is RawQuotaWindow => window !== null),
	};
}

/** Kimi For Coding usage windows. */
export const kimiTokenPlanAdapter: AccountAdapter = {
	id: "kimi-token-plan",
	mode: "subscription",
	async collect(ctx) {
		const apiKeyRef = ctx.spec.apiKeyRef ?? KIMI_API_KEY_REF;
		const apiKey = await resolveCredential(ctx.credentials, apiKeyRef);
		if (apiKey === "") {
			return {
				status: "not-configured",
				plan: "Kimi For Coding",
				missingCredentials: [apiKeyRef],
				windows: [],
				diagnosticCode: "missing-credential",
			};
		}
		try {
			const configured = nonEmptyUrl(ctx.spec.monitor.usageBaseURL, "/coding/v1/usages");
			const usageUrl = configured ?? KIMI_USAGE_URL;
			const body = await requestJson(
				usageUrl,
				{
					headers: { authorization: `Bearer ${apiKey}`, accept: "application/json" },
				},
				ctx.deps,
				configured === null ? { providerBaseURL: KIMI_USAGE_URL, enforceSameOrigin: true } : undefined,
			);
			const parsed = parseKimi(body);
			if (parsed.windows.length === 0) {
				return { status: "invalid-response", ...parsed, diagnosticCode: "invalid-response" };
			}
			return { status: "ok", ...parsed };
		} catch (error) {
			const status = statusOfError(error);
			return {
				status,
				plan: "Kimi For Coding",
				windows: [],
				diagnosticCode: status === "unauthorized" ? "auth-error" : status,
			};
		}
	},
};
//#endregion

//#region minimax token plan
function minimaxRegionOf(raw: unknown, baseURL: unknown): string {
	const value = String(raw ?? "")
		.trim()
		.toLowerCase();
	if (value === "cn" || value.includes("minimaxi.com") || String(baseURL ?? "").includes("minimaxi.com")) return "cn";
	return "global";
}

function resetFromDuration(value: unknown, now: number): string | null {
	const milliseconds = numberOrNull(value);
	if (milliseconds === null || milliseconds < 0) return null;
	const date = new Date(now + milliseconds);
	return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function minimaxPercent(value: unknown): number | null {
	const parsed = numberOrNull(value);
	return parsed !== null && parsed >= 0 && parsed <= 100 ? parsed : null;
}

interface ParsedMiniMax {
	readonly windows: RawQuotaWindow[];
	readonly businessStatusCode: number | null;
}

function parseMiniMax(body: unknown, now: number): ParsedMiniMax {
	const root = asRecord(body);
	const businessStatusCode = numberOrNull(
		asRecord(root?.base_resp)?.status_code ?? asRecord(root?.baseResp)?.statusCode,
	);
	if (businessStatusCode !== null && businessStatusCode !== 0) return { windows: [], businessStatusCode };
	const rootRemains = root?.model_remains;
	const dataRemains = asRecord(root?.data)?.model_remains;
	const remains = (Array.isArray(rootRemains) ? rootRemains : Array.isArray(dataRemains) ? dataRemains : [])
		.map(asRecord)
		.filter((entry) => entry !== undefined);
	const general =
		remains.find((entry) => String(entry.model_name ?? entry.modelName ?? "").toLowerCase() === "general") ??
		remains.find((entry) => {
			const name = String(entry.model_name ?? entry.modelName ?? "").toLowerCase();
			return (
				!name.includes("video") &&
				(minimaxPercent(entry.current_interval_remaining_percent ?? entry.currentIntervalRemainingPercent) !== null ||
					minimaxPercent(entry.current_weekly_remaining_percent ?? entry.currentWeeklyRemainingPercent) !== null)
			);
		});
	if (general === undefined) return { windows: [], businessStatusCode };
	const intervalRemaining = minimaxPercent(
		general.current_interval_remaining_percent ?? general.currentIntervalRemainingPercent,
	);
	const weeklyRemaining = minimaxPercent(
		general.current_weekly_remaining_percent ?? general.currentWeeklyRemainingPercent,
	);
	const weeklyStatus = numberOrNull(general.current_weekly_status ?? general.currentWeeklyStatus);
	const sessionReset =
		toIso(
			general.current_interval_end_time ??
				general.currentIntervalEndTime ??
				general.current_interval_reset_time ??
				general.end_time ??
				general.endTime,
		) ?? resetFromDuration(general.remains_time ?? general.remainsTime, now);
	const weeklyReset =
		toIso(
			general.current_weekly_end_time ??
				general.currentWeeklyEndTime ??
				general.current_weekly_reset_time ??
				general.weekly_end_time ??
				general.weeklyEndTime,
		) ?? resetFromDuration(general.weekly_remains_time ?? general.weeklyRemainsTime, now);
	const windows: RawQuotaWindow[] = [];
	if (intervalRemaining !== null) {
		windows.push({
			kind: "session",
			usedPercent: round1(100 - intervalRemaining),
			remainingPercent: round1(intervalRemaining),
			...(sessionReset === null ? {} : { resetsAt: sessionReset }),
		});
	}
	if (weeklyStatus === 1 && weeklyRemaining !== null) {
		windows.push({
			kind: "weekly",
			usedPercent: round1(100 - weeklyRemaining),
			remainingPercent: round1(weeklyRemaining),
			...(weeklyReset === null ? {} : { resetsAt: weeklyReset }),
		});
	}
	return { windows, businessStatusCode };
}

/** MiniMax Coding Plan: token-plan endpoint with a fail-closed first-party legacy fallback. */
export const minimaxTokenPlanAdapter: AccountAdapter = {
	id: "minimax-token-plan",
	mode: "subscription",
	async collect(ctx) {
		const apiKeyRef = ctx.spec.apiKeyRef ?? MINIMAX_API_KEY_REF;
		const [apiKey, configuredRegion] = await Promise.all([
			resolveCredential(ctx.credentials, apiKeyRef),
			resolveCredential(ctx.credentials, MINIMAX_REGION_REF),
		]);
		const regionHint =
			ctx.spec.monitor.region ??
			(String(ctx.spec.baseURL ?? "").includes("minimaxi.com") ? "cn" : undefined) ??
			configuredRegion;
		const region = minimaxRegionOf(regionHint === "" ? undefined : regionHint, ctx.spec.monitor.usageBaseURL);
		if (apiKey === "") {
			return {
				status: "not-configured",
				plan: "MiniMax Coding Plan",
				region,
				missingCredentials: [apiKeyRef],
				windows: [],
			};
		}
		const configuredUrl = nonEmptyUrl(ctx.spec.monitor.usageBaseURL, MINIMAX_TOKEN_PLAN_PATH);
		const urls =
			configuredUrl === null
				? [
						`${MINIMAX_HOSTS[region] ?? ""}${MINIMAX_TOKEN_PLAN_PATH}`,
						`${MINIMAX_HOSTS[region] ?? ""}${MINIMAX_USAGE_PATH}`,
					]
				: [configuredUrl];
		try {
			for (const [index, url] of urls.entries()) {
				const body = await requestJson(
					url,
					{
						headers: { authorization: `Bearer ${apiKey}`, accept: "application/json" },
					},
					ctx.deps,
					configuredUrl === null ? { providerBaseURL: url, enforceSameOrigin: true } : undefined,
				);
				const parsed = parseMiniMax(body, ctx.now);
				if (parsed.windows.length > 0) {
					return { status: "ok", plan: "MiniMax Coding Plan", region, windows: parsed.windows };
				}
				if (parsed.businessStatusCode !== 0 || index === urls.length - 1) {
					return { status: "invalid-response", plan: "MiniMax Coding Plan", region, windows: [] };
				}
			}
			return { status: "invalid-response", plan: "MiniMax Coding Plan", region, windows: [] };
		} catch (error) {
			return { status: statusOfError(error), plan: "MiniMax Coding Plan", region, windows: [] };
		}
	},
};
//#endregion

//#region z.ai team plan
export const ZAI_TEAM_API_KEY_REF = "ZAI_TEAM_API_KEY";
const ZAI_TEAM_HOST = "https://open.bigmodel.cn";

/**
 * Z.ai / GLM Team Plan quota (`type=2`). Intentionally separate from
 * `zai-token-plan`: personal keys must not silently fall back to team limits.
 */
export const zaiTeamPlanAdapter: AccountAdapter = {
	id: "zai-team-plan",
	mode: "subscription",
	async collect(ctx) {
		const apiKeyRef = ctx.spec.apiKeyRef ?? ctx.spec.monitor.credentialRef ?? ZAI_TEAM_API_KEY_REF;
		const apiKey = await resolveCredential(ctx.credentials, apiKeyRef);
		if (apiKey === "") {
			return {
				status: "not-configured",
				plan: "GLM Team",
				missingCredentials: [apiKeyRef],
				windows: [],
			};
		}
		const configured = nonEmptyUrl(ctx.spec.monitor.usageBaseURL, ZAI_QUOTA_PATH);
		const host = configured === null ? ZAI_TEAM_HOST : new URL(configured).origin;
		const quotaUrl = `${host}${ZAI_QUOTA_PATH}?type=2`;
		const init = { headers: { authorization: apiKey, accept: "application/json" } };
		const officialTarget = { providerBaseURL: host, enforceSameOrigin: true } as const;
		try {
			const quota = await requestJson(quotaUrl, init, ctx.deps, officialTarget);
			let subscription: unknown = null;
			try {
				subscription = await requestJson(`${host}${ZAI_SUBSCRIPTION_PATH}`, init, ctx.deps, officialTarget);
			} catch {
				/* optional */
			}
			const parsed = parseZai(quota, subscription);
			return {
				status: parsed.windows.length > 0 ? "ok" : "invalid-response",
				plan: parsed.plan === "GLM Coding Plan" ? "GLM Team" : parsed.plan,
				region: "bigmodel-cn",
				windows: parsed.windows,
			};
		} catch (error) {
			return { status: statusOfError(error), plan: "GLM Team", region: "bigmodel-cn", windows: [] };
		}
	},
};
//#endregion
