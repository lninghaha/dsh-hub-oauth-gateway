import type { AccountSnapshot } from "../../shared/domain.js";
import { AccountAdapterRegistry } from "./registry.js";
import type { AccountSnapshotRepository } from "./repository.js";
import { type AccountConfig, type AccountDeps, type AccountSpec, type CredentialResolver, type ProviderDescriptor } from "./types.js";
export interface AccountServiceOptions {
    readonly credentials: CredentialResolver | undefined;
    readonly getProviders: () => Promise<readonly ProviderDescriptor[]>;
    readonly config: AccountConfig;
    readonly repository: AccountSnapshotRepository;
    readonly registry?: AccountAdapterRegistry;
    readonly deps?: AccountDeps;
    readonly refreshMs?: number;
    readonly concurrency?: number;
    readonly includeCompatibilityProviders?: boolean;
    /** Drop lastGood after this many consecutive transient failures (default 3). */
    readonly staleFailureLimit?: number;
}
export interface AccountRefreshResult {
    readonly accounts: readonly AccountSnapshot[];
    readonly completedAt: number;
}
export declare class AccountService {
    #private;
    constructor(options: AccountServiceOptions);
    get lastRefreshAt(): number | null;
    specs(): Promise<AccountSpec[]>;
    credentialRefs(): Promise<ReadonlySet<string>>;
    list(): Promise<readonly AccountSnapshot[]>;
    get(providerId: string, force?: boolean, profileId?: string): Promise<AccountSnapshot | null>;
    refresh(providerIds?: readonly string[]): Promise<readonly AccountSnapshot[]>;
}
//# sourceMappingURL=service.d.ts.map