/**
 * SQLite persistence for the opt-in cross-tool usage scan. Cursors are keyed
 * by the SHA-256 of the file path so no absolute path is ever persisted;
 * per-file daily aggregates make full re-reads after log rotation exact
 * (the file's rows are replaced, never double counted).
 */
import type { UsageDatabase } from "../storage/database.js";
export interface LocalUsageCursor {
    size: number;
    mtime: number;
    nextOffset: number;
}
export interface LocalUsageEventRow {
    occurredAt: number;
    modelId: string;
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens: number;
    cacheWriteTokens: number;
}
export interface LocalUsageAggregateRow {
    day: string;
    toolId: string;
    modelId: string;
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens: number;
    cacheWriteTokens: number;
    requests: number;
}
export declare function localUsageFileHash(path: string): string;
export declare function localUsageDay(occurredAt: number): string;
export declare class LocalUsageRepository {
    private readonly database;
    constructor(database: UsageDatabase);
    cursor(fileHash: string): LocalUsageCursor | null;
    /** Replace a file's contribution and cursor (rotation or first full read). */
    replaceFile(fileHash: string, toolId: string, size: number, mtime: number, nextOffset: number, scannedAt: number, events: readonly LocalUsageEventRow[]): void;
    /** Append newly parsed events and advance the cursor (appended content). */
    appendFile(fileHash: string, toolId: string, size: number, mtime: number, nextOffset: number, scannedAt: number, events: readonly LocalUsageEventRow[]): void;
    private insertEvents;
    /** Aggregate every file's contribution grouped by day, tool, and model. */
    aggregate(fromDay: string, toDay: string): LocalUsageAggregateRow[];
    stats(): {
        files: number;
        lastScanAt: number | null;
    };
    /** Drop files not re-seen since `beforeMs` and rows older than `fromDay`. */
    prune(fromDay: string, beforeMs: number): void;
}
//# sourceMappingURL=repository.d.ts.map