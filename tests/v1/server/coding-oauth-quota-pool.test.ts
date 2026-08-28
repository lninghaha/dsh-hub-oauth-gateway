import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { resolveQuotaWindowsForPoolAccount } from "../../../src/server/accounts/oauth-credential-bridge.js";
import { CODEX_PI_PROVIDER } from "../../../src/server/coding-oauth/ids.js";
import {
	AccountPoolController,
	orderPoolAccounts,
	QUOTA_FULL_RATIO,
	selectAccount,
	urgencyFromSnapshots,
} from "../../../src/server/coding-oauth/quota-pool.js";
import { OAuthCredentialFileStore } from "../../../src/server/coding-oauth/store.js";
import type { QuotaWindow } from "../../../src/shared/domain.js";

const temporaryDirectories = new Set<string>();

afterEach(async () => {
	await Promise.all([...temporaryDirectories].map((directory) => rm(directory, { recursive: true, force: true })));
	temporaryDirectories.clear();
});

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
		const soon = urgencyFromSnapshots([window({ id: "soon", usedRatio: 0.2, resetsAt: now + 1_000 })], now);
		const later = urgencyFromSnapshots([window({ id: "later", usedRatio: 0.2, resetsAt: now + 10_000 })], now);
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
			snapshotsByAccountId: new Map([["measured", [window({ id: "m", usedRatio: 0.5, resetsAt: now + 5_000 })]]]),
			stickyId: undefined,
			strategy: "quota_aware",
			switchMargin: 2,
			now,
		});
		expect(ordered[0]?.accountId).toBe("measured");
		expect(ordered[1]?.accountId).toBe("unknown");
	});
});

describe("AccountPoolController provider-scoped quota fallback", () => {
	it("marks AuthDocument accounts quota_full_fallback via Usage Center codex row", async () => {
		const directory = await mkdtemp(join(tmpdir(), "hub-oauth-pool-quota-"));
		temporaryDirectories.add(directory);
		await mkdir(directory, { recursive: true, mode: 0o700 });
		const path = join(directory, "openai-codex.json");
		const store = new OAuthCredentialFileStore(CODEX_PI_PROVIDER, path, "codex-oauth");
		await store.upsertAccount({
			id: "acct-chatgpt-aaaa",
			credential: {
				type: "oauth",
				access: "access-a",
				refresh: "refresh-a",
				expires: Date.now() + 3_600_000,
			},
			makeActive: true,
		});
		await store.upsertAccount({
			id: "acct-chatgpt-bbbb",
			credential: {
				type: "oauth",
				access: "access-b",
				refresh: "refresh-b",
				expires: Date.now() + 3_600_000,
			},
		});

		const usageCenterAccounts = [
			{
				providerId: "codex",
				profileId: "",
				windows: [window({ id: "codex-weekly", usedRatio: 0.99 })],
			},
		];

		const controller = new AccountPoolController({
			mode: "quota_aware",
			switchMargin: 2,
			getQuotaWindows: (accountId, context) =>
				resolveQuotaWindowsForPoolAccount(usageCenterAccounts, accountId, context),
		});

		const picks = await controller.candidates(store, CODEX_PI_PROVIDER, undefined);
		expect(picks).toHaveLength(2);
		expect(picks.map((pick) => pick.accountId).sort()).toEqual(["acct-chatgpt-aaaa", "acct-chatgpt-bbbb"]);
		expect(picks.every((pick) => pick.reason === "quota_full_fallback")).toBe(true);
	});
});
