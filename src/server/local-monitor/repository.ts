/**
 * SQLite persistence for the opt-in cross-tool usage scan. Cursors are keyed
 * by the SHA-256 of the file path so no absolute path is ever persisted;
 * per-file daily aggregates make full re-reads after log rotation exact
 * (the file's rows are replaced, never double counted).
 */

import { createHash } from "node:crypto";
import type { UsageDatabase } from "../storage/database.js";

export interface LocalUsageCursor {
	size: number;
	mtime: number;
	nextOffset: number;
}

export interface LocalUsageEventRow {
	occurredAt: number;
	modelId: string;
	inputTokens: number;
	outputTokens: number;
	cacheReadTokens: number;
	cacheWriteTokens: number;
}

export interface LocalUsageAggregateRow {
	day: string;
	toolId: string;
	modelId: string;
	inputTokens: number;
	outputTokens: number;
	cacheReadTokens: number;
	cacheWriteTokens: number;
	requests: number;
}

export function localUsageFileHash(path: string): string {
	return createHash("sha256").update(path, "utf8").digest("hex");
}

export function localUsageDay(occurredAt: number): string {
	return new Date(occurredAt).toISOString().slice(0, 10);
}

export class LocalUsageRepository {
	constructor(private readonly database: UsageDatabase) {}

	cursor(fileHash: string): LocalUsageCursor | null {
		const row = this.database
			.prepare("SELECT size, mtime, next_offset AS nextOffset FROM local_usage_files WHERE file_hash = ?")
			.get(fileHash) as LocalUsageCursor | undefined;
		return row ?? null;
	}

	/** Replace a file's contribution and cursor (rotation or first full read). */
	replaceFile(
		fileHash: string,
		toolId: string,
		size: number,
		mtime: number,
		nextOffset: number,
		scannedAt: number,
		events: readonly LocalUsageEventRow[],
	): void {
		this.database.transaction(() => {
			this.database.prepare("DELETE FROM local_usage_file_days WHERE file_hash = ?").run(fileHash);
			this.database
				.prepare(
					`INSERT INTO local_usage_files (file_hash, tool_id, size, mtime, next_offset, scanned_at)
					 VALUES (?, ?, ?, ?, ?, ?)
					 ON CONFLICT(file_hash) DO UPDATE SET
						tool_id = excluded.tool_id,
						size = excluded.size,
						mtime = excluded.mtime,
						next_offset = excluded.next_offset,
						scanned_at = excluded.scanned_at`,
				)
				.run(fileHash, toolId, size, mtime, nextOffset, scannedAt);
			this.insertEvents(fileHash, events);
		});
	}

	/** Append newly parsed events and advance the cursor (appended content). */
	appendFile(
		fileHash: string,
		toolId: string,
		size: number,
		mtime: number,
		nextOffset: number,
		scannedAt: number,
		events: readonly LocalUsageEventRow[],
	): void {
		this.database.transaction(() => {
			this.database
				.prepare(
					`UPDATE local_usage_files
					 SET tool_id = ?, size = ?, mtime = ?, next_offset = ?, scanned_at = ?
					 WHERE file_hash = ?`,
				)
				.run(toolId, size, mtime, nextOffset, scannedAt, fileHash);
			this.insertEvents(fileHash, events);
		});
	}

	private insertEvents(fileHash: string, events: readonly LocalUsageEventRow[]): void {
		if (events.length === 0) return;
		const statement = this.database.prepare(
			`INSERT INTO local_usage_file_days
				(file_hash, model_id, day, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, requests)
			 VALUES (?, ?, ?, ?, ?, ?, ?, 1)
			 ON CONFLICT(file_hash, model_id, day) DO UPDATE SET
				input_tokens = input_tokens + excluded.input_tokens,
				output_tokens = output_tokens + excluded.output_tokens,
				cache_read_tokens = cache_read_tokens + excluded.cache_read_tokens,
				cache_write_tokens = cache_write_tokens + excluded.cache_write_tokens,
				requests = requests + 1`,
		);
		for (const event of events) {
			statement.run(
				fileHash,
				event.modelId,
				localUsageDay(event.occurredAt),
				event.inputTokens,
				event.outputTokens,
				event.cacheReadTokens,
				event.cacheWriteTokens,
			);
		}
	}

	/** Aggregate every file's contribution grouped by day, tool, and model. */
	aggregate(fromDay: string, toDay: string): LocalUsageAggregateRow[] {
		return this.database
			.prepare(
				`SELECT
					days.day AS day,
					files.tool_id AS toolId,
					days.model_id AS modelId,
					SUM(days.input_tokens) AS inputTokens,
					SUM(days.output_tokens) AS outputTokens,
					SUM(days.cache_read_tokens) AS cacheReadTokens,
					SUM(days.cache_write_tokens) AS cacheWriteTokens,
					SUM(days.requests) AS requests
				FROM local_usage_file_days days
				JOIN local_usage_files files ON files.file_hash = days.file_hash
				WHERE days.day >= ? AND days.day <= ?
				GROUP BY days.day, files.tool_id, days.model_id
				ORDER BY days.day, files.tool_id, days.model_id`,
			)
			.all(fromDay, toDay) as unknown as LocalUsageAggregateRow[];
	}

	stats(): { files: number; lastScanAt: number | null } {
		const row = this.database
			.prepare("SELECT COUNT(*) AS files, MAX(scanned_at) AS lastScanAt FROM local_usage_files")
			.get() as { files: number; lastScanAt: number | null };
		return { files: row.files, lastScanAt: row.lastScanAt };
	}

	/** Drop files not re-seen since `beforeMs` and rows older than `fromDay`. */
	prune(fromDay: string, beforeMs: number): void {
		this.database.transaction(() => {
			this.database.prepare("DELETE FROM local_usage_file_days WHERE day < ?").run(fromDay);
			this.database.prepare("DELETE FROM local_usage_files WHERE scanned_at < ?").run(beforeMs);
		});
	}
}
