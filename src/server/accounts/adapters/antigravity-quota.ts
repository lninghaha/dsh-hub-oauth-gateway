/**
 * Optional Antigravity quota probe. Does not perform OAuth or spawn binaries;
 * requires an explicit credentialRef (and optional usageBaseURL) from the
 * operator / external `dsh-agy` plugin.
 */

import { statusOfError } from "../normalize.js";
import { requestJson, resolveCredential } from "../transport.js";
import type { AccountAdapter } from "../types.js";
import { declarativeAdapter } from "./declarative.js";

export const ANTIGRAVITY_CREDENTIAL_REF = "ANTIGRAVITY_ACCESS_TOKEN";

/**
 * Opt-in Antigravity read-only quota. Without credential + usageBaseURL the
 * adapter stays `not-configured` (external plugin owns login).
 */
export const antigravityQuotaAdapter: AccountAdapter = {
	id: "antigravity-quota",
	mode: "subscription",
	async collect(ctx) {
		const apiKeyRef = ctx.spec.apiKeyRef ?? ctx.spec.monitor.credentialRef ?? ANTIGRAVITY_CREDENTIAL_REF;
		const token = await resolveCredential(ctx.credentials, apiKeyRef);
		const usageBaseURL = ctx.spec.monitor.usageBaseURL;
		if (token === "" || usageBaseURL === undefined) {
			return {
				status: "not-configured",
				plan: "Antigravity",
				missingCredentials: token === "" ? [apiKeyRef] : [],
				windows: [],
			};
		}
		if (ctx.spec.monitor.request !== undefined && ctx.spec.monitor.extract !== undefined) {
			return declarativeAdapter.collect(ctx);
		}
		try {
			const body = await requestJson(
				usageBaseURL,
				{ headers: { authorization: `Bearer ${token}`, accept: "application/json" } },
				ctx.deps,
				{ providerBaseURL: usageBaseURL, enforceSameOrigin: true },
			);
			const record =
				body !== null && typeof body === "object" && !Array.isArray(body)
					? (body as Record<string, unknown>)
					: undefined;
			const items = Array.isArray(record?.windows)
				? record.windows
				: Array.isArray(record?.limits)
					? record.limits
					: [];
			if (items.length === 0) {
				return { status: "invalid-response", plan: "Antigravity", windows: [] };
			}
			const windows = items
				.map((item, index) => {
					if (item === null || typeof item !== "object" || Array.isArray(item)) return null;
					const row = item as Record<string, unknown>;
					const usedPercent = Number(row.usedPercent ?? row.used_percent ?? row.percentage);
					if (!Number.isFinite(usedPercent)) return null;
					const kind = String(row.kind ?? (index === 0 ? "session" : "weekly"));
					return {
						kind,
						usedPercent,
						remainingPercent: Math.max(0, 100 - usedPercent),
					};
				})
				.filter((window): window is { kind: string; usedPercent: number; remainingPercent: number } => window !== null);
			return {
				status: windows.length > 0 ? "ok" : "invalid-response",
				plan: "Antigravity",
				windows,
			};
		} catch (error) {
			return { status: statusOfError(error), plan: "Antigravity", windows: [] };
		}
	},
};
