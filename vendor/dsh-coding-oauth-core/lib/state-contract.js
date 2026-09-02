/** Stable on-disk and HTTP contracts shared by every OAuth runtime owner. */
export const CODING_OAUTH_STATE_SCHEMA_VERSION = 1;
export const CAPABILITY_SETTINGS_NAMESPACE = "coding-subscription-oauth";
export const GATEWAY_KEY_FILENAME = ".coding-oauth-gateway.json";
export const IMAGINE_MEDIA_STORE_DIRNAME = ".dsh-coding-subscription-oauth-media";
export const GROK_BUILD_AUTH_STATUS_PATH = "/plugins/dsh-grok-build/auth/status";
export const GROK_BUILD_AUTH_LOGIN_PATH = "/plugins/dsh-grok-build/auth/login";
export const GROK_BUILD_AUTH_LOGIN_CODE_PATH = "/plugins/dsh-grok-build/auth/login/code";
export const GROK_BUILD_AUTH_LOGIN_CANCEL_PATH = "/plugins/dsh-grok-build/auth/login/cancel";
export const GROK_BUILD_AUTH_IMPORT_PATH = "/plugins/dsh-grok-build/auth/import";
export const GROK_BUILD_AUTH_LOGOUT_PATH = "/plugins/dsh-grok-build/auth/logout";
export const GROK_BUILD_AUTH_MODELS_PATH = "/plugins/dsh-grok-build/auth/models";
export const CODING_OAUTH_STATUS_PATH = "/plugins/dsh-grok-build/oauth/status";
export const CODING_OAUTH_LOGIN_PATH = "/plugins/dsh-grok-build/oauth/login";
export const CODING_OAUTH_LOGIN_CODE_PATH = "/plugins/dsh-grok-build/oauth/code";
export const CODING_OAUTH_LOGIN_CANCEL_PATH = "/plugins/dsh-grok-build/oauth/cancel";
export const CODING_OAUTH_LOGOUT_PATH = "/plugins/dsh-grok-build/oauth/logout";
export const CODING_OAUTH_MODELS_PATH = "/plugins/dsh-grok-build/oauth/models";
export const OAUTH_IMPORT_SOURCES_PATH = "/plugins/dsh-grok-build/oauth/sources";
export const OAUTH_IMPORT_PREVIEW_PATH = "/plugins/dsh-grok-build/oauth/sources/preview";
export const OAUTH_IMPORT_COMMIT_PATH = "/plugins/dsh-grok-build/oauth/sources/commit";
export const OAUTH_IMPORT_CANCEL_PATH = "/plugins/dsh-grok-build/oauth/sources/cancel";
export const CAPABILITY_SETTINGS_PATH = "/plugins/dsh-grok-build/capabilities";
export const CODEX_USAGE_PATH = "/plugins/dsh-grok-build/codex/usage";
export const IMAGINE_CREDENTIAL_STATUS_PATH = "/plugins/dsh-grok-build/imagine/credential-status";
export const GATEWAY_SETTINGS_PATH = "/plugins/dsh-grok-build/gateway";
export const GATEWAY_REVEAL_PATH = "/plugins/dsh-grok-build/gateway/reveal";
export const GATEWAY_ROTATE_PATH = "/plugins/dsh-grok-build/gateway/rotate";
export const CODING_OAUTH_MANAGEMENT_PATHS = Object.freeze([
    GROK_BUILD_AUTH_STATUS_PATH,
    GROK_BUILD_AUTH_LOGIN_PATH,
    GROK_BUILD_AUTH_LOGIN_CODE_PATH,
    GROK_BUILD_AUTH_LOGIN_CANCEL_PATH,
    GROK_BUILD_AUTH_IMPORT_PATH,
    GROK_BUILD_AUTH_LOGOUT_PATH,
    GROK_BUILD_AUTH_MODELS_PATH,
    CODING_OAUTH_STATUS_PATH,
    CODING_OAUTH_LOGIN_PATH,
    CODING_OAUTH_LOGIN_CODE_PATH,
    CODING_OAUTH_LOGIN_CANCEL_PATH,
    CODING_OAUTH_LOGOUT_PATH,
    CODING_OAUTH_MODELS_PATH,
    OAUTH_IMPORT_SOURCES_PATH,
    OAUTH_IMPORT_PREVIEW_PATH,
    OAUTH_IMPORT_COMMIT_PATH,
    OAUTH_IMPORT_CANCEL_PATH,
    CAPABILITY_SETTINGS_PATH,
    CODEX_USAGE_PATH,
    IMAGINE_CREDENTIAL_STATUS_PATH,
    GATEWAY_SETTINGS_PATH,
    GATEWAY_REVEAL_PATH,
    GATEWAY_ROTATE_PATH,
]);
//# sourceMappingURL=state-contract.js.map