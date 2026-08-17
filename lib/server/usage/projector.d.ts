import type { SessionEvent } from "@deepseek-ai/dsh-session";
import { type UsageBuckets } from "../../shared/domain.js";
export type SessionSourceKind = "live" | "persisted" | "legacy";
export interface SessionProjectionCursor {
    readonly sessionId: string;
    readonly sourceKind: SessionSourceKind;
    readonly sourceRevision: string | null;
    readonly nextSeq: number;
    readonly currentProvider: string | null;
    readonly currentModel: string | null;
    readonly lastSeenAt: number;
    readonly deletedAt: number | null;
}
export interface UsageFact extends UsageBuckets {
    readonly sessionId: string;
    readonly turn: number;
    readonly step: number;
    readonly eventSeq: number;
    readonly occurredAt: number;
    readonly providerId: string;
    readonly modelId: string;
}
export declare class UsageProjectionGapError extends Error {
    readonly expectedSeq: number;
    readonly actualSeq: number;
    constructor(expectedSeq: number, actualSeq: number);
}
export declare function emptySessionCursor(sessionId: string, sourceKind: SessionSourceKind, sourceRevision: string | null, observedAt?: number): SessionProjectionCursor;
export interface ProjectUsageResult {
    readonly cursor: SessionProjectionCursor;
    readonly facts: readonly UsageFact[];
}
export declare function projectUsageEvents(cursor: SessionProjectionCursor, events: readonly SessionEvent[], sourceRevision?: string | null, observedAt?: number): ProjectUsageResult;
//# sourceMappingURL=projector.d.ts.map