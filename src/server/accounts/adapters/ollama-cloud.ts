/**
 * Optional Ollama Cloud session/weekly quota via cookie credential.
 * Requires explicit `allowCookieSession: true` and a pinned `ollama.com` host.
 */

import { clampPercent, numberOrNull, round1, statusOfError, toIso } from "../normalize.js";
import { requestJson, resolveCredential } from "../transport.js";
import type { AccountAdapter, RawQuotaWindow } from "../types.js";

export const OLLAMA_CLOUD_COOKIE_REF = "OLLAMA_CLOUD_SESSION";
export const OLLAMA_CLOUD_HOST = "https://ollama.com";
const SETTINGS_PATH = "/api/v1/users/settings";

function asRecord(value: unknown): Record<string, unknown> | undefined {
	return value !== null && typeof value === "object" && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: undefined;
}

function windowOf(kind: string, source: unknown): RawQuotaWindow | null {
	const record = asRecord(source);
	if (record === undefined) return null;
	const usedPercent = clampPercent(record.usedPercent ?? record.used_percent ?? record.percentage);
	if (usedPercent === null) {
		const total = numberOrNull(record.limit ?? record.total);
		const remaining = numberOrNull(record.remaining);
		if (total === null || total <= 0 || remaining === null) return null;
		const computed = clampPercent(((total - remaining) / total) * 100);
		if (computed === null) return null;
		const resetsAt = toIso(record.resetsAt ?? record.reset_at ?? record.resetTime);
		return {
			kind,
			usedPercent: round1(computed),
			remainingPercent: round1(100 - computed),
			...(resetsAt === null ? {} : { resetsAt }),
			remaining,
		};
	}
	const resetsAt = toIso(record.resetsAt ?? record.reset_at ?? record.resetTime);
	return {
		kind,
		usedPercent: round1(usedPercent),
		remainingPercent: round1(100 - usedPercent),
		...(resetsAt === null ? {} : { resetsAt }),
	};
}

export function parseOllamaCloud(body: unknown): { plan: string; windows: RawQuotaWindow[] } {
	const root = asRecord(body);
	const data = asRecord(root?.data) ?? root;
	const usage = asRecord(data?.usage ?? data?.limits ?? data?.quota) ?? data;
	return {
		plan: String(data?.plan ?? data?.planName ?? "Ollama Cloud").trim() || "Ollama Cloud",
		windows: [
			windowOf("session", usage?.session ?? usage?.Session),
			windowOf("weekly", usage?.weekly ?? usage?.Weekly),
		].filter((window): window is RawQuotaWindow => window !== null),
	};
}

export const ollamaCloudAdapter: AccountAdapter = {
	id: "ollama-cloud",
	mode: "subscription",
	async collect(ctx) {
		if (ctx.spec.monitor.allowCookieSession !== true) {
			return {
				status: "not-configured",
				plan: "Ollama Cloud",
				windows: [],
				missingCredentials: [],
			};
		}
		const cookieRef = ctx.spec.apiKeyRef ?? ctx.spec.monitor.credentialRef ?? OLLAMA_CLOUD_COOKIE_REF;
		const cookie = await resolveCredential(ctx.credentials, cookieRef);
		if (cookie === "") {
			return {
				status: "not-configured",
				plan: "Ollama Cloud",
				missingCredentials: [cookieRef],
				windows: [],
			};
		}
		const configured = ctx.spec.monitor.usageBaseURL;
		let origin = OLLAMA_CLOUD_HOST;
		let url = `${OLLAMA_CLOUD_HOST}${SETTINGS_PATH}`;
		if (configured !== undefined) {
			try {
				const parsed = new URL(configured);
				if (parsed.hostname !== "ollama.com" && !parsed.hostname.endsWith(".ollama.com")) {
					return { status: "unavailable", plan: "Ollama Cloud", windows: [] };
				}
				origin = parsed.origin;
				url = parsed.pathname === "/" || parsed.pathname === "" ? `${origin}${SETTINGS_PATH}` : parsed.href;
			} catch {
				return { status: "invalid-response", plan: "Ollama Cloud", windows: [] };
			}
		}
		try {
			const body = await requestJson(
				url,
				{ headers: { accept: "application/json", cookie } },
				ctx.deps,
				{ providerBaseURL: origin, enforceSameOrigin: true },
			);
			const parsed = parseOllamaCloud(body);
			return {
				status: parsed.windows.length > 0 ? "ok" : "invalid-response",
				plan: parsed.plan,
				windows: parsed.windows,
			};
		} catch (error) {
			return { status: statusOfError(error), plan: "Ollama Cloud", windows: [] };
		}
	},
};
