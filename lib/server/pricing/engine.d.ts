import type { CostEstimate } from "../../shared/contracts.js";
import type { PriceRule, UsageBuckets } from "../../shared/domain.js";
export interface PriceableUsage extends UsageBuckets {
    readonly providerId: string;
    readonly modelId: string;
    readonly occurredAt: number;
}
export declare function selectPriceRule(usage: PriceableUsage, rules: readonly PriceRule[], currency: string): PriceRule | null;
export declare function estimateUsageCost(usage: readonly PriceableUsage[], rules: readonly PriceRule[], currency: string): CostEstimate;
//# sourceMappingURL=engine.d.ts.map