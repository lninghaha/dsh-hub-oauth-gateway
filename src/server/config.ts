import { z } from "zod";
import { CurrencyCodeSchema } from "../shared/domain.js";

const DEFAULT_REFRESH = Object.freeze({
	usageSeconds: 30,
	accountMinutes: 5,
	accountConcurrency: 3,
	timeoutMs: 15_000,
});

const DEFAULT_RETENTION = Object.freeze({
	usageDays: 730,
	accountSnapshotDays: 180,
	preserveDeletedSessions: true,
});

const DEFAULT_PRICING = Object.freeze({ baseCurrency: "USD" });

const RuntimeConfigInputSchema = z
	.object({
		refresh: z
			.object({
				usageSeconds: z.number().int().min(5).max(3600).default(DEFAULT_REFRESH.usageSeconds),
				accountMinutes: z.number().int().min(1).max(1440).default(DEFAULT_REFRESH.accountMinutes),
				accountConcurrency: z.number().int().min(1).max(12).default(DEFAULT_REFRESH.accountConcurrency),
				timeoutMs: z.number().int().min(1000).max(120_000).default(DEFAULT_REFRESH.timeoutMs),
			})
			.default(DEFAULT_REFRESH),
		retention: z
			.object({
				usageDays: z.number().int().min(7).max(3650).default(DEFAULT_RETENTION.usageDays),
				accountSnapshotDays: z.number().int().min(7).max(3650).default(DEFAULT_RETENTION.accountSnapshotDays),
				preserveDeletedSessions: z.boolean().default(DEFAULT_RETENTION.preserveDeletedSessions),
			})
			.default(DEFAULT_RETENTION),
		accounts: z.unknown().optional(),
		/** v0.3 compatibility: account monitors previously lived at config.monitors. */
		monitors: z.unknown().optional(),
		oauthDevice: z
			.object({
				copilotClientId: z
					.string()
					.trim()
					.min(8)
					.max(128)
					.regex(/^[A-Za-z0-9._-]+$/)
					.optional(),
			})
			.default({}),
		pricing: z
			.object({
				baseCurrency: CurrencyCodeSchema.default(DEFAULT_PRICING.baseCurrency),
			})
			.default(DEFAULT_PRICING),
		debug: z.boolean().default(false),
	})
	.strict()
	.superRefine((value, context) => {
		if (value.accounts !== undefined && value.monitors !== undefined) {
			context.addIssue({ code: "custom", message: "configure accounts or legacy monitors, not both" });
		}
	})
	.transform(({ accounts, monitors, ...value }) => ({
		...value,
		accounts: accounts ?? { monitors: monitors ?? {} },
	}));

export const RuntimeConfigSchema = z.preprocess((value) => value ?? {}, RuntimeConfigInputSchema);

export type RuntimeConfig = z.infer<typeof RuntimeConfigSchema>;

export const DEFAULT_RUNTIME_CONFIG: RuntimeConfig = RuntimeConfigSchema.parse({});
