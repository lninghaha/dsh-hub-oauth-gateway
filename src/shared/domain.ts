import { z } from "zod";

export const UsageBucketsSchema = z
	.object({
		inputTokens: z.number().int().nonnegative(),
		outputTokens: z.number().int().nonnegative(),
		cacheReadTokens: z.number().int().nonnegative(),
		cacheWriteTokens: z.number().int().nonnegative(),
	})
	.strict();

export type UsageBuckets = z.infer<typeof UsageBucketsSchema>;

export const EMPTY_USAGE_BUCKETS: Readonly<UsageBuckets> = Object.freeze({
	inputTokens: 0,
	outputTokens: 0,
	cacheReadTokens: 0,
	cacheWriteTokens: 0,
});

export function totalTokens(buckets: UsageBuckets): number {
	return buckets.inputTokens + buckets.outputTokens + buckets.cacheReadTokens + buckets.cacheWriteTokens;
}

export const AccountStatusSchema = z.enum([
	"ok",
	"pending",
	"not-configured",
	"unsupported",
	"auth-error",
	"rate-limited",
	"unavailable",
	"error",
]);

export type AccountStatus = z.infer<typeof AccountStatusSchema>;

export const QuotaWindowSchema = z
	.object({
		id: z.string().min(1),
		kind: z.enum(["session", "daily", "weekly", "monthly", "rolling", "custom"]),
		label: z.string().min(1),
		unit: z.enum(["tokens", "requests", "currency", "percent", "unknown"]),
		used: z.number().nonnegative().nullable(),
		remaining: z.number().nonnegative().nullable(),
		limit: z.number().positive().nullable(),
		usedRatio: z.number().min(0).max(1).nullable(),
		resetsAt: z.number().int().nonnegative().nullable(),
		rolling: z.boolean(),
	})
	.strict();

export type QuotaWindow = z.infer<typeof QuotaWindowSchema>;

export const BalanceSnapshotSchema = z
	.object({
		remaining: z.number().nullable(),
		used: z.number().nonnegative().nullable(),
		limit: z.number().positive().nullable(),
		currency: z.string().min(1).nullable(),
		unlimited: z.boolean(),
	})
	.strict();

export type BalanceSnapshot = z.infer<typeof BalanceSnapshotSchema>;

export const AccountSnapshotSchema = z
	.object({
		providerId: z.string().min(1),
		profileId: z.string().max(128).default(""),
		displayName: z.string().min(1),
		adapterId: z.string().min(1).nullable(),
		mode: z.enum(["balance", "subscription", "hybrid"]).nullable(),
		status: AccountStatusSchema,
		configured: z.boolean(),
		fetchedAt: z.number().int().nonnegative().nullable(),
		stale: z.boolean(),
		plan: z.string().nullable(),
		balance: BalanceSnapshotSchema.nullable(),
		windows: z.array(QuotaWindowSchema),
		missingCredentials: z.array(z.string()),
		warningCode: z.string().nullable(),
	})
	.strict();

export type AccountSnapshot = z.infer<typeof AccountSnapshotSchema>;

export const CurrencyCodeSchema = z
	.string()
	.trim()
	.min(1)
	.max(16)
	.transform((value) => value.toUpperCase())
	.refine((value) => /^[A-Z][A-Z0-9]{2,15}$/.test(value), "currency must be a 3-16 character code");

export const PriceRuleSchema = z
	.object({
		id: z.string().min(1).max(128),
		providerPattern: z.string().min(1).max(256),
		modelPattern: z.string().min(1).max(256),
		effectiveFrom: z.number().int().nonnegative(),
		currency: CurrencyCodeSchema,
		inputPerMillion: z.number().nonnegative().nullable(),
		outputPerMillion: z.number().nonnegative().nullable(),
		cacheReadPerMillion: z.number().nonnegative().nullable(),
		cacheWritePerMillion: z.number().nonnegative().nullable(),
		source: z.enum(["builtin", "user", "imported"]),
		updatedAt: z.number().int().nonnegative(),
	})
	.strict();

export type PriceRule = z.infer<typeof PriceRuleSchema>;

export const UsageMetricSchema = z.enum(["tokens", "estimatedCost", "requests", "cacheHitRate"]);
export type UsageMetric = z.infer<typeof UsageMetricSchema>;

export const UsageGroupBySchema = z.enum(["none", "provider", "model", "session"]);
export type UsageGroupBy = z.infer<typeof UsageGroupBySchema>;

export const TimeGranularitySchema = z.enum(["hour", "day", "week", "month"]);
export type TimeGranularity = z.infer<typeof TimeGranularitySchema>;

export const UsageQuerySchema = z
	.object({
		from: z.number().int().nonnegative(),
		to: z.number().int().positive(),
		timeZone: z.string().min(1),
		granularity: TimeGranularitySchema,
		metric: UsageMetricSchema,
		groupBy: UsageGroupBySchema,
		providers: z.array(z.string()),
		models: z.array(z.string()),
		compare: z.boolean(),
	})
	.strict()
	.refine(({ from, to }) => from < to, { message: "from must be earlier than to", path: ["to"] });

export type UsageQuery = z.infer<typeof UsageQuerySchema>;
