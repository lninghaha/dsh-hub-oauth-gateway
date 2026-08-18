import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createCodingOAuthAdapter } from "../../../../src/server/coding-oauth/adapter.js";
import {
	CLAUDE_CODE_OAUTH_ROUTE,
	CODEX_OAUTH_ROUTE,
	GROK_BUILD_ROUTE,
	KIMI_CODE_OAUTH_ROUTE,
} from "../../../../src/server/coding-oauth/ids.js";
import { OAUTH_PROVIDER_DEFINITIONS } from "../../../../src/server/coding-oauth/oauth-providers.js";
import { OAuthProviderSession } from "../../../../src/server/coding-oauth/oauth-session.js";
import { GrokBuildSession } from "../../../../src/server/coding-oauth/session.js";
import { GrokBuildCredentialStore, OAuthCredentialFileStore } from "../../../../src/server/coding-oauth/store.js";

const UNSIGNED_ROUTES = [GROK_BUILD_ROUTE, CODEX_OAUTH_ROUTE, KIMI_CODE_OAUTH_ROUTE, CLAUDE_CODE_OAUTH_ROUTE] as const;

const homes: string[] = [];

afterEach(async () => {
	await Promise.all(homes.splice(0).map((home) => rm(home, { recursive: true, force: true })));
});

describe("coding OAuth adapter discovery", () => {
	it("hides unsigned routes from the selector and labels signed-in names with (OAuth)", async () => {
		const home = await mkdtemp(join(tmpdir(), "dsh-hub-oauth-adapter-"));
		homes.push(home);
		const grok = new GrokBuildSession(new GrokBuildCredentialStore(join(home, "grok.json")));
		const subscriptions = OAUTH_PROVIDER_DEFINITIONS.map(
			(definition) =>
				new OAuthProviderSession(
					definition,
					undefined,
					new OAuthCredentialFileStore(
						definition.nativeProviderId,
						join(home, `${definition.slug}.json`),
						definition.route,
					),
					join(home, `${definition.slug}-models.json`),
				),
		);
		const adapter = createCodingOAuthAdapter(grok, subscriptions, () => undefined);

		for (const route of UNSIGNED_ROUTES) {
			expect(await adapter.listModels(route)).toEqual([]);
			expect(adapter.providerInfo(route).name).toMatch(/\(OAuth\)$/u);
		}
	});
});
