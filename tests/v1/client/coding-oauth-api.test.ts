import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { callCodingOAuth } from "../../../src/client/coding-oauth-api.js";
import { CODING_OAUTH_PATHS } from "../../../src/shared/coding-oauth.js";

const OkSchema = z.object({ ok: z.literal(true) });

afterEach(() => vi.unstubAllGlobals());

describe("coding OAuth API client", () => {
	it("pins the Hub CSRF headers on GET and mutating coding-OAuth calls", async () => {
		const calls: Array<{ input: RequestInfo | URL; init: RequestInit | undefined }> = [];
		vi.stubGlobal("window", {
			location: { href: "http://localhost:3080/app", origin: "http://localhost:3080" },
		});
		vi.stubGlobal(
			"fetch",
			vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
				calls.push({ input, init });
				return new Response(JSON.stringify({ ok: true }), {
					status: 200,
					headers: { "content-type": "application/json" },
				});
			}),
		);

		await callCodingOAuth(CODING_OAUTH_PATHS.status, OkSchema);
		await callCodingOAuth(CODING_OAUTH_PATHS.gatewayReveal, OkSchema, {
			method: "POST",
			body: JSON.stringify({}),
		});

		expect(calls.map(({ input }) => input)).toEqual([CODING_OAUTH_PATHS.status, CODING_OAUTH_PATHS.gatewayReveal]);
		const readHeaders = new Headers(calls[0]?.init?.headers);
		expect(readHeaders.get("x-dsh-hub-oauth-gateway")).toBe("1");
		expect(readHeaders.get("x-dsh-hub-oauth-gateway-authority")).toBe("localhost:3080");
		expect(readHeaders.has("content-type")).toBe(false);
		const writeHeaders = new Headers(calls[1]?.init?.headers);
		expect(writeHeaders.get("x-dsh-hub-oauth-gateway")).toBe("1");
		expect(writeHeaders.get("x-dsh-hub-oauth-gateway-authority")).toBe("localhost:3080");
		expect(writeHeaders.get("content-type")).toBe("application/json");
	});
});
