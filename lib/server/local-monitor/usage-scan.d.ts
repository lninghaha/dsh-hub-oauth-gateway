/**
 * Incremental, budget-capped scanner for cross-tool local usage logs.
 * Reads are hardened (lstat + O_NOFOLLOW + fstat identity, owner-only,
 * regular files, per-file and per-run byte budgets); only token counters,
 * model ids, and timestamps reach the repository. Scanning runs from the
 * background scheduler or an explicit mutation — never on page loads.
 */
import { type LocalUsageParser } from "./parsers.js";
import { type LocalUsageRepository } from "./repository.js";
export interface LocalUsageScanOptions {
    home: string;
    env: NodeJS.Dict<string>;
    now?: () => number;
    maxFileBytes: number;
    maxTotalBytes: number;
    maxFiles?: number;
    maxDepth?: number;
}
export interface LocalUsageScanResult {
    scannedAt: number;
    files: number;
    events: number;
    skipped: number;
}
export interface LocalUsageScanLogger {
    warn(message: string): void;
}
export declare class LocalUsageScanner {
    private readonly repository;
    private readonly options;
    private readonly logger?;
    private readonly now;
    constructor(repository: LocalUsageRepository, options: LocalUsageScanOptions, logger?: LocalUsageScanLogger | undefined);
    scan(parsers?: readonly LocalUsageParser[]): Promise<LocalUsageScanResult>;
    private scanFile;
    private persist;
}
//# sourceMappingURL=usage-scan.d.ts.map