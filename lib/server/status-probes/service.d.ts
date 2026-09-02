/**
 * Opt-in read-only vendor status probes. Never attaches credentials; honors
 * the shared outbound/SSRF policy; per-target failures stay local so Usage
 * Center primary paths are unaffected.
 */
import { type StatusProbesData } from "../../shared/status-probes.js";
import type { AccountDeps } from "../accounts/types.js";
import { type StatusProbeTarget } from "./catalog.js";
export interface StatusProbeServiceOptions {
    readonly deps?: AccountDeps;
    readonly now?: () => number;
    readonly targets?: readonly StatusProbeTarget[];
}
export declare class StatusProbeService {
    #private;
    constructor(options?: StatusProbeServiceOptions);
    /** Probe every allowlisted target; never throws for upstream failures. */
    snapshot(): Promise<StatusProbesData>;
}
//# sourceMappingURL=service.d.ts.map