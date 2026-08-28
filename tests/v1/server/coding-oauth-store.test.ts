import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { OAuthCredential } from "@earendil-works/pi-ai";
import { OAuthCredentialFileStore } from "../../../src/server/coding-oauth/store.js";

const temporaryDirectories = new Set<string>();

afterEach(async () => {
	await Promise.all([...temporaryDirectories].map((directory) => rm(directory, { recursive: true, force: true })));
	temporaryDirectories.clear();
});

async function createStore(): Promise<{ store: OAuthCredentialFileStore; path: string }> {
	const directory = await mkdtemp(join(tmpdir(), "hub-oauth-store-"));
	temporaryDirectories.add(directory);
	await mkdir(directory, { recursive: true, mode: 0o700 });
	const path = join(directory, "provider.json");
	const store = new OAuthCredentialFileStore("test-provider", path, "test-oauth");
	return { store, path };
}

function oauthCredential(overrides: Partial<OAuthCredential> & { access: string; refresh: string }): OAuthCredential {
	return {
		type: "oauth",
		expires: Date.now() + 3_600_000,
		...overrides,
	};
}

describe("OAuthCredentialFileStore AuthDocument v2", () => {
	it("migrates a v1 document to one account under lock", async () => {
		const { store, path } = await createStore();
		const credential = oauthCredential({
			access: "access-v1",
			refresh: "refresh-v1",
			accountId: "safe-user",
		});
		await writeFile(
			path,
			`${JSON.stringify({ version: 1, credential }, null, 2)}\n`,
			{ mode: 0o600 },
		);

		expect(await store.getActiveAccountId()).toBe("safe-user");
		expect(await store.listAccounts()).toEqual([
			{
				id: "safe-user",
				expires: credential.expires,
				accountId: "safe-user",
			},
		]);

		const onDisk = JSON.parse(await readFile(path, "utf8")) as {
			version: number;
			activeAccountId: string;
			accounts: Array<{ id: string; credential: OAuthCredential }>;
		};
		expect(onDisk.version).toBe(2);
		expect(onDisk.activeAccountId).toBe("safe-user");
		expect(onDisk.accounts).toHaveLength(1);
		expect(onDisk.accounts[0]?.credential.access).toBe("access-v1");
	});

	it("migrates unsafe v1 credential.accountId to legacy", async () => {
		const { store, path } = await createStore();
		await writeFile(
			path,
			`${JSON.stringify(
				{
					version: 1,
					credential: oauthCredential({
						access: "a",
						refresh: "r",
						accountId: "has spaces",
					}),
				},
				null,
				2,
			)}\n`,
			{ mode: 0o600 },
		);

		expect(await store.getActiveAccountId()).toBe("legacy");
		const onDisk = JSON.parse(await readFile(path, "utf8")) as { activeAccountId: string };
		expect(onDisk.activeAccountId).toBe("legacy");
	});

	it("upserts a second account and setActive switches CredentialStore.read", async () => {
		const { store } = await createStore();
		await store.upsertAccount({
			id: "acct-a",
			label: "Alpha",
			credential: oauthCredential({ access: "access-a", refresh: "refresh-a", accountId: "provider-a" }),
			makeActive: true,
		});
		await store.upsertAccount({
			id: "acct-b",
			label: "Beta",
			credential: oauthCredential({ access: "access-b", refresh: "refresh-b", accountId: "provider-b" }),
		});

		expect(await store.getActiveAccountId()).toBe("acct-a");
		expect(await store.read("test-provider")).toMatchObject({ access: "access-a", refresh: "refresh-a" });
		expect(await store.listAccounts()).toEqual([
			{ id: "acct-a", label: "Alpha", expires: expect.any(Number), accountId: "provider-a" },
			{ id: "acct-b", label: "Beta", expires: expect.any(Number), accountId: "provider-b" },
		]);
		expect(JSON.stringify(await store.listAccounts())).not.toMatch(/access-|refresh-/u);

		await store.setActiveAccount("acct-b");
		expect(await store.getActiveAccountId()).toBe("acct-b");
		expect(await store.read("test-provider")).toMatchObject({ access: "access-b", refresh: "refresh-b" });
	});

	it("removeAccount failovers when the active account is removed", async () => {
		const { store, path } = await createStore();
		await store.upsertAccount({
			id: "first",
			credential: oauthCredential({ access: "access-1", refresh: "refresh-1" }),
			makeActive: true,
		});
		await store.upsertAccount({
			id: "second",
			credential: oauthCredential({ access: "access-2", refresh: "refresh-2" }),
		});
		await store.setActiveAccount("first");

		await store.removeAccount("first");
		expect(await store.getActiveAccountId()).toBe("second");
		expect(await store.read("test-provider")).toMatchObject({ access: "access-2" });

		await store.removeAccount("second");
		expect(await store.getActiveAccountId()).toBeUndefined();
		expect(await store.read("test-provider")).toBeUndefined();
		await expect(readFile(path, "utf8")).rejects.toMatchObject({ code: "ENOENT" });
	});

	it("rejects a ninth distinct account", async () => {
		const { store } = await createStore();
		for (let index = 1; index <= 8; index += 1) {
			await store.upsertAccount({
				id: `acct-${String(index)}`,
				credential: oauthCredential({
					access: `access-${String(index)}`,
					refresh: `refresh-${String(index)}`,
				}),
				makeActive: index === 1,
			});
		}
		await expect(
			store.upsertAccount({
				id: "acct-9",
				credential: oauthCredential({ access: "access-9", refresh: "refresh-9" }),
			}),
		).rejects.toThrow(/at most 8 accounts/u);

		await store.upsertAccount({
			id: "acct-1",
			credential: oauthCredential({ access: "access-1-updated", refresh: "refresh-1-updated" }),
		});
		expect(await store.listAccounts()).toHaveLength(8);
		expect(await store.read("test-provider")).toMatchObject({ access: "access-1-updated" });
	});

	it("CredentialStore.modify and invalidate touch only the active account", async () => {
		const { store } = await createStore();
		const inactiveExpires = Date.now() + 9_000_000;
		await store.upsertAccount({
			id: "active",
			credential: oauthCredential({ access: "access-active", refresh: "refresh-active", expires: Date.now() + 5_000_000 }),
			makeActive: true,
		});
		await store.upsertAccount({
			id: "inactive",
			credential: oauthCredential({
				access: "access-inactive",
				refresh: "refresh-inactive",
				expires: inactiveExpires,
			}),
		});

		await store.modify("test-provider", async (current) => {
			expect(current).toMatchObject({ access: "access-active" });
			if (current?.type !== "oauth") return undefined;
			return { ...current, access: "access-active-refreshed" };
		});
		expect(await store.read("test-provider")).toMatchObject({ access: "access-active-refreshed" });

		const beforeInvalidate = Date.now();
		expect(await store.invalidate("test-provider")).toBe(true);
		const active = await store.read("test-provider");
		expect(active?.type).toBe("oauth");
		if (active?.type === "oauth") {
			expect(active.expires).toBeLessThan(beforeInvalidate);
			expect(active.access).toBe("access-active-refreshed");
			expect(active.refresh).toBe("refresh-active");
		}

		await store.setActiveAccount("inactive");
		expect(await store.read("test-provider")).toMatchObject({
			access: "access-inactive",
			refresh: "refresh-inactive",
			expires: inactiveExpires,
		});
	});
});
