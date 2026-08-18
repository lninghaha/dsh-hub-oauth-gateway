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

export interface UsageStatsLlmRegistry {
	registerAdapter(routes: readonly string[], adapter: unknown): unknown;
	resolveModelInfo?(provider: string, model: string, signal?: AbortSignal): Promise<unknown>;
}

export interface UsageStatsHostContext {
	readonly logger: UsageStatsLogger;
	readonly webServer?: ExactWebServer;
	readonly credentials?: WritableCredentials;
	readonly sessions?: LiveSessionsLike;
	readonly sessionPersistence?: SessionPersistenceLike;
	readonly settings?: SettingsLike;
	readonly llm?: UsageStatsLlmRegistry;
	get?(name: string): unknown;
	emit?(event: string, ...args: unknown[]): void;
	inject?(services: readonly string[], callback: (ctx: UsageStatsHostContext) => void | Promise<void>): void;
	effect(setup: () => void | (() => void | Promise<void>), label?: string): void;
}
