import { type PriceRule } from "../../shared/domain.js";
import type { UsageDatabase } from "../storage/database.js";
export declare class PricingRepository {
    #private;
    constructor(database: UsageDatabase);
    list(): PriceRule[];
    upsert(rule: PriceRule): void;
    replaceUserRules(rules: readonly PriceRule[]): void;
    delete(id: string): boolean;
}
//# sourceMappingURL=repository.d.ts.map