/**
 * Subscription-quota module for providers that expose percentage windows.
 *
 * The external interface is deliberately small: callers provide the Harness
 * credentials seam and optional transport/time dependencies, and receive two
 * normalized provider records. Provider credentials, upstream response shapes,
 * parsing quirks, and error mapping remain inside this module.
 *
 * OpenCode Go's documented provider API does not include usage, but its
 * first-party client currently exposes an undocumented Bearer-key endpoint.
 * The adapter prefers that simpler path, can reuse OpenCode's local auth.json,
 * and keeps the authenticated workspace dashboard as a compatibility fallback.
 * Z.ai uses its Coding Plan quota endpoints with a normal API key.
 *
 * @module dsh-usage-stats/subscriptions
 */

import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

const OPENCODE_GO_URL = "https://opencode.ai";
const OPENCODE_GO_USAGE_URL = `${OPENCODE_GO_URL}/zen/go/v1/usage`;
const ZAI_HOSTS = {
	global: "https://api.z.ai",
	"bigmodel-cn": "https://open.bigmodel.cn"
};
const ZAI_QUOTA_PATH = "/api/monitor/usage/quota/limit";
const ZAI_SUBSCRIPTION_PATH = "/api/biz/subscription/list";
const KIMI_USAGE_URL = "https://api.kimi.com/coding/v1/usages";
const MINIMAX_TOKEN_PLAN_HOSTS = {
	global: "https://www.minimax.io",
	cn: "https://www.minimaxi.com"
};
const MINIMAX_LEGACY_HOSTS = {
	global: "https://api.minimax.io",
	cn: "https://api.minimaxi.com"
};
const MINIMAX_USAGE_PATH = "/v1/api/openplatform/coding_plan/remains";
const MINIMAX_TOKEN_PLAN_PATH = "/v1/token_plan/remains";
const DEFAULT_TIMEOUT_MS = 15000;

const REFS = {
	openCodeApiKey: "OPENCODE_GO_API_KEY",
	openCodeCookie: "OPENCODE_GO_AUTH_COOKIE",
	openCodeWorkspace: "OPENCODE_GO_WORKSPACE_ID",
	zaiApiKey: "ZAI_API_KEY",
	zaiRegion: "ZAI_API_REGION",
	kimiApiKey: "KIMI_API_KEY",
	minimaxApiKey: "MINIMAX_API_KEY",
	minimaxRegion: "MINIMAX_API_REGION",
	claudeOauthToken: "CLAUDE_OAUTH_TOKEN",
	codexAccessToken: "CODEX_ACCESS_TOKEN",
	geminiAccessToken: "GEMINI_ACCESS_TOKEN",
	copilotToken: "GITHUB_COPILOT_TOKEN",
	cursorToken: "CURSOR_ACCESS_TOKEN",
	grokToken: "GROK_ACCESS_TOKEN",
	ampApiKey: "AMP_API_KEY"
};

const CLAUDE_USAGE_URL = "https://api.anthropic.com/api/oauth/usage";
const CODEX_USAGE_URL = "https://chatgpt.com/backend-api/wham/usage";
const GEMINI_QUOTA_URL = "https://cloudcode-pa.googleapis.com/v1internal:retrieveUserQuota";
const COPILOT_USAGE_URL = "https://api.github.com/copilot_internal/user";
const CURSOR_USAGE_URL = "https://api2.cursor.sh/aiserver.v1.DashboardService/GetCurrentPeriodUsage";
const GROK_BILLING_URL = "https://cli-chat-proxy.grok.com/v1/billing";
const AMP_BALANCE_URL = "https://ampcode.com/api/internal";

function nonEmptyString(value) {
	return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

function numberOrNull(value) {
	if (typeof value === "number" && Number.isFinite(value)) return value;
	if (typeof value === "string" && value.trim() !== "") {
		const parsed = Number(value);
		if (Number.isFinite(parsed)) return parsed;
	}
	return null;
}

function clampPercent(value) {
	const parsed = numberOrNull(value);
	return parsed === null ? null : Math.max(0, Math.min(100, parsed));
}

function round1(value) {
	return Math.round(value * 10) / 10;
}

function toIso(value) {
	if (value === null || value === void 0 || value === "") return null;
	if (typeof value === "number" && Number.isFinite(value)) {
		const date = new Date(value < 20000000000 ? value * 1000 : value);
		return Number.isNaN(date.getTime()) ? null : date.toISOString();
	}
	const date = new Date(String(value));
	return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

async function resolveCredential(credentials, ref) {
	if (credentials === void 0 || credentials === null || typeof credentials.resolve !== "function") return "";
	try {
		const hit = await credentials.resolve(ref);
		return typeof hit?.value === "string" ? hit.value.trim() : "";
	} catch {
		return "";
	}
}

function normalizedStatus(error) {
	if (error?.name === "TimeoutError" || error?.name === "AbortError") return "unavailable";
	if (error?.providerStatus) return error.providerStatus;
	return error instanceof SyntaxError ? "invalid-response" : "unavailable";
}

function invalidResponse(message) {
	const error = new Error(message);
	error.providerStatus = "invalid-response";
	return error;
}

async function request(url, init, deps, type) {
	const response = await (deps.fetch ?? fetch)(url, {
		...init,
		signal: AbortSignal.timeout(deps.timeoutMs ?? DEFAULT_TIMEOUT_MS)
	});
	if (!response.ok) {
		const error = new Error(`upstream returned HTTP ${response.status}`);
		error.httpStatus = response.status;
		error.providerStatus = response.status === 401 || response.status === 403
			? "unauthorized"
			: response.status === 429 ? "rate-limited" : "unavailable";
		throw error;
	}
	if (type === "text") return response.text();
	try {
		return await response.json();
	} catch {
		throw invalidResponse("upstream returned invalid JSON");
	}
}

function sanitizeCookie(raw) {
	let value = String(raw ?? "").trim().replace(/^cookie\s*:\s*/i, "");
	value = value.split(";").map((part) => part.trim()).filter(Boolean).join("; ");
	return value !== "" && !value.includes("=") ? `auth=${value}` : value;
}

function workspaceIdOf(raw) {
	return String(raw ?? "").match(/wrk_[A-Za-z0-9]+/)?.[0] ?? "";
}

function looksSignedOut(text) {
	const lower = String(text).toLowerCase();
	return lower.includes("sign in") || lower.includes("login") || lower.includes("auth/authorize") || lower.includes('actor of type "public"');
}

function goWindowFromObject(value, kind, now) {
	if (value === null || typeof value !== "object") return null;
	const percentSource = value.usagePercent ?? value.usedPercent ?? value.percentUsed ?? value.percentage ?? value.percent;
	let usedPercent = clampPercent(percentSource);
	if (usedPercent === null) {
		const used = numberOrNull(value.used ?? value.consumed);
		const limit = numberOrNull(value.limit ?? value.total ?? value.quota);
		if (used !== null && limit !== null && limit > 0) usedPercent = clampPercent((used / limit) * 100);
	}
	if (usedPercent === null) return null;
	// The dashboard embeds usagePercent as a 0..1 ratio. The Bearer endpoint's
	// `percent` is already 0..100, so only scale ratio-named dashboard fields.
	if (usedPercent <= 1 && usedPercent >= 0 && value.percent === void 0 && percentSource !== void 0) usedPercent *= 100;
	const resetSeconds = numberOrNull(value.resetInSec ?? value.resetInSeconds ?? value.resetSeconds);
	const resetsAt = resetSeconds === null ? toIso(value.resetAt ?? value.resetsAt ?? value.nextReset) : new Date(now + Math.max(0, resetSeconds) * 1000).toISOString();
	return {
		kind,
		usedPercent: round1(clampPercent(usedPercent)),
		remainingPercent: round1(100 - clampPercent(usedPercent)),
		...(resetsAt === null ? {} : { resetsAt })
	};
}

function parseOpenCodeGoApi(body, now) {
	const usage = body?.usage ?? body;
	if (usage === null || typeof usage !== "object") return [];
	return [
		goWindowFromObject(usage.rolling, "session", now),
		goWindowFromObject(usage.weekly, "weekly", now),
		goWindowFromObject(usage.monthly, "monthly", now)
	].filter(Boolean);
}

function findObject(root, keyword, depth = 0) {
	if (root === null || typeof root !== "object" || depth > 5) return null;
	for (const [key, value] of Object.entries(root)) {
		if (key.toLowerCase().includes(keyword) && value !== null && typeof value === "object") return value;
	}
	for (const value of Object.values(root)) {
		const found = findObject(value, keyword, depth + 1);
		if (found !== null) return found;
	}
	return null;
}

function goWindowFromText(text, key, kind, now) {
	const percent = new RegExp(`${key}[^}]*?usagePercent\\s*[:=]\\s*([0-9]+(?:\\.[0-9]+)?)`, "i").exec(text);
	if (percent === null) return null;
	const reset = new RegExp(`${key}[^}]*?resetInSec\\s*[:=]\\s*([0-9]+)`, "i").exec(text);
	const usedPercent = round1(clampPercent(Number(percent[1])));
	return {
		kind,
		usedPercent,
		remainingPercent: round1(100 - usedPercent),
		...(reset === null ? {} : { resetsAt: new Date(now + Number(reset[1]) * 1000).toISOString() })
	};
}

function parseOpenCodeGo(text, now) {
	let windows = [];
	try {
		const root = JSON.parse(text);
		windows = [
			goWindowFromObject(findObject(root, "rolling"), "session", now),
			goWindowFromObject(findObject(root, "weekly") ?? findObject(root, "week"), "weekly", now),
			goWindowFromObject(findObject(root, "monthly") ?? findObject(root, "month"), "monthly", now)
		].filter(Boolean);
	} catch {
		/* The dashboard may embed text/javascript rather than strict JSON. */
	}
	if (!windows.some((window) => window.kind === "session") || !windows.some((window) => window.kind === "weekly")) {
		windows = [
			goWindowFromText(text, "rollingUsage", "session", now),
			goWindowFromText(text, "weeklyUsage", "weekly", now),
			goWindowFromText(text, "monthlyUsage", "monthly", now)
		].filter(Boolean);
	}
	return windows.some((window) => window.kind === "session") && windows.some((window) => window.kind === "weekly") ? windows : [];
}

async function localOpenCodeApiKey(deps) {
	try {
		const home = typeof deps.homedir === "function" ? deps.homedir() : homedir();
		const load = deps.readFile ?? readFile;
		const raw = JSON.parse(await load(join(home, ".local", "share", "opencode", "auth.json"), "utf8"));
		const entry = raw?.["opencode-go"] ?? raw?.opencode;
		return entry?.type === "api" && typeof entry.key === "string" ? entry.key.trim() : "";
	} catch {
		return "";
	}
}

async function collectOpenCodeGoFromDashboard(cookie, workspaceId, deps) {
	try {
		const text = await request(`${OPENCODE_GO_URL}/workspace/${workspaceId}/go`, {
			headers: {
				cookie,
				accept: "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8"
			}
		}, deps, "text");
		if (looksSignedOut(text)) return { status: "unauthorized", windows: [] };
		const windows = parseOpenCodeGo(text, deps.now());
		return { status: windows.length > 0 ? "ok" : "invalid-response", windows };
	} catch (error) {
		return { status: normalizedStatus(error), windows: [] };
	}
}

async function collectOpenCodeGo(credentials, deps) {
	const apiKeyRef = deps.apiKeyRef ?? REFS.openCodeApiKey;
	const [configuredApiKey, cookieRaw, workspaceRaw] = await Promise.all([
		resolveCredential(credentials, apiKeyRef),
		resolveCredential(credentials, REFS.openCodeCookie),
		resolveCredential(credentials, REFS.openCodeWorkspace)
	]);
	const apiKey = configuredApiKey || await localOpenCodeApiKey(deps);
	const cookie = sanitizeCookie(cookieRaw);
	const workspaceId = workspaceIdOf(workspaceRaw);
	if (apiKey === "" && (cookie === "" || workspaceId === "")) {
		return {
			id: "opencode-go",
			displayName: "OpenCode Go",
			mode: "subscription",
			status: "not-configured",
			plan: "Go",
			missingCredentials: [apiKeyRef],
			windows: []
		};
	}

	let apiStatus = "unavailable";
	if (apiKey !== "") {
		try {
			const body = await request(OPENCODE_GO_USAGE_URL, {
				headers: { authorization: `Bearer ${apiKey}`, accept: "application/json" }
			}, deps, "json");
			const windows = parseOpenCodeGoApi(body, deps.now());
			if (windows.length > 0) {
				return { id: "opencode-go", displayName: "OpenCode Go", mode: "subscription", status: "ok", plan: "Go", windows };
			}
			apiStatus = "invalid-response";
		} catch (error) {
			apiStatus = normalizedStatus(error);
		}
	}
	if (cookie !== "" && workspaceId !== "") {
		const dashboard = await collectOpenCodeGoFromDashboard(cookie, workspaceId, deps);
		return { id: "opencode-go", displayName: "OpenCode Go", mode: "subscription", status: dashboard.status, plan: "Go", windows: dashboard.windows };
	}
	return { id: "opencode-go", displayName: "OpenCode Go", mode: "subscription", status: apiStatus, plan: "Go", windows: [] };
}

function zaiRegionOf(raw, fallback = "global") {
	const value = String(raw || fallback).trim().toLowerCase();
	return value === "bigmodel-cn" || value === "cn" || value.includes("bigmodel.cn") ? "bigmodel-cn" : "global";
}

function zaiWindowMinutes(limit) {
	const unit = numberOrNull(limit?.unit);
	const number = numberOrNull(limit?.number);
	if (unit === null || number === null || number <= 0) return null;
	if (unit === 5) return number;
	if (unit === 3) return number * 60;
	if (unit === 1) return number * 24 * 60;
	if (unit === 6) return number * 7 * 24 * 60;
	return null;
}

function zaiUsedPercent(limit) {
	const total = numberOrNull(limit?.usage);
	const remaining = numberOrNull(limit?.remaining);
	const current = numberOrNull(limit?.currentValue ?? limit?.current_value);
	if (total !== null && total > 0) {
		const used = remaining === null ? current : current === null ? total - remaining : Math.max(total - remaining, current);
		if (used !== null) return clampPercent((Math.max(0, Math.min(total, used)) / total) * 100);
	}
	return clampPercent(limit?.percentage ?? limit?.usedPercent ?? limit?.used_percent);
}

function displayPlan(value) {
	return String(value ?? "").trim().replace(/[_-]+/g, " ").replace(/\s+/g, " ").replace(/\bglm\b/gi, "GLM").replace(/\b\w/g, (char) => char.toUpperCase());
}

function zaiPlan(quota, subscription) {
	const row = Array.isArray(subscription?.data) ? subscription.data.find((entry) => entry && typeof entry === "object") : null;
	for (const source of [row, quota?.data]) {
		for (const key of ["product_name", "productName", "plan_name", "planName", "package_name", "packageName", "plan_type", "planType", "level"]) {
			const value = displayPlan(source?.[key]);
			if (value !== "") return value;
		}
	}
	return "GLM Coding Plan";
}

function zaiWindow(limit, kind, fallbackReset = null) {
	const usedPercent = zaiUsedPercent(limit);
	if (usedPercent === null) return null;
	const resetsAt = toIso(limit.nextResetTime ?? limit.next_reset_time) ?? fallbackReset;
	return {
		kind,
		usedPercent: round1(usedPercent),
		remainingPercent: round1(100 - usedPercent),
		...(resetsAt === null ? {} : { resetsAt }),
		...(numberOrNull(limit.remaining) === null ? {} : { remaining: numberOrNull(limit.remaining) })
	};
}

function parseZai(quota, subscription) {
	const limits = Array.isArray(quota?.data?.limits) ? quota.data.limits : [];
	const tokenLimits = limits.filter((limit) => ["TOKENS_LIMIT", "CREDIT_LIMIT"].includes(String(limit?.type ?? limit?.limit_type ?? "").toUpperCase()) && zaiUsedPercent(limit) !== null)
		.sort((a, b) => (zaiWindowMinutes(a) ?? Number.MAX_SAFE_INTEGER) - (zaiWindowMinutes(b) ?? Number.MAX_SAFE_INTEGER));
	const timeLimit = limits.find((limit) => String(limit?.type ?? limit?.limit_type ?? "").toUpperCase() === "TIME_LIMIT" && zaiUsedPercent(limit) !== null) ?? null;
	const first = tokenLimits[0] ?? null;
	const session = tokenLimits.length >= 2 ? first : zaiWindowMinutes(first) !== null && zaiWindowMinutes(first) <= 360 ? first : null;
	const weekly = tokenLimits.length >= 2 ? tokenLimits[tokenLimits.length - 1] : session === null ? first : null;
	const subscriptionRow = Array.isArray(subscription?.data) ? subscription.data[0] : null;
	const renewAt = toIso(subscriptionRow?.next_renew_time ?? subscriptionRow?.nextRenewTime);
	return {
		plan: zaiPlan(quota, subscription),
		windows: [
			session === null ? null : zaiWindow(session, "session"),
			weekly === null ? null : zaiWindow(weekly, "weekly"),
			timeLimit === null ? null : zaiWindow(timeLimit, "billing", renewAt)
		].filter(Boolean)
	};
}

async function collectZai(credentials, deps) {
	const apiKeyRef = deps.zaiApiKeyRef ?? REFS.zaiApiKey;
	const [apiKey, configuredRegion] = await Promise.all([
		resolveCredential(credentials, apiKeyRef),
		resolveCredential(credentials, REFS.zaiRegion)
	]);
	const region = zaiRegionOf(configuredRegion, deps.zaiDefaultRegion);
	if (apiKey === "") {
		return { id: "zai", displayName: "Z.ai", mode: "subscription", status: "not-configured", plan: "GLM Coding Plan", region, missingCredentials: [apiKeyRef], windows: [] };
	}
	const host = ZAI_HOSTS[region];
	// The Coding Plan endpoint expects the raw API key, unlike the inference API.
	const init = { headers: { authorization: apiKey, accept: "application/json" } };
	try {
		const quota = await request(`${host}${ZAI_QUOTA_PATH}`, init, deps, "json");
		let subscription = null;
		try {
			subscription = await request(`${host}${ZAI_SUBSCRIPTION_PATH}`, init, deps, "json");
		} catch {
			/* Plan label/reset metadata is optional when quota succeeded. */
		}
		const parsed = parseZai(quota, subscription);
		return { id: "zai", displayName: "Z.ai", mode: "subscription", status: parsed.windows.length > 0 ? "ok" : "invalid-response", plan: parsed.plan, region, windows: parsed.windows };
	} catch (error) {
		return { id: "zai", displayName: "Z.ai", mode: "subscription", status: normalizedStatus(error), plan: "GLM Coding Plan", region, windows: [] };
	}
}

function limitWindow(value, kind) {
	if (value === null || typeof value !== "object") return null;
	const limit = numberOrNull(value.limit ?? value.total);
	const remaining = numberOrNull(value.remaining);
	if (limit === null || remaining === null || limit <= 0) return null;
	const usedPercent = round1(clampPercent((limit - remaining) / limit * 100));
	const resetsAt = toIso(value.resetTime ?? value.reset_time ?? value.resetsAt);
	return {
		kind,
		usedPercent,
		remainingPercent: round1(100 - usedPercent),
		...(resetsAt === null ? {} : { resetsAt })
	};
}

function parseKimi(body) {
	const data = body?.data ?? body;
	const limits = Array.isArray(data?.limits) ? data.limits : [];
	const session = limits.map((entry) => limitWindow(entry?.detail ?? entry, "session")).find(Boolean) ?? null;
	const weekly = limitWindow(data?.usage, "weekly");
	return {
		plan: String(data?.plan ?? data?.planName ?? "Kimi For Coding"),
		windows: [session, weekly].filter(Boolean)
	};
}

async function collectKimi(credentials, deps) {
	const apiKeyRef = deps.apiKeyRef ?? REFS.kimiApiKey;
	const apiKey = await resolveCredential(credentials, apiKeyRef);
	if (apiKey === "") return { id: "kimi", displayName: "Kimi For Coding", mode: "subscription", status: "not-configured", plan: "Kimi For Coding", missingCredentials: [apiKeyRef], windows: [] };
	try {
		const configured = nonEmptyUrl(deps.baseURL, "/coding/v1/usages") ?? KIMI_USAGE_URL;
		const body = await request(configured, {
			headers: { authorization: `Bearer ${apiKey}`, accept: "application/json" }
		}, deps, "json");
		const parsed = parseKimi(body);
		return { id: "kimi", displayName: "Kimi For Coding", mode: "subscription", status: parsed.windows.length > 0 ? "ok" : "invalid-response", ...parsed };
	} catch (error) {
		return { id: "kimi", displayName: "Kimi For Coding", mode: "subscription", status: normalizedStatus(error), plan: "Kimi For Coding", windows: [] };
	}
}

function nonEmptyUrl(value, defaultPath) {
	if (typeof value !== "string" || value.trim() === "") return null;
	try {
		const url = new URL(value);
		return url.pathname === "/" || url.pathname === "" ? new URL(defaultPath, url).href : url.href;
	} catch {
		return null;
	}
}

function minimaxRegionOf(raw, baseURL) {
	const value = String(raw ?? "").trim().toLowerCase();
	if (value === "cn" || value.includes("minimaxi.com") || String(baseURL ?? "").includes("minimaxi.com")) return "cn";
	return "global";
}

function resetFromDuration(value, now) {
	const milliseconds = numberOrNull(value);
	if (milliseconds === null || milliseconds < 0) return null;
	const date = new Date(now + milliseconds);
	return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function parseMiniMax(body, now) {
	const statusCode = numberOrNull(body?.base_resp?.status_code ?? body?.baseResp?.statusCode);
	if (statusCode !== null && statusCode !== 0) return [];
	const remains = Array.isArray(body?.model_remains) ? body.model_remains : Array.isArray(body?.data?.model_remains) ? body.data.model_remains : [];
	const general = remains.find((entry) => String(entry?.model_name ?? entry?.modelName ?? "").toLowerCase() === "general");
	if (general === void 0) return [];
	const intervalRemaining = clampPercent(general.current_interval_remaining_percent ?? general.currentIntervalRemainingPercent);
	const weeklyRemaining = clampPercent(general.current_weekly_remaining_percent ?? general.currentWeeklyRemainingPercent);
	const weeklyStatus = numberOrNull(general.current_weekly_status ?? general.currentWeeklyStatus);
	const sessionReset = toIso(general.current_interval_end_time ?? general.currentIntervalEndTime ?? general.current_interval_reset_time)
		?? resetFromDuration(general.remains_time ?? general.remainsTime, now);
	const weeklyReset = toIso(general.current_weekly_end_time ?? general.currentWeeklyEndTime ?? general.current_weekly_reset_time)
		?? resetFromDuration(general.weekly_remains_time ?? general.weeklyRemainsTime, now);
	return [
		intervalRemaining === null ? null : {
			kind: "session",
			usedPercent: round1(100 - intervalRemaining),
			remainingPercent: round1(intervalRemaining),
			...(sessionReset === null ? {} : { resetsAt: sessionReset })
		},
		weeklyStatus !== 1 || weeklyRemaining === null ? null : {
			kind: "weekly",
			usedPercent: round1(100 - weeklyRemaining),
			remainingPercent: round1(weeklyRemaining),
			...(weeklyReset === null ? {} : { resetsAt: weeklyReset })
		}
	].filter(Boolean);
}

async function collectMiniMax(credentials, deps) {
	const apiKeyRef = deps.apiKeyRef ?? REFS.minimaxApiKey;
	const [apiKey, configuredRegion] = await Promise.all([
		resolveCredential(credentials, apiKeyRef),
		resolveCredential(credentials, REFS.minimaxRegion)
	]);
	const region = minimaxRegionOf(deps.region ?? configuredRegion, deps.baseURL);
	if (apiKey === "") return { id: "minimax", displayName: "MiniMax Coding Plan", mode: "subscription", status: "not-configured", plan: "MiniMax Coding Plan", region, missingCredentials: [apiKeyRef], windows: [] };
	const configuredUrl = nonEmptyUrl(deps.baseURL, MINIMAX_USAGE_PATH);
	const urls = configuredUrl === null ? [
		`${MINIMAX_TOKEN_PLAN_HOSTS[region]}${MINIMAX_TOKEN_PLAN_PATH}`,
		`${MINIMAX_LEGACY_HOSTS[region]}${MINIMAX_USAGE_PATH}`
	] : [configuredUrl];
	try {
		let body = null;
		for (const [index, url] of urls.entries()) {
			try {
				body = await request(url, {
					headers: { authorization: `Bearer ${apiKey}`, accept: "application/json" }
				}, deps, "json");
				break;
			} catch (error) {
				if (index === 0 && urls.length > 1 && (error?.httpStatus === 404 || error?.httpStatus === 405)) continue;
				throw error;
			}
		}
		const windows = parseMiniMax(body, deps.now());
		return { id: "minimax", displayName: "MiniMax Coding Plan", mode: "subscription", status: windows.length > 0 ? "ok" : "invalid-response", plan: "MiniMax Coding Plan", region, windows };
	} catch (error) {
		return { id: "minimax", displayName: "MiniMax Coding Plan", mode: "subscription", status: normalizedStatus(error), plan: "MiniMax Coding Plan", region, windows: [] };
	}
}

//#region claude oauth subscription
function parseClaudeUsage(body) {
	const windows = [];
	const fiveHour = body?.five_hour;
	if (fiveHour !== null && typeof fiveHour === "object") {
		const used = numberOrNull(fiveHour.used ?? fiveHour.usage);
		const limit = numberOrNull(fiveHour.limit ?? fiveHour.max);
		if (used !== null && limit !== null && limit > 0) {
			windows.push({
				kind: "session",
				usedPercent: round1(clampPercent((used / limit) * 100)),
				remainingPercent: round1(100 - clampPercent((used / limit) * 100)),
				...(toIso(fiveHour.reset_at ?? fiveHour.resetsAt) === null ? {} : { resetsAt: toIso(fiveHour.reset_at ?? fiveHour.resetsAt) })
			});
		} else {
			const utilization = numberOrNull(fiveHour.utilization);
			if (utilization !== null) {
				windows.push({
					kind: "session",
					usedPercent: round1(clampPercent(utilization * 100)),
					remainingPercent: round1(100 - clampPercent(utilization * 100))
				});
			}
		}
	}
	const sevenDay = body?.seven_day;
	if (sevenDay !== null && typeof sevenDay === "object") {
		const used = numberOrNull(sevenDay.used ?? sevenDay.usage);
		const limit = numberOrNull(sevenDay.limit ?? sevenDay.max);
		if (used !== null && limit !== null && limit > 0) {
			windows.push({
				kind: "weekly",
				usedPercent: round1(clampPercent((used / limit) * 100)),
				remainingPercent: round1(100 - clampPercent((used / limit) * 100)),
				...(toIso(sevenDay.reset_at ?? sevenDay.resetsAt) === null ? {} : { resetsAt: toIso(sevenDay.reset_at ?? sevenDay.resetsAt) })
			});
		} else {
			const utilization = numberOrNull(sevenDay.utilization);
			if (utilization !== null) {
				windows.push({
					kind: "weekly",
					usedPercent: round1(clampPercent(utilization * 100)),
					remainingPercent: round1(100 - clampPercent(utilization * 100))
				});
			}
		}
	}
	return windows;
}

async function collectClaude(credentials, deps) {
	const apiKeyRef = deps.apiKeyRef ?? REFS.claudeOauthToken;
	const token = await resolveCredential(credentials, apiKeyRef);
	if (token === "") return { id: "claude", displayName: "Claude", mode: "subscription", status: "not-configured", plan: "Claude Subscription", missingCredentials: [apiKeyRef], windows: [] };
	try {
		const body = await request(CLAUDE_USAGE_URL, {
			headers: {
				authorization: `Bearer ${token}`,
				"anthropic-beta": "oauth-2025-04-20",
				accept: "application/json"
			}
		}, deps, "json");
		const windows = parseClaudeUsage(body);
		const plan = nonEmptyString(body?.subscription_type ?? body?.subscriptionType ?? body?.rate_limit_tier) ?? "Claude Subscription";
		return { id: "claude", displayName: "Claude", mode: "subscription", status: windows.length > 0 ? "ok" : "invalid-response", plan, windows };
	} catch (error) {
		return { id: "claude", displayName: "Claude", mode: "subscription", status: normalizedStatus(error), plan: "Claude Subscription", windows: [] };
	}
}
//#endregion

//#region codex wham subscription
function parseCodexUsage(body) {
	const windows = [];
	const rateLimit = body?.rate_limit ?? body?.rateLimits;
	if (rateLimit !== null && typeof rateLimit === "object") {
		const primary = rateLimit.primary_window ?? rateLimit.primaryWindow;
		if (primary !== null && typeof primary === "object") {
			const used = numberOrNull(primary.used ?? primary.current);
			const limit = numberOrNull(primary.limit ?? primary.max);
			if (used !== null && limit !== null && limit > 0) {
				windows.push({
					kind: "session",
					usedPercent: round1(clampPercent((used / limit) * 100)),
					remainingPercent: round1(100 - clampPercent((used / limit) * 100)),
					...(toIso(primary.reset_at ?? primary.resetAt ?? primary.resetsAt) === null ? {} : { resetsAt: toIso(primary.reset_at ?? primary.resetAt ?? primary.resetsAt) })
				});
			}
		}
		const secondary = rateLimit.secondary_window ?? rateLimit.secondaryWindow;
		if (secondary !== null && typeof secondary === "object") {
			const used = numberOrNull(secondary.used ?? secondary.current);
			const limit = numberOrNull(secondary.limit ?? secondary.max);
			if (used !== null && limit !== null && limit > 0) {
				windows.push({
					kind: "weekly",
					usedPercent: round1(clampPercent((used / limit) * 100)),
					remainingPercent: round1(100 - clampPercent((used / limit) * 100)),
					...(toIso(secondary.reset_at ?? secondary.resetAt ?? secondary.resetsAt) === null ? {} : { resetsAt: toIso(secondary.reset_at ?? secondary.resetAt ?? secondary.resetsAt) })
				});
			}
		}
	}
	return windows;
}

async function collectCodex(credentials, deps) {
	const apiKeyRef = deps.apiKeyRef ?? REFS.codexAccessToken;
	const token = await resolveCredential(credentials, apiKeyRef);
	if (token === "") return { id: "codex", displayName: "Codex", mode: "subscription", status: "not-configured", plan: "ChatGPT Subscription", missingCredentials: [apiKeyRef], windows: [] };
	try {
		const body = await request(CODEX_USAGE_URL, {
			headers: { authorization: `Bearer ${token}`, accept: "application/json" }
		}, deps, "json");
		const windows = parseCodexUsage(body);
		const plan = nonEmptyString(body?.plan ?? body?.subscription_plan) ?? "ChatGPT Subscription";
		return { id: "codex", displayName: "Codex", mode: "subscription", status: windows.length > 0 ? "ok" : "invalid-response", plan, windows };
	} catch (error) {
		return { id: "codex", displayName: "Codex", mode: "subscription", status: normalizedStatus(error), plan: "ChatGPT Subscription", windows: [] };
	}
}
//#endregion

//#region gemini quota subscription
function parseGeminiQuota(body) {
	const windows = [];
	const quotas = Array.isArray(body?.quotas) ? body.quotas : [];
	for (const quota of quotas) {
		if (quota === null || typeof quota !== "object") continue;
		const remainingFraction = numberOrNull(quota.remainingFraction ?? quota.remaining_fraction);
		if (remainingFraction === null) continue;
		const percentLeft = clampPercent(remainingFraction * 100);
		if (percentLeft === null) continue;
		const modelId = nonEmptyString(quota.modelId ?? quota.model_id) ?? "default";
		const kind = modelId.toLowerCase().includes("flash") ? "flash" : "pro";
		windows.push({
			kind,
			usedPercent: round1(100 - percentLeft),
			remainingPercent: round1(percentLeft),
			...(toIso(quota.resetTime ?? quota.reset_time) === null ? {} : { resetsAt: toIso(quota.resetTime ?? quota.reset_time) })
		});
	}
	// Deduplicate by kind, keeping the lowest remaining
	const byKind = new Map();
	for (const w of windows) {
		const existing = byKind.get(w.kind);
		if (existing === void 0 || w.remainingPercent < existing.remainingPercent) byKind.set(w.kind, w);
	}
	return Array.from(byKind.values());
}

async function collectGemini(credentials, deps) {
	const apiKeyRef = deps.apiKeyRef ?? REFS.geminiAccessToken;
	const token = await resolveCredential(credentials, apiKeyRef);
	if (token === "") return { id: "gemini", displayName: "Gemini", mode: "subscription", status: "not-configured", plan: "Gemini Code Assist", missingCredentials: [apiKeyRef], windows: [] };
	try {
		const body = await request(GEMINI_QUOTA_URL, {
			method: "POST",
			headers: { authorization: `Bearer ${token}`, accept: "application/json", "content-type": "application/json" },
			body: JSON.stringify({})
		}, deps, "json");
		const windows = parseGeminiQuota(body);
		return { id: "gemini", displayName: "Gemini", mode: "subscription", status: windows.length > 0 ? "ok" : "invalid-response", plan: "Gemini Code Assist", windows };
	} catch (error) {
		return { id: "gemini", displayName: "Gemini", mode: "subscription", status: normalizedStatus(error), plan: "Gemini Code Assist", windows: [] };
	}
}
//#endregion

//#region github copilot subscription
function parseCopilotUsage(body) {
	const windows = [];
	const snapshots = body?.quotaSnapshots ?? body?.quota_snapshots;
	if (snapshots !== null && typeof snapshots === "object") {
		const premium = snapshots.premiumInteractions ?? snapshots.premium_interactions;
		if (premium !== null && typeof premium === "object") {
			const remaining = numberOrNull(premium.remainingPercent ?? premium.remaining_percent ?? premium.percentRemaining);
			if (remaining !== null) {
				windows.push({
					kind: "premium",
					usedPercent: round1(100 - clampPercent(remaining)),
					remainingPercent: round1(clampPercent(remaining))
				});
			}
		}
		const chat = snapshots.chat;
		if (chat !== null && typeof chat === "object") {
			const remaining = numberOrNull(chat.remainingPercent ?? chat.remaining_percent ?? chat.percentRemaining);
			if (remaining !== null) {
				windows.push({
					kind: "chat",
					usedPercent: round1(100 - clampPercent(remaining)),
					remainingPercent: round1(clampPercent(remaining))
				});
			}
		}
	}
	return windows;
}

async function collectCopilot(credentials, deps) {
	const apiKeyRef = deps.apiKeyRef ?? REFS.copilotToken;
	const token = await resolveCredential(credentials, apiKeyRef);
	if (token === "") return { id: "copilot", displayName: "GitHub Copilot", mode: "subscription", status: "not-configured", plan: "Copilot", missingCredentials: [apiKeyRef], windows: [] };
	try {
		const body = await request(COPILOT_USAGE_URL, {
			headers: {
				authorization: `token ${token}`,
				accept: "application/json",
				"editor-version": "vscode/1.96.2",
				"editor-plugin-version": "copilot-chat/0.26.7",
				"user-agent": "GitHubCopilotChat/0.26.7",
				"x-github-api-version": "2025-04-01"
			}
		}, deps, "json");
		const windows = parseCopilotUsage(body);
		const plan = nonEmptyString(body?.copilotPlan ?? body?.copilot_plan ?? body?.plan) ?? "Copilot";
		return { id: "copilot", displayName: "GitHub Copilot", mode: "subscription", status: windows.length > 0 ? "ok" : "invalid-response", plan, windows };
	} catch (error) {
		return { id: "copilot", displayName: "GitHub Copilot", mode: "subscription", status: normalizedStatus(error), plan: "Copilot", windows: [] };
	}
}
//#endregion

//#region cursor subscription
function parseCursorUsage(body) {
	const windows = [];
	const planUsage = body?.planUsage;
	if (planUsage !== null && typeof planUsage === "object") {
		const totalPercent = numberOrNull(planUsage.totalPercentUsed);
		if (totalPercent !== null) {
			windows.push({
				kind: "monthly",
				usedPercent: round1(clampPercent(totalPercent)),
				remainingPercent: round1(100 - clampPercent(totalPercent))
			});
		} else {
			// Team accounts use dollar amounts
			const limit = numberOrNull(planUsage.limit);
			const remaining = numberOrNull(planUsage.remaining);
			if (limit !== null && remaining !== null && limit > 0) {
				const usedPercent = round1(clampPercent(((limit - remaining) / limit) * 100));
				windows.push({ kind: "monthly", usedPercent, remainingPercent: round1(100 - usedPercent) });
			}
		}
		const autoPercent = numberOrNull(planUsage.autoPercentUsed);
		if (autoPercent !== null) {
			windows.push({
				kind: "auto",
				usedPercent: round1(clampPercent(autoPercent)),
				remainingPercent: round1(100 - clampPercent(autoPercent))
			});
		}
	}
	return windows;
}

async function collectCursor(credentials, deps) {
	const apiKeyRef = deps.apiKeyRef ?? REFS.cursorToken;
	const token = await resolveCredential(credentials, apiKeyRef);
	if (token === "") return { id: "cursor", displayName: "Cursor", mode: "subscription", status: "not-configured", plan: "Cursor Pro", missingCredentials: [apiKeyRef], windows: [] };
	try {
		const body = await request(CURSOR_USAGE_URL, {
			method: "POST",
			headers: {
				authorization: `Bearer ${token}`,
				accept: "application/json",
				"content-type": "application/json",
				"connect-protocol-version": "1"
			},
			body: JSON.stringify({})
		}, deps, "json");
		const windows = parseCursorUsage(body);
		const plan = nonEmptyString(body?.planName ?? body?.plan_name) ?? "Cursor Pro";
		return { id: "cursor", displayName: "Cursor", mode: "subscription", status: windows.length > 0 ? "ok" : "invalid-response", plan, windows };
	} catch (error) {
		return { id: "cursor", displayName: "Cursor", mode: "subscription", status: normalizedStatus(error), plan: "Cursor Pro", windows: [] };
	}
}
//#endregion

//#region grok subscription
function parseGrokBilling(body) {
	const windows = [];
	const config = body?.config;
	if (config !== null && typeof config === "object") {
		const monthlyLimit = numberOrNull(config.monthlyLimit?.val ?? config.monthlyLimit);
		const used = numberOrNull(config.used?.val ?? config.used);
		if (monthlyLimit !== null && used !== null && monthlyLimit > 0) {
			const usedPercent = round1(clampPercent((used / monthlyLimit) * 100));
			windows.push({
				kind: "monthly",
				usedPercent,
				remainingPercent: round1(100 - usedPercent)
			});
		}
	}
	return windows;
}

async function collectGrok(credentials, deps) {
	const apiKeyRef = deps.apiKeyRef ?? REFS.grokToken;
	const token = await resolveCredential(credentials, apiKeyRef);
	if (token === "") return { id: "grok", displayName: "Grok", mode: "subscription", status: "not-configured", plan: "Grok Build", missingCredentials: [apiKeyRef], windows: [] };
	try {
		const body = await request(GROK_BILLING_URL, {
			headers: {
				authorization: `Bearer ${token}`,
				"x-xai-token-auth": "xai-grok-cli",
				accept: "application/json"
			}
		}, deps, "json");
		const windows = parseGrokBilling(body);
		const tier = nonEmptyString(body?.subscription_tier_display ?? body?.tier) ?? "Grok Build";
		return { id: "grok", displayName: "Grok", mode: "subscription", status: windows.length > 0 ? "ok" : "invalid-response", plan: tier, windows };
	} catch (error) {
		return { id: "grok", displayName: "Grok", mode: "subscription", status: normalizedStatus(error), plan: "Grok Build", windows: [] };
	}
}
//#endregion

//#region amp subscription
function parseAmpBalance(displayText) {
	if (typeof displayText !== "string") return { balance: null, credits: null };
	// Parse "Amp Free: $remaining/$total remaining"
	const freeMatch = /\$([0-9]+(?:\.[0-9]+)?)\/\$([0-9]+(?:\.[0-9]+)?)\s+remaining/.exec(displayText);
	// Parse "Individual credits: $N remaining"
	const creditsMatch = /Individual credits:\s*\$([0-9]+(?:\.[0-9]+)?)\s+remaining/.exec(displayText);
	return {
		balance: freeMatch !== null ? { remaining: Number(freeMatch[1]), total: Number(freeMatch[2]) } : null,
		credits: creditsMatch !== null ? Number(creditsMatch[1]) : null
	};
}

async function collectAmp(credentials, deps) {
	const apiKeyRef = deps.apiKeyRef ?? REFS.ampApiKey;
	const apiKey = await resolveCredential(credentials, apiKeyRef);
	if (apiKey === "") return { id: "amp", displayName: "Amp", mode: "subscription", status: "not-configured", plan: "Amp", missingCredentials: [apiKeyRef], windows: [] };
	try {
		const body = await request(AMP_BALANCE_URL, {
			method: "POST",
			headers: {
				authorization: `Bearer ${apiKey}`,
				accept: "application/json",
				"content-type": "application/json"
			},
			body: JSON.stringify({ method: "userDisplayBalanceInfo", params: {} })
		}, deps, "json");
		const displayText = body?.result?.displayText ?? body?.displayText;
		const parsed = parseAmpBalance(displayText);
		const windows = [];
		if (parsed.balance !== null && parsed.balance.total > 0) {
			const usedPercent = round1(clampPercent(((parsed.balance.total - parsed.balance.remaining) / parsed.balance.total) * 100));
			windows.push({ kind: "free", usedPercent, remainingPercent: round1(100 - usedPercent) });
		}
		if (parsed.credits !== null && parsed.credits > 0) {
			// Credits are a balance-style metric; represent as a window with unknown total
			windows.push({ kind: "credits", usedPercent: 0, remainingPercent: 100 });
		}
		const plan = displayText !== null && typeof displayText === "string" && displayText.includes("Amp Free") ? "Amp Free" : "Amp";
		return { id: "amp", displayName: "Amp", mode: "subscription", status: windows.length > 0 ? "ok" : "invalid-response", plan, windows };
	} catch (error) {
		return { id: "amp", displayName: "Amp", mode: "subscription", status: normalizedStatus(error), plan: "Amp", windows: [] };
	}
}
//#endregion

/** Query one subscription/token-plan adapter. */
export async function collectSubscription(providerId, credentials, options = {}, deps = {}) {
	const shared = {
		fetch: deps.fetch,
		readFile: deps.readFile,
		homedir: deps.homedir,
		timeoutMs: deps.timeoutMs,
		now: deps.now ?? Date.now,
		apiKeyRef: options.apiKeyRef,
		baseURL: options.baseURL,
		region: options.region
	};
	if (providerId === "opencode-go") return collectOpenCodeGo(credentials, shared);
	if (providerId === "zai") return collectZai(credentials, {
		...shared,
		zaiApiKeyRef: options.apiKeyRef,
		zaiDefaultRegion: options.region ?? "global"
	});
	if (providerId === "kimi") return collectKimi(credentials, shared);
	if (providerId === "minimax") return collectMiniMax(credentials, shared);
	if (providerId === "claude") return collectClaude(credentials, shared);
	if (providerId === "codex") return collectCodex(credentials, shared);
	if (providerId === "gemini") return collectGemini(credentials, shared);
	if (providerId === "copilot") return collectCopilot(credentials, shared);
	if (providerId === "cursor") return collectCursor(credentials, shared);
	if (providerId === "grok") return collectGrok(credentials, shared);
	if (providerId === "amp") return collectAmp(credentials, shared);
	return { id: providerId, displayName: providerId, mode: "subscription", status: "unavailable", windows: [] };
}

/** Collect every supported subscription provider concurrently. */
export async function collectSubscriptions(credentials, options = {}, deps = {}) {
	return Promise.all([
		collectSubscription("opencode-go", credentials, { apiKeyRef: options.openCodeApiKeyRef }, deps),
		collectSubscription("zai", credentials, { apiKeyRef: options.zaiApiKeyRef, region: options.zaiDefaultRegion ?? "global" }, deps)
	]);
}

export const subscriptionCredentialRefs = { ...REFS };
