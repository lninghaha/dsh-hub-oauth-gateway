import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createCodingOAuthAdapter, createGrokBuildAdapter } from "../../../src/server/coding-oauth/adapter.js";
import {
	CLAUDE_CODE_OAUTH_ROUTE,
	CODEX_OAUTH_FAST_ROUTE,
	CODEX_OAUTH_ROUTE,
	CODEX_PI_PROVIDER,
	GROK_BUILD_ROUTE,
	KIMI_CODE_OAUTH_ROUTE,
	XAI_PI_PROVIDER,
} from "../../../src/server/coding-oauth/ids.js";
import { OAUTH_PROVIDER_DEFINITIONS } from "../../../src/server/coding-oauth/oauth-providers.js";
import { OAuthProviderSession } from "../../../src/server/coding-oauth/oauth-session.js";
import { GrokBuildSession } from "../../../src/server/coding-oauth/session.js";
import { GrokBuildCredentialStore, OAuthCredentialFileStore } from "../../../src/server/coding-oauth/store.js";

const temporaryDirectories = new Set<string>();

afterEach(async () => {
	await Promise.all([...temporaryDirectories].map((directory) => rm(directory, { recursive: true, force: true })));
	temporaryDirectories.clear();
});

async function createSessions(): Promise<{
	grok: GrokBuildSession;
	subscriptions: readonly OAuthProviderSession[];
}> {
	const directory = await mkdtemp(join(tmpdir(), "hub-coding-oauth-adapter-"));
	temporaryDirectories.add(directory);
	const grok = new GrokBuildSession(new GrokBuildCredentialStore(join(directory, "grok.json")));
	const subscriptions = OAUTH_PROVIDER_DEFINITIONS.map(
		(definition) =>
			new OAuthProviderSession(
				definition,
				undefined,
				new OAuthCredentialFileStore(
					definition.nativeProviderId,
					join(directory, `${definition.slug}.json`),
					definition.route,
				),
				join(directory, `${definition.slug}-models.json`),
			),
	);
	return { grok, subscriptions };
}

describe("createCodingOAuthAdapter", () => {
	it("injects owner-scoped OAuth stores and the rc.2 image policy", async () => {
		const { grok, subscriptions } = await createSessions();
		const adapter = createCodingOAuthAdapter(grok, subscriptions, () => undefined);
		const inner = (
			adapter as unknown as {
				inner: {
					config: {
						profiles(): ReadonlyMap<string, unknown>;
						auth: unknown;
					};
				};
			}
		).inner;

		for (const profile of inner.config.profiles().values()) {
			expect(profile).toMatchObject({
				maxRequestImageBytes: 20 * 1024 * 1024,
				requestImagePixelBudget: 2048 * 2048,
				requestImageMaxBytes: 1024 * 1024,
			});
		}

		const auth = inner.config.auth as {
			credentials: {
				read(providerId: string): Promise<unknown>;
				modify(providerId: string, fn: (current: unknown) => Promise<unknown>): Promise<unknown>;
				delete(providerId: string): Promise<void>;
			};
			authContext: {
				env(name: string): Promise<string | undefined>;
				fileExists(path: string): Promise<boolean>;
			};
		};
		await auth.credentials.modify(XAI_PI_PROVIDER, async () => ({
			type: "oauth",
			access: "grok-access",
			refresh: "grok-refresh",
			expires: Date.now() + 3_600_000,
		}));

		expect(await grok.store.read(XAI_PI_PROVIDER)).toMatchObject({ access: "grok-access" });
		expect(await auth.credentials.read(XAI_PI_PROVIDER)).toMatchObject({ access: "grok-access" });
		await expect(auth.credentials.modify("unknown-provider", async () => undefined)).rejects.toThrow(
			/refusing credential write/u,
		);
		await expect(auth.credentials.delete("unknown-provider")).rejects.toThrow(/refusing credential deletion/u);
		expect(await auth.authContext.env("XAI_API_KEY")).toBeUndefined();
		expect(await auth.authContext.fileExists("~/.xai/auth.json")).toBe(false);

		const grokOnly = createGrokBuildAdapter(grok, () => undefined) as unknown as {
			config: { profiles(): ReadonlyMap<string, unknown> };
		};
		expect(grokOnly.config.profiles().get(GROK_BUILD_ROUTE)).toMatchObject({
			maxRequestImageBytes: 20 * 1024 * 1024,
			requestImagePixelBudget: 2048 * 2048,
			requestImageMaxBytes: 1024 * 1024,
		});
	});

	it("uses five retries with exponential delays capped at 80 seconds", async () => {
		const { grok, subscriptions } = await createSessions();
		const adapter = createCodingOAuthAdapter(grok, subscriptions, () => undefined);

		for (const route of [GROK_BUILD_ROUTE, CODEX_OAUTH_ROUTE, KIMI_CODE_OAUTH_ROUTE, CLAUDE_CODE_OAUTH_ROUTE]) {
			const policy = adapter.providerRetryPolicy(route);
			expect(policy).toMatchObject({
				mode: "normal",
				maxRetries: 5,
				initialDelayMs: 5_000,
				maxDelayMs: 80_000,
				jitterRatio: 0.1,
			});
			const codes = policy?.mode === "normal" ? policy.retryableCodes : [];
			for (const code of ["AUTH", "RATE_LIMIT", "SERVER", "TIMEOUT", "TRANSPORT", "EMPTY_RESPONSE"]) {
				expect(codes).toContain(code);
			}
			expect(codes).not.toContain("QUOTA");
			expect(codes).not.toContain("MISSING_CREDENTIAL");
		}
	});

	it("maps Codex Fast replay to the native Codex provider", async () => {
		const { grok, subscriptions } = await createSessions();
		const adapter = createCodingOAuthAdapter(grok, subscriptions, () => undefined, {
			codexFast: { isEligible: () => true },
		});
		const replayProviders = (
			adapter as unknown as {
				replayProviders: ReadonlyMap<string, string>;
			}
		).replayProviders;

		expect(replayProviders.get(CODEX_OAUTH_FAST_ROUTE)).toBe(CODEX_PI_PROVIDER);
	});
});
