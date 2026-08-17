import type { CostEstimate, UsageAlert } from "../../shared/contracts.js";
import type { AccountSnapshot } from "../../shared/domain.js";
import type { UserPreferences } from "../../shared/preferences.js";
export declare function evaluateUsageAlerts(accounts: readonly AccountSnapshot[], dailyCost: CostEstimate, preferences: UserPreferences, now?: number): UsageAlert[];
//# sourceMappingURL=service.d.ts.map