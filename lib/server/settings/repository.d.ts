import { type UserPreferences } from "../../shared/preferences.js";
import type { UsageDatabase } from "../storage/database.js";
export declare class PreferencesRepository {
    #private;
    constructor(database: UsageDatabase);
    exists(): boolean;
    load(fallbackTimeZone?: string): UserPreferences;
    save(preferences: UserPreferences, updatedAt?: number): UserPreferences;
}
//# sourceMappingURL=repository.d.ts.map