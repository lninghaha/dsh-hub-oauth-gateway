import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { en, zh } from "../../../src/client/locales.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "../../..");

describe("client UX polish contracts", () => {
	it("exposes localized alert, toolbar, pricing, and empty-guide keys in both locales", () => {
		for (const key of [
			"toolbar.export",
			"toolbar.range",
			"toolbar.metric",
			"toolbar.group",
			"alert.level.warning",
			"alert.level.critical",
			"alert.dailyCost",
			"accounts.emptyGuide",
			"accounts.configure",
			"accounts.roiBadge",
			"peek.quotaStrip",
			"breakdown.priced",
			"pricing.providerPattern",
			"pricing.remove",
			"pricing.preset.openai",
			"gateway.snippetsTitle",
			"activity.dayDetail",
			"fees.datePlaceholder",
		] as const) {
			expect(zh[key]).toBeTruthy();
			expect(en[key]).toBeTruthy();
		}
	});

	it("keeps the classic client bundle under the gzip size gate when lib/client.js exists", () => {
		const bundlePath = join(root, "lib/client.js");
		if (!existsSync(bundlePath)) return;
		const raw = readFileSync(bundlePath);
		const gzipped = gzipSync(raw);
		// Raw ~590KB historically; allow headroom while catching accidental regressions.
		expect(raw.byteLength).toBeLessThan(900_000);
		expect(gzipped.byteLength).toBeLessThan(280_000);
	});
});
