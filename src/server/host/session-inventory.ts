import type { SessionEvent } from "@deepseek-ai/dsh-session";
import type { ObservedSession, SessionInventory } from "../usage/service.js";

export interface LiveSessionLike {
	readonly id: string;
	readonly events: readonly SessionEvent[];
}

export interface LiveSessionsLike {
	list(): readonly LiveSessionLike[];
}

export interface SessionHeaderLike {
	readonly id: string;
}

export interface PersistenceSnapshotLike {
	readonly header: SessionHeaderLike;
	readonly revision: string;
}

export interface SessionPersistenceLike {
	listSnapshots?(): Promise<readonly PersistenceSnapshotLike[]>;
	list(): Promise<readonly SessionHeaderLike[]>;
	readFrom(id: string, fromSeq: number): Promise<{ readonly events: readonly SessionEvent[] }>;
}

export interface DshSessionInventoryOptions {
	readonly sessions: LiveSessionsLike | undefined;
	readonly persistence: SessionPersistenceLike | undefined;
	onWarning?(message: string | null): void;
}

export class DshSessionInventory implements SessionInventory {
	readonly #sessions: LiveSessionsLike | undefined;
	readonly #persistence: SessionPersistenceLike | undefined;
	readonly #onWarning: ((message: string | null) => void) | undefined;

	constructor(options: DshSessionInventoryOptions) {
		this.#sessions = options.sessions;
		this.#persistence = options.persistence;
		this.#onWarning = options.onWarning;
	}

	async observeSessions(): Promise<readonly ObservedSession[]> {
		const observed: ObservedSession[] = [];
		const attached = new Set<string>();
		for (const session of this.#sessions?.list() ?? []) {
			attached.add(session.id);
			const last = session.events.at(-1);
			observed.push({
				id: session.id,
				kind: "live",
				revision: `live:${session.events.length}:${last?.seq ?? -1}:${last?.time ?? -1}:${last?.type ?? "empty"}`,
				loadEvents: async (fromSeq) => session.events.slice(fromSeq),
			});
		}
		if (this.#persistence === undefined) return observed;

		let snapshots: readonly PersistenceSnapshotLike[] | null = null;
		if (this.#persistence.listSnapshots !== undefined) {
			try {
				snapshots = await this.#persistence.listSnapshots();
				this.#onWarning?.(null);
			} catch {
				this.#onWarning?.("session snapshot inventory is degraded; using compatibility listing");
			}
		}
		const entries =
			snapshots ?? (await this.#persistence.list()).map((header) => ({ header, revision: null as string | null }));
		for (const entry of entries) {
			if (attached.has(entry.header.id)) continue;
			const id = entry.header.id;
			observed.push({
				id,
				kind: "persisted",
				revision: entry.revision,
				loadEvents: async (fromSeq) => (await this.#persistence?.readFrom(id, fromSeq))?.events ?? [],
			});
		}
		return observed;
	}
}
