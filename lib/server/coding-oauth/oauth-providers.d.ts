/**
 * Native pi-ai OAuth providers and their stable Harness route aliases.
 * @module dsh-coding-subscription-oauth/oauth-providers
 */
import type { Api, Provider } from "@earendil-works/pi-ai";
import { type CodingOAuthProviderSlug } from "./ids.js";
export type SubscriptionProviderSlug = Exclude<CodingOAuthProviderSlug, "grok">;
export type SubscriptionLoginMethod = "browser" | "device";
export interface OAuthProviderDefinition {
    slug: SubscriptionProviderSlug;
    route: string;
    nativeProviderId: string;
    displayName: string;
    authFilename: string;
    modelsCacheFilename: string;
    loginMethods: readonly SubscriptionLoginMethod[];
    recommendedLoginMethod: SubscriptionLoginMethod;
    providerFactory(): Provider<Api>;
    requestProvider(selectedIds?: readonly string[]): Provider<Api>;
}
export declare const CODEX_OAUTH_PROVIDER: OAuthProviderDefinition;
export declare const KIMI_CODE_OAUTH_PROVIDER: OAuthProviderDefinition;
export declare const CLAUDE_CODE_OAUTH_PROVIDER: OAuthProviderDefinition;
/**
 * GitHub Copilot subscription via pi-ai `githubCopilotProvider` + device OAuth.
 * LLM registration stays gated on operator `oauthDevice.copilotClientId` (fail closed).
 * pi-ai hardcodes the public VS Code Copilot client id for the device grant; Hub still
 * requires the operator clientId so enablement is an explicit opt-in (Usage Center device
 * adapter and coding-oauth LLM route share that gate).
 */
export declare const COPILOT_OAUTH_PROVIDER: OAuthProviderDefinition;
/** Always-on core subscription providers (Codex / Kimi / Claude). */
export declare const CORE_OAUTH_PROVIDER_DEFINITIONS: readonly [OAuthProviderDefinition, OAuthProviderDefinition, OAuthProviderDefinition];
/** Full Hub definition table including the opt-in Copilot route. */
export declare const OAUTH_PROVIDER_DEFINITIONS: readonly [OAuthProviderDefinition, OAuthProviderDefinition, OAuthProviderDefinition, OAuthProviderDefinition];
/** Definitions enabled for the current Hub config (Copilot requires copilotClientId). */
export declare function enabledOAuthProviderDefinitions(options?: {
    copilotClientId?: string | undefined;
}): readonly OAuthProviderDefinition[];
export declare function oauthProviderDefinition(slug: string): OAuthProviderDefinition | undefined;
//# sourceMappingURL=oauth-providers.d.ts.map