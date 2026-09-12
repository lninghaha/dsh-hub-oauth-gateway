import { type PreferencePathOperation, type UserPreferences, type UserPreferencesPatch } from "../../shared/preferences.js";
import type { UsageDatabase } from "../storage/database.js";
export interface PreferenceSnapshot {
    readonly preferences: UserPreferences;
    readonly revision: number;
}
export declare class PreferencesRepository {
    #private;
    constructor(database: UsageDatabase);
    exists(): boolean;
    load(fallbackTimeZone?: string): UserPreferences;
    snapshot(fallbackTimeZone?: string): PreferenceSnapshot;
    save(preferences: UserPreferences, updatedAt?: number): UserPreferences;
    patch(expectedRevision: number, patch: UserPreferencesPatch | readonly PreferencePathOperation[], updatedAt?: number): PreferenceSnapshot | undefined;
    private write;
}
//# sourceMappingURL=repository.d.ts.map