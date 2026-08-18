/**
 * Read-only local CLI authentication monitor. Reuses the OAuth-import
 * allowlist and hardened reader: symlink/non-owner/group-readable files fail
 * closed, and only secret-free status (expiry, refresh-token presence, file
 * mtime) is ever returned. Credential material never leaves this module.
 */
import { type OAuthSourceKind, type OAuthSourcePathOptions } from "../coding-oauth/oauth-sources.js";
export interface LocalCliAuthStatus {
    kind: OAuthSourceKind;
    displayPath: string;
    state: "signed-in" | "signed-out" | "expired" | "unavailable";
    expiresAt: number | null;
    hasRefreshToken: boolean;
    reason: "missing" | "unsafe" | "invalid" | "too_large" | null;
}
export interface LocalPluginSessionStatus {
    provider: OAuthSourceKind;
    route: string;
    authenticated: boolean;
    expiresAt: number | null;
}
export interface LocalAuthSnapshot {
    generatedAt: number;
    cli: LocalCliAuthStatus[];
    sessions: LocalPluginSessionStatus[];
}
export interface LocalAuthMonitorOptions extends OAuthSourcePathOptions {
    now?: () => number;
}
/** Probe one allowlisted CLI credential file without retaining any secret. */
export declare function probeLocalCliAuth(kind: OAuthSourceKind, options?: LocalAuthMonitorOptions): Promise<LocalCliAuthStatus>;
/** Snapshot every allowlisted CLI credential. Order matches the allowlist. */
export declare function collectLocalCliAuth(options?: LocalAuthMonitorOptions): Promise<LocalCliAuthStatus[]>;
//# sourceMappingURL=auth-status.d.ts.map