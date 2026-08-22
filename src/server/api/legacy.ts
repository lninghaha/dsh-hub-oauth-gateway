import type { IncomingMessage, ServerResponse } from "node:http";
import type { AccountSnapshot, UsageBuckets } from "../../shared/domain.js";
import { totalTokens } from "../../shared/domain.js";
import type { UserPreferences } from "../../shared/preferences.js";
import type { AccountService } from "../accounts/service.js";
import type { OwnerRequestPolicy } from "../coding-oauth/web-origin.js";
import type { PreferencesRepository } from "../settings/repository.js";
import type { UsageFact } from "../usage/projector.js";
import type { UsageRepository } from "../usage/repository.js";
import { bucketKey } from "../usage/time.js";
import { authorizeHubApiRequest } from "./owner-request.js";
import type { ExactWebServer, UsageProjectionApiService, UsageStatsLogger } from "./router.js";
import { readJsonBody, writeJson } from "./security.js";

export const LEGACY_PATHS = Object.freeze({
	usage: "/api/usage-stats/usage",
	providers: "/api/usage-stats/providers",
	balance: "/api/usage-stats/balance",
	subscriptions: "/api/usage-stats/subscriptions",
	account: "/api/usage-stats/account",
	preferences: "/api/usage-stats/prefs",
});

function legacyStatus(status: AccountSnapshot["status"]): string {
	switch (status) {
		case "auth-error":
			return "unauthorized";
		case "error":
			return "invalid-response";
		case "pending":
			return "unavailable";
		default:
			return status;
	}
}

function legacyWindows(account: AccountSnapshot) {
	return account.windows.map((window) => ({
		kind: window.kind,
		usedPercent: window.usedRatio === null ? (window.used ?? 0) : Math.round(window.usedRatio * 1_000) / 10,
		remainingPercent:
			window.usedRatio === null ? (window.remaining ?? 0) : Math.round((1 - window.usedRatio) * 1_000) / 10,
		...(window.resetsAt === null ? {} : { resetsAt: new Date(window.resetsAt).toISOString() }),
		...(window.remaining === null || window.unit === "percent" ? {} : { remaining: window.remaining }),
	}));
}

function legacyAccount(account: AccountSnapshot) {
	return {
		id: account.providerId,
		displayName: account.displayName,
		adapter: account.adapterId,
		mode: account.mode,
		status: legacyStatus(account.status),
		configured: account.configured,
		fetchedAt: account.fetchedAt,
		stale: account.stale,
		plan: account.plan,
		balance:
			account.balance === null
				? null
				: {
						remaining: account.balance.remaining,
						used: account.balance.used,
						total: account.balance.limit,
						currency: account.balance.currency,
						unlimited: account.balance.unlimited,
						expiresAt: null,
					},
		windows: legacyWindows(account),
		missingCredentials: account.missingCredentials,
	};
}

function cacheHitRate(buckets: UsageBuckets): number | null {
	const prompt = buckets.inputTokens + buckets.cacheReadTokens + buckets.cacheWriteTokens;
	return prompt === 0 ? null : Math.round((buckets.cacheReadTokens / prompt) * 1_000) / 10;
}

function emptyBuckets(): UsageBuckets {
	return { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 };
}

function add(target: UsageBuckets, fact: UsageBuckets): void {
	target.inputTokens += fact.inputTokens;
	target.outputTokens += fact.outputTokens;
	target.cacheReadTokens += fact.cacheReadTokens;
	target.cacheWriteTokens += fact.cacheWriteTokens;
}

function renderLegacyUsage(facts: readonly UsageFact[], timeZone: string, updatedAt: number) {
	const days = new Map<string, { totals: UsageBuckets; models: Map<string, UsageBuckets> }>();
	for (const fact of facts) {
		const date = bucketKey(fact.occurredAt, timeZone, "day");
		let day = days.get(date);
		if (day === undefined) {
			day = { totals: emptyBuckets(), models: new Map() };
			days.set(date, day);
		}
		add(day.totals, fact);
		const model = day.models.get(fact.modelId) ?? emptyBuckets();
		add(model, fact);
		day.models.set(fact.modelId, model);
	}
	const total = emptyBuckets();
	const renderedDays = [...days.entries()]
		.sort(([left], [right]) => left.localeCompare(right))
		.map(([date, day]) => {
			add(total, day.totals);
			return {
				date,
				...day.totals,
				tokens: totalTokens(day.totals),
				cacheHitRate: cacheHitRate(day.totals),
				models: [...day.models.entries()]
					.map(([model, buckets]) => ({
						model,
						...buckets,
						tokens: totalTokens(buckets),
						cacheHitRate: cacheHitRate(buckets),
					}))
					.sort((left, right) => right.tokens - left.tokens),
			};
		});
	return {
		days: renderedDays,
		total: { ...total, tokens: totalTokens(total), cacheHitRate: cacheHitRate(total) },
		updatedAt,
	};
}

function legacyPreferences(value: UserPreferences) {
	return {
		version: 1,
		hiddenProviders: value.providers.hidden,
		density: value.display.density === "compact" ? "compact" : "detailed",
		historyMode: value.display.defaultRange === "7d" ? "daily" : "weekly",
	};
}

function guard(request: IncomingMessage, response: ServerResponse, policy?: OwnerRequestPolicy): boolean {
	const decision = authorizeHubApiRequest(request, policy);
	if (!decision.authorized) {
		const error =
			decision.reason === "csrf"
				? "csrf-rejected"
				: decision.reason === "origin" || decision.reason === "fetch-metadata"
					? "cross-site-rejected"
					: "forbidden";
		writeJson(response, 403, { ok: false, error });
		return false;
	}
	return true;
}

async function selectedProvider(url: URL, accounts: AccountService): Promise<string | null> {
	const requested = url.searchParams.get("provider");
	if (requested !== null && requested !== "") return requested;
	const all = await accounts.list();
	return (
		all.find(({ providerId }) => providerId === "deepseek-official")?.providerId ??
		all.find(({ configured }) => configured)?.providerId ??
		all[0]?.providerId ??
		null
	);
}

export interface LegacyApiDependencies {
	readonly logger: UsageStatsLogger;
	readonly projection: UsageProjectionApiService;
	readonly usage: UsageRepository;
	readonly accounts: AccountService;
	readonly preferences: PreferencesRepository;
	readonly ownerRequestPolicy?: OwnerRequestPolicy | undefined;
	now?(): number;
}

export function registerLegacyRoutes(
	webServer: ExactWebServer,
	dependencies: LegacyApiDependencies,
): readonly (() => void)[] {
	const register = (
		path: string,
		handler: (request: IncomingMessage, response: ServerResponse) => Promise<void> | void,
	): (() => void) => webServer.register({ kind: "exact", path, handler });
	const safe = (
		request: IncomingMessage,
		response: ServerResponse,
		operation: () => Promise<void> | void,
	): Promise<void> | void => {
		if (!guard(request, response, dependencies.ownerRequestPolicy)) return;
		try {
			return Promise.resolve(operation()).catch(() => {
				dependencies.logger.warn("usage-stats: legacy request failed (details redacted)");
				writeJson(response, 500, { ok: false, error: "internal" });
			});
		} catch {
			dependencies.logger.warn("usage-stats: legacy request failed (details redacted)");
			writeJson(response, 500, { ok: false, error: "internal" });
		}
	};
	return [
		register(LEGACY_PATHS.usage, (request, response) =>
			safe(request, response, async () => {
				const now = dependencies.now?.() ?? Date.now();
				const facts = dependencies.usage.listFacts({ from: 0, to: now + 1 });
				const timeZone = dependencies.preferences.load("UTC").display.timeZone;
				writeJson(response, 200, { ok: true, ...renderLegacyUsage(facts, timeZone, now) });
			}),
		),
		register(LEGACY_PATHS.providers, (request, response) =>
			safe(request, response, async () => {
				const specs = new Map((await dependencies.accounts.specs()).map((spec) => [spec.id, spec]));
				const providers = (await dependencies.accounts.list()).map((account) => ({
					id: account.providerId,
					displayName: account.displayName,
					accountMode: account.mode,
					adapter: account.adapterId,
					credentialRef: specs.get(account.providerId)?.apiKeyRef ?? null,
					configured: account.configured,
					status: legacyStatus(account.status),
					fetchedAt: account.fetchedAt,
					plan: account.plan,
					windows: legacyWindows(account),
					balance: account.balance,
					stale: account.stale,
					missingCredentials: account.missingCredentials,
				}));
				writeJson(response, 200, { ok: true, providers });
			}),
		),
		register(LEGACY_PATHS.account, (request, response) =>
			safe(request, response, async () => {
				const url = new URL(request.url ?? "/", "http://localhost");
				const providerId = await selectedProvider(url, dependencies.accounts);
				const account =
					providerId === null
						? null
						: ((await dependencies.accounts.list()).find(({ providerId: id }) => id === providerId) ?? null);
				writeJson(
					response,
					200,
					account === null
						? { ok: false, error: "unknown-provider", message: `provider "${providerId}" is not configured` }
						: { ok: true, account: legacyAccount(account) },
				);
			}),
		),
		register(LEGACY_PATHS.balance, (request, response) =>
			safe(request, response, async () => {
				const providerId = await selectedProvider(
					new URL(request.url ?? "/", "http://localhost"),
					dependencies.accounts,
				);
				const account =
					providerId === null
						? null
						: ((await dependencies.accounts.list()).find(({ providerId: id }) => id === providerId) ?? null);
				if (account === null) {
					writeJson(response, 200, { ok: false, error: "unknown-provider" });
					return;
				}
				if (account.mode !== "balance" || account.status === "unsupported") {
					writeJson(response, 200, { ok: false, error: "unsupported", provider: account.providerId });
					return;
				}
				if (!account.configured) {
					writeJson(response, 200, { ok: false, error: "no-credential", provider: account.providerId });
					return;
				}
				if (account.balance === null) {
					writeJson(response, 502, { ok: false, error: "failed", message: legacyStatus(account.status) });
					return;
				}
				writeJson(response, 200, {
					ok: true,
					provider: account.providerId,
					balance: {
						isAvailable: account.status === "ok" || account.stale,
						currency: account.balance.currency,
						total: account.balance.remaining,
						granted: null,
						toppedUp: null,
					},
					fetchedAt: account.fetchedAt,
				});
			}),
		),
		register(LEGACY_PATHS.subscriptions, (request, response) =>
			safe(request, response, async () => {
				const subscriptions = (await dependencies.accounts.list())
					.filter(({ mode }) => mode === "subscription")
					.map(legacyAccount);
				writeJson(response, 200, { ok: true, subscriptions, fetchedAt: dependencies.now?.() ?? Date.now() });
			}),
		),
		register(LEGACY_PATHS.preferences, (request, response) =>
			safe(request, response, async () => {
				if (request.method === "GET") {
					writeJson(response, 200, { ok: true, prefs: legacyPreferences(dependencies.preferences.load("UTC")) });
					return;
				}
				if (request.method !== "PUT") {
					writeJson(response, 405, { ok: false, error: "method-not-allowed" });
					return;
				}
				const body = await readJsonBody(request, response);
				if (body === undefined) return;
				const raw = (body as { prefs?: Record<string, unknown> })?.prefs ?? {};
				const current = dependencies.preferences.load("UTC");
				const next: UserPreferences = {
					...current,
					display: {
						...current.display,
						density: raw.density === "compact" ? "compact" : "comfortable",
						defaultRange: raw.historyMode === "daily" ? "7d" : "30d",
					},
					providers: {
						...current.providers,
						hidden: Array.isArray(raw.hiddenProviders)
							? raw.hiddenProviders.filter((value): value is string => typeof value === "string")
							: [],
					},
				};
				dependencies.preferences.save(next);
				writeJson(response, 200, { ok: true, prefs: legacyPreferences(next) });
			}),
		),
	];
}
