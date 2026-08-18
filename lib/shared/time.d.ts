import type { TimeGranularity } from "./domain.js";
export declare function bucketKey(epochMs: number, timeZone: string, granularity: TimeGranularity, weekStartsOn?: 0 | 1 | 6): string;
export declare function bucketTimestamp(key: string, timeZone: string, granularity: TimeGranularity): number;
/** Shift a YYYY-MM-DD calendar key by whole days (timezone-independent once keyed). */
export declare function shiftDayKey(dayKey: string, deltaDays: number): string;
export declare function enumerateDayKeys(fromDayKey: string, toDayKeyInclusive: string): string[];
//# sourceMappingURL=time.d.ts.map