import {
	applyPreferenceOperations,
	defaultUserPreferences,
	type PreferencePathOperation,
	patchUserPreferences,
	type UserPreferences,
	type UserPreferencesPatch,
	UserPreferencesSchema,
} from "../../shared/preferences.js";
import type { UsageDatabase } from "../storage/database.js";

interface PreferenceRow {
	version: number;
	value_json: string;
	updated_at: number;
	revision: number;
}

export interface PreferenceSnapshot {
	readonly preferences: UserPreferences;
	readonly revision: number;
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
		return this.snapshot(fallbackTimeZone).preferences;
	}

	snapshot(fallbackTimeZone = "UTC"): PreferenceSnapshot {
		const row = this.#database
			.prepare("SELECT version, value_json, updated_at, revision FROM preferences WHERE id = 1")
			.get() as PreferenceRow | undefined;
		if (row === undefined) return { preferences: defaultUserPreferences(fallbackTimeZone), revision: 0 };
		if (row.version !== 1) throw new Error(`unsupported usage preferences version ${row.version}`);
		return { preferences: UserPreferencesSchema.parse(JSON.parse(row.value_json)), revision: row.revision };
	}

	save(preferences: UserPreferences, updatedAt = Date.now()): UserPreferences {
		const value = UserPreferencesSchema.parse(preferences);
		this.#database.transaction(() => {
			const current = this.snapshot();
			this.write(value, current.revision + 1, updatedAt);
		});
		return value;
	}

	patch(
		expectedRevision: number,
		patch: UserPreferencesPatch | readonly PreferencePathOperation[],
		updatedAt = Date.now(),
	): PreferenceSnapshot | undefined {
		return this.#database.transaction(() => {
			const current = this.snapshot();
			if (current.revision !== expectedRevision) return undefined;
			const preferences = Array.isArray(patch)
				? applyPreferenceOperations(current.preferences, patch)
				: patchUserPreferences(current.preferences, patch as UserPreferencesPatch);
			const revision = current.revision + 1;
			this.write(preferences, revision, updatedAt);
			return { preferences, revision };
		});
	}

	private write(value: UserPreferences, revision: number, updatedAt: number): void {
		this.#database
			.prepare(`
				INSERT INTO preferences (id, version, value_json, updated_at, revision)
				VALUES (1, ?, ?, ?, ?)
				ON CONFLICT(id) DO UPDATE SET
					version = excluded.version,
					value_json = excluded.value_json,
					updated_at = excluded.updated_at,
					revision = excluded.revision
			`)
			.run(value.version, JSON.stringify(value), updatedAt, revision);
	}
}
