import { type AccountFeeRecord, type FeesData } from "../../shared/fees.js";
import type { UsageDatabase } from "../storage/database.js";
export declare class FeesRepository {
    #private;
    constructor(database: UsageDatabase);
    list(): AccountFeeRecord[];
    replaceAll(fees: readonly AccountFeeRecord[], updatedAt?: number): FeesData;
}
//# sourceMappingURL=repository.d.ts.map