import type { AccountSnapshot } from "../../shared/domain.js";
import type { AccountFeeRecord } from "../../shared/fees.js";
import type { Translate } from "../locales.js";
import { AccountGrid } from "./AccountGrid.js";

export function AccountsDashboardSection({
	accounts,
	emptyLabel,
	onConfigureAccounts,
	selectedProviderId = null,
	onSelect,
	fees = [],
	monthEstimatedCost = null,
	baseCurrency = "USD",
	t,
}: {
	readonly accounts: readonly AccountSnapshot[];
	readonly emptyLabel: string;
	readonly onConfigureAccounts?: () => void;
	readonly selectedProviderId?: string | null;
	readonly onSelect?: (providerId: string) => void;
	readonly fees?: readonly AccountFeeRecord[];
	readonly monthEstimatedCost?: number | null;
	readonly baseCurrency?: string;
	readonly t: Translate;
}) {
	return (
		<section className="dus-section dus-accounts-section">
			<div className="dus-section-head">
				<h3 className="dus-section-title">{t("accounts.title")}</h3>
				{onConfigureAccounts !== undefined ? (
					<button type="button" className="dus-button is-small" onClick={onConfigureAccounts}>
						{t("accounts.manage")}
					</button>
				) : null}
			</div>
			<AccountGrid
				accounts={accounts}
				emptyLabel={emptyLabel}
				selectedProviderId={selectedProviderId}
				{...(onConfigureAccounts !== undefined ? { onConfigureAccounts } : {})}
				{...(onSelect !== undefined ? { onSelect } : {})}
				fees={fees}
				monthEstimatedCost={monthEstimatedCost}
				baseCurrency={baseCurrency}
				t={t}
			/>
		</section>
	);
}
