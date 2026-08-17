import { describe, expect, it } from "vitest";
import { en, zh } from "../../../src/client/locales.js";

describe("client locales", () => {
	it("keeps English and Chinese keys in parity for every presentation control", () => {
		expect(Object.keys(en).sort()).toEqual(Object.keys(zh).sort());
		for (const key of [
			"error.browserContext",
			"settings.preset",
			"preset.minimal",
			"preset.quota",
			"preset.cost",
			"preset.analyst",
			"settings.density",
			"density.compact",
			"density.comfortable",
			"settings.motion",
			"motion.system",
			"motion.always",
			"motion.never",
		]) {
			expect(zh[key as keyof typeof zh]).toBeTruthy();
			expect(en[key as keyof typeof en]).toBeTruthy();
		}
	});
});
