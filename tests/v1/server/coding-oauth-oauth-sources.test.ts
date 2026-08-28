import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
	CLAUDE_CODE_KEYCHAIN_SERVICE,
	CLAUDE_CODE_KEYCHAIN_SOURCE_PATH,
	inspectOAuthDestinationFile,
	parseClaudeCliAuthDocument,
	probeOAuthSource,
	readClaudeKeychainRaw,
} from "../../../src/server/coding-oauth/oauth-sources.js";

const NESTED = {
	claudeAiOauth: {
		accessToken: "access-nested",
		refreshToken: "refresh-nested",
		expiresAt: 1_700_000_000_000,
		accountId: "acct-nested",
	},
};

const FLAT = {
	accessToken: "access-flat",
	refreshToken: "refresh-flat",
	expiresAt: 1_700_000_000_100,
	accountId: "acct-flat",
};

const temporaryDirectories = new Set<string>();

afterEach(async () => {
	await Promise.all([...temporaryDirectories].map((directory) => rm(directory, { recursive: true, force: true })));
	temporaryDirectories.clear();
});

describe("parseClaudeCliAuthDocument", () => {
	it("parses nested claudeAiOauth documents", () => {
		expect(parseClaudeCliAuthDocument(JSON.stringify(NESTED))).toEqual({
			type: "oauth",
			access: "access-nested",
			refresh: "refresh-nested",
			expires: 1_700_000_000_000,
			accountId: "acct-nested",
		});
	});

	it("parses flat Claude Code Keychain blobs", () => {
		expect(parseClaudeCliAuthDocument(JSON.stringify(FLAT))).toEqual({
			type: "oauth",
			access: "access-flat",
			refresh: "refresh-flat",
			expires: 1_700_000_000_100,
			accountId: "acct-flat",
		});
	});

	it("rejects documents without tokens", () => {
		expect(() => parseClaudeCliAuthDocument(JSON.stringify({ expiresAt: 1 }))).toThrow(/accessToken/);
	});
});

describe("Claude Code Keychain discovery", () => {
	it("reads the Keychain service on darwin via security(1)", async () => {
		const execFile = vi.fn(async () => ({ stdout: `${JSON.stringify(NESTED)}\n` }));
		const raw = await readClaudeKeychainRaw({ platform: "darwin", execFile });
		expect(raw).toContain("access-nested");
		expect(execFile).toHaveBeenCalledWith(
			"/usr/bin/security",
			["find-generic-password", "-s", CLAUDE_CODE_KEYCHAIN_SERVICE, "-w"],
			expect.objectContaining({ encoding: "utf8" }),
		);
	});

	it("skips Keychain on non-darwin platforms", async () => {
		const execFile = vi.fn(async () => ({ stdout: "should-not-run" }));
		await expect(readClaudeKeychainRaw({ platform: "linux", execFile })).resolves.toBeUndefined();
		expect(execFile).not.toHaveBeenCalled();
	});

	it("probes Keychain before the credentials file on darwin", async () => {
		const execFile = vi.fn(async () => ({ stdout: JSON.stringify(FLAT) }));
		const probe = await probeOAuthSource("claude", {
			platform: "darwin",
			execFile,
			home: "/tmp/missing-claude-home-for-probe",
			env: {},
		});
		expect(probe.available).toBe(true);
		expect(probe.origin).toBe("keychain");
		expect(probe.displayPath).toContain(CLAUDE_CODE_KEYCHAIN_SERVICE);
		expect(probe.expiresAt).toBe(FLAT.expiresAt);
	});

	it("exposes the Keychain sentinel path constant", () => {
		expect(CLAUDE_CODE_KEYCHAIN_SOURCE_PATH).toBe(`keychain:${CLAUDE_CODE_KEYCHAIN_SERVICE}`);
	});
});

describe("inspectOAuthDestinationFile AuthDocument versions", () => {
	it("reads v2 active credential for conflict classification", async () => {
		const directory = await mkdtemp(join(tmpdir(), "hub-oauth-dest-v2-"));
		temporaryDirectories.add(directory);
		await mkdir(directory, { recursive: true, mode: 0o700 });
		const path = join(directory, "provider.json");
		const expires = 1_800_000_000_000;
		await writeFile(
			path,
			`${JSON.stringify(
				{
					version: 2,
					activeAccountId: "acct-active",
					accounts: [
						{
							id: "acct-other",
							credential: {
								type: "oauth",
								access: "access-other",
								refresh: "refresh-other",
								expires: expires - 1_000,
								accountId: "user-other",
							},
							createdAt: 1,
						},
						{
							id: "acct-active",
							credential: {
								type: "oauth",
								access: "access-active",
								refresh: "refresh-active",
								expires,
								accountId: "user-active",
							},
							createdAt: 2,
						},
					],
				},
				null,
				2,
			)}\n`,
			{ mode: 0o600 },
		);

		const inspected = await inspectOAuthDestinationFile(path);
		expect(inspected.status).toBe("readable");
		expect(inspected.credential?.expires).toBe(expires);
		expect(inspected.credential?.accountId).toBe("user-active");
	});
});
