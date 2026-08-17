import type { PreferencesRepository } from "./settings/repository.js";
import type { UsageDatabase } from "./storage/database.js";
import type { UsageRepository } from "./usage/repository.js";
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
export declare function migrateLegacyPreferences(database: UsageDatabase, preferences: PreferencesRepository, logger: MigrationLogger, environment?: NodeJS.ProcessEnv): Promise<void>;
export declare function migrateLegacyUsageCache(database: UsageDatabase, usage: UsageRepository, logger: MigrationLogger, environment?: NodeJS.ProcessEnv): Promise<LegacyUsageMigrationOutcome>;
//# sourceMappingURL=migration.d.ts.map