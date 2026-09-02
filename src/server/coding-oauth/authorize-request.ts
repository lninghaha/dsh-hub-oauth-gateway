import type { IncomingMessage } from "node:http";
import type { OwnerRequestDecision } from "dsh-coding-oauth-core";
import { authorizeHubApiRequest } from "../api/owner-request.js";
import type { OwnerRequestPolicy } from "./web-origin.js";

/**
 * Owner policy plus the Hub Usage-API CSRF guard. Trusted HTTPS proxy
 * mutations keep the independent owner CSRF proof; loopback and SSH
 * mutations require `x-dsh-hub-oauth-gateway: 1` and a JSON body.
 */
export function authorizeCodingOAuthRequest(
	request: IncomingMessage,
	policy: OwnerRequestPolicy,
): OwnerRequestDecision {
	return authorizeHubApiRequest(request, policy);
}

/**
 * Gateway key reveal/rotate stay loopback-only, matching the Settings UI
 * which hides those controls on ssh-tunnel and trusted-https-proxy.
 */
export function authorizeLoopbackSecretRequest(
	request: IncomingMessage,
	policy: OwnerRequestPolicy,
): OwnerRequestDecision {
	const decision = authorizeHubApiRequest(request, policy);
	if (!decision.authorized) return decision;
	if (decision.accessMode !== "loopback") {
		return { authorized: false, reason: "loopback-only" };
	}
	return decision;
}
