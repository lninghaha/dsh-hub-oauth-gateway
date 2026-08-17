import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { migrateLegacyPreferences, migrateLegacyUsageCache } from "../../../src/server/migration.js";
import { PreferencesRepository } from "../../../src/server/settings/repository.js";
import { UsageDatabase } from "../../../src/server/storage/database.js";
import { emptySessionCursor } from "../../../src/server/usage/projector.js";
import { UsageRepository } from "../../../src/server/usage/repository.js";

describe("legacy data migration", () => {
	let database: UsageDatabase;
	let home: string;

	beforeEach(async () => {
		database = await UsageDatabase.open(":memory:");
		home = await mkdtemp(join(process.cwd(), "output", "migration-test-"));
		await mkdir(join(home, "storages"), { recursive: true });
	});

	afterEach(async () => {
		database.close();
		await rm(home, { recursive: true, force: true });
	});

	it("maps legacy display preferences into the versioned preference model", async () => {
		await writeFile(
			join(home, "storages", "usage-stats-prefs.json"),
			JSON.stringify({ version: 1, hiddenProviders: ["provider-a"], density: "compact", historyMode: "daily" }),
		);
		const repository = new PreferencesRepository(database);
		await migrateLegacyPreferences(database, repository, { warn: () => undefined }, { DSH_HOME: home });
		expect(repository.load()).toMatchObject({
			display: { density: "compact", defaultRange: "7d" },
			providers: { hidden: ["provider-a"] },
		});
	});

	it("imports only vanished legacy sessions after current sessions were projected", async () => {
		const usage = new UsageRepository(database);
		usage.applyProjection({
			cursor: emptySessionCursor("current", "persisted", "rev", 100),
			facts: [],
		});
		const session = (tokens: number) => ({
			kind: "persisted",
			consumed: 1,
			days: {
				"2025-01-02": {
					totals: { inputTokens: tokens, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 },
					models: {
						"model-a": { inputTokens: tokens, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 },
					},
				},
			},
		});
		await writeFile(
			join(home, "storages", "usage-stats-cache.json"),
			JSON.stringify({ version: 3, sessions: { current: session(10), vanished: session(7) } }),
		);
		const first = await migrateLegacyUsageCache(database, usage, { warn: () => undefined }, { DSH_HOME: home });
		expect(first).toMatchObject({ terminal: true, status: "imported", importedSessions: 1 });
		expect(usage.getCursor("current")?.sourceKind).toBe("persisted");
		expect(usage.getCursor("vanished")?.sourceKind).toBe("legacy");
		expect(usage.sumFacts({ from: 0, to: Date.parse("2026-01-01") }).inputTokens).toBe(7);
		const second = await migrateLegacyUsageCache(database, usage, { warn: () => undefined }, { DSH_HOME: home });
		expect(second).toMatchObject({ terminal: true, status: "imported" });
	});

	it("retries a failed usage migration instead of permanently skipping it", async () => {
		const usage = new UsageRepository(database);
		await writeFile(
			join(home, "storages", "usage-stats-cache.json"),
			JSON.stringify({
				version: 3,
				sessions: {
					retry: {
						days: {
							"2025-01-02": {
								totals: { inputTokens: 3, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 },
							},
						},
					},
				},
			}),
		);
		vi.spyOn(usage, "applyProjections").mockImplementationOnce(() => {
			throw new Error("simulated database failure");
		});
		const failed = await migrateLegacyUsageCache(database, usage, { warn: () => undefined }, { DSH_HOME: home });
		expect(failed).toEqual({ terminal: false, status: "failed" });
		expect(usage.getCursor("retry")).toBeNull();
		const recovered = await migrateLegacyUsageCache(database, usage, { warn: () => undefined }, { DSH_HOME: home });
		expect(recovered).toMatchObject({ terminal: true, status: "imported" });
		expect(usage.getCursor("retry")?.sourceKind).toBe("legacy");
	});
});
