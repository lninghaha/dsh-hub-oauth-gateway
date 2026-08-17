import { defaultUserPreferences, type UserPreferences, UserPreferencesSchema } from "../../shared/preferences.js";
import type { UsageDatabase } from "../storage/database.js";

interface PreferenceRow {
	version: number;
	value_json: string;
	updated_at: number;
}

export class PreferencesRepository {
	readonly #database: UsageDatabase;

	constructor(database: UsageDatabase) {
		this.#database = database;
	}

	exists(): boolean {
		return this.#database.prepare("SELECT 1 AS found FROM preferences WHERE id = 1").get() !== undefined;
	}

	load(fallbackTimeZone = "UTC"): UserPreferences {
		const row = this.#database.prepare("SELECT version, value_json, updated_at FROM preferences WHERE id = 1").get() as
			| PreferenceRow
			| undefined;
		if (row === undefined) return defaultUserPreferences(fallbackTimeZone);
		if (row.version !== 1) throw new Error(`unsupported usage preferences version ${row.version}`);
		return UserPreferencesSchema.parse(JSON.parse(row.value_json));
	}

	save(preferences: UserPreferences, updatedAt = Date.now()): UserPreferences {
		const value = UserPreferencesSchema.parse(preferences);
		this.#database
			.prepare(`
				INSERT INTO preferences (id, version, value_json, updated_at)
				VALUES (1, ?, ?, ?)
				ON CONFLICT(id) DO UPDATE SET
					version = excluded.version,
					value_json = excluded.value_json,
					updated_at = excluded.updated_at
			`)
			.run(value.version, JSON.stringify(value), updatedAt);
		return value;
	}
}
