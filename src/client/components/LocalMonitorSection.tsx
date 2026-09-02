/**
 * Dashboard "本机" tab: token-monitor-style local machine surfaces. The auth
 * cards show the allowlisted CLI credential states and this plugin's own
 * OAuth sessions; the usage panel aggregates the opt-in cross-tool log scan;
 * optional vendor status-page probes appear when enabled. Neither surface
 * ever contains credential material or message content.
 */

import type { LocalAuthCliStatus, LocalUsageRow } from "../../shared/local-monitor.js";
import type { StatusProbeResult } from "../../shared/status-probes.js";
import { usageUiController } from "../controller.js";
import { formatCompact, formatRelativeTime } from "../format.js";
import type { Translate } from "../locales.js";
import { useLocalAuthQuery, useLocalUsageQuery, useLocalUsageScanMutation, useStatusProbesQuery } from "../queries.js";

function cliStateLabel(t: Translate, status: LocalAuthCliStatus): string {
	switch (status.state) {
		case "signed-in":
			return t("local.auth.signedIn");
		case "expired":
			return t("local.auth.expired");
		case "signed-out":
			return t("local.auth.signedOut");
		default:
			return t(`oauth.importUnavailable.${status.reason ?? "missing"}` as const);
	}
}

function cliStateClass(status: LocalAuthCliStatus): string {
	switch (status.state) {
		case "signed-in":
			return "is-ok";
		case "expired":
			return "is-stale";
		case "signed-out":
			return "";
		default:
			return "is-error";
	}
}

function toolLabel(status: LocalAuthCliStatus): string {
	switch (status.kind) {
		case "grok":
			return "Grok CLI";
		case "codex":
			return "Codex CLI";
		case "kimi":
			return "Kimi CLI";
		default:
			return "Claude CLI";
	}
}

/** "in 5m"-style future offset, clamped for past timestamps. */
function formatUntil(timestamp: number, now = Date.now()): string {
	const seconds = Math.max(0, Math.round((timestamp - now) / 1_000));
	if (seconds < 60) return `${seconds}s`;
	const minutes = Math.round(seconds / 60);
	if (minutes < 60) return `${minutes}m`;
	const hours = Math.round(minutes / 60);
	if (hours < 48) return `${hours}h`;
	return `${Math.round(hours / 24)}d`;
}

function probeStatusClass(probe: StatusProbeResult): string {
	if (!probe.ok) return "is-error";
	switch (probe.indicator) {
		case "none":
			return "is-ok";
		case "minor":
			return "is-stale";
		case "major":
		case "critical":
			return "is-error";
		default:
			return "";
	}
}

function probeStatusLabel(t: Translate, probe: StatusProbeResult): string {
	if (!probe.ok) return t("statusProbes.failed", { code: probe.errorCode ?? "unavailable" });
	return t(`statusProbes.indicator.${probe.indicator}` as const);
}

function UsageTable({ rows, t }: { readonly rows: readonly LocalUsageRow[]; readonly t: Translate }) {
	if (rows.length === 0) return <div className="dus-chart-empty dus-empty-small">{t("local.usage.empty")}</div>;
	const byTool = new Map<
		string,
		{ input: number; output: number; cache: number; requests: number; models: Set<string> }
	>();
	for (const row of rows) {
		const bucket = byTool.get(row.toolId) ?? { input: 0, output: 0, cache: 0, requests: 0, models: new Set<string>() };
		bucket.input += row.inputTokens;
		bucket.output += row.outputTokens;
		bucket.cache += row.cacheReadTokens + row.cacheWriteTokens;
		bucket.requests += row.requests;
		bucket.models.add(row.modelId);
		byTool.set(row.toolId, bucket);
	}
	return (
		<div className="dus-table-scroll">
			<table className="dus-table">
				<thead>
					<tr>
						<th>{t("local.usage.tool")}</th>
						<th>{t("breakdown.requests")}</th>
						<th>{t("breakdown.input")}</th>
						<th>{t("breakdown.output")}</th>
						<th>{t("breakdown.cache")}</th>
						<th>{t("local.usage.models")}</th>
					</tr>
				</thead>
				<tbody>
					{[...byTool.entries()].map(([toolId, bucket]) => (
						<tr key={toolId}>
							<td>{toolId}</td>
							<td>{formatCompact(bucket.requests)}</td>
							<td>{formatCompact(bucket.input)}</td>
							<td>{formatCompact(bucket.output)}</td>
							<td>{formatCompact(bucket.cache)}</td>
							<td>{bucket.models.size}</td>
						</tr>
					))}
				</tbody>
			</table>
		</div>
	);
}

export function LocalMonitorSection({ t }: { readonly t: Translate }) {
	const auth = useLocalAuthQuery();
	const usage = useLocalUsageQuery();
	const scan = useLocalUsageScanMutation();
	const statusProbes = useStatusProbesQuery();
	const authData = auth.data?.ok === true ? auth.data.data : null;
	const usageData = usage.data?.ok === true ? usage.data.data : null;
	const probesData = statusProbes.data?.ok === true ? statusProbes.data.data : null;
	return (
		<>
			<section className="dus-section" data-local-monitor="auth">
				<div className="dus-section-head">
					<h3 className="dus-section-title">{t("local.auth.title")}</h3>
					{authData?.enabled === true ? (
						<span className="dus-section-note">
							{t("dashboard.updated", { time: formatRelativeTime(authData.generatedAt) })}
						</span>
					) : null}
				</div>
				<p className="dus-settings-hint">{t("local.auth.hint")}</p>
				{authData === null ? (
					<div className="dus-chart-empty dus-empty-small">{t("dashboard.loading")}</div>
				) : !authData.enabled ? (
					<div className="dus-empty-guide">
						<p className="dus-row-hint">{t("local.auth.disabled")}</p>
						<button
							type="button"
							className="dus-button is-small"
							onClick={() => usageUiController.requestSettingsTab("capabilities")}
						>
							{t("local.openCapabilities")}
						</button>
					</div>
				) : (
					<div className="dus-account-grid is-compact">
						{authData.cli.map((cli) => (
							<article className="dus-account-card" key={cli.kind} data-local-auth={cli.kind}>
								<div className="dus-account-select">
									<span>
										<span className="dus-account-name">{toolLabel(cli)}</span>
										<span className="dus-account-plan">{cli.displayPath}</span>
									</span>
									<span className={`dus-status ${cliStateClass(cli)}`}>{cliStateLabel(t, cli)}</span>
								</div>
								{cli.state === "signed-in" || cli.state === "expired" ? (
									<span className="dus-account-note">
										{cli.expiresAt === null
											? t("local.auth.noExpiry")
											: t("local.auth.expiresAt", { time: formatUntil(cli.expiresAt) })}
										{cli.hasRefreshToken ? ` · ${t("local.auth.hasRefresh")}` : ""}
									</span>
								) : null}
							</article>
						))}
						{authData.sessions.map((session) => (
							<article className="dus-account-card" key={session.provider} data-local-session={session.provider}>
								<div className="dus-account-select">
									<span>
										<span className="dus-account-name">{t("local.auth.pluginSession", { route: session.route })}</span>
										<span className="dus-account-plan">{t("local.auth.pluginSessionHint")}</span>
									</span>
									<span className={`dus-status${session.authenticated ? " is-ok" : ""}`}>
										{session.authenticated ? t("local.auth.signedIn") : t("local.auth.signedOut")}
									</span>
								</div>
							</article>
						))}
					</div>
				)}
			</section>
			<section className="dus-section" data-status-probes="1">
				<div className="dus-section-head">
					<h3 className="dus-section-title">{t("statusProbes.title")}</h3>
					{probesData?.enabled === true ? (
						<span className="dus-section-note">
							{t("dashboard.updated", { time: formatRelativeTime(probesData.generatedAt) })}
						</span>
					) : null}
				</div>
				<p className="dus-settings-hint">{t("statusProbes.hint")}</p>
				{probesData === null ? (
					<div className="dus-chart-empty dus-empty-small">{t("dashboard.loading")}</div>
				) : !probesData.enabled ? (
					<div className="dus-empty-guide">
						<p className="dus-row-hint">{t("statusProbes.disabled")}</p>
					</div>
				) : probesData.probes.length === 0 ? (
					<div className="dus-chart-empty dus-empty-small">{t("statusProbes.empty")}</div>
				) : (
					<div className="dus-account-grid is-compact">
						{probesData.probes.map((probe) => (
							<article className="dus-account-card" key={probe.id} data-status-probe={probe.id}>
								<div className="dus-account-select">
									<span>
										<span className="dus-account-name">{probe.label}</span>
										<span className="dus-account-plan">{probe.pageUrl}</span>
									</span>
									<span className={`dus-status ${probeStatusClass(probe)}`}>{probeStatusLabel(t, probe)}</span>
								</div>
								{probe.description !== null ? <span className="dus-account-note">{probe.description}</span> : null}
							</article>
						))}
					</div>
				)}
			</section>
			<section className="dus-section" data-local-monitor="usage">
				<div className="dus-section-head">
					<h3 className="dus-section-title">{t("local.usage.title")}</h3>
					{usageData?.enabled === true ? (
						<span className="dus-inline-actions">
							<span className="dus-section-note">
								{usageData.lastScanAt === null
									? t("local.usage.neverScanned")
									: t("dashboard.updated", { time: formatRelativeTime(usageData.lastScanAt) })}
							</span>
							<button
								type="button"
								className="dus-button is-small"
								disabled={scan.isPending}
								onClick={() => scan.mutate()}
							>
								{scan.isPending ? t("local.usage.scanning") : t("local.usage.scan")}
							</button>
						</span>
					) : null}
				</div>
				<p className="dus-settings-hint">{t("local.usage.hint")}</p>
				{usageData === null ? (
					<div className="dus-chart-empty dus-empty-small">{t("dashboard.loading")}</div>
				) : !usageData.enabled ? (
					<div className="dus-empty-guide">
						<p className="dus-row-hint">{t("local.usage.disabled")}</p>
						<button
							type="button"
							className="dus-button is-small"
							onClick={() => usageUiController.requestSettingsTab("capabilities")}
						>
							{t("local.openCapabilities")}
						</button>
					</div>
				) : (
					<UsageTable rows={usageData.rows} t={t} />
				)}
				{scan.error instanceof Error ? (
					<p className="dus-error-inline" role="alert">
						{scan.error.message}
					</p>
				) : null}
			</section>
		</>
	);
}
