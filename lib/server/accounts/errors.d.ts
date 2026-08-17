/**
 * Shared error type carrying the raw provider-status classification.
 * Kept dependency-free so both the security and transport seams can use it.
 */
import type { ProviderStatus } from "./types.js";
export declare class ProviderError extends Error {
    readonly providerStatus: ProviderStatus;
    readonly httpStatus?: number;
    constructor(status: ProviderStatus, message: string, httpStatus?: number);
}
export declare function isProviderError(error: unknown): error is ProviderError;
/** Read the numeric HTTP status carried by a thrown error, if any. */
export declare function httpStatusOf(error: unknown): number | null;
//# sourceMappingURL=errors.d.ts.map