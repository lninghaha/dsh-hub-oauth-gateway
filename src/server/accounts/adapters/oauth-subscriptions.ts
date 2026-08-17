/**
 * OAuth/access-token subscription adapters: Claude, Codex, Gemini,
 * GitHub Copilot, Cursor, Grok, and Amp. Each is a constrained endpoint probe
 * authenticated with a user access token.
 */

import { clampPercent, nonEmptyString, numberOrNull, round1, statusOfError, toIso } from "../normalize.js";
import { requestJson, resolveCredential } from "../transport.js";
import type { AccountAdapter, RawQuotaWindow } from "../types.js";

const CLAUDE_USAGE_URL = "https://api.anthropic.com/api/oauth/usage";
const CODEX_USAGE_URL = "https://chatgpt.com/backend-api/wham/usage";
const GEMINI_QUOTA_URL = "https://cloudcode-pa.googleapis.com/v1internal:retrieveUserQuota";
const COPILOT_USAGE_URL = "https://api.github.com/copilot_internal/user";
const CURSOR_USAGE_URL = "https://api2.cursor.sh/aiserver.v1.DashboardService/GetCurrentPeriodUsage";
const GROK_BILLING_URL = "https://cli-chat-proxy.grok.com/v1/billing";
const AMP_BALANCE_URL = "https://ampcode.com/api/internal";

export const CLAUDE_OAUTH_TOKEN_REF = "CLAUDE_OAUTH_TOKEN";
export const CODEX_ACCESS_TOKEN_REF = "CODEX_ACCESS_TOKEN";
export const GEMINI_ACCESS_TOKEN_REF = "GEMINI_ACCESS_TOKEN";
export const COPILOT_TOKEN_REF = "GITHUB_COPILOT_TOKEN";
export const CURSOR_TOKEN_REF = "CURSOR_ACCESS_TOKEN";
export const GROK_TOKEN_REF = "GROK_ACCESS_TOKEN";
export const AMP_API_KEY_REF = "AMP_API_KEY";

function asRecord(value: unknown): Record<string, unknown> | undefined {
	return value !== null && typeof value === "object" && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: undefined;
}

function ratioWindow(kind: string, used: number, limit: number, resetsAt: unknown): RawQuotaWindow | null {
	if (!(limit > 0)) return null;
	const percent = clampPercent((used / limit) * 100);
	if (percent === null) return null;
	const reset = toIso(resetsAt);
	return {
		kind,
		usedPercent: round1(percent),
		remainingPercent: round1(100 - percent),
		...(reset === null ? {} : { resetsAt: reset }),
	};
}

function utilizationWindow(kind: string, utilization: number): RawQuotaWindow | null {
	const percent = clampPercent(utilization * 100);
	if (percent === null) return null;
	return { kind, usedPercent: round1(percent), remainingPercent: round1(100 - percent) };
}

//#region claude oauth subscription
function parseClaudeUsage(body: unknown): RawQuotaWindow[] {
	const windows: RawQuotaWindow[] = [];
	const root = asRecord(body);
	const fiveHour = asRecord(root?.five_hour);
	if (fiveHour !== undefined) {
		const used = numberOrNull(fiveHour.used ?? fiveHour.usage);
		const limit = numberOrNull(fiveHour.limit ?? fiveHour.max);
		const window =
			used !== null && limit !== null
				? ratioWindow("session", used, limit, fiveHour.reset_at ?? fiveHour.resetsAt)
				: (() => {
						const utilization = numberOrNull(fiveHour.utilization);
						return utilization === null ? null : utilizationWindow("session", utilization);
					})();
		if (window !== null) windows.push(window);
	}
	const sevenDay = asRecord(root?.seven_day);
	if (sevenDay !== undefined) {
		const used = numberOrNull(sevenDay.used ?? sevenDay.usage);
		const limit = numberOrNull(sevenDay.limit ?? sevenDay.max);
		const window =
			used !== null && limit !== null
				? ratioWindow("weekly", used, limit, sevenDay.reset_at ?? sevenDay.resetsAt)
				: (() => {
						const utilization = numberOrNull(sevenDay.utilization);
						return utilization === null ? null : utilizationWindow("weekly", utilization);
					})();
		if (window !== null) windows.push(window);
	}
	return windows;
}

/** Claude subscription usage via the OAuth usage endpoint. */
export const claudeOauthAdapter: AccountAdapter = {
	id: "claude-oauth",
	mode: "subscription",
	async collect(ctx) {
		const tokenRef = ctx.spec.apiKeyRef ?? CLAUDE_OAUTH_TOKEN_REF;
		const token = await resolveCredential(ctx.credentials, tokenRef);
		if (token === "") {
			return { status: "not-configured", plan: "Claude Subscription", missingCredentials: [tokenRef], windows: [] };
		}
		try {
			const body = await requestJson(
				CLAUDE_USAGE_URL,
				{
					headers: {
						authorization: `Bearer ${token}`,
						"anthropic-beta": "oauth-2025-04-20",
						accept: "application/json",
					},
				},
				ctx.deps,
			);
			const windows = parseClaudeUsage(body);
			const root = asRecord(body);
			const plan =
				nonEmptyString(root?.subscription_type ?? root?.subscriptionType ?? root?.rate_limit_tier) ??
				"Claude Subscription";
			return { status: windows.length > 0 ? "ok" : "invalid-response", plan, windows };
		} catch (error) {
			return { status: statusOfError(error), plan: "Claude Subscription", windows: [] };
		}
	},
};
//#endregion

//#region codex wham subscription
function parseCodexUsage(body: unknown): RawQuotaWindow[] {
	const windows: RawQuotaWindow[] = [];
	const root = asRecord(body);
	const rateLimit = asRecord(root?.rate_limit) ?? asRecord(root?.rateLimits);
	if (rateLimit !== undefined) {
		const primary = asRecord(rateLimit.primary_window) ?? asRecord(rateLimit.primaryWindow);
		if (primary !== undefined) {
			const used = numberOrNull(primary.used ?? primary.current);
			const limit = numberOrNull(primary.limit ?? primary.max);
			const window =
				used !== null && limit !== null
					? ratioWindow("session", used, limit, primary.reset_at ?? primary.resetAt ?? primary.resetsAt)
					: null;
			if (window !== null) windows.push(window);
		}
		const secondary = asRecord(rateLimit.secondary_window) ?? asRecord(rateLimit.secondaryWindow);
		if (secondary !== undefined) {
			const used = numberOrNull(secondary.used ?? secondary.current);
			const limit = numberOrNull(secondary.limit ?? secondary.max);
			const window =
				used !== null && limit !== null
					? ratioWindow("weekly", used, limit, secondary.reset_at ?? secondary.resetAt ?? secondary.resetsAt)
					: null;
			if (window !== null) windows.push(window);
		}
	}
	return windows;
}

/** Codex (ChatGPT subscription) usage via the wham endpoint. */
export const codexWhamAdapter: AccountAdapter = {
	id: "codex-wham",
	mode: "subscription",
	async collect(ctx) {
		const tokenRef = ctx.spec.apiKeyRef ?? CODEX_ACCESS_TOKEN_REF;
		const token = await resolveCredential(ctx.credentials, tokenRef);
		if (token === "") {
			return { status: "not-configured", plan: "ChatGPT Subscription", missingCredentials: [tokenRef], windows: [] };
		}
		try {
			const body = await requestJson(
				CODEX_USAGE_URL,
				{
					headers: { authorization: `Bearer ${token}`, accept: "application/json" },
				},
				ctx.deps,
			);
			const windows = parseCodexUsage(body);
			const root = asRecord(body);
			const plan = nonEmptyString(root?.plan ?? root?.subscription_plan) ?? "ChatGPT Subscription";
			return { status: windows.length > 0 ? "ok" : "invalid-response", plan, windows };
		} catch (error) {
			return { status: statusOfError(error), plan: "ChatGPT Subscription", windows: [] };
		}
	},
};
//#endregion

//#region gemini quota subscription
function parseGeminiQuota(body: unknown): RawQuotaWindow[] {
	const windows: RawQuotaWindow[] = [];
	const quotas = Array.isArray(asRecord(body)?.quotas) ? (asRecord(body)?.quotas as unknown[]) : [];
	for (const raw of quotas) {
		const quota = asRecord(raw);
		if (quota === undefined) continue;
		const remainingFraction = numberOrNull(quota.remainingFraction ?? quota.remaining_fraction);
		if (remainingFraction === null) continue;
		const percentLeft = clampPercent(remainingFraction * 100);
		if (percentLeft === null) continue;
		const modelId = nonEmptyString(quota.modelId ?? quota.model_id) ?? "default";
		const kind = modelId.toLowerCase().includes("flash") ? "flash" : "pro";
		const resetsAt = toIso(quota.resetTime ?? quota.reset_time);
		windows.push({
			kind,
			usedPercent: round1(100 - percentLeft),
			remainingPercent: round1(percentLeft),
			...(resetsAt === null ? {} : { resetsAt }),
		});
	}
	// Deduplicate by kind, keeping the lowest remaining.
	const byKind = new Map<string, RawQuotaWindow>();
	for (const window of windows) {
		const existing = byKind.get(window.kind);
		if (existing === undefined || window.remainingPercent < existing.remainingPercent) byKind.set(window.kind, window);
	}
	return Array.from(byKind.values());
}

/** Gemini Code Assist quota via the Cloud Code internal endpoint. */
export const geminiQuotaAdapter: AccountAdapter = {
	id: "gemini-quota",
	mode: "subscription",
	async collect(ctx) {
		const tokenRef = ctx.spec.apiKeyRef ?? GEMINI_ACCESS_TOKEN_REF;
		const token = await resolveCredential(ctx.credentials, tokenRef);
		if (token === "") {
			return { status: "not-configured", plan: "Gemini Code Assist", missingCredentials: [tokenRef], windows: [] };
		}
		try {
			const body = await requestJson(
				GEMINI_QUOTA_URL,
				{
					method: "POST",
					headers: { authorization: `Bearer ${token}`, accept: "application/json", "content-type": "application/json" },
					body: JSON.stringify({}),
				},
				ctx.deps,
			);
			const windows = parseGeminiQuota(body);
			return { status: windows.length > 0 ? "ok" : "invalid-response", plan: "Gemini Code Assist", windows };
		} catch (error) {
			return { status: statusOfError(error), plan: "Gemini Code Assist", windows: [] };
		}
	},
};
//#endregion

//#region github copilot subscription
function parseCopilotUsage(body: unknown): RawQuotaWindow[] {
	const windows: RawQuotaWindow[] = [];
	const root = asRecord(body);
	const snapshots = asRecord(root?.quotaSnapshots) ?? asRecord(root?.quota_snapshots);
	if (snapshots !== undefined) {
		const premium = asRecord(snapshots.premiumInteractions) ?? asRecord(snapshots.premium_interactions);
		if (premium !== undefined) {
			const remaining = numberOrNull(premium.remainingPercent ?? premium.remaining_percent ?? premium.percentRemaining);
			if (remaining !== null) {
				windows.push({
					kind: "premium",
					usedPercent: round1(100 - (clampPercent(remaining) ?? 0)),
					remainingPercent: round1(clampPercent(remaining) ?? 0),
				});
			}
		}
		const chat = asRecord(snapshots.chat);
		if (chat !== undefined) {
			const remaining = numberOrNull(chat.remainingPercent ?? chat.remaining_percent ?? chat.percentRemaining);
			if (remaining !== null) {
				windows.push({
					kind: "chat",
					usedPercent: round1(100 - (clampPercent(remaining) ?? 0)),
					remainingPercent: round1(clampPercent(remaining) ?? 0),
				});
			}
		}
	}
	return windows;
}

/** GitHub Copilot quota snapshots (token from the device flow). */
export const copilotDeviceAdapter: AccountAdapter = {
	id: "copilot-device",
	mode: "subscription",
	async collect(ctx) {
		const tokenRef = ctx.spec.apiKeyRef ?? COPILOT_TOKEN_REF;
		const token = await resolveCredential(ctx.credentials, tokenRef);
		if (token === "") {
			return { status: "not-configured", plan: "Copilot", missingCredentials: [tokenRef], windows: [] };
		}
		try {
			const body = await requestJson(
				COPILOT_USAGE_URL,
				{
					headers: {
						authorization: `token ${token}`,
						accept: "application/json",
						"editor-version": "vscode/1.96.2",
						"editor-plugin-version": "copilot-chat/0.26.7",
						"user-agent": "GitHubCopilotChat/0.26.7",
						"x-github-api-version": "2025-04-01",
					},
				},
				ctx.deps,
			);
			const windows = parseCopilotUsage(body);
			const root = asRecord(body);
			const plan = nonEmptyString(root?.copilotPlan ?? root?.copilot_plan ?? root?.plan) ?? "Copilot";
			return { status: windows.length > 0 ? "ok" : "invalid-response", plan, windows };
		} catch (error) {
			return { status: statusOfError(error), plan: "Copilot", windows: [] };
		}
	},
};
//#endregion

//#region cursor subscription
function parseCursorUsage(body: unknown): RawQuotaWindow[] {
	const windows: RawQuotaWindow[] = [];
	const planUsage = asRecord(asRecord(body)?.planUsage);
	if (planUsage !== undefined) {
		const totalPercent = numberOrNull(planUsage.totalPercentUsed);
		if (totalPercent !== null) {
			windows.push({
				kind: "monthly",
				usedPercent: round1(clampPercent(totalPercent) ?? 0),
				remainingPercent: round1(100 - (clampPercent(totalPercent) ?? 0)),
			});
		} else {
			// Team accounts use dollar amounts.
			const limit = numberOrNull(planUsage.limit);
			const remaining = numberOrNull(planUsage.remaining);
			if (limit !== null && remaining !== null && limit > 0) {
				const usedPercent = round1(clampPercent(((limit - remaining) / limit) * 100) ?? 0);
				windows.push({ kind: "monthly", usedPercent, remainingPercent: round1(100 - usedPercent) });
			}
		}
		const autoPercent = numberOrNull(planUsage.autoPercentUsed);
		if (autoPercent !== null) {
			windows.push({
				kind: "auto",
				usedPercent: round1(clampPercent(autoPercent) ?? 0),
				remainingPercent: round1(100 - (clampPercent(autoPercent) ?? 0)),
			});
		}
	}
	return windows;
}

/** Cursor plan usage via the dashboard Connect RPC endpoint. */
export const cursorSubscriptionAdapter: AccountAdapter = {
	id: "cursor-subscription",
	mode: "subscription",
	async collect(ctx) {
		const tokenRef = ctx.spec.apiKeyRef ?? CURSOR_TOKEN_REF;
		const token = await resolveCredential(ctx.credentials, tokenRef);
		if (token === "") {
			return { status: "not-configured", plan: "Cursor Pro", missingCredentials: [tokenRef], windows: [] };
		}
		try {
			const body = await requestJson(
				CURSOR_USAGE_URL,
				{
					method: "POST",
					headers: {
						authorization: `Bearer ${token}`,
						accept: "application/json",
						"content-type": "application/json",
						"connect-protocol-version": "1",
					},
					body: JSON.stringify({}),
				},
				ctx.deps,
			);
			const windows = parseCursorUsage(body);
			const plan = nonEmptyString(asRecord(body)?.planName ?? asRecord(body)?.plan_name) ?? "Cursor Pro";
			return { status: windows.length > 0 ? "ok" : "invalid-response", plan, windows };
		} catch (error) {
			return { status: statusOfError(error), plan: "Cursor Pro", windows: [] };
		}
	},
};
//#endregion

//#region grok subscription
function parseGrokBilling(body: unknown): RawQuotaWindow[] {
	const windows: RawQuotaWindow[] = [];
	const config = asRecord(asRecord(body)?.config);
	if (config !== undefined) {
		const monthlyLimit = numberOrNull(asRecord(config.monthlyLimit)?.val ?? config.monthlyLimit);
		const used = numberOrNull(asRecord(config.used)?.val ?? config.used);
		if (monthlyLimit !== null && used !== null && monthlyLimit > 0) {
			const usedPercent = round1(clampPercent((used / monthlyLimit) * 100) ?? 0);
			windows.push({ kind: "monthly", usedPercent, remainingPercent: round1(100 - usedPercent) });
		}
	}
	return windows;
}

/** Grok subscription billing via the CLI chat proxy. */
export const grokSubscriptionAdapter: AccountAdapter = {
	id: "grok-subscription",
	mode: "subscription",
	async collect(ctx) {
		const tokenRef = ctx.spec.apiKeyRef ?? GROK_TOKEN_REF;
		const token = await resolveCredential(ctx.credentials, tokenRef);
		if (token === "") {
			return { status: "not-configured", plan: "Grok Build", missingCredentials: [tokenRef], windows: [] };
		}
		try {
			const body = await requestJson(
				GROK_BILLING_URL,
				{
					headers: {
						authorization: `Bearer ${token}`,
						"x-xai-token-auth": "xai-grok-cli",
						accept: "application/json",
					},
				},
				ctx.deps,
			);
			const windows = parseGrokBilling(body);
			const root = asRecord(body);
			const tier = nonEmptyString(root?.subscription_tier_display ?? root?.tier) ?? "Grok Build";
			return { status: windows.length > 0 ? "ok" : "invalid-response", plan: tier, windows };
		} catch (error) {
			return { status: statusOfError(error), plan: "Grok Build", windows: [] };
		}
	},
};
//#endregion

//#region amp subscription
function parseAmpBalance(displayText: unknown): {
	balance: { remaining: number; total: number } | null;
	credits: number | null;
} {
	if (typeof displayText !== "string") return { balance: null, credits: null };
	// Parse "Amp Free: $remaining/$total remaining".
	const freeMatch = /\$([0-9]+(?:\.[0-9]+)?)\/\$([0-9]+(?:\.[0-9]+)?)\s+remaining/.exec(displayText);
	// Parse "Individual credits: $N remaining".
	const creditsMatch = /Individual credits:\s*\$([0-9]+(?:\.[0-9]+)?)\s+remaining/.exec(displayText);
	return {
		balance:
			freeMatch !== null && freeMatch[1] !== undefined && freeMatch[2] !== undefined
				? { remaining: Number(freeMatch[1]), total: Number(freeMatch[2]) }
				: null,
		credits: creditsMatch !== null && creditsMatch[1] !== undefined ? Number(creditsMatch[1]) : null,
	};
}

/** Amp balance via the internal RPC endpoint. */
export const ampSubscriptionAdapter: AccountAdapter = {
	id: "amp-subscription",
	mode: "subscription",
	async collect(ctx) {
		const apiKeyRef = ctx.spec.apiKeyRef ?? AMP_API_KEY_REF;
		const apiKey = await resolveCredential(ctx.credentials, apiKeyRef);
		if (apiKey === "") {
			return { status: "not-configured", plan: "Amp", missingCredentials: [apiKeyRef], windows: [] };
		}
		try {
			const body = await requestJson(
				AMP_BALANCE_URL,
				{
					method: "POST",
					headers: {
						authorization: `Bearer ${apiKey}`,
						accept: "application/json",
						"content-type": "application/json",
					},
					body: JSON.stringify({ method: "userDisplayBalanceInfo", params: {} }),
				},
				ctx.deps,
			);
			const root = asRecord(body);
			const displayText = asRecord(root?.result)?.displayText ?? root?.displayText;
			const parsed = parseAmpBalance(displayText);
			const windows: RawQuotaWindow[] = [];
			if (parsed.balance !== null && parsed.balance.total > 0) {
				const usedPercent = round1(
					clampPercent(((parsed.balance.total - parsed.balance.remaining) / parsed.balance.total) * 100) ?? 0,
				);
				windows.push({ kind: "free", usedPercent, remainingPercent: round1(100 - usedPercent) });
			}
			if (parsed.credits !== null && parsed.credits > 0) {
				// Credits are a balance-style metric; represent as a window with unknown total.
				windows.push({ kind: "credits", usedPercent: 0, remainingPercent: 100 });
			}
			const plan = typeof displayText === "string" && displayText.includes("Amp Free") ? "Amp Free" : "Amp";
			return { status: windows.length > 0 ? "ok" : "invalid-response", plan, windows };
		} catch (error) {
			return { status: statusOfError(error), plan: "Amp", windows: [] };
		}
	},
};
//#endregion
