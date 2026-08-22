import { CODING_OAUTH_CORE_ABI } from "dsh-coding-oauth-core/contracts";
import { z } from "zod";
export { CODING_OAUTH_CORE_ABI };
export declare const HostCapabilityStateSchema: z.ZodEnum<{
    available: "available";
    missing: "missing";
    incompatible: "incompatible";
}>;
export declare const HostCapabilitySchema: z.ZodObject<{
    state: z.ZodEnum<{
        available: "available";
        missing: "missing";
        incompatible: "incompatible";
    }>;
    contract: z.ZodOptional<z.ZodString>;
    reason: z.ZodOptional<z.ZodString>;
}, z.core.$strict>;
export declare const DshCompatibilitySchema: z.ZodObject<{
    coreAbi: z.ZodLiteral<"dsh-coding-oauth-core/v1">;
    dshVersion: z.ZodNullable<z.ZodString>;
    status: z.ZodEnum<{
        incompatible: "incompatible";
        healthy: "healthy";
        degraded: "degraded";
    }>;
    uiOwner: z.ZodNullable<z.ZodEnum<{
        hub: "hub";
        standalone: "standalone";
    }>>;
    accessMode: z.ZodEnum<{
        loopback: "loopback";
        "ssh-tunnel": "ssh-tunnel";
        "trusted-https-proxy": "trusted-https-proxy";
        denied: "denied";
    }>;
    capabilities: z.ZodRecord<z.ZodString, z.ZodObject<{
        state: z.ZodEnum<{
            available: "available";
            missing: "missing";
            incompatible: "incompatible";
        }>;
        contract: z.ZodOptional<z.ZodString>;
        reason: z.ZodOptional<z.ZodString>;
    }, z.core.$strict>>;
    diagnostics: z.ZodArray<z.ZodString>;
}, z.core.$strict>;
export type HostCapability = z.infer<typeof HostCapabilitySchema>;
export type DshCompatibility = z.infer<typeof DshCompatibilitySchema>;
//# sourceMappingURL=compatibility.d.ts.map