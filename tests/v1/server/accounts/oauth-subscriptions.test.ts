import { describe, expect, it, vi } from "vitest";
import {
	claudeOauthAdapter,
	codexWhamAdapter,
	grokSubscriptionAdapter,
	parseCodexUsage,
	parseGrokBilling,
	parseGrokCredits,
} from "../../../../src/server/accounts/adapters/oauth-subscriptions.js";
import { buildAccountSnapshot } from "../../../../src/server/accounts/normalize.js";
import type { AccountSpec } from "../../../../src/server/accounts/types.js";

const publicLookup = vi.fn(async () => [{ address: "8.8.8.8", family: 4 }]);

function jwtWithAccountId(accountId: string): string {
	const header = Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url");
	const payload = Buffer.from(
		JSON.stringify({
			"https://api.openai.com/auth": { chatgpt_account_id: accountId },
		}),
	).toString("base64url");
	return `${header}.${payload}.sig`;
}

function spec(overrides: Partial<AccountSpec> = {}): AccountSpec {
	return {
		id: "codex",
		profileId: "",
		displayName: "Codex",
		adapter: "codex-wham",
		mode: "subscription",
		apiKeyRef: "CODEX_ACCESS_TOKEN",
		monitor: {},
		configKey: "{}",
		...overrides,
	};
}

function withFetch(fetchImpl: unknown) {
	return { fetch: fetchImpl as never, lookup: publicLookup };
}

function collectCtx(
	adapterSpec: AccountSpec,
	token: string,
	fetchImpl: unknown,
): Parameters<typeof codexWhamAdapter.collect>[0] {
	return {
		spec: adapterSpec,
		credentials: { resolve: async () => ({ value: token }) },
		deps: withFetch(fetchImpl),
		now: Date.now(),
		credential: token,
	};
}

describe("oauth subscription parsers", () => {
	it("parses Codex wham used_percent windows", () => {
		const windows = parseCodexUsage({
			rate_limit: {
				primary_window: { used_percent: 42.5, limit_window_seconds: 10_800, reset_at: 1_700_000_000 },
				secondary_window: { used_percent: 10, limit_window_seconds: 604_800, reset_at: 1_700_100_000 },
			},
		});
		expect(windows).toEqual([
			expect.objectContaining({ kind: "session", usedPercent: 42.5, remainingPercent: 57.5 }),
			expect.objectContaining({ kind: "weekly", usedPercent: 10, remainingPercent: 90 }),
		]);
	});

	it("falls back to Codex used/limit ratios", () => {
		const windows = parseCodexUsage({
			rate_limit: {
				primary_window: { used: 25, limit: 100, reset_at: "2026-01-01T00:00:00.000Z" },
			},
		});
		expect(windows).toEqual([expect.objectContaining({ kind: "session", usedPercent: 25, remainingPercent: 75 })]);
	});

	it("parses Grok billing and credits shapes", () => {
		expect(
			parseGrokBilling({
				config: { monthlyLimit: { val: 100 }, used: { val: 40 }, tier: "SuperGrok" },
			}),
		).toEqual([expect.objectContaining({ kind: "monthly", usedPercent: 40, remainingPercent: 60 })]);
		expect(parseGrokCredits({ credits: { limit: 200, remaining: 50 } })).toEqual([
			expect.objectContaining({ kind: "monthly", usedPercent: 75, remainingPercent: 25 }),
		]);
	});
});

describe("codexWhamAdapter", () => {
	it("requires chatgpt-account-id and sends it on success", async () => {
		const fetchImpl = vi.fn(async () => ({
			ok: true,
			status: 200,
			headers: { get: () => "application/json" },
			json: async () => ({
				plan: "Plus",
				rate_limit: {
					primary_window: { used_percent: 12, limit_window_seconds: 10_800, reset_at: 1_700_000_000 },
				},
			}),
		}));
		const token = jwtWithAccountId("acct-123");
		const result = await codexWhamAdapter.collect(collectCtx(spec(), token, fetchImpl));
		expect(result).toMatchObject({ status: "ok", plan: "Plus" });
		expect(result.windows?.[0]).toMatchObject({ kind: "session", usedPercent: 12 });
		expect(fetchImpl).toHaveBeenCalledWith(
			"https://chatgpt.com/backend-api/wham/usage",
			expect.objectContaining({
				headers: expect.objectContaining({
					authorization: `Bearer ${token}`,
					"chatgpt-account-id": "acct-123",
				}),
			}),
		);
	});

	it("returns missing-chatgpt-account-id without calling upstream", async () => {
		const fetchImpl = vi.fn();
		const result = await codexWhamAdapter.collect(collectCtx(spec(), "not-a-jwt", fetchImpl));
		expect(result).toMatchObject({
			status: "invalid-response",
			diagnosticCode: "missing-chatgpt-account-id",
			windows: [],
		});
		expect(fetchImpl).not.toHaveBeenCalled();
		const snapshot = buildAccountSnapshot(spec(), result, 1_700_000_000_000);
		expect(snapshot.warningCode).toBe("missing-chatgpt-account-id");
	});

	it("maps 401 to auth-error diagnostic", async () => {
		const result = await codexWhamAdapter.collect(
			collectCtx(
				spec(),
				jwtWithAccountId("acct-401"),
				vi.fn(async () => ({
					ok: false,
					status: 401,
					headers: { get: () => "application/json" },
					text: async () => "{}",
				})),
			),
		);
		expect(result).toMatchObject({ status: "unauthorized", diagnosticCode: "auth-error" });
	});
});

describe("claudeOauthAdapter diagnostics", () => {
	it("marks empty usage windows as invalid-response", async () => {
		const result = await claudeOauthAdapter.collect(
			collectCtx(
				spec({ id: "claude", adapter: "claude-oauth", apiKeyRef: "CLAUDE_OAUTH_TOKEN" }),
				"claude-token",
				vi.fn(async () => ({
					ok: true,
					status: 200,
					headers: { get: () => "application/json" },
					json: async () => ({}),
				})),
			),
		);
		expect(result).toMatchObject({ status: "invalid-response", diagnosticCode: "invalid-response" });
	});
});

describe("grokSubscriptionAdapter fallback", () => {
	it("falls back to grok.com credits when billing has no windows", async () => {
		const fetchImpl = vi.fn(async (url: string) => {
			if (String(url).includes("cli-chat-proxy")) {
				return {
					ok: true,
					status: 200,
					headers: { get: () => "application/json" },
					json: async () => ({ subscription_tier_display: "Grok Build", config: {} }),
				};
			}
			return {
				ok: true,
				status: 200,
				headers: { get: () => "application/json" },
				json: async () => ({ credits: { limit: 100, remaining: 25 } }),
			};
		});
		const result = await grokSubscriptionAdapter.collect(
			collectCtx(
				spec({ id: "grok", adapter: "grok-subscription", apiKeyRef: "GROK_ACCESS_TOKEN" }),
				"grok-token",
				fetchImpl,
			),
		);
		expect(result).toMatchObject({ status: "ok", plan: "Grok Build" });
		expect(result.windows?.[0]).toMatchObject({ kind: "monthly", usedPercent: 75, remainingPercent: 25 });
		expect(fetchImpl).toHaveBeenCalledTimes(2);
	});
});
