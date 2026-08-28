import { describe, expect, it } from "vitest";
import {
	CODEX_FAST_SESSION_ROUTE,
	CODEX_STANDARD_SESSION_ROUTE,
	codexSessionRouteForSpeed,
	codexSpeedHint,
} from "../../../src/client/codex-fast-session.js";

describe("codex-fast-session helper", () => {
	it("hides Speed when Fast is off", () => {
		expect(codexSpeedHint(false, true)).toBe("hidden");
		expect(codexSpeedHint(false, false)).toBe("hidden");
	});

	it("shows Standard/Fast when enabled with live priority models", () => {
		expect(codexSpeedHint(true, true)).toBe("standard-and-fast");
		expect(codexSpeedHint(true, false)).toBe("standard-only");
	});

	it("maps Speed requests to the existing Fast route", () => {
		expect(codexSessionRouteForSpeed("standard")).toBe(CODEX_STANDARD_SESSION_ROUTE);
		expect(codexSessionRouteForSpeed("fast")).toBe(CODEX_FAST_SESSION_ROUTE);
		expect(CODEX_FAST_SESSION_ROUTE).toBe("codex-oauth-fast");
	});
});
