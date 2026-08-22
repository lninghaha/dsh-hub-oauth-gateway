import { chmod, mkdtemp, readdir, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { SessionEvent } from "@deepseek-ai/dsh-session";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { UsageDatabase } from "../../../src/server/storage/database.js";
import {
	emptySessionCursor,
	projectUsageEvents,
	UsageProjectionGapError,
} from "../../../src/server/usage/projector.js";
import { UsageRepository } from "../../../src/server/usage/repository.js";

const IS_WINDOWS = process.platform === "win32";

function events(...items: Array<Record<string, unknown>>): SessionEvent[] {
	return items as unknown as SessionEvent[];
}

function writeSqliteFile(path: string, setup: (db: DatabaseSync) => void): void {
	const db = new DatabaseSync(path);
	try {
		db.exec("PRAGMA journal_mode = DELETE");
		setup(db);
		db.exec("PRAGMA journal_mode = DELETE");
	} finally {
		db.close();
	}
}

async function expectUnmutatedDatabase(
	directory: string,
	path: string,
	expected: { applicationId: number; userVersion?: number; mode: number; directoryMode: number },
): Promise<void> {
	if (!IS_WINDOWS) {
		expect((await stat(directory)).mode & 0o777).toBe(expected.directoryMode);
		expect((await stat(path)).mode & 0o777).toBe(expected.mode);
	}
	const names = await readdir(directory);
	expect(names.some((name) => name.endsWith("-wal") || name.endsWith("-shm"))).toBe(false);
	const db = new DatabaseSync(path, { readOnly: true });
	try {
		expect((db.prepare("PRAGMA application_id").get() as { application_id: number }).application_id).toBe(
			expected.applicationId,
		);
		expect((db.prepare("PRAGMA user_version").get() as { user_version: number }).user_version).toBe(
			expected.userVersion ?? 0,
		);
		expect((db.prepare("PRAGMA journal_mode").get() as { journal_mode: string }).journal_mode).toBe("delete");
	} finally {
		db.close();
	}
}

describe("SQLite usage projection", () => {
	let database: UsageDatabase;
	let repository: UsageRepository;

	beforeEach(async () => {
		database = await UsageDatabase.open(":memory:");
		repository = new UsageRepository(database);
	});

	afterEach(() => database.close());

	it("repairs database directory and file permissions on open", async () => {
		const directory = await mkdtemp(join(process.cwd(), "output", "database-mode-test-"));
		const path = join(directory, "usage.sqlite");
		try {
			await writeFile(path, "");
			await chmod(directory, 0o755);
			await chmod(path, 0o666);
			const disk = await UsageDatabase.open(path);
			disk.close();
			if (!IS_WINDOWS) {
				expect((await stat(directory)).mode & 0o777).toBe(0o700);
				expect((await stat(path)).mode & 0o777).toBe(0o600);
			}
		} finally {
			await rm(directory, { recursive: true, force: true });
		}
	});

	it("persists provider/model facts and replaces repeated step samples", () => {
		const first = projectUsageEvents(
			emptySessionCursor("session-1", "live", "rev-1", 1_000),
			events(
				{
					type: "request/header",
					seq: 0,
					time: 1_000,
					data: { header: { config: { provider: "openrouter", model: "deepseek/deepseek-v3" } }, reason: "initial" },
				},
				{
					type: "assistant/chunk",
					seq: 1,
					time: 2_000,
					data: {
						turn: 0,
						step: 0,
						chunk: { type: "usage", usage: { inputTokens: 100, outputTokens: 20, cacheReadTokens: 50 } },
					},
				},
			),
			"rev-2",
			2_000,
		);
		repository.applyProjection(first);
		expect(repository.countFacts()).toBe(1);
		expect(repository.listFacts({ from: 0, to: 3_000 })[0]).toMatchObject({
			providerId: "openrouter",
			modelId: "deepseek/deepseek-v3",
			inputTokens: 100,
			outputTokens: 20,
			cacheReadTokens: 50,
		});

		const replacement = projectUsageEvents(
			first.cursor,
			events({
				type: "assistant/message",
				seq: 2,
				time: 4_000,
				data: {
					turn: 0,
					step: 0,
					message: { source: { provider: "deepseek-official", model: "deepseek-chat" } },
					usage: { inputTokens: 110, outputTokens: 25, cacheReadTokens: 60, cacheWriteTokens: 5 },
				},
			}),
			"rev-3",
			4_000,
		);
		repository.applyProjection(replacement);
		expect(repository.countFacts()).toBe(1);
		expect(repository.listFacts({ from: 0, to: 5_000 })[0]).toMatchObject({
			occurredAt: 4_000,
			providerId: "deepseek-official",
			modelId: "deepseek-chat",
			inputTokens: 110,
			outputTokens: 25,
			cacheReadTokens: 60,
			cacheWriteTokens: 5,
		});
		expect(repository.getCursor("session-1")).toMatchObject({ nextSeq: 3, sourceRevision: "rev-3" });
	});

	it("detects event gaps and supports transactional session rebuilds", () => {
		const cursor = emptySessionCursor("session-2", "persisted", "rev-a", 0);
		expect(() =>
			projectUsageEvents(
				cursor,
				events({
					type: "assistant/chunk",
					seq: 3,
					time: 10,
					data: { turn: 0, step: 0, chunk: { type: "usage", usage: { inputTokens: 1, outputTokens: 1 } } },
				}),
			),
		).toThrow(UsageProjectionGapError);

		const initial = projectUsageEvents(
			cursor,
			events({
				type: "assistant/chunk",
				seq: 0,
				time: 10,
				data: { turn: 0, step: 0, chunk: { type: "usage", usage: { inputTokens: 5, outputTokens: 2 } } },
			}),
		);
		repository.applyProjection(initial);

		const rebuilt = projectUsageEvents(
			emptySessionCursor("session-2", "persisted", "rev-b", 20),
			events({
				type: "assistant/chunk",
				seq: 0,
				time: 20,
				data: { turn: 1, step: 0, chunk: { type: "usage", usage: { inputTokens: 9, outputTokens: 4 } } },
			}),
		);
		repository.applyProjection(rebuilt, true);
		expect(repository.countFacts()).toBe(1);
		expect(repository.sumFacts({ from: 0, to: 100 })).toEqual({
			inputTokens: 9,
			outputTokens: 4,
			cacheReadTokens: 0,
			cacheWriteTokens: 0,
			requests: 1,
		});
	});

	it("does not chmod or enable WAL on a foreign application database", async () => {
		const directory = await mkdtemp(join(process.cwd(), "output", "database-foreign-test-"));
		const path = join(directory, "foreign.sqlite");
		try {
			writeSqliteFile(path, (db) => {
				db.exec("CREATE TABLE notes (id INTEGER PRIMARY KEY, body TEXT)");
				db.exec("PRAGMA application_id = 305419896");
			});
			await chmod(directory, 0o755);
			await chmod(path, 0o644);
			await expect(UsageDatabase.open(path)).rejects.toThrow(/another application/);
			await expectUnmutatedDatabase(directory, path, {
				applicationId: 305419896,
				mode: 0o644,
				directoryMode: 0o755,
			});
		} finally {
			await rm(directory, { recursive: true, force: true });
		}
	});

	it("does not chmod or enable WAL on a database with unknown tables", async () => {
		const directory = await mkdtemp(join(process.cwd(), "output", "database-unknown-test-"));
		const path = join(directory, "unknown.sqlite");
		try {
			writeSqliteFile(path, (db) => {
				db.exec("CREATE TABLE leftover_metrics (id INTEGER PRIMARY KEY)");
			});
			await chmod(directory, 0o755);
			await chmod(path, 0o644);
			await expect(UsageDatabase.open(path)).rejects.toThrow(/not empty or recognized|unknown tables/);
			await expectUnmutatedDatabase(directory, path, {
				applicationId: 0,
				mode: 0o644,
				directoryMode: 0o755,
			});
		} finally {
			await rm(directory, { recursive: true, force: true });
		}
	});

	it("does not chmod or enable WAL on a newer usage schema", async () => {
		const directory = await mkdtemp(join(process.cwd(), "output", "database-future-test-"));
		const path = join(directory, "future.sqlite");
		try {
			writeSqliteFile(path, (db) => {
				db.exec("PRAGMA application_id = 1146442545");
				db.exec("PRAGMA user_version = 99");
			});
			await chmod(directory, 0o755);
			await chmod(path, 0o644);
			await expect(UsageDatabase.open(path)).rejects.toThrow(/newer than supported schema/);
			await expectUnmutatedDatabase(directory, path, {
				applicationId: 1146442545,
				userVersion: 99,
				mode: 0o644,
				directoryMode: 0o755,
			});
		} finally {
			await rm(directory, { recursive: true, force: true });
		}
	});

	it("upgrades schema v1 databases to v4 with account_fees, profile_id, and local usage tables", async () => {
		const directory = await mkdtemp(join(process.cwd(), "output", "database-v1-upgrade-"));
		const path = join(directory, "v1.sqlite");
		try {
			writeSqliteFile(path, (db) => {
				db.exec("PRAGMA application_id = 1146442545");
				db.exec("PRAGMA user_version = 1");
				db.exec(`
					CREATE TABLE session_cursors (session_id TEXT PRIMARY KEY);
					CREATE TABLE usage_facts (id INTEGER PRIMARY KEY);
					CREATE TABLE account_snapshots (provider_id TEXT PRIMARY KEY);
					CREATE TABLE quota_window_snapshots (id INTEGER PRIMARY KEY);
					CREATE TABLE price_rules (id TEXT PRIMARY KEY);
					CREATE TABLE preferences (id INTEGER PRIMARY KEY);
					CREATE TABLE alert_state (rule_id TEXT PRIMARY KEY);
					CREATE TABLE migration_state (key TEXT PRIMARY KEY);
				`);
			});
			const upgraded = await UsageDatabase.open(path);
			try {
				const version = (upgraded.prepare("PRAGMA user_version").get() as { user_version: number }).user_version;
				expect(version).toBe(4);
				const tables = (
					upgraded.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'account_fees'").get() as
						| { name: string }
						| undefined
				)?.name;
				expect(tables).toBe("account_fees");
				const columns = upgraded.prepare("PRAGMA table_info(account_snapshots)").all() as unknown as Array<{
					name: string;
				}>;
				expect(columns.some((column) => column.name === "profile_id")).toBe(true);
				const localTables = upgraded
					.prepare(
						"SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('local_usage_files', 'local_usage_file_days') ORDER BY name",
					)
					.all() as unknown as Array<{ name: string }>;
				expect(localTables.map((table) => table.name)).toEqual(["local_usage_file_days", "local_usage_files"]);
			} finally {
				upgraded.close();
			}
		} finally {
			await rm(directory, { recursive: true, force: true });
		}
	});

	it("keeps anonymized facts when a source session disappears by default", () => {
		const projection = projectUsageEvents(
			emptySessionCursor("session-3", "persisted", "rev", 0),
			events({
				type: "assistant/chunk",
				seq: 0,
				time: 10,
				data: { turn: 0, step: 0, chunk: { type: "usage", usage: { inputTokens: 2, outputTokens: 1 } } },
			}),
		);
		repository.applyProjection(projection);
		repository.markDeleted("session-3", 100, false);
		expect(repository.countFacts()).toBe(1);
		expect(repository.getCursor("session-3")?.deletedAt).toBe(100);
	});
});
