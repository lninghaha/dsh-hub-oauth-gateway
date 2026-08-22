import { EventEmitter } from "node:events";
import type { IncomingMessage, ServerResponse } from "node:http";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ExactWebServer, UsageStatsApiDependencies } from "../../../src/server/api/router.js";
import { registerV1Routes } from "../../../src/server/api/router.js";
import {
	createOwnerRequestPolicy,
	OWNER_CSRF_HEADER,
	OWNER_PROOF_HEADER,
} from "../../../src/server/coding-oauth/web-origin.js";
import { FeesRepository } from "../../../src/server/fees/repository.js";
import { PricingRepository } from "../../../src/server/pricing/repository.js";
import { PreferencesRepository } from "../../../src/server/settings/repository.js";
import { UsageDatabase } from "../../../src/server/storage/database.js";
import { emptySessionCursor } from "../../../src/server/usage/projector.js";
import { UsageQueryService } from "../../../src/server/usage/query.js";
import { UsageRepository } from "../../../src/server/usage/repository.js";
import { CODING_OAUTH_CORE_ABI } from "../../../src/shared/compatibility.js";
import { API_PATHS } from "../../../src/shared/contracts.js";
import { defaultUserPreferences } from "../../../src/shared/preferences.js";

class TestResponse {
	status = 0;
	body = "";
	headers = new Map<string, string>();

	setHeader(name: string, value: string | number | readonly string[]) {
		this.headers.set(name.toLowerCase(), Array.isArray(value) ? value.join(", ") : String(value));
	}

	writeHead(status: number, headers?: Record<string, string>) {
		this.status = status;
		for (const [name, value] of Object.entries(headers ?? {})) this.headers.set(name.toLowerCase(), value);
		return this;
	}

	end(body = "") {
		this.body += String(body);
		return this;
	}
}

function request(method: string, url: string, body?: unknown, host = "localhost:3080", remoteAddress = "127.0.0.1") {
	const emitter = new EventEmitter() as EventEmitter & {
		method: string;
		url: string;
		headers: Record<string, string>;
		socket: { remoteAddress: string };
		destroy: ReturnType<typeof vi.fn>;
	};
	emitter.method = method;
	emitter.url = url;
	emitter.headers = {
		host,
		"x-dsh-hub-oauth-gateway": "1",
		...(method === "GET" ? {} : { "content-type": "application/json" }),
	};
	emitter.socket = { remoteAddress };
	emitter.destroy = vi.fn();
	const raw = body === undefined ? undefined : JSON.stringify(body);
	return {
		value: emitter as unknown as IncomingMessage,
		emitBody() {
			if (raw !== undefined) emitter.emit("data", Buffer.from(raw));
			emitter.emit("end");
		},
	};
}

describe("v1 API router", () => {
	let database: UsageDatabase;
	let routes: Map<string, (request: IncomingMessage, response: ServerResponse) => void | Promise<void>>;
	let dependencies: UsageStatsApiDependencies;
	const now = 1_700_000_000_000;

	beforeEach(async () => {
		database = await UsageDatabase.open(":memory:");
		const usage = new UsageRepository(database);
		const pricing = new PricingRepository(database);
		const preferences = new PreferencesRepository(database);
		const queryService = new UsageQueryService(usage, pricing, "USD");
		usage.applyProjection({
			cursor: { ...emptySessionCursor("secret-session-id", "persisted", "rev", now), nextSeq: 1 },
			facts: [
				{
					sessionId: "secret-session-id",
					turn: 0,
					step: 0,
					eventSeq: 0,
					occurredAt: now - 1_000,
					providerId: "=provider-a",
					modelId: "model-a",
					inputTokens: 100,
					outputTokens: 20,
					cacheReadTokens: 30,
					cacheWriteTokens: 0,
				},
			],
		});
		routes = new Map();
		const webServer: ExactWebServer = {
			register(route) {
				routes.set(route.path, route.handler);
				return () => routes.delete(route.path);
			},
		};
		dependencies = {
			logger: { warn: vi.fn() },
			projection: { synchronize: vi.fn(async () => ({ changedSessions: 1 })) },
			queries: queryService,
			pricing,
			preferences,
			fees: new FeesRepository(database),
			accounts: {
				list: vi.fn(async () => []),
				get: vi.fn(async () => null),
				refresh: vi.fn(async () => []),
			},
			freshness: () => ({
				usageUpdatedAt: now,
				accountsUpdatedAt: null,
				usageState: "fresh",
				partial: false,
				warnings: [],
			}),
			now: () => now,
		};
		registerV1Routes(webServer, dependencies);
	});

	afterEach(() => database.close());

	it("returns versioned overview data and rejects non-loopback callers", async () => {
		const local = request("GET", API_PATHS.overview);
		const response = new TestResponse();
		await routes.get(API_PATHS.overview)?.(local.value, response as unknown as ServerResponse);
		expect(response.status).toBe(200);
		const payload = JSON.parse(response.body) as {
			ok: boolean;
			data: { requests: number };
			meta: { schemaVersion: number };
		};
		expect(payload).toMatchObject({ ok: true, data: { requests: 1 }, meta: { schemaVersion: 1 } });
		expect(dependencies.projection.synchronize).not.toHaveBeenCalled();

		const crossSite = request("GET", API_PATHS.overview);
		crossSite.value.headers["sec-fetch-site"] = "cross-site";
		const crossSiteDenied = new TestResponse();
		await routes.get(API_PATHS.overview)?.(crossSite.value, crossSiteDenied as unknown as ServerResponse);
		expect(crossSiteDenied.status).toBe(403);
		expect(JSON.parse(crossSiteDenied.body)).toMatchObject({
			error: { code: "cross-site-rejected", details: { reason: "fetch-metadata" } },
		});

		const misclassified = request("GET", API_PATHS.overview);
		misclassified.value.headers["sec-fetch-site"] = "cross-site";
		misclassified.value.headers.referer = "http://localhost:3080/";
		const accepted = new TestResponse();
		await routes.get(API_PATHS.overview)?.(misclassified.value, accepted as unknown as ServerResponse);
		expect(accepted.status).toBe(403);

		const embedded = request("GET", API_PATHS.overview);
		embedded.value.headers["sec-fetch-site"] = "cross-site";
		embedded.value.headers["x-dsh-hub-oauth-gateway-authority"] = "localhost:3080";
		const corroborated = new TestResponse();
		await routes.get(API_PATHS.overview)?.(embedded.value, corroborated as unknown as ServerResponse);
		expect(corroborated.status).toBe(403);

		const proxied = request("GET", API_PATHS.overview);
		proxied.value.headers.host = "127.0.0.1:3080";
		proxied.value.headers["x-forwarded-host"] = "dsh.example.com";
		proxied.value.headers["x-forwarded-proto"] = "https";
		proxied.value.headers.origin = "http://127.0.0.1:3080";
		proxied.value.headers.referer = "https://dsh.example.com/app";
		proxied.value.headers["sec-fetch-site"] = "same-origin";
		proxied.value.headers["x-dsh-hub-oauth-gateway-authority"] = "dsh.example.com";
		const proxiedResponse = new TestResponse();
		await routes.get(API_PATHS.overview)?.(proxied.value, proxiedResponse as unknown as ServerResponse);
		expect(proxiedResponse.status).toBe(200);

		const foreign = request("GET", API_PATHS.overview, undefined, "example.com", "192.0.2.10");
		const denied = new TestResponse();
		await routes.get(API_PATHS.overview)?.(foreign.value, denied as unknown as ServerResponse);
		expect(denied.status).toBe(403);
	});

	it("uses the strict owner policy for trusted HTTPS proxy reads and mutations", async () => {
		(dependencies as { ownerRequestPolicy?: UsageStatsApiDependencies["ownerRequestPolicy"] }).ownerRequestPolicy =
			createOwnerRequestPolicy({
				trustedProxy: {
					peers: ["10.0.0.8"],
					origins: ["https://dsh.example.test"],
					ownerProof: "owner-proof-secret",
					csrfToken: "csrf-proof-secret",
				},
			});
		const secureHeaders = {
			origin: "https://dsh.example.test",
			"sec-fetch-site": "same-origin",
			[OWNER_PROOF_HEADER]: "owner-proof-secret",
		};
		const proxied = request("GET", API_PATHS.overview, undefined, "dsh.example.test", "10.0.0.8");
		Object.assign(proxied.value.headers, secureHeaders);
		const proxiedResponse = new TestResponse();
		await routes.get(API_PATHS.overview)?.(proxied.value, proxiedResponse as unknown as ServerResponse);
		expect(proxiedResponse.status).toBe(200);

		const compatibility = vi.fn(
			(accessMode: Parameters<NonNullable<UsageStatsApiDependencies["compatibility"]>>[0]) => ({
				coreAbi: CODING_OAUTH_CORE_ABI,
				dshVersion: "0.1.0-rc.6",
				status: "healthy" as const,
				uiOwner: "hub" as const,
				accessMode,
				capabilities: { webServer: { state: "available" as const } },
				diagnostics: [],
			}),
		);
		(dependencies as { compatibility?: UsageStatsApiDependencies["compatibility"] }).compatibility = compatibility;
		const compatibilityRequest = request("GET", API_PATHS.compatibility, undefined, "dsh.example.test", "10.0.0.8");
		Object.assign(compatibilityRequest.value.headers, secureHeaders);
		const compatibilityResponse = new TestResponse();
		await routes.get(API_PATHS.compatibility)?.(
			compatibilityRequest.value,
			compatibilityResponse as unknown as ServerResponse,
		);
		expect(compatibility).toHaveBeenCalledWith("trusted-https-proxy");
		expect(JSON.parse(compatibilityResponse.body).data.accessMode).toBe("trusted-https-proxy");

		const spoofed = request("GET", API_PATHS.overview, undefined, "dsh.example.test", "192.0.2.24");
		Object.assign(spoofed.value.headers, secureHeaders, { "x-forwarded-for": "10.0.0.8" });
		const spoofedResponse = new TestResponse();
		await routes.get(API_PATHS.overview)?.(spoofed.value, spoofedResponse as unknown as ServerResponse);
		expect(spoofedResponse.status).toBe(403);

		const preferences = defaultUserPreferences("UTC");
		const missingCsrf = request("PUT", API_PATHS.settings, preferences, "dsh.example.test", "10.0.0.8");
		Object.assign(missingCsrf.value.headers, secureHeaders);
		const missingCsrfResponse = new TestResponse();
		const denied = routes.get(API_PATHS.settings)?.(
			missingCsrf.value,
			missingCsrfResponse as unknown as ServerResponse,
		);
		missingCsrf.emitBody();
		await denied;
		expect(missingCsrfResponse.status).toBe(403);

		const authorized = request("PUT", API_PATHS.settings, preferences, "dsh.example.test", "10.0.0.8");
		Object.assign(authorized.value.headers, secureHeaders, { [OWNER_CSRF_HEADER]: "csrf-proof-secret" });
		const authorizedResponse = new TestResponse();
		const saved = routes.get(API_PATHS.settings)?.(authorized.value, authorizedResponse as unknown as ServerResponse);
		authorized.emitBody();
		await saved;
		expect(authorizedResponse.status).toBe(200);
	});

	it("reports usage freshness independently from account refreshes and warning text", async () => {
		(dependencies as unknown as { freshness: UsageStatsApiDependencies["freshness"] }).freshness = () => ({
			usageUpdatedAt: null,
			accountsUpdatedAt: now,
			usageState: "not-collected",
			partial: false,
			warnings: [],
		});
		const notCollected = request("GET", API_PATHS.overview);
		const notCollectedResponse = new TestResponse();
		await routes.get(API_PATHS.overview)?.(notCollected.value, notCollectedResponse as unknown as ServerResponse);
		expect(JSON.parse(notCollectedResponse.body).meta).toMatchObject({
			sourceUpdatedAt: now,
			usageUpdatedAt: null,
			accountsUpdatedAt: now,
			usageState: "not-collected",
			stale: false,
		});

		(dependencies as unknown as { freshness: UsageStatsApiDependencies["freshness"] }).freshness = () => ({
			usageUpdatedAt: now - 1_000,
			accountsUpdatedAt: now,
			usageState: "stale",
			partial: true,
			warnings: ["projection failed; last successful result retained"],
		});
		const stale = request("GET", API_PATHS.overview);
		const staleResponse = new TestResponse();
		await routes.get(API_PATHS.overview)?.(stale.value, staleResponse as unknown as ServerResponse);
		expect(JSON.parse(staleResponse.body).meta).toMatchObject({
			usageUpdatedAt: now - 1_000,
			usageState: "stale",
			stale: true,
		});
	});

	it("rejects foreign browser preflight without returning permissive CORS headers", async () => {
		const preflight = request("OPTIONS", API_PATHS.overview);
		delete preflight.value.headers["x-dsh-hub-oauth-gateway"];
		preflight.value.headers.origin = "https://example.com";
		preflight.value.headers["sec-fetch-site"] = "cross-site";
		preflight.value.headers["access-control-request-method"] = "GET";
		preflight.value.headers["access-control-request-headers"] =
			"x-dsh-hub-oauth-gateway, x-dsh-hub-oauth-gateway-authority, content-type";
		const response = new TestResponse();
		await routes.get(API_PATHS.overview)?.(preflight.value, response as unknown as ServerResponse);
		expect(response.status).toBe(403);
		expect(response.headers.has("access-control-allow-origin")).toBe(false);
		expect(response.headers.has("access-control-allow-headers")).toBe(false);

		const proxiedPreflight = request("OPTIONS", API_PATHS.overview);
		delete proxiedPreflight.value.headers["x-dsh-hub-oauth-gateway"];
		proxiedPreflight.value.headers.host = "127.0.0.1:3080";
		proxiedPreflight.value.headers["x-forwarded-host"] = "dsh.example.com";
		proxiedPreflight.value.headers["x-forwarded-proto"] = "https";
		proxiedPreflight.value.headers.origin = "http://127.0.0.1:3080";
		proxiedPreflight.value.headers.referer = "https://dsh.example.com/";
		proxiedPreflight.value.headers["sec-fetch-site"] = "same-origin";
		proxiedPreflight.value.headers["access-control-request-method"] = "GET";
		proxiedPreflight.value.headers["access-control-request-headers"] =
			"x-dsh-hub-oauth-gateway, x-dsh-hub-oauth-gateway-authority";
		const proxiedResponse = new TestResponse();
		await routes.get(API_PATHS.overview)?.(proxiedPreflight.value, proxiedResponse as unknown as ServerResponse);
		// Forwarded headers are ignored; this remains a local same-origin request
		// and reaches the route's method gate without receiving CORS permission.
		expect(proxiedResponse.status).toBe(405);
		expect(proxiedResponse.headers.has("access-control-allow-origin")).toBe(false);
		expect(proxiedResponse.headers.has("access-control-allow-headers")).toBe(false);
	});

	it("updates preferences only through the JSON + custom-header CSRF seam", async () => {
		const preferences = {
			...defaultUserPreferences("UTC"),
			display: { ...defaultUserPreferences("UTC").display, preset: "cost" as const },
		};
		const local = request("PUT", API_PATHS.settings, preferences);
		const response = new TestResponse();
		const handled = routes.get(API_PATHS.settings)?.(local.value, response as unknown as ServerResponse);
		local.emitBody();
		await handled;
		expect(response.status).toBe(200);
		expect(dependencies.preferences.load().display.preset).toBe("cost");

		const misclassified = request("PUT", API_PATHS.settings, preferences);
		misclassified.value.headers.origin = "http://localhost:3080";
		misclassified.value.headers["sec-fetch-site"] = "cross-site";
		const accepted = new TestResponse();
		const acceptedHandle = routes.get(API_PATHS.settings)?.(misclassified.value, accepted as unknown as ServerResponse);
		misclassified.emitBody();
		await acceptedHandle;
		expect(accepted.status).toBe(403);

		const embedded = request("PUT", API_PATHS.settings, preferences);
		embedded.value.headers["sec-fetch-site"] = "cross-site";
		embedded.value.headers["x-dsh-hub-oauth-gateway-authority"] = "localhost:3080";
		const corroborated = new TestResponse();
		const corroboratedHandle = routes.get(API_PATHS.settings)?.(
			embedded.value,
			corroborated as unknown as ServerResponse,
		);
		embedded.emitBody();
		await corroboratedHandle;
		expect(corroborated.status).toBe(403);

		const proxied = request("PUT", API_PATHS.settings, preferences);
		proxied.value.headers.host = "127.0.0.1:3080";
		proxied.value.headers["x-forwarded-host"] = "dsh.example.com";
		proxied.value.headers["x-forwarded-proto"] = "https";
		proxied.value.headers.origin = "http://127.0.0.1:3080";
		proxied.value.headers.referer = "https://dsh.example.com/settings";
		proxied.value.headers["sec-fetch-site"] = "same-origin";
		proxied.value.headers["x-dsh-hub-oauth-gateway-authority"] = "dsh.example.com";
		const proxiedResponse = new TestResponse();
		const proxiedHandle = routes.get(API_PATHS.settings)?.(proxied.value, proxiedResponse as unknown as ServerResponse);
		proxied.emitBody();
		await proxiedHandle;
		expect(proxiedResponse.status).toBe(200);

		const rejected = request("PUT", API_PATHS.settings, preferences);
		rejected.value.headers["x-dsh-hub-oauth-gateway"] = "0";
		const denied = new TestResponse();
		await routes.get(API_PATHS.settings)?.(rejected.value, denied as unknown as ServerResponse);
		expect(denied.status).toBe(403);
	});

	it("rejects malformed currency labels before mutating pricing", async () => {
		const local = request("PUT", API_PATHS.pricing, { baseCurrency: "US dollars", rules: [] });
		const response = new TestResponse();
		const handled = routes.get(API_PATHS.pricing)?.(local.value, response as unknown as ServerResponse);
		local.emitBody();
		await handled;
		expect(response.status).toBe(400);
		expect(dependencies.pricing.list()).toEqual([]);
	});

	it("anonymizes session keys unless identifiers are explicitly enabled", async () => {
		const local = request("GET", `${API_PATHS.breakdown}?dimension=session`);
		const response = new TestResponse();
		await routes.get(API_PATHS.breakdown)?.(local.value, response as unknown as ServerResponse);
		expect(response.status).toBe(200);
		expect(response.body).not.toContain("secret-session-id");
		expect(response.body).toContain("session-1");
	});

	it("exports the current filtered breakdown as CSV", async () => {
		const local = request("GET", `${API_PATHS.export}?format=csv&dimension=provider`);
		const response = new TestResponse();
		await routes.get(API_PATHS.export)?.(local.value, response as unknown as ServerResponse);
		expect(response.status).toBe(200);
		expect(response.headers.get("content-type")).toContain("text/csv");
		expect(response.body).toContain("'=provider-a");
	});

	it("defaults export layout to filtered and supports daily CSV plus bundle JSON", async () => {
		const filtered = new TestResponse();
		await routes.get(API_PATHS.export)?.(
			request("GET", `${API_PATHS.export}?format=csv&dimension=provider`).value,
			filtered as unknown as ServerResponse,
		);
		expect(filtered.status).toBe(200);
		expect(filtered.body).toContain("dimension");

		const daily = new TestResponse();
		await routes.get(API_PATHS.export)?.(
			request("GET", `${API_PATHS.export}?format=csv&layout=daily&dimension=provider`).value,
			daily as unknown as ServerResponse,
		);
		expect(daily.status).toBe(200);
		expect(daily.body).toContain("date,provider");
		expect(daily.body).toContain("'=provider-a");

		const bundle = new TestResponse();
		await routes.get(API_PATHS.export)?.(
			request("GET", `${API_PATHS.export}?format=json&layout=bundle&dimension=provider`).value,
			bundle as unknown as ServerResponse,
		);
		expect(bundle.status).toBe(200);
		const payload = JSON.parse(bundle.body) as {
			ok: boolean;
			data: { snapshot: { rows: unknown[] }; daily: Array<{ provider: string }> };
		};
		expect(payload.ok).toBe(true);
		expect(payload.data.snapshot.rows.length).toBeGreaterThan(0);
		expect(payload.data.daily[0]?.provider).toBe("=provider-a");
	});

	it("reads activity without refreshing upstream projections", async () => {
		const local = request("GET", `${API_PATHS.activity}?metric=tokens`);
		const response = new TestResponse();
		await routes.get(API_PATHS.activity)?.(local.value, response as unknown as ServerResponse);
		expect(response.status).toBe(200);
		expect(dependencies.projection.synchronize).not.toHaveBeenCalled();
		const payload = JSON.parse(response.body) as { ok: boolean; data: { days: unknown[]; streak: number } };
		expect(payload.ok).toBe(true);
		expect(payload.data.days).toHaveLength(370);
	});

	it("rejects fees mutations without the plugin marker and replaces the ledger with CSRF", async () => {
		const fees = {
			fees: [
				{
					id: "fee-1",
					providerId: "provider-a",
					accountLabel: null,
					kind: "subscription" as const,
					planName: "Pro",
					amount: 20,
					currency: "USD",
					interval: "month" as const,
					anchorDate: null,
					nextRenewalDate: "2024-04-01",
					topups: [],
					notes: null,
					updatedAt: now,
				},
			],
		};
		const denied = new TestResponse();
		const rejected = request("PUT", API_PATHS.fees, fees);
		rejected.value.headers["x-dsh-hub-oauth-gateway"] = "0";
		const deniedHandle = routes.get(API_PATHS.fees)?.(rejected.value, denied as unknown as ServerResponse);
		rejected.emitBody();
		await deniedHandle;
		expect(denied.status).toBe(403);

		const saved = new TestResponse();
		const write = request("PUT", API_PATHS.fees, fees);
		const writeHandle = routes.get(API_PATHS.fees)?.(write.value, saved as unknown as ServerResponse);
		write.emitBody();
		await writeHandle;
		expect(saved.status).toBe(200);
		expect(dependencies.fees?.list()).toHaveLength(1);

		const exported = new TestResponse();
		await routes.get(API_PATHS.export)?.(
			request("GET", `${API_PATHS.export}?format=csv&dimension=provider`).value,
			exported as unknown as ServerResponse,
		);
		expect(exported.body).not.toContain("fee-1");
		expect(exported.body).not.toContain("Pro");
	});
});
