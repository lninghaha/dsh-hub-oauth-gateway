/**
 * Optional xAI Grok Build bundle with OAuth, account model catalog,
 * and an account section inside dsh Settings.
 *
 * Ported from the grok-build `src/index.ts` into the usage-stats plugin.
 * The public plugin entry point here is `applyCodingOAuth` (not the Cordis
 * `apply`), and the plugin identity string is kept compatible under
 * `CODING_OAUTH_PLUGIN_NAME` so logs/settings remain compatible.
 * @module dsh-coding-subscription-oauth
 */
import type { Context } from "@deepseek-ai/cordis";
import { type RetryPolicyConfig } from "@deepseek-ai/dsh-llm";
import z from "@deepseek-ai/schemastery";
import { CapabilityRuntimeState } from "./capability-runtime.js";
import { type CapabilitySettingsPatch } from "./capability-settings.js";
import { type GatewayConfig } from "./gateway-config.js";
import { OAuthProviderSession } from "./oauth-session.js";
import { GrokBuildSession } from "./session.js";
import { type GetQuotaWindows } from "./quota-pool.js";
import { type OwnerRequestPolicyConfig } from "./web-origin.js";
export { createCodingOAuthAdapter, createGrokBuildAdapter, preferredGrokBuildModel } from "./adapter.js";
export type { AliasLlmRoutePolicy, AliasLlmPoolHooks } from "./alias-adapter.js";
export { AliasLlmAdapter } from "./alias-adapter.js";
export type { GrokBuildAuthStatus } from "./auth.js";
export { grokBuildAuthStatus, importGrokBuildFromGrok, importGrokBuildSession, loginGrokBuild, loginGrokBuildSession, logoutGrokBuild, } from "./auth.js";
export type { CodingOAuthWebStatus, GrokBuildLoginMethod, GrokBuildWebAuthStatus, LoginChallenge, SubscriptionLoginChallenge, SubscriptionWebAuthStatus, } from "./auth-routes.js";
export { CODING_OAUTH_LOGIN_CANCEL_PATH, CODING_OAUTH_LOGIN_CODE_PATH, CODING_OAUTH_LOGIN_PATH, CODING_OAUTH_LOGOUT_PATH, CODING_OAUTH_MODELS_PATH, CODING_OAUTH_STATUS_PATH, GROK_BUILD_AUTH_IMPORT_PATH, GROK_BUILD_AUTH_LOGIN_CANCEL_PATH, GROK_BUILD_AUTH_LOGIN_CODE_PATH, GROK_BUILD_AUTH_LOGIN_PATH, GROK_BUILD_AUTH_LOGOUT_PATH, GROK_BUILD_AUTH_MODELS_PATH, GROK_BUILD_AUTH_STATUS_PATH, GrokBuildWebAuth, registerCodingOAuthRoutes, registerGrokBuildAuthRoutes, SubscriptionWebAuth, } from "./auth-routes.js";
export type { CatalogSource, LiveModelDescriptor } from "./catalog.js";
export { extractLiveModels, extractModelIds, fetchLiveModelIds, fetchLiveModels, materializeLiveModel, mergeLiveCatalog, preferredGrokBuildModelFrom, thinkingLevelMapFromLiveEfforts, } from "./catalog.js";
export type { GrokImportProbe } from "./grok-import.js";
export { grokAuthPath, importGrokAuth, parseGrokAuthDocument, probeGrokAuth } from "./grok-import.js";
export type { CodingOAuthProviderSlug, CodingOAuthRoute } from "./ids.js";
export { ANTIGRAVITY_ROUTE, CLAUDE_CODE_OAUTH_AUTH_FILENAME, CLAUDE_CODE_OAUTH_MODELS_CACHE_FILENAME, CLAUDE_CODE_OAUTH_ROUTE, CLAUDE_PI_PROVIDER, CODEX_OAUTH_AUTH_FILENAME, CODEX_OAUTH_MODELS_CACHE_FILENAME, CODEX_OAUTH_ROUTE, CODEX_PI_PROVIDER, CODING_OAUTH_ROUTES, DEFAULT_GROK_BUILD_MODEL, GROK_BUILD_AUTH_FILENAME, GROK_BUILD_MODELS_CACHE_FILENAME, GROK_BUILD_ROUTE, GROK_BUILD_STREAM_IDLE_TIMEOUT_MS, KIMI_CODE_OAUTH_AUTH_FILENAME, KIMI_CODE_OAUTH_MODELS_CACHE_FILENAME, KIMI_CODE_OAUTH_ROUTE, KIMI_PI_PROVIDER, XAI_PI_PROVIDER, } from "./ids.js";
export type { GrokBuildOAuthErrorCode, GrokBuildOAuthParams, PkceLoginCallbacks } from "./oauth.js";
export { buildAuthorizeUrl, discoverOAuthEndpoints, extractCode, GROK_BUILD_OAUTH_CLIENT_ID, GROK_BUILD_OAUTH_DEFAULT_PORT, GROK_BUILD_OAUTH_ISSUER, GROK_BUILD_OAUTH_SCOPE, GrokBuildOAuthError, generatePkce, loginGrokBuildPkce, refreshGrokBuildToken, resolveOAuthParams, } from "./oauth.js";
export type { OAuthProviderDefinition, SubscriptionLoginMethod, SubscriptionProviderSlug } from "./oauth-providers.js";
export { CLAUDE_CODE_OAUTH_PROVIDER, CODEX_OAUTH_PROVIDER, KIMI_CODE_OAUTH_PROVIDER, OAUTH_PROVIDER_DEFINITIONS, oauthProviderDefinition, } from "./oauth-providers.js";
export type { OAuthProviderStatus } from "./oauth-session.js";
export { OAuthProviderSession, oauthModelsCachePath } from "./oauth-session.js";
export { GROK_BUILD_BASE_URL, GROK_BUILD_MODELS_URL, GROK_CLIENT_VERSION, grokBuildBaselineModels, grokBuildFingerprintHeaders, grokBuildProvider, grokBuildReasoningMap, } from "./provider.js";
export type { CodingOAuthProxyOptions } from "./proxy.js";
export { codingOAuthProxyInEffect, codingOAuthProxyUnreachableHint, ensureCodingOAuthProxy, ensureGrokBuildProxy, grokBuildProxyInEffect, } from "./proxy.js";
export { redactProxyUrl, safeMessage } from "./redact.js";
export { AccountPoolController, PoolCredentialProxy, QUOTA_FULL_RATIO, StickyAccountMap, orderPoolAccounts, selectAccount, urgencyFromSnapshots, } from "./quota-pool.js";
export type { GetQuotaWindows, PoolMode, PoolPick } from "./quota-pool.js";
export { GrokBuildSession } from "./session.js";
export { GrokBuildCredentialStore, grokBuildAuthPath, OAuthCredentialFileStore, oauthCredentialPath, } from "./store.js";
/** Stable identity string for the coding OAuth plugin (compat with grok-build logs/settings). */
export declare const CODING_OAUTH_PLUGIN_NAME = "llm-grok-build-oauth";
/** Separate API-key credential used only by official xAI Imagine REST calls. */
export declare const XAI_API_KEY_CREDENTIAL = "XAI_API_KEY";
/** Owner-private artifact directory below the resolved DSH home. */
export { IMAGINE_MEDIA_STORE_DIRNAME } from "./ids.js";
/** Plugin configuration; every field is optional. */
export interface Config {
    /** HTTP(S) proxy URL for the audited coding-subscription host allowlist. */
    proxy?: string;
    /** Kimi China traffic stays direct unless explicitly opted into the proxy. */
    proxyKimi?: boolean;
    /**
     * Optional provider retry policy override for the four OAuth routes. When
     * omitted, the plugin retries transient failures (rate limit, server,
     * timeout, transport, empty response) plus AUTH — the latter is safe because
     * the stored credential is invalidated on every AUTH finish, so the retried
     * step refreshes before reuse. Quota exhaustion is never retried.
     */
    retryPolicy?: RetryPolicyConfig;
    /** Secret-free composition/YAML defaults below live user settings. */
    capabilities?: CapabilitySettingsPatch;
    /** Opt-in isolated local OpenAI-compatible gateway. Default off. */
    gateway?: Partial<GatewayConfig>;
    /** Owner-only Settings access over loopback, SSH forwarding, or a trusted HTTPS proxy. */
    ownerRequest?: OwnerRequestPolicyConfig;
    /** Optional multi-account sticky pool (default off = active account only). */
    pool?: {
        mode?: "off" | "priority" | "quota_aware";
        switchMargin?: number;
    };
}
export declare const Config: z<Config>;
export interface CodingOAuthRuntime {
    /** Settles only after the required web route surface is actually mounted. */
    readonly ready: Promise<void>;
    readonly grok: GrokBuildSession;
    readonly subscriptions: readonly OAuthProviderSession[];
    readCodexUsage(options?: {
        force?: boolean;
        signal?: AbortSignal;
    }): Promise<unknown>;
    currentCapabilities(): ReturnType<CapabilityRuntimeState["current"]>;
    /** Register a listener for OAuth login / logout / CLI import (quota refresh). */
    onCredentialChange(listener: () => void): () => void;
    /** Late-bind AccountService (or test) windows for quota_aware scoring. */
    setQuotaWindowsSource(getQuotaWindows: GetQuotaWindows): void;
}
/**
 * Register the `grok-build` LLM route with a provider-native OAuth store.
 * @param ctx - plugin context carrying the LLM registry plus optional web server.
 */
export declare function applyCodingOAuth(ctx: Context, config: Config): CodingOAuthRuntime;
//# sourceMappingURL=compose.d.ts.map