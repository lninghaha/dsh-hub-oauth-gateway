import type { SessionEvent } from "@deepseek-ai/dsh-session";
import { type UsageBuckets, UsageBucketsSchema } from "../../shared/domain.js";

export type SessionSourceKind = "live" | "persisted" | "legacy";

export interface SessionProjectionCursor {
	readonly sessionId: string;
	readonly sourceKind: SessionSourceKind;
	readonly sourceRevision: string | null;
	readonly nextSeq: number;
	readonly currentProvider: string | null;
	readonly currentModel: string | null;
	readonly lastSeenAt: number;
	readonly deletedAt: number | null;
}

export interface UsageFact extends UsageBuckets {
	readonly sessionId: string;
	readonly turn: number;
	readonly step: number;
	readonly eventSeq: number;
	readonly occurredAt: number;
	readonly providerId: string;
	readonly modelId: string;
}

export class UsageProjectionGapError extends Error {
	readonly expectedSeq: number;
	readonly actualSeq: number;

	constructor(expectedSeq: number, actualSeq: number) {
		super(`usage projection expected event seq ${expectedSeq}, received ${actualSeq}`);
		this.name = "UsageProjectionGapError";
		this.expectedSeq = expectedSeq;
		this.actualSeq = actualSeq;
	}
}

export function emptySessionCursor(
	sessionId: string,
	sourceKind: SessionSourceKind,
	sourceRevision: string | null,
	observedAt = Date.now(),
): SessionProjectionCursor {
	return {
		sessionId,
		sourceKind,
		sourceRevision,
		nextSeq: 0,
		currentProvider: null,
		currentModel: null,
		lastSeenAt: observedAt,
		deletedAt: null,
	};
}

function normalizedIdentity(value: unknown): string | null {
	return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function bucketsOf(usage: {
	readonly inputTokens: number;
	readonly outputTokens: number;
	readonly cacheReadTokens?: number;
	readonly cacheWriteTokens?: number;
}): UsageBuckets {
	return UsageBucketsSchema.parse({
		inputTokens: usage.inputTokens,
		outputTokens: usage.outputTokens,
		cacheReadTokens: usage.cacheReadTokens ?? 0,
		cacheWriteTokens: usage.cacheWriteTokens ?? 0,
	});
}

function requestIdentity(event: SessionEvent<"request/header">): { provider: string | null; model: string | null } {
	return {
		provider: normalizedIdentity(event.data.header.config.provider),
		model: normalizedIdentity(event.data.header.config.model),
	};
}

function sampleOf(
	event: SessionEvent,
	currentProvider: string | null,
	currentModel: string | null,
): Omit<UsageFact, "sessionId"> | null {
	if (event.type === "assistant/chunk" && event.data.chunk.type === "usage") {
		return {
			turn: event.data.turn,
			step: event.data.step,
			eventSeq: event.seq,
			occurredAt: event.time,
			providerId: currentProvider ?? "unknown",
			modelId: currentModel ?? "unknown",
			...bucketsOf(event.data.chunk.usage),
		};
	}
	if (event.type === "assistant/message" && event.data.usage !== undefined) {
		return {
			turn: event.data.turn,
			step: event.data.step,
			eventSeq: event.seq,
			occurredAt: event.time,
			providerId: normalizedIdentity(event.data.message.source.provider) ?? currentProvider ?? "unknown",
			modelId: normalizedIdentity(event.data.message.source.model) ?? currentModel ?? "unknown",
			...bucketsOf(event.data.usage),
		};
	}
	return null;
}

export interface ProjectUsageResult {
	readonly cursor: SessionProjectionCursor;
	readonly facts: readonly UsageFact[];
}

export function projectUsageEvents(
	cursor: SessionProjectionCursor,
	events: readonly SessionEvent[],
	sourceRevision = cursor.sourceRevision,
	observedAt = Date.now(),
): ProjectUsageResult {
	let expectedSeq = cursor.nextSeq;
	let currentProvider = cursor.currentProvider;
	let currentModel = cursor.currentModel;
	let lastSeenAt = Math.max(cursor.lastSeenAt, observedAt);
	const facts: UsageFact[] = [];

	for (const event of events) {
		if (event.seq !== expectedSeq) throw new UsageProjectionGapError(expectedSeq, event.seq);
		expectedSeq = event.seq + 1;
		lastSeenAt = Math.max(lastSeenAt, event.time);
		if (event.type === "request/header") {
			const identity = requestIdentity(event);
			currentProvider = identity.provider;
			currentModel = identity.model;
			continue;
		}
		const sample = sampleOf(event, currentProvider, currentModel);
		if (sample !== null) facts.push({ sessionId: cursor.sessionId, ...sample });
	}

	return {
		facts,
		cursor: {
			...cursor,
			sourceRevision,
			nextSeq: expectedSeq,
			currentProvider,
			currentModel,
			lastSeenAt,
			deletedAt: null,
		},
	};
}
