/**
 * Built-in balance adapters: DeepSeek, OpenRouter, Moonshot/Kimi, Z.ai/GLM,
 * Alibaba DashScope, and SiliconFlow, plus the generic `/user/balance`
 * template. Every adapter normalizes provider-specific data into one account model.
 */

import { ProviderError } from "../errors.js";
import { nonEmptyString, numberOrNull } from "../normalize.js";
import { requestJson } from "../transport.js";
import type { AccountAdapter, AccountDeps, RawBalance } from "../types.js";

interface SchemeBalance {
	readonly isAvailable?: boolean | undefined;
	readonly currency?: string | undefined;
	readonly total?: unknown;
	readonly used?: unknown;
	readonly limit?: unknown;
	readonly granted?: unknown;
	readonly toppedUp?: unknown;
}

interface BalanceScheme {
	readonly url: (baseURL: string) => string;
	readonly parse: (json: unknown) => SchemeBalance;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
	return value !== null && typeof value === "object" && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: undefined;
}

const SCHEMES: Record<string, BalanceScheme> = {
	/** DeepSeek: GET {origin}/user/balance — CNY balance_infos entry. */
	deepseek: {
		url: (baseURL) => new URL("/user/balance", baseURL).href,
		parse: (json) => {
			const root = asRecord(json);
			const infos = Array.isArray(root?.balance_infos) ? root.balance_infos : [];
			const info = infos.map(asRecord).find((entry) => entry?.currency === "CNY") ?? asRecord(infos[0]) ?? undefined;
			return {
				isAvailable: root?.is_available === true,
				currency: typeof info?.currency === "string" ? info.currency : undefined,
				total: info?.total_balance,
				granted: info?.granted_balance,
				toppedUp: info?.topped_up_balance,
			};
		},
	},
	/** OpenRouter account credits; the endpoint requires a Management Key. */
	openrouter: {
		url: (baseURL) => new URL("/api/v1/credits", baseURL).href,
		parse: (json) => {
			const data = asRecord(asRecord(json)?.data);
			const totalCredits = typeof data?.total_credits === "number" ? data.total_credits : undefined;
			const totalUsage = typeof data?.total_usage === "number" ? data.total_usage : undefined;
			const remaining = totalCredits !== undefined && totalUsage !== undefined ? totalCredits - totalUsage : undefined;
			return {
				isAvailable: remaining !== undefined ? remaining > 0 : undefined,
				currency: "USD",
				total: remaining,
				used: totalUsage,
				limit: totalCredits,
				granted: undefined,
				toppedUp: undefined,
			};
		},
	},
	/** Moonshot / Kimi: GET {origin}/v1/users/me/balance — available/cash/voucher. */
	moonshot: {
		url: (baseURL) => new URL("/v1/users/me/balance", baseURL).href,
		parse: (json) => {
			const data = asRecord(asRecord(json)?.data);
			const available = typeof data?.available_balance === "number" ? data.available_balance : undefined;
			const cash = typeof data?.cash_balance === "number" ? data.cash_balance : undefined;
			const voucher = typeof data?.voucher_balance === "number" ? data.voucher_balance : undefined;
			return {
				isAvailable: available !== undefined ? available > 0 : undefined,
				currency: typeof data?.currency === "string" ? data.currency : undefined,
				total: available,
				granted: voucher,
				toppedUp: cash,
			};
		},
	},
	/** Z.AI / GLM: GET {origin}/api/paas/v4/balance — total + available. */
	zai: {
		url: (baseURL) => new URL("/api/paas/v4/balance", baseURL).href,
		parse: (json) => {
			const data = asRecord(asRecord(json)?.data);
			const total =
				typeof data?.total_balance === "number"
					? data.total_balance
					: typeof data?.available_balance === "number"
						? data.available_balance
						: undefined;
			const available = typeof data?.available_balance === "number" ? data.available_balance : undefined;
			return {
				isAvailable: total !== undefined ? total > 0 : undefined,
				currency: typeof data?.currency === "string" ? data.currency : undefined,
				total,
				granted: undefined,
				toppedUp: available,
			};
		},
	},
	/** Alibaba DashScope / Bailian: GET {origin}/api/v1/api-key/dashboard — CNY balance. */
	dashscope: {
		url: (baseURL) => new URL("/api/v1/api-key/dashboard", baseURL).href,
		parse: (json) => {
			const data = asRecord(asRecord(json)?.data) ?? asRecord(json);
			const remaining =
				typeof data?.available_balance === "number"
					? data.available_balance
					: typeof data?.balance === "number"
						? data.balance
						: undefined;
			const total = typeof data?.total_balance === "number" ? data.total_balance : undefined;
			const used = typeof data?.used_balance === "number" ? data.used_balance : undefined;
			return {
				isAvailable: remaining !== undefined ? remaining > 0 : undefined,
				currency: typeof data?.currency === "string" ? data.currency : "CNY",
				total: remaining,
				used,
				limit: total,
				granted: undefined,
				toppedUp: undefined,
			};
		},
	},
	/** SiliconFlow: GET {origin}/v1/user/info — balance in CNY. */
	siliconflow: {
		url: (baseURL) => new URL("/v1/user/info", baseURL).href,
		parse: (json) => {
			const data = asRecord(asRecord(json)?.data) ?? asRecord(json);
			const remaining =
				typeof data?.balance === "number"
					? data.balance
					: typeof data?.available_balance === "number"
						? data.available_balance
						: undefined;
			const total = typeof data?.total_balance === "number" ? data.total_balance : undefined;
			const charged = typeof data?.charged_balance === "number" ? data.charged_balance : undefined;
			return {
				isAvailable: remaining !== undefined ? remaining > 0 : undefined,
				currency: typeof data?.currency === "string" ? data.currency : "CNY",
				total: remaining,
				limit: total,
				granted: undefined,
				toppedUp: charged,
			};
		},
	},
};

/** Scheme ids with built-in support (for docs/tests). */
export function supportedBalanceSchemes(): string[] {
	return Object.keys(SCHEMES);
}

/** Map a provider id (dsh adapter id or pi-ai route) to a balance scheme id. */
export function balanceSchemeOf(providerId: string): string | null {
	if (providerId === "deepseek-official" || providerId === "deepseek") return "deepseek";
	if (providerId === "openrouter") return "openrouter";
	if (
		providerId === "moonshotai" ||
		providerId === "moonshotai-cn" ||
		providerId === "kimi" ||
		providerId === "kimi-coding"
	) {
		return "moonshot";
	}
	if (providerId === "zai" || providerId === "zai-coding-cn") return "zai";
	if (providerId === "dashscope" || providerId === "bailian" || providerId === "alibaba-dashscope") return "dashscope";
	if (providerId === "siliconflow" || providerId === "silicon-flow") return "siliconflow";
	return null;
}

/** Query one provider's balance scheme. Throws on transport/HTTP errors. */
export async function queryBalanceScheme(
	scheme: string,
	baseURL: string,
	apiKey: string,
	deps: AccountDeps = {},
): Promise<SchemeBalance> {
	const spec = SCHEMES[scheme];
	if (spec === undefined) throw new Error(`no balance scheme "${scheme}"`);
	try {
		const body = await requestJson(
			spec.url(baseURL),
			{ headers: { authorization: `Bearer ${apiKey}`, accept: "application/json" } },
			deps,
		);
		return spec.parse(body);
	} catch (error) {
		if (error instanceof ProviderError) throw error;
		throw new ProviderError("invalid-response", "balance API returned invalid JSON");
	}
}

function schemeBalanceToRaw(raw: SchemeBalance): RawBalance {
	const remaining = numberOrNull(raw.total);
	if (remaining === null) throw new ProviderError("invalid-response", "balance response is missing a numeric amount");
	const used = numberOrNull(raw.used);
	const total = numberOrNull(raw.limit);
	return {
		remaining,
		...(used === null ? {} : { used }),
		...(total === null ? {} : { total }),
		currency: nonEmptyString(raw.currency) ?? "USD",
		unlimited: false,
		expiresAt: null,
		available: raw.isAvailable !== false,
		breakdown: {
			granted: numberOrNull(raw.granted),
			toppedUp: numberOrNull(raw.toppedUp),
		},
	};
}

/** Build the adapter for one built-in balance scheme. */
function schemeAdapter(scheme: string): AccountAdapter {
	return {
		id: `${scheme}-balance`,
		mode: "balance",
		async collect(ctx) {
			const raw = await queryBalanceScheme(scheme, ctx.spec.baseURL ?? "", ctx.credential, ctx.deps);
			const balance = schemeBalanceToRaw(raw);
			// DeepSeek's explicit `is_available` flag is an upstream account state.
			// Other schemes infer this field from a numeric zero balance, which
			// remains a valid successful response and should still render the
			// critical balance.
			const status = scheme === "deepseek" && raw.isAvailable === false ? "unavailable" : "ok";
			return { status, balance };
		},
	};
}

export const deepseekBalanceAdapter: AccountAdapter = schemeAdapter("deepseek");
export const openrouterBalanceAdapter: AccountAdapter = schemeAdapter("openrouter");
export const moonshotBalanceAdapter: AccountAdapter = schemeAdapter("moonshot");
export const zaiBalanceAdapter: AccountAdapter = schemeAdapter("zai");
export const dashscopeBalanceAdapter: AccountAdapter = schemeAdapter("dashscope");
export const siliconflowBalanceAdapter: AccountAdapter = schemeAdapter("siliconflow");

/** Generic `{origin}/user/balance` template for simple relay providers. */
export const generalBalanceAdapter: AccountAdapter = {
	id: "general",
	mode: "balance",
	async collect(ctx) {
		const body = await requestJson(
			new URL("/user/balance", ctx.spec.baseURL ?? "").href,
			{
				headers: { authorization: `Bearer ${ctx.credential}`, accept: "application/json" },
			},
			ctx.deps,
		);
		const root = asRecord(body);
		const remaining = numberOrNull(root?.balance);
		if (remaining === null) throw new ProviderError("invalid-response", "general balance response is missing balance");
		return {
			status: "ok",
			balance: {
				remaining,
				currency: nonEmptyString(root?.currency) ?? "USD",
				unlimited: false,
				expiresAt: null,
			},
		};
	},
};
