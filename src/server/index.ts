import type { UsageQuery } from "../shared/domain.js";
import { defaultUserPreferences } from "../shared/preferences.js";
import { validateAccountConfig } from "./accounts/config.js";
import {
	createOAuthQuotaCredentialBridge,
	OAUTH_QUOTA_ACCOUNT_IDS,
	oauthTokenSourceFromRuntime,
	resolveQuotaWindowsForPoolAccount,
} from "./accounts/oauth-credential-bridge.js";
import { AccountAdapterRegistry } from "./accounts/registry.js";
import { AccountSnapshotRepository } from "./accounts/repository.js";
import { AccountService } from "./accounts/service.js";
import { accountIdentityKey } from "./accounts/types.js";
import { evaluateUsageAlerts } from "./alerts/service.js";
import { registerCredentialRoutes } from "./api/credentials.js";
import { registerLegacyRoutes } from "./api/legacy.js";
import { type ApiFreshness, registerV1Routes } from "./api/router.js";
import { XAI_PI_PROVIDER } from "./coding-oauth/ids.js";
import { acquireHubCodingOAuthOwnership } from "./coding-oauth/participant.js";
import { createOwnerRequestPolicy } from "./coding-oauth/web-origin.js";
import { registerWebRouteSetupAtomically } from "./coding-oauth/web-routes.js";
import { DEFAULT_RUNTIME_CONFIG, type RuntimeConfig, RuntimeConfigSchema } from "./config.js";
import type { UsageStatsHostContext } from "./context.js";
import {
	isAutoExportAllowedInEnvironment,
	validateAutoExportDirectory,
	writeAutoExportFile,
} from "./export/auto-export.js";
import { FeesRepository } from "./fees/repository.js";
import { DshHostAdapter } from "./host/adapter.js";
import { configuredProviders } from "./host/providers.js";
import { DshSessionInventory } from "./host/session-inventory.js";
import { collectLocalCliAuth, type LocalPluginSessionStatus } from "./local-monitor/auth-status.js";
import { LOCAL_USAGE_PARSERS } from "./local-monitor/parsers.js";
import { LocalUsageRepository } from "./local-monitor/repository.js";
import { LocalUsageScanner } from "./local-monitor/usage-scan.js";
import { migrateLegacyPreferences, migrateLegacyUsageCache } from "./migration.js";
import { PricingRepository } from "./pricing/repository.js";
import { collectProvidersData } from "./providers/catalog.js";
import { adaptiveAccountIntervalMs, startRefreshScheduler } from "./scheduler.js";
import { PreferencesRepository } from "./settings/repository.js";
import { StatusProbeService } from "./status-probes/service.js";
import { UsageDatabase } from "./storage/database.js";
import { usageDatabasePath } from "./storage/path.js";
import { UsageQueryService } from "./usage/query.js";
import { UsageRepository } from "./usage/repository.js";
import { UsageProjectionService } from "./usage/service.js";
import { bucketKey, bucketTimestamp } from "./usage/time.js";

export const name = "usage-stats";

// Only WebServer is load-bearing. Optional DSH services are shape-probed at
// point of use so a missing Settings/Credentials/LLM service cannot fail-fast
// the entire host plugin tree.
export const inject = ["webServer"] as const;

export const Config = RuntimeConfigSchema;

export interface ApplyDependencies {
	readonly databasePath?: string;
	readonly disableBackgroundRefresh?: boolean;
	readonly now?: () => number;
}

export async function apply(
	ctx: UsageStatsHostContext,
	rawConfig: RuntimeConfig = DEFAULT_RUNTIME_CONFIG,
	dependencies: ApplyDependencies = {},
): Promise<void> {
	const config = RuntimeConfigSchema.parse(rawConfig);
	const now = dependencies.now ?? Date.now;
	const host = new DshHostAdapter(ctx);
	const webServer = host.webServer();
	if (webServer === undefined) throw new Error("usage-stats requires the webServer service");
	const ownerRequestConfig = config.codingOAuth.ownerRequest;
	const ownerRequestPolicy = createOwnerRequestPolicy(
		ownerRequestConfig === undefined
			? {}
			: {
					...(ownerRequestConfig.loopbackAccessMode === undefined
						? {}
						: { loopbackAccessMode: ownerRequestConfig.loopbackAccessMode }),
					...(ownerRequestConfig.trustedProxy === undefined ? {} : { trustedProxy: ownerRequestConfig.trustedProxy }),
				},
		host.ownerRequestPolicy(),
	);
	const codingOAuthOwnership = config.codingOAuth.enabled
		? acquireHubCodingOAuthOwnership(ctx, host, {
				proxyKimi: config.codingOAuth.proxyKimi,
				...(config.codingOAuth.proxy === undefined ? {} : { proxy: config.codingOAuth.proxy }),
				...(config.codingOAuth.retryPolicy === undefined
					? {}
					: { retryPolicy: config.codingOAuth.retryPolicy as never }),
				...(config.codingOAuth.capabilities === undefined
					? {}
					: { capabilities: config.codingOAuth.capabilities as never }),
				...(config.codingOAuth.gateway === undefined ? {} : { gateway: config.codingOAuth.gateway as never }),
				...(config.codingOAuth.ownerRequest === undefined
					? {}
					: { ownerRequest: config.codingOAuth.ownerRequest as never }),
				pool: {
					mode: config.codingOAuth.pool.mode,
					switchMargin: config.codingOAuth.pool.switchMargin,
				},
				...(config.oauthDevice.copilotClientId === undefined
					? {}
					: { copilotClientId: config.oauthDevice.copilotClientId }),
			})
		: undefined;
	const codingOAuthRuntime = () => codingOAuthOwnership?.holder.current();
	if (codingOAuthOwnership !== undefined) {
		ctx.effect(() => () => codingOAuthOwnership.lease.release(), "usage-stats: release coding OAuth ownership");
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
		sessions: () => host.sessions(),
		persistence: () => host.persistence(),
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
	let usageState: ApiFreshness["usageState"] = "not-collected";
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
			let result: Awaited<ReturnType<UsageProjectionService["synchronize"]>>;
			try {
				result = await projection.synchronize();
			} catch (error) {
				if (usageUpdatedAt !== null) usageState = "stale";
				throw error;
			}
			usageUpdatedAt = result.completedAt;
			usageState = result.failedSessions > 0 ? "stale" : "fresh";
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
	const accountCredentials = createOAuthQuotaCredentialBridge(
		() => host.credentials(),
		oauthTokenSourceFromRuntime(codingOAuthRuntime),
	);
	const accountService = new AccountService({
		credentials: accountCredentials,
		getProviders: () => configuredProviders(host.settings()),
		config: accountConfig,
		repository: accountSnapshots,
		registry,
		refreshMs: config.refresh.accountMinutes * 60_000,
		concurrency: config.refresh.accountConcurrency,
		deps: accountDeps,
	});
	await accountService.specs();
	const refreshOAuthQuotas = (): void => {
		void accountService.refresh([...OAUTH_QUOTA_ACCOUNT_IDS]).catch(() => {
			ctx.logger.warn("usage-stats: OAuth quota refresh failed (details redacted)");
		});
	};
	if (codingOAuthOwnership !== undefined) {
		ctx.effect(() => {
			let releaseRuntime = (): void => undefined;
			const unsubscribe = codingOAuthOwnership.holder.subscribe((runtime) => {
				releaseRuntime();
				if (runtime !== undefined) {
					runtime.setQuotaWindowsSource(async (accountId, context) => {
						const accounts = await accountService.list();
						return resolveQuotaWindowsForPoolAccount(accounts, accountId, context);
					});
				}
				releaseRuntime = runtime?.onCredentialChange(refreshOAuthQuotas) ?? (() => undefined);
				if (runtime !== undefined) refreshOAuthQuotas();
			});
			return () => {
				unsubscribe();
				releaseRuntime();
			};
		}, "usage-stats: follow coding OAuth credential changes");
	}
	const providersApi = {
		list: async () => {
			const runtime = codingOAuthRuntime();
			const [accounts, specs] = await Promise.all([accountService.list(), accountService.specs()]);
			const credentialRefs = new Map<string, string>();
			for (const spec of specs) {
				if (spec.apiKeyRef !== undefined && spec.apiKeyRef !== "") {
					credentialRefs.set(accountIdentityKey(spec.id, spec.profileId), spec.apiKeyRef);
				}
			}
			return collectProvidersData({
				accounts,
				credentialRefs,
				credentialsWritable: typeof host.credentials()?.set === "function",
				...(runtime === undefined ? {} : { codingOAuth: runtime }),
				now,
			});
		},
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
		usageState,
		partial: warnings.length > 0,
		warnings: [...warnings],
	});

	const localAuthApi = config.localMonitor.enabled
		? {
				async snapshot() {
					const sessions: LocalPluginSessionStatus[] = [];
					const runtime = codingOAuthRuntime();
					if (runtime !== undefined) {
						const grok = await runtime.grok.store
							.read(XAI_PI_PROVIDER)
							.then((credential): { authenticated: boolean; expiresAt: number | null } =>
								credential?.type === "oauth"
									? { authenticated: true, expiresAt: credential.expires }
									: { authenticated: false, expiresAt: null },
							)
							.catch((): { authenticated: boolean; expiresAt: number | null } => ({
								authenticated: false,
								expiresAt: null,
							}));
						sessions.push({
							provider: "grok",
							route: "grok-build",
							authenticated: grok.authenticated,
							expiresAt: grok.expiresAt,
						});
						for (const session of runtime.subscriptions) {
							const status = await session.status().catch(() => ({ authenticated: false }) as const);
							sessions.push({
								provider: session.definition.slug,
								route: session.definition.route,
								authenticated: status.authenticated,
								expiresAt: "expiresAt" in status && status.expiresAt !== undefined ? status.expiresAt : null,
							});
						}
					}
					return { generatedAt: now(), cli: await collectLocalCliAuth(), sessions };
				},
			}
		: undefined;

	const localUsageApi = config.localUsage.enabled
		? (() => {
				const repository = new LocalUsageRepository(database);
				const home = process.env.HOME ?? "";
				const scanner = new LocalUsageScanner(repository, {
					home,
					env: process.env,
					now,
					maxFileBytes: config.localUsage.maxFileBytes,
					maxTotalBytes: config.localUsage.maxTotalBytes,
				});
				return {
					tools: () =>
						LOCAL_USAGE_PARSERS.map((parser) => ({
							toolId: parser.toolId,
							displayName: parser.displayName,
							available: true,
						})),
					aggregate: (fromDay: string, toDay: string) => repository.aggregate(fromDay, toDay),
					stats: () => repository.stats(),
					scan: async () => {
						const result = await scanner.scan();
						const cutoff = new Date(result.scannedAt - config.localUsage.retentionDays * 86_400_000)
							.toISOString()
							.slice(0, 10);
						repository.prune(cutoff, result.scannedAt - config.localUsage.retentionDays * 86_400_000);
						return result;
					},
				};
			})()
		: undefined;

	const statusProbesApi = config.statusProbes.enabled
		? {
				snapshot: () =>
					new StatusProbeService({
						deps: { timeoutMs: Math.min(config.refresh.timeoutMs, 8_000), now },
						now,
					}).snapshot(),
			}
		: undefined;

	const disposeRoutes = registerWebRouteSetupAtomically(webServer, (tracked) => {
		registerV1Routes(tracked, {
			logger: ctx.logger,
			projection: projectionApi,
			queries: queryService,
			pricing,
			preferences,
			accounts: accountService,
			fees,
			providers: providersApi,
			alerts: alertsApi,
			...(localAuthApi === undefined ? {} : { localAuth: localAuthApi }),
			...(localUsageApi === undefined ? {} : { localUsage: localUsageApi }),
			...(statusProbesApi === undefined ? {} : { statusProbes: statusProbesApi }),
			ownerRequestPolicy,
			freshness,
			compatibility: (accessMode) =>
				host.compatibility({
					uiOwner: codingOAuthOwnership?.lease.snapshot().uiOwner ?? null,
					accessMode,
				}),
			now,
		});
		registerLegacyRoutes(tracked, {
			logger: ctx.logger,
			projection: projectionApi,
			usage,
			accounts: accountService,
			preferences,
			ownerRequestPolicy,
			now,
		});
		registerCredentialRoutes(tracked, {
			logger: ctx.logger,
			credentials: () => host.credentials(),
			accounts: accountService,
			accountDeps,
			ownerRequestPolicy,
		});
	});
	ctx.effect(() => disposeRoutes, "usage-stats: atomic route group");

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

	if (localUsageApi !== undefined && !dependencies.disableBackgroundRefresh) {
		const usageApi = localUsageApi;
		let scanning = false;
		const runScan = async (): Promise<void> => {
			if (scanning) return;
			scanning = true;
			try {
				await usageApi.scan();
			} catch {
				ctx.logger.warn("usage-stats: local usage scan failed (details redacted)");
			} finally {
				scanning = false;
			}
		};
		const scanTimer = setInterval(() => void runScan(), config.localUsage.intervalMinutes * 60_000);
		scanTimer.unref?.();
		ctx.effect(
			() => () => {
				clearInterval(scanTimer);
			},
			"usage-stats: local usage scan",
		);
	}

	if (config.debug) ctx.logger.debug("usage-stats v1 initialized");
}
