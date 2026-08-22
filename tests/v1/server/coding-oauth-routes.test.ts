import { EventEmitter } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	CODING_OAUTH_LOGIN_CODE_PATH,
	CODING_OAUTH_LOGOUT_PATH,
	CODING_OAUTH_STATUS_PATH,
	registerCodingOAuthRoutes,
} from "../../../src/server/coding-oauth/auth-routes.js";
import {
	CAPABILITY_SETTINGS_PATH,
	registerCapabilityRoutes,
} from "../../../src/server/coding-oauth/capability-routes.js";
import {
	type CapabilitySettings,
	type CapabilitySettingsPatch,
	createCapabilitySettingsController,
} from "../../../src/server/coding-oauth/capability-settings.js";
import { createCodingOAuthGatewayController } from "../../../src/server/coding-oauth/gateway.js";
import {
	GATEWAY_REVEAL_PATH,
	GATEWAY_ROTATE_PATH,
	GATEWAY_SETTINGS_PATH,
	registerGatewayRoutes,
} from "../../../src/server/coding-oauth/gateway-routes.js";
import { OAUTH_PROVIDER_DEFINITIONS } from "../../../src/server/coding-oauth/oauth-providers.js";
import { OAuthProviderSession } from "../../../src/server/coding-oauth/oauth-session.js";
import { GrokBuildSession } from "../../../src/server/coding-oauth/session.js";

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

function request(method: string, url: string, body?: unknown, host = "localhost:3080") {
	const emitter = new EventEmitter() as EventEmitter & {
		method: string;
		url: string;
		headers: Record<string, string>;
		socket: { remoteAddress: string };
		destroy: ReturnType<typeof vi.fn>;
		resume: ReturnType<typeof vi.fn>;
	};
	emitter.method = method;
	emitter.url = url;
	emitter.headers = {
		host,
		...(method === "GET" ? {} : { "content-type": "application/json" }),
	};
	emitter.socket = { remoteAddress: "127.0.0.1" };
	emitter.destroy = vi.fn();
	emitter.resume = vi.fn();
	const raw = body === undefined ? undefined : JSON.stringify(body);
	return {
		value: emitter as unknown as IncomingMessage,
		emitBody() {
			if (raw !== undefined) emitter.emit("data", Buffer.from(raw));
			emitter.emit("end");
		},
	};
}

interface MockContext {
	routes: Map<string, (request: IncomingMessage, response: ServerResponse) => void | Promise<void>>;
	disposers: Array<() => void | Promise<void>>;
}

function mockContext(): { ctx: never; mock: MockContext } {
	const mock: MockContext = {
		routes: new Map(),
		disposers: [],
	};
	const ctx = {
		logger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
		effect: (setup: () => void | (() => void | Promise<void>), _label?: string) => {
			const dispose = setup();
			if (typeof dispose === "function") mock.disposers.push(dispose);
		},
		webServer: {
			register(route: { path: string; handler: (req: IncomingMessage, res: ServerResponse) => void | Promise<void> }) {
				mock.routes.set(route.path, route.handler);
				return () => mock.routes.delete(route.path);
			},
		},
		llm: { listProviders: () => [] },
		get: () => undefined,
		emit: vi.fn(),
	};
	return { ctx: ctx as never, mock };
}

async function callRoute(
	mock: MockContext,
	path: string,
	method: string,
	body?: unknown,
	host?: string,
): Promise<{ status: number; payload: unknown }> {
	const handler = mock.routes.get(path);
	expect(handler).toBeDefined();
	const req = request(method, path, body, host);
	const res = new TestResponse();
	const pending = handler?.(req.value, res as unknown as ServerResponse);
	req.emitBody();
	await pending;
	return { status: res.status, payload: res.body === "" ? null : JSON.parse(res.body) };
}

describe("coding OAuth routes", () => {
	let home: string;
	let grok: GrokBuildSession;
	let subscriptions: OAuthProviderSession[];
	let mock: MockContext;

	beforeEach(async () => {
		home = await mkdtemp(join(tmpdir(), "coding-oauth-routes-"));
		process.env.DSH_HOME = home;
		grok = new GrokBuildSession();
		subscriptions = OAUTH_PROVIDER_DEFINITIONS.map((definition) => new OAuthProviderSession(definition));
		const built = mockContext();
		mock = built.mock;
		registerCodingOAuthRoutes(built.ctx, grok, subscriptions);
	});

	afterEach(async () => {
		for (const dispose of mock.disposers.splice(0)) await dispose();
		delete process.env.DSH_HOME;
		await rm(home, { recursive: true, force: true });
	});

	it("reports a signed-out status for every provider without touching the network", async () => {
		const { status, payload } = await callRoute(mock, CODING_OAUTH_STATUS_PATH, "GET");
		expect(status).toBe(200);
		const document = payload as {
			providers: Record<string, { status: string }>;
			antigravity: { installed: boolean; route: string; management: string };
		};
		expect(Object.keys(document.providers).sort()).toEqual(["claude", "codex", "grok", "kimi"]);
		for (const provider of Object.values(document.providers)) {
			expect(provider.status).toBe("signed-out");
		}
		expect(document.antigravity).toEqual({ installed: false, route: "agy", management: "cli" });
		// No token material may appear in the status document.
		expect(JSON.stringify(document)).not.toMatch(/accessToken|refreshToken|apiKey/i);
	});

	it("rejects non-loopback Host values even from a loopback peer", async () => {
		const { status } = await callRoute(mock, CODING_OAUTH_STATUS_PATH, "GET", undefined, "example.com");
		expect(status).toBe(403);
	});

	it("rejects an empty authorization code and a code without a pending login", async () => {
		const empty = await callRoute(mock, CODING_OAUTH_LOGIN_CODE_PATH, "POST", { provider: "grok", code: "  " });
		expect(empty.status).toBe(400);

		const noPending = await callRoute(mock, CODING_OAUTH_LOGIN_CODE_PATH, "POST", { provider: "grok", code: "abc" });
		expect(noPending.status).toBe(409);
	});

	it("rejects an unknown provider slug on login and logout", async () => {
		const login = await callRoute(mock, "/plugins/dsh-grok-build/oauth/login", "POST", { provider: "unknown" });
		expect(login.status).toBe(500);

		const logout = await callRoute(mock, CODING_OAUTH_LOGOUT_PATH, "POST", { provider: "unknown" });
		expect(logout.status).toBe(500);
	});

	it("logs out a signed-out provider cleanly and keeps the status shape", async () => {
		const { status, payload } = await callRoute(mock, CODING_OAUTH_LOGOUT_PATH, "POST", { provider: "kimi" });
		expect(status).toBe(200);
		expect((payload as { providers: Record<string, unknown> }).providers.kimi).toMatchObject({
			status: "signed-out",
		});
	});
});

describe("coding OAuth gateway routes", () => {
	let home: string;
	let mock: MockContext;

	beforeEach(async () => {
		home = await mkdtemp(join(tmpdir(), "coding-oauth-gateway-"));
		process.env.DSH_HOME = home;
		const grok = new GrokBuildSession();
		const subscriptions = OAUTH_PROVIDER_DEFINITIONS.map((definition) => new OAuthProviderSession(definition));
		const controller = createCodingOAuthGatewayController({
			config: { port: 18_199 },
			dshHome: home,
			grok,
			subscriptions,
		});
		const built = mockContext();
		mock = built.mock;
		registerGatewayRoutes(built.ctx, controller);
	});

	afterEach(async () => {
		for (const dispose of mock.disposers.splice(0)) await dispose();
		delete process.env.DSH_HOME;
		await rm(home, { recursive: true, force: true });
	});

	it("reports the disabled default status without a key leak", async () => {
		const { status, payload } = await callRoute(mock, GATEWAY_SETTINGS_PATH, "GET");
		expect(status).toBe(200);
		expect(payload).toMatchObject({ enabled: false, running: false, bind: "127.0.0.1", port: 18_199 });
		expect(JSON.stringify(payload)).not.toContain("apiKey");
	});

	it("validates the PATCH envelope", async () => {
		const empty = await callRoute(mock, GATEWAY_SETTINGS_PATH, "PATCH", {});
		expect(empty.status).toBe(400);

		const badEnabled = await callRoute(mock, GATEWAY_SETTINGS_PATH, "PATCH", { enabled: "yes" });
		expect(badEnabled.status).toBe(400);

		const badPort = await callRoute(mock, GATEWAY_SETTINGS_PATH, "PATCH", { port: 80 });
		expect(badPort.status).toBe(400);

		const floatPort = await callRoute(mock, GATEWAY_SETTINGS_PATH, "PATCH", { port: 18080.5 });
		expect(floatPort.status).toBe(400);
	});

	it("persists a port change and reveals/rotates the key with a fresh hint", async () => {
		const ported = await callRoute(mock, GATEWAY_SETTINGS_PATH, "PATCH", { port: 18_234 });
		expect(ported.status).toBe(200);
		expect(ported.payload).toMatchObject({ port: 18_234, running: false });

		const revealed = await callRoute(mock, GATEWAY_REVEAL_PATH, "POST", {});
		expect(revealed.status).toBe(200);
		const first = (revealed.payload as { apiKey: string; keyHint: string }).apiKey;
		expect(first.length).toBeGreaterThan(16);

		const rotated = await callRoute(mock, GATEWAY_ROTATE_PATH, "POST", {});
		expect(rotated.status).toBe(200);
		const second = (rotated.payload as { apiKey: string }).apiKey;
		expect(second).not.toBe(first);
	});

	it("rejects non-loopback Host values on the control surface", async () => {
		const { status } = await callRoute(mock, GATEWAY_SETTINGS_PATH, "GET", undefined, "gateway.example.com");
		expect(status).toBe(403);
	});
});

describe("coding OAuth capability routes", () => {
	let mock: MockContext;

	interface MemorySettings {
		value: CapabilitySettingsPatch;
		revision: number;
	}

	let memory: MemorySettings;

	const service = () => ({
		writable: true,
		describe: () => [
			{
				ns: "coding-subscription-oauth",
				value: { ...memory.value },
				revision: memory.revision,
			},
		],
		update: async (_ns: string, patch: object, expectedRevision?: number) => {
			if (expectedRevision !== undefined && expectedRevision !== memory.revision) {
				const error = new Error("conflict") as Error & { code: string; expected: number; actual: number };
				error.code = "SETTINGS_CONFLICT";
				error.expected = expectedRevision ?? -1;
				error.actual = memory.revision;
				throw error;
			}
			memory.value = { ...memory.value, ...(patch as CapabilitySettingsPatch) };
			memory.revision += 1;
		},
	});

	beforeEach(() => {
		memory = { value: {}, revision: 0 };
		const controller = createCapabilitySettingsController({
			settings: service() as never,
		});
		const built = mockContext();
		mock = built.mock;
		registerCapabilityRoutes(built.ctx, { controller });
	});

	afterEach(async () => {
		for (const dispose of mock.disposers.splice(0)) await dispose();
	});

	it("serves the default-off snapshot and applies a CAS patch", async () => {
		const initial = await callRoute(mock, CAPABILITY_SETTINGS_PATH, "GET");
		expect(initial.status).toBe(200);
		const snapshot = initial.payload as { value: CapabilitySettings; revision: number; writable: boolean };
		expect(snapshot.value.codexSearch).toBe(false);
		expect(snapshot.value.searchResults).toBe(5);
		expect(snapshot.writable).toBe(true);

		const patched = await callRoute(mock, CAPABILITY_SETTINGS_PATH, "PATCH", {
			patch: { codexSearch: true, searchResults: 9 },
			expectedRevision: snapshot.revision,
		});
		expect(patched.status).toBe(200);
		expect(patched.payload).toMatchObject({ value: { codexSearch: true, searchResults: 9 }, revision: 1 });
	});

	it("answers a stale revision with a 409 SETTINGS_CONFLICT envelope", async () => {
		const first = await callRoute(mock, CAPABILITY_SETTINGS_PATH, "PATCH", {
			patch: { codexFast: true },
			expectedRevision: 0,
		});
		expect(first.status).toBe(200);

		const stale = await callRoute(mock, CAPABILITY_SETTINGS_PATH, "PATCH", {
			patch: { codexUsage: true },
			expectedRevision: 0,
		});
		expect(stale.status).toBe(409);
		expect(stale.payload).toMatchObject({ code: "SETTINGS_CONFLICT", expected: 0, actual: 1 });
	});

	it("rejects unknown, secret-shaped, and out-of-range keys", async () => {
		const unknown = await callRoute(mock, CAPABILITY_SETTINGS_PATH, "PATCH", {
			patch: { unknownFlag: true },
			expectedRevision: 0,
		});
		expect(unknown.status).toBe(400);

		const secret = await callRoute(mock, CAPABILITY_SETTINGS_PATH, "PATCH", {
			patch: { apiKey: "sk-secret" },
			expectedRevision: 0,
		});
		expect(secret.status).toBe(400);

		const outOfRange = await callRoute(mock, CAPABILITY_SETTINGS_PATH, "PATCH", {
			patch: { searchResults: 99 },
			expectedRevision: 0,
		});
		expect(outOfRange.status).toBe(400);
	});

	it("rejects writes when no settings provider is attached", async () => {
		const controller = createCapabilitySettingsController();
		const built = mockContext();
		registerCapabilityRoutes(built.ctx, { controller });
		const denied = await callRoute(built.mock, CAPABILITY_SETTINGS_PATH, "PATCH", {
			patch: { codexSearch: true },
			expectedRevision: 0,
		});
		expect(denied.status).toBe(503);
		expect(denied.payload).toMatchObject({ code: "SETTINGS_PROVIDER_ABSENT" });
		for (const dispose of built.mock.disposers.splice(0)) await dispose();
	});

	it("rejects non-loopback Host values", async () => {
		const { status } = await callRoute(mock, CAPABILITY_SETTINGS_PATH, "GET", undefined, "evil.example.com");
		expect(status).toBe(403);
	});
});
