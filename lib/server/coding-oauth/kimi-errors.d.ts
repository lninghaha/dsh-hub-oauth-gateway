/**
 * Kimi Code error remapping.
 * @module dsh-hub-oauth-gateway/server/coding-oauth/kimi-errors
 */
export declare function isMisclassifiedContextWindowError(detail: string): boolean;
export declare function remapAuthFailureIfContextOverflow(failure: {
    message: string;
    code: string;
}): {
    message: string;
    code: string;
};
//# sourceMappingURL=kimi-errors.d.ts.map