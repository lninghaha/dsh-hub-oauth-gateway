import type { AccountSnapshot, QuotaWindow } from "../../shared/domain.js";
import type { AccountFeeRecord } from "../../shared/fees.js";
import { monthlyEquivalent, paybackMultiplier } from "../../shared/fees.js";
import { formatCurrency, formatDurationUntil, formatNumber, formatRelativeTime } from "../format.js";
import type { Translate } from "../locales.js";

function remainingRatio(window: QuotaWindow): number | null {
	if (window.usedRatio !== null) return Math.max(0, Math.min(1, 1 - window.usedRatio));
	if (window.limit !== null && window.remaining !== null && window.limit > 0) {
		return Math.max(0, Math.min(1, window.remaining / window.limit));
	}
	return null;
}

function ratioClass(ratio: number | null): string {
	if (ratio === null) return "unknown";
	if (ratio <= 0.1) return "critical";
	if (ratio <= 0.25) return "warning";
	return "healthy";
}

function resetLabel(window: QuotaWindow): string | null {
	if (window.resetsAt === null) return null;
	return formatDurationUntil(window.resetsAt);
}

function QuotaBar({ window }: { readonly window: QuotaWindow }) {
	const ratio = remainingRatio(window);
	const percent = ratio === null ? null : Math.round(ratio * 100);
	const label =
		percent === null
			? window.remaining === null
				? "—"
				: `${formatNumber(window.remaining)} ${window.unit}`
			: `${percent}%`;
	const reset = resetLabel(window);
	const resetUrgency =
		window.resetsAt === null
			? null
			: Math.max(0, Math.min(1, 1 - Math.max(0, window.resetsAt - Date.now()) / 3_600_000 / 24));
	return (
		<div className="dus-quota-row">
			<div className="dus-quota-meta">
				<span>{window.label}</span>
				<span className={`dus-quota-value is-${ratioClass(ratio)}`}>{label}</span>
			</div>
			<div className="dus-quota-dual-track">
				<div
					className="dus-quota-track"
					role="progressbar"
					aria-label={`${window.label} ${label}`}
					aria-valuemin={0}
					aria-valuemax={100}
					aria-valuenow={percent ?? undefined}
				>
					<div className={`dus-quota-fill is-${ratioClass(ratio)}`} style={{ width: `${percent ?? 0}%` }} />
				</div>
				{resetUrgency === null ? null : (
					<div
						className="dus-quota-reset-track"
						role="presentation"
						title={reset ?? undefined}
						style={{ width: `${Math.round(resetUrgency * 100)}%` }}
					/>
				)}
			</div>
			{reset === null ? null : (
				<span className="dus-quota-reset">
					<span className="dus-quota-reset-icon" aria-hidden="true">
						↻
					</span>
					{reset}
				</span>
			)}
		</div>
	);
}

/** Read-only quota windows for Usage Center / OAuth card surfaces. Hides when empty. */
export function QuotaBars({
	windows,
	limit = 3,
}: {
	readonly windows: readonly QuotaWindow[];
	readonly limit?: number;
}) {
	if (windows.length === 0) return null;
	return (
		<div className="dus-oauth-quota-bars">
			{windows.slice(0, limit).map((window) => (
				<QuotaBar key={`${window.kind}:${window.label}`} window={window} />
			))}
		</div>
	);
}

function balanceLabel(account: AccountSnapshot): string | null {
	const balance = account.balance;
	if (balance === null) return null;
	if (balance.unlimited) return "∞";
	const money = (value: number): string =>
		balance.currency === null ? formatNumber(value) : formatCurrency(value, balance.currency);
	if (balance.remaining !== null) return money(balance.remaining);
	if (balance.used !== null && balance.limit !== null) return `${money(balance.used)} / ${money(balance.limit)}`;
	return null;
}

function compactPriority(account: AccountSnapshot): number {
	if (account.balance !== null || account.windows.length > 0) return 0;
	if (account.status === "ok") return 1;
	if (account.configured && account.status !== "unsupported") return 2;
	if (account.configured) return 3;
	if (account.status === "pending") return 4;
	return 5;
}

function hasMeaningfulQuota(account: AccountSnapshot): boolean {
	return account.balance !== null || account.windows.length > 0;
}

function compactAccounts(accounts: readonly AccountSnapshot[]): AccountSnapshot[] {
	const ranked = accounts
		.map((account, index) => ({ account, index }))
		.sort((left, right) => compactPriority(left.account) - compactPriority(right.account) || left.index - right.index)
		.map(({ account }) => account);
	const meaningful = ranked.filter(hasMeaningfulQuota);
	if (meaningful.length > 0) {
		const fillers = ranked.filter(
			(account) =>
				!hasMeaningfulQuota(account) && account.status !== "unsupported" && account.status !== "not-configured",
		);
		return [...meaningful, ...fillers].slice(0, 8);
	}
	return ranked
		.filter((account) => account.status !== "unsupported" && account.status !== "not-configured")
		.slice(0, 8);
}

function feeKey(providerId: string, profileId: string): string {
	return profileId === "" ? providerId : `${providerId}\u0000${profileId}`;
}

function feeTooltip(
	fee: AccountFeeRecord,
	monthEstimatedCost: number | null,
	baseCurrency: string,
	t: Translate,
): string {
	const lines = [
		fee.planName ?? fee.kind,
		`${formatCurrency(fee.amount, fee.currency)}${fee.interval === null ? "" : ` / ${fee.interval}`}`,
	];
	if (fee.nextRenewalDate !== null) lines.push(t("fees.nextRenewal", { date: fee.nextRenewalDate }));
	const monthly = monthlyEquivalent(fee);
	if (monthly !== null) lines.push(t("fees.monthlyEquivalent", { value: formatCurrency(monthly, fee.currency) }));
	const payback = paybackMultiplier(fee, monthEstimatedCost, baseCurrency);
	if (payback === null) {
		if (fee.currency !== baseCurrency.toUpperCase() || monthEstimatedCost === null) {
			lines.push(t("fees.paybackUnavailable"));
		}
	} else {
		lines.push(t("fees.payback", { value: String(payback) }));
	}
	return lines.join(" · ");
}

function statusLabel(account: AccountSnapshot, t: Translate | undefined): string {
	if (account.stale) return t?.("status.stale") ?? "stale";
	const key = `status.${account.status}` as Parameters<Translate>[0];
	return t?.(key) ?? account.status;
}

function diagnosticLabel(code: string, t: Translate | undefined): string {
	const key = `quotaDiag.${code}` as Parameters<Translate>[0];
	const localized = t?.(key);
	if (localized !== undefined && localized !== key) return localized;
	return code;
}

function fetchedHint(account: AccountSnapshot, t: Translate | undefined): string | null {
	if (account.fetchedAt === null) return null;
	if (account.stale) {
		const when = formatRelativeTime(account.fetchedAt);
		return t?.("accounts.lastGood", { time: when }) ?? `last good ${when}`;
	}
	return null;
}

function roiBadge(
	fee: AccountFeeRecord | undefined,
	monthEstimatedCost: number | null,
	baseCurrency: string,
	t: Translate | undefined,
): string | null {
	if (fee === undefined || t === undefined) return null;
	const payback = paybackMultiplier(fee, monthEstimatedCost, baseCurrency);
	if (payback === null) return null;
	const monthly = monthlyEquivalent(fee);
	if (monthly === null) return null;
	return t("accounts.roiBadge", {
		monthly: formatCurrency(monthly, fee.currency),
		usage: formatCurrency(monthEstimatedCost, baseCurrency),
		payback: String(payback),
	});
}

export function AccountGrid({
	accounts,
	emptyLabel,
	compact = false,
	selectedProviderId,
	onSelect,
	onConfigureAccounts,
	fees = [],
	monthEstimatedCost = null,
	baseCurrency = "USD",
	t,
}: {
	readonly accounts: readonly AccountSnapshot[];
	readonly emptyLabel: string;
	readonly compact?: boolean;
	readonly selectedProviderId?: string | null;
	readonly onSelect?: (providerId: string) => void;
	readonly onConfigureAccounts?: () => void;
	readonly fees?: readonly AccountFeeRecord[];
	readonly monthEstimatedCost?: number | null;
	readonly baseCurrency?: string;
	readonly t?: Translate;
}) {
	if (accounts.length === 0) {
		return (
			<div className="dus-empty dus-empty-small dus-empty-guide">
				<p>{emptyLabel}</p>
				{onConfigureAccounts === undefined ? null : (
					<button type="button" className="dus-button is-primary is-small" onClick={onConfigureAccounts}>
						{t?.("accounts.configure") ?? "Configure accounts"}
					</button>
				)}
			</div>
		);
	}
	const visible = compact ? compactAccounts(accounts) : accounts;
	const feeByKey = new Map(fees.map((fee) => [feeKey(fee.providerId, fee.profileId), fee]));
	return (
		<div className={`dus-account-grid${compact ? " is-compact" : ""}`}>
			{visible.map((account) => {
				const fee = feeByKey.get(feeKey(account.providerId, account.profileId));
				const tip = fee === undefined || t === undefined ? null : feeTooltip(fee, monthEstimatedCost, baseCurrency, t);
				const roi = roiBadge(fee, monthEstimatedCost, baseCurrency, t);
				const cardKey = feeKey(account.providerId, account.profileId);
				const lastGood = fetchedHint(account, t);
				return (
					<article
						className={`dus-account-card${selectedProviderId === account.providerId ? " is-selected" : ""}`}
						key={cardKey}
					>
						<button
							type="button"
							className="dus-account-select"
							onClick={() => onSelect?.(account.providerId)}
							disabled={onSelect === undefined}
						>
							<span>
								<strong className="dus-account-name">{account.displayName}</strong>
								<span className="dus-account-plan" title={tip ?? undefined}>
									{account.plan ?? account.mode}
								</span>
							</span>
							<span className={`dus-status is-${account.stale ? "stale" : account.status}`}>
								{statusLabel(account, t)}
							</span>
						</button>
						{roi === null || compact ? null : <span className="dus-account-roi">{roi}</span>}
						{lastGood === null || compact ? null : <p className="dus-account-last-good">{lastGood}</p>}
						{balanceLabel(account) === null ? null : (
							<strong className="dus-account-balance" title={tip ?? undefined}>
								{balanceLabel(account)}
							</strong>
						)}
						{tip === null || compact ? null : <p className="dus-account-fee-tip">{tip}</p>}
						{account.windows.slice(0, compact ? 1 : 3).map((window) => (
							<QuotaBar key={`${window.kind}:${window.label}`} window={window} />
						))}
						{account.missingCredentials.length === 0 ? null : (
							<span className="dus-account-note">{account.missingCredentials.join(", ")}</span>
						)}
						{account.warningCode === null || compact ? null : (
							<span className="dus-account-note">{diagnosticLabel(account.warningCode, t)}</span>
						)}
					</article>
				);
			})}
		</div>
	);
}
