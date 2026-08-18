import { describe, expect, it } from "vitest";
import {
	dashboardTabsForModules,
	modulesForDashboardTab,
	resolveDashboardTab,
} from "../../../src/client/dashboard-tabs.js";
import { SETTINGS_TABS } from "../../../src/client/settings-tabs.js";

describe("dashboard tabs", () => {
	it("derives visible tabs from effective modules and hides empty groups", () => {
		expect(dashboardTabsForModules(["kpi", "alerts", "accounts"])).toEqual(["overview", "accounts"]);
		expect(dashboardTabsForModules(["heatmap", "trend", "breakdown"])).toEqual(["activity", "breakdown"]);
		expect(dashboardTabsForModules(["kpi"])).toEqual(["overview"]);
		expect(dashboardTabsForModules([])).toEqual([]);
	});

	it("orders tabs by the first matching module in the preference order", () => {
		expect(dashboardTabsForModules(["breakdown", "kpi", "accounts", "heatmap"])).toEqual([
			"breakdown",
			"overview",
			"accounts",
			"activity",
		]);
	});

	it("falls back when the preferred tab is no longer available", () => {
		expect(resolveDashboardTab("breakdown", ["overview", "accounts"])).toBe("overview");
		expect(resolveDashboardTab("accounts", ["overview", "accounts"])).toBe("accounts");
		expect(resolveDashboardTab(null, [])).toBeNull();
	});

	it("maps each tab to its module group", () => {
		expect(modulesForDashboardTab("overview")).toEqual(["kpi", "alerts"]);
		expect(modulesForDashboardTab("activity")).toEqual(["heatmap", "trend"]);
		expect(modulesForDashboardTab("accounts")).toEqual(["accounts"]);
		expect(modulesForDashboardTab("breakdown")).toEqual(["breakdown"]);
	});
});

describe("settings tabs", () => {
	it("exposes the settings panels including the coding OAuth tabs", () => {
		expect([...SETTINGS_TABS]).toEqual(["display", "accounts", "gateway", "capabilities", "providers", "fees"]);
	});
});
