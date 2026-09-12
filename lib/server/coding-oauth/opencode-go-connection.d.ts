import type { IncomingMessage, ServerResponse } from "node:http";
import { type CredentialProvider } from "@deepseek-ai/dsh-credentials";
import { type GoApi } from "../../shared/opencode-go-protocol.js";
import type { OpenCodeGoStatus } from "./opencode-go-header.js";
import type { OwnerRequestPolicy } from "./web-origin.js";
export declare const OPENCODE_GO_CONNECTION_PATH = "/plugins/dsh-grok-build/opencode-go";
export declare const OPENCODE_GO_BASE_URL = "https://opencode.ai/zen/go/v1";
export declare const OPENCODE_GO_API = "openai-completions";
type SettingsPathOp = {
    readonly op: "set";
    readonly path: readonly string[];
    readonly value: unknown;
} | {
    readonly op: "unset";
    readonly path: readonly string[];
};
interface SettingsDescriptor {
    readonly ns: string;
    readonly value?: unknown;
    readonly revision?: number;
}
export interface OpenCodeGoSettingsProvider {
    readonly writable?: boolean;
    describe(options?: {
        readonly redactSecrets?: boolean;
    }): readonly SettingsDescriptor[];
    mutate(ns: string, ops: readonly SettingsPathOp[], expectedRevision?: number): Promise<void>;
}
export interface OpenCodeGoModel {
    readonly id: string;
    readonly name?: string;
    readonly contextWindow?: number;
    readonly maxTokens?: number;
}
type ConfigurationConflict = "protocol" | "base-url" | "static-session-header";
export interface OpenCodeGoConnectionStatus {
    readonly credential: {
        readonly selectedRef: string;
        readonly configured: boolean;
        readonly writable: boolean;
        readonly source: string | null;
        readonly requiresChoice: boolean;
        readonly candidates: readonly {
            readonly ref: string;
            readonly configured: boolean;
            readonly writable: boolean;
            readonly source: string | null;
        }[];
    };
    readonly configuration: {
        readonly revision: number | null;
        readonly writable: boolean;
        readonly api: string | null;
        readonly baseURL: string | null;
        readonly models: readonly OpenCodeGoModel[];
        readonly ready: boolean;
        readonly conflicts: readonly ConfigurationConflict[];
    };
    readonly call: OpenCodeGoStatus;
}
export interface OpenCodeGoConnectionController {
    status(preferredRef?: string): Promise<OpenCodeGoConnectionStatus>;
    models(preferredRef?: string): Promise<readonly OpenCodeGoModel[]>;
    saveCredential(input: {
        readonly credentialRef: string;
        readonly apiKey?: string;
    }): Promise<OpenCodeGoConnectionStatus>;
    applyConfiguration(input: {
        readonly api?: GoApi;
        readonly credentialRef: string;
        readonly model: OpenCodeGoModel;
        readonly expectedRevision: number;
        readonly confirmConflicts: boolean;
    }): Promise<OpenCodeGoConnectionStatus>;
}
interface ControllerOptions {
    readonly credentials: CredentialProvider;
    readonly settings: OpenCodeGoSettingsProvider;
    readonly callStatus: () => OpenCodeGoStatus;
    onConfigurationChange?: () => void;
    readonly fetchImpl?: typeof fetch;
}
export declare function createOpenCodeGoConnectionController(options: ControllerOptions): OpenCodeGoConnectionController;
export interface OpenCodeGoConnectionRouteContext {
    readonly webServer: {
        register(route: {
            readonly kind: "exact" | "prefix";
            readonly path: string;
            readonly handler: (req: IncomingMessage, res: ServerResponse) => void | Promise<void>;
        }): () => void;
    };
    effect(callback: () => () => void | Promise<void>, label?: string): unknown;
}
export declare function registerOpenCodeGoConnectionRoute(ctx: OpenCodeGoConnectionRouteContext, controller: OpenCodeGoConnectionController, ownerRequestPolicy: OwnerRequestPolicy): () => void;
export {};
//# sourceMappingURL=opencode-go-connection.d.ts.map