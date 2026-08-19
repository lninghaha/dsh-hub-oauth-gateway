import { useMemo, useState } from "react";
import type { ActivityData, ActivityDay } from "../../shared/contracts.js";
import { formatCompact, formatCurrency } from "../format.js";
import type { Translate } from "../locales.js";

const CELL = 11;
const GAP = 3;
const LABEL_LEFT = 28;
const LABEL_TOP = 18;

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

function dayValue(day: ActivityDay, metric: string): number {
	if (metric === "estimatedCost") return day.cost ?? 0;
	if (metric === "requests") return day.requests;
	return day.tokens;
}

function monthLabel(dateKey: string): string | null {
	const [, month, day] = dateKey.split("-").map(Number);
	if (day !== 1) return null;
	const date = new Date(Date.UTC(2000, (month ?? 1) - 1, 1));
	return date.toLocaleString(undefined, { month: "short" });
}

function weekdayLabels(weekStartsOn: number, t: Translate): string[] {
	const labels = [
		t("activity.weekday.sun"),
		t("activity.weekday.mon"),
		t("activity.weekday.tue"),
		t("activity.weekday.wed"),
		t("activity.weekday.thu"),
		t("activity.weekday.fri"),
		t("activity.weekday.sat"),
	];
	const rotated = [...labels.slice(weekStartsOn), ...labels.slice(0, weekStartsOn)];
	return rotated;
}

function dayDetailLabel(day: ActivityDay, metric: string, currency: string): string {
	if (metric === "estimatedCost") return formatCurrency(day.cost, currency);
	if (metric === "requests") return formatCompact(day.requests);
	return formatCompact(day.tokens);
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
	const [selectedDate, setSelectedDate] = useState<string | null>(null);
	const maxValue = Math.max(0, ...data.days.map((day) => dayValue(day, metric)));
	const first = data.days[0]?.date ?? "1970-01-01";
	const startPad = (weekdayOf(first) - data.weekStartsOn + 7) % 7;
	const columns = useMemo(() => {
		const built: Array<Array<ActivityDay | null>> = [];
		let column: Array<ActivityDay | null> = Array.from({ length: startPad }, () => null);
		for (const day of data.days) {
			column.push(day);
			if (column.length === 7) {
				built.push(column);
				column = [];
			}
		}
		if (column.length > 0) {
			while (column.length < 7) column.push(null);
			built.push(column);
		}
		return built;
	}, [data.days, startPad]);
	const gridWidth = Math.max(columns.length * (CELL + GAP), CELL);
	const gridHeight = 7 * (CELL + GAP);
	const width = LABEL_LEFT + gridWidth;
	const height = LABEL_TOP + gridHeight;
	const title =
		metric === "estimatedCost"
			? t("activity.metricCost")
			: metric === "requests"
				? t("activity.metricRequests")
				: t("activity.metricTokens");
	const weekdays = useMemo(() => weekdayLabels(data.weekStartsOn, t), [data.weekStartsOn, t]);
	const selectedDay = selectedDate === null ? null : (data.days.find((day) => day.date === selectedDate) ?? null);
	const monthMarkers = useMemo(() => {
		const markers: Array<{ x: number; label: string }> = [];
		for (const [columnIndex, week] of columns.entries()) {
			for (const day of week) {
				if (day === null) continue;
				const label = monthLabel(day.date);
				if (label === null) continue;
				markers.push({ x: LABEL_LEFT + columnIndex * (CELL + GAP), label });
				break;
			}
		}
		return markers;
	}, [columns]);

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
					{monthMarkers.map(({ x, label }) => (
						<text key={`${x}-${label}`} x={x} y={12} className="dus-heatmap-axis-label">
							{label}
						</text>
					))}
					{weekdays.map((label, rowIndex) =>
						rowIndex % 2 === 0 ? (
							<text
								key={label}
								x={0}
								y={LABEL_TOP + rowIndex * (CELL + GAP) + CELL - 2}
								className="dus-heatmap-axis-label"
							>
								{label}
							</text>
						) : null,
					)}
					<g transform={`translate(${LABEL_LEFT}, ${LABEL_TOP})`}>
						{columns.flatMap((week, columnIndex) =>
							week.map((day, rowIndex) => {
								const x = columnIndex * (CELL + GAP);
								const y = rowIndex * (CELL + GAP);
								const key = day?.date ?? `c${columnIndex}-r${rowIndex}`;
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
								const selected = selectedDate === day.date;
								return (
									// biome-ignore lint/a11y/useSemanticElements: SVG heatmap grid uses focusable g wrappers around rect cells.
									<g
										key={day.date}
										role="button"
										tabIndex={0}
										className={`dus-heatmap-cell-group${selected ? " is-selected" : ""}`}
										aria-label={label}
										onClick={() => setSelectedDate((current) => (current === day.date ? null : day.date))}
										onKeyDown={(event) => {
											if (event.key === "Enter" || event.key === " ") {
												event.preventDefault();
												setSelectedDate((current) => (current === day.date ? null : day.date));
											}
										}}
									>
										<rect
											x={x}
											y={y}
											width={CELL}
											height={CELL}
											rx={2}
											className={`dus-heatmap-cell is-level-${level}${day.hasData ? "" : " is-empty"}${selected ? " is-selected" : ""}`}
										>
											<title>{label}</title>
										</rect>
									</g>
								);
							}),
						)}
					</g>
				</svg>
			</div>
			{selectedDay === null ? null : (
				<section className="dus-heatmap-detail" aria-label={t("activity.dayDetail")}>
					<strong>{selectedDay.date}</strong>
					<span>{dayDetailLabel(selectedDay, metric, currency)}</span>
					<span className="dus-muted">{t("activity.dayRequests", { value: formatCompact(selectedDay.requests) })}</span>
					<button type="button" className="dus-button is-small" onClick={() => setSelectedDate(null)}>
						{t("activity.clearDay")}
					</button>
				</section>
			)}
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
