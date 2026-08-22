import type { DshCompatibility } from "../../shared/compatibility.js";
import type { Translate } from "../locales.js";
import { useCompatibilityQuery } from "../queries.js";

const statusKey = {
	healthy: "compatibility.status.healthy",
	degraded: "compatibility.status.degraded",
	incompatible: "compatibility.status.incompatible",
} as const;

const capabilityKey = {
	available: "compatibility.capability.available",
	missing: "compatibility.capability.missing",
	incompatible: "compatibility.capability.incompatible",
} as const;

function valueOrUnavailable(value: string | null, t: Translate): string {
	return value ?? t("compatibility.unavailable");
}

function CompatibilityDetails({ data, t }: { readonly data: DshCompatibility; readonly t: Translate }) {
	return (
		<dl className="dus-compatibility-meta">
			<div>
				<dt>{t("compatibility.status")}</dt>
				<dd>{t(statusKey[data.status])}</dd>
			</div>
			<div>
				<dt>{t("compatibility.dshVersion")}</dt>
				<dd>{valueOrUnavailable(data.dshVersion, t)}</dd>
			</div>
			<div>
				<dt>{t("compatibility.abi")}</dt>
				<dd>{data.coreAbi}</dd>
			</div>
			<div>
				<dt>{t("compatibility.uiOwner")}</dt>
				<dd>{valueOrUnavailable(data.uiOwner, t)}</dd>
			</div>
			<div>
				<dt>{t("compatibility.accessMode")}</dt>
				<dd>{data.accessMode}</dd>
			</div>
		</dl>
	);
}

export function CompatibilityPanel({ t }: { readonly t: Translate }) {
	const compatibility = useCompatibilityQuery();
	const data = compatibility.data?.ok === true ? compatibility.data.data : undefined;
	return (
		<section className="dus-settings-card dus-compatibility-panel" aria-labelledby="dus-compatibility-title">
			<div>
				<h3 id="dus-compatibility-title">{t("compatibility.title")}</h3>
				<p>{t("compatibility.intro")}</p>
			</div>
			{compatibility.isPending ? <div className="dus-chart-empty">{t("dashboard.loading")}</div> : null}
			{compatibility.error instanceof Error ? (
				<p className="dus-error-inline" role="alert">
					{t("compatibility.error")}
					<button type="button" className="dus-button is-small" onClick={() => void compatibility.refetch()}>
						{t("action.retry")}
					</button>
				</p>
			) : null}
			{data === undefined ? null : (
				<>
					<CompatibilityDetails data={data} t={t} />
					<div>
						<h4 className="dus-settings-subtitle">{t("compatibility.capabilities")}</h4>
						<ul className="dus-compatibility-list">
							{Object.entries(data.capabilities).map(([name, capability]) => (
								<li key={name}>
									<strong>{name}</strong>
									<span>{t(capabilityKey[capability.state])}</span>
									{capability.contract === undefined ? null : <code>{capability.contract}</code>}
									{capability.reason === undefined ? null : <span>{capability.reason}</span>}
								</li>
							))}
						</ul>
					</div>
					<div>
						<h4 className="dus-settings-subtitle">{t("compatibility.diagnostics")}</h4>
						{data.diagnostics.length === 0 ? (
							<p className="dus-row-hint">{t("compatibility.diagnosticsEmpty")}</p>
						) : (
							<ul className="dus-compatibility-list">
								{data.diagnostics.map((diagnostic) => (
									<li key={diagnostic}>{diagnostic}</li>
								))}
							</ul>
						)}
					</div>
				</>
			)}
		</section>
	);
}
