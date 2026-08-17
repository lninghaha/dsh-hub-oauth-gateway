import type { SessionEvent } from "@deepseek-ai/dsh-session";
import { type SessionSourceKind } from "./projector.js";
import type { UsageRepository } from "./repository.js";
export interface ObservedSession {
    readonly id: string;
    readonly kind: Exclude<SessionSourceKind, "legacy">;
    readonly revision: string | null;
    loadEvents(fromSeq: number): Promise<readonly SessionEvent[]>;
}
export interface SessionInventory {
    observeSessions(): Promise<readonly ObservedSession[]>;
}
export interface UsageSyncResult {
    readonly observedSessions: number;
    readonly changedSessions: number;
    readonly rebuiltSessions: number;
    readonly deletedSessions: number;
    readonly failedSessions: number;
    readonly factsWritten: number;
    readonly completedAt: number;
}
export interface UsageProjectionServiceOptions {
    readonly preserveDeletedSessions: boolean;
    readonly now?: () => number;
}
export declare class UsageProjectionService {
    #private;
    constructor(repository: UsageRepository, inventory: SessionInventory, options: UsageProjectionServiceOptions);
    synchronize(): Promise<UsageSyncResult>;
}
//# sourceMappingURL=service.d.ts.map