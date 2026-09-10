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

/** Handle dialect (DSH 0.1.5+): open → read → close / asyncDispose. */
export interface SessionPersistenceReadHandleLike {
	read(offset?: number, length?: number): Promise<{ readonly events: readonly SessionEvent[] }>;
	close?(): Promise<void> | void;
	[Symbol.asyncDispose]?: () => PromiseLike<void> | void;
}

export interface SessionPersistenceLike {
	listSnapshots?(): Promise<readonly PersistenceSnapshotLike[]>;
	/** Legacy: bare headers. Handle dialect: snapshots with header + revision. */
	list(): Promise<readonly (SessionHeaderLike | PersistenceSnapshotLike)[]>;
	/** Legacy dialect (DSH 0.1.1). */
	readFrom?(id: string, fromSeq: number): Promise<{ readonly events: readonly SessionEvent[] }>;
	/** Handle dialect (DSH 0.1.5+). */
	open?(id: string, access: "read" | "write"): Promise<SessionPersistenceReadHandleLike>;
}

export interface DshSessionInventoryOptions {
	readonly sessions: LiveSessionsLike | undefined | (() => LiveSessionsLike | undefined);
	readonly persistence: SessionPersistenceLike | undefined | (() => SessionPersistenceLike | undefined);
	onWarning?(message: string | null): void;
}

function isPersistenceSnapshot(value: unknown): value is PersistenceSnapshotLike {
	if (value === null || typeof value !== "object") return false;
	const record = value as Record<string, unknown>;
	const header = record.header;
	return (
		header !== null &&
		typeof header === "object" &&
		typeof (header as SessionHeaderLike).id === "string" &&
		"revision" in record
	);
}

function revisionText(revision: unknown): string {
	if (typeof revision === "string") return revision;
	if (revision === null || revision === undefined) return "";
	return String(revision);
}

/** Normalize list() entries that may be bare headers or full snapshots. */
export function normalizePersistenceList(
	entries: readonly (SessionHeaderLike | PersistenceSnapshotLike)[],
): PersistenceSnapshotLike[] {
	return entries.map((entry) => {
		if (isPersistenceSnapshot(entry)) {
			return { header: entry.header, revision: revisionText(entry.revision) };
		}
		return { header: entry, revision: "" };
	});
}

async function closeHandle(handle: SessionPersistenceReadHandleLike): Promise<void> {
	try {
		if (typeof handle.close === "function") {
			await handle.close();
			return;
		}
		const dispose = handle[Symbol.asyncDispose];
		if (typeof dispose === "function") await dispose.call(handle);
	} catch {
		// Best-effort teardown; event load already succeeded or failed independently.
	}
}

async function loadEventsFromPersistence(
	persistence: SessionPersistenceLike,
	id: string,
	fromSeq: number,
): Promise<readonly SessionEvent[]> {
	if (typeof persistence.readFrom === "function") {
		return (await persistence.readFrom(id, fromSeq)).events;
	}
	if (typeof persistence.open !== "function") {
		throw new Error("session persistence supports neither readFrom nor open");
	}
	const handle = await persistence.open(id, "read");
	try {
		return (await handle.read(fromSeq)).events;
	} finally {
		await closeHandle(handle);
	}
}

export class DshSessionInventory implements SessionInventory {
	readonly #sessions: () => LiveSessionsLike | undefined;
	readonly #persistence: () => SessionPersistenceLike | undefined;
	readonly #onWarning: ((message: string | null) => void) | undefined;

	constructor(options: DshSessionInventoryOptions) {
		this.#sessions =
			typeof options.sessions === "function"
				? (options.sessions as () => LiveSessionsLike | undefined)
				: () => options.sessions as LiveSessionsLike | undefined;
		this.#persistence =
			typeof options.persistence === "function"
				? (options.persistence as () => SessionPersistenceLike | undefined)
				: () => options.persistence as SessionPersistenceLike | undefined;
		this.#onWarning = options.onWarning;
	}

	async observeSessions(): Promise<readonly ObservedSession[]> {
		const observed: ObservedSession[] = [];
		const attached = new Set<string>();
		for (const session of this.#sessions()?.list() ?? []) {
			attached.add(session.id);
			const last = session.events.at(-1);
			observed.push({
				id: session.id,
				kind: "live",
				revision: `live:${session.events.length}:${last?.seq ?? -1}:${last?.time ?? -1}:${last?.type ?? "empty"}`,
				loadEvents: async (fromSeq) => session.events.slice(fromSeq),
			});
		}
		const persistence = this.#persistence();
		if (persistence === undefined) return observed;

		let snapshots: readonly PersistenceSnapshotLike[] | null = null;
		if (persistence.listSnapshots !== undefined) {
			try {
				snapshots = await persistence.listSnapshots();
				this.#onWarning?.(null);
			} catch {
				this.#onWarning?.("session snapshot inventory is degraded; using compatibility listing");
			}
		}
		const entries =
			snapshots ??
			normalizePersistenceList(await persistence.list()).map((entry) => ({
				header: entry.header,
				revision: entry.revision === "" ? (null as string | null) : entry.revision,
			}));
		for (const entry of entries) {
			if (attached.has(entry.header.id)) continue;
			const id = entry.header.id;
			observed.push({
				id,
				kind: "persisted",
				revision: entry.revision,
				loadEvents: async (fromSeq) => loadEventsFromPersistence(persistence, id, fromSeq),
			});
		}
		return observed;
	}
}
