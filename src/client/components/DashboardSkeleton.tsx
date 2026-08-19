export function DashboardSkeleton({ peek = false }: { readonly peek?: boolean }) {
	return (
		<div className={`dus-skeleton${peek ? " is-peek" : ""}`} aria-hidden="true">
			<div className={`dus-skeleton-kpi${peek ? " is-compact" : ""}`}>
				{(peek ? [0, 1, 2, 3] : [0, 1, 2, 3]).map((index) => (
					<div className="dus-skeleton-card" key={index} />
				))}
			</div>
			<div className="dus-skeleton-block" />
			{peek ? <div className="dus-skeleton-strip" /> : <div className="dus-skeleton-chart" />}
		</div>
	);
}
