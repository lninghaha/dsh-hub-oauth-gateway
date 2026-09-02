import type { IncomingMessage } from "node:http";
import type { OwnerRequestDecision } from "dsh-coding-oauth-core";
import type { OwnerRequestPolicy } from "./web-origin.js";
/**
 * Owner policy plus the Hub Usage-API CSRF guard. Trusted HTTPS proxy
 * mutations keep the independent owner CSRF proof; loopback and SSH
 * mutations require `x-dsh-hub-oauth-gateway: 1` and a JSON body.
 */
export declare function authorizeCodingOAuthRequest(request: IncomingMessage, policy: OwnerRequestPolicy): OwnerRequestDecision;
/**
 * Gateway key reveal/rotate stay loopback-only, matching the Settings UI
 * which hides those controls on ssh-tunnel and trusted-https-proxy.
 */
export declare function authorizeLoopbackSecretRequest(request: IncomingMessage, policy: OwnerRequestPolicy): OwnerRequestDecision;
//# sourceMappingURL=authorize-request.d.ts.map