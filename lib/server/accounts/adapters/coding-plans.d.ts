/**
 * Coding-plan subscription adapters: Z.ai (GLM Coding Plan), Kimi For
 * Coding, and MiniMax Coding Plan, normalized into shared quota windows.
 */
import type { AccountAdapter } from "../types.js";
export declare const ZAI_API_KEY_REF = "ZAI_API_KEY";
export declare const ZAI_REGION_REF = "ZAI_API_REGION";
export declare const KIMI_API_KEY_REF = "KIMI_API_KEY";
export declare const MINIMAX_API_KEY_REF = "MINIMAX_API_KEY";
export declare const MINIMAX_REGION_REF = "MINIMAX_API_REGION";
/** Z.ai Coding Plan quota endpoints with a normal API key. */
export declare const zaiTokenPlanAdapter: AccountAdapter;
/** Kimi For Coding usage windows. */
export declare const kimiTokenPlanAdapter: AccountAdapter;
/** MiniMax Coding Plan: token-plan endpoint with a fail-closed first-party legacy fallback. */
export declare const minimaxTokenPlanAdapter: AccountAdapter;
//# sourceMappingURL=coding-plans.d.ts.map