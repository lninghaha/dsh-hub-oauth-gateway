import type { SettingsSectionOwnerProps } from "@deepseek-ai/dsh-client-ui-settings/client";
import type { PropsLocale } from "@deepseek-ai/dsh-client-ui-slots";
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PreferencesSnapshotSchema } from "../../shared/contracts.js";
import { acknowledgePreferenceSave, preferenceOperations, rebasePreferences } from "../../shared/preference-draft.js";
import {
	applyPresetToPreferences,
	type DashboardModuleId,
	defaultUserPreferences,
	resetModulesToPreset,
	type UserPreferences,
} from "../../shared/preferences.js";
import { SETTINGS_OPEN_EVENT, SETTINGS_TAB_STORAGE_KEY, usageUiController } from "../controller.js";
import { type Translate, translator } from "../locales.js";
import {
	useAccountsQuery,
	useCredentialQuery,
	useDeviceCodeMutation,
	useDevicePollMutation,
	usePatchPreferencesMutation,
	usePreferencesStateQuery,
	useSetCredentialMutation,
	useUnsetCredentialMutation,
} from "../queries.js";
import { SETTINGS_TABS } from "../settings-tabs.js";
import { hasUnsavedChanges, useUnsavedChanges } from "../unsaved.js";
import { CompatibilityPanel } from "./CompatibilityPanel.js";
import { SelectPill, SettingsRow, TextInput, Toggle } from "./controls.js";
import { FeesEditor } from "./FeesEditor.js";
import { parseNonNegativeNumber } from "./form-utils.js";
import { AccountsTab } from "./oauth/AccountsTab.js";
import { CapabilitiesTab } from "./oauth/CapabilitiesTab.js";
import { GatewayTab } from "./oauth/GatewayTab.js";
import { PricingEditor } from "./PricingEditor.js";
import { ProviderManagement } from "./ProviderManagement.js";
import { UsageSettingsOverview } from "./UsageSettingsOverview.js";

type UsageSettingsProps = SettingsSectionOwnerProps &
	PropsLocale<"usage-stats"> & { surface?: "usage" | "accounts"; initialTab?: SettingsTab };
type SettingsTab = (typeof SETTINGS_TABS)[number];
type PreferenceSection = "display" | "providers" | "privacy" | "alerts";

interface PreferenceDraftBase {
	readonly preferences: UserPreferences;
	readonly revision: number;
}

const PREFERENCE_SECTIONS: readonly PreferenceSection[] = ["display", "providers", "privacy", "alerts"];

function equalPreferenceSection(
	left: UserPreferences[PreferenceSection],
	right: UserPreferences[PreferenceSection],
): boolean {
	return JSON.stringify(left) === JSON.stringify(right);
}

export function changedPreferenceSections(baseline: UserPreferences, draft: UserPreferences): PreferenceSection[] {
	return PREFERENCE_SECTIONS.filter((section) => !equalPreferenceSection(baseline[section], draft[section]));
}

function Field({ label, children }: { readonly label: string; readonly children: ReactNode }) {
	return (
		<fieldset className="dus-field">
			<legend>{label}</legend>
			{children}
		</fieldset>
	);
}

const PROVIDER_COLORS = ["#4f8cff", "#29b68f", "#a66cff", "#ee8a33", "#dd5577", "#25a7c7"] as const;

function defaultProviderColor(providerId: string): string {
	let hash = 0;
	for (const character of providerId) hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
	return PROVIDER_COLORS[hash % PROVIDER_COLORS.length] ?? PROVIDER_COLORS[0];
}

function PreferenceEditor({
	draft,
	onChange,
	accounts,
	t,
}: {
	readonly draft: UserPreferences;
	readonly onChange: (value: UserPreferences) => void;
	readonly accounts: readonly { providerId: string; displayName: string }[];
	readonly t: Translate;
}) {
	const display = draft.display;
	return (
		<>
			<div className="dus-settings-stack">
				<SettingsRow
					title={t("settings.preset")}
					control={
						<SelectPill
							ariaLabel={t("settings.preset")}
							value={display.preset}
							onChange={(value) => onChange(applyPresetToPreferences(draft, value as typeof display.preset))}
							options={[
								{ value: "minimal", label: t("preset.minimal") },
								{ value: "quota", label: t("preset.quota") },
								{ value: "cost", label: t("preset.cost") },
								{ value: "analyst", label: t("preset.analyst") },
							]}
						/>
					}
				/>
				<SettingsRow
					title={t("settings.entryMode")}
					hint={t("settings.entryModeHint")}
					control={
						<SelectPill
							ariaLabel={t("settings.entryMode")}
							value={display.entryMode}
							onChange={(value) =>
								onChange({
									...draft,
									display: { ...display, entryMode: value as typeof display.entryMode },
								})
							}
							options={[
								{ value: "floating", label: t("settings.entryMode.floating") },
								{ value: "sidebar", label: t("settings.entryMode.sidebar") },
							]}
						/>
					}
				/>
				<SettingsRow
					title={t("settings.sidebarMetric")}
					control={
						<SelectPill
							ariaLabel={t("settings.sidebarMetric")}
							value={display.sidebarMetric}
							onChange={(value) =>
								onChange({
									...draft,
									display: { ...display, sidebarMetric: value as typeof display.sidebarMetric },
								})
							}
							options={[
								{ value: "todayTokens", label: t("metric.tokens") },
								{ value: "todayCost", label: t("metric.cost") },
								{ value: "lowestQuota", label: t("preset.quota") },
								{ value: "alerts", label: t("metric.alerts") },
							]}
						/>
					}
				/>
				<SettingsRow
					title={t("settings.defaultRange")}
					control={
						<SelectPill
							ariaLabel={t("settings.defaultRange")}
							value={display.defaultRange}
							onChange={(value) =>
								onChange({
									...draft,
									display: { ...display, defaultRange: value as typeof display.defaultRange },
								})
							}
							options={[
								{ value: "today", label: t("range.today") },
								{ value: "7d", label: t("range.7d") },
								{ value: "30d", label: t("range.30d") },
								{ value: "month", label: t("range.month") },
							]}
						/>
					}
				/>
				<SettingsRow
					title={t("settings.density")}
					control={
						<SelectPill
							ariaLabel={t("settings.density")}
							value={display.density}
							onChange={(value) =>
								onChange({
									...draft,
									display: { ...display, density: value as typeof display.density },
								})
							}
							options={[
								{ value: "compact", label: t("density.compact") },
								{ value: "comfortable", label: t("density.comfortable") },
							]}
						/>
					}
				/>
				<SettingsRow
					title={t("settings.motion")}
					control={
						<SelectPill
							ariaLabel={t("settings.motion")}
							value={display.reducedMotion}
							onChange={(value) =>
								onChange({
									...draft,
									display: { ...display, reducedMotion: value as typeof display.reducedMotion },
								})
							}
							options={[
								{ value: "system", label: t("motion.system") },
								{ value: "always", label: t("motion.always") },
								{ value: "never", label: t("motion.never") },
							]}
						/>
					}
				/>
				<SettingsRow
					title={t("settings.timeZone")}
					control={
						<TextInput
							ariaLabel={t("settings.timeZone")}
							value={display.timeZone}
							onChange={(value) => onChange({ ...draft, display: { ...display, timeZone: value } })}
						/>
					}
				/>
				<SettingsRow
					title={t("settings.baseCurrency")}
					control={
						<TextInput
							ariaLabel={t("settings.baseCurrency")}
							value={display.baseCurrency}
							maxLength={8}
							onChange={(value) =>
								onChange({
									...draft,
									display: { ...display, baseCurrency: value.toUpperCase() },
								})
							}
						/>
					}
				/>
				<SettingsRow
					title={t("settings.streakMinTokens")}
					control={
						<input
							className="dus-input dus-input-narrow"
							type="number"
							min={0}
							step={1}
							aria-label={t("settings.streakMinTokens")}
							value={display.streakMinTokens}
							onChange={(event) =>
								onChange({
									...draft,
									display: {
										...display,
										streakMinTokens: Math.max(0, Math.floor(Number(event.target.value) || 0)),
									},
								})
							}
						/>
					}
				/>
			</div>
			<strong className="dus-settings-subtitle">{t("settings.modules")}</strong>
			<p className="dus-settings-hint">{t("settings.modulesHint")}</p>
			<ul className="dus-module-editor">
				{display.modules.order.map((moduleId, index) => {
					const hidden = display.modules.hidden.includes(moduleId);
					return (
						<li className="dus-module-row" key={moduleId}>
							<label className="dus-check-label">
								<input
									type="checkbox"
									checked={!hidden}
									onChange={(event) => {
										const nextHidden = event.target.checked
											? display.modules.hidden.filter((id) => id !== moduleId)
											: [...new Set([...display.modules.hidden, moduleId])];
										onChange({
											...draft,
											display: {
												...display,
												modules: { ...display.modules, hidden: nextHidden },
												modulesCustomized: true,
											},
										});
									}}
								/>
								<span>{t(`module.${moduleId}` as const)}</span>
							</label>
							<div className="dus-module-move">
								<button
									type="button"
									className="dus-button is-small"
									disabled={index === 0}
									aria-label={t("settings.moveUp")}
									onClick={() => {
										const order = [...display.modules.order] as DashboardModuleId[];
										const previous = order[index - 1];
										if (previous === undefined) return;
										order[index - 1] = moduleId;
										order[index] = previous;
										onChange({
											...draft,
											display: {
												...display,
												modules: { ...display.modules, order },
												modulesCustomized: true,
											},
										});
									}}
								>
									↑
								</button>
								<button
									type="button"
									className="dus-button is-small"
									disabled={index >= display.modules.order.length - 1}
									aria-label={t("settings.moveDown")}
									onClick={() => {
										const order = [...display.modules.order] as DashboardModuleId[];
										const next = order[index + 1];
										if (next === undefined) return;
										order[index + 1] = moduleId;
										order[index] = next;
										onChange({
											...draft,
											display: {
												...display,
												modules: { ...display.modules, order },
												modulesCustomized: true,
											},
										});
									}}
								>
									↓
								</button>
							</div>
						</li>
					);
				})}
			</ul>
			<button type="button" className="dus-button is-small" onClick={() => onChange(resetModulesToPreset(draft))}>
				{t("settings.resetModules")}
			</button>
			<SettingsRow
				title={t("settings.compare")}
				control={
					<Toggle
						label={t("settings.compare")}
						checked={display.comparePrevious}
						onChange={(checked) => onChange({ ...draft, display: { ...display, comparePrevious: checked } })}
					/>
				}
			/>
			<strong className="dus-settings-subtitle">{t("settings.accountVisibility")}</strong>
			<p className="dus-settings-hint">{t("settings.accountVisibilityHint")}</p>
			<div className="dus-provider-visibility">
				{accounts.map((account) => {
					const hidden = draft.providers.hidden.includes(account.providerId);
					const visibleLabel = t("settings.accountVisible", { name: account.displayName });
					return (
						<SettingsRow
							key={account.providerId}
							title={account.displayName}
							hint={hidden ? t("settings.accountHidden") : t("settings.accountShown")}
							control={
								<Toggle
									label={visibleLabel}
									checked={!hidden}
									onChange={(checked) =>
										onChange({
											...draft,
											providers: {
												...draft.providers,
												hidden: checked
													? draft.providers.hidden.filter((id) => id !== account.providerId)
													: [...new Set([...draft.providers.hidden, account.providerId])],
											},
										})
									}
								/>
							}
						>
							<div className="dus-provider-visibility-meta">
								<input
									type="text"
									aria-label={`${t("settings.alias")}: ${account.displayName}`}
									placeholder={t("settings.alias")}
									value={draft.providers.aliases[account.providerId] ?? ""}
									onChange={(event) =>
										onChange({
											...draft,
											providers: {
												...draft.providers,
												aliases: { ...draft.providers.aliases, [account.providerId]: event.target.value },
											},
										})
									}
								/>
								<input
									type="color"
									aria-label={`${t("settings.color")}: ${account.displayName}`}
									value={draft.providers.colors[account.providerId] ?? defaultProviderColor(account.providerId)}
									onChange={(event) =>
										onChange({
											...draft,
											providers: {
												...draft.providers,
												colors: { ...draft.providers.colors, [account.providerId]: event.target.value },
											},
										})
									}
								/>
							</div>
						</SettingsRow>
					);
				})}
			</div>
			<SettingsRow
				title={t("settings.showSessions")}
				control={
					<Toggle
						label={t("settings.showSessions")}
						checked={draft.privacy.showSessionIdentifiers}
						onChange={(checked) =>
							onChange({
								...draft,
								privacy: { ...draft.privacy, showSessionIdentifiers: checked },
							})
						}
					/>
				}
			/>
			<SettingsRow
				title={t("settings.redactExports")}
				control={
					<Toggle
						label={t("settings.redactExports")}
						checked={draft.privacy.redactExports}
						onChange={(checked) => onChange({ ...draft, privacy: { ...draft.privacy, redactExports: checked } })}
					/>
				}
			/>
			<strong className="dus-settings-subtitle">{t("settings.alerts")}</strong>
			<SettingsRow
				title={t("settings.alertsEnabled")}
				control={
					<Toggle
						label={t("settings.alertsEnabled")}
						checked={draft.alerts.enabled}
						onChange={(checked) => onChange({ ...draft, alerts: { ...draft.alerts, enabled: checked } })}
					/>
				}
			/>
			<div className="dus-settings-grid">
				<Field label={t("settings.quotaThreshold")}>
					<input
						type="number"
						min={0}
						max={100}
						step={1}
						value={Math.round(draft.alerts.quotaRemainingRatio * 100)}
						onChange={(event) =>
							onChange({
								...draft,
								alerts: {
									...draft.alerts,
									quotaRemainingRatio: Math.max(0, Math.min(1, Number(event.target.value) / 100)),
								},
							})
						}
					/>
				</Field>
				<Field label={t("settings.dailyCostThreshold")}>
					<input
						type="number"
						min={0}
						step="0.01"
						value={draft.alerts.dailyCostThreshold ?? ""}
						onChange={(event) =>
							onChange({
								...draft,
								alerts: { ...draft.alerts, dailyCostThreshold: parseNonNegativeNumber(event.target.value) },
							})
						}
					/>
				</Field>
			</div>
		</>
	);
}

export function CredentialEditor({ t }: { readonly t: Translate }) {
	const [ref, setRef] = useState("DEEPSEEK_API_KEY");
	const [value, setValue] = useState("");
	const credential = useCredentialQuery(ref);
	const save = useSetCredentialMutation();
	const unset = useUnsetCredentialMutation();
	const device = useDeviceCodeMutation();
	const poll = useDevicePollMutation();
	const info = credential.data?.ok === true ? credential.data.data : null;
	const deviceData = device.data?.ok === true ? device.data.data : null;
	const operationError = [save.error, unset.error, device.error, poll.error].find(
		(error): error is Error => error instanceof Error,
	);
	return (
		<div className="dus-settings-card">
			<div>
				<h3>{t("settings.apiCredentials")}</h3>
				<p>{t("settings.apiCredentialsIntro")}</p>
				{operationError === undefined ? null : (
					<p className="dus-error-inline" role="alert">
						{t("credential.error")}: {operationError.message}
					</p>
				)}
			</div>
			<div className="dus-credential-row">
				<Field label={t("credential.ref")}>
					<input
						value={ref}
						onChange={(event) => setRef(event.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, ""))}
					/>
				</Field>
				<Field label={t("credential.value")}>
					<input
						type="password"
						autoComplete="new-password"
						value={value}
						onChange={(event) => setValue(event.target.value)}
						placeholder="••••••••"
					/>
				</Field>
				<span className={`dus-credential-status${info?.configured ? " is-configured" : ""}`}>
					{info?.configured ? t("credential.configured") : t("credential.missing")}
				</span>
				<button
					type="button"
					className="dus-button is-primary"
					disabled={value === "" || save.isPending}
					onClick={() => save.mutate({ ref, value }, { onSuccess: () => setValue("") })}
				>
					{t("credential.save")}
				</button>
				<button
					type="button"
					className="dus-button is-small"
					disabled={!info?.configured || unset.isPending}
					onClick={() => unset.mutate(ref)}
				>
					{t("credential.remove")}
				</button>
			</div>
			<div className="dus-device-flow">
				<strong>{t("credential.oauth")}: GitHub Copilot</strong>
				<span>{t("credential.oauthHint")}</span>
				{deviceData === null ? (
					<button
						type="button"
						className="dus-button is-small"
						disabled={device.isPending}
						onClick={() => device.mutate("copilot")}
					>
						{t("credential.start")}
					</button>
				) : (
					<>
						<span>{t("credential.code", { code: deviceData.userCode })}</span>
						<a className="dus-button is-small" href={deviceData.verificationUri} target="_blank" rel="noreferrer">
							{t("credential.open")}
						</a>
						<button
							type="button"
							className="dus-button is-primary"
							disabled={poll.isPending}
							onClick={() => poll.mutate({ providerId: "copilot", flowId: deviceData.flowId })}
						>
							{t("credential.poll")}
						</button>
					</>
				)}
			</div>
		</div>
	);
}

export function SettingsSection({ close, t: rawTranslate, surface = "usage", initialTab }: UsageSettingsProps) {
	const t = translator(rawTranslate);
	const sectionRef = useRef<HTMLElement>(null);
	const confirmLeave = useUnsavedChanges(sectionRef, t("settings.unsavedConfirm"));
	const preferences = usePreferencesStateQuery();
	const accounts = useAccountsQuery();
	const save = usePatchPreferencesMutation();
	const [draft, setDraft] = useState<UserPreferences>(() =>
		defaultUserPreferences(Intl.DateTimeFormat().resolvedOptions().timeZone),
	);
	const [draftBase, setDraftBase] = useState<PreferenceDraftBase | null>(null);
	const draftRef = useRef(draft);
	draftRef.current = draft;
	const savingRef = useRef(false);
	const [conflictLatest, setConflictLatest] = useState<PreferenceDraftBase | null>(null);
	const tabs = useMemo(
		() =>
			SETTINGS_TABS.filter((tab) =>
				surface === "accounts"
					? ["accounts", "providers", "capabilities", "gateway"].includes(tab)
					: ["overview", "display", "fees"].includes(tab),
			),
		[surface],
	);
	const [activeSettingsTab, setActiveSettingsTab] = useState<SettingsTab>(
		initialTab ?? (surface === "accounts" ? "accounts" : "overview"),
	);
	const openSettingsTab = useCallback(
		(tab: SettingsTab): void => {
			if (hasUnsavedChanges(sectionRef.current) && !window.confirm(t("settings.unsavedConfirm"))) return;
			if (draftBase !== null) setDraft(draftBase.preferences);
			if (!tabs.includes(tab)) {
				usageUiController.requestSettingsTab(tab);
				return;
			}
			setActiveSettingsTab(tab);
			try {
				sessionStorage.setItem(`${SETTINGS_TAB_STORAGE_KEY}:${surface}`, tab);
			} catch {
				// Storage is an optional convenience; navigation must still work.
			}
		},
		[surface, tabs, draftBase, t],
	);
	useEffect(() => {
		const openHandler = (event: Event): void => {
			const tab = (event as CustomEvent<{ tab?: string }>).detail?.tab;
			if (tab !== undefined && (tabs as readonly string[]).includes(tab)) {
				openSettingsTab(tab as SettingsTab);
			}
		};
		window.addEventListener(SETTINGS_OPEN_EVENT, openHandler);
		return () => window.removeEventListener(SETTINGS_OPEN_EVENT, openHandler);
	}, [openSettingsTab, tabs]);
	useEffect(() => {
		if (preferences.data?.ok !== true) return;
		const latest = preferences.data.data;
		if (draftBase !== null && changedPreferenceSections(draftBase.preferences, draft).length > 0) return;
		if (savingRef.current || (draftBase !== null && draftBase.revision >= latest.revision)) return;
		setDraft(latest.preferences);
		setDraftBase(latest);
	}, [draft, draftBase, preferences.data]);
	const accountList = useMemo(() => (accounts.data?.ok === true ? accounts.data.data.accounts : []), [accounts.data]);
	const dirtySections = draftBase === null ? [] : changedPreferenceSections(draftBase.preferences, draft);
	const conflictSections =
		draftBase === null || conflictLatest === null
			? []
			: rebasePreferences(draftBase.preferences, draft, conflictLatest.preferences).conflicts;
	const loadConflictSnapshot = (): void => {
		void preferences.refetch().then((result) => {
			if (result.data?.ok === true) setConflictLatest(result.data.data);
		});
	};
	const submitPatch = (base: PreferenceDraftBase, value: UserPreferences): void => {
		const operations = preferenceOperations(base.preferences, value);
		if (operations.length === 0 || savingRef.current) return;
		savingRef.current = true;
		save.mutate(
			{ operations, expectedRevision: base.revision },
			{
				onSuccess: (response) => {
					savingRef.current = false;
					if (response.ok === true) {
						setDraftBase(response.data);
						setDraft(acknowledgePreferenceSave(value, draftRef.current, response.data.preferences));
						setConflictLatest(null);
					}
				},
				onError: (error) => {
					savingRef.current = false;
					if (error instanceof Error && "code" in error && error.code === "settings-conflict") {
						const latest = PreferencesSnapshotSchema.safeParse("latest" in error ? error.latest : undefined);
						if (latest.success) setConflictLatest(latest.data);
						else loadConflictSnapshot();
					}
				},
			},
		);
	};
	const reapplyLocalChanges = (): void => {
		if (draftBase === null || conflictLatest === null) return;
		const rebased = rebasePreferences(draftBase.preferences, draft, conflictLatest.preferences).preferences;
		setDraftBase(conflictLatest);
		setDraft(rebased);
		setConflictLatest(null);
		submitPatch(conflictLatest, rebased);
	};
	return (
		<section
			ref={sectionRef}
			data-surface={surface}
			data-unsaved={dirtySections.length > 0 ? "true" : undefined}
			className={`dus-settings${draft.display.density === "compact" ? " is-density-compact" : ""}${draft.display.reducedMotion === "always" ? " is-reduced-motion" : draft.display.reducedMotion === "never" ? " allows-motion" : ""}`}
		>
			<div className="dus-settings-heading">
				<div>
					<h2>{t(surface === "accounts" ? "settings.accountsTitle" : "settings.title")}</h2>
					<p>{t(surface === "accounts" ? "settings.accountsIntro" : "settings.intro")}</p>
				</div>
				{surface === "usage" ? (
					<div className="dus-settings-heading-actions">
						<button
							type="button"
							className="dus-button is-small"
							onClick={() => {
								if (!confirmLeave()) return;
								close();
								usageUiController.openPeek();
							}}
						>
							{t("settings.openPeek")}
						</button>
						<button
							type="button"
							className="dus-button is-small"
							onClick={() => {
								close();
								usageUiController.openDashboard();
							}}
						>
							{t("settings.preview")}
						</button>
					</div>
				) : null}
			</div>
			<nav
				className="dus-settings-tabs"
				aria-label={t(surface === "accounts" ? "settings.accountsTitle" : "settings.title")}
			>
				{tabs
					.filter((tab) => tab !== "capabilities" || activeSettingsTab === "capabilities")
					.map((tab) => (
						<button
							key={tab}
							type="button"
							className={`dus-tab${activeSettingsTab === tab ? " is-active" : ""}`}
							aria-current={activeSettingsTab === tab ? "page" : undefined}
							onClick={() => openSettingsTab(tab)}
						>
							{t(`settings.tab.${tab}`)}
						</button>
					))}
			</nav>
			{activeSettingsTab === "overview" ? <UsageSettingsOverview t={t} /> : null}
			{activeSettingsTab === "display" ? (
				<article className="dus-settings-card" data-settings-tab="display">
					<h3>{t("settings.display")}</h3>
					<PreferenceEditor draft={draft} onChange={setDraft} accounts={accountList} t={t} />
					<div className="dus-settings-actions">
						<button
							type="button"
							className="dus-button is-primary"
							disabled={save.isPending || draftBase === null || dirtySections.length === 0}
							onClick={() => {
								if (draftBase !== null) submitPatch(draftBase, draft);
							}}
						>
							{save.isPending ? t("settings.saving") : t("settings.save")}
						</button>
						{save.isSuccess && dirtySections.length === 0 ? (
							<span className="dus-save-state">{t("settings.saved")}</span>
						) : null}
					</div>
					{save.error instanceof Error && conflictLatest === null ? (
						<div className="dus-error-inline" role="alert">
							{t("settings.patchFailed")}
							<button type="button" className="dus-button is-small" onClick={loadConflictSnapshot}>
								{t("settings.reload")}
							</button>
						</div>
					) : null}
					{conflictLatest === null ? null : (
						<div className="dus-error-inline" role="alert">
							<p>
								{conflictSections.length === 0
									? t("settings.conflictNoOverlap")
									: t("settings.conflictFields", {
											fields: conflictSections
												.map(
													(path) =>
														`${t(`settings.section.${path.split(".")[0] as PreferenceSection}`)}: ${path.split(".").slice(1).join(".")}`,
												)
												.join(t("settings.conflictSeparator")),
										})}
							</p>
							<button type="button" className="dus-button is-small is-primary" onClick={reapplyLocalChanges}>
								{t("settings.keepLocal")}
							</button>
							<button
								type="button"
								className="dus-button is-small"
								onClick={() => {
									if (draftBase === null) return;
									const merged = rebasePreferences(draftBase.preferences, draft, conflictLatest.preferences, "latest");
									setDraftBase(conflictLatest);
									setDraft(merged.preferences);
									setConflictLatest(null);
								}}
							>
								{t("settings.useLatest")}
							</button>
						</div>
					)}
				</article>
			) : null}
			{activeSettingsTab === "accounts" ? <AccountsTab t={t} onStartConversation={close} /> : null}
			{activeSettingsTab === "gateway" ? <GatewayTab t={t} /> : null}
			{activeSettingsTab === "capabilities" ? (
				<div className="dus-settings-stack" data-settings-tab="capabilities">
					<CapabilitiesTab t={t} />
					<CompatibilityPanel t={t} />
				</div>
			) : null}
			{activeSettingsTab === "providers" ? (
				<div className="dus-settings-stack" data-settings-tab="providers">
					<ProviderManagement t={t} onOpenAccounts={() => openSettingsTab("accounts")} />
					<CredentialEditor t={t} />
				</div>
			) : null}
			{activeSettingsTab === "fees" ? (
				<div className="dus-settings-stack" data-settings-tab="fees">
					<FeesEditor t={t} currency={draft.display.baseCurrency} />
					<PricingEditor t={t} />
				</div>
			) : null}
		</section>
	);
}

export function AccountSettingsSection(props: Omit<UsageSettingsProps, "surface">) {
	return <SettingsSection {...props} surface="accounts" />;
}
