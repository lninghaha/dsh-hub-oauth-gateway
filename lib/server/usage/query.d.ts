import type { BreakdownData, OverviewData, SeriesData } from "../../shared/contracts.js";
import type { UsageQuery } from "../../shared/domain.js";
import type { PricingRepository } from "../pricing/repository.js";
import type { UsageRepository } from "./repository.js";
export declare class UsageQueryService {
    #private;
    constructor(usage: UsageRepository, pricing: PricingRepository, baseCurrency: string);
    setBaseCurrency(currency: string): void;
    overview(query: UsageQuery, alertCount?: number): OverviewData;
    series(query: UsageQuery): SeriesData;
    breakdown(query: UsageQuery, dimension: BreakdownData["dimension"], showSessionIdentifiers?: boolean): BreakdownData;
}
//# sourceMappingURL=query.d.ts.map