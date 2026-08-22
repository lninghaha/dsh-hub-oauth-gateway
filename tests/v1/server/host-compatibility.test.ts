import { EventEmitter } from "node:events";
import type { IncomingMessage, ServerResponse } from "node:http";
import { describe, expect, it, vi } from "vitest";
import { DEFAULT_RUNTIME_CONFIG } from "../../../src/server/config.js";
import type { UsageStatsHostContext } from "../../../src/server/context.js";
import { DshHostAdapter } from "../../../src/server/host/adapter.js";
import { apply } from "../../../src/server/index.js";
import { API_PATHS } from "../../../src/shared/contracts.js";

function request(path: string): IncomingMessage {
	const value = new EventEmitter() as EventEmitter & {
		method: string;
		url: string;
		headers: Record<string, string>;
		socket: { remoteAddress: string };
	};
	value.method = "GET";
	value.url = path;
	value.headers = { host: "localhost:3080", "sec-fetch-site": "same-origin" };
	value.socket = { remoteAddress: "127.0.0.1" };
	return value as unknown as IncomingMessage;
}

class Response {
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

const configWithoutCodingOAuth = {
	...DEFAULT_RUNTIME_CONFIG,
	codingOAuth: { ...DEFAULT_RUNTIME_CONFIG.codingOAuth, enabled: false },
};

describe("DSH host compatibility boundary", () => {
	it("discovers a DSH-native owner request policy as an optional capability", () => {
		const policy = { authorize: vi.fn(), diagnostics: vi.fn(() => []) };
		const adapter = new DshHostAdapter({
			logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
			ownerRequestPolicy: policy,
			effect() {},
		});

		expect(adapter.ownerRequestPolicy()).toBe(policy);
		expect(adapter.compatibility().capabilities.ownerRequestPolicy).toEqual({
			state: "available",
			contract: "owner-request-policy-v1",
		});
	});

	it("loads with every optional host service absent and reports a degraded diagnostic", async () => {
		const routes = new Map<string, (request: IncomingMessage, response: ServerResponse) => void | Promise<void>>();
		const cleanups: Array<() => void | Promise<void>> = [];
		const webServer = {
			register(route: {
				path: string;
				handler: (request: IncomingMessage, response: ServerResponse) => void | Promise<void>;
			}) {
				routes.set(route.path, route.handler);
				return () => routes.delete(route.path);
			},
		};
		const ctx: UsageStatsHostContext = {
			logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
			webServer,
			effect(setup) {
				const cleanup = setup();
				if (typeof cleanup === "function") cleanups.push(cleanup);
			},
		};

		await apply(ctx, configWithoutCodingOAuth, {
			databasePath: ":memory:",
			disableBackgroundRefresh: true,
			now: () => 1_700_000_000_000,
		});
		const response = new Response();
		await routes.get(API_PATHS.compatibility)?.(
			request(API_PATHS.compatibility),
			response as unknown as ServerResponse,
		);
		const payload = JSON.parse(response.body);
		expect(response.status).toBe(200);
		expect(payload).toMatchObject({
			ok: true,
			data: {
				status: "degraded",
				uiOwner: null,
				capabilities: {
					webServer: { state: "available" },
					credentials: { state: "missing" },
					llm: { state: "missing" },
				},
			},
		});
		for (const cleanup of cleanups.reverse()) await cleanup();
		expect(routes.size).toBe(0);
	});

	it("rolls back every route when one registration fails", async () => {
		const routes = new Set<string>();
		const cleanups: Array<() => void | Promise<void>> = [];
		let registrations = 0;
		const ctx: UsageStatsHostContext = {
			logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
			webServer: {
				register(route) {
					registrations += 1;
					if (registrations === 4) throw new Error("simulated DSH route conflict");
					routes.add(route.path);
					return () => routes.delete(route.path);
				},
			},
			effect(setup) {
				const cleanup = setup();
				if (typeof cleanup === "function") cleanups.push(cleanup);
			},
		};

		await expect(
			apply(ctx, configWithoutCodingOAuth, { databasePath: ":memory:", disableBackgroundRefresh: true }),
		).rejects.toThrow("simulated DSH route conflict");
		expect(routes.size).toBe(0);
		for (const cleanup of cleanups.reverse()) await cleanup();
	});
});
