/**
 * Wire contracts for optional vendor status-page probes (default off).
 * Responses never include credentials, cookies, or raw upstream bodies.
 */

import { z } from "zod";

export const StatusProbeIndicatorSchema = z.enum(["none", "minor", "major", "critical", "unknown"]);
export type StatusProbeIndicator = z.infer<typeof StatusProbeIndicatorSchema>;

export const StatusProbeResultSchema = z
	.object({
		id: z.string().min(1).max(64),
		label: z.string().min(1).max(128),
		pageUrl: z.string().url(),
		indicator: StatusProbeIndicatorSchema,
		description: z.string().max(256).nullable(),
		observedAt: z.number().int().nonnegative().nullable(),
		ok: z.boolean(),
		errorCode: z.string().max(64).nullable(),
	})
	.strict();
export type StatusProbeResult = z.infer<typeof StatusProbeResultSchema>;

export const StatusProbesDataSchema = z
	.object({
		enabled: z.literal(true),
		generatedAt: z.number().int().nonnegative(),
		probes: z.array(StatusProbeResultSchema).max(16),
	})
	.strict();
export type StatusProbesData = z.infer<typeof StatusProbesDataSchema>;

export const StatusProbesDisabledSchema = z
	.object({
		enabled: z.literal(false),
	})
	.strict();

export const StatusProbesResponseSchema = z.discriminatedUnion("enabled", [
	StatusProbesDataSchema,
	StatusProbesDisabledSchema,
]);
export type StatusProbesResponse = z.infer<typeof StatusProbesResponseSchema>;
