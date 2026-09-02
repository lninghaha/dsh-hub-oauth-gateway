/**
 * Wire contracts for optional vendor status-page probes (default off).
 * Responses never include credentials, cookies, or raw upstream bodies.
 */
import { z } from "zod";
export declare const StatusProbeIndicatorSchema: z.ZodEnum<{
    unknown: "unknown";
    none: "none";
    critical: "critical";
    minor: "minor";
    major: "major";
}>;
export type StatusProbeIndicator = z.infer<typeof StatusProbeIndicatorSchema>;
export declare const StatusProbeResultSchema: z.ZodObject<{
    id: z.ZodString;
    label: z.ZodString;
    pageUrl: z.ZodString;
    indicator: z.ZodEnum<{
        unknown: "unknown";
        none: "none";
        critical: "critical";
        minor: "minor";
        major: "major";
    }>;
    description: z.ZodNullable<z.ZodString>;
    observedAt: z.ZodNullable<z.ZodNumber>;
    ok: z.ZodBoolean;
    errorCode: z.ZodNullable<z.ZodString>;
}, z.core.$strict>;
export type StatusProbeResult = z.infer<typeof StatusProbeResultSchema>;
export declare const StatusProbesDataSchema: z.ZodObject<{
    enabled: z.ZodLiteral<true>;
    generatedAt: z.ZodNumber;
    probes: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        label: z.ZodString;
        pageUrl: z.ZodString;
        indicator: z.ZodEnum<{
            unknown: "unknown";
            none: "none";
            critical: "critical";
            minor: "minor";
            major: "major";
        }>;
        description: z.ZodNullable<z.ZodString>;
        observedAt: z.ZodNullable<z.ZodNumber>;
        ok: z.ZodBoolean;
        errorCode: z.ZodNullable<z.ZodString>;
    }, z.core.$strict>>;
}, z.core.$strict>;
export type StatusProbesData = z.infer<typeof StatusProbesDataSchema>;
export declare const StatusProbesDisabledSchema: z.ZodObject<{
    enabled: z.ZodLiteral<false>;
}, z.core.$strict>;
export declare const StatusProbesResponseSchema: z.ZodDiscriminatedUnion<[z.ZodObject<{
    enabled: z.ZodLiteral<true>;
    generatedAt: z.ZodNumber;
    probes: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        label: z.ZodString;
        pageUrl: z.ZodString;
        indicator: z.ZodEnum<{
            unknown: "unknown";
            none: "none";
            critical: "critical";
            minor: "minor";
            major: "major";
        }>;
        description: z.ZodNullable<z.ZodString>;
        observedAt: z.ZodNullable<z.ZodNumber>;
        ok: z.ZodBoolean;
        errorCode: z.ZodNullable<z.ZodString>;
    }, z.core.$strict>>;
}, z.core.$strict>, z.ZodObject<{
    enabled: z.ZodLiteral<false>;
}, z.core.$strict>], "enabled">;
export type StatusProbesResponse = z.infer<typeof StatusProbesResponseSchema>;
//# sourceMappingURL=status-probes.d.ts.map