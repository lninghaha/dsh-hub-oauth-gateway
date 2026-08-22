import type { IncomingMessage } from "node:http";
import type { OwnerRequestDecision } from "dsh-coding-oauth-core";
import { type OwnerRequestPolicy } from "../coding-oauth/web-origin.js";
/**
 * Apply the shared owner policy to every Hub API surface. Trusted HTTPS proxy
 * mutations use the policy's independent secret CSRF proof. Loopback and SSH
 * mutations retain the existing custom-header guard.
 */
export declare function authorizeHubApiRequest(request: IncomingMessage, policy?: OwnerRequestPolicy): OwnerRequestDecision;
//# sourceMappingURL=owner-request.d.ts.map