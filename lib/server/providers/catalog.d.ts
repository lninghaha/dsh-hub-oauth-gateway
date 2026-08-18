import type { AccountSnapshot } from "../../shared/domain.js";
import type { ProvidersData } from "../../shared/providers.js";
import type { CodingOAuthRuntime } from "../coding-oauth/compose.js";
export declare function collectProvidersData(options: {
    readonly accounts: readonly AccountSnapshot[];
    readonly codingOAuth?: CodingOAuthRuntime;
    readonly now?: () => number;
}): Promise<ProvidersData>;
//# sourceMappingURL=catalog.d.ts.map