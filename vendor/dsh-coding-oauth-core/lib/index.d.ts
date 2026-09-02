/**
 * DSH-neutral coordination primitives for coding OAuth integrations.
 *
 * This package deliberately declares no `dsh.bundle` or `dsh.client` metadata.
 * Multiple physical copies coordinate through a versioned global symbol while
 * keeping each Cordis root isolated in a WeakMap.
 */
export declare const CODING_OAUTH_CORE_ABI: "dsh-coding-oauth-core/v1";
export * from "./proxy.js";
export * from "./route-registration.js";
export * from "./ids.js";
export * from "./state-contract.js";
export * from "./http-json.js";
export * from "./grok-errors.js";
export * from "./kimi-errors.js";
export * from "./gateway-protocol.js";
export type CodingOAuthRole = "hub" | "standalone";
export type DshCapabilityState = "available" | "missing" | "incompatible";
export interface DshHostCapability {
    readonly state: DshCapabilityState;
    readonly contract?: string;
    readonly reason?: string;
}
export interface DshHostCapabilities {
    readonly coreAbi: typeof CODING_OAUTH_CORE_ABI;
    readonly dshVersion: string | null;
    readonly webServer: DshHostCapability;
    readonly settings: DshHostCapability;
    readonly credentials: DshHostCapability;
    readonly llm: DshHostCapability;
    readonly sessions?: DshHostCapability;
    readonly clientLoader?: DshHostCapability;
    readonly slots?: DshHostCapability;
}
export type OwnerAccessMode = "loopback" | "ssh-tunnel" | "trusted-https-proxy" | "denied";
export interface OwnerRequestDecision {
    readonly authorized: boolean;
    readonly accessMode?: OwnerAccessMode;
    readonly reason?: string;
}
/** Security boundary implemented by each host integration. */
export interface OwnerRequestPolicy<Request = unknown, Diagnostic = unknown> {
    authorize(request: Request): OwnerRequestDecision;
    diagnostics(): readonly Diagnostic[];
}
export interface CodingOAuthActivation<T = unknown> {
    readonly runtime?: T;
    dispose(): void | Promise<void>;
}
export interface CodingOAuthParticipant<T = unknown> {
    readonly id: string;
    readonly role: CodingOAuthRole;
    readonly coreAbi: typeof CODING_OAUTH_CORE_ABI;
    activate(): CodingOAuthActivation<T> | Promise<CodingOAuthActivation<T>>;
}
export type CodingOAuthRuntimeStatus = "activating" | "active" | "standby" | "error" | "incompatible";
export interface CodingOAuthRuntimeSnapshot<T = unknown> {
    readonly participantId: string;
    readonly role: CodingOAuthRole;
    readonly status: CodingOAuthRuntimeStatus;
    readonly ownerId: string | null;
    readonly uiOwner: CodingOAuthRole | null;
    readonly runtime?: T;
    readonly diagnostic: string | null;
}
export interface CodingOAuthRuntime<T = unknown> {
    snapshot(): CodingOAuthRuntimeSnapshot<T>;
    subscribe(listener: (snapshot: CodingOAuthRuntimeSnapshot<T>) => void): () => void;
    settled(): Promise<CodingOAuthRuntimeSnapshot<T>>;
    release(): Promise<void>;
}
/** Resolve the stable Cordis application root shared by sibling plugin contexts. */
export declare function resolveCodingOAuthScope(context: object): object;
/**
 * Join the root-scoped owner election. Hub participants always win over
 * standalone participants; ties are deterministic by participant id.
 */
export declare function acquireCodingOAuthRuntime<T>(scope: object, participant: CodingOAuthParticipant<T>): CodingOAuthRuntime<T>;
//# sourceMappingURL=index.d.ts.map