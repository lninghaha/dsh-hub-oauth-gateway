export interface SchedulerLogger {
    warn(message: string): void;
}
export interface RefreshTarget {
    refresh(): Promise<unknown>;
}
export interface RefreshSchedulerOptions {
    readonly usageIntervalMs: number;
    readonly accountIntervalMs: number;
    readonly disabled?: boolean | undefined;
    readonly setInterval?: typeof globalThis.setInterval;
    readonly clearInterval?: typeof globalThis.clearInterval;
}
export interface RefreshScheduler {
    refreshUsage(): Promise<void>;
    refreshAccounts(): Promise<void>;
    stop(): Promise<void>;
}
export declare function startRefreshScheduler(usage: RefreshTarget, accounts: RefreshTarget, logger: SchedulerLogger, options: RefreshSchedulerOptions): RefreshScheduler;
//# sourceMappingURL=scheduler.d.ts.map