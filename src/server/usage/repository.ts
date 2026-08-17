import type { UsageBuckets } from "../../shared/domain.js";
import type { UsageDatabase } from "../storage/database.js";
import type { ProjectUsageResult, SessionProjectionCursor, SessionSourceKind, UsageFact } from "./projector.js";

interface CursorRow {
	session_id: string;
	source_kind: SessionSourceKind;
	source_revision: string | null;
	next_seq: number;
	current_provider: string | null;
	current_model: string | null;
	last_seen_at: number;
	deleted_at: number | null;
}

interface FactRow {
	session_id: string;
	turn: number;
	step: number;
	event_seq: number;
	occurred_at: number;
	provider_id: string;
	model_id: string;
	input_tokens: number;
	output_tokens: number;
	cache_read_tokens: number;
	cache_write_tokens: number;
}

function cursorFromRow(row: CursorRow): SessionProjectionCursor {
	return {
		sessionId: row.session_id,
		sourceKind: row.source_kind,
		sourceRevision: row.source_revision,
		nextSeq: row.next_seq,
		currentProvider: row.current_provider,
		currentModel: row.current_model,
		lastSeenAt: row.last_seen_at,
		deletedAt: row.deleted_at,
	};
}

function factFromRow(row: FactRow): UsageFact {
	return {
		sessionId: row.session_id,
		turn: row.turn,
		step: row.step,
		eventSeq: row.event_seq,
		occurredAt: row.occurred_at,
		providerId: row.provider_id,
		modelId: row.model_id,
		inputTokens: row.input_tokens,
		outputTokens: row.output_tokens,
		cacheReadTokens: row.cache_read_tokens,
		cacheWriteTokens: row.cache_write_tokens,
	};
}

export interface UsageFactFilter {
	readonly from: number;
	readonly to: number;
	readonly providers?: readonly string[];
	readonly models?: readonly string[];
}

export class UsageRepository {
	readonly #database: UsageDatabase;

	constructor(database: UsageDatabase) {
		this.#database = database;
	}

	getCursor(sessionId: string): SessionProjectionCursor | null {
		const row = this.#database
			.prepare(
				`SELECT session_id, source_kind, source_revision, next_seq, current_provider, current_model, last_seen_at, deleted_at
				 FROM session_cursors WHERE session_id = ?`,
			)
			.get(sessionId) as CursorRow | undefined;
		return row === undefined ? null : cursorFromRow(row);
	}

	listCursors(): SessionProjectionCursor[] {
		return (
			this.#database
				.prepare(
					`SELECT session_id, source_kind, source_revision, next_seq, current_provider, current_model, last_seen_at, deleted_at
					 FROM session_cursors ORDER BY session_id`,
				)
				.all() as unknown as CursorRow[]
		).map(cursorFromRow);
	}

	applyProjection(result: ProjectUsageResult, replaceSession = false): void {
		this.applyProjections([{ result, replaceSession }]);
	}

	applyProjections(items: readonly { readonly result: ProjectUsageResult; readonly replaceSession?: boolean }[]): void {
		this.#database.transaction(() => {
			const deleteFacts = this.#database.prepare("DELETE FROM usage_facts WHERE session_id = ?");
			const upsertFact = this.#database.prepare(`
				INSERT INTO usage_facts (
					session_id, turn, step, event_seq, occurred_at, provider_id, model_id,
					input_tokens, output_tokens, cache_read_tokens, cache_write_tokens
				) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
				ON CONFLICT(session_id, turn, step) DO UPDATE SET
					event_seq = excluded.event_seq,
					occurred_at = excluded.occurred_at,
					provider_id = excluded.provider_id,
					model_id = excluded.model_id,
					input_tokens = excluded.input_tokens,
					output_tokens = excluded.output_tokens,
					cache_read_tokens = excluded.cache_read_tokens,
					cache_write_tokens = excluded.cache_write_tokens
			`);
			for (const { result, replaceSession = false } of items) {
				if (replaceSession) deleteFacts.run(result.cursor.sessionId);
				for (const fact of result.facts) {
					upsertFact.run(
						fact.sessionId,
						fact.turn,
						fact.step,
						fact.eventSeq,
						fact.occurredAt,
						fact.providerId,
						fact.modelId,
						fact.inputTokens,
						fact.outputTokens,
						fact.cacheReadTokens,
						fact.cacheWriteTokens,
					);
				}
				this.saveCursor(result.cursor);
			}
		});
	}

	saveCursor(cursor: SessionProjectionCursor): void {
		this.#database
			.prepare(`
				INSERT INTO session_cursors (
					session_id, source_kind, source_revision, next_seq, current_provider, current_model, last_seen_at, deleted_at
				) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
				ON CONFLICT(session_id) DO UPDATE SET
					source_kind = excluded.source_kind,
					source_revision = excluded.source_revision,
					next_seq = excluded.next_seq,
					current_provider = excluded.current_provider,
					current_model = excluded.current_model,
					last_seen_at = excluded.last_seen_at,
					deleted_at = excluded.deleted_at
			`)
			.run(
				cursor.sessionId,
				cursor.sourceKind,
				cursor.sourceRevision,
				cursor.nextSeq,
				cursor.currentProvider,
				cursor.currentModel,
				cursor.lastSeenAt,
				cursor.deletedAt,
			);
	}

	markDeleted(sessionId: string, deletedAt = Date.now(), purgeFacts = false): void {
		this.#database.transaction(() => {
			this.#database
				.prepare("UPDATE session_cursors SET deleted_at = ? WHERE session_id = ?")
				.run(deletedAt, sessionId);
			if (purgeFacts) this.#database.prepare("DELETE FROM usage_facts WHERE session_id = ?").run(sessionId);
		});
	}

	deleteSession(sessionId: string): void {
		this.#database.transaction(() => {
			this.#database.prepare("DELETE FROM usage_facts WHERE session_id = ?").run(sessionId);
			this.#database.prepare("DELETE FROM session_cursors WHERE session_id = ?").run(sessionId);
		});
	}

	listFacts(filter: UsageFactFilter): UsageFact[] {
		const clauses = ["occurred_at >= ?", "occurred_at < ?"];
		const values: Array<string | number> = [filter.from, filter.to];
		if (filter.providers !== undefined && filter.providers.length > 0) {
			clauses.push(`provider_id IN (${filter.providers.map(() => "?").join(", ")})`);
			values.push(...filter.providers);
		}
		if (filter.models !== undefined && filter.models.length > 0) {
			clauses.push(`model_id IN (${filter.models.map(() => "?").join(", ")})`);
			values.push(...filter.models);
		}
		const rows = this.#database
			.prepare(
				`SELECT session_id, turn, step, event_seq, occurred_at, provider_id, model_id,
				 input_tokens, output_tokens, cache_read_tokens, cache_write_tokens
				 FROM usage_facts WHERE ${clauses.join(" AND ")} ORDER BY occurred_at, session_id, turn, step`,
			)
			.all(...values) as unknown as FactRow[];
		return rows.map(factFromRow);
	}

	pruneBefore(cutoff: number): number {
		const result = this.#database.prepare("DELETE FROM usage_facts WHERE occurred_at < ?").run(cutoff);
		return Number(result.changes);
	}

	countFacts(): number {
		const row = this.#database.prepare("SELECT COUNT(*) AS count FROM usage_facts").get() as { count: number };
		return row.count;
	}

	sumFacts(filter: UsageFactFilter): UsageBuckets & { requests: number } {
		const facts = this.listFacts(filter);
		return facts.reduce(
			(total, fact) => {
				total.inputTokens += fact.inputTokens;
				total.outputTokens += fact.outputTokens;
				total.cacheReadTokens += fact.cacheReadTokens;
				total.cacheWriteTokens += fact.cacheWriteTokens;
				total.requests += 1;
				return total;
			},
			{ inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, requests: 0 },
		);
	}
}
