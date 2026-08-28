/**
 * Optional multi-account pool for coding-oauth AuthDocument v2 stores.
 * Pure selection helpers plus a CredentialStore proxy that serves a sticky
 * per-request account without rewriting activeAccountId on disk.
 */

import { AsyncLocalStorage } from "node:async_hooks";
import type { Credential, CredentialInfo, CredentialStore, OAuthCredential } from "@earendil-works/pi-ai";
import type { QuotaWindow } from "../../shared/domain.js";
import type { OAuthCredentialFileStore } from "./store.js";

/** Pool scheduling mode. `off` keeps today's active-account-only behavior. */
export type PoolMode = "off" | "priority" | "quota_aware";

export interface PoolPick {
	readonly accountId: string;
	readonly reason: "off" | "priority" | "quota_aware" | "sticky" | "quota_full_fallback";
}

/** A member is taken out of primary rotation once any window crosses this fill. */
export const QUOTA_FULL_RATIO = 0.95;

/** Bound on sticky-session memory; oldest entries evict past it. */
export const STICKY_SESSION_LIMIT = 1_000;

/** Assumed window length when the provider discloses no `resetsAt`. */
const FALLBACK_HORIZON_MS: Readonly<Record<QuotaWindow["kind"], number>> = {
	session: 5 * 60 * 60_000,
	daily: 24 * 60 * 60_000,
	weekly: 7 * 24 * 60 * 60_000,
	monthly: 30 * 24 * 60 * 60_000,
	rolling: 30 * 24 * 60 * 60_000,
	custom: 30 * 24 * 60 * 60_000,
};

export interface AccountQuotaView {
	/** False when any window is ≥95% used. */
	readonly available: boolean;
	/**
	 * Required burn rate (remaining ratio per ms). Higher = spend sooner.
	 * Missing telemetry scores 0 (last resort among available peers).
	 */
	readonly urgency: number;
}

export interface SelectAccountInput {
	readonly accounts: readonly string[];
	readonly activeId: string | undefined;
	readonly snapshotsByAccountId: ReadonlyMap<string, readonly QuotaWindow[] | undefined>;
	readonly stickyId: string | undefined;
	readonly strategy: Exclude<PoolMode, "off">;
	readonly switchMargin: number;
	readonly now?: number;
}

interface PoolOverride {
	readonly providerId: string;
	readonly accountId: string;
}

const poolOverrideStorage = new AsyncLocalStorage<PoolOverride>();

/**
 * Required burn rate across windows: remaining ratio / time-until-reset.
 * Windows at or above 95% used mark the account unavailable for primary rotation.
 * Empty / missing windows score urgency 0 (Copilot-style last resort).
 */
export function urgencyFromSnapshots(windows: readonly QuotaWindow[] | undefined, now = Date.now()): AccountQuotaView {
	if (windows === undefined || windows.length === 0) {
		return { available: true, urgency: 0 };
	}
	let available = true;
	let urgency = 0;
	for (const window of windows) {
		const usedRatio = usedRatioOf(window);
		if (usedRatio !== null && usedRatio >= QUOTA_FULL_RATIO) available = false;
		urgency = Math.max(urgency, windowUrgency(window, usedRatio, now));
	}
	return { available, urgency };
}

function usedRatioOf(window: QuotaWindow): number | null {
	if (typeof window.usedRatio === "number" && Number.isFinite(window.usedRatio)) {
		return Math.max(0, Math.min(1, window.usedRatio));
	}
	if (
		typeof window.used === "number" &&
		Number.isFinite(window.used) &&
		typeof window.limit === "number" &&
		Number.isFinite(window.limit) &&
		window.limit > 0
	) {
		return Math.max(0, Math.min(1, window.used / window.limit));
	}
	if (
		typeof window.remaining === "number" &&
		Number.isFinite(window.remaining) &&
		typeof window.limit === "number" &&
		Number.isFinite(window.limit) &&
		window.limit > 0
	) {
		return Math.max(0, Math.min(1, 1 - window.remaining / window.limit));
	}
	return null;
}

function windowUrgency(window: QuotaWindow, usedRatio: number | null, now: number): number {
	const remaining = usedRatio === null ? 0 : Math.max(0, 1 - usedRatio);
	const horizon =
		typeof window.resetsAt === "number" && Number.isFinite(window.resetsAt)
			? Math.max(window.resetsAt - now, 1)
			: FALLBACK_HORIZON_MS[window.kind];
	return remaining / horizon;
}

/**
 * Pick one account for a request. Sticky hysteresis: a challenger must beat
 * the sticky member's urgency by `switchMargin` (multiplicative) to take over.
 * Quota-exhausted accounts stay as a last-resort tail in pool order.
 */
export function selectAccount(input: SelectAccountInput): PoolPick {
	const ordered = orderPoolAccounts(input);
	const first = ordered[0];
	if (first === undefined) {
		const fallback = input.activeId ?? input.accounts[0];
		if (fallback === undefined) throw new Error("selectAccount requires at least one account");
		return { accountId: fallback, reason: "off" };
	}
	return first;
}

/** Full failover order for one request (sticky + strategy ranking). */
export function orderPoolAccounts(input: SelectAccountInput): PoolPick[] {
	const accounts = [...new Set(input.accounts.filter((id) => id.length > 0))];
	if (accounts.length === 0) return [];

	const stickyId = input.stickyId !== undefined && accounts.includes(input.stickyId) ? input.stickyId : undefined;

	if (input.strategy === "priority") {
		const ordered = priorityOrder(accounts, input.activeId, stickyId);
		return ordered.map((accountId, index) => ({
			accountId,
			reason: stickyId !== undefined && index === 0 && accountId === stickyId ? "sticky" : "priority",
		}));
	}

	const now = input.now ?? Date.now();
	const quotas = new Map<string, AccountQuotaView>();
	for (const accountId of accounts) {
		quotas.set(accountId, urgencyFromSnapshots(input.snapshotsByAccountId.get(accountId), now));
	}
	const scored = accounts.filter((accountId) => quotas.get(accountId)?.available === true);
	const quotaFull = accounts.filter((accountId) => quotas.get(accountId)?.available === false);
	scored.sort((a, b) => (quotas.get(b)?.urgency ?? 0) - (quotas.get(a)?.urgency ?? 0));

	if (stickyId !== undefined && scored.includes(stickyId)) {
		const best = scored[0];
		const stickyUrgency = quotas.get(stickyId)?.urgency ?? 0;
		const bestUrgency = best === undefined ? 0 : (quotas.get(best)?.urgency ?? 0);
		const margin = Math.max(1, input.switchMargin);
		if (best === stickyId || bestUrgency <= stickyUrgency * margin) {
			scored.splice(scored.indexOf(stickyId), 1);
			scored.unshift(stickyId);
		}
	}

	const picks: PoolPick[] = [];
	for (const [index, accountId] of scored.entries()) {
		const reason =
			stickyId !== undefined && index === 0 && accountId === stickyId ? "sticky" : ("quota_aware" as const);
		picks.push({ accountId, reason });
	}
	for (const accountId of quotaFull) {
		picks.push({ accountId, reason: "quota_full_fallback" });
	}
	return picks;
}

function priorityOrder(
	accounts: readonly string[],
	activeId: string | undefined,
	stickyId: string | undefined,
): string[] {
	const rest = accounts.filter((id) => id !== stickyId && id !== activeId);
	const head: string[] = [];
	if (stickyId !== undefined) head.push(stickyId);
	if (activeId !== undefined && activeId !== stickyId && accounts.includes(activeId)) {
		head.push(activeId);
	}
	return [...head, ...rest];
}

/** Bounded sticky map: `sessionId|provider` → accountId. */
export class StickyAccountMap {
	readonly #entries = new Map<string, string>();
	readonly #limit: number;

	constructor(limit = STICKY_SESSION_LIMIT) {
		this.#limit = Math.max(1, limit);
	}

	get(sessionId: string | undefined, providerId: string): string | undefined {
		if (sessionId === undefined || sessionId.length === 0) return undefined;
		return this.#entries.get(stickyKey(sessionId, providerId));
	}

	set(sessionId: string | undefined, providerId: string, accountId: string): void {
		if (sessionId === undefined || sessionId.length === 0) return;
		const key = stickyKey(sessionId, providerId);
		this.#entries.delete(key);
		if (this.#entries.size >= this.#limit) {
			const oldest = this.#entries.keys().next();
			if (oldest.done !== true) this.#entries.delete(oldest.value);
		}
		this.#entries.set(key, accountId);
	}

	clear(): void {
		this.#entries.clear();
	}

	get size(): number {
		return this.#entries.size;
	}
}

function stickyKey(sessionId: string, providerId: string): string {
	return `${sessionId}|${providerId}`;
}

/**
 * CredentialStore facade that returns a request-scoped account credential
 * while leaving the on-disk activeAccountId untouched.
 */
export class PoolCredentialProxy implements CredentialStore {
	constructor(readonly inner: OAuthCredentialFileStore) {}

	async read(providerId: string): Promise<Credential | undefined> {
		const override = poolOverrideStorage.getStore();
		if (override === undefined || override.providerId !== providerId) {
			return this.inner.read(providerId);
		}
		return this.inner.readAccount(override.accountId);
	}

	async list(): Promise<readonly CredentialInfo[]> {
		return this.inner.list();
	}

	async modify(
		providerId: string,
		fn: (current: Credential | undefined) => Promise<Credential | undefined>,
	): Promise<Credential | undefined> {
		const override = poolOverrideStorage.getStore();
		if (override === undefined || override.providerId !== providerId) {
			return this.inner.modify(providerId, fn);
		}
		return this.inner.modifyAccount(override.accountId, fn);
	}

	async delete(providerId: string): Promise<void> {
		return this.inner.delete(providerId);
	}
}

/** Run `fn` with CredentialStore reads/writes scoped to one account. */
export function runWithPoolAccount<T>(providerId: string, accountId: string, fn: () => T): T {
	return poolOverrideStorage.run({ providerId, accountId }, fn);
}

/**
 * Drive an async iterable while keeping pool account overrides active for each
 * pull. Credential refresh during streaming therefore hits the same account.
 */
export async function* iterateWithPoolAccount<T>(
	providerId: string,
	accountId: string,
	source: AsyncIterable<T>,
): AsyncIterable<T> {
	const iterator = source[Symbol.asyncIterator]();
	try {
		for (;;) {
			const result = await poolOverrideStorage.run({ providerId, accountId }, () => iterator.next());
			if (result.done === true) return;
			yield result.value;
		}
	} finally {
		try {
			await poolOverrideStorage.run({ providerId, accountId }, () => iterator.return?.() ?? Promise.resolve());
		} catch {
			// Closing a half-consumed stream must not mask the outcome.
		}
	}
}

export function currentPoolAccountOverride(): PoolOverride | undefined {
	return poolOverrideStorage.getStore();
}

export type GetQuotaWindows = (
	accountId: string,
) => readonly QuotaWindow[] | undefined | Promise<readonly QuotaWindow[] | undefined>;

export interface AccountPoolControllerOptions {
	readonly mode: PoolMode;
	readonly switchMargin: number;
	readonly getQuotaWindows?: GetQuotaWindows;
}

/**
 * Per-provider sticky selection + credential proxies for coding-oauth routes.
 * When mode is `off` or a provider has fewer than two accounts, reads fall
 * through to the active account only.
 */
export class AccountPoolController {
	readonly sticky = new StickyAccountMap();
	readonly #mode: PoolMode;
	readonly #switchMargin: number;
	#getQuotaWindows: GetQuotaWindows;

	constructor(options: AccountPoolControllerOptions) {
		this.#mode = options.mode;
		this.#switchMargin = options.switchMargin;
		this.#getQuotaWindows = options.getQuotaWindows ?? (() => undefined);
	}

	get mode(): PoolMode {
		return this.#mode;
	}

	setQuotaWindowsSource(getQuotaWindows: GetQuotaWindows): void {
		this.#getQuotaWindows = getQuotaWindows;
	}

	wrap(store: OAuthCredentialFileStore): PoolCredentialProxy {
		return new PoolCredentialProxy(store);
	}

	/** Whether this provider should run multi-account selection for a request. */
	async shouldPool(store: OAuthCredentialFileStore): Promise<boolean> {
		if (this.#mode === "off") return false;
		const accounts = await store.listAccounts();
		return accounts.length >= 2;
	}

	async candidates(
		store: OAuthCredentialFileStore,
		providerId: string,
		sessionId: string | undefined,
	): Promise<PoolPick[]> {
		if (this.#mode === "off") return [];
		const summaries = await store.listAccounts();
		if (summaries.length < 2) return [];
		const accounts = summaries.map((account) => account.id);
		const activeId = await store.getActiveAccountId();
		const snapshotsByAccountId = new Map<string, readonly QuotaWindow[] | undefined>();
		await Promise.all(
			accounts.map(async (accountId) => {
				snapshotsByAccountId.set(accountId, await this.#getQuotaWindows(accountId));
			}),
		);
		return orderPoolAccounts({
			accounts,
			activeId,
			snapshotsByAccountId,
			stickyId: this.sticky.get(sessionId, providerId),
			strategy: this.#mode,
			switchMargin: this.#switchMargin,
		});
	}

	remember(providerId: string, sessionId: string | undefined, accountId: string): void {
		this.sticky.set(sessionId, providerId, accountId);
	}
}

/** Clone helper for tests that need an oauth credential shape. */
export function asOAuthCredential(credential: Credential | undefined): OAuthCredential | undefined {
	return credential?.type === "oauth" ? credential : undefined;
}
