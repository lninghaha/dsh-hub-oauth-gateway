/** Process-wide, reference-counted egress proxy shared by every participant. */
export interface CodingOAuthProxyLease {
    readonly url: string | undefined;
    release(): Promise<void>;
}
export interface CodingOAuthProxyOptions {
    readonly proxyKimi?: boolean;
}
/** Acquire the audited dispatcher and restore its predecessor on final release. */
export declare function acquireCodingOAuthProxy(explicit?: string, options?: CodingOAuthProxyOptions): CodingOAuthProxyLease;
/** Backward-compatible process-lifetime install retained for CLI callers. */
export declare function ensureCodingOAuthProxy(explicit?: string, options?: CodingOAuthProxyOptions): string | undefined;
/** Backward-compatible name retained for existing callers. */
export declare function ensureGrokBuildProxy(explicit?: string): string | undefined;
export declare function codingOAuthProxyInEffect(): string | undefined;
/** Append only a non-secret troubleshooting hint to transport failures. */
export declare function codingOAuthProxyUnreachableHint(): string;
/** Backward-compatible status accessor. */
export declare function grokBuildProxyInEffect(): string | undefined;
//# sourceMappingURL=proxy.d.ts.map