import type { DashboardModuleId } from "../shared/preferences.js";

export type DashboardTabId = "overview" | "activity" | "accounts" | "breakdown";

export const DASHBOARD_TAB_ORDER: readonly DashboardTabId[] = Object.freeze([
	"overview",
	"activity",
	"accounts",
	"breakdown",
]);

const TAB_MODULES: Readonly<Record<DashboardTabId, readonly DashboardModuleId[]>> = {
	overview: ["kpi", "alerts"],
	activity: ["heatmap", "trend"],
	accounts: ["accounts"],
	breakdown: ["breakdown"],
};

export function modulesForDashboardTab(tab: DashboardTabId): readonly DashboardModuleId[] {
	return TAB_MODULES[tab];
}

/** Visible dashboard tabs, ordered by the first matching module in `modules`. */
export function dashboardTabsForModules(modules: readonly DashboardModuleId[]): DashboardTabId[] {
	const visible = new Set(modules);
	const firstIndex = new Map<DashboardTabId, number>();
	for (const tab of DASHBOARD_TAB_ORDER) {
		for (const [index, moduleId] of modules.entries()) {
			if (TAB_MODULES[tab].includes(moduleId) && visible.has(moduleId)) {
				firstIndex.set(tab, index);
				break;
			}
		}
	}
	return [...firstIndex.entries()].sort((left, right) => left[1] - right[1]).map(([tab]) => tab);
}

export function resolveDashboardTab(
	preferred: DashboardTabId | null,
	available: readonly DashboardTabId[],
): DashboardTabId | null {
	if (available.length === 0) return null;
	if (preferred !== null && available.includes(preferred)) return preferred;
	return available[0] ?? null;
}
