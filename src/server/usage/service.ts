import type { SessionEvent } from "@deepseek-ai/dsh-session";
import { emptySessionCursor, projectUsageEvents, type SessionSourceKind } from "./projector.js";
import type { UsageRepository } from "./repository.js";

export interface ObservedSession {
	readonly id: string;
	readonly kind: Exclude<SessionSourceKind, "legacy">;
	readonly revision: string | null;
	loadEvents(fromSeq: number): Promise<readonly SessionEvent[]>;
}

export interface SessionInventory {
	observeSessions(): Promise<readonly ObservedSession[]>;
}

export interface UsageSyncResult {
	readonly observedSessions: number;
	readonly changedSessions: number;
	readonly rebuiltSessions: number;
	readonly deletedSessions: number;
	readonly failedSessions: number;
	readonly factsWritten: number;
	readonly completedAt: number;
}

export interface UsageProjectionServiceOptions {
	readonly preserveDeletedSessions: boolean;
	readonly now?: () => number;
}

function eventsAreContiguous(events: readonly SessionEvent[], expectedSeq: number): boolean {
	let expected = expectedSeq;
	for (const event of events) {
		if (event.seq !== expected) return false;
		expected += 1;
	}
	return true;
}

export class UsageProjectionService {
	readonly #repository: UsageRepository;
	readonly #inventory: SessionInventory;
	readonly #preserveDeletedSessions: boolean;
	readonly #now: () => number;
	#inflight: Promise<UsageSyncResult> | null = null;

	constructor(repository: UsageRepository, inventory: SessionInventory, options: UsageProjectionServiceOptions) {
		this.#repository = repository;
		this.#inventory = inventory;
		this.#preserveDeletedSessions = options.preserveDeletedSessions;
		this.#now = options.now ?? Date.now;
	}

	synchronize(): Promise<UsageSyncResult> {
		this.#inflight ??= this.#synchronize().finally(() => {
			this.#inflight = null;
		});
		return this.#inflight;
	}

	async #synchronize(): Promise<UsageSyncResult> {
		const observed = await this.#inventory.observeSessions();
		const seen = new Set<string>();
		let changedSessions = 0;
		let rebuiltSessions = 0;
		let failedSessions = 0;
		let factsWritten = 0;

		for (const session of observed) {
			if (seen.has(session.id)) {
				failedSessions += 1;
				continue;
			}
			seen.add(session.id);
			try {
				const observedAt = this.#now();
				const existing = this.#repository.getCursor(session.id);
				const kindChanged = existing !== null && existing.sourceKind !== session.kind;
				const revisionUnchanged =
					existing !== null &&
					existing.deletedAt === null &&
					existing.sourceRevision !== null &&
					existing.sourceRevision === session.revision;
				if (revisionUnchanged) continue;

				const base =
					existing === null || kindChanged
						? emptySessionCursor(session.id, session.kind, session.revision, observedAt)
						: { ...existing, sourceKind: session.kind, deletedAt: null };
				let replaceSession = existing === null ? false : kindChanged;
				let events = await session.loadEvents(replaceSession ? 0 : base.nextSeq);
				const revisionChangedWithoutDelta =
					existing !== null && existing.sourceRevision !== session.revision && events.length === 0;
				if (!eventsAreContiguous(events, replaceSession ? 0 : base.nextSeq) || revisionChangedWithoutDelta) {
					events = await session.loadEvents(0);
					replaceSession = existing !== null;
				}
				const projectionBase = replaceSession
					? emptySessionCursor(session.id, session.kind, session.revision, observedAt)
					: base;
				if (!eventsAreContiguous(events, projectionBase.nextSeq)) {
					throw new Error("session did not return a contiguous event log");
				}
				const projection = projectUsageEvents(projectionBase, events, session.revision, observedAt);
				this.#repository.applyProjection(projection, replaceSession);
				changedSessions += 1;
				if (replaceSession) rebuiltSessions += 1;
				factsWritten += projection.facts.length;
			} catch {
				// One corrupt or transiently unreadable session must not hide all other usage.
				failedSessions += 1;
			}
		}

		let deletedSessions = 0;
		for (const cursor of this.#repository.listCursors()) {
			if (seen.has(cursor.sessionId) || cursor.deletedAt !== null) continue;
			deletedSessions += 1;
			this.#repository.markDeleted(cursor.sessionId, this.#now(), !this.#preserveDeletedSessions);
		}

		return {
			observedSessions: observed.length,
			changedSessions,
			rebuiltSessions,
			deletedSessions,
			failedSessions,
			factsWritten,
			completedAt: this.#now(),
		};
	}
}
