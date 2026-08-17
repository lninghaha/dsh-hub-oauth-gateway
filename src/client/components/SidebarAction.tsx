import type { SidebarFooterActionOwnerProps } from "@deepseek-ai/dsh-client-ui-sidebar/client";
import type { PropsLocale } from "@deepseek-ai/dsh-client-ui-slots";
import { useMemo } from "react";
import { defaultUserPreferences } from "../../shared/preferences.js";
import { usageUiController } from "../controller.js";
import { formatCompact, formatCurrency } from "../format.js";
import { translator } from "../locales.js";
import { useAccountsQuery, useOverviewQuery, usePreferencesQuery } from "../queries.js";
import { filtersFromPreferences, resolveUsageQuery } from "../range.js";

type SidebarActionProps = SidebarFooterActionOwnerProps & PropsLocale<"usage-stats">;

export function SidebarAction({ wide, t: rawTranslate }: SidebarActionProps) {
	const t = translator(rawTranslate);
	const preferencesQuery = usePreferencesQuery();
	const preferences =
		preferencesQuery.data?.ok === true
			? preferencesQuery.data.data
			: defaultUserPreferences(Intl.DateTimeFormat().resolvedOptions().timeZone);
	const query = useMemo(() => {
		const filters = filtersFromPreferences(preferences);
		return resolveUsageQuery({ ...filters, range: "today", compare: false }, preferences.display.timeZone);
	}, [preferences]);
	const overview = useOverviewQuery(query);
	const accounts = useAccountsQuery(preferences.display.sidebarMetric === "lowestQuota");
	const data = overview.data?.ok === true ? overview.data.data : null;
	const metric = (() => {
		if (data === null) return "—";
		switch (preferences.display.sidebarMetric) {
			case "todayTokens":
				return formatCompact(
					data.current.inputTokens +
						data.current.outputTokens +
						data.current.cacheReadTokens +
						data.current.cacheWriteTokens,
				);
			case "todayCost":
				return formatCurrency(data.cost.amount, data.cost.currency);
			case "alerts":
				return String(data.alertCount);
			case "lowestQuota": {
				const hidden = new Set(preferences.providers.hidden);
				const snapshots = accounts.data?.ok === true ? accounts.data.data.accounts : [];
				const remaining = snapshots
					.filter(({ providerId }) => !hidden.has(providerId))
					.flatMap(({ windows }) => windows)
					.map((window) => (window.usedRatio === null ? null : 1 - window.usedRatio))
					.filter((value): value is number => value !== null)
					.sort((left, right) => left - right)[0];
				return remaining === undefined ? "—" : `${Math.round(remaining * 100)}%`;
			}
		}
	})();
	return (
		<button
			type="button"
			className="dus-sidebar-button"
			aria-label={t("sidebar.open")}
			onClick={() => usageUiController.openPeek()}
		>
			<span className="dus-sidebar-glyph">
				<svg className="dus-sidebar-icon" viewBox="0 0 20 20" aria-hidden="true">
					<path
						d="M3 15.5V10m4.7 5.5V5.7m4.6 9.8V8.2m4.7 7.3V3.5"
						fill="none"
						stroke="currentColor"
						strokeWidth="1.7"
						strokeLinecap="round"
					/>
				</svg>
				{data?.alertCount ? <span className="dus-sidebar-alert">{data.alertCount}</span> : null}
			</span>
			{wide ? (
				<span className="dus-sidebar-copy">
					<span className="dus-sidebar-label">{t("sidebar.label")}</span>
					<strong className="dus-sidebar-metric">{metric}</strong>
				</span>
			) : null}
		</button>
	);
}
