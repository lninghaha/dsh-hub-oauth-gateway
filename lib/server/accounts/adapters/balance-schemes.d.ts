/**
 * Built-in balance adapters: DeepSeek, OpenRouter, Moonshot/Kimi, Z.ai/GLM,
 * Alibaba DashScope, and SiliconFlow, plus the generic `/user/balance`
 * template. Every adapter normalizes provider-specific data into one account model.
 */
import type { AccountAdapter, AccountDeps } from "../types.js";
interface SchemeBalance {
    readonly isAvailable?: boolean | undefined;
    readonly currency?: string | undefined;
    readonly total?: unknown;
    readonly used?: unknown;
    readonly limit?: unknown;
    readonly granted?: unknown;
    readonly toppedUp?: unknown;
}
/** Scheme ids with built-in support (for docs/tests). */
export declare function supportedBalanceSchemes(): string[];
/** Map a provider id (dsh adapter id or pi-ai route) to a balance scheme id. */
export declare function balanceSchemeOf(providerId: string): string | null;
/** Query one provider's balance scheme. Throws on transport/HTTP errors. */
export declare function queryBalanceScheme(scheme: string, baseURL: string, apiKey: string, deps?: AccountDeps): Promise<SchemeBalance>;
export declare const deepseekBalanceAdapter: AccountAdapter;
export declare const openrouterBalanceAdapter: AccountAdapter;
export declare const moonshotBalanceAdapter: AccountAdapter;
export declare const zaiBalanceAdapter: AccountAdapter;
export declare const dashscopeBalanceAdapter: AccountAdapter;
export declare const siliconflowBalanceAdapter: AccountAdapter;
/** Generic `{origin}/user/balance` template for simple relay providers. */
export declare const generalBalanceAdapter: AccountAdapter;
export {};
//# sourceMappingURL=balance-schemes.d.ts.map