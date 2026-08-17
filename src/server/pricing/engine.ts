import type { CostEstimate } from "../../shared/contracts.js";
import type { PriceRule, UsageBuckets } from "../../shared/domain.js";

export interface PriceableUsage extends UsageBuckets {
	readonly providerId: string;
	readonly modelId: string;
	readonly occurredAt: number;
}

const SOURCE_PRIORITY: Readonly<Record<PriceRule["source"], number>> = Object.freeze({
	builtin: 0,
	imported: 1,
	user: 2,
});

function matches(pattern: string, value: string): boolean {
	if (pattern === "*") return true;
	const parts = pattern.split("*");
	if (parts.length === 1) return pattern === value;
	let offset = 0;
	for (let index = 0; index < parts.length; index += 1) {
		const part = parts[index];
		if (part === undefined || part === "") continue;
		const found = value.indexOf(part, offset);
		if (found < 0) return false;
		if (index === 0 && !pattern.startsWith("*") && found !== 0) return false;
		offset = found + part.length;
	}
	const tail = parts.at(-1) ?? "";
	return pattern.endsWith("*") || value.endsWith(tail);
}

function patternSpecificity(pattern: string): number {
	return pattern.replaceAll("*", "").length;
}

function compareRules(left: PriceRule, right: PriceRule): number {
	return (
		SOURCE_PRIORITY[right.source] - SOURCE_PRIORITY[left.source] ||
		patternSpecificity(right.providerPattern) - patternSpecificity(left.providerPattern) ||
		patternSpecificity(right.modelPattern) - patternSpecificity(left.modelPattern) ||
		right.effectiveFrom - left.effectiveFrom ||
		right.updatedAt - left.updatedAt
	);
}

export function selectPriceRule(
	usage: PriceableUsage,
	rules: readonly PriceRule[],
	currency: string,
): PriceRule | null {
	return (
		rules
			.filter(
				(rule) =>
					rule.currency === currency &&
					rule.effectiveFrom <= usage.occurredAt &&
					matches(rule.providerPattern, usage.providerId) &&
					matches(rule.modelPattern, usage.modelId),
			)
			.sort(compareRules)[0] ?? null
	);
}

interface BucketPrice {
	readonly tokens: number;
	readonly perMillion: number | null;
}

export function estimateUsageCost(
	usage: readonly PriceableUsage[],
	rules: readonly PriceRule[],
	currency: string,
): CostEstimate {
	let amount = 0;
	let totalTokens = 0;
	let coveredTokens = 0;
	for (const fact of usage) {
		const rule = selectPriceRule(fact, rules, currency);
		const buckets: readonly BucketPrice[] = [
			{ tokens: fact.inputTokens, perMillion: rule?.inputPerMillion ?? null },
			{ tokens: fact.outputTokens, perMillion: rule?.outputPerMillion ?? null },
			{ tokens: fact.cacheReadTokens, perMillion: rule?.cacheReadPerMillion ?? null },
			{ tokens: fact.cacheWriteTokens, perMillion: rule?.cacheWritePerMillion ?? null },
		];
		for (const bucket of buckets) {
			totalTokens += bucket.tokens;
			if (bucket.tokens === 0) continue;
			if (bucket.perMillion === null) continue;
			coveredTokens += bucket.tokens;
			amount += (bucket.tokens / 1_000_000) * bucket.perMillion;
		}
	}
	return {
		amount: coveredTokens === 0 && totalTokens > 0 ? null : Math.round(amount * 1_000_000_000) / 1_000_000_000,
		currency,
		coverageRatio: totalTokens === 0 ? 1 : coveredTokens / totalTokens,
		estimated: true,
	};
}
