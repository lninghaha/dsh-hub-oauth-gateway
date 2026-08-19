import { Modal } from "@deepseek-ai/dsh-client-ui-primitives";
import type { PropsLocale } from "@deepseek-ai/dsh-client-ui-slots";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import type { OverviewData, UsageAlert } from "../../shared/contracts.js";
import type { UsageMetric } from "../../shared/domain.js";
import { totalTokens } from "../../shared/domain.js";
import { type DashboardModuleId, defaultUserPreferences, effectiveModules } from "../../shared/preferences.js";
import { UsageStatsApiError } from "../api.js";
import { usageUiController, useUsageUi } from "../controller.js";
import {
	type DashboardTabId,
	dashboardTabsForModules,
	modulesForDashboardTab,
	resolveDashboardTab,
} from "../dashboard-tabs.js";
import { deltaRatio, formatCompact, formatCurrency, formatPercent, formatRelativeTime } from "../format.js";
import { type Translate, translator } from "../locales.js";
import {
	exportUrl,
	useAccountsQuery,
	useActivityQuery,
	useAlertsQuery,
	useBreakdownQuery,
	useFeesQuery,
	useOverviewQuery,
	usePreferencesQuery,
	useRefreshMutation,
	useSeriesQuery,
} from "../queries.js";
import {
	type DashboardFilters,
	type DashboardRangePreset,
	filtersFromPreferences,
	resolveUsageQuery,
} from "../range.js";
import { AccountGrid } from "./AccountGrid.js";
import { ActivityHeatmap } from "./ActivityHeatmap.js";
import { BreakdownTable } from "./BreakdownTable.js";
import { LocalMonitorSection } from "./LocalMonitorSection.js";
import { UsageChart } from "./UsageChart.js";

type UsageOverlayProps = PropsLocale<"usage-stats">;

function comparisonLabel(t: Translate, ratio: number | null): string {
	if (ratio === null) return t("comparison.none");
	const sign = ratio > 0 ? "+" : "";
	return t("comparison.change", { value: `${sign}${Math.round(ratio * 1_000) / 10}%` });
}

function KpiCard({
	label,
	value,
	delta,
	note,
}: {
	readonly label: string;
	readonly value: string;
	readonly delta?: number | null;
	readonly note?: string;
}) {
	return (
		<article className="dus-kpi-card">
			<span className="dus-kpi-label">{label}</span>
			<strong className="dus-kpi-value">{value}</strong>
			{delta === undefined ? null : (
				<span className={`dus-kpi-delta${delta === null ? "" : delta > 0 ? " is-up" : delta < 0 ? " is-down" : ""}`}>
					{note}
				</span>
			)}
		</article>
	);
}

function OverviewCards({ data, t }: { readonly data: OverviewData; readonly t: Translate }) {
	const currentTokens = totalTokens(data.current);
	const previousTokens = data.previous === null ? null : totalTokens(data.previous);
	return (
		<section className="dus-kpi-grid">
			<KpiCard
				label={t("metric.tokens")}
				value={formatCompact(currentTokens)}
				delta={deltaRatio(currentTokens, previousTokens)}
				note={comparisonLabel(t, deltaRatio(currentTokens, previousTokens))}
			/>
			<KpiCard
				label={t("metric.cost")}
				value={formatCurrency(data.cost.amount, data.cost.currency)}
				delta={deltaRatio(data.cost.amount ?? 0, data.previousCost?.amount ?? null)}
				note={
					data.cost.amount === null
						? t("dashboard.coverage", { value: Math.round(data.cost.coverageRatio * 100) })
						: comparisonLabel(t, deltaRatio(data.cost.amount, data.previousCost?.amount ?? null))
				}
			/>
			<KpiCard
				label={t("metric.requests")}
				value={formatCompact(data.requests)}
				delta={deltaRatio(data.requests, data.previousRequests)}
				note={comparisonLabel(t, deltaRatio(data.requests, data.previousRequests))}
			/>
			<KpiCard
				label={t("metric.cacheHit")}
				value={formatPercent(data.cacheHitRate)}
				delta={
					data.cacheHitRate === null || data.previousCacheHitRate === null
						? null
						: data.cacheHitRate - data.previousCacheHitRate
				}
				note={comparisonLabel(
					t,
					data.cacheHitRate === null || data.previousCacheHitRate === null
						? null
						: data.cacheHitRate - data.previousCacheHitRate,
				)}
			/>
		</section>
	);
}

const ACCOUNT_STATUS_KEYS: ReadonlySet<string> = new Set([
	"ok",
	"pending",
	"not-configured",
	"unsupported",
	"auth-error",
	"rate-limited",
	"unavailable",
	"error",
	"stale",
]);

function localizeAlertTitle(alert: UsageAlert, t: Translate): string {
	if (alert.kind === "cost") {
		const currency = /^[A-Z]{3}$/.test(alert.title)
			? alert.title
			: (/\(([A-Z]{3})\)/.exec(alert.title)?.[1] ?? alert.title);
		return t("alert.dailyCost", { currency: currency || "—" });
	}
	const separator = alert.title.indexOf(": ");
	if (separator < 0) return alert.title;
	const name = alert.title.slice(0, separator);
	const detail = alert.title.slice(separator + 2);
	if (alert.kind === "account" && ACCOUNT_STATUS_KEYS.has(detail)) {
		return `${name}: ${t(`status.${detail}` as "status.ok")}`;
	}
	return alert.title;
}

function AlertList({
	alerts,
	title,
	t,
	limit = 5,
}: {
	readonly alerts: readonly UsageAlert[];
	readonly title: string;
	readonly t: Translate;
	readonly limit?: number;
}) {
	if (alerts.length === 0) return null;
	return (
		<section className="dus-alert-strip" aria-label={title}>
			{alerts.slice(0, limit).map((alert) => (
				<article className={`dus-alert is-${alert.level}`} key={alert.id}>
					<span className="dus-alert-level">{t(`alert.level.${alert.level}`)}</span>
					<strong>{localizeAlertTitle(alert, t)}</strong>
					{alert.value === null ? null : (
						<span>{alert.kind === "quota" ? formatPercent(alert.value) : alert.value.toLocaleString()}</span>
					)}
				</article>
			))}
		</section>
	);
}

function errorMessage(t: Translate, ...values: readonly unknown[]): string | null {
	for (const value of values) {
		if (value instanceof UsageStatsApiError && value.code === "cross-site-rejected") return t("error.browserContext");
		if (value instanceof Error) return value.message;
	}
	return null;
}

function Toolbar({
	filters,
	onChange,
	refreshing,
	onRefresh,
	exportFilteredCsv,
	exportDailyCsv,
	exportBundleJson,
	t,
}: {
	readonly filters: DashboardFilters;
	readonly onChange: (value: DashboardFilters) => void;
	readonly refreshing: boolean;
	readonly onRefresh: () => void;
	readonly exportFilteredCsv: string;
	readonly exportDailyCsv: string;
	readonly exportBundleJson: string;
	readonly t: Translate;
}) {
	const ranges: readonly DashboardRangePreset[] = ["today", "7d", "30d", "month"];
	return (
		<div className="dus-toolbar">
			<fieldset className="dus-segmented">
				<legend className="dus-sr-only">{t("toolbar.range")}</legend>
				{ranges.map((range) => (
					<button
						type="button"
						className={filters.range === range ? "is-active" : ""}
						onClick={() => onChange({ ...filters, range })}
						key={range}
					>
						{t(`range.${range}`)}
					</button>
				))}
			</fieldset>
			<label className="dus-select-label">
				<span className="dus-sr-only">{t("toolbar.metric")}</span>
				<select
					value={filters.metric}
					onChange={(event) => onChange({ ...filters, metric: event.target.value as UsageMetric })}
				>
					<option value="tokens">{t("metric.tokens")}</option>
					<option value="estimatedCost">{t("metric.cost")}</option>
					<option value="requests">{t("metric.requests")}</option>
					<option value="cacheHitRate">{t("metric.cacheHit")}</option>
				</select>
			</label>
			<label className="dus-select-label">
				<span className="dus-sr-only">{t("toolbar.group")}</span>
				<select
					value={filters.groupBy}
					onChange={(event) => onChange({ ...filters, groupBy: event.target.value as DashboardFilters["groupBy"] })}
				>
					<option value="provider">{t("group.provider")}</option>
					<option value="model">{t("group.model")}</option>
					<option value="none">{t("group.none")}</option>
				</select>
			</label>
			<label className="dus-check-label">
				<input
					type="checkbox"
					checked={filters.compare}
					onChange={(event) => onChange({ ...filters, compare: event.target.checked })}
				/>
				<span>{t("toolbar.compare")}</span>
			</label>
			<span className="dus-toolbar-spacer" />
			<button type="button" className="dus-button is-small" onClick={onRefresh} disabled={refreshing}>
				{refreshing ? t("toolbar.refreshing") : t("toolbar.refresh")}
			</button>
			<details className="dus-export-menu">
				<summary className="dus-button is-small">{t("toolbar.export")}</summary>
				<div className="dus-export-menu-panel">
					<a className="dus-button is-small" href={exportFilteredCsv} download>
						{t("toolbar.exportCsv")}
					</a>
					<a className="dus-button is-small" href={exportDailyCsv} download>
						{t("toolbar.exportDaily")}
					</a>
					<a className="dus-button is-small" href={exportBundleJson} download>
						{t("toolbar.exportBundle")}
					</a>
				</div>
			</details>
		</div>
	);
}

export function UsageOverlay({ t: rawTranslate }: UsageOverlayProps) {
	const t = translator(rawTranslate);
	const ui = useUsageUi();
	const open = ui.surface !== "closed";
	const preferencesQuery = usePreferencesQuery(open);
	const preferences =
		preferencesQuery.data?.ok === true
			? preferencesQuery.data.data
			: defaultUserPreferences(Intl.DateTimeFormat().resolvedOptions().timeZone);
	const initialized = useRef(false);
	const [filters, setFilters] = useState<DashboardFilters>(() => filtersFromPreferences(preferences));
	useEffect(() => {
		if (preferencesQuery.data?.ok !== true || initialized.current) return;
		initialized.current = true;
		setFilters(filtersFromPreferences(preferencesQuery.data.data));
	}, [preferencesQuery.data]);
	useEffect(() => {
		if (ui.selectedProviderId === null) return;
		setFilters((current) => ({ ...current, providerIds: [ui.selectedProviderId as string] }));
	}, [ui.selectedProviderId]);

	const modules = useMemo(() => effectiveModules(preferences), [preferences]);
	const dashboardTabs = useMemo(() => dashboardTabsForModules(modules), [modules]);
	const [activeDashboardTab, setActiveDashboardTab] = useState<DashboardTabId | null>(null);
	const resolvedDashboardTab = useMemo(
		() => resolveDashboardTab(activeDashboardTab, dashboardTabs),
		[activeDashboardTab, dashboardTabs],
	);
	const showHeatmap = modules.includes("heatmap");
	const showTrend = modules.includes("trend");
	const showAccounts = modules.includes("accounts");
	const showAlerts = modules.includes("alerts");
	const showBreakdown = modules.includes("breakdown");

	const effectiveFilters = useMemo<DashboardFilters>(
		() => (ui.surface === "peek" ? { ...filters, range: "today", groupBy: "provider", compare: true } : filters),
		[filters, ui.surface],
	);
	const query = useMemo(
		() => resolveUsageQuery(effectiveFilters, preferences.display.timeZone),
		[effectiveFilters, preferences.display.timeZone],
	);
	const overview = useOverviewQuery(query, open);
	const monthQuery = useMemo(
		() => resolveUsageQuery({ ...effectiveFilters, range: "month", compare: false }, preferences.display.timeZone),
		[effectiveFilters, preferences.display.timeZone],
	);
	const showAccountsSurface =
		ui.surface === "peek" || (ui.surface === "dashboard" && resolvedDashboardTab === "accounts");
	const showAlertsSurface =
		(ui.surface === "peek" && showAlerts) ||
		(ui.surface === "dashboard" && resolvedDashboardTab === "overview" && showAlerts);
	const monthOverview = useOverviewQuery(monthQuery, open && showAccountsSurface && showAccounts);
	const accounts = useAccountsQuery(open);
	const alerts = useAlertsQuery(open && showAlertsSurface);
	const series = useSeriesQuery(query, ui.surface === "dashboard" && resolvedDashboardTab === "activity" && showTrend);
	const activity = useActivityQuery(
		filters.metric === "estimatedCost" || filters.metric === "requests" ? filters.metric : "tokens",
		ui.surface === "dashboard" && resolvedDashboardTab === "activity" && showHeatmap,
		filters.providerIds,
	);
	const fees = useFeesQuery(open && showAccountsSurface && showAccounts);
	const dimension = filters.groupBy === "model" ? "model" : "provider";
	const breakdown = useBreakdownQuery(
		query,
		dimension,
		ui.surface === "dashboard" && resolvedDashboardTab === "breakdown" && showBreakdown,
	);
	const refresh = useRefreshMutation();
	const overviewData = overview.data?.ok === true ? overview.data.data : null;
	const monthCostAmount =
		monthOverview.data?.ok === true ? monthOverview.data.data.cost.amount : (overviewData?.cost.amount ?? null);
	const hiddenProviders = useMemo(() => new Set(preferences.providers.hidden), [preferences.providers.hidden]);
	const accountData = useMemo(() => {
		const order = new Map(preferences.providers.order.map((providerId, index) => [providerId, index]));
		return (accounts.data?.ok === true ? accounts.data.data.accounts : [])
			.filter(({ providerId }) => !hiddenProviders.has(providerId))
			.map((account) => ({
				...account,
				displayName: preferences.providers.aliases[account.providerId]?.trim() || account.displayName,
			}))
			.sort(
				(left, right) =>
					(order.get(left.providerId) ?? Number.MAX_SAFE_INTEGER) -
						(order.get(right.providerId) ?? Number.MAX_SAFE_INTEGER) ||
					left.displayName.localeCompare(right.displayName),
			);
	}, [accounts.data, hiddenProviders, preferences.providers.aliases, preferences.providers.order]);
	const feeRecords = fees.data?.ok === true ? fees.data.data.fees : [];
	const alertData = useMemo(
		() =>
			(alerts.data?.ok === true ? alerts.data.data.alerts : [])
				.filter(({ providerId }) => providerId === null || !hiddenProviders.has(providerId))
				.map((alert) => {
					const alias = alert.providerId === null ? undefined : preferences.providers.aliases[alert.providerId]?.trim();
					return alias ? { ...alert, title: `${alias}: ${alert.title.split(":").slice(1).join(":").trim()}` } : alert;
				}),
		[alerts.data, hiddenProviders, preferences.providers.aliases],
	);
	const rawSeriesData = series.data?.ok === true ? series.data.data : null;
	const seriesData = useMemo(() => {
		if (rawSeriesData === null || rawSeriesData.groupBy !== "provider") return rawSeriesData;
		return {
			...rawSeriesData,
			points: rawSeriesData.points.map((point) => ({
				...point,
				values: point.values
					.filter(({ key }) => !hiddenProviders.has(key))
					.map((value) => ({
						...value,
						label: preferences.providers.aliases[value.key]?.trim() || value.label,
					})),
			})),
			forecast: rawSeriesData.forecast.map((point) => ({
				...point,
				values: point.values
					.filter(({ key }) => !hiddenProviders.has(key))
					.map((value) => ({
						...value,
						label: preferences.providers.aliases[value.key]?.trim() || value.label,
					})),
			})),
		};
	}, [hiddenProviders, preferences.providers.aliases, rawSeriesData]);
	const rawBreakdownData = breakdown.data?.ok === true ? breakdown.data.data : null;
	const breakdownData = useMemo(() => {
		if (rawBreakdownData === null || rawBreakdownData.dimension !== "provider") return rawBreakdownData;
		return {
			...rawBreakdownData,
			rows: rawBreakdownData.rows
				.filter(({ key }) => !hiddenProviders.has(key))
				.map((row) => ({
					...row,
					label: preferences.providers.aliases[row.key]?.trim() || row.label,
				})),
		};
	}, [hiddenProviders, preferences.providers.aliases, rawBreakdownData]);
	const activityData = activity.data?.ok === true ? activity.data.data : null;
	const error = errorMessage(t, overview.error);
	const selectedProvider = filters.providerIds[0] ?? null;
	const setProvider = (providerId: string): void => {
		const next = selectedProvider === providerId ? null : providerId;
		usageUiController.selectProvider(next);
		setFilters((current) => ({ ...current, providerIds: next === null ? [] : [next] }));
	};
	const exportFilteredCsv = exportUrl(query, "csv", dimension, "filtered");
	const exportDailyCsv = exportUrl(query, "csv", dimension, "daily");
	const exportBundleJson = exportUrl(query, "json", dimension, "bundle");

	const renderModule = (moduleId: DashboardModuleId): ReactNode => {
		if (overviewData === null) return null;
		switch (moduleId) {
			case "kpi":
				return <OverviewCards data={overviewData} t={t} key="kpi" />;
			case "alerts":
				return <AlertList alerts={alertData} title={t("metric.alerts")} t={t} key="alerts" />;
			case "heatmap":
				return activityData === null ? (
					<section className="dus-section" key="heatmap">
						<div className="dus-chart-empty">{t("dashboard.loading")}</div>
					</section>
				) : (
					<ActivityHeatmap
						data={activityData}
						metric={filters.metric}
						currency={overviewData.cost.currency}
						t={t}
						key="heatmap"
					/>
				);
			case "trend":
				return (
					<section className="dus-section dus-trend-section" key="trend">
						<div className="dus-section-head">
							<h3 className="dus-section-title">{t("trend.title")}</h3>
							<span className="dus-section-note">
								{t(
									`metric.${filters.metric === "estimatedCost" ? "cost" : filters.metric === "cacheHitRate" ? "cacheHit" : filters.metric}`,
								)}
							</span>
						</div>
						{series.error !== null ? (
							<div className="dus-error">{t("dashboard.error", { message: errorMessage(t, series.error) ?? "" })}</div>
						) : seriesData === null ? (
							<div className="dus-chart-empty">{t("dashboard.loading")}</div>
						) : (
							<UsageChart
								data={seriesData}
								metric={filters.metric}
								currency={overviewData.cost.currency}
								colors={preferences.providers.colors}
								emptyLabel={t("dashboard.empty")}
							/>
						)}
					</section>
				);
			case "accounts":
				return (
					<section className="dus-section dus-accounts-section" key="accounts">
						<h3 className="dus-section-title">{t("accounts.title")}</h3>
						<AccountGrid
							accounts={accountData}
							emptyLabel={t("accounts.empty")}
							selectedProviderId={selectedProvider}
							onSelect={setProvider}
							fees={feeRecords}
							monthEstimatedCost={monthCostAmount}
							baseCurrency={preferences.display.baseCurrency}
							t={t}
						/>
					</section>
				);
			case "local":
				return <LocalMonitorSection t={t} key="local" />;
			case "breakdown":
				return (
					<section className="dus-section dus-breakdown-section" key="breakdown">
						<h3 className="dus-section-title">{t("breakdown.title")}</h3>
						{breakdown.error !== null ? (
							<div className="dus-error">
								{t("dashboard.error", { message: errorMessage(t, breakdown.error) ?? "" })}
							</div>
						) : breakdownData === null ? (
							<div className="dus-chart-empty">{t("dashboard.loading")}</div>
						) : (
							<BreakdownTable
								data={breakdownData}
								onSelect={breakdownData.dimension === "provider" ? setProvider : undefined}
								labels={{
									dimension: t("breakdown.dimension"),
									tokens: t("breakdown.tokens"),
									share: t("breakdown.share"),
									requests: t("breakdown.requests"),
									cache: t("breakdown.cache"),
									input: t("breakdown.input"),
									output: t("breakdown.output"),
									cacheRead: t("breakdown.cacheRead"),
									cacheWrite: t("breakdown.cacheWrite"),
									cost: t("breakdown.cost"),
									priced: (value) => t("breakdown.priced", { value }),
								}}
							/>
						)}
					</section>
				);
			default:
				return null;
		}
	};

	const activeTabModules =
		resolvedDashboardTab === null
			? []
			: modulesForDashboardTab(resolvedDashboardTab).filter((id) => modules.includes(id));

	return (
		<div className="dus-overlay-root">
			<Modal
				open={open}
				onClose={() => usageUiController.close()}
				title={ui.surface === "peek" ? t("peek.title") : t("dashboard.title")}
				closeLabel={t("action.close")}
				headless
				className={`dus-modal${ui.surface === "peek" ? " is-peek" : " is-dashboard"}`}
			>
				<div
					className={`dus-dashboard${ui.surface === "peek" ? " is-peek-layout" : ""}${preferences.display.density === "compact" ? " is-density-compact" : ""}${preferences.display.reducedMotion === "always" ? " is-reduced-motion" : preferences.display.reducedMotion === "never" ? " allows-motion" : ""}`}
				>
					<header className="dus-dashboard-header">
						<div>
							<h2 className="dus-dashboard-title">{ui.surface === "peek" ? t("peek.title") : t("dashboard.title")}</h2>
							<p className="dus-dashboard-subtitle">{t("dashboard.subtitle")}</p>
							{overview.data?.ok === true ? (
								<span className="dus-freshness">
									{t("dashboard.updated", { time: formatRelativeTime(overview.data.meta.sourceUpdatedAt) })}
								</span>
							) : null}
						</div>
						<div className="dus-header-actions">
							{ui.surface === "peek" ? (
								<button
									type="button"
									className="dus-button is-primary"
									onClick={() => usageUiController.openDashboard()}
								>
									{t("peek.dashboard")}
								</button>
							) : null}
							<button
								type="button"
								className="dus-button is-small dus-icon-close"
								aria-label={t("action.close")}
								onClick={() => usageUiController.close()}
							>
								×
							</button>
						</div>
					</header>
					{ui.surface === "dashboard" ? (
						<div className="dus-dashboard-chrome">
							<Toolbar
								filters={filters}
								onChange={setFilters}
								refreshing={refresh.isPending}
								onRefresh={() => refresh.mutate("all")}
								exportFilteredCsv={exportFilteredCsv}
								exportDailyCsv={exportDailyCsv}
								exportBundleJson={exportBundleJson}
								t={t}
							/>
							{dashboardTabs.length > 0 ? (
								<nav className="dus-tabs" aria-label={t("dashboard.title")}>
									{dashboardTabs.map((tab) => (
										<button
											key={tab}
											type="button"
											className={`dus-tab${resolvedDashboardTab === tab ? " is-active" : ""}`}
											aria-current={resolvedDashboardTab === tab ? "page" : undefined}
											onClick={() => setActiveDashboardTab(tab)}
										>
											{t(`dashboard.tab.${tab}`)}
										</button>
									))}
								</nav>
							) : null}
						</div>
					) : null}
					<main className="dus-dashboard-body">
						{error !== null ? (
							<div className="dus-error">{t("dashboard.error", { message: error })}</div>
						) : overview.isPending ? (
							<div className="dus-loading">{t("dashboard.loading")}</div>
						) : overviewData === null ? (
							<div className="dus-empty">{t("dashboard.empty")}</div>
						) : ui.surface === "peek" ? (
							<div className="dus-peek-content">
								<OverviewCards data={overviewData} t={t} />
								<AlertList alerts={alertData} title={t("metric.alerts")} t={t} limit={2} />
								<section className="dus-section">
									<div className="dus-section-head">
										<h3 className="dus-section-title">{t("accounts.title")}</h3>
										<span>{formatCompact(overviewData.activeProviders)}</span>
									</div>
									<AccountGrid
										accounts={accountData}
										emptyLabel={t("accounts.emptyGuide")}
										compact
										fees={feeRecords}
										monthEstimatedCost={monthCostAmount}
										baseCurrency={preferences.display.baseCurrency}
										t={t}
									/>
								</section>
							</div>
						) : (
							<>
								{selectedProvider === null ? null : (
									<div className="dus-filter-chip">
										<span>
											{accountData.find(({ providerId }) => providerId === selectedProvider)?.displayName ??
												selectedProvider}
										</span>
										<button type="button" onClick={() => setProvider(selectedProvider)}>
											{t("toolbar.clearFilter")} ×
										</button>
									</div>
								)}
								<div className="dus-module-stack" data-active-tab={resolvedDashboardTab ?? ""}>
									{activeTabModules.map((moduleId) => renderModule(moduleId))}
								</div>
							</>
						)}
					</main>
				</div>
			</Modal>
		</div>
	);
}
