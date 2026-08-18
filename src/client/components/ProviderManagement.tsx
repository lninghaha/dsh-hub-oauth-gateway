import type { ProviderConnection, ProviderRecord, ProvidersData } from "../../shared/providers.js";
import type { Translate, UsageLocaleKey } from "../locales.js";
import { useProvidersQuery } from "../queries.js";

function countClass(kind: "connected" | "needsAttention" | "unconfigured" | "unsupported"): string {
	return `dus-provider-count is-${kind}`;
}

function statusClass(connection: ProviderConnection): string {
	if (connection === "connected") return "dus-credential-status is-configured";
	if (connection === "unconfigured" || connection === "unsupported") return "dus-credential-status";
	return "dus-credential-status is-attention";
}

function ProviderCard({ provider, t }: { readonly provider: ProviderRecord; readonly t: Translate }) {
	return (
		<article className="dus-provider-card">
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
		</article>
	);
}

export function ProviderManagement({ t }: { readonly t: Translate }) {
	const query = useProvidersQuery();
	const data: ProvidersData | undefined = query.data?.ok === true ? query.data.data : undefined;
	return (
		<div className="dus-settings-card">
			<div>
				<h3>{t("settings.credentials")}</h3>
				<p>{t("settings.credentialsIntro")}</p>
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
						<div className="dus-provider-grid">
							{data.providers.map((provider) => (
								<ProviderCard key={provider.id} provider={provider} t={t} />
							))}
						</div>
					)}
				</>
			)}
		</div>
	);
}
