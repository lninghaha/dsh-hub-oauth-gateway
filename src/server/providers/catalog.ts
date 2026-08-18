import type { AccountSnapshot } from "../../shared/domain.js";
import type { ProviderConnection, ProviderRecord, ProvidersData, TokenLifecycle } from "../../shared/providers.js";
import { grokBuildAuthStatus } from "../coding-oauth/auth.js";
import type { CodingOAuthRuntime } from "../coding-oauth/compose.js";
import { ANTIGRAVITY_ROUTE } from "../coding-oauth/ids.js";
import type { OAuthProviderSession } from "../coding-oauth/oauth-session.js";

const EXPIRING_WINDOW_MS = 5 * 60_000;

function clipIds(ids: readonly string[]): string[] {
	return ids.filter((id) => id.length > 0 && id.length <= 128).slice(0, 64);
}

function tokenLifecycle(expiresAt: number | undefined, authenticated: boolean, now: number): TokenLifecycle {
	if (!authenticated) return "none";
	if (expiresAt === undefined) return "unknown";
	if (expiresAt <= now) return "refresh-required";
	if (expiresAt - now <= EXPIRING_WINDOW_MS) return "expiring";
	return "valid";
}

function oauthConnection(authenticated: boolean, lifecycle: TokenLifecycle): ProviderConnection {
	if (!authenticated) return "unconfigured";
	if (lifecycle === "refresh-required") return "expired";
	if (lifecycle === "expiring") return "expiring";
	return "connected";
}

function quotaFromAccount(account: AccountSnapshot | undefined, supportsQuota: boolean): ProviderRecord["quotaState"] {
	if (!supportsQuota) return "not-supported";
	if (account === undefined) return "unlinked";
	if (account.status === "not-configured") return "unlinked";
	if (account.status === "unsupported") return "not-supported";
	if (account.status === "ok") return account.stale ? "stale" : "available";
	if (account.status === "pending") return "unavailable";
	return "unavailable";
}

function modelState(available: readonly string[], selected: readonly string[]): ProviderRecord["modelState"] {
	if (available.length === 0) return "none";
	return selected.length > 0 ? "enabled" : "available-not-enabled";
}

function accountByHints(accounts: readonly AccountSnapshot[], hints: readonly string[]): AccountSnapshot | undefined {
	const wanted = new Set(hints);
	return accounts.find(
		(account) => wanted.has(account.providerId) || (account.adapterId !== null && wanted.has(account.adapterId)),
	);
}

async function oauthRecord(
	id: string,
	displayName: string,
	route: string,
	status: { authenticated: boolean; expiresAt?: number },
	available: readonly string[],
	selected: readonly string[],
	account: AccountSnapshot | undefined,
	supportsQuota: boolean,
	now: number,
): Promise<ProviderRecord> {
	const lifecycle = tokenLifecycle(status.expiresAt, status.authenticated, now);
	const availableIds = clipIds(available);
	const selectedIds = clipIds(selected.length > 0 ? selected : availableIds);
	return {
		id,
		displayName,
		route,
		connection: oauthConnection(status.authenticated, lifecycle),
		authSource: status.authenticated ? "oauth" : "none",
		tokenLifecycle: lifecycle,
		modelState: modelState(availableIds, selectedIds),
		quotaState: quotaFromAccount(account, supportsQuota),
		capabilities: {
			canRefresh: true,
			canDisconnect: status.authenticated,
			supportsOAuth: true,
			supportsModelSelection: true,
			supportsQuota,
		},
		lastSuccessfulAt: account?.status === "ok" ? (account.fetchedAt ?? null) : null,
		lastAttemptAt: account?.fetchedAt ?? null,
		warnings: account?.warningCode === null || account?.warningCode === undefined ? [] : [account.warningCode],
	};
}

function apiKeyRecord(account: AccountSnapshot): ProviderRecord {
	const connection: ProviderConnection =
		account.status === "ok"
			? "connected"
			: account.status === "not-configured"
				? "unconfigured"
				: account.status === "unsupported"
					? "unsupported"
					: account.status === "unavailable" || account.status === "rate-limited"
						? "unavailable"
						: account.configured
							? "configured-failing"
							: "unconfigured";
	return {
		id: account.providerId,
		displayName: account.displayName,
		route: account.adapterId ?? account.providerId,
		connection,
		authSource: account.configured ? "api-key" : "none",
		tokenLifecycle: account.configured ? "unknown" : "none",
		modelState: "unknown",
		quotaState: quotaFromAccount(account, true),
		capabilities: {
			canRefresh: true,
			canDisconnect: account.configured,
			supportsOAuth: false,
			supportsModelSelection: false,
			supportsQuota: true,
		},
		lastSuccessfulAt: account.status === "ok" ? account.fetchedAt : null,
		lastAttemptAt: account.fetchedAt,
		warnings: account.warningCode === null ? [] : [account.warningCode],
	};
}

async function subscriptionRecord(
	session: OAuthProviderSession,
	accounts: readonly AccountSnapshot[],
	now: number,
): Promise<ProviderRecord> {
	const status = await session.status();
	const available = session.availableModels().map((model) => model.id);
	const selected = session.selectedModelIds() ?? [];
	const account = accountByHints(accounts, [
		session.definition.route,
		session.definition.nativeProviderId,
		session.definition.slug,
	]);
	return oauthRecord(
		session.definition.route,
		session.definition.displayName,
		session.definition.route,
		status,
		available,
		selected,
		account,
		session.definition.nativeProviderId === "openai-codex" || session.definition.nativeProviderId === "anthropic",
		now,
	);
}

export async function collectProvidersData(options: {
	readonly accounts: readonly AccountSnapshot[];
	readonly codingOAuth?: CodingOAuthRuntime;
	readonly now?: () => number;
}): Promise<ProvidersData> {
	const now = options.now?.() ?? Date.now();
	const records: ProviderRecord[] = [];
	const oauthIds = new Set<string>();

	if (options.codingOAuth !== undefined) {
		const grokStatus = await grokBuildAuthStatus(options.codingOAuth.grok.store);
		const grokAccount = accountByHints(options.accounts, ["grok-build", "grok", "xai", "xai-grok"]);
		const grokAvailable = options.codingOAuth.grok.availableModels().map((model) => model.id);
		const grokSelected = options.codingOAuth.grok.selectedModelIds() ?? [];
		const grok = await oauthRecord(
			"grok-build",
			"Grok Build",
			"grok-build",
			{
				authenticated: grokStatus.authenticated,
				...(grokStatus.expiresAt === undefined ? {} : { expiresAt: grokStatus.expiresAt.getTime() }),
			},
			grokAvailable,
			grokSelected,
			grokAccount,
			true,
			now,
		);
		records.push(grok);
		oauthIds.add(grok.id);
		for (const session of options.codingOAuth.subscriptions) {
			const record = await subscriptionRecord(session, options.accounts, now);
			records.push(record);
			oauthIds.add(record.id);
		}
		records.push({
			id: ANTIGRAVITY_ROUTE,
			displayName: "Google Antigravity",
			route: ANTIGRAVITY_ROUTE,
			connection: "unsupported",
			authSource: "none",
			tokenLifecycle: "none",
			modelState: "unknown",
			quotaState: "not-supported",
			capabilities: {
				canRefresh: false,
				canDisconnect: false,
				supportsOAuth: false,
				supportsModelSelection: false,
				supportsQuota: false,
			},
			lastSuccessfulAt: null,
			lastAttemptAt: null,
			warnings: ["managed-externally"],
		});
		oauthIds.add(ANTIGRAVITY_ROUTE);
	}

	for (const account of options.accounts) {
		if (oauthIds.has(account.providerId) || (account.adapterId !== null && oauthIds.has(account.adapterId))) continue;
		records.push(apiKeyRecord(account));
	}

	const needsAttention = records.filter((record) =>
		["configured-failing", "expired", "expiring", "unavailable", "signing-in"].includes(record.connection),
	).length;
	return {
		schemaVersion: 1,
		summary: {
			total: records.length,
			connected: records.filter((record) => record.connection === "connected").length,
			needsAttention,
			unconfigured: records.filter((record) => record.connection === "unconfigured").length,
			withQuota: records.filter((record) => record.quotaState === "available" || record.quotaState === "stale").length,
		},
		providers: records,
	};
}
