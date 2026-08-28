/**
 * Accounts tab for the integrated coding-subscription OAuth settings:
 * per-provider sign-in cards (Grok PKCE/device, Codex/Kimi/Claude subscription
 * OAuth), model selection, and the allowlisted CLI credential pull wizard.
 * The server owns every secret; this panel only renders secret-free state.
 */

import { useEffect, useState } from "react";
import type {
	AccountSummary,
	CodingOAuthProviderSlug,
	GrokBuildWebAuthStatus,
	OAuthImportPreview,
	OAuthSourceDiscovery,
	SubscriptionWebAuthStatus,
} from "../../../shared/coding-oauth.js";
import { OAUTH_MAX_ACCOUNTS } from "../../../shared/coding-oauth.js";
import {
	useCodingOAuthCancelMutation,
	useCodingOAuthCodeMutation,
	useCodingOAuthLoginMutation,
	useCodingOAuthLogoutMutation,
	useCodingOAuthModelsMutation,
	useCodingOAuthRemoveAccountMutation,
	useCodingOAuthSetActiveAccountMutation,
	useCodingOAuthStatusQuery,
	useOAuthSourceCancelMutation,
	useOAuthSourceCommitMutation,
	useOAuthSourcePreviewMutation,
	useOAuthSourcesQuery,
} from "../../coding-oauth-api.js";
import type { Translate } from "../../locales.js";
import { SettingsRow } from "../controls.js";

type ProviderStatus = GrokBuildWebAuthStatus | SubscriptionWebAuthStatus;

function statusLabel(t: Translate, status: ProviderStatus["status"]): string {
	switch (status) {
		case "signed-out":
			return t("oauth.status.signedOut");
		case "signing-in":
			return t("oauth.status.signingIn");
		case "signed-in":
			return t("oauth.status.signedIn");
		default:
			return t("oauth.status.error");
	}
}

function stateDot(status: ProviderStatus["status"]): string {
	switch (status) {
		case "signed-in":
			return "is-ok";
		case "signing-in":
			return "is-running";
		case "error":
			return "is-error";
		default:
			return "";
	}
}

function formatExpiry(t: Translate, expiresAt: number | undefined): string | null {
	if (expiresAt === undefined) return null;
	const remainingMs = expiresAt - Date.now();
	if (remainingMs <= 0) return t("oauth.tokenExpired");
	const minutes = Math.round(remainingMs / 60_000);
	if (minutes < 60) return t("oauth.tokenExpiresIn", { value: `${minutes}m` });
	const hours = Math.floor(minutes / 60);
	if (hours < 48) return t("oauth.tokenExpiresIn", { value: `${hours}h` });
	return t("oauth.tokenExpiresIn", { value: `${Math.floor(hours / 24)}d` });
}

function ModelPicker({
	provider,
	available,
	selected,
	t,
}: {
	readonly provider: CodingOAuthProviderSlug;
	readonly available: readonly string[];
	readonly selected: readonly string[];
	readonly t: Translate;
}) {
	const save = useCodingOAuthModelsMutation();
	const [draft, setDraft] = useState<readonly string[]>(selected);
	const [dirty, setDirty] = useState(false);
	useEffect(() => {
		if (!dirty) setDraft(selected);
	}, [selected, dirty]);
	const toggle = (modelId: string): void => {
		setDirty(true);
		setDraft((current) => (current.includes(modelId) ? current.filter((id) => id !== modelId) : [...current, modelId]));
	};
	return (
		<div className="dus-oauth-models">
			<div className="dus-row-hint">{t("oauth.modelsHint")}</div>
			{available.length === 0 ? (
				<div className="dus-row-hint">{t("oauth.modelsEmpty")}</div>
			) : (
				available.map((modelId) => (
					<label className="dus-check-label" key={modelId}>
						<input type="checkbox" checked={draft.includes(modelId)} onChange={() => toggle(modelId)} />
						<span>{modelId}</span>
					</label>
				))
			)}
			{available.length === 0 ? null : (
				<div className="dus-inline-actions">
					<button
						type="button"
						className="dus-button is-primary"
						disabled={save.isPending || !dirty}
						onClick={() => save.mutate({ provider, selected: draft }, { onSuccess: () => setDirty(false) })}
					>
						{t("oauth.modelsSave")}
					</button>
					{save.isSuccess && !dirty ? <span className="dus-save-state">{t("oauth.modelsSaved")}</span> : null}
				</div>
			)}
		</div>
	);
}

function SigningInPanel({
	provider,
	status,
	t,
}: {
	readonly provider: CodingOAuthProviderSlug;
	readonly status: ProviderStatus & { status: "signing-in" };
	readonly t: Translate;
}) {
	const code = useCodingOAuthCodeMutation();
	const cancel = useCodingOAuthCancelMutation();
	const [pasted, setPasted] = useState("");
	const needsCode = status.method !== "device";
	return (
		<div className="dus-oauth-challenge">
			{status.url === undefined ? null : (
				<a className="dus-button" href={status.url} target="_blank" rel="noreferrer">
					{t("oauth.openPage")}
				</a>
			)}
			{status.userCode === undefined ? null : <code className="dus-oauth-code">{status.userCode}</code>}
			{needsCode ? (
				<form
					className="dus-inline-actions"
					onSubmit={(event) => {
						event.preventDefault();
						const value = pasted.trim();
						if (value.length > 0) code.mutate({ provider, code: value });
					}}
				>
					<input
						className="dus-input"
						value={pasted}
						aria-label={t("oauth.pasteCode")}
						placeholder={t("oauth.pasteCode")}
						onChange={(event) => setPasted(event.target.value)}
					/>
					<button type="submit" className="dus-button is-primary" disabled={code.isPending || pasted.trim() === ""}>
						{t("oauth.submitCode")}
					</button>
				</form>
			) : (
				<span className="dus-row-hint">{t("oauth.waitingDevice")}</span>
			)}
			{code.error instanceof Error ? (
				<span className="dus-error-inline" role="alert">
					{code.error.message}
				</span>
			) : null}
			<button type="button" className="dus-button" disabled={cancel.isPending} onClick={() => cancel.mutate(provider)}>
				{t("oauth.cancelLogin")}
			</button>
		</div>
	);
}

function AccountList({
	provider,
	accounts,
	activeAccountId,
	methods,
	t,
}: {
	readonly provider: CodingOAuthProviderSlug;
	readonly accounts: readonly AccountSummary[];
	readonly activeAccountId: string;
	readonly methods: readonly { id: string; label: string }[];
	readonly t: Translate;
}) {
	const setActive = useCodingOAuthSetActiveAccountMutation();
	const remove = useCodingOAuthRemoveAccountMutation();
	const login = useCodingOAuthLoginMutation();
	const atCap = accounts.length >= OAUTH_MAX_ACCOUNTS;
	const mutationError = [setActive.error, remove.error, login.error].find(
		(value): value is Error => value instanceof Error,
	);
	return (
		<div className="dus-oauth-accounts">
			<div className="dus-row-hint">{t("oauth.accountsListHint")}</div>
			<ul className="dus-oauth-account-list">
				{accounts.map((account) => {
					const isActive = account.id === activeAccountId;
					const title = account.label ?? account.accountId ?? account.id;
					return (
						<li className="dus-oauth-account-row" key={account.id} data-account-id={account.id}>
							<span className="dus-oauth-account-label">
								{title}
								{isActive ? (
									<span className="dus-row-hint"> · {t("oauth.accountActive")}</span>
								) : null}
							</span>
							<div className="dus-inline-actions">
								{isActive ? null : (
									<button
										type="button"
										className="dus-button"
										disabled={setActive.isPending}
										onClick={() => setActive.mutate({ provider, accountId: account.id })}
									>
										{t("oauth.accountSetDefault")}
									</button>
								)}
								<button
									type="button"
									className="dus-button is-danger"
									disabled={remove.isPending}
									onClick={() => remove.mutate({ provider, accountId: account.id })}
								>
									{t("oauth.accountRemove")}
								</button>
							</div>
						</li>
					);
				})}
			</ul>
			{atCap ? (
				<div className="dus-row-hint">{t("oauth.accountsAtCap", { max: OAUTH_MAX_ACCOUNTS })}</div>
			) : (
				<div className="dus-inline-actions">
					{methods.map((method) => (
						<button
							key={method.id}
							type="button"
							className="dus-button"
							disabled={login.isPending}
							onClick={() => login.mutate({ provider, method: method.id, accountMode: "add" })}
						>
							{t("oauth.accountAdd")} · {method.label}
						</button>
					))}
				</div>
			)}
			{mutationError === undefined ? null : (
				<p className="dus-error-inline" role="alert">
					{mutationError.message}
				</p>
			)}
		</div>
	);
}

function ProviderCard({
	provider,
	title,
	note,
	status,
	methods,
	source,
	t,
}: {
	readonly provider: CodingOAuthProviderSlug;
	readonly title: string;
	readonly note: string;
	readonly status: ProviderStatus;
	readonly methods: readonly { id: string; label: string }[];
	readonly source: OAuthSourceDiscovery | null;
	readonly t: Translate;
}) {
	const login = useCodingOAuthLoginMutation();
	const logout = useCodingOAuthLogoutMutation();
	const [expanded, setExpanded] = useState(status.status === "signing-in");
	useEffect(() => {
		if (status.status === "signing-in") setExpanded(true);
	}, [status.status]);
	const error = [login.error, logout.error].find((value): value is Error => value instanceof Error);
	const expiresAt = status.status === "signed-in" && "expiresAt" in status ? status.expiresAt : undefined;
	const expiryLabel = formatExpiry(t, expiresAt);
	return (
		<article className="dus-oauth-card" data-oauth-provider={provider}>
			<header className="dus-oauth-card-head">
				<button type="button" className="dus-oauth-card-toggle" onClick={() => setExpanded((value) => !value)}>
					<span className={`dus-state-dot ${stateDot(status.status)}`} aria-hidden="true" />
					<strong>{title}</strong>
					<span className="dus-row-hint">{statusLabel(t, status.status)}</span>
					<span className="dus-oauth-chevron" aria-hidden="true">
						{expanded ? "−" : "+"}
					</span>
				</button>
			</header>
			{expanded ? (
				<div className="dus-oauth-card-body">
					<p className="dus-row-hint">{note}</p>
					{error === undefined ? null : (
						<p className="dus-error-inline" role="alert">
							{error.message}
						</p>
					)}
					{status.status === "error" ? (
						<p className="dus-error-inline" role="alert">
							{status.message}
						</p>
					) : null}
					{status.status === "signed-out" || status.status === "error" ? (
						<div className="dus-inline-actions">
							{methods.map((method) => (
								<button
									key={method.id}
									type="button"
									className="dus-button is-primary"
									disabled={login.isPending}
									onClick={() => login.mutate({ provider, method: method.id, accountMode: "add" })}
								>
									{method.label}
								</button>
							))}
						</div>
					) : null}
					{status.status === "signing-in" ? <SigningInPanel provider={provider} status={status} t={t} /> : null}
					{status.status === "signed-in" ? (
						<>
							{expiryLabel === null ? null : <span className="dus-row-hint">{expiryLabel}</span>}
							<AccountList
								provider={provider}
								accounts={status.accounts}
								activeAccountId={status.activeAccountId}
								methods={methods}
								t={t}
							/>
							<ModelPicker provider={provider} available={status.available} selected={status.selected} t={t} />
							<div className="dus-inline-actions">
								<button
									type="button"
									className="dus-button is-danger"
									disabled={logout.isPending}
									onClick={() => logout.mutate(provider)}
								>
									{t("oauth.logout")}
								</button>
							</div>
						</>
					) : null}
					{source === null ? null : (
						<div className="dus-oauth-card-pull">
							<div className="dus-row-hint">{t("oauth.importInlineHint")}</div>
							<CliPullRow source={source} t={t} />
						</div>
					)}
				</div>
			) : null}
		</article>
	);
}

function conflictLabel(t: Translate, preview: OAuthImportPreview): string {
	return t(`oauth.importConflict.${preview.conflict}` as const);
}

function CliPullRow({ source, t }: { readonly source: OAuthSourceDiscovery; readonly t: Translate }) {
	const preview = useOAuthSourcePreviewMutation();
	const commit = useOAuthSourceCommitMutation();
	const cancel = useOAuthSourceCancelMutation();
	const [confirmOverwrite, setConfirmOverwrite] = useState(false);
	const current = preview.data ?? null;
	const reset = (): void => {
		setConfirmOverwrite(false);
		if (current !== null) cancel.mutate(current.previewId);
		commit.reset();
		preview.reset();
	};
	const startPreview = (): void => {
		setConfirmOverwrite(false);
		commit.reset();
		preview.mutate(source.kind);
	};
	return (
		<div className="dus-oauth-source" data-oauth-source={source.kind}>
			<div className="dus-oauth-source-head">
				<code>{source.displayPath}</code>
				{source.available ? (
					<button type="button" className="dus-button" disabled={preview.isPending} onClick={startPreview}>
						{t("oauth.importPull")}
					</button>
				) : (
					<span className="dus-row-hint">{t(`oauth.importUnavailable.${source.reason ?? "missing"}` as const)}</span>
				)}
			</div>
			{preview.error instanceof Error ? (
				<p className="dus-error-inline" role="alert">
					{preview.error.message}
				</p>
			) : null}
			{current === null ? null : (
				<div className="dus-oauth-preview">
					<div className="dus-row-hint">
						{conflictLabel(t, current)} · {t(`oauth.importAction.${current.action}` as const)}
					</div>
					{current.warnings.map((warning) => (
						<div className="dus-row-hint" key={warning}>
							{warning}
						</div>
					))}
					{current.confirmOverwriteRequired ? (
						<label className="dus-check-label">
							<input
								type="checkbox"
								checked={confirmOverwrite}
								onChange={(event) => setConfirmOverwrite(event.target.checked)}
							/>
							<span>{t("oauth.importConfirmOverwrite")}</span>
						</label>
					) : null}
					{commit.error instanceof Error ? (
						<p className="dus-error-inline" role="alert">
							{commit.error.message}
						</p>
					) : null}
					{commit.data === undefined ? (
						<div className="dus-inline-actions">
							<button
								type="button"
								className="dus-button is-primary"
								disabled={
									commit.isPending ||
									current.action === "blocked" ||
									(current.confirmOverwriteRequired && !confirmOverwrite)
								}
								onClick={() =>
									commit.mutate({
										kind: current.kind,
										previewId: current.previewId,
										...(current.confirmOverwriteRequired ? { confirmOverwrite } : {}),
									})
								}
							>
								{t("oauth.importCommit")}
							</button>
							<button type="button" className="dus-button" onClick={reset}>
								{t("oauth.importCancel")}
							</button>
						</div>
					) : (
						<div className="dus-inline-actions">
							<span className="dus-save-state">{t(`oauth.importDone.${commit.data.action}` as const)}</span>
							<button type="button" className="dus-button" onClick={reset}>
								{t("action.close")}
							</button>
						</div>
					)}
				</div>
			)}
		</div>
	);
}

export function AccountsTab({ t }: { readonly t: Translate }) {
	const status = useCodingOAuthStatusQuery();
	const sources = useOAuthSourcesQuery();
	const data = status.data ?? null;
	const sourceByKind = new Map((sources.data?.sources ?? []).map((source) => [source.kind, source]));
	return (
		<div className="dus-settings-stack" data-settings-tab="accounts">
			<p className="dus-settings-hint">{t("oauth.accountsIntro")}</p>
			{status.error instanceof Error ? (
				<p className="dus-error-inline" role="alert">
					{status.error.message}
				</p>
			) : null}
			{data === null ? (
				<div className="dus-chart-empty">{t("dashboard.loading")}</div>
			) : (
				<>
					<ProviderCard
						provider="grok"
						title="Grok Build (SuperGrok / X Premium)"
						note={t("oauth.grokNote")}
						status={data.providers.grok}
						methods={[
							{ id: "pkce", label: t("oauth.loginBrowser") },
							{ id: "device", label: t("oauth.loginDevice") },
						]}
						source={sourceByKind.get("grok") ?? null}
						t={t}
					/>
					{(["codex", "kimi", "claude"] as const).map((slug) => {
						const provider = data.providers[slug];
						return (
							<ProviderCard
								key={slug}
								provider={slug}
								title={provider.displayName}
								note={t(`oauth.note.${slug}` as const)}
								status={provider}
								methods={provider.loginMethods.map((method) => ({
									id: method,
									label: method === "device" ? t("oauth.loginDevice") : t("oauth.loginBrowser"),
								}))}
								source={sourceByKind.get(slug) ?? null}
								t={t}
							/>
						);
					})}
					{data.providers.copilot !== undefined ? (
						<ProviderCard
							provider="copilot"
							title={data.providers.copilot.displayName}
							note={t("oauth.note.copilot")}
							status={data.providers.copilot}
							methods={data.providers.copilot.loginMethods.map((method) => ({
								id: method,
								label: method === "device" ? t("oauth.loginDevice") : t("oauth.loginBrowser"),
							}))}
							source={null}
							t={t}
						/>
					) : null}
					<article className="dus-oauth-card" data-oauth-provider="antigravity">
						<div className="dus-oauth-card-body">
							<SettingsRow
								title={t("oauth.antigravity.title")}
								hint={
									data.antigravity.installed ? t("oauth.antigravity.installed") : t("oauth.antigravity.notInstalled")
								}
								control={
									<span className={`dus-state-dot${data.antigravity.installed ? " is-ok" : ""}`} aria-hidden="true" />
								}
							/>
						</div>
					</article>
				</>
			)}
		</div>
	);
}
