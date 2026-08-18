import { type AccountAdapterRegistry, defaultAdapterId } from "./registry.js";
import type { AccountConfig, AccountSpec, MonitorConfig, MonitorProfileConfig, ProviderDescriptor } from "./types.js";

const OPENROUTER_MANAGEMENT_REF = "OPENROUTER_MANAGEMENT_KEY";

export const COMPATIBILITY_ACCOUNT_PROVIDERS: readonly ProviderDescriptor[] = Object.freeze([
	{ id: "opencode-go", displayName: "OpenCode Go", apiKeyEnv: "OPENCODE_GO_API_KEY" },
	{ id: "zai", displayName: "Z.ai", apiKeyEnv: "ZAI_API_KEY", baseURL: "https://api.z.ai" },
	{
		id: "zai-team",
		displayName: "GLM Team",
		apiKeyEnv: "ZAI_TEAM_API_KEY",
		baseURL: "https://open.bigmodel.cn",
	},
	{
		id: "volcengine",
		displayName: "Volcengine Coding Plan",
		apiKeyEnv: "VOLCENGINE_ACCESS_KEY",
		baseURL: "https://open.volcengineapi.com",
	},
	{ id: "antigravity", displayName: "Antigravity", apiKeyEnv: "ANTIGRAVITY_ACCESS_TOKEN" },
	{ id: "ollama-cloud", displayName: "Ollama Cloud", apiKeyEnv: "OLLAMA_CLOUD_SESSION", baseURL: "https://ollama.com" },
	{ id: "claude", displayName: "Claude", apiKeyEnv: "CLAUDE_OAUTH_TOKEN" },
	{ id: "codex", displayName: "Codex", apiKeyEnv: "CODEX_ACCESS_TOKEN" },
	{ id: "gemini", displayName: "Gemini", apiKeyEnv: "GEMINI_ACCESS_TOKEN" },
	{ id: "copilot", displayName: "GitHub Copilot", apiKeyEnv: "GITHUB_COPILOT_TOKEN" },
	{
		id: "dashscope",
		displayName: "DashScope",
		apiKeyEnv: "DASHSCOPE_API_KEY",
		baseURL: "https://dashscope.aliyuncs.com",
	},
	{
		id: "siliconflow",
		displayName: "SiliconFlow",
		apiKeyEnv: "SILICONFLOW_API_KEY",
		baseURL: "https://api.siliconflow.cn",
	},
	{ id: "cursor", displayName: "Cursor", apiKeyEnv: "CURSOR_ACCESS_TOKEN" },
	{ id: "grok", displayName: "Grok", apiKeyEnv: "GROK_ACCESS_TOKEN" },
	{ id: "amp", displayName: "Amp", apiKeyEnv: "AMP_API_KEY" },
]);

export function includeCompatibilityProviders(
	providers: readonly ProviderDescriptor[],
	compatibility = true,
): ProviderDescriptor[] {
	const result = [...providers];
	if (!compatibility) return result;
	const ids = new Set(result.map(({ id }) => id));
	for (const provider of COMPATIBILITY_ACCOUNT_PROVIDERS) {
		if (!ids.has(provider.id)) {
			result.push(provider);
			ids.add(provider.id);
		}
	}
	return result;
}

function configKeyOf(
	provider: ProviderDescriptor,
	monitor: MonitorConfig,
	adapter: string | null,
	profileId: string,
): string {
	return JSON.stringify({
		id: provider.id,
		profileId,
		displayName: provider.displayName ?? null,
		apiKeyEnv: provider.apiKeyEnv ?? null,
		baseURL: provider.baseURL ?? null,
		adapter,
		monitor,
	});
}

function mergeProfileMonitor(base: MonitorConfig, profile: MonitorProfileConfig): MonitorConfig {
	return {
		...base,
		...(profile.credentialRef === undefined ? {} : { credentialRef: profile.credentialRef }),
		...(profile.secretKeyRef === undefined ? {} : { secretKeyRef: profile.secretKeyRef }),
		...(profile.usageBaseURL === undefined ? {} : { usageBaseURL: profile.usageBaseURL }),
		...(profile.region === undefined ? {} : { region: profile.region }),
		...(profile.fallbackCredentialRef === undefined
			? {}
			: { fallbackCredentialRef: profile.fallbackCredentialRef }),
		...(profile.fallbackUserIdRef === undefined ? {} : { fallbackUserIdRef: profile.fallbackUserIdRef }),
		profiles: undefined,
	};
}

function buildSpec(
	provider: ProviderDescriptor,
	monitor: MonitorConfig,
	registry: AccountAdapterRegistry,
	profileId: string,
	displayName: string,
): AccountSpec {
	const adapterId = monitor.adapter ?? defaultAdapterId(provider);
	const adapter = registry.get(adapterId);
	const mode = adapterId === "declarative" ? (monitor.mode ?? null) : (adapter?.mode ?? null);
	const apiKeyRef =
		monitor.credentialRef ?? (adapterId === "openrouter-balance" ? OPENROUTER_MANAGEMENT_REF : provider.apiKeyEnv);
	return {
		id: provider.id,
		profileId,
		displayName,
		adapter: adapterId,
		mode,
		...(apiKeyRef === undefined ? {} : { apiKeyRef }),
		...((monitor.usageBaseURL ?? provider.baseURL) === undefined
			? {}
			: { baseURL: monitor.usageBaseURL ?? provider.baseURL }),
		...(provider.baseURL === undefined ? {} : { providerBaseURL: provider.baseURL }),
		monitor,
		configKey: configKeyOf(provider, monitor, adapterId, profileId),
	};
}

export function resolveAccountSpec(
	provider: ProviderDescriptor,
	config: AccountConfig,
	registry: AccountAdapterRegistry,
): AccountSpec {
	const monitor = config.monitors[provider.id] ?? {};
	return buildSpec(provider, monitor, registry, "", provider.displayName ?? provider.id);
}

export function resolveAccountSpecs(
	providers: readonly ProviderDescriptor[],
	config: AccountConfig,
	registry: AccountAdapterRegistry,
	compatibility = true,
): AccountSpec[] {
	const available = includeCompatibilityProviders(providers, compatibility);
	const known = new Set(available.map(({ id }) => id));
	const unknown = Object.keys(config.monitors).filter((providerId) => !known.has(providerId));
	if (unknown.length > 0) throw new Error(`account monitor references unknown provider: ${unknown.join(", ")}`);
	const specs: AccountSpec[] = [];
	for (const provider of available) {
		const monitor = config.monitors[provider.id] ?? {};
		const profiles = monitor.profiles;
		if (profiles === undefined || profiles.length === 0) {
			specs.push(buildSpec(provider, monitor, registry, "", provider.displayName ?? provider.id));
			continue;
		}
		for (const profile of profiles) {
			const merged = mergeProfileMonitor(monitor, profile);
			const label = profile.label?.trim() || profile.id;
			const displayName = `${provider.displayName ?? provider.id} · ${label}`;
			specs.push(buildSpec(provider, merged, registry, profile.id, displayName));
		}
	}
	return specs;
}
