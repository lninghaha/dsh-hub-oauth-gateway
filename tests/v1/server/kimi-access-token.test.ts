import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AuthResult } from "@earendil-works/pi-ai";
import { afterEach, describe, expect, it } from "vitest";
import { KIMI_CODE_OAUTH_PROVIDER } from "../../../src/server/coding-oauth/oauth-providers.js";
import { OAuthProviderSession } from "../../../src/server/coding-oauth/oauth-session.js";
import { OAuthCredentialFileStore } from "../../../src/server/coding-oauth/store.js";

const temporaryDirectories = new Set<string>();

afterEach(async () => {
	await Promise.all([...temporaryDirectories].map((directory) => rm(directory, { recursive: true, force: true })));
	temporaryDirectories.clear();
});

async function kimiSession(): Promise<OAuthProviderSession> {
	const directory = await mkdtemp(join(tmpdir(), "hub-kimi-access-"));
	temporaryDirectories.add(directory);
	return new OAuthProviderSession(
		KIMI_CODE_OAUTH_PROVIDER,
		undefined,
		new OAuthCredentialFileStore(KIMI_CODE_OAUTH_PROVIDER.nativeProviderId, join(directory, "auth.json"), "fixture"),
		join(directory, "models.json"),
	);
}

function stubGetAuth(session: OAuthProviderSession, result: AuthResult | undefined): void {
	const models = session.models as {
		getAuth(providerId: string): Promise<AuthResult | undefined>;
	};
	models.getAuth = async () => result;
}

describe("OAuthProviderSession.resolveAccessToken", () => {
	it("reads a Bearer token when resolved auth has headers and no apiKey", async () => {
		const session = await kimiSession();
		stubGetAuth(session, {
			auth: { headers: { Authorization: "Bearer fixture-access-token" } },
			source: "OAuth",
		});
		await expect(session.resolveAccessToken()).resolves.toBe("fixture-access-token");
	});

	it("keeps an apiKey when both surfaces are present", async () => {
		const session = await kimiSession();
		stubGetAuth(session, {
			auth: {
				apiKey: "fixture-api-key",
				headers: { Authorization: "Bearer fixture-access-token" },
			},
			source: "OAuth",
		});
		await expect(session.resolveAccessToken()).resolves.toBe("fixture-api-key");
	});

	it("returns undefined when the header is not a single Bearer token", async () => {
		const session = await kimiSession();
		stubGetAuth(session, {
			auth: { headers: { Authorization: "Basic fixture-access-token" } },
			source: "OAuth",
		});
		await expect(session.resolveAccessToken()).resolves.toBeUndefined();
	});
});
