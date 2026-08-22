import { type CodingOAuthRuntime as CodingOAuthOwnership } from "dsh-coding-oauth-core";
import type { UsageStatsHostContext } from "../context.js";
import type { DshHostAdapter } from "../host/adapter.js";
import { applyCodingOAuth, type CodingOAuthRuntime, type Config } from "./compose.js";
export declare class CodingOAuthRuntimeHolder {
    #private;
    current(): CodingOAuthRuntime | undefined;
    subscribe(listener: (runtime: CodingOAuthRuntime | undefined) => void): () => void;
    set(runtime: CodingOAuthRuntime | undefined): void;
}
export interface HubCodingOAuthOwnership {
    readonly holder: CodingOAuthRuntimeHolder;
    readonly lease: CodingOAuthOwnership<CodingOAuthRuntimeHolder>;
}
export interface HubCodingOAuthParticipantDependencies {
    readonly activate?: typeof applyCodingOAuth;
}
/**
 * Join the host-wide OAuth owner election without placing any OAuth effects on
 * the parent fiber. The child fiber can be atomically disposed during Hub /
 * standalone takeover. The base fiber does not depend on optional DSH
 * services; LLM-specific effects are attached by a nested inject inside the
 * composition runtime.
 */
export declare function acquireHubCodingOAuthOwnership(ctx: UsageStatsHostContext, host: DshHostAdapter, config: Config, dependencies?: HubCodingOAuthParticipantDependencies): HubCodingOAuthOwnership;
//# sourceMappingURL=participant.d.ts.map