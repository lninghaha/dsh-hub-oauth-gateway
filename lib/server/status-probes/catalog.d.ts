/**
 * Hard allowlist of public Statuspage `/api/v2/status.json` endpoints.
 * Only these HTTPS origins may be probed; operators cannot add arbitrary URLs.
 */
export interface StatusProbeTarget {
    readonly id: string;
    readonly label: string;
    readonly pageUrl: string;
    readonly apiUrl: string;
}
/** Public vendor status pages with unauthenticated Statuspage JSON. */
export declare const STATUS_PROBE_TARGETS: readonly StatusProbeTarget[];
//# sourceMappingURL=catalog.d.ts.map