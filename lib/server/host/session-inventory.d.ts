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
/** Handle dialect (DSH 0.1.5+): open → read → close / asyncDispose. */
export interface SessionPersistenceReadHandleLike {
    read(offset?: number, length?: number): Promise<{
        readonly events: readonly SessionEvent[];
    }>;
    close?(): Promise<void> | void;
    [Symbol.asyncDispose]?: () => PromiseLike<void> | void;
}
export interface SessionPersistenceLike {
    listSnapshots?(): Promise<readonly PersistenceSnapshotLike[]>;
    /** Legacy: bare headers. Handle dialect: snapshots with header + revision. */
    list(): Promise<readonly (SessionHeaderLike | PersistenceSnapshotLike)[]>;
    /** Legacy dialect (DSH 0.1.1). */
    readFrom?(id: string, fromSeq: number): Promise<{
        readonly events: readonly SessionEvent[];
    }>;
    /** Handle dialect (DSH 0.1.5+). */
    open?(id: string, access: "read" | "write"): Promise<SessionPersistenceReadHandleLike>;
}
export interface DshSessionInventoryOptions {
    readonly sessions: LiveSessionsLike | undefined | (() => LiveSessionsLike | undefined);
    readonly persistence: SessionPersistenceLike | undefined | (() => SessionPersistenceLike | undefined);
    onWarning?(message: string | null): void;
}
/** Normalize list() entries that may be bare headers or full snapshots. */
export declare function normalizePersistenceList(entries: readonly (SessionHeaderLike | PersistenceSnapshotLike)[]): PersistenceSnapshotLike[];
export declare class DshSessionInventory implements SessionInventory {
    #private;
    constructor(options: DshSessionInventoryOptions);
    observeSessions(): Promise<readonly ObservedSession[]>;
}
//# sourceMappingURL=session-inventory.d.ts.map