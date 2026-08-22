import { chmod, mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { collectLocalCliAuth, probeLocalCliAuth } from "../../../src/server/local-monitor/auth-status.js";
import { LOCAL_USAGE_PARSERS, localUsageParser } from "../../../src/server/local-monitor/parsers.js";
import { LocalUsageRepository, localUsageFileHash } from "../../../src/server/local-monitor/repository.js";
import { LocalUsageScanner } from "../../../src/server/local-monitor/usage-scan.js";
import { UsageDatabase } from "../../../src/server/storage/database.js";

const IS_WINDOWS = process.platform === "win32";
const NOW = Date.UTC(2026, 7, 18, 12, 0, 0);

function claudeLine(model: string, input: number, output: number, timestamp: string): string {
	return JSON.stringify({
		type: "assistant",
		timestamp,
		message: {
			model,
			usage: { input_tokens: input, output_tokens: output },
		},
	});
}

function codexLine(model: string | undefined, input: number, output: number, timestamp: string): string {
	return JSON.stringify({
		timestamp,
		type: "event_msg",
		payload: {
			type: "token_count",
			info: { last_token_usage: { input_tokens: input, output_tokens: output } },
		},
	});
}

describe("local usage parsers", () => {
	it("extracts only usage fields from Claude Code transcripts", () => {
		const parser = localUsageParser("claude-code");
		expect(parser).toBeDefined();
		const text = [
			JSON.stringify({
				type: "user",
				message: { content: "SECRET PROMPT CONTENT" },
				timestamp: "2026-08-18T10:00:00Z",
			}),
			claudeLine("claude-sonnet-4", 120, 30, "2026-08-18T10:01:00Z"),
			JSON.stringify({
				type: "assistant",
				timestamp: "not-a-date",
				message: { model: "claude-sonnet-4", usage: { input_tokens: 1 } },
			}),
			claudeLine("claude-sonnet-4", 5, 2, "2026-08-18T10:02:00Z"),
		].join("\n");
		const events = parser!.parseChunk(text);
		expect(events).toHaveLength(2);
		expect(events[0]).toMatchObject({
			modelId: "claude-sonnet-4",
			inputTokens: 120,
			outputTokens: 30,
		});
		// No message content may appear anywhere in the extracted events.
		expect(JSON.stringify(events)).not.toContain("SECRET PROMPT CONTENT");
	});

	it("extracts token_count events from Codex rollouts and tracks turn models", () => {
		const parser = localUsageParser("codex-cli");
		const text = [
			JSON.stringify({ type: "turn_context", payload: { model: "gpt-5.6-codex" } }),
			codexLine(undefined, 10, 4, "2026-08-18T09:00:00Z"),
			codexLine(undefined, 3, 1, "2026-08-18T09:05:00Z"),
		].join("\n");
		const events = parser!.parseChunk(text);
		expect(events).toHaveLength(2);
		expect(events.map((event) => event.modelId)).toEqual(["gpt-5.6-codex", "gpt-5.6-codex"]);
		expect(events[0]).toMatchObject({ inputTokens: 10, outputTokens: 4 });
	});

	it("parses generic usage records and skips malformed lines", () => {
		const parser = localUsageParser("kimi-code");
		const text = [
			"not json at all",
			JSON.stringify({
				usage: { prompt_tokens: 8, completion_tokens: 2 },
				model: "kimi-k2",
				created_at: "2026-08-17T08:00:00Z",
			}),
			JSON.stringify({ usage: { input_tokens: -5 }, timestamp: "2026-08-17T08:01:00Z" }),
			JSON.stringify({ usage: { input_tokens: 4, output_tokens: 1 }, timestamp: "2026-08-17T08:02:00Z" }),
		].join("\n");
		const events = parser!.parseChunk(text);
		expect(events).toHaveLength(2);
		expect(events[0]).toMatchObject({ modelId: "kimi-k2", inputTokens: 8, outputTokens: 2 });
	});

	it("exposes the four registered tools", () => {
		expect(LOCAL_USAGE_PARSERS.map((parser) => parser.toolId)).toEqual([
			"claude-code",
			"codex-cli",
			"kimi-code",
			"opencode",
		]);
	});
});

describe("local usage scanner", () => {
	let directory: string;
	let database: UsageDatabase;

	beforeEach(async () => {
		directory = join(tmpdir(), `local-usage-test-${Math.random().toString(36).slice(2)}`);
		await mkdir(join(directory, ".claude", "projects", "proj-a"), { recursive: true });
		database = await UsageDatabase.open(":memory:");
	});

	afterEach(async () => {
		database.close();
		await rm(directory, { recursive: true, force: true });
	});

	function scanner(repository: LocalUsageRepository): LocalUsageScanner {
		return new LocalUsageScanner(repository, {
			home: directory,
			env: {},
			now: () => NOW,
			maxFileBytes: 1024 * 1024,
			maxTotalBytes: 16 * 1024 * 1024,
		});
	}

	it("scans incrementally and never double counts appended content", async () => {
		const repository = new LocalUsageRepository(database);
		const transcript = join(directory, ".claude", "projects", "proj-a", "session-1.jsonl");
		await writeFile(transcript, `${claudeLine("claude-sonnet-4", 10, 5, "2026-08-18T10:00:00Z")}\n`, { mode: 0o600 });

		const first = await scanner(repository).scan([localUsageParser("claude-code")!]);
		expect(first.events).toBe(1);
		expect(repository.aggregate("2026-08-01", "2026-08-31")).toEqual([
			expect.objectContaining({
				toolId: "claude-code",
				modelId: "claude-sonnet-4",
				inputTokens: 10,
				outputTokens: 5,
				requests: 1,
			}),
		]);

		// Appended content is picked up from the stored offset.
		await writeFile(
			transcript,
			`${claudeLine("claude-sonnet-4", 10, 5, "2026-08-18T10:00:00Z")}\n${claudeLine("claude-sonnet-4", 7, 3, "2026-08-18T11:00:00Z")}\n`,
			{ mode: 0o600 },
		);
		const second = await scanner(repository).scan([localUsageParser("claude-code")!]);
		expect(second.events).toBe(1);
		const rows = repository.aggregate("2026-08-01", "2026-08-31");
		expect(rows).toEqual([expect.objectContaining({ inputTokens: 17, outputTokens: 8, requests: 2 })]);
	});

	it("replaces a rotated log's contribution instead of double counting", async () => {
		const repository = new LocalUsageRepository(database);
		const transcript = join(directory, ".claude", "projects", "proj-a", "session-1.jsonl");
		await writeFile(transcript, `${claudeLine("claude-sonnet-4", 10, 5, "2026-08-18T10:00:00Z")}\n`, { mode: 0o600 });
		await scanner(repository).scan([localUsageParser("claude-code")!]);

		// Rotation: the file restarts smaller than the stored offset.
		await rm(transcript);
		await writeFile(transcript, `${claudeLine("claude-opus-4", 4, 2, "2026-08-18T12:00:00Z")}\n`, { mode: 0o600 });
		await scanner(repository).scan([localUsageParser("claude-code")!]);

		const rows = repository.aggregate("2026-08-01", "2026-08-31");
		expect(rows).toEqual([
			expect.objectContaining({ modelId: "claude-opus-4", inputTokens: 4, outputTokens: 2, requests: 1 }),
		]);
	});

	it("refuses to follow symlinked log files", async () => {
		const repository = new LocalUsageRepository(database);
		const outside = join(directory, "outside.jsonl");
		await writeFile(outside, `${claudeLine("claude-sonnet-4", 99, 99, "2026-08-18T10:00:00Z")}\n`, { mode: 0o600 });
		const link = join(directory, ".claude", "projects", "proj-a", "linked.jsonl");
		await symlink(outside, link);

		const result = await scanner(repository).scan([localUsageParser("claude-code")!]);
		expect(result.events).toBe(0);
		expect(repository.aggregate("2026-08-01", "2026-08-31")).toEqual([]);
	});

	it("skips files over the per-file byte budget", async () => {
		const repository = new LocalUsageRepository(database);
		const transcript = join(directory, ".claude", "projects", "proj-a", "big.jsonl");
		const line = claudeLine("claude-sonnet-4", 1, 1, "2026-08-18T10:00:00Z");
		await writeFile(transcript, `${line}\n`.repeat(200), { mode: 0o600 });

		const small = new LocalUsageScanner(repository, {
			home: directory,
			env: {},
			now: () => NOW,
			maxFileBytes: 4096,
			maxTotalBytes: 4096,
		});
		const result = await small.scan([localUsageParser("claude-code")!]);
		expect(result.files).toBe(1);
		// The byte budget caps how much of the file is parsed per run.
		const rows = repository.aggregate("2026-08-01", "2026-08-31");
		const total = rows.reduce((sum, row) => sum + row.requests, 0);
		expect(total).toBeGreaterThan(0);
		expect(total).toBeLessThan(200);
	});

	it("never persists file paths, only hashes", async () => {
		const repository = new LocalUsageRepository(database);
		const transcript = join(directory, ".claude", "projects", "proj-a", "session-1.jsonl");
		await writeFile(transcript, `${claudeLine("claude-sonnet-4", 1, 1, "2026-08-18T10:00:00Z")}\n`, { mode: 0o600 });
		await scanner(repository).scan([localUsageParser("claude-code")!]);

		const files = database.prepare("SELECT file_hash FROM local_usage_files").all() as Array<{ file_hash: string }>;
		expect(files).toHaveLength(1);
		expect(files[0]!.file_hash).toBe(localUsageFileHash(transcript));
		expect(files[0]!.file_hash).not.toContain("proj-a");
		expect(files[0]!.file_hash).toMatch(/^[0-9a-f]{64}$/);
	});
});

describe("local CLI auth monitor", () => {
	let directory: string;

	beforeEach(async () => {
		directory = join(tmpdir(), `local-auth-test-${Math.random().toString(36).slice(2)}`);
		await mkdir(directory, { recursive: true });
	});

	afterEach(async () => {
		await rm(directory, { recursive: true, force: true });
	});

	it("reports missing CLI credentials as unavailable without throwing", async () => {
		const statuses = await collectLocalCliAuth({ home: directory, env: {}, now: () => NOW });
		expect(statuses).toHaveLength(4);
		for (const status of statuses) {
			expect(status.state).toBe("unavailable");
			expect(status.reason).toBe("missing");
			expect(status.displayPath).toMatch(/^~\//);
			expect(status.displayPath).not.toContain(directory);
		}
	});

	it("reports a signed-in Claude CLI credential with expiry and refresh presence", async () => {
		const claudeDir = join(directory, ".claude");
		await mkdir(claudeDir, { recursive: true });
		await writeFile(
			join(claudeDir, ".credentials.json"),
			JSON.stringify({
				claudeAiOauth: {
					accessToken: "sk-ant-secret-access",
					refreshToken: "secret-refresh",
					expiresAt: NOW + 3_600_000,
				},
			}),
			{ mode: 0o600 },
		);
		const status = await probeLocalCliAuth("claude", { home: directory, env: {}, now: () => NOW });
		expect(status.state).toBe("signed-in");
		expect(status.expiresAt).toBe(NOW + 3_600_000);
		expect(status.hasRefreshToken).toBe(true);
		// Secret material must never appear in the status payload.
		expect(JSON.stringify(status)).not.toContain("sk-ant-secret-access");
		expect(JSON.stringify(status)).not.toContain("secret-refresh");
	});

	it("marks expired credentials and rejects group-readable files", async () => {
		const claudeDir = join(directory, ".claude");
		await mkdir(claudeDir, { recursive: true });
		const credentials = join(claudeDir, ".credentials.json");
		await writeFile(
			credentials,
			JSON.stringify({
				claudeAiOauth: { accessToken: "secret", refreshToken: "secret-refresh", expiresAt: NOW - 1_000 },
			}),
			{ mode: 0o600 },
		);
		const expired = await probeLocalCliAuth("claude", { home: directory, env: {}, now: () => NOW });
		expect(expired.state).toBe("expired");
		expect(expired.hasRefreshToken).toBe(true);

		await chmod(credentials, 0o644);
		const unsafe = await probeLocalCliAuth("claude", { home: directory, env: {}, now: () => NOW });
		if (!IS_WINDOWS) {
			expect(unsafe.state).toBe("unavailable");
			expect(unsafe.reason).toBe("unsafe");
		} else {
			// Windows has no POSIX group-readable mode to enforce; expiry remains covered above.
			expect(unsafe.state).toBe("expired");
		}
	});
});
