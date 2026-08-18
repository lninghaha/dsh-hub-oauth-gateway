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

const DEFAULT_CODING_OAUTH = Object.freeze({
	enabled: true,
	proxyKimi: false,
});

const CodingOAuthCapabilityPatchSchema = z
	.object({
		codexSearch: z.boolean().optional(),
		codexImages: z.boolean().optional(),
		codexImageEdits: z.boolean().optional(),
		codexUsage: z.boolean().optional(),
		codexFast: z.boolean().optional(),
		grokImagineImage: z.boolean().optional(),
		grokImagineVideo: z.boolean().optional(),
		searchResults: z.number().int().min(1).max(20).optional(),
		imageCount: z.number().int().min(1).max(4).optional(),
		videoArtifactTtlMs: z
			.number()
			.int()
			.min(60 * 60 * 1000)
			.max(7 * 24 * 60 * 60 * 1000)
			.optional(),
	})
	.strict();

const CodingOAuthGatewaySchema = z
	.object({
		enabled: z.boolean().default(false),
		bind: z.string().trim().min(1).max(253).default("127.0.0.1"),
		port: z.number().int().min(1024).max(65_535).default(18_080),
		apiKey: z.string().min(1).max(256).optional(),
		rateLimit: z.number().int().min(0).max(1_000_000).default(0),
	})
	.strict();

const CodingOAuthConfigSchema = z
	.object({
		enabled: z.boolean().default(DEFAULT_CODING_OAUTH.enabled),
		proxy: z.string().trim().min(1).max(2048).optional(),
		proxyKimi: z.boolean().default(DEFAULT_CODING_OAUTH.proxyKimi),
		retryPolicy: z.record(z.string(), z.unknown()).optional(),
		capabilities: CodingOAuthCapabilityPatchSchema.optional(),
		gateway: CodingOAuthGatewaySchema.optional(),
	})
	.strict();

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
		/** Integrated coding-subscription OAuth owner. Disable only for isolated tests. */
		codingOAuth: CodingOAuthConfigSchema.default(DEFAULT_CODING_OAUTH),
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
