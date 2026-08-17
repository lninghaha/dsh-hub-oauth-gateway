import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { defaultUserPreferences } from "../shared/preferences.js";
import type { PreferencesRepository } from "./settings/repository.js";
import type { UsageDatabase } from "./storage/database.js";
import { emptySessionCursor, type ProjectUsageResult, type UsageFact } from "./usage/projector.js";
import type { UsageRepository } from "./usage/repository.js";

interface MigrationRow {
	value_json: string;
}

class MigrationState {
	readonly #database: UsageDatabase;

	constructor(database: UsageDatabase) {
		this.#database = database;
	}

	isTerminal(key: string): boolean {
		const value = recordOf(this.get(key));
		return typeof value?.status === "string" && value.status !== "failed";
	}

	set(key: string, value: unknown, updatedAt = Date.now()): void {
		this.#database
			.prepare(`
				INSERT INTO migration_state (key, value_json, updated_at) VALUES (?, ?, ?)
				ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at
			`)
			.run(key, JSON.stringify(value), updatedAt);
	}

	get(key: string): unknown | null {
		const row = this.#database.prepare("SELECT value_json FROM migration_state WHERE key = ?").get(key) as
			| MigrationRow
			| undefined;
		return row === undefined ? null : JSON.parse(row.value_json);
	}
}

function dshHome(environment: NodeJS.ProcessEnv = process.env): string {
	return environment.DSH_HOME ?? join(homedir(), ".dsh");
}

function recordOf(value: unknown): Record<string, unknown> | null {
	return value !== null && typeof value === "object" && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: null;
}

export interface MigrationLogger {
	warn(message: string): void;
	info?(message: string): void;
}

export type LegacyUsageMigrationStatus = "imported" | "ignored" | "absent" | "failed";

export interface LegacyUsageMigrationOutcome {
	readonly terminal: boolean;
	readonly status: LegacyUsageMigrationStatus;
	readonly importedSessions?: number;
	readonly importedFacts?: number;
}

export async function migrateLegacyPreferences(
	database: UsageDatabase,
	preferences: PreferencesRepository,
	logger: MigrationLogger,
	environment: NodeJS.ProcessEnv = process.env,
): Promise<void> {
	const state = new MigrationState(database);
	const key = "legacy-preferences-v1";
	if (state.isTerminal(key) || preferences.exists()) return;
	const path = join(dshHome(environment), "storages", "usage-stats-prefs.json");
	try {
		const raw = recordOf(JSON.parse(await readFile(path, "utf8")));
		if (raw?.version !== 1) {
			state.set(key, { status: "ignored", reason: "unsupported-version" });
			return;
		}
		const value = defaultUserPreferences();
		value.providers.hidden = Array.isArray(raw.hiddenProviders)
			? raw.hiddenProviders.filter((item): item is string => typeof item === "string")
			: [];
		value.display.density = raw.density === "compact" ? "compact" : "comfortable";
		value.display.defaultRange = raw.historyMode === "daily" ? "7d" : "30d";
		preferences.save(value);
		state.set(key, { status: "imported" });
		logger.info?.("usage-stats: imported legacy display preferences");
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") {
			state.set(key, { status: "absent" });
			return;
		}
		logger.warn("usage-stats: legacy preferences migration failed (details redacted; it will retry next start)");
		state.set(key, { status: "failed" });
	}
}

function bucketsOf(
	value: unknown,
): Pick<UsageFact, "inputTokens" | "outputTokens" | "cacheReadTokens" | "cacheWriteTokens"> | null {
	const source = recordOf(value);
	if (source === null) return null;
	const bucket = (key: string): number => {
		const raw = source[key];
		return typeof raw === "number" && Number.isSafeInteger(raw) && raw >= 0 ? raw : 0;
	};
	return {
		inputTokens: bucket("inputTokens"),
		outputTokens: bucket("outputTokens"),
		cacheReadTokens: bucket("cacheReadTokens"),
		cacheWriteTokens: bucket("cacheWriteTokens"),
	};
}

function legacyFacts(sessionId: string, raw: unknown): UsageFact[] {
	const session = recordOf(raw);
	const days = recordOf(session?.days);
	if (days === null) return [];
	const facts: UsageFact[] = [];
	let ordinal = 0;
	for (const [date, value] of Object.entries(days).sort(([left], [right]) => left.localeCompare(right))) {
		const day = recordOf(value);
		if (day === null) continue;
		const models = recordOf(day.models);
		const entries =
			models === null || Object.keys(models).length === 0 ? [["unknown", day.totals] as const] : Object.entries(models);
		const occurredAt = Date.parse(`${date}T12:00:00.000Z`);
		if (!Number.isFinite(occurredAt) || occurredAt < 0) continue;
		for (const [modelId, value] of entries) {
			const buckets = bucketsOf(value);
			if (buckets === null) continue;
			facts.push({
				sessionId,
				turn: ordinal,
				step: 0,
				eventSeq: ordinal,
				occurredAt,
				providerId: "unknown",
				modelId,
				...buckets,
			});
			ordinal += 1;
		}
	}
	return facts;
}

function storedUsageMigrationOutcome(state: MigrationState, key: string): LegacyUsageMigrationOutcome | null {
	if (!state.isTerminal(key)) return null;
	const value = recordOf(state.get(key));
	const status = value?.status;
	if (status === "imported" || status === "ignored" || status === "absent") {
		return {
			terminal: true,
			status,
			...(typeof value?.importedSessions === "number" ? { importedSessions: value.importedSessions } : {}),
			...(typeof value?.importedFacts === "number" ? { importedFacts: value.importedFacts } : {}),
		};
	}
	return { terminal: true, status: "imported" };
}

export async function migrateLegacyUsageCache(
	database: UsageDatabase,
	usage: UsageRepository,
	logger: MigrationLogger,
	environment: NodeJS.ProcessEnv = process.env,
): Promise<LegacyUsageMigrationOutcome> {
	const state = new MigrationState(database);
	const key = "legacy-usage-cache-v3";
	const alreadyComplete = storedUsageMigrationOutcome(state, key);
	if (alreadyComplete !== null) return alreadyComplete;
	const path = join(dshHome(environment), "storages", "usage-stats-cache.json");
	try {
		const root = recordOf(JSON.parse(await readFile(path, "utf8")));
		if (root?.version !== 3 || recordOf(root.sessions) === null) {
			state.set(key, { status: "ignored", reason: "unsupported-version" });
			return { terminal: true, status: "ignored" };
		}
		let importedSessions = 0;
		let importedFacts = 0;
		const projections: Array<{ result: ProjectUsageResult }> = [];
		for (const [sessionId, raw] of Object.entries(recordOf(root.sessions) ?? {})) {
			if (usage.getCursor(sessionId) !== null) continue;
			const facts = legacyFacts(sessionId, raw);
			if (facts.length === 0) continue;
			const lastSeenAt = Math.max(...facts.map(({ occurredAt }) => occurredAt));
			projections.push({
				result: {
					cursor: {
						...emptySessionCursor(sessionId, "legacy", "legacy-cache-v3", lastSeenAt),
						nextSeq: facts.length,
					},
					facts,
				},
			});
			importedSessions += 1;
			importedFacts += facts.length;
		}
		usage.applyProjections(projections);
		state.set(key, { status: "imported", importedSessions, importedFacts });
		if (importedSessions > 0) logger.info?.(`usage-stats: imported ${importedSessions} legacy usage sessions`);
		return { terminal: true, status: "imported", importedSessions, importedFacts };
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") {
			state.set(key, { status: "absent" });
			return { terminal: true, status: "absent" };
		}
		logger.warn(
			"usage-stats: legacy usage migration failed (details redacted; it will retry after the next successful usage synchronization)",
		);
		state.set(key, { status: "failed" });
		return { terminal: false, status: "failed" };
	}
}
