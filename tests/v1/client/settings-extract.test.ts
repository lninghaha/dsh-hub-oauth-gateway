import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = join(dirname(fileURLToPath(import.meta.url)), "../../..");

describe("settings fee/pricing extraction", () => {
	it("keeps FeesEditor and PricingEditor as dedicated modules imported by SettingsSection", () => {
		const settings = readFileSync(join(root, "src/client/components/SettingsSection.tsx"), "utf8");
		expect(settings).toContain('from "./FeesEditor.js"');
		expect(settings).toContain('from "./PricingEditor.js"');
		expect(settings).not.toContain("function FeesEditor");
		expect(settings).not.toContain("function PricingEditor");
		expect(readFileSync(join(root, "src/client/components/FeesEditor.tsx"), "utf8")).toContain(
			"export function FeesEditor",
		);
		expect(readFileSync(join(root, "src/client/components/PricingEditor.tsx"), "utf8")).toContain(
			"export function PricingEditor",
		);
	});

	it("uses the unified dus-button language in overlay toolbar and settings actions", () => {
		const overlay = readFileSync(join(root, "src/client/components/UsageOverlay.tsx"), "utf8");
		expect(overlay).toContain('className="dus-button is-primary"');
		expect(overlay).toContain('<details className="dus-export-menu">');
		expect(overlay).not.toContain("dus-secondary-button");
		expect(overlay).not.toContain("dus-primary-button");
		const fees = readFileSync(join(root, "src/client/components/FeesEditor.tsx"), "utf8");
		expect(fees).toContain("dus-button is-primary");
		expect(fees).toContain("dus-fee-head");
	});
});
