import type { AccountSnapshot, QuotaWindow } from "../../shared/domain.js";
import { formatDurationUntil } from "../format.js";
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

function tightestWindow(account: AccountSnapshot): { window: QuotaWindow; ratio: number } | null {
	let best: { window: QuotaWindow; ratio: number } | null = null;
	for (const window of account.windows) {
		const ratio = remainingRatio(window);
		if (ratio === null) continue;
		if (best === null || ratio < best.ratio) best = { window, ratio };
	}
	const balance = account.balance;
	if (
		balance !== null &&
		!balance.unlimited &&
		balance.remaining !== null &&
		balance.limit !== null &&
		balance.limit > 0
	) {
		const ratio = Math.max(0, Math.min(1, balance.remaining / balance.limit));
		if (best === null || ratio < best.ratio) {
			best = {
				window: {
					id: "balance",
					kind: "custom",
					label: "Balance",
					unit: "currency",
					used: balance.used,
					remaining: balance.remaining,
					limit: balance.limit,
					usedRatio: null,
					resetsAt: null,
					rolling: false,
				},
				ratio,
			};
		}
	}
	return best;
}

function accountPriority(account: AccountSnapshot): number {
	if (account.windows.length > 0 || account.balance !== null) return 0;
	if (account.status === "ok") return 1;
	return 2;
}

export function pickTightestQuotaAccounts(accounts: readonly AccountSnapshot[], limit = 3): AccountSnapshot[] {
	return [...accounts]
		.filter((account) => account.status !== "unsupported" && account.status !== "not-configured")
		.sort((left, right) => accountPriority(left) - accountPriority(right))
		.filter((account) => tightestWindow(account) !== null)
		.sort((left, right) => {
			const leftRatio = tightestWindow(left)?.ratio ?? 1;
			const rightRatio = tightestWindow(right)?.ratio ?? 1;
			return leftRatio - rightRatio;
		})
		.slice(0, limit);
}

function ResetRing({ resetsAt, ratio }: { readonly resetsAt: number | null; readonly ratio: number | null }) {
	if (resetsAt === null) return null;
	const now = Date.now();
	const remainingMs = Math.max(0, resetsAt - now);
	const hours = remainingMs / 3_600_000;
	const urgency = Math.max(0, Math.min(1, 1 - hours / 24));
	const ringRatio = ratio ?? 0;
	return (
		<span className="dus-quota-reset-ring" aria-hidden="true">
			<svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true" focusable="false">
				<title>reset</title>
				<circle cx="9" cy="9" r="7" fill="none" stroke="var(--dus-control)" strokeWidth="2" />
				<circle
					cx="9"
					cy="9"
					r="7"
					fill="none"
					stroke="currentColor"
					strokeWidth="2"
					strokeLinecap="round"
					strokeDasharray={`${ringRatio * 44} 44`}
					transform="rotate(-90 9 9)"
					className={`is-${ratioClass(ratio)}`}
				/>
				<circle
					cx="9"
					cy="9"
					r="4.5"
					fill="none"
					stroke="var(--dus-warning)"
					strokeWidth="1.5"
					strokeDasharray={`${urgency * 28} 28`}
					transform="rotate(-90 9 9)"
					opacity="0.85"
				/>
			</svg>
		</span>
	);
}

export function PeekQuotaSummary({
	accounts,
	t,
}: {
	readonly accounts: readonly AccountSnapshot[];
	readonly t: Translate;
}) {
	const picked = pickTightestQuotaAccounts(accounts);
	if (picked.length === 0) return null;
	return (
		<section className="dus-peek-quota-strip" aria-label={t("peek.quotaStrip")}>
			<h3 className="dus-section-title">{t("peek.quotaStrip")}</h3>
			<ul className="dus-peek-quota-list">
				{picked.map((account) => {
					const tight = tightestWindow(account);
					if (tight === null) return null;
					const { window, ratio } = tight;
					const percent = Math.round(ratio * 100);
					const reset = window.resetsAt === null ? null : formatDurationUntil(window.resetsAt);
					return (
						<li className="dus-peek-quota-item" key={`${account.providerId}:${account.profileId}`}>
							<div className="dus-peek-quota-head">
								<strong>{account.displayName}</strong>
								<span className={`dus-quota-value is-${ratioClass(ratio)}`}>{percent}%</span>
							</div>
							<div className="dus-peek-quota-bar-row">
								<div
									className="dus-quota-track"
									role="progressbar"
									aria-label={`${account.displayName} ${window.label}`}
									aria-valuemin={0}
									aria-valuemax={100}
									aria-valuenow={percent}
								>
									<div className={`dus-quota-fill is-${ratioClass(ratio)}`} style={{ width: `${percent}%` }} />
								</div>
								<ResetRing resetsAt={window.resetsAt} ratio={ratio} />
							</div>
							<div className="dus-peek-quota-meta">
								<span>{window.label}</span>
								{reset === null ? null : <span className="dus-quota-reset">↻ {reset}</span>}
							</div>
						</li>
					);
				})}
			</ul>
		</section>
	);
}
