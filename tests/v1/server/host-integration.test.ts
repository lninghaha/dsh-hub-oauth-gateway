import { EventEmitter } from "node:events";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { SessionEvent } from "@deepseek-ai/dsh-session";
import { describe, expect, it, vi } from "vitest";
import type { UsageStatsHostContext } from "../../../src/server/context.js";
import { apply } from "../../../src/server/index.js";
import { API_PATHS } from "../../../src/shared/contracts.js";

class TestResponse {
	status = 0;
	body = "";
	headers: Record<string, string> = {};

	setHeader(name: string, value: string | number | readonly string[]) {
		this.headers[name.toLowerCase()] = Array.isArray(value) ? value.join(", ") : String(value);
	}

	writeHead(status: number, headers?: Record<string, string>) {
		this.status = status;
		Object.assign(this.headers, headers);
		return this;
	}

	end(body = "") {
		this.body += String(body);
		return this;
	}
}

function getRequest(url: string): IncomingMessage {
	const request = new EventEmitter() as EventEmitter & {
		method: string;
		url: string;
		headers: Record<string, string>;
		socket: { remoteAddress: string };
	};
	request.method = "GET";
	request.url = url;
	request.headers = { host: "localhost:3080", "x-dsh-hub-oauth-gateway": "1" };
	request.socket = { remoteAddress: "127.0.0.1" };
	return request as unknown as IncomingMessage;
}

function postRequest(url: string, body: unknown) {
	const request = new EventEmitter() as EventEmitter & {
		method: string;
		url: string;
		headers: Record<string, string>;
		socket: { remoteAddress: string };
	};
	request.method = "POST";
	request.url = url;
	request.headers = {
		host: "localhost:3080",
		"x-dsh-hub-oauth-gateway": "1",
		"content-type": "application/json",
	};
	request.socket = { remoteAddress: "127.0.0.1" };
	const raw = JSON.stringify(body);
	return {
		value: request as unknown as IncomingMessage,
		emitBody() {
			request.emit("data", Buffer.from(raw));
			request.emit("end");
		},
	};
}

function sessionCursors(path: string): Array<{ session_id: string; source_kind: string; input_tokens: number }> {
	const db = new DatabaseSync(path, { readOnly: true });
	try {
		return db
			.prepare(
				`SELECT c.session_id, c.source_kind, COALESCE(SUM(f.input_tokens), 0) AS input_tokens
				 FROM session_cursors c
				 LEFT JOIN usage_facts f ON f.session_id = c.session_id
				 GROUP BY c.session_id, c.source_kind
				 ORDER BY c.session_id`,
			)
			.all() as Array<{ session_id: string; source_kind: string; input_tokens: number }>;
	} finally {
		db.close();
	}
}

describe("server host integration", () => {
	it("opens the v1 database, projects host sessions, and registers v1 plus compatibility routes", async () => {
		const routes = new Map<string, (request: IncomingMessage, response: ServerResponse) => void | Promise<void>>();
		const cleanups: Array<() => void | Promise<void>> = [];
		const event = {
			type: "assistant/chunk",
			seq: 0,
			time: 1_700_000_000_000,
			data: {
				turn: 0,
				step: 0,
				chunk: { type: "usage", usage: { inputTokens: 12, outputTokens: 3, cacheReadTokens: 5 } },
			},
		} as SessionEvent;
		const services: Record<string, unknown> = {
			webServer: {
				register(route: {
					path: string;
					handler: (request: IncomingMessage, response: ServerResponse) => void | Promise<void>;
				}) {
					routes.set(route.path, route.handler);
					return () => routes.delete(route.path);
				},
			},
			credentials: { resolve: vi.fn(async () => undefined) },
			sessions: { list: () => [{ id: "live-session", events: [event] }] },
			sessionPersistence: { listSnapshots: vi.fn(async () => []), list: vi.fn(async () => []), readFrom: vi.fn() },
			settings: { get: vi.fn(() => undefined) },
		};
		const logger = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };
		const ctx: UsageStatsHostContext = {
			logger,
			get: (name: string) => services[name],
			effect(setup) {
				const cleanup = setup();
				if (typeof cleanup === "function") cleanups.push(cleanup);
			},
		};

		await apply(
			ctx,
			{ codingOAuth: { enabled: false } },
			{
				databasePath: ":memory:",
				disableBackgroundRefresh: true,
				now: () => 1_700_000_001_000,
			},
		);
		expect(routes.has(API_PATHS.overview)).toBe(true);
		expect(routes.has("/api/usage-stats/usage")).toBe(true);
		expect(routes.has(API_PATHS.credentials)).toBe(true);

		const response = new TestResponse();
		await routes.get(API_PATHS.overview)?.(getRequest(API_PATHS.overview), response as unknown as ServerResponse);
		expect(response.status).toBe(200);
		expect(JSON.parse(response.body)).toMatchObject({
			ok: true,
			data: { current: { inputTokens: 12, outputTokens: 3, cacheReadTokens: 5 }, requests: 1 },
		});

		for (const cleanup of cleanups.reverse()) await cleanup();
		expect(routes.size).toBe(0);
	});

	it("retries legacy usage migration after a later successful projection in the same process", async () => {
		const home = await mkdtemp(join(process.cwd(), "output", "host-migration-"));
		const databasePath = join(home, "storages", "usage-stats-v1.sqlite");
		const routes = new Map<string, (request: IncomingMessage, response: ServerResponse) => void | Promise<void>>();
		const cleanups: Array<() => void | Promise<void>> = [];
		const liveEvent = {
			type: "assistant/chunk",
			seq: 0,
			time: 1_700_000_000_000,
			data: {
				turn: 0,
				step: 0,
				chunk: { type: "usage", usage: { inputTokens: 12, outputTokens: 3 } },
			},
		} as SessionEvent;
		const legacySession = (tokens: number) => ({
			kind: "persisted",
			days: {
				"2025-01-02": {
					totals: { inputTokens: tokens, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 },
					models: {
						"model-a": { inputTokens: tokens, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 },
					},
				},
			},
		});
		await mkdir(join(home, "storages"), { recursive: true });
		await writeFile(
			join(home, "storages", "usage-stats-cache.json"),
			JSON.stringify({ version: 3, sessions: { current: legacySession(99), vanished: legacySession(7) } }),
		);

		let inventoryAvailable = false;
		const services: Record<string, unknown> = {
			webServer: {
				register(route: {
					path: string;
					handler: (request: IncomingMessage, response: ServerResponse) => void | Promise<void>;
				}) {
					routes.set(route.path, route.handler);
					return () => routes.delete(route.path);
				},
			},
			credentials: { resolve: vi.fn(async () => undefined) },
			sessions: {
				list: () => {
					if (!inventoryAvailable) throw new Error("session inventory unavailable");
					return [{ id: "current", events: [liveEvent] }];
				},
			},
			sessionPersistence: { listSnapshots: vi.fn(async () => []), list: vi.fn(async () => []), readFrom: vi.fn() },
			settings: { get: vi.fn(() => undefined) },
		};
		const logger = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };
		const ctx: UsageStatsHostContext = {
			logger,
			get: (name: string) => services[name],
			effect(setup) {
				const cleanup = setup();
				if (typeof cleanup === "function") cleanups.push(cleanup);
			},
		};
		const previousHome = process.env.DSH_HOME;
		process.env.DSH_HOME = home;
		try {
			await apply(
				ctx,
				{ codingOAuth: { enabled: false } },
				{
					databasePath,
					disableBackgroundRefresh: true,
					now: () => 1_700_000_001_000,
				},
			);
			expect(sessionCursors(databasePath)).toEqual([]);
			expect(logger.warn).toHaveBeenCalledWith(
				"usage-stats: initial usage projection failed (details redacted; background retry scheduled)",
			);

			inventoryAvailable = true;
			const refresh = postRequest(API_PATHS.refresh, { scope: "usage" });
			const response = new TestResponse();
			const done = routes.get(API_PATHS.refresh)?.(refresh.value, response as unknown as ServerResponse);
			refresh.emitBody();
			await done;
			expect(response.status).toBe(200);
			expect(sessionCursors(databasePath)).toEqual([
				{ session_id: "current", source_kind: "live", input_tokens: 12 },
				{ session_id: "vanished", source_kind: "legacy", input_tokens: 7 },
			]);
		} finally {
			if (previousHome === undefined) delete process.env.DSH_HOME;
			else process.env.DSH_HOME = previousHome;
			for (const cleanup of cleanups.reverse()) await cleanup();
			await rm(home, { recursive: true, force: true });
		}
	});
});
