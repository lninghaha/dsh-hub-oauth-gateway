import { describe, expect, it } from "vitest";
import type { QuotaWindow } from "../../../src/shared/domain.js";
import {
	orderPoolAccounts,
	QUOTA_FULL_RATIO,
	selectAccount,
	urgencyFromSnapshots,
} from "../../../src/server/coding-oauth/quota-pool.js";

function window(partial: Partial<QuotaWindow> & Pick<QuotaWindow, "id" | "usedRatio">): QuotaWindow {
	return {
		kind: "weekly",
		label: partial.id,
		unit: "percent",
		used: null,
		remaining: null,
		limit: null,
		resetsAt: null,
		rolling: false,
		...partial,
	};
}

describe("urgencyFromSnapshots", () => {
	it("scores missing windows as urgency 0 (Copilot-style last resort)", () => {
		expect(urgencyFromSnapshots(undefined)).toEqual({ available: true, urgency: 0 });
		expect(urgencyFromSnapshots([])).toEqual({ available: true, urgency: 0 });
	});

	it("gates availability at 95% used", () => {
		const justUnder = urgencyFromSnapshots([window({ id: "w", usedRatio: QUOTA_FULL_RATIO - 0.001 })]);
		expect(justUnder.available).toBe(true);
		const atGate = urgencyFromSnapshots([window({ id: "w", usedRatio: QUOTA_FULL_RATIO })]);
		expect(atGate.available).toBe(false);
		const over = urgencyFromSnapshots([window({ id: "w", usedRatio: 0.99 })]);
		expect(over.available).toBe(false);
	});

	it("uses remaining ratio / time-until-reset as urgency", () => {
		const now = 1_000_000;
		const soon = urgencyFromSnapshots(
			[window({ id: "soon", usedRatio: 0.2, resetsAt: now + 1_000 })],
			now,
		);
		const later = urgencyFromSnapshots(
			[window({ id: "later", usedRatio: 0.2, resetsAt: now + 10_000 })],
			now,
		);
		expect(soon.urgency).toBeGreaterThan(later.urgency);
		expect(soon.urgency).toBeCloseTo(0.8 / 1_000);
	});
});

describe("selectAccount", () => {
	it("priority order leads with sticky then active then document order", () => {
		const pick = selectAccount({
			accounts: ["a", "b", "c"],
			activeId: "b",
			snapshotsByAccountId: new Map(),
			stickyId: "c",
			strategy: "priority",
			switchMargin: 2,
		});
		expect(pick).toEqual({ accountId: "c", reason: "sticky" });
		expect(
			orderPoolAccounts({
				accounts: ["a", "b", "c"],
				activeId: "b",
				snapshotsByAccountId: new Map(),
				stickyId: "c",
				strategy: "priority",
				switchMargin: 2,
			}).map((entry) => entry.accountId),
		).toEqual(["c", "b", "a"]);
	});

	it("quota_aware prefers higher urgency and keeps sticky within switchMargin", () => {
		const now = 1_000_000;
		const snapshots = new Map<string, QuotaWindow[]>([
			["low", [window({ id: "l", usedRatio: 0.1, resetsAt: now + 10_000 })]],
			["high", [window({ id: "h", usedRatio: 0.1, resetsAt: now + 1_000 })]],
		]);
		const withoutSticky = selectAccount({
			accounts: ["low", "high"],
			activeId: "low",
			snapshotsByAccountId: snapshots,
			stickyId: undefined,
			strategy: "quota_aware",
			switchMargin: 2,
			now,
		});
		expect(withoutSticky.accountId).toBe("high");
		expect(withoutSticky.reason).toBe("quota_aware");

		const stickyHolds = selectAccount({
			accounts: ["low", "high"],
			activeId: "low",
			snapshotsByAccountId: snapshots,
			stickyId: "low",
			strategy: "quota_aware",
			switchMargin: 100,
			now,
		});
		expect(stickyHolds).toEqual({ accountId: "low", reason: "sticky" });

		const stickyYields = selectAccount({
			accounts: ["low", "high"],
			activeId: "low",
			snapshotsByAccountId: snapshots,
			stickyId: "low",
			strategy: "quota_aware",
			switchMargin: 1,
			now,
		});
		expect(stickyYields.accountId).toBe("high");
		expect(stickyYields.reason).toBe("quota_aware");
	});

	it("places 95%-full accounts in the quota_full_fallback tail", () => {
		const now = 1_000_000;
		const ordered = orderPoolAccounts({
			accounts: ["full", "ok"],
			activeId: "full",
			snapshotsByAccountId: new Map([
				["full", [window({ id: "f", usedRatio: 0.96, resetsAt: now + 1_000 })]],
				["ok", [window({ id: "o", usedRatio: 0.1, resetsAt: now + 1_000 })]],
			]),
			stickyId: undefined,
			strategy: "quota_aware",
			switchMargin: 2,
			now,
		});
		expect(ordered.map((entry) => entry.accountId)).toEqual(["ok", "full"]);
		expect(ordered[1]?.reason).toBe("quota_full_fallback");
	});

	it("ranks missing snapshots last among available peers (urgency 0)", () => {
		const now = 1_000_000;
		const ordered = orderPoolAccounts({
			accounts: ["unknown", "measured"],
			activeId: "unknown",
			snapshotsByAccountId: new Map([
				["measured", [window({ id: "m", usedRatio: 0.5, resetsAt: now + 5_000 })]],
			]),
			stickyId: undefined,
			strategy: "quota_aware",
			switchMargin: 2,
			now,
		});
		expect(ordered[0]?.accountId).toBe("measured");
		expect(ordered[1]?.accountId).toBe("unknown");
	});
});
