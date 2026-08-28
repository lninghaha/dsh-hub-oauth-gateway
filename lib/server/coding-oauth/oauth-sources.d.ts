/**
 * Allowlisted CLI OAuth source discovery, hardened reads, exact parsers, and
 * two-phase preview/commit primitives. The HTTP routes and destination stores
 * stay outside this module so the parent can wire them later.
 * @module dsh-coding-subscription-oauth/oauth-sources
 */
/** Hard ceiling for a CLI source or destination document. */
export declare const OAUTH_SOURCE_MAX_BYTES: number;
/** In-memory preview tickets are one-use and live five minutes. */
export declare const OAUTH_IMPORT_PREVIEW_TTL_MS: number;
/** Bound credential-bearing preview material retained by one process. */
export declare const OAUTH_IMPORT_MAX_PREVIEW_TICKETS = 32;
/** macOS Keychain service name used by the official Claude Code CLI (MIT peer shape). */
export declare const CLAUDE_CODE_KEYCHAIN_SERVICE = "Claude Code-credentials";
/** Sentinel path for Claude Code credentials stored in the macOS Keychain. */
export declare const CLAUDE_CODE_KEYCHAIN_SOURCE_PATH = "keychain:Claude Code-credentials";
export type OAuthSourceOrigin = "file" | "keychain";
/** Injectable Keychain reader for tests. Never logs stdout. */
export type OAuthSourceExecFile = (file: string, args: readonly string[], options: {
    timeout: number;
    encoding: "utf8";
    maxBuffer: number;
}) => Promise<{
    stdout: string;
}>;
/** CLI import kinds only — Copilot has no allowlisted CLI credential file. */
export type OAuthSourceKind = "grok" | "codex" | "kimi" | "claude";
export declare const OAUTH_SOURCE_KINDS: readonly ["grok", "codex", "kimi", "claude"];
export type OAuthImportConflict = "none" | "same_credential" | "same_account" | "different_account" | "unknown_account" | "unreadable_destination" | "unsafe_destination";
export type OAuthImportPreviewAction = "import" | "reuse" | "overwrite" | "blocked";
export type OAuthImportCommitAction = "imported" | "unchanged" | "overwritten";
export type OAuthSourceErrorCode = "not_found" | "unsafe_source" | "too_large" | "invalid_document" | "unsupported" | "preview_expired" | "preview_invalid" | "source_changed" | "destination_changed" | "confirm_required" | "unsafe_destination";
export type OAuthSourceUnavailableReason = "missing" | "unsafe" | "invalid" | "too_large";
export type OAuthDestinationStatus = "missing" | "readable" | "unreadable" | "unsafe";
export interface OAuthSourceCredential {
    type: "oauth";
    access: string;
    refresh: string;
    expires: number;
    accountId?: string;
}
export interface OAuthSourceSpec {
    kind: OAuthSourceKind;
    envHome: "GROK_HOME" | "CODEX_HOME" | "KIMI_SHARE_DIR" | "CLAUDE_CONFIG_DIR";
    defaultDir: string;
    relativeFile: string;
    providerId: string;
}
export interface OAuthSourcePathOptions {
    env?: NodeJS.Dict<string>;
    home?: string;
    /** Defaults to `process.platform`. Inject `darwin` in tests to exercise Keychain preference. */
    platform?: NodeJS.Platform;
    /** Defaults to `child_process/promises.execFile`. Injected for Keychain unit tests. */
    execFile?: OAuthSourceExecFile;
}
export interface OAuthSourceFileIdentity {
    dev: number;
    ino: number;
    size: number;
    uid: number;
    mode: number;
}
export interface HardenedOAuthSourceRead {
    path: string;
    text: string;
    identity: OAuthSourceFileIdentity;
}
export interface OAuthSourceDiscovery {
    kind: OAuthSourceKind;
    displayPath: string;
    available: boolean;
    expiresAt?: number;
    reason?: OAuthSourceUnavailableReason;
    /** Where the discovered credential was read from. Omitted when unavailable. */
    origin?: OAuthSourceOrigin;
}
export interface OAuthSourceProbe {
    kind: OAuthSourceKind;
    available: boolean;
    displayPath: string;
    expiresAt?: number;
    reason?: OAuthSourceUnavailableReason;
    origin?: OAuthSourceOrigin;
}
/** Hardened source material plus secret-free origin metadata. */
export interface OAuthSourceMaterial extends HardenedOAuthSourceRead {
    origin: OAuthSourceOrigin;
    displayPath: string;
}
export interface OAuthImportDestinationView {
    path?: string;
    status?: OAuthDestinationStatus;
    credential?: OAuthSourceCredential;
    revision?: string;
}
export interface OAuthDestinationInspection {
    status: OAuthDestinationStatus;
    identity?: OAuthSourceFileIdentity;
    /** Internal. Never serialize this field to a client. */
    credential?: OAuthSourceCredential;
    /** Internal digest of unreadable dest bytes. Never serialize this field to a client. */
    payloadMac?: string;
}
export interface OAuthImportPreview {
    previewId: string;
    kind: OAuthSourceKind;
    displayPath: string;
    expiresAt: number;
    ticketExpiresAt: number;
    conflict: OAuthImportConflict;
    action: OAuthImportPreviewAction;
    warnings: string[];
    confirmOverwriteRequired: boolean;
}
export interface OAuthImportCommitResult {
    action: OAuthImportCommitAction;
    displayPath: string;
    expiresAt: number;
    warnings: string[];
}
export interface OAuthImportSessionOptions {
    now?: () => number;
    ttlMs?: number;
}
export interface OAuthImportPreviewInput extends OAuthSourcePathOptions {
    kind: OAuthSourceKind;
    destination?: OAuthImportDestinationView;
}
export interface OAuthImportCommitInput extends OAuthSourcePathOptions {
    previewId: string;
    /** When set, must match the ticket kind; a mismatch does not consume the ticket. */
    kind?: OAuthSourceKind;
    confirmOverwrite?: boolean;
    destination?: OAuthImportDestinationView;
}
/** Secret-free preview claim used to route a ticket to its destination store. */
export interface OAuthImportPreviewClaim {
    kind: OAuthSourceKind;
    ticketExpiresAt: number;
}
/** Stable allowlist metadata for parent route/store wiring. */
export declare const OAUTH_SOURCE_SPECS: readonly OAuthSourceSpec[];
/** Secret-free failure from discovery, parse, preview, or commit. */
export declare class OAuthSourceError extends Error {
    readonly code: OAuthSourceErrorCode;
    constructor(code: OAuthSourceErrorCode, message: string);
}
export declare function isOAuthSourceError(error: unknown): error is OAuthSourceError;
export declare function isOAuthSourceKind(value: string): value is OAuthSourceKind;
export declare function oauthSourceSpec(kind: OAuthSourceKind): OAuthSourceSpec;
export declare function oauthSourceProviderId(kind: OAuthSourceKind): string;
/** Resolve one allowlisted CLI auth document. Env/home are injectable for tests. */
export declare function resolveOAuthSourcePath(kind: OAuthSourceKind, options?: OAuthSourcePathOptions): string;
/**
 * Client-safe display path. Never returns an absolute filesystem location.
 * Env overrides render as `$GROK_HOME/auth.json`; defaults as `~/.grok/auth.json`.
 */
export declare function oauthSourceDisplayPath(kind: OAuthSourceKind, options?: OAuthSourcePathOptions): string;
export declare function oauthImportRequiresConfirm(conflict: OAuthImportConflict): boolean;
export declare function oauthImportPreviewAction(conflict: OAuthImportConflict): OAuthImportPreviewAction;
/**
 * lstat → O_NOFOLLOW open → fstat. Rejects symlinks, non-regular files, non-owner
 * files, group/other access, TOCTOU identity changes, and payloads over 64KiB.
 * POSIX fails closed if O_NOFOLLOW or the process uid is unavailable. Windows
 * skips POSIX uid/mode owner checks but still applies identity and size limits.
 * Never chmod()s or writes the path.
 */
export declare function readHardenedOAuthSourceFile(filename: string): Promise<HardenedOAuthSourceRead>;
/** Inspect a destination store file with the same hardened reader. Never follows dest. */
export declare function inspectOAuthDestinationFile(filename: string): Promise<OAuthDestinationInspection>;
export declare function parseOAuthSourceDocument(kind: OAuthSourceKind, text: string): OAuthSourceCredential;
/**
 * Grok CLI scope map. Selects the auth.x.ai OIDC entry (`key` + `refresh_token`).
 * Expiry must be a valid RFC3339 `expires_at`. Multiple matching entries pick
 * the latest valid expiry.
 */
export declare function parseGrokCliAuthDocument(text: string): OAuthSourceCredential;
/**
 * Codex CLI `tokens` object. Requires id/access/refresh, JWT `exp` in seconds.
 * Account id prefers official `tokens.account_id`, then top-level `account_id`
 * for compatibility, then the full ChatGPT account id from the access JWT.
 * Rejects API-key documents.
 */
export declare function parseCodexCliAuthDocument(text: string): OAuthSourceCredential;
/** Kimi Code CLI document. Snake_case `access_token` / `refresh_token` / `expires_at` seconds. */
export declare function parseKimiCliAuthDocument(text: string): OAuthSourceCredential;
/**
 * Claude Code CLI / Keychain document. Prefers nested `claudeAiOauth`, then a
 * flat blob with the same camelCase fields (`accessToken` / `refreshToken` /
 * `expiresAt` ms). Matches the official Claude Code credential shape.
 */
export declare function parseClaudeCliAuthDocument(text: string): OAuthSourceCredential;
/**
 * Read one allowlisted OAuth source. Claude on darwin prefers the macOS
 * Keychain service {@link CLAUDE_CODE_KEYCHAIN_SERVICE}, then falls back to the
 * hardened credentials file. Other kinds always use the hardened file reader.
 */
export declare function readOAuthSourceMaterial(kind: OAuthSourceKind, options?: OAuthSourcePathOptions): Promise<OAuthSourceMaterial>;
/** Read Claude Code credentials from the macOS Keychain. Never logs the secret. */
export declare function readClaudeKeychainRaw(options?: OAuthSourcePathOptions): Promise<string | undefined>;
export declare function probeOAuthSource(kind: OAuthSourceKind, options?: OAuthSourcePathOptions): Promise<OAuthSourceProbe>;
export declare function discoverOAuthSources(options?: OAuthSourcePathOptions): Promise<OAuthSourceDiscovery[]>;
/**
 * In-memory two-phase import controller. Preview IDs are random, one-use, and
 * expire after five minutes. `peekPreview` exposes only kind + ticket expiry so
 * routes can bind a destination without a second ticket map. HMAC fingerprints
 * and persist material stay internal.
 */
export declare class OAuthImportSession {
    #private;
    constructor(options?: OAuthImportSessionOptions);
    discover(options?: OAuthSourcePathOptions): Promise<OAuthSourceDiscovery[]>;
    /**
     * Secret-free peek. Does not consume a live ticket. An expired ticket is
     * deleted and reported as {@link OAuthSourceError} `preview_expired` once.
     */
    peekPreview(previewId: string): OAuthImportPreviewClaim;
    preview(input: OAuthImportPreviewInput): Promise<OAuthImportPreview>;
    /**
     * Consume the preview, reopen the allowlisted source, and compare the
     * destination revision. Call this from inside the destination store lock.
     * Use {@link OAuthImportCommitOutcome.takePersist} for the write material.
     */
    commit(input: OAuthImportCommitInput): Promise<OAuthImportCommitOutcome>;
    cancel(previewId: string): boolean;
}
/** Public commit result plus hidden persist material. */
export declare class OAuthImportCommitOutcome {
    #private;
    readonly result: OAuthImportCommitResult;
    constructor(result: OAuthImportCommitResult, persist: OAuthSourceCredential | undefined);
    /** Internal. Write this through the destination store; omit to keep dest canonical. */
    takePersist(): OAuthSourceCredential | undefined;
    toJSON(): OAuthImportCommitResult;
}
export declare function createOAuthImportSession(options?: OAuthImportSessionOptions): OAuthImportSession;
export declare function classifyOAuthImportConflict(incoming: OAuthSourceCredential, destination: {
    status?: OAuthDestinationStatus;
    credential?: OAuthSourceCredential;
}): OAuthImportConflict;
//# sourceMappingURL=oauth-sources.d.ts.map