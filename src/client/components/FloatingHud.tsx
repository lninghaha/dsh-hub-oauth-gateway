/**
 * Compact draggable HUD for floating entry mode (token-monitor style).
 * Reads local overview/account snapshots only — never triggers credentialed refresh.
 */

import type { PropsLocale } from "@deepseek-ai/dsh-client-ui-slots";
import { type PointerEvent as ReactPointerEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AccountSnapshot } from "../../shared/domain.js";
import { defaultUserPreferences, type HudPosition, type UserPreferences } from "../../shared/preferences.js";
import { usageUiController } from "../controller.js";
import { formatCompact, formatCurrency, formatDurationUntil } from "../format.js";
import { translator } from "../locales.js";
import { useAccountsQuery, useOverviewQuery, usePreferencesQuery, useSavePreferencesMutation } from "../queries.js";
import { filtersFromPreferences, resolveUsageQuery } from "../range.js";

const MAX_HUD_BLOCKS = 6;
const DRAG_THRESHOLD_PX = 4;
const EDGE_SNAP_PX = 28;
const HUD_COLLAPSE_MS = 4_500;

type FloatingHudProps = PropsLocale<"usage-stats">;

function remainingRatio(account: AccountSnapshot): number | null {
	const fromWindows = account.windows
		.map((window) => (window.usedRatio === null ? null : 1 - window.usedRatio))
		.filter((value): value is number => value !== null)
		.sort((left, right) => left - right)[0];
	if (fromWindows !== undefined) return fromWindows;
	const balance = account.balance;
	if (balance === null || balance.unlimited) return null;
	if (balance.remaining !== null && balance.limit !== null && balance.limit > 0) {
		return Math.max(0, Math.min(1, balance.remaining / balance.limit));
	}
	return null;
}

function nextReset(account: AccountSnapshot): number | null {
	const resets = account.windows
		.map((window) => window.resetsAt)
		.filter((value): value is number => value !== null)
		.sort((left, right) => left - right);
	return resets[0] ?? null;
}

function hasQuotaSignal(account: AccountSnapshot): boolean {
	return account.balance !== null || account.windows.length > 0;
}

function pickHudAccounts(accounts: readonly AccountSnapshot[], preferences: UserPreferences): AccountSnapshot[] {
	const hidden = new Set(preferences.providers.hidden);
	const order = preferences.providers.order;
	const visible = accounts.filter((account) => !hidden.has(account.providerId));
	const ranked = [...visible].sort((left, right) => {
		const leftQuota = hasQuotaSignal(left) ? 0 : 1;
		const rightQuota = hasQuotaSignal(right) ? 0 : 1;
		if (leftQuota !== rightQuota) return leftQuota - rightQuota;
		const leftOrder = order.indexOf(left.providerId);
		const rightOrder = order.indexOf(right.providerId);
		const leftRank = leftOrder === -1 ? Number.MAX_SAFE_INTEGER : leftOrder;
		const rightRank = rightOrder === -1 ? Number.MAX_SAFE_INTEGER : rightOrder;
		return leftRank - rightRank || left.displayName.localeCompare(right.displayName);
	});
	return ranked.slice(0, MAX_HUD_BLOCKS + 1);
}

function defaultHudPosition(): HudPosition {
	if (typeof window === "undefined") return { left: 24, top: 24 };
	return {
		left: Math.max(16, window.innerWidth - 420),
		top: Math.max(16, window.innerHeight - 72),
	};
}

function snapToEdge(position: HudPosition, width: number, height: number): HudPosition {
	const maxLeft = Math.max(8, window.innerWidth - width - 8);
	const maxTop = Math.max(8, window.innerHeight - height - 8);
	let { left, top } = position;
	if (left < EDGE_SNAP_PX) left = 8;
	else if (left > maxLeft - EDGE_SNAP_PX) left = maxLeft;
	if (top < EDGE_SNAP_PX) top = 8;
	else if (top > maxTop - EDGE_SNAP_PX) top = maxTop;
	return { left, top };
}

function clampPosition(position: HudPosition, width: number, height: number): HudPosition {
	const maxLeft = Math.max(8, window.innerWidth - width - 8);
	const maxTop = Math.max(8, window.innerHeight - height - 8);
	return snapToEdge(
		{
			left: Math.min(maxLeft, Math.max(8, position.left)),
			top: Math.min(maxTop, Math.max(8, position.top)),
		},
		width,
		height,
	);
}

function shortName(name: string): string {
	const trimmed = name.trim();
	if (trimmed.length <= 8) return trimmed;
	return `${trimmed.slice(0, 7)}…`;
}

export function FloatingHud({ t: rawTranslate }: FloatingHudProps) {
	const t = translator(rawTranslate);
	const preferencesQuery = usePreferencesQuery();
	const savePreferences = useSavePreferencesMutation();
	const preferences =
		preferencesQuery.data?.ok === true
			? preferencesQuery.data.data
			: defaultUserPreferences(Intl.DateTimeFormat().resolvedOptions().timeZone);

	const enabled = preferences.display.entryMode === "floating";
	const query = useMemo(() => {
		const filters = filtersFromPreferences(preferences);
		return resolveUsageQuery({ ...filters, range: "today", compare: false }, preferences.display.timeZone);
	}, [preferences]);
	const overview = useOverviewQuery(query, enabled);
	const accounts = useAccountsQuery(enabled);

	const shellRef = useRef<HTMLButtonElement | null>(null);
	const [position, setPosition] = useState<HudPosition>(() => preferences.display.hudPosition ?? defaultHudPosition());
	const positionRef = useRef(position);
	const dragRef = useRef<{
		pointerId: number;
		originX: number;
		originY: number;
		startLeft: number;
		startTop: number;
		moved: boolean;
	} | null>(null);
	const suppressClickRef = useRef(false);
	const [collapsed, setCollapsed] = useState(false);
	const collapseTimerRef = useRef<number | null>(null);

	const bumpCollapseTimer = useCallback((): void => {
		setCollapsed(false);
		if (collapseTimerRef.current !== null) window.clearTimeout(collapseTimerRef.current);
		if (preferences.display.reducedMotion === "always") return;
		collapseTimerRef.current = window.setTimeout(() => setCollapsed(true), HUD_COLLAPSE_MS);
	}, [preferences.display.reducedMotion]);

	useEffect(() => {
		positionRef.current = position;
	}, [position]);

	useEffect(() => {
		if (!enabled) return;
		bumpCollapseTimer();
		return () => {
			if (collapseTimerRef.current !== null) window.clearTimeout(collapseTimerRef.current);
		};
	}, [enabled, bumpCollapseTimer]);

	useEffect(() => {
		if (preferences.display.hudPosition !== null) {
			setPosition(preferences.display.hudPosition);
		}
	}, [preferences.display.hudPosition]);

	useEffect(() => {
		if (!enabled) return;
		const onResize = (): void => {
			const node = shellRef.current;
			if (node === null) return;
			setPosition((current) => {
				const next = clampPosition(current, node.offsetWidth, node.offsetHeight);
				positionRef.current = next;
				return next;
			});
		};
		window.addEventListener("resize", onResize);
		return () => window.removeEventListener("resize", onResize);
	}, [enabled]);

	if (!enabled) return null;

	const data = overview.data?.ok === true ? overview.data.data : null;
	const snapshots = accounts.data?.ok === true ? accounts.data.data.accounts : [];
	const hudAccounts = pickHudAccounts(snapshots, preferences);
	const shown = hudAccounts.slice(0, MAX_HUD_BLOCKS);
	const overflow = Math.max(0, hudAccounts.length - shown.length);

	const metric = (() => {
		if (data === null) return "—";
		switch (preferences.display.sidebarMetric) {
			case "todayTokens":
				return formatCompact(
					data.current.inputTokens +
						data.current.outputTokens +
						data.current.cacheReadTokens +
						data.current.cacheWriteTokens,
				);
			case "todayCost":
				return formatCurrency(data.cost.amount, data.cost.currency);
			case "alerts":
				return String(data.alertCount);
			case "lowestQuota": {
				const remaining = hudAccounts
					.map(remainingRatio)
					.filter((value): value is number => value !== null)
					.sort((left, right) => left - right)[0];
				return remaining === undefined ? "—" : `${Math.round(remaining * 100)}%`;
			}
		}
	})();

	const persistPosition = (next: HudPosition): void => {
		positionRef.current = next;
		setPosition(next);
		if (preferencesQuery.data?.ok !== true) return;
		savePreferences.mutate({
			...preferences,
			display: { ...preferences.display, hudPosition: next },
		});
	};

	const onPointerDown = (event: ReactPointerEvent<HTMLButtonElement>): void => {
		if (event.button !== 0) return;
		bumpCollapseTimer();
		const node = shellRef.current;
		if (node === null) return;
		suppressClickRef.current = false;
		dragRef.current = {
			pointerId: event.pointerId,
			originX: event.clientX,
			originY: event.clientY,
			startLeft: positionRef.current.left,
			startTop: positionRef.current.top,
			moved: false,
		};
		node.setPointerCapture?.(event.pointerId);
	};

	const onPointerMove = (event: ReactPointerEvent<HTMLButtonElement>): void => {
		const drag = dragRef.current;
		const node = shellRef.current;
		if (drag === null || node === null || event.pointerId !== drag.pointerId) return;
		const dx = event.clientX - drag.originX;
		const dy = event.clientY - drag.originY;
		if (!drag.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return;
		drag.moved = true;
		suppressClickRef.current = true;
		const next = clampPosition(
			{ left: drag.startLeft + dx, top: drag.startTop + dy },
			node.offsetWidth,
			node.offsetHeight,
		);
		positionRef.current = next;
		setPosition(next);
	};

	const onPointerUp = (event: ReactPointerEvent<HTMLButtonElement>): void => {
		const drag = dragRef.current;
		const node = shellRef.current;
		if (drag === null || event.pointerId !== drag.pointerId) return;
		dragRef.current = null;
		try {
			node?.releasePointerCapture?.(event.pointerId);
		} catch {
			// ignore
		}
		if (!drag.moved) return;
		const next =
			node === null ? positionRef.current : clampPosition(positionRef.current, node.offsetWidth, node.offsetHeight);
		persistPosition(next);
	};

	const motionClass =
		preferences.display.reducedMotion === "always"
			? " is-reduced-motion"
			: preferences.display.reducedMotion === "never"
				? " allows-motion"
				: "";

	return (
		<button
			type="button"
			ref={shellRef}
			className={`dus-hud${preferences.display.density === "compact" ? " is-density-compact" : ""}${collapsed ? " is-collapsed" : ""}${motionClass}`}
			style={{ left: position.left, top: position.top }}
			aria-label={t("hud.openPeek")}
			onPointerEnter={() => setCollapsed(false)}
			onPointerLeave={bumpCollapseTimer}
			onPointerDown={onPointerDown}
			onPointerMove={onPointerMove}
			onPointerUp={onPointerUp}
			onPointerCancel={onPointerUp}
			onClick={(event) => {
				if (suppressClickRef.current) {
					event.preventDefault();
					suppressClickRef.current = false;
					return;
				}
				usageUiController.openPeek();
			}}
		>
			<span className="dus-hud-primary">
				<strong className="dus-hud-metric">{metric}</strong>
				{data?.alertCount ? <span className="dus-hud-alert">{data.alertCount}</span> : null}
			</span>
			<span className="dus-hud-divider" aria-hidden="true" />
			<span className="dus-hud-blocks">
				{shown.map((account) => {
					const ratio = remainingRatio(account);
					const reset = nextReset(account);
					const primary = ratio === null ? (account.balance?.unlimited ? "∞" : "—") : `${Math.round(ratio * 100)}%`;
					const secondary = reset === null ? "—" : formatDurationUntil(reset);
					return (
						<span
							className="dus-hud-block"
							key={`${account.providerId}:${account.profileId}`}
							title={account.displayName}
						>
							<span className="dus-hud-block-name">{shortName(account.displayName)}</span>
							<span className="dus-hud-block-stats">
								<span>{primary}</span>
								<span>{secondary}</span>
							</span>
						</span>
					);
				})}
				{overflow > 0 ? <span className="dus-hud-more">{t("hud.more", { count: overflow })}</span> : null}
			</span>
		</button>
	);
}
