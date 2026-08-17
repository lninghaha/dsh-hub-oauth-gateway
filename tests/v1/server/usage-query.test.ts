import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { PricingRepository } from "../../../src/server/pricing/repository.js";
import { UsageDatabase } from "../../../src/server/storage/database.js";
import { emptySessionCursor } from "../../../src/server/usage/projector.js";
import { UsageQueryService } from "../../../src/server/usage/query.js";
import { UsageRepository } from "../../../src/server/usage/repository.js";
import { bucketKey, bucketTimestamp } from "../../../src/server/usage/time.js";
import type { UsageQuery } from "../../../src/shared/domain.js";

const from = Date.parse("2024-03-09T00:00:00Z");
const to = Date.parse("2024-03-12T00:00:00Z");

function query(overrides: Partial<UsageQuery> = {}): UsageQuery {
	return {
		from,
		to,
		timeZone: "America/New_York",
		granularity: "day",
		metric: "tokens",
		groupBy: "provider",
		providers: [],
		models: [],
		compare: true,
		...overrides,
	};
}

describe("usage query and timezone buckets", () => {
	let database: UsageDatabase;
	let usage: UsageRepository;
	let pricing: PricingRepository;
	let service: UsageQueryService;

	beforeEach(async () => {
		database = await UsageDatabase.open(":memory:");
		usage = new UsageRepository(database);
		pricing = new PricingRepository(database);
		service = new UsageQueryService(usage, pricing, "USD");
		const cursor = emptySessionCursor("private-session", "persisted", "rev", to);
		usage.applyProjection({
			cursor: { ...cursor, nextSeq: 2 },
			facts: [
				{
					sessionId: "private-session",
					turn: 0,
					step: 0,
					eventSeq: 0,
					occurredAt: Date.parse("2024-03-10T06:30:00Z"),
					providerId: "provider-a",
					modelId: "model-a",
					inputTokens: 100,
					outputTokens: 20,
					cacheReadTokens: 80,
					cacheWriteTokens: 0,
				},
				{
					sessionId: "private-session",
					turn: 1,
					step: 0,
					eventSeq: 1,
					occurredAt: Date.parse("2024-03-10T08:30:00Z"),
					providerId: "provider-b",
					modelId: "model-b",
					inputTokens: 50,
					outputTokens: 10,
					cacheReadTokens: 0,
					cacheWriteTokens: 0,
				},
			],
		});
	});

	afterEach(() => database.close());

	it("resolves calendar buckets across a DST transition", () => {
		const eventTime = Date.parse("2024-03-10T08:30:00Z");
		expect(bucketKey(eventTime, "America/New_York", "day")).toBe("2024-03-10");
		expect(new Date(bucketTimestamp("2024-03-10", "America/New_York", "day")).toISOString()).toBe(
			"2024-03-10T05:00:00.000Z",
		);
	});

	it("produces a bounded linear forecast from multiple time buckets", () => {
		const cursor = usage.getCursor("private-session");
		expect(cursor).not.toBeNull();
		usage.applyProjection({
			cursor: { ...(cursor as NonNullable<typeof cursor>), nextSeq: 3 },
			facts: [
				{
					sessionId: "private-session",
					turn: 2,
					step: 0,
					eventSeq: 2,
					occurredAt: Date.parse("2024-03-11T08:30:00Z"),
					providerId: "provider-a",
					modelId: "model-a",
					inputTokens: 180,
					outputTokens: 20,
					cacheReadTokens: 0,
					cacheWriteTokens: 0,
				},
			],
		});
		const series = service.series(query({ groupBy: "none" }));
		expect(series.points).toHaveLength(2);
		expect(series.forecast).toHaveLength(7);
		expect(series.forecast[0]?.timestamp).toBeGreaterThan(series.points.at(-1)?.timestamp ?? 0);
		expect(series.forecast.every((point) => (point.values[0]?.value ?? -1) >= 0)).toBe(true);
	});

	it("builds overview, series and privacy-preserving breakdowns", () => {
		const overview = service.overview(query());
		expect(overview.current).toEqual({
			inputTokens: 150,
			outputTokens: 30,
			cacheReadTokens: 80,
			cacheWriteTokens: 0,
		});
		expect(overview.requests).toBe(2);
		expect(overview.cacheHitRate).toBeCloseTo(80 / 230);
		expect(overview.cost.amount).toBeNull();

		const series = service.series(query());
		expect(series.points).toHaveLength(1);
		expect(series.points[0]?.values.map(({ key }) => key).sort()).toEqual(["provider-a", "provider-b"]);

		const breakdown = service.breakdown(query(), "session", false);
		expect(breakdown.rows[0]?.key).toBe("session-1");
		expect(breakdown.rows[0]?.label).toBe("Session 1");
	});
});
