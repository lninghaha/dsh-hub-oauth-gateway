/**
 * Bridge coding-oauth session tokens into AccountService credential refs.
 *
 * OAuth login writes plugin auth files; quota adapters resolve
 * GROK_ACCESS_TOKEN / CODEX_ACCESS_TOKEN / CLAUDE_OAUTH_TOKEN / KIMI_API_KEY
 * via the Harness credentials seam. When those refs are empty, fall back to
 * the signed-in coding-oauth session access token (in memory only — never
 * logged or stored).
 */
import type { CodingOAuthRuntime } from "../coding-oauth/compose.js";
import type { CredentialResolver } from "./types.js";
export declare const GROK_ACCESS_TOKEN_REF = "GROK_ACCESS_TOKEN";
export declare const CODEX_ACCESS_TOKEN_REF = "CODEX_ACCESS_TOKEN";
export declare const CLAUDE_OAUTH_TOKEN_REF = "CLAUDE_OAUTH_TOKEN";
export declare const KIMI_API_KEY_REF = "KIMI_API_KEY";
/** AccountProvider ids refreshed after OAuth login / CLI pull. */
export declare const OAUTH_QUOTA_ACCOUNT_IDS: readonly ["grok", "codex", "claude", "kimi-coding"];
export interface OAuthTokenSource {
    resolveGrokAccessToken(): Promise<string | undefined>;
    resolveCodexAccessToken(): Promise<string | undefined>;
    resolveClaudeAccessToken(): Promise<string | undefined>;
    resolveKimiAccessToken(): Promise<string | undefined>;
}
/** Build a token source from the current coding-oauth owner runtime. */
export declare function oauthTokenSourceFromRuntime(runtime: CodingOAuthRuntime | undefined | (() => CodingOAuthRuntime | undefined)): OAuthTokenSource;
/**
 * Wrap a Harness credential resolver so empty OAuth quota refs fall back to
 * coding-oauth sessions. Explicit Harness / env values always win.
 */
export declare function createOAuthQuotaCredentialBridge(base: CredentialResolver | undefined | (() => CredentialResolver | undefined), tokens: OAuthTokenSource): CredentialResolver;
//# sourceMappingURL=oauth-credential-bridge.d.ts.map