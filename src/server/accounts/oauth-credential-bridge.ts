/**
 * Bridge coding-oauth session tokens into AccountService credential refs.
 *
 * OAuth login writes plugin auth files; quota adapters resolve
 * GROK_ACCESS_TOKEN / CODEX_ACCESS_TOKEN / CLAUDE_OAUTH_TOKEN / KIMI_API_KEY /
 * GITHUB_COPILOT_TOKEN via the Harness credentials seam. When those refs are empty,
 * fall back to the signed-in coding-oauth session access token (in memory only —
 * never logged or stored).
 */

import type { CodingOAuthRuntime } from "../coding-oauth/compose.js";
import {
	CLAUDE_PI_PROVIDER,
	CODEX_PI_PROVIDER,
	GITHUB_COPILOT_PI_PROVIDER,
	KIMI_PI_PROVIDER,
	XAI_PI_PROVIDER,
} from "../coding-oauth/ids.js";
import type { CredentialResolver } from "./types.js";

export const GROK_ACCESS_TOKEN_REF = "GROK_ACCESS_TOKEN";
export const CODEX_ACCESS_TOKEN_REF = "CODEX_ACCESS_TOKEN";
export const CLAUDE_OAUTH_TOKEN_REF = "CLAUDE_OAUTH_TOKEN";
export const KIMI_API_KEY_REF = "KIMI_API_KEY";
export const GITHUB_COPILOT_TOKEN_REF = "GITHUB_COPILOT_TOKEN";

/** AccountProvider ids refreshed after OAuth login / CLI pull. */
export const OAUTH_QUOTA_ACCOUNT_IDS = Object.freeze(["grok", "codex", "claude", "kimi-coding", "copilot"] as const);

export interface OAuthTokenSource {
	resolveGrokAccessToken(): Promise<string | undefined>;
	resolveCodexAccessToken(): Promise<string | undefined>;
	resolveClaudeAccessToken(): Promise<string | undefined>;
	resolveKimiAccessToken(): Promise<string | undefined>;
	resolveCopilotAccessToken(): Promise<string | undefined>;
}

function nonEmpty(value: string | undefined): string | undefined {
	if (value === undefined) return undefined;
	const trimmed = value.trim();
	return trimmed.length === 0 ? undefined : trimmed;
}

/** Build a token source from the current coding-oauth owner runtime. */
export function oauthTokenSourceFromRuntime(
	runtime: CodingOAuthRuntime | undefined | (() => CodingOAuthRuntime | undefined),
): OAuthTokenSource {
	const current = typeof runtime === "function" ? runtime : () => runtime;
	const subscription = (providerId: string) =>
		current()?.subscriptions.find((session) => session.definition.nativeProviderId === providerId);
	return {
		async resolveGrokAccessToken() {
			try {
				const active = current();
				if (active === undefined) return undefined;
				const auth = await active.grok.models.getAuth(XAI_PI_PROVIDER);
				const fromModels = nonEmpty(auth?.auth.apiKey);
				if (fromModels !== undefined) return fromModels;
				const credential = await active.grok.store.read(XAI_PI_PROVIDER);
				return credential?.type === "oauth" ? nonEmpty(credential.access) : undefined;
			} catch {
				return undefined;
			}
		},
		async resolveCodexAccessToken() {
			const codex = subscription(CODEX_PI_PROVIDER);
			if (codex === undefined) return undefined;
			try {
				return nonEmpty(await codex.resolveAccessToken());
			} catch {
				return undefined;
			}
		},
		async resolveClaudeAccessToken() {
			const claude = subscription(CLAUDE_PI_PROVIDER);
			if (claude === undefined) return undefined;
			try {
				return nonEmpty(await claude.resolveAccessToken());
			} catch {
				return undefined;
			}
		},
		async resolveKimiAccessToken() {
			const kimi = subscription(KIMI_PI_PROVIDER);
			if (kimi === undefined) return undefined;
			try {
				return nonEmpty(await kimi.resolveAccessToken());
			} catch {
				return undefined;
			}
		},
		async resolveCopilotAccessToken() {
			const copilot = subscription(GITHUB_COPILOT_PI_PROVIDER);
			if (copilot === undefined) return undefined;
			try {
				return nonEmpty(await copilot.resolveAccessToken());
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
	base: CredentialResolver | undefined | (() => CredentialResolver | undefined),
	tokens: OAuthTokenSource,
): CredentialResolver {
	const current = typeof base === "function" ? base : () => base;
	return {
		async resolve(ref: string) {
			const resolver = current();
			if (resolver !== undefined) {
				try {
					const hit = await resolver.resolve(ref);
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
			else if (ref === KIMI_API_KEY_REF) fromSession = await tokens.resolveKimiAccessToken();
			else if (ref === GITHUB_COPILOT_TOKEN_REF) fromSession = await tokens.resolveCopilotAccessToken();
			return fromSession === undefined ? undefined : { value: fromSession };
		},
		async set(ref: string, value: string) {
			const resolver = current();
			if (resolver?.set === undefined) throw new Error("credentials-unavailable");
			await resolver.set(ref, value);
		},
	};
}
