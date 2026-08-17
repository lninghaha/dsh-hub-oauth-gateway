export interface SchedulerLogger {
	warn(message: string): void;
}

export interface RefreshTarget {
	refresh(): Promise<unknown>;
}

export interface RefreshSchedulerOptions {
	readonly usageIntervalMs: number;
	readonly accountIntervalMs: number;
	readonly disabled?: boolean | undefined;
	readonly setInterval?: typeof globalThis.setInterval;
	readonly clearInterval?: typeof globalThis.clearInterval;
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
	const cancel = options.clearInterval ?? globalThis.clearInterval;
	const usageTimer = schedule(() => void runUsage.run(), options.usageIntervalMs);
	const accountTimer = schedule(() => void runAccounts.run(), options.accountIntervalMs);
	usageTimer.unref?.();
	accountTimer.unref?.();
	void runUsage.run();
	void runAccounts.run();
	let stopped = false;
	return {
		refreshUsage: () => runUsage.run(),
		refreshAccounts: () => runAccounts.run(),
		async stop() {
			if (stopped) return;
			stopped = true;
			cancel(usageTimer);
			cancel(accountTimer);
			await Promise.all([runUsage.wait(), runAccounts.wait()]);
		},
	};
}
