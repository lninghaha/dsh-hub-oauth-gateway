import type { WebServer } from "@deepseek-ai/dsh-host-webserver";
import { type DshCompatibility } from "../../shared/compatibility.js";
import type { WritableCredentials } from "../api/credentials.js";
import type { OwnerRequestPolicy } from "../coding-oauth/web-origin.js";
import type { UsageStatsHostContext } from "../context.js";
import type { SettingsLike } from "./providers.js";
import type { LiveSessionsLike, SessionPersistenceLike } from "./session-inventory.js";
type ExactWebServer = Pick<WebServer, "register">;
interface LlmLike {
    registerAdapter(routes: readonly string[], adapter: unknown): {
        replace(routes: string[]): void;
    };
    resolveModelInfo?(provider: string, model: string, signal?: AbortSignal): Promise<unknown>;
}
/** Centralizes every unstable DSH service lookup and shape check. */
export declare class DshHostAdapter {
    #private;
    constructor(ctx: UsageStatsHostContext);
    /** Stable Cordis application scope shared by sibling plugin contexts. */
    scope(): object;
    webServer(): ExactWebServer | undefined;
    credentials(): WritableCredentials | undefined;
    sessions(): LiveSessionsLike | undefined;
    persistence(): SessionPersistenceLike | undefined;
    settings(): SettingsLike | undefined;
    llm(): LlmLike | undefined;
    ownerRequestPolicy(): OwnerRequestPolicy | undefined;
    compatibility(options?: {
        readonly uiOwner?: "hub" | "standalone" | null;
        readonly accessMode?: DshCompatibility["accessMode"];
    }): DshCompatibility;
}
export {};
//# sourceMappingURL=adapter.d.ts.map