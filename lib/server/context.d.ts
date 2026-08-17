import type { WritableCredentials } from "./api/credentials.js";
import type { ExactWebServer } from "./api/router.js";
import type { SettingsLike } from "./host/providers.js";
import type { LiveSessionsLike, SessionPersistenceLike } from "./host/session-inventory.js";
export interface UsageStatsLogger {
    debug(message: string): void;
    info(message: string): void;
    warn(message: string): void;
    error(message: string): void;
}
export interface UsageStatsHostContext {
    readonly logger: UsageStatsLogger;
    readonly webServer?: ExactWebServer;
    readonly credentials?: WritableCredentials;
    readonly sessions?: LiveSessionsLike;
    readonly sessionPersistence?: SessionPersistenceLike;
    readonly settings?: SettingsLike;
    get?(name: string): unknown;
    effect(setup: () => void | (() => void | Promise<void>), label?: string): void;
}
//# sourceMappingURL=context.d.ts.map