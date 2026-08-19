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

	it("stacks host footer actions when the sidebar entry is mounted and styles the floating HUD", () => {
		expect(css).toMatch(/\.hHd-Xa_footerActions:has\(\.dus-sidebar-button\)\s*\{[^}]*flex-direction:\s*column/s);
		expect(css).toMatch(/\.dus-hud\s*\{[^}]*position:\s*fixed/s);
		expect(css).toMatch(/\.dus-hud\s*\{[^}]*pointer-events:\s*auto/s);
		expect(css).toMatch(/\.dus-settings-heading-actions\s*\{[^}]*display:\s*flex/s);
	});

	it("keeps peek KPI cards compact in a single four-column row", () => {
		expect(css).toMatch(/\.dus-modal\.is-peek\s+\.dus-kpi-grid\s*\{[^}]*grid-template-columns:\s*repeat\(4/s);
		expect(css).toMatch(/\.dus-modal\.is-peek\s+\.dus-kpi-card\s*\{[^}]*min-height:\s*0/s);
		expect(css).toMatch(/\.dus-modal\.is-peek\s+\.dus-kpi-value\s*\{[^}]*font-size:\s*clamp\(15px/s);
		expect(css).toMatch(/\.dus-status\s*\{[^}]*text-transform:\s*none/s);
	});

	it("unifies capsule buttons and keeps fee rows responsive under 760px", () => {
		expect(css).toMatch(/\.dus-button\s*\{[^}]*border-radius:\s*18px/s);
		expect(css).toMatch(/\.dus-button\.is-primary\s*\{/s);
		expect(css).toMatch(/\.dus-export-menu-panel\s*\{/s);
		expect(css).toMatch(/\.dus-fee-head\s*,\s*\.dus-fee-row\s*\{/s);
		expect(css).toMatch(/\.dus-muted\s*\{[^}]*color:\s*var\(--dus-muted\)/s);
		expect(css).toMatch(/\.dus-account-last-good\s*\{/s);
		expect(css).not.toMatch(/\.dus-grid-main\s*\{/s);
		expect(css).not.toMatch(/\.dus-provider-toggles\s*\{/s);
		expect(css).toMatch(/\.dus-fee-head,\s*\n\s*\.dus-fee-row \{\s*\n\s*grid-template-columns:\s*1fr/s);
		expect(css).toMatch(/\.dus-fee-field-label\s*\{[^}]*display:\s*none/s);
	});

	it("keeps secondary type at or above the 11px readability floor", () => {
		expect(css).toMatch(/\.dus-kpi-delta\s*\{[^}]*font-size:\s*11px/s);
		expect(css).toMatch(/\.dus-status\s*\{[^}]*font-size:\s*10px/s);
		expect(css).toMatch(/\.dus-alert-level\s*\{[^}]*font-size:\s*10px/s);
		expect(css).not.toMatch(/font-size:\s*8px/s);
		expect(css).not.toMatch(/font-weight:\s*680/s);
	});
});
