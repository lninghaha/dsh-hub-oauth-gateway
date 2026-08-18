import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const css = readFileSync(join(root, "src/client/styles.css"), "utf8");

describe("overlay height contract", () => {
	it("uses content height with max-height for peek and dashboard instead of fixed 760/900px", () => {
		expect(css).toMatch(/\.dus-modal\.is-peek\s*\{[^}]*height:\s*auto/s);
		expect(css).toMatch(/\.dus-modal\.is-peek\s*\{[^}]*max-height:\s*min\(560px/s);
		expect(css).toMatch(/\.dus-modal\.is-dashboard\s*\{[^}]*height:\s*auto/s);
		expect(css).toMatch(/\.dus-modal\.is-dashboard\s*\{[^}]*max-height:\s*min\(860px/s);
		expect(css).not.toMatch(/\.dus-modal\.is-peek\s*\{[^}]*height:\s*min\(760px/s);
		expect(css).toMatch(/\.dus-dashboard\.is-peek-layout\s*\{[^}]*grid-template-rows:\s*auto minmax\(0,\s*1fr\)/s);
		expect(css).toMatch(/\.dus-account-grid\.is-compact\s*\{[^}]*max-height:\s*320px/s);
		expect(css).toMatch(/\.dus-settings\s*\{[^}]*max-width:\s*780px/s);
	});

	it("keeps peek KPI cards compact in a single four-column row", () => {
		expect(css).toMatch(/\.dus-modal\.is-peek\s+\.dus-kpi-grid\s*\{[^}]*grid-template-columns:\s*repeat\(4/s);
		expect(css).toMatch(/\.dus-modal\.is-peek\s+\.dus-kpi-card\s*\{[^}]*min-height:\s*0/s);
		expect(css).toMatch(/\.dus-modal\.is-peek\s+\.dus-kpi-value\s*\{[^}]*font-size:\s*clamp\(15px/s);
		expect(css).toMatch(/\.dus-status\s*\{[^}]*text-transform:\s*none/s);
	});
});
