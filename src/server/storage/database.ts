import { chmod, mkdir, open } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import type { DatabaseSync } from "node:sqlite";

const APPLICATION_ID = 0x44555331;
const SCHEMA_VERSION = 1;
const SQLITE_HEADER = Buffer.from("SQLite format 3\0", "utf8");

const KNOWN_TABLES = new Set([
	"session_cursors",
	"usage_facts",
	"account_snapshots",
	"quota_window_snapshots",
	"price_rules",
	"preferences",
	"alert_state",
	"migration_state",
]);

async function createDatabaseFile(path: string): Promise<void> {
	try {
		await (await open(path, "wx", 0o600)).close();
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
	}
}

async function classifyDatabaseFile(path: string): Promise<"missing" | "empty" | "sqlite" | "other"> {
	try {
		const handle = await open(path, "r");
		try {
			const header = Buffer.alloc(SQLITE_HEADER.length);
			const { bytesRead } = await handle.read(header, 0, header.length, 0);
			if (bytesRead === 0) return "empty";
			if (bytesRead === header.length && header.equals(SQLITE_HEADER)) return "sqlite";
			return "other";
		} finally {
			await handle.close();
		}
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") return "missing";
		throw error;
	}
}

async function hardenDatabasePermissions(directory: string, file: string): Promise<void> {
	await chmod(directory, 0o700);
	await chmod(file, 0o600);
}

async function inspectExistingDatabase(path: string): Promise<void> {
	const { DatabaseSync } = await import("node:sqlite");
	const db = new DatabaseSync(path, { readOnly: true });
	try {
		assertRecognizedDatabase(db);
	} finally {
		db.close();
	}
}

function listUserTables(db: DatabaseSync): string[] {
	return (
		db
			.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT GLOB 'sqlite_*' ORDER BY name")
			.all() as Array<{ name: string }>
	).map(({ name }) => name);
}

function assertRecognizedDatabase(db: DatabaseSync): number {
	const application = db.prepare("PRAGMA application_id").get() as { application_id: number };
	const version = db.prepare("PRAGMA user_version").get() as { user_version: number };
	const tables = listUserTables(db);
	if (application.application_id !== 0 && application.application_id !== APPLICATION_ID) {
		throw new Error("usage database belongs to another application");
	}
	if (application.application_id === 0 && tables.length > 0) {
		throw new Error("usage database is not empty or recognized");
	}
	const unknown = tables.filter((table) => !KNOWN_TABLES.has(table));
	if (unknown.length > 0) throw new Error(`usage database contains unknown tables: ${unknown.join(", ")}`);
	if (version.user_version > SCHEMA_VERSION) {
		throw new Error(`usage database schema ${version.user_version} is newer than supported schema ${SCHEMA_VERSION}`);
	}
	return version.user_version;
}

function migrateToVersionOne(db: DatabaseSync): void {
	db.exec(`
		CREATE TABLE session_cursors (
			session_id TEXT PRIMARY KEY,
			source_kind TEXT NOT NULL CHECK (source_kind IN ('live', 'persisted', 'legacy')),
			source_revision TEXT,
			next_seq INTEGER NOT NULL CHECK (next_seq >= 0),
			current_provider TEXT,
			current_model TEXT,
			last_seen_at INTEGER NOT NULL CHECK (last_seen_at >= 0),
			deleted_at INTEGER CHECK (deleted_at IS NULL OR deleted_at >= 0)
		) STRICT;

		CREATE TABLE usage_facts (
			session_id TEXT NOT NULL,
			turn INTEGER NOT NULL CHECK (turn >= 0),
			step INTEGER NOT NULL CHECK (step >= 0),
			event_seq INTEGER NOT NULL CHECK (event_seq >= 0),
			occurred_at INTEGER NOT NULL CHECK (occurred_at >= 0),
			provider_id TEXT NOT NULL,
			model_id TEXT NOT NULL,
			input_tokens INTEGER NOT NULL CHECK (input_tokens >= 0),
			output_tokens INTEGER NOT NULL CHECK (output_tokens >= 0),
			cache_read_tokens INTEGER NOT NULL CHECK (cache_read_tokens >= 0),
			cache_write_tokens INTEGER NOT NULL CHECK (cache_write_tokens >= 0),
			PRIMARY KEY (session_id, turn, step)
		) STRICT;

		CREATE INDEX usage_facts_occurred_at_idx ON usage_facts (occurred_at);
		CREATE INDEX usage_facts_provider_time_idx ON usage_facts (provider_id, occurred_at);
		CREATE INDEX usage_facts_model_time_idx ON usage_facts (model_id, occurred_at);

		CREATE TABLE account_snapshots (
			id INTEGER PRIMARY KEY,
			provider_id TEXT NOT NULL,
			display_name TEXT NOT NULL,
			adapter_id TEXT,
			observed_at INTEGER NOT NULL CHECK (observed_at >= 0),
			status TEXT NOT NULL,
			mode TEXT,
			configured INTEGER NOT NULL CHECK (configured IN (0, 1)),
			stale INTEGER NOT NULL CHECK (stale IN (0, 1)),
			plan TEXT,
			balance_json TEXT,
			missing_credentials_json TEXT NOT NULL,
			warning_code TEXT
		) STRICT;

		CREATE INDEX account_snapshots_provider_time_idx ON account_snapshots (provider_id, observed_at DESC);

		CREATE TABLE quota_window_snapshots (
			account_snapshot_id INTEGER NOT NULL REFERENCES account_snapshots(id) ON DELETE CASCADE,
			window_id TEXT NOT NULL,
			kind TEXT NOT NULL,
			label TEXT NOT NULL,
			unit TEXT NOT NULL,
			used REAL,
			remaining REAL,
			quota_limit REAL,
			used_ratio REAL,
			resets_at INTEGER,
			rolling INTEGER NOT NULL CHECK (rolling IN (0, 1)),
			PRIMARY KEY (account_snapshot_id, window_id)
		) STRICT;

		CREATE TABLE price_rules (
			id TEXT PRIMARY KEY,
			provider_pattern TEXT NOT NULL,
			model_pattern TEXT NOT NULL,
			effective_from INTEGER NOT NULL CHECK (effective_from >= 0),
			currency TEXT NOT NULL,
			input_per_million REAL,
			output_per_million REAL,
			cache_read_per_million REAL,
			cache_write_per_million REAL,
			source TEXT NOT NULL CHECK (source IN ('builtin', 'user', 'imported')),
			updated_at INTEGER NOT NULL CHECK (updated_at >= 0)
		) STRICT;

		CREATE TABLE preferences (
			id INTEGER PRIMARY KEY CHECK (id = 1),
			version INTEGER NOT NULL,
			value_json TEXT NOT NULL,
			updated_at INTEGER NOT NULL CHECK (updated_at >= 0)
		) STRICT;

		CREATE TABLE alert_state (
			rule_id TEXT PRIMARY KEY,
			last_level TEXT NOT NULL,
			last_triggered_at INTEGER,
			snoozed_until INTEGER,
			value_json TEXT NOT NULL
		) STRICT;

		CREATE TABLE migration_state (
			key TEXT PRIMARY KEY,
			value_json TEXT NOT NULL,
			updated_at INTEGER NOT NULL CHECK (updated_at >= 0)
		) STRICT;
	`);
}

function migrate(db: DatabaseSync, fromVersion: number): void {
	if (fromVersion === SCHEMA_VERSION) return;
	db.exec("BEGIN IMMEDIATE");
	try {
		if (fromVersion < 1) migrateToVersionOne(db);
		db.exec(`PRAGMA application_id = ${APPLICATION_ID}`);
		db.exec(`PRAGMA user_version = ${SCHEMA_VERSION}`);
		db.exec("COMMIT");
	} catch (error) {
		db.exec("ROLLBACK");
		throw error;
	}
}

export class UsageDatabase {
	readonly #db: DatabaseSync;

	private constructor(db: DatabaseSync) {
		this.#db = db;
	}

	static async open(path: string): Promise<UsageDatabase> {
		const actual = path === ":memory:" ? path : resolve(path);
		if (actual !== ":memory:") {
			const directory = dirname(actual);
			await mkdir(directory, { recursive: true, mode: 0o700 });
			const kind = await classifyDatabaseFile(actual);
			if (kind === "missing") {
				await createDatabaseFile(actual);
				await hardenDatabasePermissions(directory, actual);
			} else if (kind === "empty") {
				await hardenDatabasePermissions(directory, actual);
			} else if (kind === "other") {
				throw new Error("usage database is not a recognized SQLite database");
			} else {
				await inspectExistingDatabase(actual);
				await hardenDatabasePermissions(directory, actual);
			}
		}
		const { DatabaseSync } = await import("node:sqlite");
		const db = new DatabaseSync(actual);
		try {
			const fromVersion = assertRecognizedDatabase(db);
			db.exec("PRAGMA foreign_keys = ON");
			db.exec("PRAGMA busy_timeout = 5000");
			if (actual !== ":memory:") db.exec("PRAGMA journal_mode = WAL");
			db.exec("PRAGMA synchronous = NORMAL");
			migrate(db, fromVersion);
			return new UsageDatabase(db);
		} catch (error) {
			db.close();
			throw error;
		}
	}

	prepare(sql: string) {
		return this.#db.prepare(sql);
	}

	exec(sql: string): void {
		this.#db.exec(sql);
	}

	transaction<T>(operation: () => T): T {
		this.#db.exec("BEGIN IMMEDIATE");
		try {
			const result = operation();
			this.#db.exec("COMMIT");
			return result;
		} catch (error) {
			this.#db.exec("ROLLBACK");
			throw error;
		}
	}

	close(): void {
		this.#db.close();
	}
}

export const USAGE_DATABASE_SCHEMA_VERSION = SCHEMA_VERSION;
