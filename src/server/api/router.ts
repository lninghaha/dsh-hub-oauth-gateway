import type { IncomingMessage, ServerResponse } from "node:http";
import { ZodError, z } from "zod";
import {
	type AccountsData,
	API_PATHS,
	type ApiFailure,
	type ApiMeta,
	type ApiSuccess,
	ExportLayoutSchema,
	type PricingData,
	type UsageAlert,
} from "../../shared/contracts.js";
import type { AccountSnapshot, PriceRule, UsageQuery } from "../../shared/domain.js";
import {
	CurrencyCodeSchema,
	PriceRuleSchema,
	TimeGranularitySchema,
	UsageGroupBySchema,
	UsageMetricSchema,
	UsageQuerySchema,
} from "../../shared/domain.js";
import { FeesDataSchema } from "../../shared/fees.js";
import { UserPreferencesSchema } from "../../shared/preferences.js";
import type { ProvidersData } from "../../shared/providers.js";
import type { FeesRepository } from "../fees/repository.js";
import type { LocalAuthSnapshot } from "../local-monitor/auth-status.js";
import type { LocalUsageAggregateRow } from "../local-monitor/repository.js";
import type { PricingRepository } from "../pricing/repository.js";
import type { PreferencesRepository } from "../settings/repository.js";
import type { UsageQueryService } from "../usage/query.js";
import {
	browserContextGuardDecision,
	isLoopbackRequest,
	passesCsrfGuard,
	readJsonBody,
	writeJson,
} from "./security.js";

export interface UsageStatsLogger {
	warn(message: string): void;
}

export interface ExactWebServer {
	register(route: {
		readonly kind: "exact";
		readonly path: string;
		readonly handler: (request: IncomingMessage, response: ServerResponse) => void | Promise<void>;
	}): () => void;
}

export interface AccountApiService {
	list(): Promise<readonly AccountSnapshot[]>;
	get(providerId: string): Promise<AccountSnapshot | null>;
	refresh(providerIds?: readonly string[]): Promise<readonly AccountSnapshot[]>;
}

export interface UsageProjectionApiService {
	synchronize(): Promise<unknown>;
}

export interface ApiFreshness {
	usageUpdatedAt: number | null;
	accountsUpdatedAt: number | null;
	partial: boolean;
	warnings: readonly string[];
}

export interface LocalAuthApiService {
	snapshot(): Promise<LocalAuthSnapshot>;
}

export interface LocalUsageApiService {
	tools(): readonly { toolId: string; displayName: string; available: boolean }[];
	aggregate(fromDay: string, toDay: string): readonly LocalUsageAggregateRow[];
	stats(): { files: number; lastScanAt: number | null };
	scan(): Promise<{ scannedAt: number; files: number; events: number; skipped: number }>;
}

export interface UsageStatsApiDependencies {
	readonly logger: UsageStatsLogger;
	readonly projection: UsageProjectionApiService;
	readonly queries: UsageQueryService;
	readonly pricing: PricingRepository;
	readonly preferences: PreferencesRepository;
	readonly accounts: AccountApiService;
	readonly fees?: FeesRepository | undefined;
	readonly providers?: { list(): Promise<ProvidersData> } | undefined;
	readonly alerts?: { list(): Promise<readonly UsageAlert[]> } | undefined;
	readonly localAuth?: LocalAuthApiService | undefined;
	readonly localUsage?: LocalUsageApiService | undefined;
	freshness(): ApiFreshness;
	now?(): number;
}

const RefreshBodySchema = z
	.object({
		scope: z.enum(["usage", "accounts", "all"]).default("all"),
		providerIds: z.array(z.string().min(1)).max(64).optional(),
	})
	.strict();

const PricingUpdateSchema = z
	.object({
		baseCurrency: CurrencyCodeSchema,
		rules: z.array(PriceRuleSchema).max(2_000),
	})
	.strict();

function meta(dependencies: UsageStatsApiDependencies): ApiMeta {
	const current = dependencies.freshness();
	return {
		schemaVersion: 1,
		generatedAt: dependencies.now?.() ?? Date.now(),
		sourceUpdatedAt: Math.max(current.usageUpdatedAt ?? 0, current.accountsUpdatedAt ?? 0) || null,
		partial: current.partial,
		stale: current.warnings.some((warning) => warning.includes("stale")),
		warnings: [...current.warnings],
	};
}

function success<T>(dependencies: UsageStatsApiDependencies, data: T): ApiSuccess<T> {
	return { ok: true, data, meta: meta(dependencies) };
}

function failure(
	dependencies: UsageStatsApiDependencies,
	code: string,
	message: string,
	details?: Readonly<Record<string, unknown>>,
): ApiFailure {
	return {
		ok: false,
		error: details === undefined ? { code, message } : { code, message, details },
		meta: meta(dependencies),
	};
}

function parseInteger(value: string | null, fallback: number): number {
	if (value === null || value === "") return fallback;
	const parsed = Number(value);
	if (!Number.isSafeInteger(parsed) || parsed < 0) throw new Error(`invalid integer value "${value}"`);
	return parsed;
}

function parseCsv(value: string | null): string[] {
	if (value === null || value.trim() === "") return [];
	return [
		...new Set(
			value
				.split(",")
				.map((item) => item.trim())
				.filter(Boolean),
		),
	];
}

function parseUsageQuery(url: URL, dependencies: UsageStatsApiDependencies): UsageQuery {
	const preferences = dependencies.preferences.load("UTC");
	const now = dependencies.now?.() ?? Date.now();
	const to = parseInteger(url.searchParams.get("to"), now);
	const from = parseInteger(url.searchParams.get("from"), to - 30 * 86_400_000);
	const timeZone = url.searchParams.get("timeZone") || preferences.display.timeZone;
	new Intl.DateTimeFormat("en", { timeZone }).format(0);
	const range = to - from;
	const defaultGranularity = range <= 3 * 86_400_000 ? "hour" : range <= 120 * 86_400_000 ? "day" : "month";
	const requestedGroup = UsageGroupBySchema.parse(url.searchParams.get("groupBy") ?? "provider");
	const groupBy = requestedGroup === "session" && !preferences.privacy.showSessionIdentifiers ? "none" : requestedGroup;
	return UsageQuerySchema.parse({
		from,
		to,
		timeZone,
		granularity: TimeGranularitySchema.parse(url.searchParams.get("granularity") ?? defaultGranularity),
		metric: UsageMetricSchema.parse(url.searchParams.get("metric") ?? "tokens"),
		groupBy,
		providers: parseCsv(url.searchParams.get("providers")),
		models: parseCsv(url.searchParams.get("models")),
		compare: url.searchParams.get("compare") !== "0",
	});
}

function csvCell(value: unknown): string {
	let text = value === null || value === undefined ? "" : String(value);
	if (typeof value === "string" && /^[\t ]*[=+\-@]/.test(text)) text = `'${text}`;
	return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function writeCsv(response: ServerResponse, filename: string, rows: readonly (readonly unknown[])[]): void {
	response.writeHead(200, {
		"content-type": "text/csv; charset=utf-8",
		"content-disposition": `attachment; filename="${filename}"`,
		"cache-control": "no-store",
		"x-content-type-options": "nosniff",
	});
	response.end(`\uFEFF${rows.map((row) => row.map(csvCell).join(",")).join("\r\n")}\r\n`);
}

const reportedBrowserGuardReasons = new Set<string>();

function guard(
	request: IncomingMessage,
	response: ServerResponse,
	dependencies: UsageStatsApiDependencies,
	allowedMethods: readonly string[],
): boolean {
	if (!isLoopbackRequest(request)) {
		writeJson(response, 403, failure(dependencies, "forbidden", "usage statistics are available only on loopback"));
		return false;
	}
	const browserContext = browserContextGuardDecision(request);
	if (!browserContext.accepted) {
		if (browserContext.reason !== null && !reportedBrowserGuardReasons.has(browserContext.reason)) {
			reportedBrowserGuardReasons.add(browserContext.reason);
			dependencies.logger.warn(
				`usage-stats: browser-context guard rejected request (${browserContext.reason}; details redacted)`,
			);
		}
		writeJson(
			response,
			403,
			failure(dependencies, "cross-site-rejected", "request failed the local browser-context guard", {
				reason: browserContext.reason,
			}),
		);
		return false;
	}
	if (!allowedMethods.includes(request.method ?? "")) {
		response.setHeader("allow", allowedMethods.join(", "));
		writeJson(response, 405, failure(dependencies, "method-not-allowed", "request method is not supported"));
		return false;
	}
	if (request.method !== "GET" && !passesCsrfGuard(request)) {
		writeJson(response, 403, failure(dependencies, "csrf-rejected", "request failed the local mutation guard"));
		return false;
	}
	return true;
}

async function handle(
	request: IncomingMessage,
	response: ServerResponse,
	dependencies: UsageStatsApiDependencies,
	allowedMethods: readonly string[],
	operation: (url: URL) => Promise<void> | void,
): Promise<void> {
	if (!guard(request, response, dependencies, allowedMethods)) return;
	try {
		await operation(new URL(request.url ?? "/", "http://localhost"));
	} catch (error) {
		if (error instanceof ZodError || error instanceof RangeError) {
			writeJson(response, 400, failure(dependencies, "invalid-request", "request parameters are invalid"));
			return;
		}
		dependencies.logger.warn("usage-stats: v1 request failed (details redacted)");
		writeJson(response, 500, failure(dependencies, "internal", "usage statistics request failed"));
	}
}

export function registerV1Routes(
	webServer: ExactWebServer,
	dependencies: UsageStatsApiDependencies,
): readonly (() => void)[] {
	const register = (
		path: string,
		methods: readonly string[],
		operation: (request: IncomingMessage, response: ServerResponse, url: URL) => Promise<void> | void,
	): (() => void) =>
		webServer.register({
			kind: "exact",
			path,
			handler: (request, response) =>
				handle(request, response, dependencies, methods, (url) => operation(request, response, url)),
		});

	return [
		register(API_PATHS.overview, ["GET"], async (_request, response, url) => {
			const alerts = (await dependencies.alerts?.list()) ?? [];
			writeJson(
				response,
				200,
				success(dependencies, dependencies.queries.overview(parseUsageQuery(url, dependencies), alerts.length)),
			);
		}),
		register(API_PATHS.series, ["GET"], async (_request, response, url) => {
			writeJson(response, 200, success(dependencies, dependencies.queries.series(parseUsageQuery(url, dependencies))));
		}),
		register(API_PATHS.breakdown, ["GET"], async (_request, response, url) => {
			const dimension = z.enum(["provider", "model", "session"]).parse(url.searchParams.get("dimension") ?? "provider");
			const showSessions = dependencies.preferences.load("UTC").privacy.showSessionIdentifiers;
			writeJson(
				response,
				200,
				success(
					dependencies,
					dependencies.queries.breakdown(parseUsageQuery(url, dependencies), dimension, showSessions),
				),
			);
		}),
		register(API_PATHS.activity, ["GET"], async (_request, response, url) => {
			const preferences = dependencies.preferences.load("UTC");
			const metric = UsageMetricSchema.parse(url.searchParams.get("metric") ?? "tokens");
			const providers = (url.searchParams.get("providers") ?? "")
				.split(",")
				.map((value) => value.trim())
				.filter(Boolean);
			const models = (url.searchParams.get("models") ?? "")
				.split(",")
				.map((value) => value.trim())
				.filter(Boolean);
			writeJson(
				response,
				200,
				success(
					dependencies,
					dependencies.queries.activity({
						timeZone: preferences.display.timeZone,
						metric,
						weekStartsOn: preferences.display.weekStartsOn,
						streakMinTokens: preferences.display.streakMinTokens,
						...(dependencies.now === undefined ? {} : { now: dependencies.now() }),
						providers,
						models,
					}),
				),
			);
		}),
		register(API_PATHS.accounts, ["GET"], async (_request, response) => {
			const data: AccountsData = { accounts: [...(await dependencies.accounts.list())] };
			writeJson(response, 200, success(dependencies, data));
		}),
		register(API_PATHS.fees, ["GET", "PUT"], async (request, response) => {
			if (dependencies.fees === undefined) {
				writeJson(response, 503, failure(dependencies, "unavailable", "fees ledger is not composed"));
				return;
			}
			if (request.method === "GET") {
				writeJson(response, 200, success(dependencies, { fees: dependencies.fees.list() }));
				return;
			}
			const body = await readJsonBody(request, response);
			if (body === undefined) return;
			const input = FeesDataSchema.parse(body);
			const saved = dependencies.fees.replaceAll(input.fees, dependencies.now?.() ?? Date.now());
			writeJson(response, 200, success(dependencies, saved));
		}),
		register(API_PATHS.account, ["GET"], async (_request, response, url) => {
			const id = z.string().min(1).parse(url.searchParams.get("id"));
			const account = (await dependencies.accounts.list()).find(({ providerId }) => providerId === id) ?? null;
			if (account === null) {
				writeJson(response, 404, failure(dependencies, "not-found", "account was not found"));
				return;
			}
			writeJson(response, 200, success(dependencies, account));
		}),
		register(API_PATHS.providers, ["GET"], async (_request, response) => {
			if (dependencies.providers === undefined) {
				writeJson(response, 503, failure(dependencies, "unavailable", "provider catalog is not composed"));
				return;
			}
			writeJson(response, 200, success(dependencies, await dependencies.providers.list()));
		}),
		register(API_PATHS.alerts, ["GET"], async (_request, response) => {
			const alerts = (await dependencies.alerts?.list()) ?? [];
			writeJson(response, 200, success(dependencies, { alerts: [...alerts] }));
		}),
		register(API_PATHS.refresh, ["POST"], async (request, response) => {
			const body = await readJsonBody(request, response);
			if (body === undefined) return;
			const input = RefreshBodySchema.parse(body);
			const result: Record<string, unknown> = {};
			if (input.scope === "usage" || input.scope === "all") result.usage = await dependencies.projection.synchronize();
			if (input.scope === "accounts" || input.scope === "all")
				result.accounts = await dependencies.accounts.refresh(input.providerIds);
			writeJson(response, 200, success(dependencies, result));
		}),
		register(API_PATHS.settings, ["GET", "PUT"], async (request, response) => {
			if (request.method === "GET") {
				writeJson(response, 200, success(dependencies, dependencies.preferences.load("UTC")));
				return;
			}
			const body = await readJsonBody(request, response);
			if (body === undefined) return;
			const value = dependencies.preferences.save(UserPreferencesSchema.parse(body));
			dependencies.queries.setBaseCurrency(value.display.baseCurrency);
			writeJson(response, 200, success(dependencies, value));
		}),
		register(API_PATHS.pricing, ["GET", "PUT"], async (request, response) => {
			if (request.method === "GET") {
				const preferences = dependencies.preferences.load("UTC");
				const data: PricingData = {
					baseCurrency: preferences.display.baseCurrency,
					rules: dependencies.pricing.list(),
					catalogUpdatedAt: null,
				};
				writeJson(response, 200, success(dependencies, data));
				return;
			}
			const body = await readJsonBody(request, response);
			if (body === undefined) return;
			const input = PricingUpdateSchema.parse(body);
			const rules: PriceRule[] = input.rules.map((rule) => ({ ...rule, source: "user" }));
			dependencies.pricing.replaceUserRules(rules);
			const current = dependencies.preferences.load("UTC");
			dependencies.preferences.save({ ...current, display: { ...current.display, baseCurrency: input.baseCurrency } });
			dependencies.queries.setBaseCurrency(input.baseCurrency);
			writeJson(
				response,
				200,
				success(dependencies, { baseCurrency: input.baseCurrency, rules, catalogUpdatedAt: null }),
			);
		}),
		register(API_PATHS.export, ["GET"], async (_request, response, url) => {
			const format = z.enum(["csv", "json"]).parse(url.searchParams.get("format") ?? "csv");
			const layout = ExportLayoutSchema.parse(url.searchParams.get("layout") ?? "filtered");
			const dimension = z.enum(["provider", "model", "session"]).parse(url.searchParams.get("dimension") ?? "provider");
			const query = parseUsageQuery(url, dependencies);
			const exportPreferences = dependencies.preferences.load("UTC");
			const showSessions = exportPreferences.privacy.showSessionIdentifiers && !exportPreferences.privacy.redactExports;
			const snapshot = dependencies.queries.breakdown(query, dimension, showSessions);
			if (layout === "daily") {
				const rows = dependencies.queries.dailyExportRows(query);
				if (format === "json") {
					writeJson(response, 200, success(dependencies, { query, layout, rows }));
					return;
				}
				writeCsv(response, "dsh-hub-oauth-gateway-daily.csv", [
					[
						"date",
						"provider",
						"input_tokens",
						"output_tokens",
						"cache_read_tokens",
						"cache_write_tokens",
						"requests",
						"estimated_cost",
						"currency",
						"price_coverage",
					],
					...rows.map((row) => [
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
					]),
				]);
				return;
			}
			if (layout === "bundle") {
				const daily = dependencies.queries.dailyExportRows(query);
				writeJson(
					response,
					200,
					success(dependencies, {
						generatedAt: dependencies.now?.() ?? Date.now(),
						query,
						snapshot,
						daily,
					}),
				);
				return;
			}
			if (format === "json") {
				writeJson(response, 200, success(dependencies, { query, layout, ...snapshot }));
				return;
			}
			writeCsv(response, "dsh-hub-oauth-gateway.csv", [
				[
					"dimension",
					"key",
					"label",
					"requests",
					"input_tokens",
					"output_tokens",
					"cache_read_tokens",
					"cache_write_tokens",
					"cache_hit_rate",
					"estimated_cost",
					"currency",
					"price_coverage",
				],
				...snapshot.rows.map((row) => [
					snapshot.dimension,
					row.key,
					row.label,
					row.requests,
					row.buckets.inputTokens,
					row.buckets.outputTokens,
					row.buckets.cacheReadTokens,
					row.buckets.cacheWriteTokens,
					row.cacheHitRate,
					row.cost.amount,
					row.cost.currency,
					row.cost.coverageRatio,
				]),
			]);
		}),
		register(API_PATHS.health, ["GET"], (_request, response) => {
			writeJson(response, 200, success(dependencies, { status: "ok", ...dependencies.freshness() }));
		}),
		register(API_PATHS.localAuth, ["GET"], async (_request, response) => {
			if (dependencies.localAuth === undefined) {
				writeJson(response, 200, success(dependencies, { enabled: false }));
				return;
			}
			const snapshot = await dependencies.localAuth.snapshot();
			writeJson(response, 200, success(dependencies, { enabled: true, ...snapshot }));
		}),
		register(API_PATHS.localUsage, ["GET"], (_request, response, url) => {
			if (dependencies.localUsage === undefined) {
				writeJson(response, 200, success(dependencies, { enabled: false }));
				return;
			}
			const current = dependencies.now?.() ?? Date.now();
			const toDay = new Date(current).toISOString().slice(0, 10);
			const fromFallback = new Date(current - 29 * 86_400_000).toISOString().slice(0, 10);
			const fromDay = z
				.string()
				.regex(/^\d{4}-\d{2}-\d{2}$/)
				.parse(url.searchParams.get("from") ?? fromFallback);
			const toDayParsed = z
				.string()
				.regex(/^\d{4}-\d{2}-\d{2}$/)
				.parse(url.searchParams.get("to") ?? toDay);
			if (fromDay > toDayParsed) throw new RangeError("from must not exceed to");
			const stats = dependencies.localUsage.stats();
			writeJson(
				response,
				200,
				success(dependencies, {
					enabled: true,
					generatedAt: current,
					lastScanAt: stats.lastScanAt,
					scannedFiles: stats.files,
					tools: [...dependencies.localUsage.tools()],
					rows: [...dependencies.localUsage.aggregate(fromDay, toDayParsed)],
				}),
			);
		}),
		register(API_PATHS.localUsageScan, ["POST"], async (_request, response) => {
			if (dependencies.localUsage === undefined) {
				writeJson(
					response,
					200,
					success(dependencies, { enabled: false, scannedAt: null, files: 0, events: 0, skipped: 0 }),
				);
				return;
			}
			const result = await dependencies.localUsage.scan();
			writeJson(response, 200, success(dependencies, { enabled: true, ...result }));
		}),
	];
}
