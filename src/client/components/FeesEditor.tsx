import { useEffect, useRef, useState } from "react";
import type { AccountFeeRecord, FeeInterval, FeeKind } from "../../shared/fees.js";
import type { Translate } from "../locales.js";
import { useFeesQuery, useSaveFeesMutation } from "../queries.js";

type FeeField = "providerId" | "amount" | "currency" | "nextRenewalDate";
type FeeErrors = Readonly<Record<string, Readonly<Partial<Record<FeeField, string>>>>>;
type FeeDraft = Omit<
	AccountFeeRecord,
	"amount" | "nextRenewalDate" | "planName" | "notes" | "providerId" | "currency"
> & {
	readonly amount: string;
	readonly nextRenewalDate: string;
	readonly planName: string;
	readonly notes: string;
	readonly providerId: string;
	readonly currency: string;
};

function emptyFee(currency: string): FeeDraft {
	return {
		id: `fee-${Date.now()}`,
		providerId: "provider-a",
		profileId: "",
		accountLabel: null,
		kind: "subscription",
		planName: "",
		amount: "0",
		currency,
		interval: "month",
		anchorDate: null,
		nextRenewalDate: "",
		topups: [],
		notes: "",
		updatedAt: Date.now(),
	};
}

function draftFromFee(fee: AccountFeeRecord): FeeDraft {
	return {
		...fee,
		amount: String(fee.amount),
		nextRenewalDate: fee.nextRenewalDate ?? "",
		planName: fee.planName ?? "",
		notes: fee.notes ?? "",
	};
}

function parseDate(value: string): string | null | undefined {
	const normalized = value.trim();
	if (normalized === "") return null;
	if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) return undefined;
	const date = new Date(`${normalized}T00:00:00.000Z`);
	return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== normalized ? undefined : normalized;
}

function parseFees(
	drafts: readonly FeeDraft[],
	t: Translate,
): { readonly fees: AccountFeeRecord[]; readonly errors: FeeErrors } {
	const errors: Record<string, Partial<Record<FeeField, string>>> = {};
	const fees = drafts.flatMap((draft) => {
		const providerId = draft.providerId.trim();
		const currency = draft.currency.trim().toUpperCase();
		const amount = Number(draft.amount.trim());
		const nextRenewalDate = parseDate(draft.nextRenewalDate);
		const fieldErrors: Partial<Record<FeeField, string>> = {};
		if (providerId === "") fieldErrors.providerId = t("fees.errorRequired");
		if (!Number.isFinite(amount) || amount < 0) fieldErrors.amount = t("fees.errorAmount");
		if (currency === "") fieldErrors.currency = t("fees.errorRequired");
		if (nextRenewalDate === undefined) fieldErrors.nextRenewalDate = t("fees.errorDate");
		if (Object.keys(fieldErrors).length > 0) {
			errors[draft.id] = fieldErrors;
			return [];
		}
		const normalizedRenewalDate = nextRenewalDate ?? null;
		return [
			{
				...draft,
				providerId,
				amount,
				currency,
				planName: draft.planName.trim() || null,
				nextRenewalDate: normalizedRenewalDate,
				notes: draft.notes.trim() || null,
				updatedAt: Date.now(),
			},
		];
	});
	return { fees, errors };
}

function FieldError({ error }: { readonly error: string | undefined }) {
	return error === undefined ? null : (
		<span className="dus-field-error" role="alert">
			{error}
		</span>
	);
}

export function FeesEditor({ t, currency }: { readonly t: Translate; readonly currency: string }) {
	const query = useFeesQuery();
	const save = useSaveFeesMutation();
	const [fees, setFees] = useState<FeeDraft[]>([]);
	const [initialized, setInitialized] = useState(false);
	const [errors, setErrors] = useState<FeeErrors>({});
	const [savedRevision, setSavedRevision] = useState<number | null>(null);
	const draftRevision = useRef(0);
	useEffect(() => {
		if (initialized || query.data?.ok !== true) return;
		setFees(query.data.data.fees.map(draftFromFee));
		setInitialized(true);
	}, [initialized, query.data]);
	const markChanged = (): void => {
		draftRevision.current += 1;
		setSavedRevision(null);
	};
	const update = (index: number, patch: Partial<FeeDraft>): void => {
		markChanged();
		setErrors({});
		setFees((current) =>
			current.map((fee, position) => (position === index ? { ...fee, ...patch, updatedAt: Date.now() } : fee)),
		);
	};
	const saveDrafts = (): void => {
		const parsed = parseFees(fees, t);
		setErrors(parsed.errors);
		if (Object.keys(parsed.errors).length > 0) return;
		const savedAtRevision = draftRevision.current;
		setSavedRevision(null);
		save.mutate(parsed.fees, {
			onSuccess: () => {
				if (draftRevision.current === savedAtRevision) setSavedRevision(savedAtRevision);
			},
		});
	};
	if (!initialized) {
		return (
			<div className="dus-settings-card">
				<div>
					<h3>{t("settings.fees")}</h3>
					<p>{t("settings.feesIntro")}</p>
				</div>
				{query.error instanceof Error ? (
					<div className="dus-error-inline dus-retry-state" role="alert">
						<span>{t("fees.loadFailed", { message: query.error.message })}</span>
						<button type="button" className="dus-button is-small" onClick={() => void query.refetch()}>
							{t("action.retry")}
						</button>
					</div>
				) : (
					<div className="dus-chart-empty" role="status">
						{t("fees.loading")}
					</div>
				)}
			</div>
		);
	}
	return (
		<div className="dus-settings-card">
			<div>
				<h3>{t("settings.fees")}</h3>
				<p>{t("settings.feesIntro")}</p>
			</div>
			<div className="dus-fee-table">
				{query.error instanceof Error ? (
					<div className="dus-error-inline dus-retry-state" role="alert">
						<span>{t("fees.loadFailed", { message: query.error.message })}</span>
						<button type="button" className="dus-button is-small" onClick={() => void query.refetch()}>
							{t("action.retry")}
						</button>
					</div>
				) : null}
				{fees.length === 0 ? null : (
					<div className="dus-fee-head" aria-hidden="true">
						<span>{t("fees.kind")}</span>
						<span>{t("fees.providerId")}</span>
						<span>{t("fees.planName")}</span>
						<span>{t("fees.amount")}</span>
						<span>{t("fees.currency")}</span>
						<span>{t("fees.interval")}</span>
						<span>{t("fees.nextRenewalDate")}</span>
						<span>{t("fees.notes")}</span>
						<span />
					</div>
				)}
				{fees.map((fee, index) => {
					const rowErrors = errors[fee.id];
					return (
						<div className="dus-fee-row" key={fee.id}>
							<label className="dus-fee-field">
								<span className="dus-fee-field-label">{t("fees.kind")}</span>
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
							<label className="dus-fee-field">
								<span className="dus-fee-field-label">{t("fees.providerId")}</span>
								<input
									placeholder={t("fees.providerId")}
									value={fee.providerId}
									aria-invalid={rowErrors?.providerId !== undefined}
									onChange={(event) => update(index, { providerId: event.target.value })}
								/>
								<FieldError error={rowErrors?.providerId} />
							</label>
							<label className="dus-fee-field">
								<span className="dus-fee-field-label">{t("fees.planName")}</span>
								<input
									placeholder={t("fees.planName")}
									value={fee.planName}
									onChange={(event) => update(index, { planName: event.target.value })}
								/>
							</label>
							<label className="dus-fee-field">
								<span className="dus-fee-field-label">{t("fees.amount")}</span>
								<input
									inputMode="decimal"
									value={fee.amount}
									aria-invalid={rowErrors?.amount !== undefined}
									onChange={(event) => update(index, { amount: event.target.value })}
								/>
								<FieldError error={rowErrors?.amount} />
							</label>
							<label className="dus-fee-field">
								<span className="dus-fee-field-label">{t("fees.currency")}</span>
								<input
									maxLength={8}
									value={fee.currency}
									aria-invalid={rowErrors?.currency !== undefined}
									onChange={(event) => update(index, { currency: event.target.value })}
								/>
								<FieldError error={rowErrors?.currency} />
							</label>
							{fee.kind === "subscription" ? (
								<label className="dus-fee-field">
									<span className="dus-fee-field-label">{t("fees.interval")}</span>
									<select
										value={fee.interval ?? "month"}
										onChange={(event) => update(index, { interval: event.target.value as FeeInterval })}
									>
										<option value="month">{t("fees.intervalMonth")}</option>
										<option value="year">{t("fees.intervalYear")}</option>
									</select>
								</label>
							) : (
								<span className="dus-fee-placeholder">—</span>
							)}
							<label className="dus-fee-field">
								<span className="dus-fee-field-label">{t("fees.nextRenewalDate")}</span>
								<input
									placeholder={t("fees.datePlaceholder")}
									value={fee.nextRenewalDate}
									aria-invalid={rowErrors?.nextRenewalDate !== undefined}
									onChange={(event) => update(index, { nextRenewalDate: event.target.value })}
								/>
								<FieldError error={rowErrors?.nextRenewalDate} />
							</label>
							<label className="dus-fee-field">
								<span className="dus-fee-field-label">{t("fees.notes")}</span>
								<input
									placeholder={t("fees.notes")}
									value={fee.notes}
									onChange={(event) => update(index, { notes: event.target.value })}
								/>
							</label>
							<button
								type="button"
								className="dus-button is-small is-danger"
								aria-label={t("fees.remove")}
								onClick={() => {
									markChanged();
									setFees((current) => current.filter((_, position) => position !== index));
								}}
							>
								×
							</button>
						</div>
					);
				})}
			</div>
			<div className="dus-settings-actions">
				<button
					type="button"
					className="dus-button is-small"
					onClick={() => {
						markChanged();
						setFees((current) => [...current, emptyFee(currency)]);
					}}
				>
					{t("fees.add")}
				</button>
				<button type="button" className="dus-button is-primary" disabled={save.isPending} onClick={saveDrafts}>
					{save.isPending ? t("settings.saving") : t("settings.save")}
				</button>
				{savedRevision !== null ? (
					<span className="dus-save-state" role="status">
						{t("settings.feesSaved")}
					</span>
				) : null}
				{save.error instanceof Error ? (
					<span className="dus-error-inline" role="alert">
						{save.error.message}
						<button type="button" className="dus-button is-small" onClick={saveDrafts}>
							{t("action.retry")}
						</button>
					</span>
				) : null}
			</div>
		</div>
	);
}
