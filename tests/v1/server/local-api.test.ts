import { EventEmitter } from "node:events";
import type { IncomingMessage, ServerResponse } from "node:http";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ExactWebServer, UsageStatsApiDependencies } from "../../../src/server/api/router.js";
import { registerV1Routes } from "../../../src/server/api/router.js";
import { FeesRepository } from "../../../src/server/fees/repository.js";
import { PricingRepository } from "../../../src/server/pricing/repository.js";
import { PreferencesRepository } from "../../../src/server/settings/repository.js";
import { UsageDatabase } from "../../../src/server/storage/database.js";
import { UsageQueryService } from "../../../src/server/usage/query.js";
import { UsageRepository } from "../../../src/server/usage/repository.js";
import { API_PATHS } from "../../../src/shared/contracts.js";

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

describe("local monitor API", () => {
	let database: UsageDatabase;
	let routes: Map<string, (request: IncomingMessage, response: ServerResponse) => void | Promise<void>>;
	const now = 1_700_000_000_000;

	const build = (
		localAuth?: UsageStatsApiDependencies["localAuth"],
		localUsage?: UsageStatsApiDependencies["localUsage"],
	): void => {
		const usage = new UsageRepository(database);
		const pricing = new PricingRepository(database);
		const preferences = new PreferencesRepository(database);
		const webServer: ExactWebServer = {
			register(route) {
				routes.set(route.path, route.handler);
				return () => routes.delete(route.path);
			},
		};
		const dependencies: UsageStatsApiDependencies = {
			logger: { warn: vi.fn() },
			projection: { synchronize: vi.fn(async () => ({})) },
			queries: new UsageQueryService(usage, pricing, "USD"),
			pricing,
			preferences,
			fees: new FeesRepository(database),
			accounts: { list: vi.fn(async () => []), get: vi.fn(async () => null), refresh: vi.fn(async () => []) },
			...(localAuth === undefined ? {} : { localAuth }),
			...(localUsage === undefined ? {} : { localUsage }),
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
	};

	beforeEach(async () => {
		database = await UsageDatabase.open(":memory:");
		routes = new Map();
	});

	afterEach(() => database.close());

	it("answers enabled:false documents when the features are not composed", async () => {
		build();
		const authResponse = new TestResponse();
		await routes.get(API_PATHS.localAuth)?.(
			request("GET", API_PATHS.localAuth).value,
			authResponse as unknown as ServerResponse,
		);
		expect(authResponse.status).toBe(200);
		expect(JSON.parse(authResponse.body)).toMatchObject({ ok: true, data: { enabled: false } });

		const usageResponse = new TestResponse();
		await routes.get(API_PATHS.localUsage)?.(
			request("GET", API_PATHS.localUsage).value,
			usageResponse as unknown as ServerResponse,
		);
		expect(JSON.parse(usageResponse.body)).toMatchObject({ ok: true, data: { enabled: false } });

		const scan = request("POST", API_PATHS.localUsageScan, {});
		const scanResponse = new TestResponse();
		const handler = routes.get(API_PATHS.localUsageScan);
		const pending = handler?.(scan.value, scanResponse as unknown as ServerResponse);
		scan.emitBody();
		await pending;
		expect(JSON.parse(scanResponse.body)).toMatchObject({ ok: true, data: { enabled: false } });
	});

	it("serves the auth snapshot and usage aggregates when composed", async () => {
		build(
			{
				snapshot: vi.fn(async () => ({
					generatedAt: now,
					cli: [
						{
							kind: "claude" as const,
							displayPath: "~/.claude/.credentials.json",
							state: "signed-in" as const,
							expiresAt: now + 3_600_000,
							hasRefreshToken: true,
							reason: null,
						},
					],
					sessions: [{ provider: "grok" as const, route: "grok-build", authenticated: true, expiresAt: null }],
				})),
			},
			{
				tools: () => [{ toolId: "claude-code", displayName: "Claude Code", available: true }],
				aggregate: vi.fn(() => [
					{
						day: "2023-11-14",
						toolId: "claude-code",
						modelId: "claude-sonnet-4",
						inputTokens: 10,
						outputTokens: 4,
						cacheReadTokens: 0,
						cacheWriteTokens: 0,
						requests: 1,
					},
				]),
				stats: () => ({ files: 1, lastScanAt: now - 60_000 }),
				scan: vi.fn(async () => ({ scannedAt: now, files: 1, events: 1, skipped: 0 })),
			},
		);

		const authResponse = new TestResponse();
		await routes.get(API_PATHS.localAuth)?.(
			request("GET", API_PATHS.localAuth).value,
			authResponse as unknown as ServerResponse,
		);
		const authPayload = JSON.parse(authResponse.body);
		expect(authPayload).toMatchObject({
			ok: true,
			data: {
				enabled: true,
				cli: [{ kind: "claude", state: "signed-in", hasRefreshToken: true }],
				sessions: [{ provider: "grok", route: "grok-build", authenticated: true }],
			},
		});
		// The wire document must not contain any credential material fields.
		expect(authResponse.body).not.toContain("accessToken");
		expect(authResponse.body).not.toContain("access");

		const usageResponse = new TestResponse();
		await routes.get(API_PATHS.localUsage)?.(
			request("GET", API_PATHS.localUsage).value,
			usageResponse as unknown as ServerResponse,
		);
		expect(JSON.parse(usageResponse.body)).toMatchObject({
			ok: true,
			data: {
				enabled: true,
				scannedFiles: 1,
				rows: [{ toolId: "claude-code", modelId: "claude-sonnet-4", inputTokens: 10 }],
			},
		});

		const scan = request("POST", API_PATHS.localUsageScan, {});
		const scanResponse = new TestResponse();
		const pending = routes.get(API_PATHS.localUsageScan)?.(scan.value, scanResponse as unknown as ServerResponse);
		scan.emitBody();
		await pending;
		expect(JSON.parse(scanResponse.body)).toMatchObject({
			ok: true,
			data: { enabled: true, files: 1, events: 1 },
		});
	});

	it("rejects non-loopback callers and cross-site browser contexts on local routes", async () => {
		build();
		const foreign = request("GET", API_PATHS.localAuth, undefined, "example.com", "192.0.2.10");
		const denied = new TestResponse();
		await routes.get(API_PATHS.localAuth)?.(foreign.value, denied as unknown as ServerResponse);
		expect(denied.status).toBe(403);

		const crossSite = request("GET", API_PATHS.localUsage);
		crossSite.value.headers["sec-fetch-site"] = "cross-site";
		const crossSiteDenied = new TestResponse();
		await routes.get(API_PATHS.localUsage)?.(crossSite.value, crossSiteDenied as unknown as ServerResponse);
		expect(crossSiteDenied.status).toBe(403);

		const noCsrf = request("POST", API_PATHS.localUsageScan, {});
		delete noCsrf.value.headers["x-dsh-hub-oauth-gateway"];
		const csrfDenied = new TestResponse();
		const pending = routes.get(API_PATHS.localUsageScan)?.(noCsrf.value, csrfDenied as unknown as ServerResponse);
		noCsrf.emitBody();
		await pending;
		expect(csrfDenied.status).toBe(403);
	});

	it("validates the usage day range", async () => {
		build(undefined, {
			tools: () => [],
			aggregate: vi.fn(() => []),
			stats: () => ({ files: 0, lastScanAt: null }),
			scan: vi.fn(async () => ({ scannedAt: now, files: 0, events: 0, skipped: 0 })),
		});
		const bad = request("GET", `${API_PATHS.localUsage}?from=2026-13-99`);
		const response = new TestResponse();
		await routes.get(API_PATHS.localUsage)?.(bad.value, response as unknown as ServerResponse);
		expect(response.status).toBe(400);

		const inverted = request("GET", `${API_PATHS.localUsage}?from=2026-08-10&to=2026-08-01`);
		const invertedResponse = new TestResponse();
		await routes.get(API_PATHS.localUsage)?.(inverted.value, invertedResponse as unknown as ServerResponse);
		expect(invertedResponse.status).toBe(400);
	});
});
