export interface SchedulerLogger {
	warn(message: string): void;
}

export interface RefreshTarget {
	refresh(): Promise<unknown>;
}

export interface RefreshSchedulerOptions {
	readonly usageIntervalMs: number;
	readonly accountIntervalMs: number;
	/** When provided, account refresh is scheduled with setTimeout using this delay after each run. */
	readonly nextAccountIntervalMs?: (() => number) | undefined;
	readonly disabled?: boolean | undefined;
	readonly setInterval?: typeof globalThis.setInterval;
	readonly clearInterval?: typeof globalThis.clearInterval;
	readonly setTimeout?: typeof globalThis.setTimeout;
	readonly clearTimeout?: typeof globalThis.clearTimeout;
}

export interface RefreshScheduler {
	refreshUsage(): Promise<void>;
	refreshAccounts(): Promise<void>;
	stop(): Promise<void>;
}

function singleFlight(operation: () => Promise<unknown>, onError: (error: unknown) => void) {
	let inflight: Promise<void> | null = null;
	return {
		run(): Promise<void> {
			inflight ??= operation()
				.then(() => undefined)
				.catch(onError)
				.finally(() => {
					inflight = null;
				});
			return inflight;
		},
		wait(): Promise<void> {
			return inflight ?? Promise.resolve();
		},
	};
}

/**
 * Choose the next adaptive account refresh delay from the hottest quota window.
 * High utilization → shorter interval, clamped to [min, max].
 */
export function adaptiveAccountIntervalMs(
	maxUsedRatio: number | null,
	minMs: number,
	maxMs: number,
	baseMs: number,
): number {
	const lo = Math.min(minMs, maxMs);
	const hi = Math.max(minMs, maxMs);
	if (maxUsedRatio === null || !Number.isFinite(maxUsedRatio)) {
		return Math.min(hi, Math.max(lo, baseMs));
	}
	const ratio = Math.max(0, Math.min(1, maxUsedRatio));
	const span = hi - lo;
	return Math.round(hi - span * ratio);
}

export function startRefreshScheduler(
	usage: RefreshTarget,
	accounts: RefreshTarget,
	logger: SchedulerLogger,
	options: RefreshSchedulerOptions,
): RefreshScheduler {
	const runUsage = singleFlight(
		() => usage.refresh(),
		() => logger.warn("usage-stats: background usage refresh failed (details redacted)"),
	);
	const runAccounts = singleFlight(
		() => accounts.refresh(),
		() => logger.warn("usage-stats: background account refresh failed (details redacted)"),
	);
	if (options.disabled) {
		return {
			refreshUsage: () => runUsage.run(),
			refreshAccounts: () => runAccounts.run(),
			stop: async () => Promise.all([runUsage.wait(), runAccounts.wait()]).then(() => undefined),
		};
	}

	const schedule = options.setInterval ?? globalThis.setInterval;
	const cancelInterval = options.clearInterval ?? globalThis.clearInterval;
	const scheduleTimeout = options.setTimeout ?? globalThis.setTimeout;
	const cancelTimeout = options.clearTimeout ?? globalThis.clearTimeout;
	let stopped = false;
	let accountTimeout: ReturnType<typeof setTimeout> | null = null;
	let accountInterval: ReturnType<typeof setInterval> | null = null;

	const usageTimer = schedule(() => void runUsage.run(), options.usageIntervalMs);
	usageTimer.unref?.();

	const armAdaptiveAccounts = (): void => {
		if (stopped || options.nextAccountIntervalMs === undefined) return;
		const delay = Math.max(1_000, options.nextAccountIntervalMs());
		accountTimeout = scheduleTimeout(() => {
			void runAccounts.run().finally(() => armAdaptiveAccounts());
		}, delay);
		accountTimeout.unref?.();
	};

	if (options.nextAccountIntervalMs === undefined) {
		accountInterval = schedule(() => void runAccounts.run(), options.accountIntervalMs);
		accountInterval.unref?.();
	}

	void runUsage.run();
	void runAccounts.run().finally(() => {
		if (options.nextAccountIntervalMs !== undefined) armAdaptiveAccounts();
	});

	return {
		refreshUsage: () => runUsage.run(),
		refreshAccounts: () => runAccounts.run(),
		async stop() {
			if (stopped) return;
			stopped = true;
			cancelInterval(usageTimer);
			if (accountInterval !== null) cancelInterval(accountInterval);
			if (accountTimeout !== null) cancelTimeout(accountTimeout);
			await Promise.all([runUsage.wait(), runAccounts.wait()]);
		},
	};
}
