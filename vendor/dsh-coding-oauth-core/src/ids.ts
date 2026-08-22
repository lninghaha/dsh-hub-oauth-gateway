/** Stable provider, route, credential, and cache identifiers shared by every participant. */

export const XAI_PI_PROVIDER = "xai";
export const CODEX_PI_PROVIDER = "openai-codex";
export const KIMI_PI_PROVIDER = "kimi-coding";
export const CLAUDE_PI_PROVIDER = "anthropic";

export const GROK_BUILD_ROUTE = "grok-build";
export const CODEX_OAUTH_ROUTE = "codex-oauth";
export const CODEX_OAUTH_FAST_ROUTE = "codex-oauth-fast";
export const KIMI_CODE_OAUTH_ROUTE = "kimi-code-oauth";
export const CLAUDE_CODE_OAUTH_ROUTE = "claude-code-oauth";
export const ANTIGRAVITY_ROUTE = "agy";

export const CODING_OAUTH_ROUTES = [
	GROK_BUILD_ROUTE,
	CODEX_OAUTH_ROUTE,
	KIMI_CODE_OAUTH_ROUTE,
	CLAUDE_CODE_OAUTH_ROUTE,
] as const;

export const CODING_OAUTH_OPTIONAL_ROUTES = [CODEX_OAUTH_FAST_ROUTE] as const;

export type CodingOAuthRoute = (typeof CODING_OAUTH_ROUTES)[number];
export type CodingOAuthOptionalRoute = (typeof CODING_OAUTH_OPTIONAL_ROUTES)[number];
export type CodingOAuthProviderSlug = "grok" | "codex" | "kimi" | "claude";

/** Basenames remain unchanged so ownership migration never resets a login. */
export const GROK_BUILD_AUTH_FILENAME = ".grok-build-auth.json";
export const CODEX_OAUTH_AUTH_FILENAME = ".codex-oauth-auth.json";
export const KIMI_CODE_OAUTH_AUTH_FILENAME = ".kimi-code-oauth-auth.json";
export const CLAUDE_CODE_OAUTH_AUTH_FILENAME = ".claude-code-oauth-auth.json";

export const GROK_BUILD_MODELS_CACHE_FILENAME = ".grok-build-models.json";
export const CODEX_OAUTH_MODELS_CACHE_FILENAME = ".codex-oauth-models.json";
export const KIMI_CODE_OAUTH_MODELS_CACHE_FILENAME = ".kimi-code-oauth-models.json";
export const CLAUDE_CODE_OAUTH_MODELS_CACHE_FILENAME = ".claude-code-oauth-models.json";

export const DEFAULT_GROK_BUILD_MODEL = "grok-4.6";
export const GROK_BUILD_STREAM_IDLE_TIMEOUT_MS = 300_000;
