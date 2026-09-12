/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AccountsDashboardSection } from "../../../src/client/components/AccountsDashboardSection.js";
import { translator, zh } from "../../../src/client/locales.js";
import type { AccountSnapshot } from "../../../src/shared/domain.js";

const t = translator(((key: string) => (zh as Record<string, string>)[key] ?? key) as never);

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
	windows: [],
	missingCredentials: [],
	warningCode: null,
};

describe("AccountsDashboardSection", () => {
	afterEach(() => {
		cleanup();
	});

	it("renders persistent manage button in section head when accounts are present", () => {
		const onConfigure = vi.fn();
		render(
			<AccountsDashboardSection
				accounts={[account]}
				emptyLabel="No accounts"
				onConfigureAccounts={onConfigure}
				t={t}
			/>,
		);

		const manageBtn = screen.getByRole("button", { name: "管理订阅账号" });
		expect(manageBtn).toBeDefined();
		fireEvent.click(manageBtn);
		expect(onConfigure).toHaveBeenCalledTimes(1);
	});

	it("renders persistent manage button alongside empty guide when accounts are empty", () => {
		const onConfigure = vi.fn();
		render(
			<AccountsDashboardSection
				accounts={[]}
				emptyLabel="尚未发现可监控账户"
				onConfigureAccounts={onConfigure}
				t={t}
			/>,
		);

		const manageBtn = screen.getByRole("button", { name: "管理订阅账号" });
		expect(manageBtn).toBeDefined();
		fireEvent.click(manageBtn);
		expect(onConfigure).toHaveBeenCalledTimes(1);

		const emptyGuideBtn = screen.getByRole("button", { name: "前往配置账户" });
		expect(emptyGuideBtn).toBeDefined();
		fireEvent.click(emptyGuideBtn);
		expect(onConfigure).toHaveBeenCalledTimes(2);
	});

	it("does not render manage button when onConfigureAccounts is omitted", () => {
		render(<AccountsDashboardSection accounts={[account]} emptyLabel="No accounts" t={t} />);
		expect(screen.queryByRole("button", { name: "管理订阅账号" })).toBeNull();
	});
});
