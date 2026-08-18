import type { ActivityData, BreakdownData, DailyExportRow, OverviewData, SeriesData } from "../../shared/contracts.js";
import type { UsageQuery } from "../../shared/domain.js";
import type { PricingRepository } from "../pricing/repository.js";
import type { UsageRepository } from "./repository.js";
export declare const ACTIVITY_WINDOW_DAYS = 370;
export interface ActivityOptions {
    readonly timeZone: string;
    readonly metric: UsageQuery["metric"];
    readonly weekStartsOn: 0 | 1 | 6;
    readonly streakMinTokens: number;
    readonly now?: number;
    readonly providers?: readonly string[];
    readonly models?: readonly string[];
}
export declare class UsageQueryService {
    #private;
    constructor(usage: UsageRepository, pricing: PricingRepository, baseCurrency: string);
    setBaseCurrency(currency: string): void;
    overview(query: UsageQuery, alertCount?: number): OverviewData;
    series(query: UsageQuery): SeriesData;
    breakdown(query: UsageQuery, dimension: BreakdownData["dimension"], showSessionIdentifiers?: boolean): BreakdownData;
    activity(options: ActivityOptions): ActivityData;
    dailyExportRows(query: UsageQuery): DailyExportRow[];
}
//# sourceMappingURL=query.d.ts.map