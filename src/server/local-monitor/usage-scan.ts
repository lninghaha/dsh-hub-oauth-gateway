/**
 * Incremental, budget-capped scanner for cross-tool local usage logs.
 * Reads are hardened (lstat + O_NOFOLLOW + fstat identity, owner-only,
 * regular files, per-file and per-run byte budgets); only token counters,
 * model ids, and timestamps reach the repository. Scanning runs from the
 * background scheduler or an explicit mutation — never on page loads.
 */

import { constants, type Dirent } from "node:fs";
import { lstat, open, readdir } from "node:fs/promises";
import { join } from "node:path";
import { LOCAL_USAGE_PARSERS, type LocalUsageParser } from "./parsers.js";
import { type LocalUsageEventRow, type LocalUsageRepository, localUsageFileHash } from "./repository.js";

export interface LocalUsageScanOptions {
	home: string;
	env: NodeJS.Dict<string>;
	now?: () => number;
	maxFileBytes: number;
	maxTotalBytes: number;
	maxFiles?: number;
	maxDepth?: number;
}

export interface LocalUsageScanResult {
	scannedAt: number;
	files: number;
	events: number;
	skipped: number;
}

export interface LocalUsageScanLogger {
	warn(message: string): void;
}

const DEFAULT_MAX_FILES = 2_000;
const DEFAULT_MAX_DEPTH = 6;
const LOG_EXTENSIONS = new Set([".jsonl", ".json", ".ndjson"]);

async function listLogFiles(root: string, maxDepth: number, budget: { files: number }): Promise<string[]> {
	const found: string[] = [];
	const walk = async (directory: string, depth: number): Promise<void> => {
		if (depth > maxDepth || budget.files <= 0) return;
		let entries: Dirent[];
		try {
			entries = await readdir(directory, { withFileTypes: true });
		} catch {
			return;
		}
		for (const entry of entries) {
			if (budget.files <= 0) return;
			if (entry.isSymbolicLink()) continue;
			const path = join(directory, entry.name);
			if (entry.isDirectory()) {
				await walk(path, depth + 1);
				continue;
			}
			if (!entry.isFile()) continue;
			const dot = entry.name.lastIndexOf(".");
			if (dot < 0 || !LOG_EXTENSIONS.has(entry.name.slice(dot).toLowerCase())) continue;
			found.push(path);
			budget.files -= 1;
		}
	};
	await walk(root, 0);
	return found;
}

interface HardenedLogRead {
	text: string;
	size: number;
	mtime: number;
	/** The requested offset lay beyond the current size: the file was rotated. */
	rotated: boolean;
}

/** lstat → O_NOFOLLOW open → fstat. Owner-only regular files within budget. */
async function readHardenedLog(path: string, fromOffset: number, maxBytes: number): Promise<HardenedLogRead | null> {
	const listed = await lstat(path).catch(() => null);
	if (listed === null || !listed.isFile() || listed.isSymbolicLink()) return null;
	const flags = process.platform === "win32" ? "r" : constants.O_RDONLY | constants.O_NOFOLLOW;
	let handle: Awaited<ReturnType<typeof open>> | undefined;
	try {
		handle = await open(path, flags);
	} catch {
		return null;
	}
	try {
		const opened = await handle.stat();
		if (!opened.isFile()) return null;
		if (typeof process.getuid === "function" && opened.uid !== process.getuid()) return null;
		if (opened.dev !== listed.dev || opened.ino !== listed.ino) return null;
		const size = opened.size;
		const mtime = Math.max(0, Math.round(opened.mtimeMs));
		if (fromOffset > size) return { text: "", size, mtime, rotated: true };
		const start = Math.max(0, fromOffset);
		const length = Math.max(0, Math.min(size - start, maxBytes));
		if (length === 0) return { text: "", size, mtime, rotated: false };
		const buffer = Buffer.alloc(length);
		await handle.read(buffer, 0, length, start);
		return { text: buffer.toString("utf8"), size, mtime, rotated: false };
	} finally {
		await handle.close().catch(() => undefined);
	}
}

/** Split a chunk into complete lines; the offset never passes a partial tail. */
function completeChunk(text: string): { complete: string; consumed: number } {
	const lastNewline = text.lastIndexOf("\n");
	if (lastNewline < 0) return { complete: "", consumed: 0 };
	return { complete: text.slice(0, lastNewline + 1), consumed: lastNewline + 1 };
}

export class LocalUsageScanner {
	private readonly now: () => number;

	constructor(
		private readonly repository: LocalUsageRepository,
		private readonly options: LocalUsageScanOptions,
		private readonly logger?: LocalUsageScanLogger,
	) {
		this.now = options.now ?? Date.now;
	}

	async scan(parsers: readonly LocalUsageParser[] = LOCAL_USAGE_PARSERS): Promise<LocalUsageScanResult> {
		const scannedAt = this.now();
		let files = 0;
		let events = 0;
		let skipped = 0;
		let totalBytes = 0;
		for (const parser of parsers) {
			for (const root of parser.roots({ home: this.options.home, env: this.options.env })) {
				const budget = { files: this.options.maxFiles ?? DEFAULT_MAX_FILES };
				const paths = await listLogFiles(root, this.options.maxDepth ?? DEFAULT_MAX_DEPTH, budget);
				for (const path of paths) {
					if (totalBytes >= this.options.maxTotalBytes) {
						skipped += 1;
						continue;
					}
					const outcome = await this.scanFile(parser, path, this.options.maxTotalBytes - totalBytes);
					if (outcome === null) {
						skipped += 1;
						continue;
					}
					files += 1;
					events += outcome.events;
					totalBytes += outcome.bytes;
				}
			}
		}
		return { scannedAt, files, events, skipped };
	}

	private async scanFile(
		parser: LocalUsageParser,
		path: string,
		remainingBudget: number,
	): Promise<{ events: number; bytes: number } | null> {
		const fileHash = localUsageFileHash(path);
		const cursor = this.repository.cursor(fileHash);
		const fromOffset = cursor === null ? 0 : cursor.nextOffset;
		const read = await readHardenedLog(path, fromOffset, Math.min(this.options.maxFileBytes, remainingBudget));
		if (read === null) return null;
		if (read.rotated) {
			// Rotated or replaced log: drop the file's old contribution and re-read.
			const fresh = await readHardenedLog(path, 0, Math.min(this.options.maxFileBytes, remainingBudget));
			if (fresh === null) return null;
			return this.persist(parser, fileHash, path, fresh, 0, true);
		}
		if (cursor !== null && cursor.mtime === read.mtime && cursor.size === read.size) {
			return { events: 0, bytes: 0 };
		}
		return this.persist(parser, fileHash, path, read, fromOffset, cursor === null);
	}

	private persist(
		parser: LocalUsageParser,
		fileHash: string,
		_path: string,
		read: HardenedLogRead,
		fromOffset: number,
		replace: boolean,
	): { events: number; bytes: number } {
		const { complete, consumed } = completeChunk(read.text);
		const nextOffset = fromOffset + consumed;
		const events: LocalUsageEventRow[] = parser.parseChunk(complete).map((event) => ({
			occurredAt: event.occurredAt,
			modelId: event.modelId,
			inputTokens: event.inputTokens,
			outputTokens: event.outputTokens,
			cacheReadTokens: event.cacheReadTokens,
			cacheWriteTokens: event.cacheWriteTokens,
		}));
		const scannedAt = this.now();
		try {
			if (replace) {
				this.repository.replaceFile(fileHash, parser.toolId, read.size, read.mtime, nextOffset, scannedAt, events);
			} else {
				this.repository.appendFile(fileHash, parser.toolId, read.size, read.mtime, nextOffset, scannedAt, events);
			}
		} catch {
			this.logger?.warn("usage-stats: local usage scan could not persist a file contribution (details redacted)");
			return { events: 0, bytes: consumed };
		}
		return { events: events.length, bytes: consumed };
	}
}
