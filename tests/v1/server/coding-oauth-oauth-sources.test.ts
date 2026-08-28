import { describe, expect, it, vi } from "vitest";
import {
	CLAUDE_CODE_KEYCHAIN_SERVICE,
	CLAUDE_CODE_KEYCHAIN_SOURCE_PATH,
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
