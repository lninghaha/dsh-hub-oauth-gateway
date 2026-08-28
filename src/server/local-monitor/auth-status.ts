/**
 * Read-only local CLI authentication monitor. Reuses the OAuth-import
 * allowlist and hardened reader: symlink/non-owner/group-readable files fail
 * closed, and only secret-free status (expiry, refresh-token presence, file
 * mtime) is ever returned. Credential material never leaves this module.
 */

import type { CodingOAuthProviderSlug } from "../coding-oauth/ids.js";
import {
	OAUTH_SOURCE_KINDS,
	OAuthSourceError,
	type OAuthSourceKind,
	type OAuthSourcePathOptions,
	oauthSourceDisplayPath,
	parseOAuthSourceDocument,
	readHardenedOAuthSourceFile,
	resolveOAuthSourcePath,
} from "../coding-oauth/oauth-sources.js";

export interface LocalCliAuthStatus {
	kind: OAuthSourceKind;
	displayPath: string;
	state: "signed-in" | "signed-out" | "expired" | "unavailable";
	expiresAt: number | null;
	hasRefreshToken: boolean;
	reason: "missing" | "unsafe" | "invalid" | "too_large" | null;
}

export interface LocalPluginSessionStatus {
	provider: CodingOAuthProviderSlug;
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

function unavailable(
	kind: OAuthSourceKind,
	options: LocalAuthMonitorOptions,
	reason: LocalCliAuthStatus["reason"],
): LocalCliAuthStatus {
	return {
		kind,
		displayPath: oauthSourceDisplayPath(kind, options),
		state: "unavailable",
		expiresAt: null,
		hasRefreshToken: false,
		reason,
	};
}

function mapReason(error: OAuthSourceError): LocalCliAuthStatus["reason"] {
	switch (error.code) {
		case "not_found":
			return "missing";
		case "too_large":
			return "too_large";
		case "invalid_document":
			return "invalid";
		default:
			return "unsafe";
	}
}

/** Probe one allowlisted CLI credential file without retaining any secret. */
export async function probeLocalCliAuth(
	kind: OAuthSourceKind,
	options: LocalAuthMonitorOptions = {},
): Promise<LocalCliAuthStatus> {
	const now = options.now ?? Date.now;
	try {
		const path = resolveOAuthSourcePath(kind, options);
		const read = await readHardenedOAuthSourceFile(path);
		const credential = parseOAuthSourceDocument(kind, read.text);
		const expiresAt = Number.isFinite(credential.expires) ? credential.expires : null;
		const expired = expiresAt !== null && expiresAt <= now();
		return {
			kind,
			displayPath: oauthSourceDisplayPath(kind, options),
			state: expired ? "expired" : "signed-in",
			expiresAt,
			hasRefreshToken: credential.refresh.trim().length > 0,
			reason: null,
		};
	} catch (error) {
		if (error instanceof OAuthSourceError) return unavailable(kind, options, mapReason(error));
		return unavailable(kind, options, "unsafe");
	}
}

/** Snapshot every allowlisted CLI credential. Order matches the allowlist. */
export async function collectLocalCliAuth(options: LocalAuthMonitorOptions = {}): Promise<LocalCliAuthStatus[]> {
	const probes = OAUTH_SOURCE_KINDS.map((kind) => probeLocalCliAuth(kind, options));
	return Promise.all(probes);
}
