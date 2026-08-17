import type { SessionEvent } from "@deepseek-ai/dsh-session";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { UsageDatabase } from "../../../src/server/storage/database.js";
import { UsageRepository } from "../../../src/server/usage/repository.js";
import type { ObservedSession, SessionInventory } from "../../../src/server/usage/service.js";
import { UsageProjectionService } from "../../../src/server/usage/service.js";

function usageEvent(seq: number, inputTokens: number, time = seq + 1): SessionEvent {
	return {
		type: "assistant/chunk",
		seq,
		time,
		data: { turn: seq, step: 0, chunk: { type: "usage", usage: { inputTokens, outputTokens: 1 } } },
	} as SessionEvent;
}

function observedSession(
	id: string,
	revision: string | null,
	events: readonly SessionEvent[],
	kind: "live" | "persisted" = "persisted",
): ObservedSession {
	return {
		id,
		revision,
		kind,
		async loadEvents(fromSeq) {
			return events.filter((event) => event.seq >= fromSeq);
		},
	};
}

describe("UsageProjectionService", () => {
	let database: UsageDatabase;
	let repository: UsageRepository;
	let sessions: ObservedSession[];
	let inventory: SessionInventory;
	let now: number;

	beforeEach(async () => {
		database = await UsageDatabase.open(":memory:");
		repository = new UsageRepository(database);
		sessions = [];
		inventory = { observeSessions: vi.fn(async () => sessions) };
		now = 100;
	});

	afterEach(() => database.close());

	it("shares concurrent synchronization and skips unchanged persisted revisions", async () => {
		sessions = [observedSession("a", "rev-1", [usageEvent(0, 3)])];
		const service = new UsageProjectionService(repository, inventory, {
			preserveDeletedSessions: true,
			now: () => now,
		});
		const first = service.synchronize();
		const second = service.synchronize();
		expect(second).toBe(first);
		await first;
		expect(repository.countFacts()).toBe(1);

		now = 200;
		const unchanged = await service.synchronize();
		expect(unchanged.changedSessions).toBe(0);
		expect(inventory.observeSessions).toHaveBeenCalledTimes(2);
	});

	it("rebuilds a session when a revision changes without an append delta", async () => {
		sessions = [observedSession("a", "rev-1", [usageEvent(0, 3)])];
		const service = new UsageProjectionService(repository, inventory, {
			preserveDeletedSessions: true,
			now: () => now,
		});
		await service.synchronize();

		sessions = [observedSession("a", "rev-2", [usageEvent(0, 8)])];
		now = 200;
		const result = await service.synchronize();
		expect(result.rebuiltSessions).toBe(1);
		expect(repository.sumFacts({ from: 0, to: 1_000 }).inputTokens).toBe(8);
	});

	it("isolates an unreadable session and keeps projecting healthy sessions", async () => {
		sessions = [
			{
				id: "broken",
				kind: "persisted",
				revision: "broken-rev",
				loadEvents: vi.fn(async () => {
					throw new Error("fixture failure");
				}),
			},
			observedSession("healthy", "healthy-rev", [usageEvent(0, 11)]),
		];
		const service = new UsageProjectionService(repository, inventory, {
			preserveDeletedSessions: true,
			now: () => now,
		});
		const result = await service.synchronize();
		expect(result.failedSessions).toBe(1);
		expect(repository.sumFacts({ from: 0, to: 1_000 }).inputTokens).toBe(11);
	});

	it("marks missing sessions deleted while retaining facts", async () => {
		sessions = [observedSession("a", "rev-1", [usageEvent(0, 3)])];
		const service = new UsageProjectionService(repository, inventory, {
			preserveDeletedSessions: true,
			now: () => now,
		});
		await service.synchronize();
		sessions = [];
		now = 250;
		const result = await service.synchronize();
		expect(result.deletedSessions).toBe(1);
		expect(repository.getCursor("a")?.deletedAt).toBe(250);
		expect(repository.countFacts()).toBe(1);
	});
});
