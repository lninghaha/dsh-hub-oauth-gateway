import type { IncomingMessage } from "node:http";
import { describe, expect, it } from "vitest";
import {
	createOwnerRequestPolicy,
	isTrustedLoopbackWebRequest,
	OWNER_CSRF_HEADER,
	OWNER_PROOF_HEADER,
} from "../../../src/server/coding-oauth/web-origin.js";

function request(headers: Record<string, string>, remoteAddress = "127.0.0.1", method = "GET"): IncomingMessage {
	return { headers, method, socket: { remoteAddress } } as unknown as IncomingMessage;
}

const trustedProxy = {
	peers: ["10.0.0.8"],
	origins: ["https://dsh.example.test"],
	ownerProof: "owner-proof-secret",
	csrfToken: "csrf-proof-secret",
};

const proxyHeaders = {
	host: "dsh.example.test",
	origin: "https://dsh.example.test",
	"sec-fetch-site": "same-origin",
	[OWNER_PROOF_HEADER]: "owner-proof-secret",
	[OWNER_CSRF_HEADER]: "csrf-proof-secret",
};

describe("OwnerRequestPolicy", () => {
	it("treats a DSH-native owner policy as authoritative", () => {
		const official = {
			authorize: () => ({ authorized: false, reason: "official-denial" }),
			diagnostics: () => [],
		};
		const policy = createOwnerRequestPolicy({ trustedProxy }, official);
		expect(policy.authorize(request({ host: "attacker.invalid" }, "192.0.2.1"))).toEqual({
			authorized: false,
			reason: "official-denial",
		});
	});

	it("fails closed when a DSH-native owner policy throws or returns an invalid decision", () => {
		for (const official of [
			{
				authorize() {
					throw new Error("host churn");
				},
				diagnostics() {
					throw new Error("host churn");
				},
			},
			{ authorize: () => ({ authorized: true }), diagnostics: () => ["invalid"] },
		]) {
			const policy = createOwnerRequestPolicy({}, official as never);
			expect(policy.authorize(request({ host: "localhost:3080" })).authorized).toBe(false);
			expect(policy.diagnostics()).toEqual([expect.objectContaining({ level: "error" })]);
		}
	});

	it("keeps loopback closed against rebinding and can identify an SSH tunnel", () => {
		expect(isTrustedLoopbackWebRequest(request({ host: "127.0.0.1:3080" }))).toBe(true);
		expect(isTrustedLoopbackWebRequest(request({ host: "attacker.example" }))).toBe(false);
		const policy = createOwnerRequestPolicy({ loopbackAccessMode: "ssh-tunnel" });
		expect(policy.authorize(request({ host: "localhost:3080" }))).toEqual({
			authorized: true,
			accessMode: "ssh-tunnel",
		});
	});

	it("accepts a trusted HTTPS proxy only when every independent proof matches", () => {
		const policy = createOwnerRequestPolicy({ trustedProxy });
		expect(policy.authorize(request(proxyHeaders, "10.0.0.8", "PATCH"))).toEqual({
			authorized: true,
			accessMode: "trusted-https-proxy",
		});
		for (const key of ["host", "origin", "sec-fetch-site", OWNER_PROOF_HEADER, OWNER_CSRF_HEADER] as const) {
			const incomplete: Record<string, string> = { ...proxyHeaders };
			delete incomplete[key];
			expect(policy.authorize(request(incomplete, "10.0.0.8", "PATCH")).authorized).toBe(false);
		}
	});

	it("requires CSRF only for mutations and ignores spoofed forwarded headers", () => {
		const policy = createOwnerRequestPolicy({ trustedProxy });
		const readHeaders: Record<string, string> = { ...proxyHeaders };
		delete readHeaders[OWNER_CSRF_HEADER];
		expect(policy.authorize(request(readHeaders, "10.0.0.8", "GET")).authorized).toBe(true);
		expect(
			policy.authorize(
				request(
					{ ...proxyHeaders, "x-forwarded-for": "10.0.0.8", "x-forwarded-host": "dsh.example.test" },
					"192.0.2.24",
					"PATCH",
				),
			),
		).toEqual({ authorized: false, reason: "peer" });
	});

	it("never lets a same-host reverse proxy fall through to the loopback authorization branch", () => {
		const policy = createOwnerRequestPolicy({ trustedProxy: { ...trustedProxy, peers: ["127.0.0.1"] } });
		expect(policy.authorize(request({ host: "localhost:3080" }, "127.0.0.1", "GET"))).toEqual({
			authorized: false,
			reason: "origin",
		});
		expect(policy.authorize(request(proxyHeaders, "127.0.0.1", "PATCH"))).toEqual({
			authorized: true,
			accessMode: "trusted-https-proxy",
		});
	});

	it("fails closed for incomplete config, non-HTTPS origins, or reused proofs", () => {
		for (const config of [
			{ peers: trustedProxy.peers, origins: trustedProxy.origins, ownerProof: trustedProxy.ownerProof },
			{ ...trustedProxy, origins: ["http://dsh.example.test"] },
			{ ...trustedProxy, csrfToken: trustedProxy.ownerProof },
		]) {
			const policy = createOwnerRequestPolicy({ trustedProxy: config });
			expect(policy.authorize(request(proxyHeaders, "10.0.0.8", "PATCH"))).toEqual({
				authorized: false,
				reason: "incomplete-policy",
			});
			expect(policy.diagnostics().some((diagnostic) => diagnostic.level === "error")).toBe(true);
		}
	});
});
