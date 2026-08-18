/**
 * Volcengine / Ark Coding Plan quota via signed OpenAPI `GetCodingPlanUsage`.
 * Does not probe chat completions (avoids consuming plan quota for monitoring).
 */

import { createHash, createHmac } from "node:crypto";
import { clampPercent, numberOrNull, round1, statusOfError, toIso } from "../normalize.js";
import { requestJson, resolveCredential } from "../transport.js";
import type { AccountAdapter, RawQuotaWindow } from "../types.js";

export const VOLCENGINE_ACCESS_KEY_REF = "VOLCENGINE_ACCESS_KEY";
export const VOLCENGINE_SECRET_KEY_REF = "VOLCENGINE_SECRET_KEY";
export const VOLCENGINE_API_HOST = "https://open.volcengineapi.com";
export const VOLCENGINE_SERVICE = "ark";
export const VOLCENGINE_REGION_DEFAULT = "cn-beijing";
export const VOLCENGINE_ACTION = "GetCodingPlanUsage";
export const VOLCENGINE_VERSION = "2024-06-01";

function asRecord(value: unknown): Record<string, unknown> | undefined {
	return value !== null && typeof value === "object" && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: undefined;
}

function sha256Hex(value: string | Buffer): string {
	return createHash("sha256").update(value).digest("hex");
}

function hmac(key: Buffer | string, value: string): Buffer {
	return createHmac("sha256", key).update(value, "utf8").digest();
}

function amzDateParts(now: number): { amzDate: string; shortDate: string } {
	const iso = new Date(now).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
	return { amzDate: iso, shortDate: iso.slice(0, 8) };
}

/** Build Volcengine Signature V4 headers for a GET OpenAPI call (testable). */
export function signVolcengineGet(options: {
	readonly accessKey: string;
	readonly secretKey: string;
	readonly host: string;
	readonly region: string;
	readonly service: string;
	readonly canonicalQuery: string;
	readonly now: number;
}): { readonly authorization: string; readonly amzDate: string; readonly signedHeaders: string } {
	const { amzDate, shortDate } = amzDateParts(options.now);
	const host = options.host.replace(/^https?:\/\//, "").replace(/\/$/, "");
	const signedHeaders = "host;x-date";
	const canonicalHeaders = `host:${host}\nx-date:${amzDate}\n`;
	const payloadHash = sha256Hex("");
	const canonicalRequest = ["GET", "/", options.canonicalQuery, canonicalHeaders, signedHeaders, payloadHash].join(
		"\n",
	);
	const credentialScope = `${shortDate}/${options.region}/${options.service}/request`;
	const stringToSign = ["HMAC-SHA256", amzDate, credentialScope, sha256Hex(canonicalRequest)].join("\n");
	const kDate = hmac(options.secretKey, shortDate);
	const kRegion = hmac(kDate, options.region);
	const kService = hmac(kRegion, options.service);
	const kSigning = hmac(kService, "request");
	const signature = createHmac("sha256", kSigning).update(stringToSign, "utf8").digest("hex");
	const authorization = `HMAC-SHA256 Credential=${options.accessKey}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
	return { authorization, amzDate, signedHeaders };
}

export function volcengineCanonicalQuery(action = VOLCENGINE_ACTION, version = VOLCENGINE_VERSION): string {
	const params = new URLSearchParams({ Action: action, Version: version });
	return [...params.entries()]
		.sort(([a], [b]) => a.localeCompare(b))
		.map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
		.join("&");
}

function windowFromUsage(kind: string, source: unknown): RawQuotaWindow | null {
	const record = asRecord(source);
	if (record === undefined) return null;
	const total = numberOrNull(record.Total ?? record.total ?? record.Limit ?? record.limit ?? record.usage);
	const remaining = numberOrNull(record.Remaining ?? record.remaining);
	const used = numberOrNull(record.Used ?? record.used ?? record.currentValue ?? record.Current);
	let usedPercent: number | null = null;
	if (total !== null && total > 0) {
		const consumed =
			used !== null ? used : remaining === null ? null : Math.max(0, Math.min(total, total - remaining));
		if (consumed !== null) usedPercent = clampPercent((consumed / total) * 100);
	}
	if (usedPercent === null) usedPercent = clampPercent(record.UsedPercent ?? record.usedPercent ?? record.percentage);
	if (usedPercent === null) return null;
	const resetsAt = toIso(record.ResetsAt ?? record.resetsAt ?? record.NextResetTime ?? record.nextResetTime);
	return {
		kind,
		usedPercent: round1(usedPercent),
		remainingPercent: round1(100 - usedPercent),
		...(resetsAt === null ? {} : { resetsAt }),
		...(remaining === null ? {} : { remaining }),
	};
}

/** Parse GetCodingPlanUsage Result into subscription windows (fixture-friendly). */
export function parseVolcengineCodingPlan(body: unknown): { plan: string; windows: RawQuotaWindow[] } {
	const root = asRecord(body);
	const result = asRecord(root?.Result ?? root?.result) ?? root;
	const usage = asRecord(result?.Usage ?? result?.usage ?? result?.CodingPlanUsage ?? result?.codingPlanUsage) ?? result;
	const plan = String(result?.PlanName ?? result?.planName ?? result?.Plan ?? result?.plan ?? "Volcengine Coding Plan")
		.trim()
		.replace(/\s+/g, " ");
	const windows = [
		windowFromUsage("session", usage?.Session ?? usage?.session ?? usage?.SessionUsage),
		windowFromUsage("weekly", usage?.Weekly ?? usage?.weekly ?? usage?.WeekUsage),
		windowFromUsage("monthly", usage?.Monthly ?? usage?.monthly ?? usage?.MonthUsage ?? usage?.Billing),
	].filter((window): window is RawQuotaWindow => window !== null);
	return { plan: plan === "" ? "Volcengine Coding Plan" : plan, windows };
}

export const volcengineCodingPlanAdapter: AccountAdapter = {
	id: "volcengine-coding-plan",
	mode: "subscription",
	async collect(ctx) {
		const accessKeyRef = ctx.spec.apiKeyRef ?? ctx.spec.monitor.credentialRef ?? VOLCENGINE_ACCESS_KEY_REF;
		const secretKeyRef = ctx.spec.monitor.secretKeyRef ?? VOLCENGINE_SECRET_KEY_REF;
		const [accessKey, secretKey] = await Promise.all([
			resolveCredential(ctx.credentials, accessKeyRef),
			resolveCredential(ctx.credentials, secretKeyRef),
		]);
		const region = String(ctx.spec.monitor.region ?? VOLCENGINE_REGION_DEFAULT).trim() || VOLCENGINE_REGION_DEFAULT;
		const missing: string[] = [];
		if (accessKey === "") missing.push(accessKeyRef);
		if (secretKey === "") missing.push(secretKeyRef);
		if (missing.length > 0) {
			return { status: "not-configured", plan: "Volcengine Coding Plan", region, missingCredentials: missing, windows: [] };
		}
		const hostUrl = ctx.spec.monitor.usageBaseURL ?? VOLCENGINE_API_HOST;
		let hostOrigin: string;
		try {
			hostOrigin = new URL(hostUrl).origin;
		} catch {
			return { status: "invalid-response", plan: "Volcengine Coding Plan", region, windows: [] };
		}
		const query = volcengineCanonicalQuery();
		const signed = signVolcengineGet({
			accessKey,
			secretKey,
			host: hostOrigin,
			region,
			service: VOLCENGINE_SERVICE,
			canonicalQuery: query,
			now: ctx.now,
		});
		try {
			const body = await requestJson(
				`${hostOrigin}/?${query}`,
				{
					method: "GET",
					headers: {
						accept: "application/json",
						authorization: signed.authorization,
						"x-date": signed.amzDate,
					},
				},
				ctx.deps,
				{ providerBaseURL: hostOrigin, enforceSameOrigin: true },
			);
			const parsed = parseVolcengineCodingPlan(body);
			return {
				status: parsed.windows.length > 0 ? "ok" : "invalid-response",
				plan: parsed.plan,
				region,
				windows: parsed.windows,
			};
		} catch (error) {
			return { status: statusOfError(error), plan: "Volcengine Coding Plan", region, windows: [] };
		}
	},
};
