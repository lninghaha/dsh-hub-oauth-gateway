import {
	dashscopeBalanceAdapter,
	deepseekBalanceAdapter,
	generalBalanceAdapter,
	moonshotBalanceAdapter,
	openrouterBalanceAdapter,
	siliconflowBalanceAdapter,
	zaiBalanceAdapter,
} from "./adapters/balance-schemes.js";
import { kimiTokenPlanAdapter, minimaxTokenPlanAdapter, zaiTokenPlanAdapter } from "./adapters/coding-plans.js";
import { declarativeAdapter } from "./adapters/declarative.js";
import { newApiAdapter } from "./adapters/new-api.js";
import {
	ampSubscriptionAdapter,
	claudeOauthAdapter,
	codexWhamAdapter,
	copilotDeviceAdapter,
	cursorSubscriptionAdapter,
	geminiQuotaAdapter,
	grokSubscriptionAdapter,
} from "./adapters/oauth-subscriptions.js";
import { openCodeGoAdapter } from "./adapters/opencode-go.js";
import { sub2ApiAdapter } from "./adapters/sub2api.js";
import type { AccountAdapter, ProviderDescriptor } from "./types.js";

export const BUILTIN_ACCOUNT_ADAPTERS: readonly AccountAdapter[] = Object.freeze([
	deepseekBalanceAdapter,
	openrouterBalanceAdapter,
	moonshotBalanceAdapter,
	zaiBalanceAdapter,
	dashscopeBalanceAdapter,
	siliconflowBalanceAdapter,
	generalBalanceAdapter,
	newApiAdapter,
	sub2ApiAdapter,
	openCodeGoAdapter,
	zaiTokenPlanAdapter,
	kimiTokenPlanAdapter,
	minimaxTokenPlanAdapter,
	claudeOauthAdapter,
	codexWhamAdapter,
	geminiQuotaAdapter,
	copilotDeviceAdapter,
	cursorSubscriptionAdapter,
	grokSubscriptionAdapter,
	ampSubscriptionAdapter,
	declarativeAdapter,
]);

export class AccountAdapterRegistry {
	readonly #adapters = new Map<string, AccountAdapter>();

	constructor(adapters: readonly AccountAdapter[] = BUILTIN_ACCOUNT_ADAPTERS) {
		for (const adapter of adapters) {
			if (this.#adapters.has(adapter.id)) throw new Error(`duplicate account adapter id "${adapter.id}"`);
			this.#adapters.set(adapter.id, adapter);
		}
	}

	get(id: string | null | undefined): AccountAdapter | null {
		return id === null || id === undefined ? null : (this.#adapters.get(id) ?? null);
	}

	has(id: string): boolean {
		return this.#adapters.has(id);
	}

	list(): readonly AccountAdapter[] {
		return [...this.#adapters.values()];
	}
}

const PROVIDER_DEFAULTS: Readonly<Record<string, string>> = Object.freeze({
	"deepseek-official": "deepseek-balance",
	deepseek: "deepseek-balance",
	openrouter: "openrouter-balance",
	moonshotai: "moonshot-balance",
	"moonshotai-cn": "moonshot-balance",
	kimi: "moonshot-balance",
	zai: "zai-token-plan",
	"zai-coding-cn": "zai-token-plan",
	"kimi-coding": "kimi-token-plan",
	"kimi-for-coding": "kimi-token-plan",
	minimax: "minimax-token-plan",
	minimaxi: "minimax-token-plan",
	"minimax-cn": "minimax-token-plan",
	"minimax-coding": "minimax-token-plan",
	claude: "claude-oauth",
	"claude-code": "claude-oauth",
	codex: "codex-wham",
	"openai-codex": "codex-wham",
	gemini: "gemini-quota",
	"gemini-cli": "gemini-quota",
	copilot: "copilot-device",
	"github-copilot": "copilot-device",
	cursor: "cursor-subscription",
	grok: "grok-subscription",
	"xai-grok": "grok-subscription",
	amp: "amp-subscription",
	ampcode: "amp-subscription",
	passion: "sub2api",
	"opencode-go": "opencode-go",
	dashscope: "dashscope-balance",
	bailian: "dashscope-balance",
	"alibaba-dashscope": "dashscope-balance",
	siliconflow: "siliconflow-balance",
	"silicon-flow": "siliconflow-balance",
});

export function defaultAdapterId(provider: ProviderDescriptor): string | null {
	const direct = PROVIDER_DEFAULTS[provider.id];
	if (direct !== undefined) return direct;
	try {
		const hostname = new URL(provider.baseURL ?? "").hostname.toLowerCase();
		if (hostname === "passionapi.com" || hostname.endsWith(".passionapi.com")) return "sub2api";
	} catch {
		// Malformed provider URLs are reported when the selected adapter runs.
	}
	return null;
}
