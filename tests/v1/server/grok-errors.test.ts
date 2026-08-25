import { describe, expect, it } from "vitest";
import { isXaiCapacityError, remapXaiCapacityFailure } from "../../../src/server/coding-oauth/grok-errors.js";

describe("isXaiCapacityError", () => {
	it("recognizes xAI capacity, demand, priority, and overload wording", () => {
		expect(
			isXaiCapacityError(
				"Error Code null: The model is currently at capacity due to high demand. Please try again in a few minutes, or use a higher service tier for priority processing",
			),
		).toBe(true);
		expect(isXaiCapacityError("upstream overloaded, retry later")).toBe(true);
		expect(isXaiCapacityError("HIGH DEMAND on this model")).toBe(true);
	});

	it("does not treat unrelated failures as capacity", () => {
		expect(isXaiCapacityError("401 invalid token")).toBe(false);
		expect(isXaiCapacityError("429 rate limit exceeded")).toBe(false);
		expect(isXaiCapacityError("context window exceeded")).toBe(false);
	});
});

describe("remapXaiCapacityFailure", () => {
	it("rewrites capacity failures to RATE_LIMIT regardless of their original code", () => {
		const message =
			"The model is currently at capacity due to high demand. Please try again in a few minutes, or use a higher service tier for priority processing";
		for (const code of ["PI_AI_ERROR", "AUTH", "RATE_LIMIT"]) {
			expect(remapXaiCapacityFailure({ message, code })).toEqual({
				message,
				code: "RATE_LIMIT",
			});
		}
	});

	it("leaves non-capacity failures unchanged", () => {
		expect(remapXaiCapacityFailure({ message: "401 invalid token", code: "AUTH" })).toEqual({
			message: "401 invalid token",
			code: "AUTH",
		});
		expect(remapXaiCapacityFailure({ message: "pi-ai stream error", code: "PI_AI_ERROR" })).toEqual({
			message: "pi-ai stream error",
			code: "PI_AI_ERROR",
		});
	});
});
