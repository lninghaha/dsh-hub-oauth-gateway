import { getGlobalDispatcher } from "undici";
import { describe, expect, it } from "vitest";
import { acquireCodingOAuthProxy, codingOAuthProxyInEffect } from "../../../src/server/coding-oauth/proxy.js";

describe("Hub coding OAuth proxy facade", () => {
	it("uses the root Undici dispatcher and restores it after the consumer lease releases", async () => {
		const previous = getGlobalDispatcher();
		const lease = acquireCodingOAuthProxy("http://127.0.0.1:17994");
		expect(getGlobalDispatcher()).not.toBe(previous);
		expect(codingOAuthProxyInEffect()).toBe("http://127.0.0.1:17994");

		await lease.release();
		expect(getGlobalDispatcher()).toBe(previous);
		expect(codingOAuthProxyInEffect()).toBeUndefined();
	});
});
