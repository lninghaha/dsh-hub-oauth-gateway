import type { SessionEvent } from "@deepseek-ai/dsh-session";
import type { ObservedSession, SessionInventory } from "../usage/service.js";
export interface LiveSessionLike {
    readonly id: string;
    readonly events: readonly SessionEvent[];
}
export interface LiveSessionsLike {
    list(): readonly LiveSessionLike[];
}
export interface SessionHeaderLike {
    readonly id: string;
}
export interface PersistenceSnapshotLike {
    readonly header: SessionHeaderLike;
    readonly revision: string;
}
export interface SessionPersistenceLike {
    listSnapshots?(): Promise<readonly PersistenceSnapshotLike[]>;
    list(): Promise<readonly SessionHeaderLike[]>;
    readFrom(id: string, fromSeq: number): Promise<{
        readonly events: readonly SessionEvent[];
    }>;
}
export interface DshSessionInventoryOptions {
    readonly sessions: LiveSessionsLike | undefined;
    readonly persistence: SessionPersistenceLike | undefined;
    onWarning?(message: string | null): void;
}
export declare class DshSessionInventory implements SessionInventory {
    #private;
    constructor(options: DshSessionInventoryOptions);
    observeSessions(): Promise<readonly ObservedSession[]>;
}
//# sourceMappingURL=session-inventory.d.ts.map