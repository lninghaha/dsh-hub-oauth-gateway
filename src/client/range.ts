import type { TimeGranularity, UsageGroupBy, UsageMetric } from "../shared/domain.js";
import type { UserPreferences } from "../shared/preferences.js";
import { bucketKey, bucketTimestamp } from "../shared/time.js";

export type DashboardRangePreset = UserPreferences["display"]["defaultRange"];

export interface DashboardFilters {
	readonly range: DashboardRangePreset;
	readonly metric: UsageMetric;
	readonly groupBy: UsageGroupBy;
	readonly providerIds: readonly string[];
	readonly modelIds: readonly string[];
	readonly compare: boolean;
}

export interface ResolvedUsageQuery {
	readonly from: number;
	readonly to: number;
	readonly timeZone: string;
	readonly granularity: TimeGranularity;
	readonly metric: UsageMetric;
	readonly groupBy: UsageGroupBy;
	readonly providers: readonly string[];
	readonly models: readonly string[];
	readonly compare: boolean;
}

export function filtersFromPreferences(preferences: UserPreferences): DashboardFilters {
	return {
		range: preferences.display.defaultRange,
		metric: preferences.display.preset === "cost" ? "estimatedCost" : "tokens",
		groupBy: "provider",
		providerIds: [],
		modelIds: [],
		compare: preferences.display.comparePrevious,
	};
}

export function resolveUsageQuery(filters: DashboardFilters, timeZone: string, now = Date.now()): ResolvedUsageQuery {
	let from: number;
	switch (filters.range) {
		case "today":
			from = bucketTimestamp(bucketKey(now, timeZone, "day"), timeZone, "day");
			break;
		case "7d":
			from = now - 7 * 86_400_000;
			break;
		case "30d":
			from = now - 30 * 86_400_000;
			break;
		case "month":
			from = bucketTimestamp(bucketKey(now, timeZone, "month"), timeZone, "month");
			break;
	}
	const duration = Math.max(1, now - from);
	return {
		from,
		to: now,
		timeZone,
		granularity: duration <= 3 * 86_400_000 ? "hour" : duration <= 120 * 86_400_000 ? "day" : "month",
		metric: filters.metric,
		groupBy: filters.groupBy,
		providers: filters.providerIds,
		models: filters.modelIds,
		compare: filters.compare,
	};
}

export function queryString(query: ResolvedUsageQuery): string {
	const params = new URLSearchParams({
		from: String(query.from),
		to: String(query.to),
		timeZone: query.timeZone,
		granularity: query.granularity,
		metric: query.metric,
		groupBy: query.groupBy,
		compare: query.compare ? "1" : "0",
	});
	if (query.providers.length > 0) params.set("providers", query.providers.join(","));
	if (query.models.length > 0) params.set("models", query.models.join(","));
	return params.toString();
}
