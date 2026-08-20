import type { AccountSnapshot } from "../../shared/domain.js";
import type { ProvidersData } from "../../shared/providers.js";
import type { CodingOAuthRuntime } from "../coding-oauth/compose.js";
export declare function collectProvidersData(options: {
    readonly accounts: readonly AccountSnapshot[];
    readonly codingOAuth?: CodingOAuthRuntime;
    readonly now?: () => number;
    /** apiKeyRef per account identity key (`accountIdentityKey(providerId, profileId)`). */
    readonly credentialRefs?: ReadonlyMap<string, string>;
    /** Whether the host credential seam accepts writes (enables inline key editing). */
    readonly credentialsWritable?: boolean;
}): Promise<ProvidersData>;
//# sourceMappingURL=catalog.d.ts.map