import type { SettingsSectionOwnerProps } from "@deepseek-ai/dsh-client-ui-settings/client";
import type { PropsLocale } from "@deepseek-ai/dsh-client-ui-slots";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import { type PriceRule, PriceRuleSchema } from "../../shared/domain.js";
import type { AccountFeeRecord, FeeInterval, FeeKind } from "../../shared/fees.js";
import type { UserPreferences } from "../../shared/preferences.js";
import {
	applyPresetToPreferences,
	defaultUserPreferences,
	type DashboardModuleId,
	resetModulesToPreset,
} from "../../shared/preferences.js";
import { usageUiController } from "../controller.js";
import { type Translate, translator } from "../locales.js";
import {
	useAccountsQuery,
	useCredentialImportMutation,
	useCredentialQuery,
	useDeviceCodeMutation,
	useDevicePollMutation,
	useFeesQuery,
	usePreferencesQuery,
	usePricingQuery,
	useSaveFeesMutation,
	useSavePreferencesMutation,
	useSavePricingMutation,
	useSetCredentialMutation,
	useUnsetCredentialMutation,
} from "../queries.js";
import { ProviderManagement } from "./ProviderManagement.js";

type UsageSettingsProps = SettingsSectionOwnerProps & PropsLocale<"usage-stats">;

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
			<div className="dus-settings-grid">
				<Field label={t("settings.preset")}>
					<select
						value={display.preset}
						onChange={(event) =>
							onChange(applyPresetToPreferences(draft, event.target.value as typeof display.preset))
						}
					>
						<option value="minimal">{t("preset.minimal")}</option>
						<option value="quota">{t("preset.quota")}</option>
						<option value="cost">{t("preset.cost")}</option>
						<option value="analyst">{t("preset.analyst")}</option>
					</select>
				</Field>
				<Field label={t("settings.sidebarMetric")}>
					<select
						value={display.sidebarMetric}
						onChange={(event) =>
							onChange({
								...draft,
								display: { ...display, sidebarMetric: event.target.value as typeof display.sidebarMetric },
							})
						}
					>
						<option value="todayTokens">{t("metric.tokens")}</option>
						<option value="todayCost">{t("metric.cost")}</option>
						<option value="lowestQuota">{t("preset.quota")}</option>
						<option value="alerts">{t("metric.alerts")}</option>
					</select>
				</Field>
				<Field label={t("settings.defaultRange")}>
					<select
						value={display.defaultRange}
						onChange={(event) =>
							onChange({
								...draft,
								display: { ...display, defaultRange: event.target.value as typeof display.defaultRange },
							})
						}
					>
						<option value="today">{t("range.today")}</option>
						<option value="7d">{t("range.7d")}</option>
						<option value="30d">{t("range.30d")}</option>
						<option value="month">{t("range.month")}</option>
					</select>
				</Field>
				<Field label={t("settings.density")}>
					<select
						value={display.density}
						onChange={(event) =>
							onChange({
								...draft,
								display: { ...display, density: event.target.value as typeof display.density },
							})
						}
					>
						<option value="compact">{t("density.compact")}</option>
						<option value="comfortable">{t("density.comfortable")}</option>
					</select>
				</Field>
				<Field label={t("settings.motion")}>
					<select
						value={display.reducedMotion}
						onChange={(event) =>
							onChange({
								...draft,
								display: { ...display, reducedMotion: event.target.value as typeof display.reducedMotion },
							})
						}
					>
						<option value="system">{t("motion.system")}</option>
						<option value="always">{t("motion.always")}</option>
						<option value="never">{t("motion.never")}</option>
					</select>
				</Field>
				<Field label={t("settings.timeZone")}>
					<input
						value={display.timeZone}
						onChange={(event) => onChange({ ...draft, display: { ...display, timeZone: event.target.value } })}
					/>
				</Field>
				<Field label={t("settings.baseCurrency")}>
					<input
						value={display.baseCurrency}
						maxLength={8}
						onChange={(event) =>
							onChange({
								...draft,
								display: { ...display, baseCurrency: event.target.value.toUpperCase() },
							})
						}
					/>
				</Field>
				<Field label={t("settings.streakMinTokens")}>
					<input
						type="number"
						min={0}
						step={1}
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
				</Field>
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
									className="dus-secondary-button"
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
									className="dus-secondary-button"
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
			<button type="button" className="dus-secondary-button" onClick={() => onChange(resetModulesToPreset(draft))}>
				{t("settings.resetModules")}
			</button>
			<label className="dus-check-label">
				<input
					type="checkbox"
					checked={display.comparePrevious}
					onChange={(event) => onChange({ ...draft, display: { ...display, comparePrevious: event.target.checked } })}
				/>
				<span>{t("settings.compare")}</span>
			</label>
			<div className="dus-provider-toggles">
				{accounts.map((account) => {
					const hidden = draft.providers.hidden.includes(account.providerId);
					return (
						<div className="dus-provider-toggle" key={account.providerId}>
							<label className="dus-check-label">
								<input
									type="checkbox"
									checked={!hidden}
									onChange={(event) =>
										onChange({
											...draft,
											providers: {
												...draft.providers,
												hidden: event.target.checked
													? draft.providers.hidden.filter((id) => id !== account.providerId)
													: [...new Set([...draft.providers.hidden, account.providerId])],
											},
										})
									}
								/>
								<span>{account.displayName}</span>
							</label>
							<input
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
					);
				})}
			</div>
			<div className="dus-settings-grid is-single">
				<label className="dus-check-label">
					<input
						type="checkbox"
						checked={draft.privacy.showSessionIdentifiers}
						onChange={(event) =>
							onChange({
								...draft,
								privacy: { ...draft.privacy, showSessionIdentifiers: event.target.checked },
							})
						}
					/>
					<span>{t("settings.showSessions")}</span>
				</label>
				<label className="dus-check-label">
					<input
						type="checkbox"
						checked={draft.privacy.redactExports}
						onChange={(event) =>
							onChange({ ...draft, privacy: { ...draft.privacy, redactExports: event.target.checked } })
						}
					/>
					<span>{t("settings.redactExports")}</span>
				</label>
			</div>
			<strong className="dus-settings-subtitle">{t("settings.alerts")}</strong>
			<label className="dus-check-label">
				<input
					type="checkbox"
					checked={draft.alerts.enabled}
					onChange={(event) => onChange({ ...draft, alerts: { ...draft.alerts, enabled: event.target.checked } })}
				/>
				<span>{t("settings.alertsEnabled")}</span>
			</label>
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
								alerts: { ...draft.alerts, dailyCostThreshold: numeric(event.target.value) },
							})
						}
					/>
				</Field>
			</div>
		</>
	);
}

function CredentialEditor({ t }: { readonly t: Translate }) {
	const [ref, setRef] = useState("DEEPSEEK_API_KEY");
	const [value, setValue] = useState("");
	const [importProvider, setImportProvider] = useState("claude");
	const credential = useCredentialQuery(ref);
	const save = useSetCredentialMutation();
	const unset = useUnsetCredentialMutation();
	const importer = useCredentialImportMutation();
	const device = useDeviceCodeMutation();
	const poll = useDevicePollMutation();
	const info = credential.data?.ok === true ? credential.data.data : null;
	const deviceData = device.data?.ok === true ? device.data.data : null;
	const operationError = [save.error, unset.error, importer.error, device.error, poll.error].find(
		(error): error is Error => error instanceof Error,
	);
	return (
		<div className="dus-settings-card">
			<div>
				<h3>{t("settings.credentials")}</h3>
				<p>{t("settings.credentialsIntro")}</p>
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
					className="dus-primary-button"
					disabled={value === "" || save.isPending}
					onClick={() => save.mutate({ ref, value }, { onSuccess: () => setValue("") })}
				>
					{t("credential.save")}
				</button>
				<button
					type="button"
					className="dus-secondary-button"
					disabled={!info?.configured || unset.isPending}
					onClick={() => unset.mutate(ref)}
				>
					{t("credential.remove")}
				</button>
			</div>
			<div className="dus-credential-row">
				<Field label={t("credential.provider")}>
					<select value={importProvider} onChange={(event) => setImportProvider(event.target.value)}>
						<option value="claude">Claude</option>
						<option value="codex">Codex</option>
						<option value="gemini">Gemini</option>
						<option value="grok">Grok</option>
						<option value="amp">Amp</option>
					</select>
				</Field>
				<button
					type="button"
					className="dus-secondary-button"
					disabled={importer.isPending}
					onClick={() => importer.mutate(importProvider)}
				>
					{t("credential.import")}
				</button>
			</div>
			<div className="dus-device-flow">
				<strong>{t("credential.oauth")}: GitHub Copilot</strong>
				<span>{t("credential.oauthHint")}</span>
				{deviceData === null ? (
					<button
						type="button"
						className="dus-secondary-button"
						disabled={device.isPending}
						onClick={() => device.mutate("copilot")}
					>
						{t("credential.start")}
					</button>
				) : (
					<>
						<span>{t("credential.code", { code: deviceData.userCode })}</span>
						<a className="dus-secondary-button" href={deviceData.verificationUri} target="_blank" rel="noreferrer">
							{t("credential.open")}
						</a>
						<button
							type="button"
							className="dus-primary-button"
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

function numeric(value: string): number | null {
	if (value.trim() === "") return null;
	const parsed = Number(value);
	return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function emptyFee(currency: string): AccountFeeRecord {
	return {
		id: `fee-${Date.now()}`,
		providerId: "provider-a",
		accountLabel: null,
		kind: "subscription",
		planName: null,
		amount: 0,
		currency,
		interval: "month",
		anchorDate: null,
		nextRenewalDate: null,
		topups: [],
		notes: null,
		updatedAt: Date.now(),
	};
}

function FeesEditor({ t, currency }: { readonly t: Translate; readonly currency: string }) {
	const query = useFeesQuery();
	const save = useSaveFeesMutation();
	const [fees, setFees] = useState<AccountFeeRecord[]>([]);
	const [initialized, setInitialized] = useState(false);
	useEffect(() => {
		if (initialized || query.data?.ok !== true) return;
		setFees(query.data.data.fees.map((fee) => ({ ...fee })));
		setInitialized(true);
	}, [initialized, query.data]);
	const update = (index: number, patch: Partial<AccountFeeRecord>): void =>
		setFees((current) =>
			current.map((fee, position) =>
				position === index ? { ...fee, ...patch, updatedAt: Date.now() } : fee,
			),
		);
	return (
		<div className="dus-settings-card">
			<div>
				<h3>{t("settings.fees")}</h3>
				<p>{t("settings.feesIntro")}</p>
			</div>
			<div className="dus-fee-table">
				{fees.map((fee, index) => (
					<div className="dus-fee-row" key={fee.id}>
						<label className="dus-select-label">
							<span className="dus-sr-only">{t("fees.kind")}</span>
							<select
								value={fee.kind}
								onChange={(event) => {
									const kind = event.target.value as FeeKind;
									update(index, {
										kind,
										interval: kind === "subscription" ? (fee.interval ?? "month") : null,
										topups: kind === "topup" ? fee.topups : [],
									});
								}}
							>
								<option value="subscription">{t("fees.subscription")}</option>
								<option value="topup">{t("fees.topup")}</option>
							</select>
						</label>
						<input
							aria-label={t("fees.providerId")}
							placeholder={t("fees.providerId")}
							value={fee.providerId}
							onChange={(event) => update(index, { providerId: event.target.value.trim() || "provider-a" })}
						/>
						<input
							aria-label={t("fees.planName")}
							placeholder={t("fees.planName")}
							value={fee.planName ?? ""}
							onChange={(event) => update(index, { planName: event.target.value.trim() || null })}
						/>
						<input
							aria-label={t("fees.amount")}
							inputMode="decimal"
							value={fee.amount}
							onChange={(event) => update(index, { amount: Math.max(0, Number(event.target.value) || 0) })}
						/>
						<input
							aria-label={t("fees.currency")}
							maxLength={8}
							value={fee.currency}
							onChange={(event) => update(index, { currency: event.target.value.toUpperCase() })}
						/>
						{fee.kind === "subscription" ? (
							<select
								aria-label={t("fees.interval")}
								value={fee.interval ?? "month"}
								onChange={(event) => update(index, { interval: event.target.value as FeeInterval })}
							>
								<option value="month">{t("fees.intervalMonth")}</option>
								<option value="year">{t("fees.intervalYear")}</option>
							</select>
						) : (
							<span className="dus-fee-placeholder">—</span>
						)}
						<input
							aria-label={t("fees.nextRenewalDate")}
							placeholder="YYYY-MM-DD"
							value={fee.nextRenewalDate ?? ""}
							onChange={(event) =>
								update(index, {
									nextRenewalDate: /^\d{4}-\d{2}-\d{2}$/.test(event.target.value)
										? event.target.value
										: event.target.value.trim() === ""
											? null
											: fee.nextRenewalDate,
								})
							}
						/>
						<input
							aria-label={t("fees.notes")}
							placeholder={t("fees.notes")}
							value={fee.notes ?? ""}
							onChange={(event) => update(index, { notes: event.target.value.trim() || null })}
						/>
						<button
							type="button"
							className="dus-icon-button"
							aria-label={t("fees.remove")}
							onClick={() => setFees((current) => current.filter((_, position) => position !== index))}
						>
							×
						</button>
					</div>
				))}
			</div>
			<div className="dus-settings-actions">
				<button
					type="button"
					className="dus-secondary-button"
					onClick={() => setFees((current) => [...current, emptyFee(currency)])}
				>
					{t("fees.add")}
				</button>
				<button
					type="button"
					className="dus-primary-button"
					disabled={save.isPending}
					onClick={() => save.mutate(fees)}
				>
					{save.isPending ? t("settings.saving") : t("settings.save")}
				</button>
				{save.isSuccess ? <span className="dus-save-state">{t("settings.feesSaved")}</span> : null}
			</div>
		</div>
	);
}

function PricingEditor({ t }: { readonly t: Translate }) {
	const query = usePricingQuery();
	const save = useSavePricingMutation();
	const [rules, setRules] = useState<PriceRule[]>([]);
	const [initialized, setInitialized] = useState(false);
	const [importError, setImportError] = useState<string | null>(null);
	const currency = query.data?.ok === true ? query.data.data.baseCurrency : "USD";
	useEffect(() => {
		if (initialized || query.data?.ok !== true) return;
		setRules(query.data.data.rules.filter(({ source }) => source === "user"));
		setInitialized(true);
	}, [initialized, query.data]);
	const update = (index: number, patch: Partial<PriceRule>): void =>
		setRules((current) =>
			current.map((rule, position) => (position === index ? { ...rule, ...patch, updatedAt: Date.now() } : rule)),
		);
	const importRules = async (file: File): Promise<void> => {
		try {
			if (file.size > 1_048_576) throw new Error("file-too-large");
			const raw: unknown = JSON.parse(await file.text());
			const candidate = Array.isArray(raw)
				? raw
				: raw !== null && typeof raw === "object" && "rules" in raw && Array.isArray(raw.rules)
					? raw.rules
					: null;
			if (candidate === null) throw new Error("invalid-catalog");
			const imported = candidate.map((value, index) => {
				if (value === null || typeof value !== "object" || Array.isArray(value)) throw new Error("invalid-rule");
				const source = value as Record<string, unknown>;
				return PriceRuleSchema.parse({
					...source,
					id: source.id ?? `import-${Date.now()}-${index}`,
					effectiveFrom: source.effectiveFrom ?? 0,
					currency: source.currency ?? currency,
					inputPerMillion: source.inputPerMillion ?? null,
					outputPerMillion: source.outputPerMillion ?? null,
					cacheReadPerMillion: source.cacheReadPerMillion ?? null,
					cacheWritePerMillion: source.cacheWritePerMillion ?? null,
					source: "user",
					updatedAt: Date.now(),
				});
			});
			setRules(imported);
			setImportError(null);
		} catch {
			setImportError(t("pricing.invalid"));
		}
	};
	return (
		<div className="dus-settings-card">
			<div>
				<h3>{t("pricing.title")}</h3>
				<p>{t("pricing.intro")}</p>
			</div>
			<div className="dus-price-table">
				{rules.map((rule, index) => (
					<div className="dus-price-row" key={rule.id}>
						<input
							aria-label="Provider pattern"
							value={rule.providerPattern}
							onChange={(event) => update(index, { providerPattern: event.target.value })}
						/>
						<input
							aria-label="Model pattern"
							value={rule.modelPattern}
							onChange={(event) => update(index, { modelPattern: event.target.value })}
						/>
						<input
							aria-label="Input per million"
							inputMode="decimal"
							value={rule.inputPerMillion ?? ""}
							onChange={(event) => update(index, { inputPerMillion: numeric(event.target.value) })}
						/>
						<input
							aria-label="Output per million"
							inputMode="decimal"
							value={rule.outputPerMillion ?? ""}
							onChange={(event) => update(index, { outputPerMillion: numeric(event.target.value) })}
						/>
						<input
							aria-label="Cache read per million"
							inputMode="decimal"
							value={rule.cacheReadPerMillion ?? ""}
							onChange={(event) => update(index, { cacheReadPerMillion: numeric(event.target.value) })}
						/>
						<input
							aria-label="Cache write per million"
							inputMode="decimal"
							value={rule.cacheWritePerMillion ?? ""}
							onChange={(event) => update(index, { cacheWritePerMillion: numeric(event.target.value) })}
						/>
						<button
							type="button"
							className="dus-icon-button"
							aria-label="Delete"
							onClick={() => setRules((current) => current.filter((_, position) => position !== index))}
						>
							×
						</button>
					</div>
				))}
			</div>
			{importError === null ? null : <span className="dus-error-inline">{importError}</span>}
			<div className="dus-settings-actions">
				<label className="dus-secondary-button">
					{t("pricing.import")}
					<input
						className="dus-sr-only"
						type="file"
						accept="application/json,.json"
						onChange={(event) => {
							const file = event.target.files?.[0];
							if (file !== undefined) void importRules(file);
							event.target.value = "";
						}}
					/>
				</label>
				<button
					type="button"
					className="dus-secondary-button"
					onClick={() =>
						setRules((current) => [
							...current,
							{
								id: `user-${Date.now()}`,
								providerPattern: "*",
								modelPattern: "*",
								effectiveFrom: 0,
								currency,
								inputPerMillion: null,
								outputPerMillion: null,
								cacheReadPerMillion: null,
								cacheWritePerMillion: null,
								source: "user",
								updatedAt: Date.now(),
							},
						])
					}
				>
					＋
				</button>
				<button
					type="button"
					className="dus-primary-button"
					disabled={save.isPending}
					onClick={() => save.mutate({ baseCurrency: currency, rules })}
				>
					{t("settings.save")}
				</button>
			</div>
		</div>
	);
}

export function SettingsSection({ close, t: rawTranslate }: UsageSettingsProps) {
	const t = translator(rawTranslate);
	const preferences = usePreferencesQuery();
	const accounts = useAccountsQuery();
	const save = useSavePreferencesMutation();
	const [draft, setDraft] = useState<UserPreferences>(() =>
		defaultUserPreferences(Intl.DateTimeFormat().resolvedOptions().timeZone),
	);
	const [initialized, setInitialized] = useState(false);
	useEffect(() => {
		if (initialized || preferences.data?.ok !== true) return;
		setDraft(preferences.data.data);
		setInitialized(true);
	}, [initialized, preferences.data]);
	const accountList = useMemo(() => (accounts.data?.ok === true ? accounts.data.data.accounts : []), [accounts.data]);
	return (
		<section
			className={`dus-settings${draft.display.density === "compact" ? " is-density-compact" : ""}${draft.display.reducedMotion === "always" ? " is-reduced-motion" : draft.display.reducedMotion === "never" ? " allows-motion" : ""}`}
		>
			<div className="dus-settings-heading">
				<div>
					<h2>{t("settings.title")}</h2>
					<p>{t("settings.intro")}</p>
				</div>
				<button
					type="button"
					className="dus-secondary-button"
					onClick={() => {
						close();
						usageUiController.openDashboard();
					}}
				>
					{t("settings.preview")}
				</button>
			</div>
			<article className="dus-settings-card">
				<h3>{t("settings.display")}</h3>
				<PreferenceEditor draft={draft} onChange={setDraft} accounts={accountList} t={t} />
				<div className="dus-settings-actions">
					<button
						type="button"
						className="dus-primary-button"
						disabled={save.isPending}
						onClick={() => save.mutate(draft)}
					>
						{save.isPending ? t("settings.saving") : t("settings.save")}
					</button>
					{save.isSuccess ? <span className="dus-save-state">{t("settings.saved")}</span> : null}
				</div>
			</article>
			<ProviderManagement t={t} />
			<FeesEditor t={t} currency={draft.display.baseCurrency} />
			<CredentialEditor t={t} />
			<PricingEditor t={t} />
		</section>
	);
}
