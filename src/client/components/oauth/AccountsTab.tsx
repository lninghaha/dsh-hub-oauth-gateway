import { AccountReauthorization } from "./AccountReauthorization.js";
import { CapabilitiesTab } from "./CapabilitiesTab.js";
/**
 * Accounts tab for the integrated coding-subscription OAuth settings:
 * per-provider sign-in cards (Grok PKCE/device, Codex/Kimi/Claude subscription
 * OAuth), model selection, and the allowlisted CLI credential pull wizard.
 * The server owns every secret; this panel only renders secret-free state.
 */

import { useEffect, useRef, useState } from "react";
import type {
	AccountSummary,
	CodingOAuthProviderSlug,
	GrokBuildWebAuthStatus,
	OAuthImportPreview,
	OAuthSourceDiscovery,
	SubscriptionWebAuthStatus,
} from "../../../shared/coding-oauth.js";
import { OAUTH_MAX_ACCOUNTS } from "../../../shared/coding-oauth.js";
import type { AccountSnapshot } from "../../../shared/domain.js";
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
import { useAccountsQuery } from "../../queries.js";
import { QuotaBars } from "../AccountGrid.js";
import { SettingsRow } from "../controls.js";
import { OpenCodeGoConnectionCard } from "./OpenCodeGoConnectionCard.js";

/** Usage Center account provider ids that back each OAuth card (GET snapshots only). */
const OAUTH_QUOTA_PROVIDER_ID: Record<CodingOAuthProviderSlug, string> = {
	grok: "grok",
	codex: "codex",
	kimi: "kimi-coding",
	claude: "claude",
	copilot: "copilot",
};

type ProviderStatus = GrokBuildWebAuthStatus | SubscriptionWebAuthStatus;
type RecoveryKind = "reauthorize" | "storage" | "network" | "retry";

function recoveryKind(error: unknown): RecoveryKind {
	const message = error instanceof Error ? error.message : "";
	const code =
		error !== null && typeof error === "object" && "code" in error && typeof error.code === "string" ? error.code : "";
	const value = `${code} ${message}`.toLowerCase();
	if (
		/invalid[ _-]?(token|grant|credential)|token[ _-]?expired|unauthori[sz]ed|forbidden|access[ _-]?denied|authorization[ _-]?denied/.test(
			value,
		)
	) {
		return "reauthorize";
	}
	if (
		/atomic|writer|write[ _-]?lock|lock(?:ed)?|storage|database|sqlite|eacces|eperm|read-only|permission|rename|file system/.test(
			value,
		)
	) {
		return "storage";
	}
	if (/network|fetch|timeout|timed out|econn|enotfound|eai_again|socket|connection|offline/.test(value)) {
		return "network";
	}
	return "retry";
}

function AuthRecoveryNotice({
	error,
	provider,
	onRetryStatus,
	t,
}: {
	readonly error: unknown;
	readonly provider: CodingOAuthProviderSlug;
	readonly methods: readonly { id: string; label: string }[];
	readonly onRetryStatus: () => void;
	readonly t: Translate;
}) {
	const kind = recoveryKind(error);
	const reauthorize = kind === "reauthorize";
	return (
		<div className="dus-error-inline" role="alert" data-oauth-recovery={kind}>
			<p>{t(`oauth.recovery.${kind}`)}</p>
			<button
				type="button"
				className="dus-button is-small"
				data-provider={provider}
				onClick={() => {
					onRetryStatus();
				}}
			>
				{reauthorize ? t("oauth.recovery.manageAccount") : t("oauth.recovery.retryAction")}
			</button>
		</div>
	);
}

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
	selectionMode = "selected",
	methods,
	onRetryStatus,
	t,
}: {
	readonly provider: CodingOAuthProviderSlug;
	readonly available: readonly string[];
	readonly selected: readonly string[];
	readonly selectionMode?: "default" | "selected";
	readonly methods: readonly { id: string; label: string }[];
	readonly onRetryStatus: () => void;
	readonly t: Translate;
}) {
	const save = useCodingOAuthModelsMutation();
	const [draft, setDraft] = useState<readonly string[]>(selected);
	const [mode, setMode] = useState(selectionMode);
	const draftRef = useRef({ draft, mode });
	draftRef.current = { draft, mode };
	const [dirty, setDirty] = useState(false);
	useEffect(() => {
		if (!dirty) {
			setDraft(selected);
			setMode(selectionMode);
		}
	}, [selected, dirty, selectionMode]);
	const toggle = (modelId: string): void => {
		setDirty(true);
		setMode("selected");
		setDraft((current) => (current.includes(modelId) ? current.filter((id) => id !== modelId) : [...current, modelId]));
	};
	return (
		<div className="dus-oauth-models" data-unsaved={dirty ? "true" : undefined}>
			<div className="dus-row-hint">{t("oauth.modelsHint")}</div>
			<div className="dus-inline-actions">
				<button
					type="button"
					onClick={() => {
						setDraft([]);
						setMode("selected");
						setDirty(true);
					}}
				>
					{t("oauth.modelsHideAll")}
				</button>
				<button
					type="button"
					onClick={() => {
						setDraft(available);
						setMode("default");
						setDirty(true);
					}}
				>
					{t("oauth.modelsDefault")}
				</button>
			</div>
			{selected.length === 0 ? <p>{t("oauth.modelsHidden")}</p> : null}
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
						onClick={() => {
							const sent = { draft, mode };
							save.mutate(
								{ provider, selected: draft, selectionMode: mode },
								{ onSuccess: () => setDirty(JSON.stringify(draftRef.current) !== JSON.stringify(sent)) },
							);
						}}
					>
						{t("oauth.modelsSave")}
					</button>
					{save.isSuccess && !dirty ? <span className="dus-save-state">{t("oauth.modelsSaved")}</span> : null}
				</div>
			)}
			{save.error instanceof Error ? (
				<AuthRecoveryNotice
					error={save.error}
					provider={provider}
					methods={methods}
					onRetryStatus={onRetryStatus}
					t={t}
				/>
			) : null}
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
	onRetryStatus,
	t,
}: {
	readonly provider: CodingOAuthProviderSlug;
	readonly accounts: readonly AccountSummary[];
	readonly activeAccountId: string;
	readonly methods: readonly { id: string; label: string }[];
	readonly onRetryStatus: () => void;
	readonly t: Translate;
}) {
	const setActive = useCodingOAuthSetActiveAccountMutation();
	const remove = useCodingOAuthRemoveAccountMutation();
	const login = useCodingOAuthLoginMutation();
	const [removing, setRemoving] = useState<AccountSummary | null>(null);
	const removeTrigger = useRef<HTMLButtonElement | null>(null);
	const removeCancel = useRef<HTMLButtonElement>(null);
	const restoreRemoveFocus = useRef(false);
	useEffect(() => {
		if (removing !== null) {
			removeCancel.current?.focus();
			return;
		}
		if (!restoreRemoveFocus.current) return;
		restoreRemoveFocus.current = false;
		removeTrigger.current?.focus();
	}, [removing]);
	const atCap = accounts.length >= OAUTH_MAX_ACCOUNTS;
	const mutationError = [setActive.error, remove.error, login.error].find(
		(value): value is Error => value instanceof Error,
	);
	return (
		<div className="dus-oauth-accounts">
			<div className="dus-row-hint">{t("oauth.accountsListHint")}</div>
			<div className="dus-row-hint">{t("oauth.accountDefaultHint")}</div>
			<ul className="dus-oauth-account-list">
				{accounts.map((account) => {
					const isActive = account.id === activeAccountId;
					const title = account.label ?? account.accountId ?? account.id;
					return (
						<li className="dus-oauth-account-row" key={account.id} data-account-id={account.id}>
							<span className="dus-oauth-account-label">
								{title}
								{isActive ? <span className="dus-row-hint"> · {t("oauth.accountActive")}</span> : null}
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
								<AccountReauthorization
									account={account.label ?? account.accountId ?? account.id}
									methods={methods}
									disabled={login.isPending}
									labels={{
										action: t("oauth.recovery.reauthorizeAction"),
										hint: t("oauth.reauthorizeHint"),
										cancel: t("oauth.importCancel"),
									}}
									onConfirm={(method) =>
										login.mutateAsync({
											provider,
											method,
											accountMode: "reauthorize",
											targetAccountId: account.id,
											confirmOverwrite: true,
										})
									}
								/>
								<button
									type="button"
									className="dus-button is-danger"
									disabled={remove.isPending}
									onClick={(event) => {
										removeTrigger.current = event.currentTarget;
										setRemoving(account);
									}}
								>
									{t("oauth.accountRemove")}
								</button>
							</div>
						</li>
					);
				})}
			</ul>
			{removing === null ? null : (
				<div className="dus-oauth-challenge" role="alert">
					<p>{t("oauth.accountRemoveConfirm", { account: removing.label ?? removing.accountId ?? removing.id })}</p>
					<div className="dus-inline-actions">
						<button
							type="button"
							className="dus-button is-danger"
							disabled={remove.isPending}
							onClick={() =>
								remove.mutate(
									{ provider, accountId: removing.id },
									{
										onSuccess: () => {
											restoreRemoveFocus.current = true;
											setRemoving(null);
										},
									},
								)
							}
						>
							{t("oauth.accountRemoveConfirmAction")}
						</button>
						<button
							ref={removeCancel}
							type="button"
							className="dus-button"
							disabled={remove.isPending}
							onClick={() => {
								restoreRemoveFocus.current = true;
								setRemoving(null);
							}}
						>
							{t("oauth.importCancel")}
						</button>
					</div>
				</div>
			)}
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
				<AuthRecoveryNotice
					error={mutationError}
					provider={provider}
					methods={methods}
					onRetryStatus={onRetryStatus}
					t={t}
				/>
			)}
		</div>
	);
}

function OAuthCardUsageBars({
	provider,
	snapshots,
	t,
}: {
	readonly provider: CodingOAuthProviderSlug;
	readonly snapshots: readonly AccountSnapshot[];
	readonly t: Translate;
}) {
	const providerId = OAUTH_QUOTA_PROVIDER_ID[provider];
	const matches = snapshots.filter((account) => account.providerId === providerId && account.windows.length > 0);
	if (matches.length === 0) return null;
	return (
		<div className="dus-oauth-card-usage" data-oauth-usage={provider}>
			<p className="dus-row-hint">{t("oauth.usageProviderScope")}</p>
			{matches.map((account) => (
				<div key={account.profileId}>
					<span>{account.displayName}</span>
					<QuotaBars windows={account.windows} limit={account.windows.length} />
				</div>
			))}
		</div>
	);
}

function ProviderCard({
	provider,
	title,
	note,
	status: observed,
	methods,
	source,
	snapshots,
	onRetryStatus,
	t,
}: {
	readonly provider: CodingOAuthProviderSlug;
	readonly title: string;
	readonly note: string;
	readonly status: ProviderStatus;
	readonly methods: readonly { id: string; label: string }[];
	readonly source: OAuthSourceDiscovery | null;
	readonly snapshots: readonly AccountSnapshot[];
	readonly onRetryStatus: () => void;
	readonly t: Translate;
}) {
	const lastConnected = useRef<Extract<ProviderStatus, { status: "signed-in" }>>();
	if (observed.status === "signed-in") lastConnected.current = observed;
	if (observed.status === "signed-out") lastConnected.current = undefined;
	const status = observed.status === "error" && lastConnected.current ? lastConnected.current : observed;
	const login = useCodingOAuthLoginMutation();
	const logout = useCodingOAuthLogoutMutation();
	const [advancedOpen, setAdvancedOpen] = useState(false);
	const [confirmLogout, setConfirmLogout] = useState(false);
	const logoutTrigger = useRef<HTMLButtonElement>(null);
	const logoutCancel = useRef<HTMLButtonElement>(null);
	const restoreLogoutFocus = useRef(false);
	useEffect(() => {
		if (confirmLogout) {
			logoutCancel.current?.focus();
			return;
		}
		if (!restoreLogoutFocus.current) return;
		restoreLogoutFocus.current = false;
		logoutTrigger.current?.focus();
	}, [confirmLogout]);
	const [expanded, setExpanded] = useState(status.status === "signing-in");
	useEffect(() => {
		if (status.status === "signing-in") setExpanded(true);
	}, [status.status]);
	const error = [
		login.error,
		logout.error,
		observed.operationError
			? new Error(observed.operationError)
			: observed.status === "error"
				? new Error(observed.message)
				: undefined,
	].find((value): value is Error => value instanceof Error);
	const expiresAt = status.status === "signed-in" && "expiresAt" in status ? status.expiresAt : undefined;
	const expiryLabel = formatExpiry(t, expiresAt);
	return (
		<article className="dus-oauth-card" data-oauth-provider={provider}>
			<header className="dus-oauth-card-head">
				<button type="button" className="dus-oauth-card-toggle" onClick={() => setExpanded((value) => !value)}>
					<span className={`dus-state-dot ${stateDot(observed.status)}`} aria-hidden="true" />
					<strong>{title}</strong>
					<span className="dus-row-hint">{statusLabel(t, observed.status)}</span>
					<span className="dus-oauth-chevron" aria-hidden="true">
						{expanded ? "−" : "+"}
					</span>
				</button>
			</header>
			{expanded ? (
				<div className="dus-oauth-card-body">
					<p className="dus-row-hint">{note}</p>
					{error === undefined ? null : (
						<AuthRecoveryNotice
							error={error}
							provider={provider}
							methods={methods}
							onRetryStatus={onRetryStatus}
							t={t}
						/>
					)}

					{status.status === "signed-out" ? (
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
							<OAuthCardUsageBars provider={provider} snapshots={snapshots} t={t} />
							<AccountList
								provider={provider}
								accounts={status.accounts}
								activeAccountId={status.activeAccountId}
								methods={methods}
								onRetryStatus={onRetryStatus}
								t={t}
							/>
							<ModelPicker
								provider={provider}
								available={status.available}
								selected={status.selected}
								selectionMode={status.selectionMode ?? "selected"}
								methods={methods}
								onRetryStatus={onRetryStatus}
								t={t}
							/>
							{confirmLogout ? (
								<div className="dus-oauth-challenge" role="alert">
									<p>{t("oauth.logoutConfirmHint")}</p>
									<div className="dus-inline-actions">
										<button
											type="button"
											className="dus-button is-danger"
											disabled={logout.isPending}
											onClick={() =>
												logout.mutate(provider, {
													onSuccess: () => {
														restoreLogoutFocus.current = true;
														setConfirmLogout(false);
													},
												})
											}
										>
											{t("oauth.logoutConfirmAction")}
										</button>
										<button
											ref={logoutCancel}
											type="button"
											className="dus-button"
											disabled={logout.isPending}
											onClick={() => {
												restoreLogoutFocus.current = true;
												setConfirmLogout(false);
											}}
										>
											{t("oauth.importCancel")}
										</button>
									</div>
								</div>
							) : (
								<div className="dus-inline-actions">
									<button
										ref={logoutTrigger}
										type="button"
										className="dus-button is-danger"
										disabled={logout.isPending}
										onClick={() => setConfirmLogout(true)}
									>
										{t("oauth.logout")}
									</button>
								</div>
							)}
						</>
					) : null}
					{provider === "grok" || provider === "codex" ? (
						<details onToggle={(event) => setAdvancedOpen(event.currentTarget.open)}>
							<summary>{t("settings.tab.capabilities")}</summary>
							{advancedOpen ? (
								<CapabilitiesTab t={t} scope={provider} connected={status.status === "signed-in"} />
							) : null}
						</details>
					) : null}
					{source === null ? null : (
						<div className="dus-oauth-card-pull">
							<div className="dus-row-hint">{t("oauth.importInlineHint")}</div>
							<CliPullRow source={source} oneClick={provider === "claude"} t={t} />
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

function pullButtonLabel(source: OAuthSourceDiscovery, t: Translate): string {
	if (source.kind === "claude") return t("oauth.importClaudeCode");
	return t("oauth.importPull");
}

function CliPullRow({
	source,
	oneClick = false,
	t,
}: {
	readonly source: OAuthSourceDiscovery;
	readonly oneClick?: boolean;
	readonly t: Translate;
}) {
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
		preview.mutate(source.kind, {
			onSuccess: (data) => {
				if (!oneClick) return;
				if (data.action === "blocked" || data.confirmOverwriteRequired) return;
				commit.mutate({ kind: data.kind, previewId: data.previewId });
			},
		});
	};
	return (
		<div className="dus-oauth-source" data-oauth-source={source.kind} data-oauth-origin={source.origin ?? "file"}>
			<div className="dus-oauth-source-head">
				<code>{source.displayPath}</code>
				{source.available ? (
					<button
						type="button"
						className="dus-button"
						disabled={preview.isPending || commit.isPending}
						onClick={startPreview}
					>
						{pullButtonLabel(source, t)}
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
						current.confirmOverwriteRequired || !oneClick || current.action === "blocked" ? (
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
						) : commit.isPending ? (
							<div className="dus-row-hint">{t("dashboard.loading")}</div>
						) : null
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

export function AccountsTab({
	t,
	onStartConversation = () => undefined,
}: {
	readonly t: Translate;
	readonly onStartConversation?: () => void;
}) {
	const status = useCodingOAuthStatusQuery();
	const sources = useOAuthSourcesQuery();
	const accounts = useAccountsQuery(true);
	const data = status.data ?? null;
	const sourceByKind = new Map((sources.data?.sources ?? []).map((source) => [source.kind, source]));
	const snapshots = accounts.data?.ok === true ? accounts.data.data.accounts : [];
	const retryStatus = (): void => {
		void status.refetch();
	};
	return (
		<div className="dus-settings-stack" data-settings-tab="accounts">
			<p className="dus-settings-hint">{t("oauth.accountsIntro")}</p>
			{status.error instanceof Error ? (
				<AuthRecoveryNotice error={status.error} provider="grok" methods={[]} onRetryStatus={retryStatus} t={t} />
			) : null}
			{data === null ? (
				<div className="dus-chart-empty">{t("dashboard.loading")}</div>
			) : (
				<>
					<OpenCodeGoConnectionCard t={t} onStartConversation={onStartConversation} />
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
						snapshots={snapshots}
						onRetryStatus={retryStatus}
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
								snapshots={snapshots}
								onRetryStatus={retryStatus}
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
							snapshots={snapshots}
							onRetryStatus={retryStatus}
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
