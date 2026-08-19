import { useEffect, useState } from "react";
import { type PriceRule, PriceRuleSchema } from "../../shared/domain.js";
import type { Translate } from "../locales.js";
import { materializePresetRules, PRICING_PRESETS } from "../pricing-presets.js";
import { usePricingQuery, useSavePricingMutation } from "../queries.js";
import { parseNonNegativeNumber } from "./form-utils.js";

export function PricingEditor({ t }: { readonly t: Translate }) {
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
							aria-label={t("pricing.providerPattern")}
							placeholder={t("pricing.providerPattern")}
							value={rule.providerPattern}
							onChange={(event) => update(index, { providerPattern: event.target.value })}
						/>
						<input
							aria-label={t("pricing.modelPattern")}
							placeholder={t("pricing.modelPattern")}
							value={rule.modelPattern}
							onChange={(event) => update(index, { modelPattern: event.target.value })}
						/>
						<input
							aria-label={t("pricing.inputPerMillion")}
							placeholder={t("pricing.inputPerMillion")}
							inputMode="decimal"
							value={rule.inputPerMillion ?? ""}
							onChange={(event) => update(index, { inputPerMillion: parseNonNegativeNumber(event.target.value) })}
						/>
						<input
							aria-label={t("pricing.outputPerMillion")}
							placeholder={t("pricing.outputPerMillion")}
							inputMode="decimal"
							value={rule.outputPerMillion ?? ""}
							onChange={(event) => update(index, { outputPerMillion: parseNonNegativeNumber(event.target.value) })}
						/>
						<input
							aria-label={t("pricing.cacheReadPerMillion")}
							placeholder={t("pricing.cacheReadPerMillion")}
							inputMode="decimal"
							value={rule.cacheReadPerMillion ?? ""}
							onChange={(event) => update(index, { cacheReadPerMillion: parseNonNegativeNumber(event.target.value) })}
						/>
						<input
							aria-label={t("pricing.cacheWritePerMillion")}
							placeholder={t("pricing.cacheWritePerMillion")}
							inputMode="decimal"
							value={rule.cacheWritePerMillion ?? ""}
							onChange={(event) => update(index, { cacheWritePerMillion: parseNonNegativeNumber(event.target.value) })}
						/>
						<button
							type="button"
							className="dus-button is-small is-danger"
							aria-label={t("pricing.remove")}
							onClick={() => setRules((current) => current.filter((_, position) => position !== index))}
						>
							×
						</button>
					</div>
				))}
			</div>
			{importError === null ? null : <span className="dus-error-inline">{importError}</span>}
			<div className="dus-pricing-presets">
				<span className="dus-row-hint">{t("pricing.presetsHint")}</span>
				<div className="dus-inline-actions">
					{PRICING_PRESETS.map((preset) => (
						<button
							key={preset.id}
							type="button"
							className="dus-button is-small"
							onClick={() => setRules(materializePresetRules(preset, currency))}
						>
							{t(preset.labelKey)}
						</button>
					))}
				</div>
			</div>
			<div className="dus-settings-actions">
				<label className="dus-button is-small">
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
					className="dus-button is-small"
					aria-label={t("pricing.add")}
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
					className="dus-button is-primary"
					disabled={save.isPending}
					onClick={() => save.mutate({ baseCurrency: currency, rules })}
				>
					{t("settings.save")}
				</button>
			</div>
		</div>
	);
}
