import type { UsageQuery } from "../shared/domain.js";
import { defaultUserPreferences } from "../shared/preferences.js";
import { validateAccountConfig } from "./accounts/config.js";
import { AccountAdapterRegistry } from "./accounts/registry.js";
import { AccountSnapshotRepository } from "./accounts/repository.js";
import { AccountService } from "./accounts/service.js";
import { evaluateUsageAlerts } from "./alerts/service.js";
import { registerCredentialRoutes } from "./api/credentials.js";
import { registerLegacyRoutes } from "./api/legacy.js";
import { type ApiFreshness, registerV1Routes } from "./api/router.js";
import { applyCodingOAuth, type CodingOAuthRuntime } from "./coding-oauth/compose.js";
import { DEFAULT_RUNTIME_CONFIG, type RuntimeConfig, RuntimeConfigSchema } from "./config.js";
import type { UsageStatsHostContext } from "./context.js";
import { FeesRepository } from "./fees/repository.js";
import { configuredProviders } from "./host/providers.js";
import { DshSessionInventory } from "./host/session-inventory.js";
import { migrateLegacyPreferences, migrateLegacyUsageCache } from "./migration.js";
import { PricingRepository } from "./pricing/repository.js";
import { collectProvidersData } from "./providers/catalog.js";
import { startRefreshScheduler, adaptiveAccountIntervalMs } from "./scheduler.js";
import {
	isAutoExportAllowedInEnvironment,
	validateAutoExportDirectory,
	writeAutoExportFile,
} from "./export/auto-export.js";
import { PreferencesRepository } from "./settings/repository.js";
import { UsageDatabase } from "./storage/database.js";
import { usageDatabasePath } from "./storage/path.js";
import { UsageQueryService } from "./usage/query.js";
import { UsageRepository } from "./usage/repository.js";
import { UsageProjectionService } from "./usage/service.js";
import { bucketKey, bucketTimestamp } from "./usage/time.js";

export const name = "usage-stats";

export const inject = ["webServer", "credentials", "sessions", "sessionPersistence", "settings", "llm"] as const;

export const Config = RuntimeConfigSchema;

export interface ApplyDependencies {
	readonly databasePath?: string;
	readonly disableBackgroundRefresh?: boolean;
	readonly now?: () => number;
}

function fromContext<T>(ctx: UsageStatsHostContext, name: string, direct: T | undefined): T | undefined {
	return (ctx.get?.(name) as T | undefined) ?? direct;
}

export async function apply(
	ctx: UsageStatsHostContext,
	rawConfig: RuntimeConfig = DEFAULT_RUNTIME_CONFIG,
	dependencies: ApplyDependencies = {},
): Promise<void> {
	const config = RuntimeConfigSchema.parse(rawConfig);
	const now = dependencies.now ?? Date.now;
	const webServer = fromContext(ctx, "webServer", ctx.webServer);
	if (webServer === undefined) throw new Error("usage-stats requires the webServer service");
	const credentials = fromContext(ctx, "credentials", ctx.credentials);
	const sessions = fromContext(ctx, "sessions", ctx.sessions);
	const persistence = fromContext(ctx, "sessionPersistence", ctx.sessionPersistence);
	const settings = fromContext(ctx, "settings", ctx.settings);
	const llm = fromContext(ctx, "llm", ctx.llm);

	let codingOAuthRuntime: CodingOAuthRuntime | undefined;
	if (config.codingOAuth.enabled) {
		if (llm === undefined) {
			ctx.logger.warn("usage-stats: coding OAuth is enabled but the llm service is unavailable");
		} else {
			try {
				codingOAuthRuntime = applyCodingOAuth(
					{
						...ctx,
						llm,
						logger: (namespace: string) => ({
							debug: (message: unknown) => ctx.logger.debug(`${namespace}: ${String(message)}`),
							info: (message: unknown) => ctx.logger.info(`${namespace}: ${String(message)}`),
							warn: (message: unknown) => ctx.logger.warn(`${namespace}: ${String(message)}`),
							error: (message: unknown) => ctx.logger.error(`${namespace}: ${String(message)}`),
						}),
					} as never,
					{
						proxyKimi: config.codingOAuth.proxyKimi,
						...(config.codingOAuth.proxy === undefined ? {} : { proxy: config.codingOAuth.proxy }),
						...(config.codingOAuth.retryPolicy === undefined
							? {}
							: { retryPolicy: config.codingOAuth.retryPolicy as never }),
						...(config.codingOAuth.capabilities === undefined
							? {}
							: { capabilities: config.codingOAuth.capabilities as never }),
						...(config.codingOAuth.gateway === undefined ? {} : { gateway: config.codingOAuth.gateway as never }),
					},
				);
			} catch (error) {
				ctx.logger.warn("usage-stats: coding OAuth composition failed closed (details redacted)");
				if (config.debug) ctx.logger.warn(String(error instanceof Error ? error.name : "error"));
			}
		}
	}

	let database: UsageDatabase;
	try {
		database = await UsageDatabase.open(dependencies.databasePath ?? usageDatabasePath());
	} catch {
		throw new Error("usage-stats database initialization failed (details redacted)");
	}
	ctx.effect(() => () => database.close(), "usage-stats: close database");
	const usage = new UsageRepository(database);
	const pricing = new PricingRepository(database);
	const preferences = new PreferencesRepository(database);
	const accountSnapshots = new AccountSnapshotRepository(database);
	const fees = new FeesRepository(database);

	await migrateLegacyPreferences(database, preferences, ctx.logger);
	if (!preferences.exists()) {
		const defaults = defaultUserPreferences();
		defaults.display.baseCurrency = config.pricing.baseCurrency;
		preferences.save(defaults, now());
	}
	const userPreferences = preferences.load("UTC");

	const warnings: string[] = [];
	const inventory = new DshSessionInventory({
		sessions,
		persistence,
		onWarning(message) {
			const safeWarning = "session snapshot inventory degraded; fallback mode is active";
			const existing = warnings.indexOf(safeWarning);
			if (message === null) {
				if (existing >= 0) warnings.splice(existing, 1);
				return;
			}
			if (existing < 0) warnings.push(safeWarning);
			if (warnings.length > 20) warnings.shift();
			ctx.logger.warn(`usage-stats: ${message}`);
		},
	});
	const projection = new UsageProjectionService(usage, inventory, {
		preserveDeletedSessions: config.retention.preserveDeletedSessions,
		now,
	});
	let usageUpdatedAt: number | null = null;
	let lastRetentionAt = 0;
	const enforceRetention = (at: number): void => {
		if (at - lastRetentionAt < 86_400_000) return;
		usage.pruneBefore(at - config.retention.usageDays * 86_400_000);
		accountSnapshots.pruneBefore(at - config.retention.accountSnapshotDays * 86_400_000);
		lastRetentionAt = at;
	};
	const projectionWarning = "one or more sessions could not be projected";
	const migrationWarning = "legacy usage migration pending; background retry scheduled";
	let legacyMigrationPending = true;
	const removeWarning = (message: string): void => {
		const index = warnings.indexOf(message);
		if (index >= 0) warnings.splice(index, 1);
	};
	const projectionApi = {
		async synchronize() {
			const result = await projection.synchronize();
			usageUpdatedAt = result.completedAt;
			enforceRetention(result.completedAt);
			for (const message of [projectionWarning, "initial usage projection failed; background retry scheduled"]) {
				removeWarning(message);
			}
			if (result.failedSessions > 0) warnings.push(projectionWarning);
			if (legacyMigrationPending) {
				const migration = await migrateLegacyUsageCache(database, usage, ctx.logger);
				legacyMigrationPending = !migration.terminal;
				removeWarning(migrationWarning);
				if (legacyMigrationPending) warnings.push(migrationWarning);
			}
			return result;
		},
	};

	try {
		await projectionApi.synchronize();
	} catch {
		warnings.push("initial usage projection failed; background retry scheduled");
		ctx.logger.warn("usage-stats: initial usage projection failed (details redacted; background retry scheduled)");
	}

	const registry = new AccountAdapterRegistry();
	const accountConfig = validateAccountConfig(config.accounts, registry);
	const accountDeps = {
		timeoutMs: config.refresh.timeoutMs,
		now,
		...(config.oauthDevice.copilotClientId === undefined
			? {}
			: { oauthClientIds: { copilot: config.oauthDevice.copilotClientId } }),
	};
	const accountService = new AccountService({
		credentials,
		getProviders: () => configuredProviders(settings),
		config: accountConfig,
		repository: accountSnapshots,
		registry,
		refreshMs: config.refresh.accountMinutes * 60_000,
		concurrency: config.refresh.accountConcurrency,
		deps: accountDeps,
	});
	await accountService.specs();
	const providersApi = {
		list: async () =>
			collectProvidersData({
				accounts: await accountService.list(),
				...(codingOAuthRuntime === undefined ? {} : { codingOAuth: codingOAuthRuntime }),
				now,
			}),
	};

	const queryService = new UsageQueryService(usage, pricing, userPreferences.display.baseCurrency);
	const alertsApi = {
		async list() {
			const currentPreferences = preferences.load("UTC");
			const currentTime = now();
			const timeKey = bucketKey(currentTime, currentPreferences.display.timeZone, "day");
			const from = bucketTimestamp(timeKey, currentPreferences.display.timeZone, "day");
			const dailyQuery: UsageQuery = {
				from,
				to: Math.max(from + 1, currentTime),
				timeZone: currentPreferences.display.timeZone,
				granularity: "day",
				metric: "estimatedCost",
				groupBy: "none",
				providers: [],
				models: [],
				compare: false,
			};
			const dailyCost = queryService.overview(dailyQuery).cost;
			const hidden = new Set(currentPreferences.providers.hidden);
			const visibleAccounts = (await accountService.list()).filter(({ providerId }) => !hidden.has(providerId));
			return evaluateUsageAlerts(visibleAccounts, dailyCost, currentPreferences, currentTime);
		},
	};
	const freshness = (): ApiFreshness => ({
		usageUpdatedAt,
		accountsUpdatedAt: accountService.lastRefreshAt,
		partial: warnings.length > 0,
		warnings: [...warnings],
	});

	const routeDisposers = [
		...registerV1Routes(webServer, {
			logger: ctx.logger,
			projection: projectionApi,
			queries: queryService,
			pricing,
			preferences,
			accounts: accountService,
			fees,
			providers: providersApi,
			alerts: alertsApi,
			freshness,
			now,
		}),
		...registerLegacyRoutes(webServer, {
			logger: ctx.logger,
			projection: projectionApi,
			usage,
			accounts: accountService,
			preferences,
			now,
		}),
		...registerCredentialRoutes(webServer, {
			logger: ctx.logger,
			credentials,
			accounts: accountService,
			accountDeps,
		}),
	];
	for (const [index, dispose] of routeDisposers.entries()) {
		ctx.effect(() => dispose, `usage-stats: route ${index + 1}`);
	}

	const cutoffNow = now();
	usage.pruneBefore(cutoffNow - config.retention.usageDays * 86_400_000);
	accountSnapshots.pruneBefore(cutoffNow - config.retention.accountSnapshotDays * 86_400_000);
	lastRetentionAt = cutoffNow;

	let lastAccountBurnRatio: number | null = null;
	const refreshAccounts = async (): Promise<void> => {
		const accounts = await accountService.refresh();
		let hottest: number | null = null;
		for (const account of accounts) {
			for (const window of account.windows) {
				if (window.usedRatio === null) continue;
				hottest = hottest === null ? window.usedRatio : Math.max(hottest, window.usedRatio);
			}
		}
		lastAccountBurnRatio = hottest;
	};

	const scheduler = startRefreshScheduler(
		{ refresh: () => projectionApi.synchronize() },
		{ refresh: refreshAccounts },
		ctx.logger,
		{
			usageIntervalMs: config.refresh.usageSeconds * 1_000,
			accountIntervalMs: config.refresh.accountMinutes * 60_000,
			...(config.refresh.accountMode === "adaptive"
				? {
						nextAccountIntervalMs: () =>
							adaptiveAccountIntervalMs(
								lastAccountBurnRatio,
								config.refresh.accountAdaptiveMinMinutes * 60_000,
								config.refresh.accountAdaptiveMaxMinutes * 60_000,
								config.refresh.accountMinutes * 60_000,
							),
					}
				: {}),
			disabled: dependencies.disableBackgroundRefresh,
		},
	);
	ctx.effect(() => () => scheduler.stop(), "usage-stats: refresh scheduler");

	let autoExportTimer: ReturnType<typeof setInterval> | null = null;
	let lastAutoExportAt = 0;
	const runAutoExport = async (): Promise<void> => {
		if (!isAutoExportAllowedInEnvironment()) return;
		const prefs = preferences.load("UTC");
		if (!prefs.privacy.autoExportEnabled) return;
		const current = now();
		const intervalMs = prefs.privacy.autoExportIntervalMinutes * 60_000;
		if (lastAutoExportAt > 0 && current - lastAutoExportAt < intervalMs) return;
		try {
			const directory = validateAutoExportDirectory(prefs.privacy.autoExportDirectory);
			const timeKey = bucketKey(current, prefs.display.timeZone, "day");
			const from = bucketTimestamp(timeKey, prefs.display.timeZone, "day") - 30 * 86_400_000;
			const query: UsageQuery = {
				from,
				to: current,
				timeZone: prefs.display.timeZone,
				granularity: "day",
				metric: "tokens",
				groupBy: "provider",
				providers: [],
				models: [],
				compare: false,
			};
			const layout = prefs.privacy.autoExportLayout;
			if (layout === "daily") {
				const rows = queryService.dailyExportRows(query);
				const header =
					"date,provider,input_tokens,output_tokens,cache_read_tokens,cache_write_tokens,requests,estimated_cost,currency,price_coverage\n";
				const body =
					header +
					rows
						.map((row) =>
							[
								row.date,
								row.provider,
								row.inputTokens,
								row.outputTokens,
								row.cacheReadTokens,
								row.cacheWriteTokens,
								row.requests,
								row.estimatedCost,
								row.currency,
								row.priceCoverage,
							].join(","),
						)
						.join("\n");
				await writeAutoExportFile(directory, { generatedAt: current, layout, body, extension: "csv" }, current);
			} else {
				const showSessions = prefs.privacy.showSessionIdentifiers && !prefs.privacy.redactExports;
				const snapshot = queryService.breakdown(query, "provider", showSessions);
				const body = JSON.stringify(
					{
						generatedAt: current,
						layout,
						query,
						snapshot,
						...(layout === "bundle" ? { daily: queryService.dailyExportRows(query) } : {}),
					},
					null,
					2,
				);
				await writeAutoExportFile(directory, { generatedAt: current, layout, body, extension: "json" }, current);
			}
			lastAutoExportAt = current;
		} catch {
			ctx.logger.warn("usage-stats: auto-export failed (details redacted)");
		}
	};
	if (!dependencies.disableBackgroundRefresh) {
		autoExportTimer = setInterval(() => void runAutoExport(), 60_000);
		autoExportTimer.unref?.();
		ctx.effect(
			() => () => {
				if (autoExportTimer !== null) clearInterval(autoExportTimer);
			},
			"usage-stats: auto-export",
		);
	}

	if (config.debug) ctx.logger.debug("usage-stats v1 initialized");
}
