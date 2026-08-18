import type { AccountSnapshot } from "../../shared/domain.js";
import { buildAccountSnapshot, buildErrorSnapshot, statusOfError, unsupportedSnapshot } from "./normalize.js";
import { AccountAdapterRegistry } from "./registry.js";
import type { AccountSnapshotRepository } from "./repository.js";
import { resolveAccountSpecs } from "./specs.js";
import { resolveCredential } from "./transport.js";
import {
	type AccountConfig,
	type AccountDeps,
	type AccountSpec,
	accountIdentityKey,
	type CredentialResolver,
	type ProviderDescriptor,
} from "./types.js";

interface CacheEntry {
	readonly configKey: string;
	readonly snapshot: AccountSnapshot;
	readonly consecutiveTransientFailures: number;
}

export interface AccountServiceOptions {
	readonly credentials: CredentialResolver | undefined;
	readonly getProviders: () => Promise<readonly ProviderDescriptor[]>;
	readonly config: AccountConfig;
	readonly repository: AccountSnapshotRepository;
	readonly registry?: AccountAdapterRegistry;
	readonly deps?: AccountDeps;
	readonly refreshMs?: number;
	readonly concurrency?: number;
	readonly includeCompatibilityProviders?: boolean;
	/** Drop lastGood after this many consecutive transient failures (default 3). */
	readonly staleFailureLimit?: number;
}

export interface AccountRefreshResult {
	readonly accounts: readonly AccountSnapshot[];
	readonly completedAt: number;
}

const DEFAULT_REFRESH_MS = 5 * 60_000;
const DEFAULT_STALE_FAILURE_LIMIT = 3;

function isTransient(status: AccountSnapshot["status"]): boolean {
	return status === "unavailable" || status === "rate-limited" || status === "error";
}

function withStaleData(
	previous: AccountSnapshot | null,
	current: AccountSnapshot,
	consecutiveTransientFailures: number,
	staleFailureLimit: number,
): { snapshot: AccountSnapshot; consecutiveTransientFailures: number } {
	if (previous?.status === "ok" && isTransient(current.status)) {
		const failures = consecutiveTransientFailures + 1;
		if (failures >= staleFailureLimit) {
			return {
				snapshot: { ...current, stale: false },
				consecutiveTransientFailures: failures,
			};
		}
		return {
			snapshot: {
				...previous,
				status: current.status,
				fetchedAt: current.fetchedAt,
				stale: true,
				warningCode: current.warningCode ?? previous.warningCode,
			},
			consecutiveTransientFailures: failures,
		};
	}
	return {
		snapshot: current,
		consecutiveTransientFailures: current.status === "ok" ? 0 : consecutiveTransientFailures,
	};
}

function depsForSpec(deps: AccountDeps, spec: AccountSpec): AccountDeps {
	return {
		...deps,
		targetPolicy: {
			enforceSameOrigin: true,
			...(spec.providerBaseURL === undefined && spec.baseURL === undefined
				? {}
				: { providerBaseURL: spec.providerBaseURL ?? spec.baseURL }),
			...(spec.monitor.allowInsecure === true ? { allowInsecure: true } : {}),
			...(spec.monitor.allowPrivateNetwork === true ? { allowPrivateNetwork: true } : {}),
			...(spec.monitor.allowCrossOrigin === true ? { allowCrossOrigin: true } : {}),
		},
	};
}

function pendingSnapshot(spec: AccountSpec): AccountSnapshot {
	return {
		providerId: spec.id,
		profileId: spec.profileId,
		displayName: spec.displayName,
		adapterId: spec.adapter,
		mode: spec.mode,
		status: spec.adapter === null ? "unsupported" : "pending",
		configured: false,
		fetchedAt: null,
		stale: false,
		plan: null,
		balance: null,
		windows: [],
		missingCredentials: [],
		warningCode: null,
	};
}

function cacheKeyOf(spec: AccountSpec): string {
	return accountIdentityKey(spec.id, spec.profileId);
}

async function mapConcurrent<T, R>(
	items: readonly T[],
	concurrency: number,
	operation: (item: T) => Promise<R>,
): Promise<R[]> {
	const results = new Array<R>(items.length);
	let next = 0;
	const worker = async (): Promise<void> => {
		for (;;) {
			const index = next;
			next += 1;
			if (index >= items.length) return;
			const item = items[index];
			if (item !== undefined) results[index] = await operation(item);
		}
	};
	await Promise.all(Array.from({ length: Math.min(Math.max(1, concurrency), items.length) }, worker));
	return results;
}

export class AccountService {
	readonly #credentials: CredentialResolver | undefined;
	readonly #getProviders: () => Promise<readonly ProviderDescriptor[]>;
	readonly #config: AccountConfig;
	readonly #repository: AccountSnapshotRepository;
	readonly #registry: AccountAdapterRegistry;
	readonly #deps: AccountDeps;
	readonly #refreshMs: number;
	readonly #concurrency: number;
	readonly #includeCompatibility: boolean;
	readonly #staleFailureLimit: number;
	readonly #cache = new Map<string, CacheEntry>();
	readonly #inflight = new Map<string, Promise<AccountSnapshot>>();
	#lastRefreshAt: number | null = null;

	constructor(options: AccountServiceOptions) {
		this.#credentials = options.credentials;
		this.#getProviders = options.getProviders;
		this.#config = options.config;
		this.#repository = options.repository;
		this.#registry = options.registry ?? new AccountAdapterRegistry();
		this.#deps = options.deps ?? {};
		this.#refreshMs = options.refreshMs ?? DEFAULT_REFRESH_MS;
		this.#concurrency = options.concurrency ?? 3;
		this.#includeCompatibility = options.includeCompatibilityProviders ?? true;
		this.#staleFailureLimit = options.staleFailureLimit ?? DEFAULT_STALE_FAILURE_LIMIT;
	}

	get lastRefreshAt(): number | null {
		return this.#lastRefreshAt;
	}

	async specs(): Promise<AccountSpec[]> {
		return resolveAccountSpecs(await this.#getProviders(), this.#config, this.#registry, this.#includeCompatibility);
	}

	async credentialRefs(): Promise<ReadonlySet<string>> {
		const refs = new Set<string>();
		for (const spec of await this.specs()) {
			for (const ref of [
				spec.apiKeyRef,
				spec.monitor.credentialRef,
				spec.monitor.secretKeyRef,
				spec.monitor.fallbackCredentialRef,
				spec.monitor.fallbackUserIdRef,
				spec.monitor.request?.auth?.credentialRef,
			]) {
				if (typeof ref === "string" && ref !== "") refs.add(ref);
			}
		}
		return refs;
	}

	async list(): Promise<readonly AccountSnapshot[]> {
		const specs = await this.specs();
		return specs.map((spec) => {
			const key = cacheKeyOf(spec);
			const memory = this.#cache.get(key);
			if (memory?.configKey === spec.configKey) return memory.snapshot;
			return this.#repository.latest(spec.id, spec.profileId) ?? pendingSnapshot(spec);
		});
	}

	async get(providerId: string, force = false, profileId = ""): Promise<AccountSnapshot | null> {
		const spec = (await this.specs()).find(({ id, profileId: profile }) => id === providerId && profile === profileId);
		if (spec === undefined) return null;
		const now = this.#deps.now?.() ?? Date.now();
		const key = cacheKeyOf(spec);
		const hit = this.#cache.get(key);
		const age = now - (hit?.snapshot.fetchedAt ?? 0);
		if (!force && hit?.configKey === spec.configKey && age >= 0 && age < this.#refreshMs) return hit.snapshot;
		return this.#refreshSpec(spec);
	}

	async refresh(providerIds?: readonly string[]): Promise<readonly AccountSnapshot[]> {
		const all = await this.specs();
		const requested = providerIds === undefined ? null : new Set(providerIds);
		const selected = all.filter((spec) => requested === null || requested.has(spec.id));
		if (requested !== null) {
			const unknown = [...requested].filter((id) => !all.some((spec) => spec.id === id));
			if (unknown.length > 0) throw new Error(`unknown account provider: ${unknown.join(", ")}`);
		}
		const accounts = await mapConcurrent(selected, this.#concurrency, (spec) => this.#refreshSpec(spec));
		this.#lastRefreshAt = this.#deps.now?.() ?? Date.now();
		return accounts;
	}

	async #refreshSpec(spec: AccountSpec): Promise<AccountSnapshot> {
		const key = cacheKeyOf(spec);
		const existing = this.#inflight.get(key);
		if (existing !== undefined) return existing;
		const promise = this.#collect(spec).finally(() => this.#inflight.delete(key));
		this.#inflight.set(key, promise);
		return promise;
	}

	async #collect(spec: AccountSpec): Promise<AccountSnapshot> {
		const now = this.#deps.now?.() ?? Date.now();
		const key = cacheKeyOf(spec);
		const adapter = this.#registry.get(spec.adapter);
		let current: AccountSnapshot;
		if (adapter === null || spec.mode === null) {
			current = unsupportedSnapshot(spec, now);
		} else {
			try {
				const credential = await resolveCredential(this.#credentials, spec.apiKeyRef);
				if (adapter.id !== "opencode-go" && adapter.id !== "declarative" && credential === "") {
					current = buildAccountSnapshot(
						spec,
						{
							status: "not-configured",
							balance: null,
							windows: [],
							missingCredentials: spec.apiKeyRef === undefined ? [] : [spec.apiKeyRef],
						},
						now,
					);
				} else {
					const result = await adapter.collect({
						spec,
						credentials: this.#credentials,
						deps: depsForSpec(this.#deps, spec),
						now,
						credential,
					});
					current = buildAccountSnapshot(spec, result, now);
				}
			} catch (error) {
				current = buildErrorSnapshot(spec, statusOfError(error), now);
			}
		}
		const previousEntry = this.#cache.get(key);
		const previous = previousEntry?.snapshot ?? this.#repository.latest(spec.id, spec.profileId);
		const { snapshot, consecutiveTransientFailures } = withStaleData(
			previous,
			current,
			previousEntry?.consecutiveTransientFailures ?? 0,
			this.#staleFailureLimit,
		);
		const stored = this.#repository.save(snapshot, now);
		this.#cache.set(key, {
			configKey: spec.configKey,
			snapshot: stored,
			consecutiveTransientFailures,
		});
		return stored;
	}
}
