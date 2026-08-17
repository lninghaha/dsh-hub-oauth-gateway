/**
 * OpenCode Go subscription adapter.
 *
 * OpenCode Go's documented provider API does not include usage, but its
 * first-party client exposes an undocumented Bearer-key endpoint. The adapter
 * prefers that simpler path, can reuse OpenCode's local auth.json, and keeps
 * the authenticated workspace dashboard as a compatibility fallback.
 */

import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { clampPercent, numberOrNull, round1, statusOfError, toIso } from "../normalize.js";
import { requestJson, requestText, resolveCredential } from "../transport.js";
import type { AccountAdapter, AdapterContext, ProviderStatus, RawAccountResult, RawQuotaWindow } from "../types.js";

const OPENCODE_GO_URL = "https://opencode.ai";
const OPENCODE_GO_USAGE_URL = `${OPENCODE_GO_URL}/zen/go/v1/usage`;

export const OPENCODE_GO_API_KEY_REF = "OPENCODE_GO_API_KEY";
const OPENCODE_GO_COOKIE_REF = "OPENCODE_GO_AUTH_COOKIE";
const OPENCODE_GO_WORKSPACE_REF = "OPENCODE_GO_WORKSPACE_ID";

function asRecord(value: unknown): Record<string, unknown> | undefined {
	return value !== null && typeof value === "object" && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: undefined;
}

function sanitizeCookie(raw: unknown): string {
	let value = String(raw ?? "")
		.trim()
		.replace(/^cookie\s*:\s*/i, "");
	value = value
		.split(";")
		.map((part) => part.trim())
		.filter(Boolean)
		.join("; ");
	return value !== "" && !value.includes("=") ? `auth=${value}` : value;
}

function workspaceIdOf(raw: unknown): string {
	return String(raw ?? "").match(/wrk_[A-Za-z0-9]+/)?.[0] ?? "";
}

function looksSignedOut(text: unknown): boolean {
	const lower = String(text).toLowerCase();
	return (
		lower.includes("sign in") ||
		lower.includes("login") ||
		lower.includes("auth/authorize") ||
		lower.includes('actor of type "public"')
	);
}

function goWindowFromObject(value: unknown, kind: string, now: number): RawQuotaWindow | null {
	const source = asRecord(value);
	if (source === undefined) return null;
	const percentSource =
		source.usagePercent ?? source.usedPercent ?? source.percentUsed ?? source.percentage ?? source.percent;
	let usedPercent = clampPercent(percentSource);
	if (usedPercent === null) {
		const used = numberOrNull(source.used ?? source.consumed);
		const limit = numberOrNull(source.limit ?? source.total ?? source.quota);
		if (used !== null && limit !== null && limit > 0) usedPercent = clampPercent((used / limit) * 100);
	}
	if (usedPercent === null) return null;
	// The dashboard embeds usagePercent as a 0..1 ratio. The Bearer endpoint's
	// `percent` is already 0..100, so only scale ratio-named dashboard fields.
	if (usedPercent <= 1 && usedPercent >= 0 && source.percent === undefined && percentSource !== undefined) {
		usedPercent *= 100;
	}
	const resetSeconds = numberOrNull(source.resetInSec ?? source.resetInSeconds ?? source.resetSeconds);
	const resetsAt =
		resetSeconds === null
			? toIso(source.resetAt ?? source.resetsAt ?? source.nextReset)
			: new Date(now + Math.max(0, resetSeconds) * 1000).toISOString();
	return {
		kind,
		usedPercent: round1(clampPercent(usedPercent) ?? 0),
		remainingPercent: round1(100 - (clampPercent(usedPercent) ?? 0)),
		...(resetsAt === null ? {} : { resetsAt }),
	};
}

function parseOpenCodeGoApi(body: unknown, now: number): RawQuotaWindow[] {
	const usage = asRecord(asRecord(body)?.usage) ?? asRecord(body);
	if (usage === undefined) return [];
	return [
		goWindowFromObject(usage.rolling, "session", now),
		goWindowFromObject(usage.weekly, "weekly", now),
		goWindowFromObject(usage.monthly, "monthly", now),
	].filter((window): window is RawQuotaWindow => window !== null);
}

function findObject(root: unknown, keyword: string, depth = 0): Record<string, unknown> | null {
	const source = asRecord(root);
	if (source === undefined || depth > 5) return null;
	for (const [key, value] of Object.entries(source)) {
		if (key.toLowerCase().includes(keyword) && asRecord(value) !== undefined) return asRecord(value) ?? null;
	}
	for (const value of Object.values(source)) {
		const found = findObject(value, keyword, depth + 1);
		if (found !== null) return found;
	}
	return null;
}

function goWindowFromText(text: string, key: string, kind: string, now: number): RawQuotaWindow | null {
	const percent = new RegExp(`${key}[^}]*?usagePercent\\s*[:=]\\s*([0-9]+(?:\\.[0-9]+)?)`, "i").exec(text);
	if (percent === null || percent[1] === undefined) return null;
	const reset = new RegExp(`${key}[^}]*?resetInSec\\s*[:=]\\s*([0-9]+)`, "i").exec(text);
	const usedPercent = round1(clampPercent(Number(percent[1])) ?? 0);
	return {
		kind,
		usedPercent,
		remainingPercent: round1(100 - usedPercent),
		...(reset === null || reset[1] === undefined
			? {}
			: { resetsAt: new Date(now + Number(reset[1]) * 1000).toISOString() }),
	};
}

function parseOpenCodeGo(text: string, now: number): RawQuotaWindow[] {
	let windows: RawQuotaWindow[] = [];
	try {
		const root: unknown = JSON.parse(text);
		windows = [
			goWindowFromObject(findObject(root, "rolling"), "session", now),
			goWindowFromObject(findObject(root, "weekly") ?? findObject(root, "week"), "weekly", now),
			goWindowFromObject(findObject(root, "monthly") ?? findObject(root, "month"), "monthly", now),
		].filter((window): window is RawQuotaWindow => window !== null);
	} catch {
		/* The dashboard may embed text/javascript rather than strict JSON. */
	}
	if (!windows.some((window) => window.kind === "session") || !windows.some((window) => window.kind === "weekly")) {
		windows = [
			goWindowFromText(text, "rollingUsage", "session", now),
			goWindowFromText(text, "weeklyUsage", "weekly", now),
			goWindowFromText(text, "monthlyUsage", "monthly", now),
		].filter((window): window is RawQuotaWindow => window !== null);
	}
	return windows.some((window) => window.kind === "session") && windows.some((window) => window.kind === "weekly")
		? windows
		: [];
}

async function localOpenCodeApiKey(ctx: AdapterContext): Promise<string> {
	try {
		const home = typeof ctx.deps.homedir === "function" ? ctx.deps.homedir() : homedir();
		const load = ctx.deps.readFile ?? ((path: string, encoding: "utf8") => readFile(path, encoding));
		const raw: unknown = JSON.parse(await load(join(home, ".local", "share", "opencode", "auth.json"), "utf8"));
		const root = asRecord(raw);
		const entry = asRecord(root?.["opencode-go"]) ?? asRecord(root?.opencode);
		return entry?.type === "api" && typeof entry.key === "string" ? entry.key.trim() : "";
	} catch {
		return "";
	}
}

async function collectFromDashboard(
	cookie: string,
	workspaceId: string,
	ctx: AdapterContext,
): Promise<{ status: ProviderStatus; windows: RawQuotaWindow[] }> {
	try {
		const text = await requestText(
			`${OPENCODE_GO_URL}/workspace/${workspaceId}/go`,
			{
				headers: {
					cookie,
					accept: "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8",
				},
			},
			ctx.deps,
		);
		if (looksSignedOut(text)) return { status: "unauthorized", windows: [] };
		const windows = parseOpenCodeGo(text, ctx.now);
		return { status: windows.length > 0 ? "ok" : "invalid-response", windows };
	} catch (error) {
		return { status: statusOfError(error), windows: [] };
	}
}

function goResult(
	status: ProviderStatus,
	windows: RawQuotaWindow[],
	extra: Partial<RawAccountResult> = {},
): RawAccountResult {
	return {
		status,
		plan: "Go",
		windows,
		...extra,
	};
}

/** OpenCode Go: Bearer usage endpoint with workspace-dashboard fallback. */
export const openCodeGoAdapter: AccountAdapter = {
	id: "opencode-go",
	mode: "subscription",
	async collect(ctx) {
		const apiKeyRef = ctx.spec.apiKeyRef ?? OPENCODE_GO_API_KEY_REF;
		const [configuredApiKey, cookieRaw, workspaceRaw] = await Promise.all([
			resolveCredential(ctx.credentials, apiKeyRef),
			resolveCredential(ctx.credentials, OPENCODE_GO_COOKIE_REF),
			resolveCredential(ctx.credentials, OPENCODE_GO_WORKSPACE_REF),
		]);
		const apiKey = configuredApiKey || (await localOpenCodeApiKey(ctx));
		const cookie = sanitizeCookie(cookieRaw);
		const workspaceId = workspaceIdOf(workspaceRaw);
		if (apiKey === "" && (cookie === "" || workspaceId === "")) {
			return goResult("not-configured", [], { missingCredentials: [apiKeyRef] });
		}

		let apiStatus: ProviderStatus = "unavailable";
		if (apiKey !== "") {
			try {
				const body = await requestJson(
					OPENCODE_GO_USAGE_URL,
					{
						headers: { authorization: `Bearer ${apiKey}`, accept: "application/json" },
					},
					ctx.deps,
				);
				const windows = parseOpenCodeGoApi(body, ctx.now);
				if (windows.length > 0) return goResult("ok", windows);
				apiStatus = "invalid-response";
			} catch (error) {
				apiStatus = statusOfError(error);
			}
		}
		if (cookie !== "" && workspaceId !== "") {
			const dashboard = await collectFromDashboard(cookie, workspaceId, ctx);
			return goResult(dashboard.status, dashboard.windows);
		}
		return goResult(apiStatus, []);
	},
};

export const OPENCODE_GO_DISPLAY_NAME = "OpenCode Go";
