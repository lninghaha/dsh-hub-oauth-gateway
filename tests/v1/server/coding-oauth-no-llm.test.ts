import { EventEmitter } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CODING_OAUTH_STATUS_PATH } from "../../../src/server/coding-oauth/auth-routes.js";
import { applyCodingOAuth } from "../../../src/server/coding-oauth/compose.js";

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

describe("coding OAuth base runtime without LLM", () => {
	afterEach(() => {
		delete process.env.DSH_HOME;
	});

	it("keeps owner sessions and web routes active while LLM capabilities are degraded", async () => {
		const home = await mkdtemp(join(tmpdir(), "hub-no-llm-"));
		process.env.DSH_HOME = home;
		const routes = new Map<string, (request: IncomingMessage, response: ServerResponse) => void | Promise<void>>();
		const disposers: Array<() => void | Promise<void>> = [];
		const services = {
			webServer: {
				register(route: {
					path: string;
					handler: (request: IncomingMessage, response: ServerResponse) => void | Promise<void>;
				}) {
					routes.set(route.path, route.handler);
					return () => routes.delete(route.path);
				},
			},
		};
		const context = {
			root: {},
			webServer: services.webServer,
			logger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
			get: (name: keyof typeof services) => services[name],
			emit: vi.fn(),
			effect(setup: () => void | (() => void | Promise<void>)) {
				const dispose = setup();
				if (typeof dispose === "function") disposers.push(dispose);
			},
			inject(dependencies: readonly string[], callback: (ctx: unknown) => void | Promise<void>) {
				if (dependencies.every((name) => name in services)) void callback(context);
				return { await: vi.fn(async () => undefined), dispose: vi.fn(async () => undefined) };
			},
		};

		const runtime = applyCodingOAuth(context as never, {});
		await runtime.ready;
		expect(routes.has(CODING_OAUTH_STATUS_PATH)).toBe(true);
		const request = new EventEmitter() as EventEmitter & {
			method: string;
			url: string;
			headers: Record<string, string>;
			socket: { remoteAddress: string };
		};
		request.method = "GET";
		request.url = CODING_OAUTH_STATUS_PATH;
		request.headers = { host: "localhost:3080", "sec-fetch-site": "same-origin" };
		request.socket = { remoteAddress: "127.0.0.1" };
		const response = new TestResponse();
		await routes.get(CODING_OAUTH_STATUS_PATH)?.(
			request as unknown as IncomingMessage,
			response as unknown as ServerResponse,
		);
		expect(response.status).toBe(200);
		expect(JSON.parse(response.body)).toMatchObject({
			compatibility: {
				status: "degraded",
				capabilities: { llm: { state: "missing" } },
			},
		});

		for (const dispose of disposers.reverse()) await dispose();
		expect(routes.size).toBe(0);
		await rm(home, { recursive: true, force: true });
	});
});
