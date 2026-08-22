import type { AccountService } from "../accounts/service.js";
import type { OwnerRequestPolicy } from "../coding-oauth/web-origin.js";
import type { PreferencesRepository } from "../settings/repository.js";
import type { UsageRepository } from "../usage/repository.js";
import type { ExactWebServer, UsageProjectionApiService, UsageStatsLogger } from "./router.js";
export declare const LEGACY_PATHS: Readonly<{
    usage: "/api/usage-stats/usage";
    providers: "/api/usage-stats/providers";
    balance: "/api/usage-stats/balance";
    subscriptions: "/api/usage-stats/subscriptions";
    account: "/api/usage-stats/account";
    preferences: "/api/usage-stats/prefs";
}>;
export interface LegacyApiDependencies {
    readonly logger: UsageStatsLogger;
    readonly projection: UsageProjectionApiService;
    readonly usage: UsageRepository;
    readonly accounts: AccountService;
    readonly preferences: PreferencesRepository;
    readonly ownerRequestPolicy?: OwnerRequestPolicy | undefined;
    now?(): number;
}
export declare function registerLegacyRoutes(webServer: ExactWebServer, dependencies: LegacyApiDependencies): readonly (() => void)[];
//# sourceMappingURL=legacy.d.ts.map