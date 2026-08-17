import type { AccountSnapshot, QuotaWindow } from "../../shared/domain.js";
import { formatCurrency, formatDurationUntil, formatNumber } from "../format.js";

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
	return (
		<div className="dus-quota-row">
			<div className="dus-quota-meta">
				<span>{window.label}</span>
				<span className={`dus-quota-value is-${ratioClass(ratio)}`}>{label}</span>
			</div>
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
			{resetLabel(window) === null ? null : <span className="dus-quota-reset">↻ {resetLabel(window)}</span>}
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

function compactAccounts(accounts: readonly AccountSnapshot[]): AccountSnapshot[] {
	return accounts
		.map((account, index) => ({ account, index }))
		.sort((left, right) => compactPriority(left.account) - compactPriority(right.account) || left.index - right.index)
		.slice(0, 4)
		.map(({ account }) => account);
}

export function AccountGrid({
	accounts,
	emptyLabel,
	compact = false,
	selectedProviderId,
	onSelect,
}: {
	readonly accounts: readonly AccountSnapshot[];
	readonly emptyLabel: string;
	readonly compact?: boolean;
	readonly selectedProviderId?: string | null;
	readonly onSelect?: (providerId: string) => void;
}) {
	if (accounts.length === 0) return <div className="dus-empty dus-empty-small">{emptyLabel}</div>;
	const visible = compact ? compactAccounts(accounts) : accounts;
	return (
		<div className={`dus-account-grid${compact ? " is-compact" : ""}`}>
			{visible.map((account) => (
				<article
					className={`dus-account-card${selectedProviderId === account.providerId ? " is-selected" : ""}`}
					key={account.providerId}
				>
					<button
						type="button"
						className="dus-account-select"
						onClick={() => onSelect?.(account.providerId)}
						disabled={onSelect === undefined}
					>
						<span>
							<strong className="dus-account-name">{account.displayName}</strong>
							<span className="dus-account-plan">{account.plan ?? account.mode}</span>
						</span>
						<span className={`dus-status is-${account.stale ? "stale" : account.status}`}>
							{account.stale ? "stale" : account.status}
						</span>
					</button>
					{balanceLabel(account) === null ? null : (
						<strong className="dus-account-balance">{balanceLabel(account)}</strong>
					)}
					{account.windows.slice(0, compact ? 1 : 3).map((window) => (
						<QuotaBar key={`${window.kind}:${window.label}`} window={window} />
					))}
					{account.missingCredentials.length === 0 ? null : (
						<span className="dus-account-note">{account.missingCredentials.join(", ")}</span>
					)}
				</article>
			))}
		</div>
	);
}
