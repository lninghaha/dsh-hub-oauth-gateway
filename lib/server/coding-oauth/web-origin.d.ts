/** Owner authorization shared by every private coding-OAuth Web route. */
import type { IncomingMessage } from "node:http";
import type { OwnerRequestPolicy as CoreOwnerRequestPolicy } from "dsh-coding-oauth-core";
export type { OwnerAccessMode } from "dsh-coding-oauth-core";
export declare const OWNER_PROOF_HEADER = "x-dsh-owner-proof";
export declare const OWNER_CSRF_HEADER = "x-dsh-csrf-token";
export interface TrustedReverseProxyPolicyConfig {
    readonly peers?: string[];
    readonly origins?: string[];
    readonly ownerProof?: string;
    readonly csrfToken?: string;
}
export interface OwnerRequestPolicyConfig {
    /** Use when loopback is intentionally reached through an SSH port forward. */
    readonly loopbackAccessMode?: "loopback" | "ssh-tunnel";
    readonly trustedProxy?: TrustedReverseProxyPolicyConfig;
}
export interface OwnerRequestDiagnostic {
    readonly id: string;
    readonly level: "info" | "warning" | "error";
    readonly message: string;
}
export type OwnerRequestPolicy = CoreOwnerRequestPolicy<IncomingMessage, OwnerRequestDiagnostic>;
/** Adapt an optional DSH policy so host churn always fails closed. */
export declare function safeguardOwnerRequestPolicy(policy: OwnerRequestPolicy): OwnerRequestPolicy;
/**
 * Build an immutable fail-closed policy. A future verified DSH owner-auth
 * policy, when supplied, is authoritative; fallback applies only while that
 * official seam is absent from DSH.
 */
export declare function createOwnerRequestPolicy(config?: OwnerRequestPolicyConfig, official?: OwnerRequestPolicy): OwnerRequestPolicy;
export declare const LOOPBACK_OWNER_REQUEST_POLICY: OwnerRequestPolicy;
export declare function isTrustedLoopbackWebRequest(req: IncomingMessage): boolean;
//# sourceMappingURL=web-origin.d.ts.map