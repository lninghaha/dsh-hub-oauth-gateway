import { chmod, mkdir, mkdtemp, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import {
	createOAuthImportSession,
	readHardenedOAuthSourceFile,
	resolveOAuthSourcePath,
} from "../../../../src/server/coding-oauth/oauth-sources.js";

const posix = process.platform !== "win32";

function sandbox(home: string) {
	return { home };
}

async function writeOwnerOnly(path: string, body: string): Promise<void> {
	await mkdir(dirname(path), { recursive: true, mode: 0o700 });
	await writeFile(path, body, { mode: 0o600 });
}

function grokCliDocument(): Record<string, unknown> {
	return {
		"https://auth.x.ai::b1a00492-073a-47ea-816f-4c329264a828": {
			key: "fixture-grok-access",
			refresh_token: "fixture-grok-refresh",
			expires_at: "2026-08-14T12:00:00.000000Z",
			oidc_issuer: "https://auth.x.ai",
			user_id: "fixture-user",
		},
	};
}

function storedCredential(): string {
	return `${JSON.stringify({
		version: 1,
		credential: {
			type: "oauth",
			access: "fixture-stored-access",
			refresh: "fixture-stored-refresh",
			expires: 1_800_000_000_000,
		},
	})}\n`;
}

describe("CLI Pull source hardening", () => {
	it.skipIf(!posix)("rejects a symlink at preview time", async () => {
		const home = await mkdtemp(join(tmpdir(), "dsh-hub-oauth-import-"));
		const real = join(home, "real-auth.json");
		await writeOwnerOnly(real, `${JSON.stringify(grokCliDocument())}\n`);
		const link = resolveOAuthSourcePath("grok", sandbox(home));
		await mkdir(dirname(link), { recursive: true, mode: 0o700 });
		await symlink(real, link);

		await expect(readHardenedOAuthSourceFile(link)).rejects.toMatchObject({ code: "unsafe_source" });
		const session = createOAuthImportSession();
		await expect(session.preview({ kind: "grok", ...sandbox(home) })).rejects.toMatchObject({
			code: "unsafe_source",
		});
	});

	it.skipIf(!posix)("blocks commit when the destination is not owner-only", async () => {
		const home = await mkdtemp(join(tmpdir(), "dsh-hub-oauth-import-dest-"));
		const source = resolveOAuthSourcePath("grok", sandbox(home));
		await writeOwnerOnly(source, `${JSON.stringify(grokCliDocument())}\n`);
		const dest = join(home, "dest.json");
		await writeOwnerOnly(dest, storedCredential());
		await chmod(dest, 0o644);

		const session = createOAuthImportSession();
		const preview = await session.preview({
			kind: "grok",
			...sandbox(home),
			destination: { path: dest },
		});
		expect(preview).toMatchObject({
			conflict: "unsafe_destination",
			action: "blocked",
			confirmOverwriteRequired: false,
		});
		expect(JSON.stringify(preview)).not.toContain("fixture-grok-access");
		await expect(
			session.commit({
				previewId: preview.previewId,
				confirmOverwrite: true,
				...sandbox(home),
				destination: { path: dest },
			}),
		).rejects.toMatchObject({ code: "unsafe_destination" });
	});
});
