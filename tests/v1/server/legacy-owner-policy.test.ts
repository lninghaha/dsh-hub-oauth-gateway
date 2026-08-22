import { EventEmitter } from "node:events";
import type { IncomingMessage, ServerResponse } from "node:http";
import { describe, expect, it, vi } from "vitest";
import { LEGACY_PATHS, registerLegacyRoutes } from "../../../src/server/api/legacy.js";
import type { ExactWebServer } from "../../../src/server/api/router.js";
import {
	createOwnerRequestPolicy,
	OWNER_CSRF_HEADER,
	OWNER_PROOF_HEADER,
} from "../../../src/server/coding-oauth/web-origin.js";
import { defaultUserPreferences, type UserPreferences } from "../../../src/shared/preferences.js";

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

function request(method: string, body?: unknown, remoteAddress = "10.0.0.8") {
	const emitter = new EventEmitter() as EventEmitter & {
		method: string;
		url: string;
		headers: Record<string, string>;
		socket: { remoteAddress: string };
		destroy: ReturnType<typeof vi.fn>;
	};
	emitter.method = method;
	emitter.url = LEGACY_PATHS.preferences;
	emitter.headers = {
		host: "dsh.example.test",
		origin: "https://dsh.example.test",
		"sec-fetch-site": "same-origin",
		[OWNER_PROOF_HEADER]: "owner-proof-secret",
		...(method === "GET" ? {} : { "content-type": "application/json" }),
	};
	emitter.socket = { remoteAddress };
	emitter.destroy = vi.fn();
	return {
		value: emitter as unknown as IncomingMessage,
		emit() {
			if (body !== undefined) emitter.emit("data", Buffer.from(JSON.stringify(body)));
			emitter.emit("end");
		},
	};
}

describe("legacy API owner policy", () => {
	it("ignores forged forwarded headers and requires the independent CSRF proof for mutations", async () => {
		const routes = new Map<string, (request: IncomingMessage, response: ServerResponse) => void | Promise<void>>();
		const webServer: ExactWebServer = {
			register(route) {
				routes.set(route.path, route.handler);
				return () => routes.delete(route.path);
			},
		};
		let preferences = defaultUserPreferences("UTC");
		registerLegacyRoutes(webServer, {
			logger: { warn: vi.fn() },
			projection: { synchronize: vi.fn() },
			usage: { listFacts: () => [] } as never,
			accounts: { list: vi.fn(async () => []), specs: vi.fn(async () => []) } as never,
			preferences: {
				load: () => preferences,
				save: (next: UserPreferences) => {
					preferences = next;
				},
			} as never,
			ownerRequestPolicy: createOwnerRequestPolicy({
				trustedProxy: {
					peers: ["10.0.0.8"],
					origins: ["https://dsh.example.test"],
					ownerProof: "owner-proof-secret",
					csrfToken: "csrf-proof-secret",
				},
			}),
		});

		const read = request("GET");
		const readResponse = new TestResponse();
		await routes.get(LEGACY_PATHS.preferences)?.(read.value, readResponse as unknown as ServerResponse);
		expect(readResponse.status).toBe(200);

		const spoofed = request("GET", undefined, "192.0.2.24");
		spoofed.value.headers["x-forwarded-for"] = "10.0.0.8";
		const spoofedResponse = new TestResponse();
		await routes.get(LEGACY_PATHS.preferences)?.(spoofed.value, spoofedResponse as unknown as ServerResponse);
		expect(spoofedResponse.status).toBe(403);

		const missingCsrf = request("PUT", { prefs: { density: "compact" } });
		const missingCsrfResponse = new TestResponse();
		const denied = routes.get(LEGACY_PATHS.preferences)?.(
			missingCsrf.value,
			missingCsrfResponse as unknown as ServerResponse,
		);
		missingCsrf.emit();
		await denied;
		expect(missingCsrfResponse.status).toBe(403);

		const authorized = request("PUT", { prefs: { density: "compact" } });
		authorized.value.headers[OWNER_CSRF_HEADER] = "csrf-proof-secret";
		const authorizedResponse = new TestResponse();
		const saved = routes.get(LEGACY_PATHS.preferences)?.(
			authorized.value,
			authorizedResponse as unknown as ServerResponse,
		);
		authorized.emit();
		await saved;
		expect(authorizedResponse.status).toBe(200);
		expect(preferences.display.density).toBe("compact");
	});
});
