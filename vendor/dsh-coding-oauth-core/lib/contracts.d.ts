/** Browser-safe ABI and capability contracts with no Node.js runtime imports. */
export * from "./state-contract.js";
export declare const CODING_OAUTH_CORE_ABI: "dsh-coding-oauth-core/v1";
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
export interface OwnerRequestPolicy<Request = unknown, Diagnostic = unknown> {
    authorize(request: Request): OwnerRequestDecision;
    diagnostics(): readonly Diagnostic[];
}
//# sourceMappingURL=contracts.d.ts.map