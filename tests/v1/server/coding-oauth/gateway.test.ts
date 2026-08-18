import { describe, expect, it } from "vitest";
import { startCodingOAuthGateway } from "../../../../src/server/coding-oauth/gateway.js";
import {
	GATEWAY_DEFAULT_BIND,
	GATEWAY_DEFAULT_PORT,
	resolveGatewayConfig,
} from "../../../../src/server/coding-oauth/gateway-config.js";

describe("local coding OAuth gateway defaults", () => {
	it("stays disabled on loopback until explicitly enabled", () => {
		expect(resolveGatewayConfig()).toEqual({
			enabled: false,
			bind: GATEWAY_DEFAULT_BIND,
			port: GATEWAY_DEFAULT_PORT,
			rateLimit: 0,
		});
		expect(resolveGatewayConfig({}).enabled).toBe(false);
	});

	it("does not listen when start is called while disabled", async () => {
		const started = await startCodingOAuthGateway({
			config: { enabled: false, port: 19_180 },
			backend: {
				listModels: async () => {
					throw new Error("disabled gateway must not consult the backend");
				},
				stream: async function* () {
					throw new Error("disabled gateway must not stream");
				},
				streamText: async function* () {
					throw new Error("disabled gateway must not stream text");
				},
			},
		});
		expect(started).toBeUndefined();
	});
});
