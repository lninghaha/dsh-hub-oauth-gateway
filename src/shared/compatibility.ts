import { CODING_OAUTH_CORE_ABI } from "dsh-coding-oauth-core/contracts";
import { z } from "zod";

export { CODING_OAUTH_CORE_ABI };

export const HostCapabilityStateSchema = z.enum(["available", "missing", "incompatible"]);

export const HostCapabilitySchema = z
	.object({
		state: HostCapabilityStateSchema,
		contract: z.string().optional(),
		reason: z.string().optional(),
	})
	.strict();

export const DshCompatibilitySchema = z
	.object({
		coreAbi: z.literal(CODING_OAUTH_CORE_ABI),
		dshVersion: z.string().nullable(),
		status: z.enum(["healthy", "degraded", "incompatible"]),
		uiOwner: z.enum(["hub", "standalone"]).nullable(),
		accessMode: z.enum(["loopback", "ssh-tunnel", "trusted-https-proxy", "denied"]),
		capabilities: z.record(z.string(), HostCapabilitySchema),
		diagnostics: z.array(z.string()),
	})
	.strict();

export type HostCapability = z.infer<typeof HostCapabilitySchema>;
export type DshCompatibility = z.infer<typeof DshCompatibilitySchema>;
