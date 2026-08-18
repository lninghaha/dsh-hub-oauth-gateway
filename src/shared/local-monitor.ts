/**
 * Wire contracts for the token-monitor-style local machine surfaces:
 * read-only local CLI authentication snapshots and the opt-in cross-tool
 * usage scan aggregates. No credential material, prompt/response content,
 * or absolute filesystem paths ever appear in these documents.
 */

import { z } from "zod";

export const LocalAuthToolKindSchema = z.enum(["grok", "codex", "kimi", "claude"]);
export type LocalAuthToolKind = z.infer<typeof LocalAuthToolKindSchema>;

export const LocalAuthCliStateSchema = z.enum(["signed-in", "signed-out", "expired", "unavailable"]);
export type LocalAuthCliState = z.infer<typeof LocalAuthCliStateSchema>;

export const LocalAuthCliStatusSchema = z
	.object({
		kind: LocalAuthToolKindSchema,
		displayPath: z.string(),
		state: LocalAuthCliStateSchema,
		expiresAt: z.number().int().nonnegative().nullable(),
		hasRefreshToken: z.boolean(),
		reason: z.enum(["missing", "unsafe", "invalid", "too_large"]).nullable(),
	})
	.strict();
export type LocalAuthCliStatus = z.infer<typeof LocalAuthCliStatusSchema>;

export const LocalAuthSessionStatusSchema = z
	.object({
		provider: LocalAuthToolKindSchema,
		route: z.string(),
		authenticated: z.boolean(),
		expiresAt: z.number().int().nonnegative().nullable(),
	})
	.strict();
export type LocalAuthSessionStatus = z.infer<typeof LocalAuthSessionStatusSchema>;

export const LocalAuthDataSchema = z
	.object({
		enabled: z.literal(true),
		generatedAt: z.number().int().nonnegative(),
		cli: z.array(LocalAuthCliStatusSchema),
		sessions: z.array(LocalAuthSessionStatusSchema),
	})
	.strict();
export type LocalAuthData = z.infer<typeof LocalAuthDataSchema>;

export const LocalAuthDisabledSchema = z
	.object({
		enabled: z.literal(false),
	})
	.strict();

export const LocalAuthResponseSchema = z.discriminatedUnion("enabled", [LocalAuthDataSchema, LocalAuthDisabledSchema]);
export type LocalAuthResponse = z.infer<typeof LocalAuthResponseSchema>;

export const LocalUsageToolSchema = z.object({
	toolId: z.string(),
	displayName: z.string(),
	available: z.boolean(),
});
export type LocalUsageTool = z.infer<typeof LocalUsageToolSchema>;

export const LocalUsageRowSchema = z
	.object({
		day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
		toolId: z.string(),
		modelId: z.string(),
		inputTokens: z.number().int().nonnegative(),
		outputTokens: z.number().int().nonnegative(),
		cacheReadTokens: z.number().int().nonnegative(),
		cacheWriteTokens: z.number().int().nonnegative(),
		requests: z.number().int().nonnegative(),
	})
	.strict();
export type LocalUsageRow = z.infer<typeof LocalUsageRowSchema>;

export const LocalUsageDataSchema = z
	.object({
		enabled: z.literal(true),
		generatedAt: z.number().int().nonnegative(),
		lastScanAt: z.number().int().nonnegative().nullable(),
		scannedFiles: z.number().int().nonnegative(),
		tools: z.array(LocalUsageToolSchema),
		rows: z.array(LocalUsageRowSchema),
	})
	.strict();
export type LocalUsageData = z.infer<typeof LocalUsageDataSchema>;

export const LocalUsageResponseSchema = z.discriminatedUnion("enabled", [
	LocalUsageDataSchema,
	LocalAuthDisabledSchema,
]);
export type LocalUsageResponse = z.infer<typeof LocalUsageResponseSchema>;

export const LocalUsageScanResultSchema = z
	.object({
		enabled: z.boolean(),
		scannedAt: z.number().int().nonnegative().nullable(),
		files: z.number().int().nonnegative(),
		events: z.number().int().nonnegative(),
		skipped: z.number().int().nonnegative(),
	})
	.strict();
export type LocalUsageScanResult = z.infer<typeof LocalUsageScanResultSchema>;
