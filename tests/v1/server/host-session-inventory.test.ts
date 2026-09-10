import type { SessionEvent } from "@deepseek-ai/dsh-session";
import { describe, expect, it, vi } from "vitest";
import { DshSessionInventory, normalizePersistenceList } from "../../../src/server/host/session-inventory.js";

describe("DSH session inventory warnings", () => {
	it("reports a sanitized fallback warning and clears it after recovery", async () => {
		const warnings: Array<string | null> = [];
		const listSnapshots = vi
			.fn()
			.mockRejectedValueOnce(new Error("failed at /home/private/session-index.json"))
			.mockResolvedValueOnce([{ header: { id: "persisted" }, revision: "revision-2" }]);
		const inventory = new DshSessionInventory({
			sessions: undefined,
			persistence: {
				listSnapshots,
				list: async () => [{ id: "persisted" }],
				readFrom: async () => ({ events: [] }),
			},
			onWarning: (warning) => warnings.push(warning),
		});

		expect(await inventory.observeSessions()).toMatchObject([{ id: "persisted", revision: null }]);
		expect(warnings[0]).toBe("session snapshot inventory is degraded; using compatibility listing");
		expect(warnings[0]).not.toContain("/home/private");
		expect(await inventory.observeSessions()).toMatchObject([{ id: "persisted", revision: "revision-2" }]);
		expect(warnings.at(-1)).toBeNull();
	});

	it("loads persisted events through the handle dialect (list snapshots + open/read)", async () => {
		const sampleEvents = [
			{ type: "custom", seq: 0, time: 1, data: {} },
			{ type: "custom", seq: 1, time: 2, data: {} },
		] as unknown as SessionEvent[];
		const close = vi.fn(async () => undefined);
		const read = vi.fn(async (offset = 0) => ({
			events: sampleEvents.slice(offset),
		}));
		const open = vi.fn(async (id: string, access: "read" | "write") => {
			expect(id).toBe("handle-session");
			expect(access).toBe("read");
			return { read, close };
		});
		const inventory = new DshSessionInventory({
			sessions: undefined,
			persistence: {
				list: async () => [{ header: { id: "handle-session" }, revision: "rev-handle-1" }],
				open,
			},
		});

		const observed = await inventory.observeSessions();
		expect(observed).toMatchObject([{ id: "handle-session", kind: "persisted", revision: "rev-handle-1" }]);
		expect(open).not.toHaveBeenCalled();

		const session = observed[0];
		expect(session).toBeDefined();
		if (session === undefined) throw new Error("expected persisted session");
		const events = await session.loadEvents(1);
		expect(open).toHaveBeenCalledOnce();
		expect(read).toHaveBeenCalledWith(1);
		expect(close).toHaveBeenCalledOnce();
		expect(events).toEqual([sampleEvents[1]]);
	});

	it("prefers readFrom when both dialects are present", async () => {
		const sampleEvents = [{ type: "custom", seq: 0, time: 1, data: {} }] as unknown as SessionEvent[];
		const readFrom = vi.fn(async () => ({ events: sampleEvents }));
		const open = vi.fn(async () => ({
			read: async () => ({ events: [] as SessionEvent[] }),
			close: async () => undefined,
		}));
		const inventory = new DshSessionInventory({
			sessions: undefined,
			persistence: {
				list: async () => [{ id: "legacy" }],
				readFrom,
				open,
			},
		});
		const [session] = await inventory.observeSessions();
		expect(session).toBeDefined();
		if (session === undefined) throw new Error("expected legacy session");
		await session.loadEvents(0);
		expect(readFrom).toHaveBeenCalledWith("legacy", 0);
		expect(open).not.toHaveBeenCalled();
	});

	it("normalizes bare headers and snapshots from list()", () => {
		expect(normalizePersistenceList([{ id: "bare" }, { header: { id: "snap" }, revision: "r1" }])).toEqual([
			{ header: { id: "bare" }, revision: "" },
			{ header: { id: "snap" }, revision: "r1" },
		]);
	});
});
