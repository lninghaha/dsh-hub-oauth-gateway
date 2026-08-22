import { useEffect, useRef, useState } from "react";
import { type PriceRule, PriceRuleSchema } from "../../shared/domain.js";
import type { Translate } from "../locales.js";
import { materializePresetRules, PRICING_PRESETS } from "../pricing-presets.js";
import { usePricingQuery, useSavePricingMutation } from "../queries.js";
import { parseNonNegativeNumber } from "./form-utils.js";

interface ReplacementPreview {
	readonly label: string;
	readonly rules: readonly PriceRule[];
	readonly added: number;
	readonly removed: number;
	readonly changed: number;
}

function ruleIdentity(rule: PriceRule): string {
	return [rule.providerPattern, rule.modelPattern, rule.effectiveFrom, rule.currency].join("\u0000");
}

function ruleContent(rule: PriceRule): string {
	return JSON.stringify({
		inputPerMillion: rule.inputPerMillion,
		outputPerMillion: rule.outputPerMillion,
		cacheReadPerMillion: rule.cacheReadPerMillion,
		cacheWritePerMillion: rule.cacheWritePerMillion,
	});
}

function sameRules(left: readonly PriceRule[], right: readonly PriceRule[]): boolean {
	return JSON.stringify(left) === JSON.stringify(right);
}

function previewReplacement(
	label: string,
	current: readonly PriceRule[],
	next: readonly PriceRule[],
): ReplacementPreview {
	const inventory = (rules: readonly PriceRule[]): Map<string, Map<string, number>> => {
		const result = new Map<string, Map<string, number>>();
		for (const rule of rules) {
			const identity = ruleIdentity(rule);
			const content = ruleContent(rule);
			const contents = result.get(identity) ?? new Map<string, number>();
			contents.set(content, (contents.get(content) ?? 0) + 1);
			result.set(identity, contents);
		}
		return result;
	};
	const before = inventory(current);
	const after = inventory(next);
	let added = 0;
	let removed = 0;
	let changed = 0;
	for (const identity of new Set([...before.keys(), ...after.keys()])) {
		const beforeContents = before.get(identity) ?? new Map<string, number>();
		const afterContents = after.get(identity) ?? new Map<string, number>();
		let beforeRemaining = 0;
		let afterRemaining = 0;
		for (const content of new Set([...beforeContents.keys(), ...afterContents.keys()])) {
			const beforeCount = beforeContents.get(content) ?? 0;
			const afterCount = afterContents.get(content) ?? 0;
			const exactMatches = Math.min(beforeCount, afterCount);
			beforeRemaining += beforeCount - exactMatches;
			afterRemaining += afterCount - exactMatches;
		}
		const changedHere = Math.min(beforeRemaining, afterRemaining);
		changed += changedHere;
		removed += beforeRemaining - changedHere;
		added += afterRemaining - changedHere;
	}
	return {
		label,
		rules: next,
		added,
		removed,
		changed,
	};
}

export function PricingEditor({ t }: { readonly t: Translate }) {
	const query = usePricingQuery();
	const save = useSavePricingMutation();
	const [rules, setRules] = useState<PriceRule[]>([]);
	const [baseline, setBaseline] = useState<PriceRule[]>([]);
	const [initialized, setInitialized] = useState(false);
	const [importError, setImportError] = useState<string | null>(null);
	const [replacement, setReplacement] = useState<ReplacementPreview | null>(null);
	const [undoRules, setUndoRules] = useState<PriceRule[] | null>(null);
	const [dirty, setDirty] = useState(false);
	const draftRevision = useRef(0);
	const rulesRef = useRef<PriceRule[]>([]);
	const currency = query.data?.ok === true ? query.data.data.baseCurrency : "USD";
	useEffect(() => {
		rulesRef.current = rules;
	}, [rules]);
	useEffect(() => {
		if (initialized || query.data?.ok !== true) return;
		const loaded = query.data.data.rules.filter(({ source }) => source === "user");
		setRules(loaded);
		setBaseline(loaded);
		setInitialized(true);
	}, [initialized, query.data]);
	const markDirty = (): void => {
		draftRevision.current += 1;
		setDirty(true);
	};
	const update = (index: number, patch: Partial<PriceRule>): void => {
		markDirty();
		setUndoRules(null);
		setRules((current) =>
			current.map((rule, position) => (position === index ? { ...rule, ...patch, updatedAt: Date.now() } : rule)),
		);
	};
	const proposeReplacement = (label: string, next: readonly PriceRule[]): void => {
		setReplacement(previewReplacement(label, rules, next));
		setImportError(null);
	};
	const applyReplacement = (): void => {
		if (replacement === null) return;
		setUndoRules(rules);
		setRules([...replacement.rules]);
		markDirty();
		setReplacement(null);
	};
	const saveRules = (): void => {
		const savedRules = rules;
		const savedRevision = draftRevision.current;
		save.mutate(
			{ baseCurrency: currency, rules: savedRules },
			{
				onSuccess: () => {
					setBaseline(savedRules);
					const unchangedSinceSave = draftRevision.current === savedRevision;
					setDirty(!sameRules(rulesRef.current, savedRules));
					if (unchangedSinceSave) setUndoRules(null);
				},
			},
		);
	};
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
			proposeReplacement(t("pricing.import"), imported);
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
							onClick={() => {
								markDirty();
								setUndoRules(null);
								setRules((current) => current.filter((_, position) => position !== index));
							}}
						>
							×
						</button>
					</div>
				))}
			</div>
			{importError === null ? null : (
				<span className="dus-error-inline" role="alert">
					{importError}
				</span>
			)}
			{replacement === null ? null : (
				<section className="dus-replacement-preview" aria-labelledby="dus-pricing-preview-title">
					<strong id="dus-pricing-preview-title">{t("pricing.previewTitle", { source: replacement.label })}</strong>
					<p>
						{t("pricing.previewDiff", {
							added: replacement.added,
							changed: replacement.changed,
							removed: replacement.removed,
						})}
					</p>
					{dirty ? <p className="dus-gateway-warning">{t("pricing.previewDirty")}</p> : null}
					<div className="dus-inline-actions">
						<button type="button" className="dus-button is-danger" onClick={applyReplacement}>
							{t("pricing.previewApply")}
						</button>
						<button type="button" className="dus-button" onClick={() => setReplacement(null)}>
							{t("action.close")}
						</button>
					</div>
				</section>
			)}
			<div className="dus-pricing-presets">
				<span className="dus-row-hint">{t("pricing.presetsHint")}</span>
				<div className="dus-inline-actions">
					{PRICING_PRESETS.map((preset) => (
						<button
							key={preset.id}
							type="button"
							className="dus-button is-small"
							onClick={() => proposeReplacement(t(preset.labelKey), materializePresetRules(preset, currency))}
						>
							{t(preset.labelKey)}
						</button>
					))}
				</div>
			</div>
			<div className="dus-settings-actions">
				{undoRules === null ? null : (
					<button
						type="button"
						className="dus-button is-small"
						onClick={() => {
							setRules(undoRules);
							setUndoRules(null);
							draftRevision.current += 1;
							setDirty(!sameRules(undoRules, baseline));
						}}
					>
						{t("pricing.undo")}
					</button>
				)}
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
					onClick={() => {
						markDirty();
						setUndoRules(null);
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
						]);
					}}
				>
					＋
				</button>
				<button type="button" className="dus-button is-primary" disabled={save.isPending || !dirty} onClick={saveRules}>
					{t("settings.save")}
				</button>
				{save.isSuccess && !dirty ? <span className="dus-save-state">{t("settings.saved")}</span> : null}
				{save.error instanceof Error ? (
					<span className="dus-error-inline" role="alert">
						{save.error.message}
						<button type="button" className="dus-button is-small" onClick={saveRules}>
							{t("action.retry")}
						</button>
					</span>
				) : null}
			</div>
		</div>
	);
}
