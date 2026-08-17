import type { TimeGranularity } from "./domain.js";
export declare function bucketKey(epochMs: number, timeZone: string, granularity: TimeGranularity, weekStartsOn?: 0 | 1 | 6): string;
export declare function bucketTimestamp(key: string, timeZone: string, granularity: TimeGranularity): number;
//# sourceMappingURL=time.d.ts.map