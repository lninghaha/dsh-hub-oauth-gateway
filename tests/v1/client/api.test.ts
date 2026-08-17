import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { fetchApi, mutateApi, UsageStatsApiError } from "../../../src/client/api.js";

const meta = {
	schemaVersion: 1 as const,
	generatedAt: 1,
	sourceUpdatedAt: null,
	partial: false,
	stale: false,
	warnings: [],
};
const ValueSchema = z.object({ value: z.string() }).strict();

afterEach(() => vi.unstubAllGlobals());

describe("usage API client", () => {
	it("keeps requests root-relative and pins mandatory local security headers", async () => {
		const calls: Array<{ input: RequestInfo | URL; init: RequestInit | undefined }> = [];
		vi.stubGlobal("window", {
			location: { href: "http://localhost:3080/app", origin: "http://localhost:3080" },
		});
		vi.stubGlobal(
			"fetch",
			vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
				calls.push({ input, init });
				return new Response(JSON.stringify({ ok: true, data: { value: "ok" }, meta }), {
					status: 200,
					headers: { "content-type": "application/json" },
				});
			}),
		);

		await fetchApi("/api/usage-stats/v1/health", ValueSchema, {
			headers: { "x-dsh-hub-oauth-gateway": "0", "x-dsh-hub-oauth-gateway-authority": "example.com" },
		});
		await mutateApi("/api/usage-stats/v1/settings", "PUT", { value: "next" }, ValueSchema);

		expect(calls.map(({ input }) => input)).toEqual(["/api/usage-stats/v1/health", "/api/usage-stats/v1/settings"]);
		const readHeaders = new Headers(calls[0]?.init?.headers);
		expect(readHeaders.get("x-dsh-hub-oauth-gateway")).toBe("1");
		expect(readHeaders.get("x-dsh-hub-oauth-gateway-authority")).toBe("localhost:3080");
		expect(readHeaders.has("content-type")).toBe(false);
		const writeHeaders = new Headers(calls[1]?.init?.headers);
		expect(writeHeaders.get("x-dsh-hub-oauth-gateway")).toBe("1");
		expect(writeHeaders.get("x-dsh-hub-oauth-gateway-authority")).toBe("localhost:3080");
		expect(writeHeaders.get("content-type")).toBe("application/json");
		expect(calls[1]?.init?.body).toBe(JSON.stringify({ value: "next" }));
	});

	it("preserves structured API failure codes for localized recovery guidance", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(
				async () =>
					new Response(
						JSON.stringify({
							ok: false,
							error: {
								code: "cross-site-rejected",
								message: "request failed the local browser-context guard",
							},
							meta,
						}),
						{ status: 403, headers: { "content-type": "application/json" } },
					),
			),
		);

		const error = await fetchApi("/api/usage-stats/v1/health", ValueSchema).catch((value: unknown) => value);
		expect(error).toBeInstanceOf(UsageStatsApiError);
		expect(error).toMatchObject({ code: "cross-site-rejected", status: 403 });
	});
});
