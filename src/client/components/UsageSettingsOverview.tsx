import { useMemo } from "react";
import { defaultUserPreferences } from "../../shared/preferences.js";
import { usageUiController } from "../controller.js";
import { formatRelativeTime } from "../format.js";
import type { Translate } from "../locales.js";
import { useAccountsQuery, useAlertsQuery, useOverviewQuery, usePreferencesQuery } from "../queries.js";
import { filtersFromPreferences, resolveUsageQuery } from "../range.js";
import { AccountsDashboardSection } from "./AccountsDashboardSection.js";
import { AlertList, OverviewCards } from "./UsageOverlay.js";

export function UsageSettingsOverview({ t }: { readonly t: Translate }) {
	const preferences = usePreferencesQuery();
	const saved = preferences.data?.ok ? preferences.data.data : undefined;
	const query = useMemo(() => {
		const value = saved ?? defaultUserPreferences("UTC");
		return resolveUsageQuery(filtersFromPreferences(value), value.display.timeZone);
	}, [saved]);
	const overview = useOverviewQuery(query),
		accounts = useAccountsQuery(),
		alerts = useAlertsQuery();
	const data = overview.data?.ok ? overview.data.data : undefined;
	const meta = overview.data?.meta;
	const errors = [overview.error, accounts.error, alerts.error].filter(
		(error): error is Error => error instanceof Error,
	);
	return (
		<div className="dus-settings-stack" data-settings-tab="overview">
			{errors.map((error) => (
				<p role="alert" key={error.message}>
					{t("dashboard.error", { message: error.message })}
				</p>
			))}
			{meta?.usageUpdatedAt != null ? (
				<p className="dus-row-hint">
					{t(meta.stale ? "dashboard.stale" : "dashboard.updated", { time: formatRelativeTime(meta.usageUpdatedAt) })}
				</p>
			) : null}
			{data ? (
				<>
					<OverviewCards data={data} t={t} />
					{data.requests === 0 ? <p>{t("dashboard.empty")}</p> : null}
					<p className="dus-row-hint">{t("settings.costBasis")}</p>
				</>
			) : !overview.error ? (
				<p>{t("dashboard.loading")}</p>
			) : null}
			{alerts.data?.ok ? (
				<AlertList
					alerts={alerts.data.data.alerts}
					title={t("metric.alerts")}
					limit={alerts.data.data.alerts.length}
					t={t}
				/>
			) : null}
			{accounts.data?.ok ? (
				<AccountsDashboardSection
					accounts={accounts.data.data.accounts.filter((account) => account.status !== "not-configured")}
					emptyLabel={t("accounts.emptyGuide")}
					onConfigureAccounts={() => usageUiController.requestSettingsTab("accounts")}
					t={t}
				/>
			) : null}
		</div>
	);
}
