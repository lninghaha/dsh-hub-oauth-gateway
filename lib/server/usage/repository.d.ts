import type { UsageBuckets } from "../../shared/domain.js";
import type { UsageDatabase } from "../storage/database.js";
import type { ProjectUsageResult, SessionProjectionCursor, UsageFact } from "./projector.js";
export interface UsageFactFilter {
    readonly from: number;
    readonly to: number;
    readonly providers?: readonly string[];
    readonly models?: readonly string[];
}
export declare class UsageRepository {
    #private;
    constructor(database: UsageDatabase);
    getCursor(sessionId: string): SessionProjectionCursor | null;
    listCursors(): SessionProjectionCursor[];
    applyProjection(result: ProjectUsageResult, replaceSession?: boolean): void;
    applyProjections(items: readonly {
        readonly result: ProjectUsageResult;
        readonly replaceSession?: boolean;
    }[]): void;
    saveCursor(cursor: SessionProjectionCursor): void;
    markDeleted(sessionId: string, deletedAt?: number, purgeFacts?: boolean): void;
    deleteSession(sessionId: string): void;
    listFacts(filter: UsageFactFilter): UsageFact[];
    pruneBefore(cutoff: number): number;
    countFacts(): number;
    sumFacts(filter: UsageFactFilter): UsageBuckets & {
        requests: number;
    };
}
//# sourceMappingURL=repository.d.ts.map