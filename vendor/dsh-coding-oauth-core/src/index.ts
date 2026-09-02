/**
 * DSH-neutral coordination primitives for coding OAuth integrations.
 *
 * This package deliberately declares no `dsh.bundle` or `dsh.client` metadata.
 * Multiple physical copies coordinate through a versioned global symbol while
 * keeping each Cordis root isolated in a WeakMap.
 */

export const CODING_OAUTH_CORE_ABI = "dsh-coding-oauth-core/v1" as const;

export * from "./proxy.js";
export * from "./route-registration.js";
export * from "./ids.js";
export * from "./state-contract.js";
export * from "./http-json.js";
export * from "./grok-errors.js";
export * from "./kimi-errors.js";
export * from "./gateway-protocol.js";

export type CodingOAuthRole = "hub" | "standalone";

export type DshCapabilityState = "available" | "missing" | "incompatible";

export interface DshHostCapability {
	readonly state: DshCapabilityState;
	readonly contract?: string;
	readonly reason?: string;
}

export interface DshHostCapabilities {
	readonly coreAbi: typeof CODING_OAUTH_CORE_ABI;
	readonly dshVersion: string | null;
	readonly webServer: DshHostCapability;
	readonly settings: DshHostCapability;
	readonly credentials: DshHostCapability;
	readonly llm: DshHostCapability;
	readonly sessions?: DshHostCapability;
	readonly clientLoader?: DshHostCapability;
	readonly slots?: DshHostCapability;
}

export type OwnerAccessMode = "loopback" | "ssh-tunnel" | "trusted-https-proxy" | "denied";

export interface OwnerRequestDecision {
	readonly authorized: boolean;
	readonly accessMode?: OwnerAccessMode;
	readonly reason?: string;
}

/** Security boundary implemented by each host integration. */
export interface OwnerRequestPolicy<Request = unknown, Diagnostic = unknown> {
	authorize(request: Request): OwnerRequestDecision;
	diagnostics(): readonly Diagnostic[];
}

export interface CodingOAuthActivation<T = unknown> {
	readonly runtime?: T;
	dispose(): void | Promise<void>;
}

export interface CodingOAuthParticipant<T = unknown> {
	readonly id: string;
	readonly role: CodingOAuthRole;
	readonly coreAbi: typeof CODING_OAUTH_CORE_ABI;
	activate(): CodingOAuthActivation<T> | Promise<CodingOAuthActivation<T>>;
}

export type CodingOAuthRuntimeStatus = "activating" | "active" | "standby" | "error" | "incompatible";

export interface CodingOAuthRuntimeSnapshot<T = unknown> {
	readonly participantId: string;
	readonly role: CodingOAuthRole;
	readonly status: CodingOAuthRuntimeStatus;
	readonly ownerId: string | null;
	readonly uiOwner: CodingOAuthRole | null;
	readonly runtime?: T;
	readonly diagnostic: string | null;
}

export interface CodingOAuthRuntime<T = unknown> {
	snapshot(): CodingOAuthRuntimeSnapshot<T>;
	subscribe(listener: (snapshot: CodingOAuthRuntimeSnapshot<T>) => void): () => void;
	settled(): Promise<CodingOAuthRuntimeSnapshot<T>>;
	release(): Promise<void>;
}

interface ParticipantRecord<T = unknown> {
	readonly token: symbol;
	readonly participant: CodingOAuthParticipant<T>;
	readonly listeners: Set<(snapshot: CodingOAuthRuntimeSnapshot<T>) => void>;
	status: CodingOAuthRuntimeStatus;
	runtime: T | undefined;
	diagnostic: string | null;
	released: boolean;
}

interface RuntimeRegistry {
	readonly abi: typeof CODING_OAUTH_CORE_ABI;
	readonly participants: Map<symbol, ParticipantRecord>;
	owner: ParticipantRecord | null;
	activation: CodingOAuthActivation | null;
	reconcile: Promise<void>;
	generation: number;
}

interface GlobalRuntimeStore {
	readonly abi: typeof CODING_OAUTH_CORE_ABI;
	readonly roots: WeakMap<object, RuntimeRegistry>;
}

const STORE_SYMBOL = Symbol.for("dsh.coding-oauth-core.runtime-store");

/** Resolve the stable Cordis application root shared by sibling plugin contexts. */
export function resolveCodingOAuthScope(context: object): object {
	const root = (context as { readonly root?: unknown }).root;
	return root !== null && (typeof root === "object" || typeof root === "function") ? root : context;
}

function globalStore(): GlobalRuntimeStore | null {
	const host = globalThis as typeof globalThis & { [STORE_SYMBOL]?: unknown };
	const existing = host[STORE_SYMBOL];
	if (existing !== undefined) {
		if (!isGlobalRuntimeStore(existing) || existing.abi !== CODING_OAUTH_CORE_ABI) return null;
		return existing;
	}
	const created: GlobalRuntimeStore = {
		abi: CODING_OAUTH_CORE_ABI,
		roots: new WeakMap<object, RuntimeRegistry>(),
	};
	Object.defineProperty(host, STORE_SYMBOL, {
		value: created,
		configurable: false,
		enumerable: false,
		writable: false,
	});
	return created;
}

function isGlobalRuntimeStore(value: unknown): value is GlobalRuntimeStore {
	if (value === null || typeof value !== "object") return false;
	const candidate = value as Partial<GlobalRuntimeStore>;
	return typeof candidate.abi === "string" && candidate.roots instanceof WeakMap;
}

function registryFor(scope: object): RuntimeRegistry | null {
	const store = globalStore();
	if (store === null) return null;
	let registry = store.roots.get(scope);
	if (registry !== undefined) return registry;
	registry = {
		abi: CODING_OAUTH_CORE_ABI,
		participants: new Map(),
		owner: null,
		activation: null,
		reconcile: Promise.resolve(),
		generation: 0,
	};
	store.roots.set(scope, registry);
	return registry;
}

function preferredParticipants(registry: RuntimeRegistry): ParticipantRecord[] {
	return [...registry.participants.values()]
		.filter((record) => !record.released && record.participant.coreAbi === CODING_OAUTH_CORE_ABI)
		.sort((left, right) => {
			if (left.participant.role !== right.participant.role) return left.participant.role === "hub" ? -1 : 1;
			return left.participant.id.localeCompare(right.participant.id);
		});
}

function snapshotOf<T>(registry: RuntimeRegistry | null, record: ParticipantRecord<T>): CodingOAuthRuntimeSnapshot<T> {
	const owner = registry?.owner ?? null;
	return {
		participantId: record.participant.id,
		role: record.participant.role,
		status: record.status,
		ownerId: owner?.participant.id ?? null,
		uiOwner: owner?.participant.role ?? null,
		...(record.runtime === undefined ? {} : { runtime: record.runtime }),
		diagnostic: record.diagnostic,
	};
}

function notify(registry: RuntimeRegistry): void {
	for (const record of registry.participants.values()) {
		const snapshot = snapshotOf(registry, record);
		for (const listener of record.listeners) {
			try {
				listener(snapshot);
			} catch {
				// Observers are advisory and must never break ownership reconciliation.
			}
		}
	}
}

async function disposeActivation(registry: RuntimeRegistry): Promise<string | null> {
	const activation = registry.activation;
	if (activation === null) return null;
	try {
		await activation.dispose();
		registry.activation = null;
		return null;
	} catch (error) {
		return error instanceof Error ? error.message : "coding OAuth owner cleanup failed";
	}
}

function queueReconcile(registry: RuntimeRegistry): Promise<void> {
	const generation = ++registry.generation;
	registry.reconcile = registry.reconcile.catch(() => undefined).then(async () => {
		if (generation !== registry.generation) return;
		const candidates = preferredParticipants(registry);
		const preferred = candidates[0] ?? null;
		if (preferred !== null && registry.owner === preferred && registry.activation !== null) {
			notify(registry);
			return;
		}

		const previous = registry.owner;
		if (previous !== null && !previous.released) {
			previous.status = "standby";
			previous.runtime = undefined;
		}
		const cleanupError = await disposeActivation(registry);
		if (cleanupError !== null) {
			if (previous !== null) {
				previous.status = "error";
				previous.diagnostic = `previous coding OAuth owner cleanup failed: ${cleanupError}`;
			}
			if (preferred !== null && preferred !== previous) {
				preferred.status = "error";
				preferred.diagnostic = "takeover blocked because the previous coding OAuth owner did not clean up";
			}
			notify(registry);
			return;
		}
		registry.owner = null;

		for (const candidate of candidates) {
			if (candidate.released) continue;
			candidate.status = "activating";
			candidate.diagnostic = null;
			notify(registry);
			try {
				const activation = await candidate.participant.activate();
				if (generation !== registry.generation || candidate.released) {
					await activation.dispose();
					return;
				}
				registry.owner = candidate;
				registry.activation = activation;
				candidate.status = "active";
				candidate.runtime = activation.runtime;
				for (const other of candidates) {
					if (other !== candidate && other.status !== "incompatible" && other.status !== "error") {
						other.status = "standby";
						other.runtime = undefined;
					}
				}
				notify(registry);
				return;
			} catch (error) {
				candidate.status = "error";
				candidate.runtime = undefined;
				candidate.diagnostic = error instanceof Error ? error.message : "coding OAuth owner activation failed";
				notify(registry);
			}
		}
		notify(registry);
	});
	return registry.reconcile;
}

/**
 * Join the root-scoped owner election. Hub participants always win over
 * standalone participants; ties are deterministic by participant id.
 */
export function acquireCodingOAuthRuntime<T>(
	scope: object,
	participant: CodingOAuthParticipant<T>,
): CodingOAuthRuntime<T> {
	const registry = registryFor(scope);
	const record: ParticipantRecord<T> = {
		token: Symbol(participant.id),
		participant,
		listeners: new Set(),
		status: "standby",
		runtime: undefined,
		diagnostic: null,
		released: false,
	};

	if (participant.coreAbi !== CODING_OAUTH_CORE_ABI || registry === null) {
		record.status = "incompatible";
		record.diagnostic = "coding OAuth core ABI is incompatible";
	} else {
		registry.participants.set(record.token, record as ParticipantRecord);
		void queueReconcile(registry);
	}

	return {
		snapshot: () => snapshotOf(registry, record),
		subscribe(listener) {
			record.listeners.add(listener);
			listener(snapshotOf(registry, record));
			return () => record.listeners.delete(listener);
		},
		async settled() {
			if (registry !== null) await registry.reconcile;
			return snapshotOf(registry, record);
		},
		async release() {
			if (record.released) return;
			record.released = true;
			record.listeners.clear();
			if (registry === null) return;
			registry.participants.delete(record.token);
			await queueReconcile(registry);
		},
	};
}
