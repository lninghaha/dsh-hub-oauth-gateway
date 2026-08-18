/**
 * Volcengine / Ark Coding Plan quota via signed OpenAPI `GetCodingPlanUsage`.
 * Does not probe chat completions (avoids consuming plan quota for monitoring).
 */
import type { AccountAdapter, RawQuotaWindow } from "../types.js";
export declare const VOLCENGINE_ACCESS_KEY_REF = "VOLCENGINE_ACCESS_KEY";
export declare const VOLCENGINE_SECRET_KEY_REF = "VOLCENGINE_SECRET_KEY";
export declare const VOLCENGINE_API_HOST = "https://open.volcengineapi.com";
export declare const VOLCENGINE_SERVICE = "ark";
export declare const VOLCENGINE_REGION_DEFAULT = "cn-beijing";
export declare const VOLCENGINE_ACTION = "GetCodingPlanUsage";
export declare const VOLCENGINE_VERSION = "2024-06-01";
/** Build Volcengine Signature V4 headers for a GET OpenAPI call (testable). */
export declare function signVolcengineGet(options: {
    readonly accessKey: string;
    readonly secretKey: string;
    readonly host: string;
    readonly region: string;
    readonly service: string;
    readonly canonicalQuery: string;
    readonly now: number;
}): {
    readonly authorization: string;
    readonly amzDate: string;
    readonly signedHeaders: string;
};
export declare function volcengineCanonicalQuery(action?: string, version?: string): string;
/** Parse GetCodingPlanUsage Result into subscription windows (fixture-friendly). */
export declare function parseVolcengineCodingPlan(body: unknown): {
    plan: string;
    windows: RawQuotaWindow[];
};
export declare const volcengineCodingPlanAdapter: AccountAdapter;
//# sourceMappingURL=volcengine-coding-plan.d.ts.map