import { EventEmitter } from "node:events";
import type { IncomingMessage, ServerResponse } from "node:http";
import { describe, expect, it, vi } from "vitest";
import { registerCredentialRoutes } from "../../../src/server/api/credentials.js";
import type { ExactWebServer } from "../../../src/server/api/router.js";
import {
	createOwnerRequestPolicy,
	OWNER_CSRF_HEADER,
	OWNER_PROOF_HEADER,
} from "../../../src/server/coding-oauth/web-origin.js";
import { API_PATHS } from "../../../src/shared/contracts.js";

class TestResponse {
	status = 0;
	body = "";
	setHeader() {}
	writeHead(status: number) {
		this.status = status;
		return this;
	}
	end(body = "") {
		this.body += String(body);
		return this;
	}
}

function request(
	method: string,
	url: string,
	body?: unknown,
	options: { headers?: Record<string, string>; remoteAddress?: string } = {},
) {
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
		host: "localhost:3080",
		"x-dsh-hub-oauth-gateway": "1",
		...(method === "GET" ? {} : { "content-type": "application/json" }),
		...options.headers,
	};
	emitter.socket = { remoteAddress: options.remoteAddress ?? "127.0.0.1" };
	emitter.destroy = vi.fn();
	return {
		request: emitter as unknown as IncomingMessage,
		emit() {
			if (body !== undefined) emitter.emit("data", Buffer.from(JSON.stringify(body)));
			emitter.emit("end");
		},
	};
}

describe("credential API", () => {
	it("requires trusted peer, exact HTTPS origin, owner proof, Fetch Metadata, and CSRF for remote writes", async () => {
		const routes = new Map<string, (request: IncomingMessage, response: ServerResponse) => void | Promise<void>>();
		const secrets = new Map<string, string>();
		const ownerRequestPolicy = createOwnerRequestPolicy({
			trustedProxy: {
				peers: ["10.0.0.8"],
				origins: ["https://dsh.example.test"],
				ownerProof: "owner-proof-secret",
				csrfToken: "csrf-proof-secret",
			},
		});
		registerCredentialRoutes(
			{
				register(route) {
					routes.set(route.path, route.handler);
					return () => routes.delete(route.path);
				},
			},
			{
				logger: { warn: vi.fn() },
				accounts: { refresh: vi.fn(async () => []), credentialRefs: async () => new Set(["TEST_TOKEN"]) },
				credentials: {
					resolve: async (ref) => (secrets.has(ref) ? { value: secrets.get(ref) ?? "" } : undefined),
					set: async (ref, value) => void secrets.set(ref, value),
					unset: async (ref) => void secrets.delete(ref),
					describe: async (ref) => ({ configured: secrets.has(ref), writable: true }),
				},
				ownerRequestPolicy,
			},
		);
		const trustedHeaders = {
			host: "dsh.example.test",
			origin: "https://dsh.example.test",
			"sec-fetch-site": "same-origin",
			[OWNER_PROOF_HEADER]: "owner-proof-secret",
			[OWNER_CSRF_HEADER]: "csrf-proof-secret",
		};
		const invoke = async (
			method: string,
			body: unknown,
			headers: Record<string, string>,
			remoteAddress = "10.0.0.8",
		) => {
			const url = method === "DELETE" ? `${API_PATHS.credentials}?ref=TEST_TOKEN` : API_PATHS.credentials;
			const call = request(method, url, body, { headers, remoteAddress });
			const response = new TestResponse();
			const pending = routes.get(API_PATHS.credentials)?.(call.request, response as unknown as ServerResponse);
			call.emit();
			await pending;
			return response;
		};

		expect((await invoke("PUT", { ref: "TEST_TOKEN", value: "first" }, trustedHeaders)).status).toBe(200);
		expect((await invoke("PUT", { ref: "TEST_TOKEN", value: "second" }, trustedHeaders)).status).toBe(200);
		expect(secrets.get("TEST_TOKEN")).toBe("second");

		const missingProof: Record<string, string> = { ...trustedHeaders };
		delete missingProof[OWNER_PROOF_HEADER];
		expect((await invoke("PUT", { ref: "TEST_TOKEN", value: "blocked" }, missingProof)).status).toBe(403);
		const missingCsrf: Record<string, string> = { ...trustedHeaders };
		delete missingCsrf[OWNER_CSRF_HEADER];
		expect((await invoke("PUT", { ref: "TEST_TOKEN", value: "blocked" }, missingCsrf)).status).toBe(403);
		expect(
			(
				await invoke(
					"PUT",
					{ ref: "TEST_TOKEN", value: "blocked" },
					{ ...trustedHeaders, "sec-fetch-site": "cross-site" },
				)
			).status,
		).toBe(403);
		expect(
			(
				await invoke(
					"PUT",
					{ ref: "TEST_TOKEN", value: "blocked" },
					{ ...trustedHeaders, "x-forwarded-for": "10.0.0.8" },
					"192.0.2.24",
				)
			).status,
		).toBe(403);
		expect(secrets.get("TEST_TOKEN")).toBe("second");

		const deleted = await invoke("DELETE", undefined, trustedHeaders);
		expect(deleted.status).toBe(200);
		expect(secrets.has("TEST_TOKEN")).toBe(false);
	});

	it("stores and describes refs without returning secret values", async () => {
		const routes = new Map<string, (request: IncomingMessage, response: ServerResponse) => void | Promise<void>>();
		const secrets = new Map<string, string>();
		const webServer: ExactWebServer = {
			register(route) {
				routes.set(route.path, route.handler);
				return () => routes.delete(route.path);
			},
		};
		const refresh = vi.fn(async () => []);
		registerCredentialRoutes(webServer, {
			logger: { warn: vi.fn() },
			accounts: { refresh, credentialRefs: async () => new Set(["TEST_TOKEN"]) },
			credentials: {
				resolve: async (ref) => (secrets.has(ref) ? { value: secrets.get(ref) ?? "" } : undefined),
				set: async (ref, value) => void secrets.set(ref, value),
				unset: async (ref) => void secrets.delete(ref),
				describe: async (ref) => ({ configured: secrets.has(ref), source: "store", writable: true }),
			},
		});

		const mutation = request("PUT", API_PATHS.credentials, { ref: "TEST_TOKEN", value: "super-secret" });
		const written = new TestResponse();
		const handling = routes.get(API_PATHS.credentials)?.(mutation.request, written as unknown as ServerResponse);
		mutation.emit();
		await handling;
		expect(written.status).toBe(200);
		expect(written.body).not.toContain("super-secret");
		expect(secrets.get("TEST_TOKEN")).toBe("super-secret");
		expect(refresh).toHaveBeenCalledOnce();

		const lookup = request("GET", `${API_PATHS.credentials}?ref=TEST_TOKEN`);
		const described = new TestResponse();
		await routes.get(API_PATHS.credentials)?.(lookup.request, described as unknown as ServerResponse);
		expect(JSON.parse(described.body)).toMatchObject({
			ok: true,
			data: { ref: "TEST_TOKEN", configured: true, source: "store", writable: true },
		});

		const unknown = request("PUT", API_PATHS.credentials, { ref: "UNRELATED_SHARED_SECRET", value: "blocked" });
		const rejected = new TestResponse();
		const rejecting = routes.get(API_PATHS.credentials)?.(unknown.request, rejected as unknown as ServerResponse);
		unknown.emit();
		await rejecting;
		expect(rejected.status).toBe(403);
		expect(secrets.has("UNRELATED_SHARED_SECRET")).toBe(false);
	});

	it("keeps OAuth device codes server-side and binds polling to an expiring flow", async () => {
		vi.useFakeTimers();
		vi.setSystemTime(1_000);
		try {
			const routes = new Map<string, (request: IncomingMessage, response: ServerResponse) => void | Promise<void>>();
			const stored = new Map<string, string>();
			let upstreamCall = 0;
			registerCredentialRoutes(
				{
					register(route) {
						routes.set(route.path, route.handler);
						return () => routes.delete(route.path);
					},
				},
				{
					logger: { warn: vi.fn() },
					accounts: { refresh: vi.fn(async () => []), credentialRefs: async () => new Set<string>() },
					credentials: {
						resolve: vi.fn(async () => undefined),
						set: async (ref, value) => void stored.set(ref, value),
					},
					accountDeps: {
						oauthClientIds: { copilot: "public-client-id" },
						lookup: vi.fn(async () => [{ address: "8.8.8.8", family: 4 }]),
						fetch: vi.fn(async () => {
							const payload =
								upstreamCall++ === 0
									? {
											device_code: "server-only-device-code",
											user_code: "ABCD-EFGH",
											verification_uri: "https://github.com/login/device",
											expires_in: 900,
											interval: 5,
										}
									: { access_token: "server-only-access-token" };
							const bytes = new TextEncoder().encode(JSON.stringify(payload));
							return {
								ok: true,
								status: 200,
								headers: {
									get: (name: string) => (name === "content-length" ? String(bytes.length) : "application/json"),
								},
								arrayBuffer: async () => bytes.buffer,
							};
						}),
					},
				},
			);

			const start = request("POST", API_PATHS.oauthDevice, { providerId: "copilot" });
			const started = new TestResponse();
			const starting = routes.get(API_PATHS.oauthDevice)?.(start.request, started as unknown as ServerResponse);
			start.emit();
			await starting;
			expect(started.status).toBe(200);
			expect(started.body).not.toContain("server-only-device-code");
			const flowId = (JSON.parse(started.body) as { data: { flowId: string } }).data.flowId;

			vi.setSystemTime(7_000);
			const poll = request("POST", API_PATHS.oauthDevicePoll, { providerId: "copilot", flowId });
			const completed = new TestResponse();
			const polling = routes.get(API_PATHS.oauthDevicePoll)?.(poll.request, completed as unknown as ServerResponse);
			poll.emit();
			await polling;
			expect(completed.status).toBe(200);
			expect(completed.body).not.toContain("server-only-access-token");
			expect(stored.get("GITHUB_COPILOT_TOKEN")).toBe("server-only-access-token");
		} finally {
			vi.useRealTimers();
		}
	});

	it("fails closed before OAuth transport when no public client ID is configured", async () => {
		const routes = new Map<string, (request: IncomingMessage, response: ServerResponse) => void | Promise<void>>();
		registerCredentialRoutes(
			{
				register(route) {
					routes.set(route.path, route.handler);
					return () => routes.delete(route.path);
				},
			},
			{
				logger: { warn: vi.fn() },
				accounts: { refresh: vi.fn(async () => []), credentialRefs: async () => new Set(["GITHUB_COPILOT_TOKEN"]) },
				credentials: { resolve: vi.fn(async () => undefined), set: vi.fn(async () => undefined) },
			},
		);
		const start = request("POST", API_PATHS.oauthDevice, { providerId: "copilot" });
		const response = new TestResponse();
		const handling = routes.get(API_PATHS.oauthDevice)?.(start.request, response as unknown as ServerResponse);
		start.emit();
		await handling;
		expect(response.status).toBe(503);
		expect(response.body).toContain("device-flow-not-configured");
	});

	it("rejects non-object mutation bodies", async () => {
		const routes = new Map<string, (request: IncomingMessage, response: ServerResponse) => void | Promise<void>>();
		registerCredentialRoutes(
			{
				register(route) {
					routes.set(route.path, route.handler);
					return () => routes.delete(route.path);
				},
			},
			{
				logger: { warn: vi.fn() },
				accounts: { refresh: vi.fn(async () => []), credentialRefs: async () => new Set<string>() },
				credentials: { resolve: vi.fn(async () => undefined), set: vi.fn(async () => undefined) },
			},
		);
		const mutation = request("PUT", API_PATHS.credentials, null);
		const response = new TestResponse();
		const handling = routes.get(API_PATHS.credentials)?.(mutation.request, response as unknown as ServerResponse);
		mutation.emit();
		await handling;
		expect(response.status).toBe(400);
		expect(response.body).toContain("invalid-body");
	});
});
