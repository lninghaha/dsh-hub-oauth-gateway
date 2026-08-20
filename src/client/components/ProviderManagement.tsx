import { useState } from "react";
import type {
	ProviderConnection,
	ProviderCredentialMeta,
	ProviderRecord,
	ProvidersData,
} from "../../shared/providers.js";
import type { Translate, UsageLocaleKey } from "../locales.js";
import {
	useDeviceCodeMutation,
	useDevicePollMutation,
	usePreferencesQuery,
	useProvidersQuery,
	useRefreshMutation,
	useSavePreferencesMutation,
	useSetCredentialMutation,
	useUnsetCredentialMutation,
} from "../queries.js";
import { Toggle } from "./controls.js";

function countClass(kind: "connected" | "needsAttention" | "unconfigured" | "unsupported"): string {
	return `dus-provider-count is-${kind}`;
}

function statusClass(connection: ProviderConnection): string {
	if (connection === "connected") return "dus-credential-status is-configured";
	if (connection === "unconfigured" || connection === "unsupported") return "dus-credential-status";
	return "dus-credential-status is-attention";
}

function supportsOAuthFlow(provider: ProviderRecord): boolean {
	return provider.capabilities.supportsOAuth || provider.authSource === "oauth" || provider.authSource === "local-cli";
}

function nextStepKey(provider: ProviderRecord): UsageLocaleKey {
	if (provider.connection === "unsupported") return "providers.next.unsupported";
	if (provider.connection === "connected") return "providers.next.connected";
	if (provider.connection === "expired" || provider.connection === "expiring") return "providers.next.refresh";
	if (supportsOAuthFlow(provider)) return "providers.next.oauth";
	if (provider.authSource === "api-key" || provider.credentials.length > 0) return "providers.next.apiKey";
	return "providers.next.review";
}

function diagnosticLabel(code: string, t: Translate): string {
	const key = `quotaDiag.${code}` as UsageLocaleKey;
	const localized = t(key);
	return localized === key ? code : localized;
}

function groupId(provider: ProviderRecord): "needsAttention" | "connected" | "unconfigured" | "unsupported" {
	if (provider.connection === "unsupported") return "unsupported";
	if (provider.connection === "connected") return "connected";
	if (provider.connection === "unconfigured") return "unconfigured";
	return "needsAttention";
}

/** Preference id used for dashboard visibility: account id when linked. */
function visibilityId(provider: ProviderRecord): string {
	return provider.accountProviderId ?? provider.id;
}

function CredentialRow({
	meta,
	editable,
	t,
}: {
	readonly meta: ProviderCredentialMeta;
	readonly editable: boolean;
	readonly t: Translate;
}) {
	const save = useSetCredentialMutation();
	const unset = useUnsetCredentialMutation();
	const [value, setValue] = useState("");
	const error = [save.error, unset.error].find((candidate): candidate is Error => candidate instanceof Error);
	return (
		<div className="dus-provider-credential" data-credential-ref={meta.ref}>
			<div className="dus-provider-credential-head">
				<code>{meta.ref}</code>
				<span className={`dus-credential-status${meta.configured ? " is-configured" : ""}`}>
					{meta.configured ? t("credential.configured") : t("credential.missing")}
				</span>
			</div>
			{meta.source === "oauth" ? (
				<span className="dus-row-hint">{t("providers.credentialOAuthManaged")}</span>
			) : editable ? (
				<div className="dus-inline-actions">
					<input
						className="dus-input"
						type="password"
						autoComplete="new-password"
						placeholder="••••••••"
						aria-label={`${meta.ref} · ${t("credential.value")}`}
						value={value}
						onChange={(event) => setValue(event.target.value)}
					/>
					<button
						type="button"
						className="dus-button is-primary is-small"
						disabled={value.trim() === "" || save.isPending}
						onClick={() => save.mutate({ ref: meta.ref, value: value.trim() }, { onSuccess: () => setValue("") })}
					>
						{t("credential.save")}
					</button>
					<button
						type="button"
						className="dus-button is-small"
						disabled={!meta.configured || unset.isPending}
						onClick={() => unset.mutate(meta.ref)}
					>
						{t("credential.remove")}
					</button>
				</div>
			) : (
				<span className="dus-row-hint">{t("providers.credentialReadOnly")}</span>
			)}
			{error === undefined ? null : (
				<p className="dus-error-inline" role="alert">
					{error.message}
				</p>
			)}
		</div>
	);
}

function DeviceAuthRow({ providerId, t }: { readonly providerId: string; readonly t: Translate }) {
	const device = useDeviceCodeMutation();
	const poll = useDevicePollMutation();
	const deviceData = device.data?.ok === true ? device.data.data : null;
	const authorized = poll.data?.ok === true && poll.data.data.pending === false;
	const error = [device.error, poll.error].find((candidate): candidate is Error => candidate instanceof Error);
	return (
		<div className="dus-provider-device" data-device-provider={providerId}>
			{authorized ? (
				<span className="dus-save-state">{t("providers.deviceDone")}</span>
			) : deviceData === null ? (
				<button
					type="button"
					className="dus-button is-small"
					disabled={device.isPending}
					onClick={() => device.mutate(providerId)}
				>
					{t("credential.start")}
				</button>
			) : (
				<div className="dus-inline-actions">
					<span>{t("credential.code", { code: deviceData.userCode })}</span>
					<a className="dus-button is-small" href={deviceData.verificationUri} target="_blank" rel="noreferrer">
						{t("credential.open")}
					</a>
					<button
						type="button"
						className="dus-button is-primary is-small"
						disabled={poll.isPending}
						onClick={() => poll.mutate({ providerId, flowId: deviceData.flowId })}
					>
						{t("credential.poll")}
					</button>
				</div>
			)}
			{error === undefined ? null : (
				<p className="dus-error-inline" role="alert">
					{error.message}
				</p>
			)}
		</div>
	);
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
	const refresh = useRefreshMutation();
	const next = nextStepKey(provider);
	const showAccountsCta = supportsOAuthFlow(provider);
	const canEditCredentials = provider.connection !== "unsupported";
	const canRefresh =
		provider.accountProviderId !== null && provider.capabilities.canRefresh && provider.connection !== "unsupported";
	const supportsDeviceAuth = provider.accountProviderId === "copilot";
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
			{provider.credentials.length === 0 ? null : (
				<div className="dus-provider-credentials">
					<span className="dus-provider-credentials-title">{t("providers.credentialsTitle")}</span>
					{provider.credentials.map((meta) => (
						<CredentialRow key={meta.ref} meta={meta} editable={meta.writable && canEditCredentials} t={t} />
					))}
				</div>
			)}
			{supportsDeviceAuth ? <DeviceAuthRow providerId="copilot" t={t} /> : null}
			{provider.warnings.length === 0 ? null : (
				<ul className="dus-provider-warnings">
					{provider.warnings.map((warning) => (
						<li key={warning}>{diagnosticLabel(warning, t)}</li>
					))}
				</ul>
			)}
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
				{canRefresh ? (
					<button
						type="button"
						className="dus-button is-small"
						data-provider-refresh={provider.id}
						disabled={refresh.isPending}
						onClick={() =>
							refresh.mutate({
								scope: "accounts",
								...(provider.accountProviderId === null ? {} : { providerIds: [provider.accountProviderId] }),
							})
						}
					>
						{refresh.isPending ? t("providers.refreshing") : t("providers.refreshNow")}
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

	const setVisible = (provider: ProviderRecord, visible: boolean): void => {
		if (prefs === null) return;
		// Visibility preferences are keyed by the account provider id so they stay
		// aligned with the dashboard account grid; the record id is removed too so
		// entries written by older builds cannot keep a provider hidden.
		const ids = new Set([visibilityId(provider), provider.id]);
		const nextHidden = visible
			? prefs.providers.hidden.filter((id) => !ids.has(id))
			: [...new Set([...prefs.providers.hidden, visibilityId(provider)])];
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
												hidden={hidden.has(visibilityId(provider)) || hidden.has(provider.id)}
												onToggleVisible={(visible) => setVisible(provider, visible)}
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
