import { describe, expect, it, vi } from "vitest";
import {
	CLAUDE_OAUTH_TOKEN_REF,
	CODEX_ACCESS_TOKEN_REF,
	createOAuthQuotaCredentialBridge,
	GROK_ACCESS_TOKEN_REF,
	KIMI_API_KEY_REF,
	type OAuthTokenSource,
} from "../../../../src/server/accounts/oauth-credential-bridge.js";
import type { CredentialResolver } from "../../../../src/server/accounts/types.js";

function tokenSource(overrides: Partial<OAuthTokenSource> = {}): OAuthTokenSource {
	return {
		resolveGrokAccessToken: async () => undefined,
		resolveCodexAccessToken: async () => undefined,
		resolveClaudeAccessToken: async () => undefined,
		resolveKimiAccessToken: async () => undefined,
		...overrides,
	};
}

describe("oauth quota credential bridge", () => {
	it("falls back to coding-oauth sessions when Harness refs are empty", async () => {
		const base: CredentialResolver = {
			resolve: vi.fn(async () => undefined),
		};
		const bridge = createOAuthQuotaCredentialBridge(
			base,
			tokenSource({
				resolveGrokAccessToken: async () => "grok-session-token",
				resolveCodexAccessToken: async () => "codex-session-token",
				resolveClaudeAccessToken: async () => "claude-session-token",
				resolveKimiAccessToken: async () => "kimi-session-token",
			}),
		);
		expect(await bridge.resolve(GROK_ACCESS_TOKEN_REF)).toEqual({ value: "grok-session-token" });
		expect(await bridge.resolve(CODEX_ACCESS_TOKEN_REF)).toEqual({ value: "codex-session-token" });
		expect(await bridge.resolve(CLAUDE_OAUTH_TOKEN_REF)).toEqual({ value: "claude-session-token" });
		expect(await bridge.resolve(KIMI_API_KEY_REF)).toEqual({ value: "kimi-session-token" });
	});

	it("prefers explicit Harness credential values over OAuth sessions", async () => {
		const base: CredentialResolver = {
			resolve: vi.fn(async (ref: string) => (ref === GROK_ACCESS_TOKEN_REF ? { value: "harness-grok" } : undefined)),
		};
		const grokSession = vi.fn(async () => "session-grok");
		const bridge = createOAuthQuotaCredentialBridge(base, tokenSource({ resolveGrokAccessToken: grokSession }));
		expect(await bridge.resolve(GROK_ACCESS_TOKEN_REF)).toEqual({ value: "harness-grok" });
		expect(grokSession).not.toHaveBeenCalled();
	});

	it("returns undefined for unrelated refs when base is empty", async () => {
		const bridge = createOAuthQuotaCredentialBridge(undefined, tokenSource());
		expect(await bridge.resolve("OPENROUTER_API_KEY")).toBeUndefined();
	});
});
