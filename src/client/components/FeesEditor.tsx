import { useEffect, useState } from "react";
import type { AccountFeeRecord, FeeInterval, FeeKind } from "../../shared/fees.js";
import type { Translate } from "../locales.js";
import { useFeesQuery, useSaveFeesMutation } from "../queries.js";

function emptyFee(currency: string): AccountFeeRecord {
	return {
		id: `fee-${Date.now()}`,
		providerId: "provider-a",
		profileId: "",
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

export function FeesEditor({ t, currency }: { readonly t: Translate; readonly currency: string }) {
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
			current.map((fee, position) => (position === index ? { ...fee, ...patch, updatedAt: Date.now() } : fee)),
		);
	return (
		<div className="dus-settings-card">
			<div>
				<h3>{t("settings.fees")}</h3>
				<p>{t("settings.feesIntro")}</p>
			</div>
			<div className="dus-fee-table">
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
				{fees.map((fee, index) => (
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
								onChange={(event) => update(index, { providerId: event.target.value.trim() || "provider-a" })}
							/>
						</label>
						<label className="dus-fee-field">
							<span className="dus-fee-field-label">{t("fees.planName")}</span>
							<input
								placeholder={t("fees.planName")}
								value={fee.planName ?? ""}
								onChange={(event) => update(index, { planName: event.target.value.trim() || null })}
							/>
						</label>
						<label className="dus-fee-field">
							<span className="dus-fee-field-label">{t("fees.amount")}</span>
							<input
								inputMode="decimal"
								value={fee.amount}
								onChange={(event) => update(index, { amount: Math.max(0, Number(event.target.value) || 0) })}
							/>
						</label>
						<label className="dus-fee-field">
							<span className="dus-fee-field-label">{t("fees.currency")}</span>
							<input
								maxLength={8}
								value={fee.currency}
								onChange={(event) => update(index, { currency: event.target.value.toUpperCase() })}
							/>
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
						</label>
						<label className="dus-fee-field">
							<span className="dus-fee-field-label">{t("fees.notes")}</span>
							<input
								placeholder={t("fees.notes")}
								value={fee.notes ?? ""}
								onChange={(event) => update(index, { notes: event.target.value.trim() || null })}
							/>
						</label>
						<button
							type="button"
							className="dus-button is-small is-danger"
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
					className="dus-button is-small"
					onClick={() => setFees((current) => [...current, emptyFee(currency)])}
				>
					{t("fees.add")}
				</button>
				<button
					type="button"
					className="dus-button is-primary"
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
