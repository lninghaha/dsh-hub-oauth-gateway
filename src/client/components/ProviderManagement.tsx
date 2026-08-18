import type { ProviderConnection, ProviderRecord, ProvidersData } from "../../shared/providers.js";
import type { Translate, UsageLocaleKey } from "../locales.js";
import { usePreferencesQuery, useProvidersQuery, useSavePreferencesMutation } from "../queries.js";
import { Toggle } from "./controls.js";

function countClass(kind: "connected" | "needsAttention" | "unconfigured" | "unsupported"): string {
	return `dus-provider-count is-${kind}`;
}

function statusClass(connection: ProviderConnection): string {
	if (connection === "connected") return "dus-credential-status is-configured";
	if (connection === "unconfigured" || connection === "unsupported") return "dus-credential-status";
	return "dus-credential-status is-attention";
}

function nextStepKey(provider: ProviderRecord): UsageLocaleKey {
	if (provider.connection === "unsupported") return "providers.next.unsupported";
	if (provider.connection === "connected") return "providers.next.connected";
	if (provider.authSource === "oauth" || provider.authSource === "local-cli") return "providers.next.oauth";
	if (provider.authSource === "api-key") return "providers.next.apiKey";
	if (provider.connection === "expired" || provider.connection === "expiring") return "providers.next.refresh";
	return "providers.next.review";
}

function groupId(provider: ProviderRecord): "needsAttention" | "connected" | "unconfigured" | "unsupported" {
	if (provider.connection === "unsupported") return "unsupported";
	if (provider.connection === "connected") return "connected";
	if (provider.connection === "unconfigured") return "unconfigured";
	return "needsAttention";
}

function ProviderCard({
	provider,
	hidden,
	onToggleVisible,
	onOpenAccounts,
	t,
}: {
	readonly provider: ProviderRecord;
	readonly hidden: boolean;
	readonly onToggleVisible: (visible: boolean) => void;
	readonly onOpenAccounts: () => void;
	readonly t: Translate;
}) {
	const next = nextStepKey(provider);
	const showAccountsCta = provider.authSource === "oauth" || provider.authSource === "local-cli";
	return (
		<article className="dus-provider-card" data-provider-id={provider.id}>
			<div className="dus-provider-card-head">
				<div>
					<strong>{provider.displayName}</strong>
					<div className="dus-muted">{provider.route}</div>
				</div>
				<span className={statusClass(provider.connection)}>
					{t(`connection.${provider.connection}` as UsageLocaleKey)}
				</span>
			</div>
			<dl className="dus-provider-meta">
				<div>
					<dt>{t("providers.auth")}</dt>
					<dd>{t(`authSource.${provider.authSource}` as UsageLocaleKey)}</dd>
				</div>
				<div>
					<dt>{t("providers.token")}</dt>
					<dd>{t(`tokenLifecycle.${provider.tokenLifecycle}` as UsageLocaleKey)}</dd>
				</div>
				<div>
					<dt>{t("providers.models")}</dt>
					<dd>{t(`modelState.${provider.modelState}` as UsageLocaleKey)}</dd>
				</div>
				<div>
					<dt>{t("providers.quota")}</dt>
					<dd>{t(`quotaState.${provider.quotaState}` as UsageLocaleKey)}</dd>
				</div>
			</dl>
			<p className="dus-provider-next">{t(next)}</p>
			<div className="dus-provider-actions">
				<div className="dus-inline-actions">
					<span className="dus-row-hint">{t("providers.showInDashboard")}</span>
					<Toggle
						label={t("providers.showInDashboardNamed", { name: provider.displayName })}
						checked={!hidden}
						onChange={onToggleVisible}
					/>
				</div>
				{showAccountsCta ? (
					<button type="button" className="dus-button is-small" onClick={onOpenAccounts}>
						{t("providers.openAccounts")}
					</button>
				) : null}
			</div>
		</article>
	);
}

const GROUP_ORDER = ["needsAttention", "connected", "unconfigured", "unsupported"] as const;

export function ProviderManagement({
	t,
	onOpenAccounts,
}: {
	readonly t: Translate;
	readonly onOpenAccounts: () => void;
}) {
	const query = useProvidersQuery();
	const preferences = usePreferencesQuery();
	const savePreferences = useSavePreferencesMutation();
	const data: ProvidersData | undefined = query.data?.ok === true ? query.data.data : undefined;
	const prefs = preferences.data?.ok === true ? preferences.data.data : null;
	const hidden = new Set(prefs?.providers.hidden ?? []);

	const setVisible = (providerId: string, visible: boolean): void => {
		if (prefs === null) return;
		const nextHidden = visible
			? prefs.providers.hidden.filter((id) => id !== providerId)
			: [...new Set([...prefs.providers.hidden, providerId])];
		savePreferences.mutate({
			...prefs,
			providers: { ...prefs.providers, hidden: nextHidden },
		});
	};

	const grouped = new Map<(typeof GROUP_ORDER)[number], ProviderRecord[]>();
	for (const id of GROUP_ORDER) grouped.set(id, []);
	for (const provider of data?.providers ?? []) {
		grouped.get(groupId(provider))?.push(provider);
	}

	return (
		<div className="dus-settings-card">
			<div>
				<h3>{t("settings.providersTitle")}</h3>
				<p>{t("settings.providersIntro")}</p>
			</div>
			{query.isError ? (
				<p className="dus-error-inline" role="alert">
					{t("dashboard.error", { message: query.error instanceof Error ? query.error.message : "unavailable" })}
				</p>
			) : null}
			{data === undefined ? (
				<p className="dus-muted">{t("dashboard.loading")}</p>
			) : (
				<>
					<div className="dus-provider-summary" aria-live="polite">
						<span className={countClass("connected")}>
							{t("providers.connected")}: {data.summary.connected}
						</span>
						<span className={countClass("needsAttention")}>
							{t("providers.needsAttention")}: {data.summary.needsAttention}
						</span>
						<span className={countClass("unconfigured")}>
							{t("providers.unconfigured")}: {data.summary.unconfigured}
						</span>
					</div>
					{data.providers.length === 0 ? (
						<p className="dus-muted">{t("providers.empty")}</p>
					) : (
						GROUP_ORDER.map((group) => {
							const providers = grouped.get(group) ?? [];
							if (providers.length === 0) return null;
							return (
								<div className="dus-provider-group" key={group} data-provider-group={group}>
									<h4 className="dus-provider-group-title">{t(`providers.group.${group}`)}</h4>
									<div className="dus-provider-grid">
										{providers.map((provider) => (
											<ProviderCard
												key={provider.id}
												provider={provider}
												hidden={hidden.has(provider.id)}
												onToggleVisible={(visible) => setVisible(provider.id, visible)}
												onOpenAccounts={onOpenAccounts}
												t={t}
											/>
										))}
									</div>
								</div>
							);
						})
					)}
				</>
			)}
		</div>
	);
}
