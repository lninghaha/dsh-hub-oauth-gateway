import type { ProviderDescriptor } from "../accounts/types.js";

export interface SettingsLike {
	get(namespace: string): unknown;
}

const DEEPSEEK_DEFAULTS = Object.freeze({
	apiKeyEnv: "DEEPSEEK_API_KEY",
	baseURL: "https://api.deepseek.com",
});

function recordOf(value: unknown): Record<string, unknown> | null {
	return value !== null && typeof value === "object" && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: null;
}

function optionalString(value: unknown): string | undefined {
	return typeof value === "string" && value.trim() !== "" ? value.trim() : undefined;
}

export async function configuredProviders(settings: SettingsLike | undefined): Promise<readonly ProviderDescriptor[]> {
	const providers: ProviderDescriptor[] = [];
	const deepseek = recordOf(settings?.get("llm-deepseek"));
	providers.push({
		id: "deepseek-official",
		displayName: "DeepSeek",
		apiKeyEnv: optionalString(deepseek?.apiKeyEnv) ?? DEEPSEEK_DEFAULTS.apiKeyEnv,
		baseURL: optionalString(deepseek?.baseURL) ?? DEEPSEEK_DEFAULTS.baseURL,
	});
	const pi = recordOf(settings?.get("llm-pi-ai"));
	const profiles = recordOf(pi?.providers);
	for (const [route, raw] of Object.entries(profiles ?? {})) {
		const profile = recordOf(raw);
		if (profile === null) continue;
		const apiKeyEnv = optionalString(profile.apiKeyEnv);
		const baseURL = optionalString(profile.baseURL);
		providers.push({
			id: route,
			displayName: optionalString(profile.displayName) ?? route,
			...(apiKeyEnv === undefined ? {} : { apiKeyEnv }),
			...(baseURL === undefined ? {} : { baseURL }),
		});
	}
	const seen = new Set<string>();
	return providers.filter(({ id }) => {
		if (seen.has(id)) return false;
		seen.add(id);
		return true;
	});
}
