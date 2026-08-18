import type { ActivityData } from "../../shared/contracts.js";
import { formatCompact, formatCurrency } from "../format.js";
import type { Translate } from "../locales.js";

const CELL = 11;
const GAP = 3;

function intensity(value: number, maxValue: number): number {
	if (value <= 0 || maxValue <= 0) return 0;
	const ratio = value / maxValue;
	if (ratio < 0.2) return 1;
	if (ratio < 0.4) return 2;
	if (ratio < 0.7) return 3;
	return 4;
}

function weekdayOf(dateKey: string): number {
	const [year, month, day] = dateKey.split("-").map(Number);
	return new Date(Date.UTC(year ?? 1970, (month ?? 1) - 1, day ?? 1)).getUTCDay();
}

function dayValue(
	day: { tokens: number; cost: number | null; requests: number },
	metric: string,
): number {
	if (metric === "estimatedCost") return day.cost ?? 0;
	if (metric === "requests") return day.requests;
	return day.tokens;
}

export function ActivityHeatmap({
	data,
	metric,
	currency,
	t,
}: {
	readonly data: ActivityData;
	readonly metric: string;
	readonly currency: string;
	readonly t: Translate;
}) {
	const maxValue = Math.max(0, ...data.days.map((day) => dayValue(day, metric)));
	const first = data.days[0]?.date ?? "1970-01-01";
	const startPad = (weekdayOf(first) - data.weekStartsOn + 7) % 7;
	const columns: Array<Array<(typeof data.days)[number] | null>> = [];
	let column: Array<(typeof data.days)[number] | null> = Array.from({ length: startPad }, () => null);
	for (const day of data.days) {
		column.push(day);
		if (column.length === 7) {
			columns.push(column);
			column = [];
		}
	}
	if (column.length > 0) {
		while (column.length < 7) column.push(null);
		columns.push(column);
	}
	const width = Math.max(columns.length * (CELL + GAP), CELL);
	const height = 7 * (CELL + GAP);
	const title =
		metric === "estimatedCost"
			? t("activity.metricCost")
			: metric === "requests"
				? t("activity.metricRequests")
				: t("activity.metricTokens");

	return (
		<section className="dus-section dus-activity-section" aria-label={t("activity.title")}>
			<div className="dus-section-head">
				<h3 className="dus-section-title">{t("activity.title")}</h3>
				<span className="dus-section-note">
					{t("activity.streak", { current: String(data.streak), longest: String(data.longestStreak) })}
				</span>
			</div>
			<p className="dus-activity-caption">{title}</p>
			<div className="dus-heatmap-scroll">
				<svg
					className="dus-heatmap"
					width={width}
					height={height}
					viewBox={`0 0 ${width} ${height}`}
					role="img"
					aria-label={t("activity.title")}
				>
					{columns.flatMap((week, columnIndex) =>
						week.map((day, rowIndex) => {
							const x = columnIndex * (CELL + GAP);
							const y = rowIndex * (CELL + GAP);
							const key = `c${columnIndex}-r${rowIndex}`;
							if (day === null) {
								return (
									<rect key={key} x={x} y={y} width={CELL} height={CELL} rx={2} className="dus-heatmap-cell is-pad" />
								);
							}
							const level = day.hasData ? intensity(dayValue(day, metric), maxValue) : 0;
							const label =
								metric === "estimatedCost"
									? `${day.date}: ${formatCurrency(day.cost, currency)}`
									: metric === "requests"
										? `${day.date}: ${formatCompact(day.requests)}`
										: `${day.date}: ${formatCompact(day.tokens)}`;
							return (
								<rect
									key={day.date}
									x={x}
									y={y}
									width={CELL}
									height={CELL}
									rx={2}
									className={`dus-heatmap-cell is-level-${level}${day.hasData ? "" : " is-empty"}`}
								>
									<title>{label}</title>
								</rect>
							);
						}),
					)}
				</svg>
			</div>
			<div className="dus-heatmap-legend" aria-hidden="true">
				<span>{t("activity.less")}</span>
				{[0, 1, 2, 3, 4].map((level) => (
					<span className={`dus-heatmap-swatch is-level-${level}`} key={level} />
				))}
				<span>{t("activity.more")}</span>
			</div>
		</section>
	);
}
