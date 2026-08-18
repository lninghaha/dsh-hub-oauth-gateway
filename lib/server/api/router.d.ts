import type { IncomingMessage, ServerResponse } from "node:http";
import { type UsageAlert } from "../../shared/contracts.js";
import type { AccountSnapshot } from "../../shared/domain.js";
import type { ProvidersData } from "../../shared/providers.js";
import type { FeesRepository } from "../fees/repository.js";
import type { LocalAuthSnapshot } from "../local-monitor/auth-status.js";
import type { LocalUsageAggregateRow } from "../local-monitor/repository.js";
import type { PricingRepository } from "../pricing/repository.js";
import type { PreferencesRepository } from "../settings/repository.js";
import type { UsageQueryService } from "../usage/query.js";
export interface UsageStatsLogger {
    warn(message: string): void;
}
export interface ExactWebServer {
    register(route: {
        readonly kind: "exact";
        readonly path: string;
        readonly handler: (request: IncomingMessage, response: ServerResponse) => void | Promise<void>;
    }): () => void;
}
export interface AccountApiService {
    list(): Promise<readonly AccountSnapshot[]>;
    get(providerId: string): Promise<AccountSnapshot | null>;
    refresh(providerIds?: readonly string[]): Promise<readonly AccountSnapshot[]>;
}
export interface UsageProjectionApiService {
    synchronize(): Promise<unknown>;
}
export interface ApiFreshness {
    usageUpdatedAt: number | null;
    accountsUpdatedAt: number | null;
    partial: boolean;
    warnings: readonly string[];
}
export interface LocalAuthApiService {
    snapshot(): Promise<LocalAuthSnapshot>;
}
export interface LocalUsageApiService {
    tools(): readonly {
        toolId: string;
        displayName: string;
        available: boolean;
    }[];
    aggregate(fromDay: string, toDay: string): readonly LocalUsageAggregateRow[];
    stats(): {
        files: number;
        lastScanAt: number | null;
    };
    scan(): Promise<{
        scannedAt: number;
        files: number;
        events: number;
        skipped: number;
    }>;
}
export interface UsageStatsApiDependencies {
    readonly logger: UsageStatsLogger;
    readonly projection: UsageProjectionApiService;
    readonly queries: UsageQueryService;
    readonly pricing: PricingRepository;
    readonly preferences: PreferencesRepository;
    readonly accounts: AccountApiService;
    readonly fees?: FeesRepository | undefined;
    readonly providers?: {
        list(): Promise<ProvidersData>;
    } | undefined;
    readonly alerts?: {
        list(): Promise<readonly UsageAlert[]>;
    } | undefined;
    readonly localAuth?: LocalAuthApiService | undefined;
    readonly localUsage?: LocalUsageApiService | undefined;
    freshness(): ApiFreshness;
    now?(): number;
}
export declare function registerV1Routes(webServer: ExactWebServer, dependencies: UsageStatsApiDependencies): readonly (() => void)[];
//# sourceMappingURL=router.d.ts.map