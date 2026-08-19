import { useEffect, useMemo, useRef } from "react";
import type uPlot from "uplot";
import type { SeriesData } from "../../shared/contracts.js";
import type { UsageMetric } from "../../shared/domain.js";
import { formatMetric } from "../format.js";

const COLORS = [
	"var(--dus-accent)",
	"var(--dus-accent-2)",
	"var(--dus-warning)",
	"var(--dus-danger)",
	"#63a9e8",
	"#a88add",
] as const;

interface ChartSeries {
	readonly key: string;
	readonly label: string;
	readonly total: number;
}

function chartSeries(data: SeriesData): ChartSeries[] {
	const totals = new Map<string, { label: string; total: number }>();
	for (const point of data.points) {
		for (const value of point.values) {
			const current = totals.get(value.key) ?? { label: value.label, total: 0 };
			current.total += value.value ?? 0;
			totals.set(value.key, current);
		}
	}
	return [...totals.entries()]
		.map(([key, value]) => ({ key, ...value }))
		.sort((left, right) => right.total - left.total)
		.slice(0, 6);
}

function alignedData(data: SeriesData, series: readonly ChartSeries[]): uPlot.AlignedData {
	const timestamps = [...data.points, ...data.forecast].map(({ timestamp }) => timestamp / 1_000);
	const values = series.map((entry) => [
		...data.points.map((point) => point.values.find(({ key }) => key === entry.key)?.value ?? null),
		...data.forecast.map(() => null),
	]);
	if (data.forecast.length === 0) return [timestamps, ...values] as uPlot.AlignedData;
	const forecasts = series.map((entry) => [
		...data.points.map((point, index) =>
			index === data.points.length - 1 ? (point.values.find(({ key }) => key === entry.key)?.value ?? null) : null,
		),
		...data.forecast.map((point) => point.values.find(({ key }) => key === entry.key)?.value ?? null),
	]);
	return [timestamps, ...values, ...forecasts] as uPlot.AlignedData;
}

function readChartTheme(element: HTMLElement): { stroke: string; grid: string; series: string[] } {
	const styles = getComputedStyle(element);
	const muted = styles.getPropertyValue("--dus-muted").trim() || "#8d91a3";
	const border = styles.getPropertyValue("--dus-border").trim() || "rgba(140,145,165,.12)";
	const series = COLORS.map((token) => {
		if (!token.startsWith("var(")) return token;
		const name = token.slice(4, -1).trim();
		return styles.getPropertyValue(name).trim() || token;
	});
	return { stroke: muted, grid: border, series };
}

export function UsageChart({
	data,
	metric,
	currency,
	colors = {},
	emptyLabel = "—",
}: {
	data: SeriesData;
	metric: UsageMetric;
	currency: string;
	colors?: Readonly<Record<string, string>>;
	emptyLabel?: string;
}) {
	const host = useRef<HTMLDivElement>(null);
	const series = useMemo(() => chartSeries(data), [data]);
	const aligned = useMemo(() => alignedData(data, series), [data, series]);

	useEffect(() => {
		const element = host.current;
		if (element === null || data.points.length === 0 || series.length === 0) return;
		let disposed = false;
		let plot: uPlot | null = null;
		let observer: ResizeObserver | null = null;
		let resize: (() => void) | null = null;
		void import("uplot").then(({ default: UPlot }) => {
			if (disposed) return;
			const theme = readChartTheme(element);
			const width = Math.max(300, element.clientWidth || 720);
			plot = new UPlot(
				{
					width,
					height: 270,
					cursor: { drag: { x: true, y: false }, focus: { prox: 24 } },
					legend: { show: true, live: true },
					axes: [
						{ stroke: theme.stroke, grid: { stroke: theme.grid, width: 1 } },
						{
							stroke: theme.stroke,
							grid: { stroke: theme.grid, width: 1 },
							values: (_plot, ticks) => ticks.map((value) => formatMetric(metric, value, currency)),
						},
					],
					series: [
						{},
						...series.map((entry, index) => {
							const stroke = colors[entry.key] ?? theme.series[index % theme.series.length] ?? "#6f6af8";
							return {
								label: entry.label,
								stroke,
								width: 2,
								points: { show: false },
								value: (_plot: uPlot, value: number | null) => formatMetric(metric, value, currency),
							};
						}),
						...(data.forecast.length === 0
							? []
							: series.map((entry, index) => {
									const stroke = colors[entry.key] ?? theme.series[index % theme.series.length] ?? "#6f6af8";
									return {
										label: `${entry.label} · forecast`,
										stroke,
										width: 1.5,
										dash: [6, 5],
										points: { show: false },
										value: (_plot: uPlot, value: number | null) => formatMetric(metric, value, currency),
									};
								})),
					],
				},
				aligned,
				element,
			);
			resize = () => plot?.setSize({ width: Math.max(300, element.clientWidth || width), height: 270 });
			observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(resize);
			observer?.observe(element);
			window.addEventListener("resize", resize);
		});
		return () => {
			disposed = true;
			observer?.disconnect();
			if (resize !== null) window.removeEventListener("resize", resize);
			plot?.destroy();
		};
	}, [aligned, colors, currency, data.forecast.length, data.points.length, metric, series]);

	if (data.points.length === 0 || series.length === 0) return <div className="dus-chart-empty">{emptyLabel}</div>;
	return (
		<div className="dus-chart-wrap">
			<div ref={host} className="dus-chart" aria-hidden="true" />
			<ul className="dus-sr-only">
				{series.map((entry) => (
					<li key={entry.key}>
						{entry.label}: {formatMetric(metric, entry.total, currency)}
					</li>
				))}
			</ul>
		</div>
	);
}
