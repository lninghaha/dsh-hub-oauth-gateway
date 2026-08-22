/** Owner authorization shared by every private coding-OAuth Web route. */

import { timingSafeEqual } from "node:crypto";
import type { IncomingMessage } from "node:http";
import type {
	OwnerRequestPolicy as CoreOwnerRequestPolicy,
	OwnerAccessMode,
	OwnerRequestDecision,
} from "dsh-coding-oauth-core";

export type { OwnerAccessMode } from "dsh-coding-oauth-core";

export const OWNER_PROOF_HEADER = "x-dsh-owner-proof";
export const OWNER_CSRF_HEADER = "x-dsh-csrf-token";

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

interface TrustedProxyPolicy {
	readonly peers: ReadonlySet<string>;
	readonly origins: ReadonlySet<string>;
	readonly ownerProof: string;
	readonly csrfToken: string;
}

const OWNER_ACCESS_MODES = new Set<OwnerAccessMode>(["loopback", "ssh-tunnel", "trusted-https-proxy"]);

/** Adapt an optional DSH policy so host churn always fails closed. */
export function safeguardOwnerRequestPolicy(policy: OwnerRequestPolicy): OwnerRequestPolicy {
	return Object.freeze({
		authorize(req: IncomingMessage): OwnerRequestDecision {
			try {
				const decision = policy.authorize(req);
				if (decision?.authorized === false) {
					return { authorized: false, reason: typeof decision.reason === "string" ? decision.reason : "denied" };
				}
				if (
					decision?.authorized === true &&
					typeof decision.accessMode === "string" &&
					OWNER_ACCESS_MODES.has(decision.accessMode as OwnerAccessMode)
				) {
					return { authorized: true, accessMode: decision.accessMode as OwnerAccessMode };
				}
				return { authorized: false, reason: "invalid-owner-policy-decision" };
			} catch {
				return { authorized: false, reason: "owner-policy-error" };
			}
		},
		diagnostics(): readonly OwnerRequestDiagnostic[] {
			try {
				const diagnostics = policy.diagnostics();
				if (!Array.isArray(diagnostics) || !diagnostics.every(isOwnerRequestDiagnostic)) {
					return [ownerPolicyDiagnosticError("DSH owner-request policy returned invalid diagnostics")];
				}
				return Object.freeze([...diagnostics]);
			} catch {
				return [ownerPolicyDiagnosticError("DSH owner-request policy diagnostics failed")];
			}
		},
	});
}

function isOwnerRequestDiagnostic(value: unknown): value is OwnerRequestDiagnostic {
	if (typeof value !== "object" || value === null) return false;
	const candidate = value as Partial<OwnerRequestDiagnostic>;
	return (
		typeof candidate.id === "string" &&
		(candidate.level === "info" || candidate.level === "warning" || candidate.level === "error") &&
		typeof candidate.message === "string"
	);
}

function ownerPolicyDiagnosticError(message: string): OwnerRequestDiagnostic {
	return { id: "owner-request.dsh-policy-invalid", level: "error", message };
}

/**
 * Build an immutable fail-closed policy. A future verified DSH owner-auth
 * policy, when supplied, is authoritative; fallback applies only while that
 * official seam is absent from DSH.
 */
export function createOwnerRequestPolicy(
	config: OwnerRequestPolicyConfig = {},
	official?: OwnerRequestPolicy,
): OwnerRequestPolicy {
	if (official !== undefined) return safeguardOwnerRequestPolicy(official);
	const loopbackAccessMode = config.loopbackAccessMode ?? "loopback";
	const proxyConfigured = config.trustedProxy !== undefined;
	const trustedProxy = parseTrustedProxyPolicy(config.trustedProxy);
	const diagnostics: OwnerRequestDiagnostic[] = [
		{
			id: "owner-request.dsh-owner-auth-unavailable",
			level: "warning",
			message: "DSH owner-auth is unavailable; the strict loopback/proxy fallback is active",
		},
	];
	if (proxyConfigured && trustedProxy === undefined) {
		diagnostics.push({
			id: "owner-request.trusted-proxy-incomplete",
			level: "error",
			message: "trusted HTTPS proxy access is disabled because its policy is incomplete",
		});
	} else if (trustedProxy !== undefined) {
		diagnostics.push({
			id: "owner-request.trusted-proxy",
			level: "info",
			message: "trusted HTTPS proxy access requires peer, Origin, Host, owner proof, Fetch Metadata, and CSRF",
		});
	}
	const frozenDiagnostics = Object.freeze([...diagnostics]);

	return Object.freeze({
		authorize(req: IncomingMessage): OwnerRequestDecision {
			const peer = normalizePeer(req.socket.remoteAddress);
			// A configured proxy peer is always evaluated as proxy traffic. This is
			// especially important for same-host reverse proxies whose TCP peer is
			// loopback; allowing the loopback branch first would bypass proxy proof.
			if (trustedProxy !== undefined && peer !== undefined && trustedProxy.peers.has(peer)) {
				return authorizeTrustedProxy(req, trustedProxy);
			}
			const loopback = authorizeLoopback(req, loopbackAccessMode);
			if (loopback.authorized) return loopback;
			if (trustedProxy === undefined) {
				return proxyConfigured ? { authorized: false, reason: "incomplete-policy" } : loopback;
			}
			return authorizeTrustedProxy(req, trustedProxy);
		},
		diagnostics: () => frozenDiagnostics,
	});
}

export const LOOPBACK_OWNER_REQUEST_POLICY = createOwnerRequestPolicy();

export function isTrustedLoopbackWebRequest(req: IncomingMessage): boolean {
	return authorizeLoopback(req, "loopback").authorized;
}

function authorizeLoopback(req: IncomingMessage, accessMode: OwnerAccessMode): OwnerRequestDecision {
	if (!isLoopbackPeer(req.socket.remoteAddress)) return { authorized: false, reason: "peer" };
	if (singleHeader(req, "sec-fetch-site") === "cross-site") {
		return { authorized: false, reason: "fetch-metadata" };
	}
	const host = parseLoopbackHost(singleHeader(req, "host"));
	if (host === undefined) return { authorized: false, reason: "host" };
	const origin = singleHeader(req, "origin");
	if (origin === undefined) return { authorized: true, accessMode };
	try {
		const parsed = new URL(origin);
		if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return { authorized: false, reason: "origin" };
		if (!isLoopbackHostname(parsed.hostname)) return { authorized: false, reason: "origin" };
		return parsed.host.toLowerCase() === host
			? { authorized: true, accessMode }
			: { authorized: false, reason: "origin" };
	} catch {
		return { authorized: false, reason: "origin" };
	}
}

function authorizeTrustedProxy(req: IncomingMessage, policy: TrustedProxyPolicy): OwnerRequestDecision {
	const peer = normalizePeer(req.socket.remoteAddress);
	if (peer === undefined || !policy.peers.has(peer)) return { authorized: false, reason: "peer" };
	const origin = normalizeHttpsOrigin(singleHeader(req, "origin"));
	if (origin === undefined || !policy.origins.has(origin)) return { authorized: false, reason: "origin" };
	const host = normalizeAuthority(singleHeader(req, "host"));
	if (host === undefined || host !== new URL(origin).host.toLowerCase()) return { authorized: false, reason: "host" };
	if (singleHeader(req, "sec-fetch-site") !== "same-origin") {
		return { authorized: false, reason: "fetch-metadata" };
	}
	if (!secretMatches(singleHeader(req, OWNER_PROOF_HEADER), policy.ownerProof)) {
		return { authorized: false, reason: "owner-proof" };
	}
	if (isMutation(req.method) && !secretMatches(singleHeader(req, OWNER_CSRF_HEADER), policy.csrfToken)) {
		return { authorized: false, reason: "csrf" };
	}
	return { authorized: true, accessMode: "trusted-https-proxy" };
}

function parseTrustedProxyPolicy(config: TrustedReverseProxyPolicyConfig | undefined): TrustedProxyPolicy | undefined {
	if (config === undefined) return undefined;
	const peers = new Set(
		(config.peers ?? []).map(normalizePeer).filter((value): value is string => value !== undefined),
	);
	const origins = new Set(
		(config.origins ?? []).map(normalizeHttpsOrigin).filter((value): value is string => value !== undefined),
	);
	if (peers.size === 0 || origins.size === 0) return undefined;
	if (!nonEmptySecret(config.ownerProof) || !nonEmptySecret(config.csrfToken)) return undefined;
	if (config.ownerProof === config.csrfToken) return undefined;
	return { peers, origins, ownerProof: config.ownerProof, csrfToken: config.csrfToken };
}

function singleHeader(req: IncomingMessage, name: string): string | undefined {
	const value = req.headers[name];
	return typeof value === "string" && value.length > 0 ? value : undefined;
}

function nonEmptySecret(value: string | undefined): value is string {
	return typeof value === "string" && value.length > 0;
}

function secretMatches(received: string | undefined, expected: string): boolean {
	if (received === undefined) return false;
	const actualBytes = Buffer.from(received);
	const expectedBytes = Buffer.from(expected);
	return actualBytes.byteLength === expectedBytes.byteLength && timingSafeEqual(actualBytes, expectedBytes);
}

function normalizeHttpsOrigin(value: string | undefined): string | undefined {
	if (value === undefined) return undefined;
	try {
		const parsed = new URL(value);
		if (parsed.protocol !== "https:") return undefined;
		if (
			parsed.username !== "" ||
			parsed.password !== "" ||
			parsed.pathname !== "/" ||
			parsed.search !== "" ||
			parsed.hash !== ""
		) {
			return undefined;
		}
		return parsed.origin.toLowerCase();
	} catch {
		return undefined;
	}
}

function normalizeAuthority(value: string | undefined): string | undefined {
	if (value === undefined || value.includes("/") || value.includes("@")) return undefined;
	try {
		return new URL(`https://${value}`).host.toLowerCase();
	} catch {
		return undefined;
	}
}

function parseLoopbackHost(value: string | undefined): string | undefined {
	if (value === undefined) return undefined;
	try {
		const parsed = new URL(`http://${value}`);
		if (parsed.username !== "" || parsed.password !== "" || parsed.pathname !== "/" || parsed.search !== "")
			return undefined;
		if (!isLoopbackHostname(parsed.hostname)) return undefined;
		return parsed.host.toLowerCase();
	} catch {
		return undefined;
	}
}

function normalizePeer(value: string | undefined): string | undefined {
	if (value === undefined) return undefined;
	const normalized = value.trim().toLowerCase();
	if (normalized.length === 0) return undefined;
	return normalized.startsWith("::ffff:") ? normalized.slice("::ffff:".length) : normalized;
}

function isLoopbackPeer(value: string | undefined): boolean {
	const normalized = normalizePeer(value);
	return normalized === "::1" || (normalized !== undefined && isIpv4Loopback(normalized));
}

function isLoopbackHostname(value: string): boolean {
	const normalized = value.toLowerCase();
	return normalized === "localhost" || normalized === "[::1]" || isIpv4Loopback(normalized);
}

function isIpv4Loopback(value: string): boolean {
	const octets = value.split(".");
	if (octets.length !== 4 || octets[0] !== "127") return false;
	return octets.every((octet) => /^(?:0|[1-9][0-9]{0,2})$/u.test(octet) && Number(octet) <= 255);
}

function isMutation(method: string | undefined): boolean {
	return method !== "GET" && method !== "HEAD" && method !== "OPTIONS";
}
