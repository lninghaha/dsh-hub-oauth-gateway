import type { IncomingMessage } from "node:http";
import { describe, expect, it } from "vitest";
import {
	browserContextGuardDecision,
	hostNameOf,
	isLoopbackAddress,
	isLoopbackRequest,
	passesBrowserContextGuard,
	passesCsrfGuard,
} from "../../../src/server/api/security.js";

function request(
	headers: Record<string, string | undefined>,
	remoteAddress: string | undefined = "127.0.0.1",
): IncomingMessage {
	return { headers: { host: "localhost:3080", ...headers }, socket: { remoteAddress } } as unknown as IncomingMessage;
}

function proxiedRequest(
	headers: Record<string, string | undefined> = {},
	remoteAddress: string | undefined = "127.0.0.1",
): IncomingMessage {
	return request(
		{
			host: "127.0.0.1:3080",
			"x-forwarded-host": "dsh.example.com",
			"x-forwarded-proto": "https",
			"x-dsh-hub-oauth-gateway": "1",
			"x-dsh-hub-oauth-gateway-authority": "dsh.example.com",
			origin: "http://127.0.0.1:3080",
			referer: "https://dsh.example.com/app",
			"sec-fetch-site": "same-origin",
			...headers,
		},
		remoteAddress,
	);
}

describe("local API request guards", () => {
	it("parses bracketed IPv6 and rejects deceptive hosts", () => {
		expect(hostNameOf("[::1]:3080")).toBe("::1");
		expect(hostNameOf("localhost.evil:3080")).toBe("localhost.evil");
		expect(hostNameOf("[::1]oops")).toBeNull();
		expect(isLoopbackAddress("::ffff:127.0.0.1")).toBe(true);
		expect(isLoopbackAddress("127.0.0.999")).toBe(false);
	});

	it("requires both a loopback peer and loopback Host", () => {
		expect(isLoopbackRequest(request({ host: "localhost:3080" }))).toBe(true);
		expect(isLoopbackRequest(request({ host: "localhost:3080" }, "192.168.1.2"))).toBe(false);
		expect(isLoopbackRequest(request({ host: "example.com" }))).toBe(false);
	});

	it("requires a trusted browser context or the plugin request marker", () => {
		expect(passesBrowserContextGuard(request({ "sec-fetch-site": "same-origin" }))).toBe(true);
		expect(passesBrowserContextGuard(request({ "x-dsh-hub-oauth-gateway": "1" }))).toBe(true);
		expect(
			passesBrowserContextGuard(
				request({ "x-dsh-hub-oauth-gateway": "1", "x-dsh-hub-oauth-gateway-authority": "example.com" }),
			),
		).toBe(false);
		expect(passesBrowserContextGuard(request({}))).toBe(false);
		expect(passesBrowserContextGuard(request({ referer: "https://example.com/page" }))).toBe(false);
		expect(passesBrowserContextGuard(request({ referer: "http://localhost:3080/usage" }))).toBe(true);
		expect(passesBrowserContextGuard(request({ referer: "http://127.0.0.1:3080/usage" }))).toBe(false);
	});

	it("accepts a contradictory cross-site signal only with exact local corroboration", () => {
		const marked = { "sec-fetch-site": "cross-site", "x-dsh-hub-oauth-gateway": "1" };
		expect(passesBrowserContextGuard(request(marked))).toBe(false);
		expect(
			passesBrowserContextGuard(request({ ...marked, "x-dsh-hub-oauth-gateway-authority": "localhost:3080" })),
		).toBe(true);
		expect(
			passesBrowserContextGuard(request({ ...marked, "x-dsh-hub-oauth-gateway-authority": "127.0.0.1:3080" })),
		).toBe(false);
		expect(
			passesBrowserContextGuard(request({ ...marked, "x-dsh-hub-oauth-gateway-authority": "localhost:3081" })),
		).toBe(false);
		expect(
			passesBrowserContextGuard(
				request({ ...marked, "x-dsh-hub-oauth-gateway-authority": "localhost:3080,localhost:3080" }),
			),
		).toBe(false);
		const duplicateAuthority = request(marked);
		duplicateAuthority.headers["x-dsh-hub-oauth-gateway-authority"] = ["localhost:3080", "localhost:3080"];
		expect(passesBrowserContextGuard(duplicateAuthority)).toBe(false);
		expect(passesBrowserContextGuard(request({ ...marked, origin: "http://localhost:3080" }))).toBe(true);
		expect(passesBrowserContextGuard(request({ ...marked, referer: "http://localhost:3080/usage" }))).toBe(true);
		expect(passesBrowserContextGuard(request({ ...marked, origin: "http://127.0.0.1:3080" }))).toBe(false);
		expect(passesBrowserContextGuard(request({ ...marked, origin: "http://localhost:3081" }))).toBe(false);
		expect(passesBrowserContextGuard(request({ ...marked, origin: "https://example.com" }))).toBe(false);
		expect(
			passesBrowserContextGuard(
				request({
					...marked,
					origin: "https://example.com",
					"x-dsh-hub-oauth-gateway-authority": "localhost:3080",
				}),
			),
		).toBe(false);
		expect(
			passesBrowserContextGuard(
				request({
					...marked,
					origin: "http://localhost:3080",
					referer: "https://example.com/page",
					"x-dsh-hub-oauth-gateway-authority": "localhost:3080",
				}),
			),
		).toBe(false);
	});

	it("accepts an HTTPS browser origin forwarded by a trusted loopback proxy", () => {
		expect(passesBrowserContextGuard(proxiedRequest())).toBe(true);
		expect(
			passesBrowserContextGuard(
				proxiedRequest({
					origin: "https://dsh.example.com",
					referer: "https://dsh.example.com/app",
				}),
			),
		).toBe(true);
		expect(passesBrowserContextGuard(proxiedRequest({ "sec-fetch-site": "cross-site" }))).toBe(true);
		expect(passesBrowserContextGuard(proxiedRequest({ referer: "http://127.0.0.1:3080/app" }))).toBe(true);
		expect(
			passesBrowserContextGuard(
				proxiedRequest({
					"x-forwarded-host": "DSH.EXAMPLE.COM.:443",
					"x-dsh-hub-oauth-gateway-authority": "dsh.example.com",
				}),
			),
		).toBe(true);
		expect(
			passesBrowserContextGuard(
				proxiedRequest({
					"x-forwarded-host": "[2001:db8::1]:443",
					"x-dsh-hub-oauth-gateway-authority": "[2001:db8::1]",
					referer: "https://[2001:db8::1]/app",
				}),
			),
		).toBe(true);
		expect(
			passesCsrfGuard(
				proxiedRequest({
					"content-type": "application/json; charset=utf-8",
					origin: "http://127.0.0.1:3080",
					referer: "https://dsh.example.com/settings",
				}),
			),
		).toBe(true);
	});

	it("rejects inconsistent or untrusted forwarded browser authorities", () => {
		expect(browserContextGuardDecision(proxiedRequest({ "x-dsh-hub-oauth-gateway": undefined }))).toEqual({
			accepted: false,
			reason: "proxy-marker-missing",
		});
		expect(browserContextGuardDecision(proxiedRequest({ "x-dsh-hub-oauth-gateway-authority": undefined }))).toEqual({
			accepted: false,
			reason: "proxy-authority-missing",
		});
		expect(
			browserContextGuardDecision(proxiedRequest({ "x-dsh-hub-oauth-gateway-authority": "evil.example" })),
		).toEqual({
			accepted: false,
			reason: "authority-mismatch",
		});
		expect(browserContextGuardDecision(proxiedRequest({ referer: "https://evil.example/app" }))).toEqual({
			accepted: false,
			reason: "referer-non-loopback",
		});
		expect(browserContextGuardDecision(proxiedRequest({ origin: "null" }))).toEqual({
			accepted: false,
			reason: "origin-opaque",
		});
		expect(browserContextGuardDecision(proxiedRequest({ "x-forwarded-proto": undefined }))).toEqual({
			accepted: false,
			reason: "forwarded-proto-invalid",
		});
		expect(browserContextGuardDecision(proxiedRequest({ "x-forwarded-proto": "https,http" }))).toEqual({
			accepted: false,
			reason: "forwarded-proto-invalid",
		});
		expect(browserContextGuardDecision(proxiedRequest({ "x-forwarded-host": "dsh.example.com,evil.example" }))).toEqual(
			{
				accepted: false,
				reason: "forwarded-authority-invalid",
			},
		);
		for (const forwardedHost of ["user@dsh.example.com", "dsh.example.com/path", "dsh.example.com:bad"]) {
			expect(browserContextGuardDecision(proxiedRequest({ "x-forwarded-host": forwardedHost }))).toEqual({
				accepted: false,
				reason: "forwarded-authority-invalid",
			});
		}
		expect(browserContextGuardDecision(proxiedRequest({}, "192.0.2.10"))).toEqual({
			accepted: false,
			reason: "forwarded-authority-invalid",
		});
		const duplicateForwardedHost = proxiedRequest();
		duplicateForwardedHost.headers["x-forwarded-host"] = ["dsh.example.com", "evil.example"];
		expect(browserContextGuardDecision(duplicateForwardedHost)).toEqual({
			accepted: false,
			reason: "forwarded-authority-invalid",
		});
		const duplicateForwardedProto = proxiedRequest();
		duplicateForwardedProto.headers["x-forwarded-proto"] = ["https", "http"];
		expect(browserContextGuardDecision(duplicateForwardedProto)).toEqual({
			accepted: false,
			reason: "forwarded-proto-invalid",
		});
	});

	it("returns bounded rejection classifications without echoing browser headers", () => {
		const marked = { "sec-fetch-site": "cross-site", "x-dsh-hub-oauth-gateway": "1" };
		expect(browserContextGuardDecision(request({ ...marked, origin: "null" }))).toEqual({
			accepted: false,
			reason: "origin-opaque",
		});
		expect(browserContextGuardDecision(request({ ...marked, referer: "https://example.com/page" }))).toEqual({
			accepted: false,
			reason: "referer-non-loopback",
		});
		expect(
			browserContextGuardDecision(request({ ...marked, "x-dsh-hub-oauth-gateway-authority": "127.0.0.1:3080" })),
		).toEqual({ accepted: false, reason: "authority-mismatch" });
		expect(browserContextGuardDecision(request(marked))).toEqual({
			accepted: false,
			reason: "cross-site-corroboration-missing",
		});
		expect(browserContextGuardDecision(request({}))).toEqual({
			accepted: false,
			reason: "browser-context-missing",
		});
	});

	it("requires JSON, the custom header, and matching local context for writes", () => {
		const valid = {
			host: "localhost:3080",
			"content-type": "application/json; charset=utf-8",
			"x-dsh-hub-oauth-gateway": "1",
			origin: "http://localhost:3080",
			"sec-fetch-site": "same-origin",
		};
		expect(passesCsrfGuard(request(valid))).toBe(true);
		expect(passesCsrfGuard(request({ ...valid, "sec-fetch-site": "cross-site" }))).toBe(true);
		expect(passesCsrfGuard(request({ ...valid, origin: "https://example.com" }))).toBe(false);
		expect(passesCsrfGuard(request({ ...valid, origin: "http://127.0.0.1:3080" }))).toBe(false);
		expect(passesCsrfGuard(request({ ...valid, "sec-fetch-site": "cross-site", origin: undefined }))).toBe(false);
		expect(
			passesCsrfGuard(
				request({
					...valid,
					"sec-fetch-site": "cross-site",
					origin: undefined,
					"x-dsh-hub-oauth-gateway-authority": "localhost:3080",
				}),
			),
		).toBe(true);
		expect(
			passesCsrfGuard(
				request({
					...valid,
					"sec-fetch-site": "cross-site",
					origin: undefined,
					"x-dsh-hub-oauth-gateway-authority": "localhost:3081",
				}),
			),
		).toBe(false);
		expect(passesCsrfGuard(request({ ...valid, "x-dsh-hub-oauth-gateway": undefined }))).toBe(false);
	});
});
