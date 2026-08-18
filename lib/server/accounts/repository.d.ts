import { type AccountSnapshot } from "../../shared/domain.js";
import type { UsageDatabase } from "../storage/database.js";
export declare class AccountSnapshotRepository {
    #private;
    constructor(database: UsageDatabase);
    save(snapshot: AccountSnapshot, observedAt?: number): AccountSnapshot;
    saveMany(snapshots: readonly AccountSnapshot[], observedAt?: number): AccountSnapshot[];
    latest(providerId: string, profileId?: string): AccountSnapshot | null;
    latestAll(): AccountSnapshot[];
    pruneBefore(cutoff: number): number;
}
//# sourceMappingURL=repository.d.ts.map