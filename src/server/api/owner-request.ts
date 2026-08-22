import type { IncomingMessage } from "node:http";
import type { OwnerRequestDecision } from "dsh-coding-oauth-core";
import { LOOPBACK_OWNER_REQUEST_POLICY, type OwnerRequestPolicy } from "../coding-oauth/web-origin.js";
import { passesCsrfGuard } from "./security.js";

/**
 * Apply the shared owner policy to every Hub API surface. Trusted HTTPS proxy
 * mutations use the policy's independent secret CSRF proof. Loopback and SSH
 * mutations retain the existing custom-header guard.
 */
export function authorizeHubApiRequest(
	request: IncomingMessage,
	policy: OwnerRequestPolicy = LOOPBACK_OWNER_REQUEST_POLICY,
): OwnerRequestDecision {
	const decision = policy.authorize(request);
	if (!decision.authorized) return decision;
	if (
		request.method !== "GET" &&
		request.method !== "HEAD" &&
		request.method !== "OPTIONS" &&
		decision.accessMode !== "trusted-https-proxy" &&
		!passesCsrfGuard(request)
	) {
		return { authorized: false, reason: "csrf" };
	}
	return decision;
}
