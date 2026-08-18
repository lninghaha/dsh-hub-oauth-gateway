export interface SchedulerLogger {
    warn(message: string): void;
}
export interface RefreshTarget {
    refresh(): Promise<unknown>;
}
export interface RefreshSchedulerOptions {
    readonly usageIntervalMs: number;
    readonly accountIntervalMs: number;
    /** When provided, account refresh is scheduled with setTimeout using this delay after each run. */
    readonly nextAccountIntervalMs?: (() => number) | undefined;
    readonly disabled?: boolean | undefined;
    readonly setInterval?: typeof globalThis.setInterval;
    readonly clearInterval?: typeof globalThis.clearInterval;
    readonly setTimeout?: typeof globalThis.setTimeout;
    readonly clearTimeout?: typeof globalThis.clearTimeout;
}
export interface RefreshScheduler {
    refreshUsage(): Promise<void>;
    refreshAccounts(): Promise<void>;
    stop(): Promise<void>;
}
/**
 * Choose the next adaptive account refresh delay from the hottest quota window.
 * High utilization → shorter interval, clamped to [min, max].
 */
export declare function adaptiveAccountIntervalMs(maxUsedRatio: number | null, minMs: number, maxMs: number, baseMs: number): number;
export declare function startRefreshScheduler(usage: RefreshTarget, accounts: RefreshTarget, logger: SchedulerLogger, options: RefreshSchedulerOptions): RefreshScheduler;
//# sourceMappingURL=scheduler.d.ts.map