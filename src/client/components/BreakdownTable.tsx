import type { BreakdownData } from "../../shared/contracts.js";
import { totalTokens } from "../../shared/domain.js";
import { formatCompact, formatCurrency, formatPercent } from "../format.js";

export interface BreakdownLabels {
	readonly dimension: string;
	readonly tokens: string;
	readonly share: string;
	readonly requests: string;
	readonly cache: string;
	readonly cost: string;
}

export function BreakdownTable({
	data,
	onSelect,
	labels,
}: {
	readonly data: BreakdownData;
	readonly onSelect?: ((key: string) => void) | undefined;
	readonly labels: BreakdownLabels;
}) {
	const total = data.rows.reduce((sum, row) => sum + totalTokens(row.buckets), 0);
	return (
		<div className="dus-table-scroll">
			<table className="dus-table">
				<thead>
					<tr>
						<th scope="col">{labels.dimension}</th>
						<th scope="col">{labels.tokens}</th>
						<th scope="col">{labels.share}</th>
						<th scope="col">{labels.requests}</th>
						<th scope="col">{labels.cache}</th>
						<th scope="col">{labels.cost}</th>
					</tr>
				</thead>
				<tbody>
					{data.rows.map((row) => {
						const tokens = totalTokens(row.buckets);
						return (
							<tr key={row.key}>
								<th scope="row">
									{onSelect === undefined ? (
										row.label
									) : (
										<button type="button" className="dus-table-link" onClick={() => onSelect(row.key)}>
											{row.label}
										</button>
									)}
								</th>
								<td>{formatCompact(tokens)}</td>
								<td>{formatPercent(total === 0 ? null : tokens / total)}</td>
								<td>{formatCompact(row.requests)}</td>
								<td>{formatPercent(row.cacheHitRate)}</td>
								<td title={`${Math.round(row.cost.coverageRatio * 100)}% priced`}>
									{formatCurrency(row.cost.amount, row.cost.currency)}
								</td>
							</tr>
						);
					})}
				</tbody>
			</table>
		</div>
	);
}
