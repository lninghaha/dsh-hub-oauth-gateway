import type { AccountSnapshot } from "../../shared/domain.js";
import type {
	ProviderConnection,
	ProviderCredentialMeta,
	ProviderRecord,
	ProvidersData,
	TokenLifecycle,
} from "../../shared/providers.js";
import { accountIdentityKey } from "../accounts/types.js";
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

/** All account snapshots claimed by the given provider/adapter id hints. */
function accountsByHints(accounts: readonly AccountSnapshot[], hints: readonly string[]): AccountSnapshot[] {
	const wanted = new Set(hints);
	return accounts.filter(
		(account) => wanted.has(account.providerId) || (account.adapterId !== null && wanted.has(account.adapterId)),
	);
}

/** Quota-bearing snapshot preferred over pending/unsupported matches. */
function bestAccount(matches: readonly AccountSnapshot[]): AccountSnapshot | undefined {
	if (matches.length === 0) return undefined;
	const ranked = [...matches].sort((left, right) => accountQuotaRank(left) - accountQuotaRank(right));
	return ranked[0];
}

function accountQuotaRank(account: AccountSnapshot): number {
	const hasQuota = account.balance !== null || account.windows.length > 0;
	if (account.status === "ok" && hasQuota) return 0;
	if (account.status === "ok") return 1;
	if (account.status === "pending") return 2;
	if (account.status === "not-configured") return 3;
	if (account.status === "unsupported") return 5;
	return 4;
}

interface CredentialMetaOptions {
	readonly refs?: ReadonlyMap<string, string> | undefined;
	readonly writable: boolean;
}

/**
 * Secret-free credential metadata for one linked account: only the reference
 * name (credential alias) plus booleans — never the credential value.
 */
function credentialMeta(
	account: AccountSnapshot | undefined,
	source: ProviderCredentialMeta["source"],
	options: CredentialMetaOptions,
): ProviderCredentialMeta[] {
	if (account === undefined) return [];
	const ref = options.refs?.get(accountIdentityKey(account.providerId, account.profileId));
	if (ref === undefined || ref === "" || ref.length > 128) return [];
	return [
		{
			label: account.displayName,
			ref,
			configured: account.configured,
			source,
			writable: options.writable,
		},
	];
}

async function oauthRecord(
	id: string,
	displayName: string,
	route: string,
	status: { authenticated: boolean; expiresAt?: number },
	available: readonly string[],
	selected: readonly string[],
	account: AccountSnapshot | undefined,
	credentials: ProviderCredentialMeta[],
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
		// The auth mechanism stays "oauth" regardless of sign-in state; the
		// connection/tokenLifecycle fields carry the current status.
		authSource: "oauth",
		tokenLifecycle: lifecycle,
		modelState: modelState(availableIds, selectedIds),
		quotaState: quotaFromAccount(account, supportsQuota),
		credentials,
		accountProviderId: account?.providerId ?? null,
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

function apiKeyRecord(account: AccountSnapshot, credentials: ProviderCredentialMeta[]): ProviderRecord {
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
	// The auth mechanism is "api-key" whenever a credential reference exists,
	// even before a value is saved; "none" is reserved for providers with no
	// credential path at all.
	const hasCredentialPath = account.configured || credentials.length > 0;
	return {
		id: account.providerId,
		displayName: account.displayName,
		route: account.adapterId ?? account.providerId,
		connection,
		authSource: account.status === "unsupported" ? "none" : hasCredentialPath ? "api-key" : "none",
		tokenLifecycle: account.configured ? "unknown" : "none",
		modelState: "unknown",
		quotaState: quotaFromAccount(account, true),
		credentials,
		accountProviderId: account.providerId,
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

/**
 * Google Antigravity is an externally managed route: sign-in happens in the
 * Antigravity app, but quota can still be monitored once an access token is
 * saved for the linked `antigravity` account.
 */
function antigravityRecord(
	account: AccountSnapshot | undefined,
	credentials: ProviderCredentialMeta[],
): ProviderRecord {
	const monitorable = account !== undefined && account.adapterId !== null && account.status !== "unsupported";
	if (!monitorable) {
		return {
			id: ANTIGRAVITY_ROUTE,
			displayName: "Google Antigravity",
			route: ANTIGRAVITY_ROUTE,
			connection: "unsupported",
			authSource: "none",
			tokenLifecycle: "none",
			modelState: "unknown",
			quotaState: "not-supported",
			credentials,
			accountProviderId: account?.providerId ?? null,
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
		};
	}
	const record = apiKeyRecord(account, credentials);
	return {
		...record,
		id: ANTIGRAVITY_ROUTE,
		displayName: "Google Antigravity",
		route: ANTIGRAVITY_ROUTE,
		warnings: record.warnings.includes("managed-externally")
			? record.warnings
			: [...record.warnings, "managed-externally"].slice(0, 16),
	};
}

const OAUTH_QUOTA_NATIVE_IDS = new Set(["openai-codex", "anthropic", "kimi-coding"]);

async function subscriptionRecord(
	session: OAuthProviderSession,
	account: AccountSnapshot | undefined,
	credentials: ProviderCredentialMeta[],
	now: number,
): Promise<ProviderRecord> {
	const status = await session.status();
	const available = session.availableModels().map((model) => model.id);
	const selected = session.selectedModelIds() ?? [];
	return oauthRecord(
		session.definition.route,
		session.definition.displayName,
		session.definition.route,
		status,
		available,
		selected,
		account,
		credentials,
		OAUTH_QUOTA_NATIVE_IDS.has(session.definition.nativeProviderId),
		now,
	);
}

export async function collectProvidersData(options: {
	readonly accounts: readonly AccountSnapshot[];
	readonly codingOAuth?: CodingOAuthRuntime;
	readonly now?: () => number;
	/** apiKeyRef per account identity key (`accountIdentityKey(providerId, profileId)`). */
	readonly credentialRefs?: ReadonlyMap<string, string>;
	/** Whether the host credential seam accepts writes (enables inline key editing). */
	readonly credentialsWritable?: boolean;
}): Promise<ProvidersData> {
	const now = options.now?.() ?? Date.now();
	const records: ProviderRecord[] = [];
	const consumed = new Set<string>();
	const metaOptions: CredentialMetaOptions = {
		refs: options.credentialRefs,
		writable: options.credentialsWritable === true,
	};
	const claim = (matches: readonly AccountSnapshot[]): AccountSnapshot | undefined => {
		for (const match of matches) consumed.add(accountIdentityKey(match.providerId, match.profileId));
		return bestAccount(matches);
	};

	if (options.codingOAuth !== undefined) {
		const grokStatus = await grokBuildAuthStatus(options.codingOAuth.grok.store);
		const grokAccount = claim(accountsByHints(options.accounts, ["grok-build", "grok", "xai", "xai-grok"]));
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
			credentialMeta(grokAccount, "oauth", metaOptions),
			true,
			now,
		);
		records.push(grok);
		for (const session of options.codingOAuth.subscriptions) {
			const account = claim(
				accountsByHints(options.accounts, [
					session.definition.route,
					session.definition.nativeProviderId,
					session.definition.slug,
				]),
			);
			records.push(await subscriptionRecord(session, account, credentialMeta(account, "oauth", metaOptions), now));
		}
		const antigravityAccount = claim(accountsByHints(options.accounts, [ANTIGRAVITY_ROUTE, "antigravity"]));
		records.push(antigravityRecord(antigravityAccount, credentialMeta(antigravityAccount, "api-key", metaOptions)));
	}

	for (const account of options.accounts) {
		if (consumed.has(accountIdentityKey(account.providerId, account.profileId))) continue;
		records.push(apiKeyRecord(account, credentialMeta(account, "api-key", metaOptions)));
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
