import type { AccountService } from "../accounts/service.js";
import type { AccountDeps, CredentialResolver } from "../accounts/types.js";
import type { OwnerRequestPolicy } from "../coding-oauth/web-origin.js";
import type { ExactWebServer, UsageStatsLogger } from "./router.js";
export declare const LEGACY_CREDENTIAL_PATH = "/api/usage-stats/credential";
export declare const LEGACY_CREDENTIAL_IMPORT_PATH = "/api/usage-stats/credential/import";
export interface CredentialDescription {
    readonly configured?: boolean;
    readonly source?: string;
    readonly writable?: boolean;
}
export interface WritableCredentials extends CredentialResolver {
    describe?(ref: string): Promise<CredentialDescription | undefined>;
    unset?(ref: string): Promise<void>;
}
export interface CredentialApiDependencies {
    readonly logger: UsageStatsLogger;
    readonly credentials: WritableCredentials | undefined | (() => WritableCredentials | undefined);
    readonly accounts: Pick<AccountService, "credentialRefs" | "refresh">;
    readonly accountDeps?: AccountDeps;
    readonly ownerRequestPolicy?: OwnerRequestPolicy | undefined;
}
export declare function registerCredentialRoutes(webServer: ExactWebServer, dependencies: CredentialApiDependencies): readonly (() => void)[];
//# sourceMappingURL=credentials.d.ts.map