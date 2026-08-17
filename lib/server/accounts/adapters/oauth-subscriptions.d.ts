/**
 * OAuth/access-token subscription adapters: Claude, Codex, Gemini,
 * GitHub Copilot, Cursor, Grok, and Amp. Each is a constrained endpoint probe
 * authenticated with a user access token.
 */
import type { AccountAdapter } from "../types.js";
export declare const CLAUDE_OAUTH_TOKEN_REF = "CLAUDE_OAUTH_TOKEN";
export declare const CODEX_ACCESS_TOKEN_REF = "CODEX_ACCESS_TOKEN";
export declare const GEMINI_ACCESS_TOKEN_REF = "GEMINI_ACCESS_TOKEN";
export declare const COPILOT_TOKEN_REF = "GITHUB_COPILOT_TOKEN";
export declare const CURSOR_TOKEN_REF = "CURSOR_ACCESS_TOKEN";
export declare const GROK_TOKEN_REF = "GROK_ACCESS_TOKEN";
export declare const AMP_API_KEY_REF = "AMP_API_KEY";
/** Claude subscription usage via the OAuth usage endpoint. */
export declare const claudeOauthAdapter: AccountAdapter;
/** Codex (ChatGPT subscription) usage via the wham endpoint. */
export declare const codexWhamAdapter: AccountAdapter;
/** Gemini Code Assist quota via the Cloud Code internal endpoint. */
export declare const geminiQuotaAdapter: AccountAdapter;
/** GitHub Copilot quota snapshots (token from the device flow). */
export declare const copilotDeviceAdapter: AccountAdapter;
/** Cursor plan usage via the dashboard Connect RPC endpoint. */
export declare const cursorSubscriptionAdapter: AccountAdapter;
/** Grok subscription billing via the CLI chat proxy. */
export declare const grokSubscriptionAdapter: AccountAdapter;
/** Amp balance via the internal RPC endpoint. */
export declare const ampSubscriptionAdapter: AccountAdapter;
//# sourceMappingURL=oauth-subscriptions.d.ts.map