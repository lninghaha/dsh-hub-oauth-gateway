import { z } from "zod";
import {
	AccountSnapshotSchema,
	PriceRuleSchema,
	UsageBucketsSchema,
	UsageGroupBySchema,
	UsageMetricSchema,
} from "./domain.js";

export const API_BASE = "/api/usage-stats/v1";

export const API_PATHS = Object.freeze({
	overview: `${API_BASE}/overview`,
	series: `${API_BASE}/series`,
	breakdown: `${API_BASE}/breakdown`,
	accounts: `${API_BASE}/accounts`,
	account: `${API_BASE}/account`,
	providers: `${API_BASE}/providers`,
	refresh: `${API_BASE}/refresh`,
	settings: `${API_BASE}/settings`,
	pricing: `${API_BASE}/pricing`,
	alerts: `${API_BASE}/alerts`,
	credentials: `${API_BASE}/credentials`,
	credentialImport: `${API_BASE}/credentials/import`,
	oauthDevice: `${API_BASE}/oauth/device`,
	oauthDevicePoll: `${API_BASE}/oauth/device/poll`,
	export: `${API_BASE}/export`,
	health: `${API_BASE}/health`,
});

export const ApiMetaSchema = z
	.object({
		schemaVersion: z.literal(1),
		generatedAt: z.number().int().nonnegative(),
		sourceUpdatedAt: z.number().int().nonnegative().nullable(),
		partial: z.boolean(),
		stale: z.boolean(),
		warnings: z.array(z.string()),
	})
	.strict();

export type ApiMeta = z.infer<typeof ApiMetaSchema>;

export interface ApiSuccess<T> {
	readonly ok: true;
	readonly data: T;
	readonly meta: ApiMeta;
}

export interface ApiFailure {
	readonly ok: false;
	readonly error: {
		readonly code: string;
		readonly message: string;
		readonly details?: Readonly<Record<string, unknown>>;
	};
	readonly meta: ApiMeta;
}

export type ApiResponse<T> = ApiSuccess<T> | ApiFailure;

export const CostEstimateSchema = z
	.object({
		amount: z.number().nonnegative().nullable(),
		currency: z.string().min(1),
		coverageRatio: z.number().min(0).max(1),
		estimated: z.literal(true),
	})
	.strict();

export type CostEstimate = z.infer<typeof CostEstimateSchema>;

export const OverviewDataSchema = z
	.object({
		current: UsageBucketsSchema,
		previous: UsageBucketsSchema.nullable(),
		requests: z.number().int().nonnegative(),
		previousRequests: z.number().int().nonnegative().nullable(),
		cacheHitRate: z.number().min(0).max(1).nullable(),
		previousCacheHitRate: z.number().min(0).max(1).nullable(),
		cost: CostEstimateSchema,
		previousCost: CostEstimateSchema.nullable(),
		activeProviders: z.number().int().nonnegative(),
		alertCount: z.number().int().nonnegative(),
	})
	.strict();

export type OverviewData = z.infer<typeof OverviewDataSchema>;

export const SeriesValueSchema = z
	.object({
		key: z.string(),
		label: z.string(),
		value: z.number().nonnegative().nullable(),
	})
	.strict();

export const SeriesPointSchema = z
	.object({
		timestamp: z.number().int().nonnegative(),
		values: z.array(SeriesValueSchema),
	})
	.strict();

export const SeriesDataSchema = z
	.object({
		metric: UsageMetricSchema,
		groupBy: UsageGroupBySchema,
		points: z.array(SeriesPointSchema),
		forecast: z.array(SeriesPointSchema),
	})
	.strict();

export type SeriesData = z.infer<typeof SeriesDataSchema>;

export const BreakdownRowSchema = z
	.object({
		key: z.string(),
		label: z.string(),
		buckets: UsageBucketsSchema,
		requests: z.number().int().nonnegative(),
		cacheHitRate: z.number().min(0).max(1).nullable(),
		cost: CostEstimateSchema,
	})
	.strict();

export const BreakdownDataSchema = z
	.object({
		dimension: z.enum(["provider", "model", "session"]),
		rows: z.array(BreakdownRowSchema),
	})
	.strict();

export type BreakdownData = z.infer<typeof BreakdownDataSchema>;

export const AccountsDataSchema = z.object({ accounts: z.array(AccountSnapshotSchema) }).strict();
export type AccountsData = z.infer<typeof AccountsDataSchema>;

export const UsageAlertSchema = z
	.object({
		id: z.string().min(1),
		kind: z.enum(["quota", "cost", "account"]),
		level: z.enum(["info", "warning", "critical"]),
		title: z.string().min(1),
		providerId: z.string().nullable(),
		value: z.number().nonnegative().nullable(),
		threshold: z.number().nonnegative().nullable(),
		createdAt: z.number().int().nonnegative(),
	})
	.strict();
export type UsageAlert = z.infer<typeof UsageAlertSchema>;

export const AlertsDataSchema = z.object({ alerts: z.array(UsageAlertSchema) }).strict();
export type AlertsData = z.infer<typeof AlertsDataSchema>;

export const PricingDataSchema = z
	.object({
		baseCurrency: z.string().min(1),
		rules: z.array(PriceRuleSchema),
		catalogUpdatedAt: z.number().int().nonnegative().nullable(),
	})
	.strict();

export type PricingData = z.infer<typeof PricingDataSchema>;
