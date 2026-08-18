/**
 * Optional Antigravity quota probe. Does not perform OAuth or spawn binaries;
 * requires an explicit credentialRef (and optional usageBaseURL) from the
 * operator / external `dsh-agy` plugin.
 */
import type { AccountAdapter } from "../types.js";
export declare const ANTIGRAVITY_CREDENTIAL_REF = "ANTIGRAVITY_ACCESS_TOKEN";
/**
 * Opt-in Antigravity read-only quota. Without credential + usageBaseURL the
 * adapter stays `not-configured` (external plugin owns login).
 */
export declare const antigravityQuotaAdapter: AccountAdapter;
//# sourceMappingURL=antigravity-quota.d.ts.map