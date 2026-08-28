import { z } from "zod";
import { CurrencyCodeSchema } from "../shared/domain.js";

const DEFAULT_REFRESH = Object.freeze({
	usageSeconds: 30,
	accountMinutes: 5,
	accountConcurrency: 3,
	timeoutMs: 15_000,
	accountMode: "fixed" as const,
	accountAdaptiveMinMinutes: 2,
	accountAdaptiveMaxMinutes: 30,
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
	pool: Object.freeze({
		mode: "off" as const,
		switchMargin: 2,
	}),
});

const DEFAULT_LOCAL_MONITOR = Object.freeze({
	enabled: false,
});

const DEFAULT_LOCAL_USAGE = Object.freeze({
	enabled: false,
	intervalMinutes: 30,
	maxFileBytes: 8 * 1024 * 1024,
	maxTotalBytes: 256 * 1024 * 1024,
	retentionDays: 400,
});

const LocalMonitorConfigSchema = z
	.object({
		/** Read-only local CLI authentication snapshot (hardened allowlist reads). */
		enabled: z.boolean().default(DEFAULT_LOCAL_MONITOR.enabled),
	})
	.strict();

const LocalUsageConfigSchema = z
	.object({
		/** Opt-in cross-tool local usage log scan (token-monitor style). */
		enabled: z.boolean().default(DEFAULT_LOCAL_USAGE.enabled),
		intervalMinutes: z.number().int().min(5).max(1440).default(DEFAULT_LOCAL_USAGE.intervalMinutes),
		maxFileBytes: z
			.number()
			.int()
			.min(4096)
			.max(64 * 1024 * 1024)
			.default(DEFAULT_LOCAL_USAGE.maxFileBytes),
		maxTotalBytes: z
			.number()
			.int()
			.min(65_536)
			.max(1024 * 1024 * 1024)
			.default(DEFAULT_LOCAL_USAGE.maxTotalBytes),
		retentionDays: z.number().int().min(7).max(3650).default(DEFAULT_LOCAL_USAGE.retentionDays),
	})
	.strict();

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

const OwnerRequestPolicySchema = z
	.object({
		loopbackAccessMode: z.enum(["loopback", "ssh-tunnel"]).optional(),
		trustedProxy: z
			.object({
				peers: z.array(z.string()),
				origins: z.array(z.string()),
				ownerProof: z.string(),
				csrfToken: z.string(),
			})
			.strict()
			.optional(),
	})
	.strict();

const CodingOAuthPoolSchema = z
	.object({
		mode: z.enum(["off", "priority", "quota_aware"]).default(DEFAULT_CODING_OAUTH.pool.mode),
		switchMargin: z.number().min(1).max(10).default(DEFAULT_CODING_OAUTH.pool.switchMargin),
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
		ownerRequest: OwnerRequestPolicySchema.optional(),
		/** Optional multi-account sticky pool for coding-oauth routes (≥2 AuthDocument v2 accounts). */
		pool: CodingOAuthPoolSchema.default(DEFAULT_CODING_OAUTH.pool),
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
				accountMode: z.enum(["fixed", "adaptive"]).default(DEFAULT_REFRESH.accountMode),
				accountAdaptiveMinMinutes: z
					.number()
					.int()
					.min(1)
					.max(1_440)
					.default(DEFAULT_REFRESH.accountAdaptiveMinMinutes),
				accountAdaptiveMaxMinutes: z
					.number()
					.int()
					.min(1)
					.max(1_440)
					.default(DEFAULT_REFRESH.accountAdaptiveMaxMinutes),
			})
			.superRefine((value, context) => {
				if (value.accountAdaptiveMinMinutes > value.accountAdaptiveMaxMinutes) {
					context.addIssue({
						code: "custom",
						message: "accountAdaptiveMinMinutes must not exceed accountAdaptiveMaxMinutes",
					});
				}
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
		/** Token-monitor-style local CLI authentication snapshot. Default off. */
		localMonitor: LocalMonitorConfigSchema.default(DEFAULT_LOCAL_MONITOR),
		/** Opt-in cross-tool local usage scan. Default off; scans never run on page loads. */
		localUsage: LocalUsageConfigSchema.default(DEFAULT_LOCAL_USAGE),
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
