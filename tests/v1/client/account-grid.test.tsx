/** @vitest-environment jsdom */
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AccountGrid } from "../../../src/client/components/AccountGrid.js";
import type { AccountSnapshot } from "../../../src/shared/domain.js";

const account: AccountSnapshot = {
	providerId: "provider-a",
	profileId: "",
	displayName: "Provider A",
	adapterId: "fixture",
	mode: "subscription",
	status: "ok",
	configured: true,
	fetchedAt: 1_000,
	stale: false,
	plan: "Pro",
	balance: null,
	windows: [
		{
			id: "rolling-five",
			kind: "rolling",
			label: "Five hour",
			unit: "percent",
			used: null,
			remaining: null,
			limit: null,
			usedRatio: 0.75,
			resetsAt: 2_000,
			rolling: true,
		},
	],
	missingCredentials: [],
	warningCode: null,
};

describe("account quota cards", () => {
	it("renders accessible remaining quota and supports drill-down selection", () => {
		const select = vi.fn();
		render(<AccountGrid accounts={[account]} emptyLabel="Empty" onSelect={select} />);
		expect(screen.getByRole("progressbar").getAttribute("aria-valuenow")).toBe("25");
		fireEvent.click(screen.getByRole("button", { name: /Provider A/i }));
		expect(select).toHaveBeenCalledWith("provider-a");
	});

	it("prioritizes real balance and quota data over unconfigured compatibility cards in compact mode", () => {
		const missing = [
			"Amp",
			"Claude",
			"Codex",
			"Cursor",
			"Gemini",
			"OpenRouter",
			"Together",
			"Fireworks",
			"Groq",
		].map<AccountSnapshot>((displayName) => ({
			...account,
			providerId: displayName.toLowerCase(),
			displayName,
			status: "not-configured",
			configured: false,
			plan: null,
			windows: [],
			missingCredentials: [`${displayName.toUpperCase()}_TOKEN`],
		}));
		const ready = { ...account, providerId: "quota-ready", displayName: "Quota Ready" };
		const { container } = render(<AccountGrid accounts={[...missing, ready]} emptyLabel="Empty" compact />);
		const compactGrid = within(container);
		expect(compactGrid.getByRole("button", { name: /Quota Ready/i })).toBeTruthy();
		expect(compactGrid.getByRole("progressbar").getAttribute("aria-valuenow")).toBe("25");
		expect(compactGrid.queryByRole("button", { name: /Groq/i })).toBeNull();
	});

	it("localizes unsupported status and hides empty unsupported rows in compact peek", () => {
		const unsupported: AccountSnapshot = {
			...account,
			providerId: "deepseek",
			displayName: "DeepSeek",
			status: "unsupported",
			configured: false,
			plan: "balance",
			windows: [],
			balance: null,
		};
		const ready = { ...account, providerId: "codex", displayName: "Codex" };
		const t = (key: string) => (key === "status.unsupported" ? "不支持" : key);
		const { container } = render(
			<AccountGrid accounts={[unsupported, ready]} emptyLabel="Empty" compact t={t as never} />,
		);
		expect(within(container).getByRole("button", { name: /Codex/i })).toBeTruthy();
		expect(within(container).queryByRole("button", { name: /DeepSeek/i })).toBeNull();
		expect(within(container).queryByText("UNSUPPORTED")).toBeNull();
		expect(within(container).queryByText("unsupported")).toBeNull();
	});
});
