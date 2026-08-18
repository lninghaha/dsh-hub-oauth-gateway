/**
 * Bridge coding-oauth session tokens into AccountService credential refs.
 *
 * OAuth login writes plugin auth files; quota adapters resolve
 * GROK_ACCESS_TOKEN / CODEX_ACCESS_TOKEN / CLAUDE_OAUTH_TOKEN via the Harness
 * credentials seam. When those refs are empty, fall back to the signed-in
 * coding-oauth session access token (in memory only — never logged or stored).
 */

import type { CodingOAuthRuntime } from "../coding-oauth/compose.js";
import { CLAUDE_PI_PROVIDER, CODEX_PI_PROVIDER, XAI_PI_PROVIDER } from "../coding-oauth/ids.js";
import type { CredentialResolver } from "./types.js";

export const GROK_ACCESS_TOKEN_REF = "GROK_ACCESS_TOKEN";
export const CODEX_ACCESS_TOKEN_REF = "CODEX_ACCESS_TOKEN";
export const CLAUDE_OAUTH_TOKEN_REF = "CLAUDE_OAUTH_TOKEN";

/** AccountProvider ids refreshed after OAuth login / CLI pull. */
export const OAUTH_QUOTA_ACCOUNT_IDS = Object.freeze(["grok", "codex", "claude"] as const);

export interface OAuthTokenSource {
	resolveGrokAccessToken(): Promise<string | undefined>;
	resolveCodexAccessToken(): Promise<string | undefined>;
	resolveClaudeAccessToken(): Promise<string | undefined>;
}

function nonEmpty(value: string | undefined): string | undefined {
	if (value === undefined) return undefined;
	const trimmed = value.trim();
	return trimmed.length === 0 ? undefined : trimmed;
}

/** Build a token source from the live coding-oauth runtime. */
export function oauthTokenSourceFromRuntime(runtime: CodingOAuthRuntime): OAuthTokenSource {
	const codex = runtime.subscriptions.find((session) => session.definition.nativeProviderId === CODEX_PI_PROVIDER);
	const claude = runtime.subscriptions.find((session) => session.definition.nativeProviderId === CLAUDE_PI_PROVIDER);
	return {
		async resolveGrokAccessToken() {
			try {
				const auth = await runtime.grok.models.getAuth(XAI_PI_PROVIDER);
				const fromModels = nonEmpty(auth?.auth.apiKey);
				if (fromModels !== undefined) return fromModels;
				const credential = await runtime.grok.store.read(XAI_PI_PROVIDER);
				return credential?.type === "oauth" ? nonEmpty(credential.access) : undefined;
			} catch {
				return undefined;
			}
		},
		async resolveCodexAccessToken() {
			if (codex === undefined) return undefined;
			try {
				return nonEmpty(await codex.resolveAccessToken());
			} catch {
				return undefined;
			}
		},
		async resolveClaudeAccessToken() {
			if (claude === undefined) return undefined;
			try {
				return nonEmpty(await claude.resolveAccessToken());
			} catch {
				return undefined;
			}
		},
	};
}

/**
 * Wrap a Harness credential resolver so empty OAuth quota refs fall back to
 * coding-oauth sessions. Explicit Harness / env values always win.
 */
export function createOAuthQuotaCredentialBridge(
	base: CredentialResolver | undefined,
	tokens: OAuthTokenSource,
): CredentialResolver {
	const set = base?.set?.bind(base);
	return {
		async resolve(ref: string) {
			if (base !== undefined) {
				try {
					const hit = await base.resolve(ref);
					const value = nonEmpty(hit?.value);
					if (value !== undefined) return { value };
				} catch {
					// Fall through to OAuth sessions when the base seam fails closed.
				}
			}
			let fromSession: string | undefined;
			if (ref === GROK_ACCESS_TOKEN_REF) fromSession = await tokens.resolveGrokAccessToken();
			else if (ref === CODEX_ACCESS_TOKEN_REF) fromSession = await tokens.resolveCodexAccessToken();
			else if (ref === CLAUDE_OAUTH_TOKEN_REF) fromSession = await tokens.resolveClaudeAccessToken();
			return fromSession === undefined ? undefined : { value: fromSession };
		},
		...(set === undefined
			? {}
			: {
					set: (ref: string, value: string) => set(ref, value),
				}),
	};
}
