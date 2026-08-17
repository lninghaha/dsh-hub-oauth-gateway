import { describe, expect, it, vi } from "vitest";
import { startRefreshScheduler } from "../../../src/server/scheduler.js";

describe("refresh scheduler", () => {
	it("runs immediate single-flight refreshes, keeps separate cadences, and stops cleanly", async () => {
		let usageCalls = 0;
		let accountCalls = 0;
		const callbacks: Array<() => void> = [];
		const delays: number[] = [];
		const cancelled: unknown[] = [];
		const timers: Array<{ unref: ReturnType<typeof vi.fn> }> = [];
		const scheduler = startRefreshScheduler(
			{
				async refresh() {
					usageCalls += 1;
				},
			},
			{
				async refresh() {
					accountCalls += 1;
				},
			},
			{ warn: vi.fn() },
			{
				usageIntervalMs: 30_000,
				accountIntervalMs: 300_000,
				setInterval: ((callback: () => void, delay: number) => {
					callbacks.push(callback);
					delays.push(delay);
					const timer = { unref: vi.fn() };
					timers.push(timer);
					return timer;
				}) as unknown as typeof globalThis.setInterval,
				clearInterval: ((timer: unknown) => cancelled.push(timer)) as typeof globalThis.clearInterval,
			},
		);
		await Promise.all([scheduler.refreshUsage(), scheduler.refreshAccounts()]);
		expect(usageCalls).toBe(1);
		expect(accountCalls).toBe(1);
		expect(delays).toEqual([30_000, 300_000]);
		expect(timers.every(({ unref }) => unref.mock.calls.length === 1)).toBe(true);

		callbacks[0]?.();
		callbacks[1]?.();
		await Promise.all([scheduler.refreshUsage(), scheduler.refreshAccounts()]);
		expect(usageCalls).toBe(2);
		expect(accountCalls).toBe(2);

		await scheduler.stop();
		expect(cancelled).toHaveLength(2);
		expect(usageCalls).toBe(2);
		expect(accountCalls).toBe(2);
	});
});
