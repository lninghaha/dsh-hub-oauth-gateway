import type { PriceRule } from "../shared/domain.js";

export interface PricingPreset {
	readonly id: string;
	readonly labelKey: "pricing.preset.openai" | "pricing.preset.anthropic" | "pricing.preset.deepseek";
	readonly rules: readonly Omit<PriceRule, "id" | "updatedAt">[];
}

export const PRICING_PRESETS: readonly PricingPreset[] = Object.freeze([
	{
		id: "openai",
		labelKey: "pricing.preset.openai",
		rules: [
			{
				providerPattern: "openai*",
				modelPattern: "gpt-4o*",
				inputPerMillion: 2.5,
				outputPerMillion: 10,
				cacheReadPerMillion: 1.25,
				cacheWritePerMillion: null,
				currency: "USD",
				effectiveFrom: 0,
				source: "user",
			},
			{
				providerPattern: "openai*",
				modelPattern: "gpt-4o-mini*",
				inputPerMillion: 0.15,
				outputPerMillion: 0.6,
				cacheReadPerMillion: 0.075,
				cacheWritePerMillion: null,
				currency: "USD",
				effectiveFrom: 0,
				source: "user",
			},
		],
	},
	{
		id: "anthropic",
		labelKey: "pricing.preset.anthropic",
		rules: [
			{
				providerPattern: "anthropic*",
				modelPattern: "claude-sonnet*",
				inputPerMillion: 3,
				outputPerMillion: 15,
				cacheReadPerMillion: 0.3,
				cacheWritePerMillion: 3.75,
				currency: "USD",
				effectiveFrom: 0,
				source: "user",
			},
			{
				providerPattern: "anthropic*",
				modelPattern: "claude-haiku*",
				inputPerMillion: 0.8,
				outputPerMillion: 4,
				cacheReadPerMillion: 0.08,
				cacheWritePerMillion: 1,
				currency: "USD",
				effectiveFrom: 0,
				source: "user",
			},
		],
	},
	{
		id: "deepseek",
		labelKey: "pricing.preset.deepseek",
		rules: [
			{
				providerPattern: "deepseek*",
				modelPattern: "*",
				inputPerMillion: 0.27,
				outputPerMillion: 1.1,
				cacheReadPerMillion: 0.07,
				cacheWritePerMillion: null,
				currency: "USD",
				effectiveFrom: 0,
				source: "user",
			},
		],
	},
]);

export function materializePresetRules(preset: PricingPreset, currency: string, now = Date.now()): PriceRule[] {
	return preset.rules.map((rule, index) => ({
		...rule,
		id: `preset-${preset.id}-${index}-${now}`,
		currency,
		updatedAt: now,
	}));
}
