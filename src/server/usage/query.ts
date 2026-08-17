import type { BreakdownData, OverviewData, SeriesData } from "../../shared/contracts.js";
import type { UsageBuckets, UsageQuery } from "../../shared/domain.js";
import { totalTokens } from "../../shared/domain.js";
import { estimateUsageCost } from "../pricing/engine.js";
import type { PricingRepository } from "../pricing/repository.js";
import type { UsageFact } from "./projector.js";
import type { UsageRepository } from "./repository.js";
import { bucketKey, bucketTimestamp } from "./time.js";

interface UsageTotals extends UsageBuckets {
	requests: number;
}

function emptyTotals(): UsageTotals {
	return { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, requests: 0 };
}

function addFact(total: UsageTotals, fact: UsageFact): UsageTotals {
	total.inputTokens += fact.inputTokens;
	total.outputTokens += fact.outputTokens;
	total.cacheReadTokens += fact.cacheReadTokens;
	total.cacheWriteTokens += fact.cacheWriteTokens;
	total.requests += 1;
	return total;
}

function aggregate(facts: readonly UsageFact[]): UsageTotals {
	return facts.reduce(addFact, emptyTotals());
}

function bucketsOf(total: UsageTotals): UsageBuckets {
	return {
		inputTokens: total.inputTokens,
		outputTokens: total.outputTokens,
		cacheReadTokens: total.cacheReadTokens,
		cacheWriteTokens: total.cacheWriteTokens,
	};
}

function cacheHitRate(total: UsageBuckets): number | null {
	const prompt = total.inputTokens + total.cacheReadTokens + total.cacheWriteTokens;
	return prompt === 0 ? null : total.cacheReadTokens / prompt;
}

function filterFor(query: UsageQuery, from = query.from, to = query.to) {
	return {
		from,
		to,
		providers: query.providers,
		models: query.models,
	};
}

type SeriesPoint = SeriesData["points"][number];

function nextTimestamp(timestamp: number, granularity: UsageQuery["granularity"], steps: number): number {
	if (granularity === "month") {
		const value = new Date(timestamp);
		value.setUTCMonth(value.getUTCMonth() + steps);
		return value.getTime();
	}
	const duration = granularity === "hour" ? 3_600_000 : granularity === "day" ? 86_400_000 : 7 * 86_400_000;
	return timestamp + duration * steps;
}

function linearForecast(points: readonly SeriesPoint[], query: UsageQuery): SeriesPoint[] {
	if (points.length < 2) return [];
	const horizon =
		query.granularity === "hour" ? 12 : query.granularity === "day" ? 7 : query.granularity === "week" ? 4 : 3;
	const sample = points.slice(-Math.min(points.length, query.granularity === "hour" ? 24 : 10));
	const labels = new Map<string, string>();
	for (const point of sample) for (const value of point.values) labels.set(value.key, value.label);
	const predictions = new Map<string, number[]>();
	for (const [key] of labels) {
		const values = sample.map((point) => point.values.find((value) => value.key === key)?.value ?? 0);
		const n = values.length;
		const meanX = (n - 1) / 2;
		const meanY = values.reduce((sum, value) => sum + value, 0) / n;
		let numerator = 0;
		let denominator = 0;
		for (let index = 0; index < n; index += 1) {
			numerator += (index - meanX) * ((values[index] ?? 0) - meanY);
			denominator += (index - meanX) ** 2;
		}
		const slope = denominator === 0 ? 0 : numerator / denominator;
		const intercept = meanY - slope * meanX;
		const maxObserved = Math.max(...values, 0);
		const upperBound = Math.max(1, maxObserved * 3, meanY * 5);
		predictions.set(
			key,
			Array.from({ length: horizon }, (_, index) => {
				let value = Math.max(0, Math.min(upperBound, intercept + slope * (n + index)));
				if (query.metric === "cacheHitRate") value = Math.min(1, value);
				if (query.metric === "tokens" || query.metric === "requests") value = Math.round(value);
				return Math.round(value * 1_000_000_000) / 1_000_000_000;
			}),
		);
	}
	const lastTimestamp = points.at(-1)?.timestamp;
	if (lastTimestamp === undefined) return [];
	return Array.from({ length: horizon }, (_, index) => ({
		timestamp: nextTimestamp(lastTimestamp, query.granularity, index + 1),
		values: [...predictions.entries()].map(([key, values]) => ({
			key,
			label: labels.get(key) ?? key,
			value: values[index] ?? null,
		})),
	}));
}

function groupKey(fact: UsageFact, query: UsageQuery): string {
	switch (query.groupBy) {
		case "none":
			return "total";
		case "provider":
			return fact.providerId;
		case "model":
			return fact.modelId;
		case "session":
			return fact.sessionId;
	}
}

export class UsageQueryService {
	readonly #usage: UsageRepository;
	readonly #pricing: PricingRepository;
	#baseCurrency: string;

	constructor(usage: UsageRepository, pricing: PricingRepository, baseCurrency: string) {
		this.#usage = usage;
		this.#pricing = pricing;
		this.#baseCurrency = baseCurrency;
	}

	setBaseCurrency(currency: string): void {
		this.#baseCurrency = currency;
	}

	overview(query: UsageQuery, alertCount = 0): OverviewData {
		const currentFacts = this.#usage.listFacts(filterFor(query));
		const currentTotals = aggregate(currentFacts);
		const duration = query.to - query.from;
		const previousFacts = query.compare
			? this.#usage.listFacts(filterFor(query, query.from - duration, query.from))
			: null;
		const previousTotals = previousFacts === null ? null : aggregate(previousFacts);
		const rules = this.#pricing.list();
		return {
			current: bucketsOf(currentTotals),
			previous: previousTotals === null ? null : bucketsOf(previousTotals),
			requests: currentTotals.requests,
			previousRequests: previousTotals?.requests ?? null,
			cacheHitRate: cacheHitRate(currentTotals),
			previousCacheHitRate: previousTotals === null ? null : cacheHitRate(previousTotals),
			cost: estimateUsageCost(currentFacts, rules, this.#baseCurrency),
			previousCost: previousFacts === null ? null : estimateUsageCost(previousFacts, rules, this.#baseCurrency),
			activeProviders: new Set(currentFacts.map(({ providerId }) => providerId)).size,
			alertCount,
		};
	}

	series(query: UsageQuery): SeriesData {
		const facts = this.#usage.listFacts(filterFor(query));
		const rules = this.#pricing.list();
		const buckets = new Map<string, Map<string, UsageFact[]>>();
		for (const fact of facts) {
			const timeKey = bucketKey(fact.occurredAt, query.timeZone, query.granularity);
			let groups = buckets.get(timeKey);
			if (groups === undefined) {
				groups = new Map();
				buckets.set(timeKey, groups);
			}
			const key = groupKey(fact, query);
			const values = groups.get(key) ?? [];
			values.push(fact);
			groups.set(key, values);
		}
		const points = [...buckets.entries()]
			.sort(([left], [right]) => left.localeCompare(right))
			.map(([timeKey, groups]) => ({
				timestamp: bucketTimestamp(timeKey, query.timeZone, query.granularity),
				values: [...groups.entries()]
					.map(([key, groupFacts]) => {
						const totals = aggregate(groupFacts);
						let value: number | null;
						switch (query.metric) {
							case "tokens":
								value = totalTokens(totals);
								break;
							case "requests":
								value = totals.requests;
								break;
							case "cacheHitRate":
								value = cacheHitRate(totals);
								break;
							case "estimatedCost":
								value = estimateUsageCost(groupFacts, rules, this.#baseCurrency).amount;
								break;
						}
						return { key, label: key, value };
					})
					.sort((left, right) => (right.value ?? -1) - (left.value ?? -1)),
			}));
		return { metric: query.metric, groupBy: query.groupBy, points, forecast: linearForecast(points, query) };
	}

	breakdown(query: UsageQuery, dimension: BreakdownData["dimension"], showSessionIdentifiers = false): BreakdownData {
		const facts = this.#usage.listFacts(filterFor(query));
		const rules = this.#pricing.list();
		const groups = new Map<string, UsageFact[]>();
		for (const fact of facts) {
			const key = dimension === "provider" ? fact.providerId : dimension === "model" ? fact.modelId : fact.sessionId;
			const values = groups.get(key) ?? [];
			values.push(fact);
			groups.set(key, values);
		}
		const rows = [...groups.entries()]
			.map(([key, groupFacts], index) => {
				const totals = aggregate(groupFacts);
				const visibleKey = dimension === "session" && !showSessionIdentifiers ? `session-${index + 1}` : key;
				return {
					key: visibleKey,
					label: dimension === "session" && !showSessionIdentifiers ? `Session ${index + 1}` : key,
					buckets: bucketsOf(totals),
					requests: totals.requests,
					cacheHitRate: cacheHitRate(totals),
					cost: estimateUsageCost(groupFacts, rules, this.#baseCurrency),
				};
			})
			.sort((left, right) => totalTokens(right.buckets) - totalTokens(left.buckets));
		return { dimension, rows };
	}
}
