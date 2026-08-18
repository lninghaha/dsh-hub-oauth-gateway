/**
 * Cross-tool local usage parsers (token-monitor style). Each parser extracts
 * only timestamps, model ids, and token counters from a tool's local session
 * logs. Message text, prompts, tool payloads, and file paths are never read
 * into an event. A line that does not strictly match the known usage shape
 * is skipped, so vendor format drift degrades a parser to "no data" instead
 * of noisy errors.
 */

import { join } from "node:path";

export interface LocalUsageEvent {
	occurredAt: number;
	modelId: string;
	inputTokens: number;
	outputTokens: number;
	cacheReadTokens: number;
	cacheWriteTokens: number;
}

export interface LocalUsageParser {
	readonly toolId: string;
	readonly displayName: string;
	/** Candidate root directories, in probe order; the first existing one wins. */
	roots(options: { home: string; env: NodeJS.Dict<string> }): readonly string[];
	/** Parse one text chunk of newline-delimited JSON (or a single JSON doc). */
	parseChunk(text: string): readonly LocalUsageEvent[];
}

const MIN_TIMESTAMP = Date.UTC(2020, 0, 1);
const MAX_TOKEN_COUNT = 1_000_000_000;

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function tokenCount(value: unknown): number {
	if (typeof value !== "number" || !Number.isFinite(value)) return 0;
	const integer = Math.trunc(value);
	return integer >= 0 && integer <= MAX_TOKEN_COUNT ? integer : 0;
}

function timestampMs(value: unknown, now: number): number | undefined {
	if (typeof value === "string") {
		const parsed = Date.parse(value);
		if (Number.isFinite(parsed) && parsed >= MIN_TIMESTAMP && parsed <= now + 86_400_000) return parsed;
	}
	if (typeof value === "number" && Number.isFinite(value)) {
		const millis = value > 1e12 ? value : value * 1000;
		if (millis >= MIN_TIMESTAMP && millis <= now + 86_400_000) return Math.trunc(millis);
	}
	return undefined;
}

function modelId(value: unknown): string {
	if (typeof value !== "string") return "unknown";
	const trimmed = value.trim();
	return trimmed.length > 0 && trimmed.length <= 128 ? trimmed : "unknown";
}

interface UsageNumbers {
	inputTokens: number;
	outputTokens: number;
	cacheReadTokens: number;
	cacheWriteTokens: number;
}

function usageFrom(record: Record<string, unknown>): UsageNumbers {
	return {
		inputTokens: tokenCount(record.input_tokens ?? record.prompt_tokens ?? record.promptTokens),
		outputTokens: tokenCount(record.output_tokens ?? record.completion_tokens ?? record.completionTokens),
		cacheReadTokens: tokenCount(record.cache_read_input_tokens ?? record.cached_input_tokens ?? record.cacheRead),
		cacheWriteTokens: tokenCount(record.cache_creation_input_tokens ?? record.cache_write_input_tokens),
	};
}

function hasAnyToken(usage: UsageNumbers): boolean {
	return usage.inputTokens + usage.outputTokens + usage.cacheReadTokens + usage.cacheWriteTokens > 0;
}

function* lines(text: string): Generator<unknown> {
	for (const line of text.split("\n")) {
		const trimmed = line.trim();
		if (trimmed === "" || trimmed === "]" || trimmed === "[") continue;
		try {
			yield JSON.parse(trimmed) as unknown;
		} catch {
			// Partial tail line or non-JSON content: skip silently.
		}
	}
}

/** Claude Code transcripts: `~/.claude/projects/<project>/<session>.jsonl`. */
function parseClaudeChunk(text: string, now: number): LocalUsageEvent[] {
	const events: LocalUsageEvent[] = [];
	for (const value of lines(text)) {
		if (!isRecord(value) || value.type !== "assistant") continue;
		const message = value.message;
		if (!isRecord(message) || !isRecord(message.usage)) continue;
		const usage = usageFrom(message.usage);
		if (!hasAnyToken(usage)) continue;
		const occurredAt = timestampMs(value.timestamp, now);
		if (occurredAt === undefined) continue;
		events.push({ occurredAt, modelId: modelId(message.model), ...usage });
	}
	return events;
}

/** Codex CLI rollouts: `~/.codex/sessions/<date>/rollout-*.jsonl`. */
function parseCodexChunk(text: string, now: number): LocalUsageEvent[] {
	const events: LocalUsageEvent[] = [];
	let currentModel = "unknown";
	for (const value of lines(text)) {
		if (!isRecord(value)) continue;
		const payload = value.payload;
		if (value.type === "turn_context" && isRecord(payload)) {
			currentModel = modelId(payload.model);
			continue;
		}
		if (value.type !== "event_msg" || !isRecord(payload) || payload.type !== "token_count") continue;
		const info = payload.info;
		if (!isRecord(info)) continue;
		const last = isRecord(info.last_token_usage) ? info.last_token_usage : undefined;
		if (last === undefined) continue;
		const usage = usageFrom(last);
		if (!hasAnyToken(usage)) continue;
		const occurredAt = timestampMs(value.timestamp, now);
		if (occurredAt === undefined) continue;
		events.push({ occurredAt, modelId: currentModel, ...usage });
	}
	return events;
}

/**
 * Defensive JSONL usage extraction for tools without a published transcript
 * contract (Kimi Code sessions, OpenCode storage exports): accept any record
 * carrying a strict usage object next to a timestamp.
 */
function parseGenericChunk(text: string, now: number): LocalUsageEvent[] {
	const events: LocalUsageEvent[] = [];
	for (const value of lines(text)) {
		if (!isRecord(value)) continue;
		const usageValue = isRecord(value.usage) ? value.usage : isRecord(value.tokens) ? value.tokens : undefined;
		if (usageValue === undefined) continue;
		const usage = usageFrom(usageValue);
		if (!hasAnyToken(usage)) continue;
		const occurredAt =
			timestampMs(value.timestamp, now) ??
			timestampMs(value.created_at, now) ??
			timestampMs(value.createdAt, now) ??
			timestampMs(value.time, now);
		if (occurredAt === undefined) continue;
		events.push({ occurredAt, modelId: modelId(value.model ?? value.modelID), ...usage });
	}
	return events;
}

function nonEmpty(value: string | undefined): string | undefined {
	return value !== undefined && value.trim() !== "" ? value : undefined;
}

export const LOCAL_USAGE_PARSERS: readonly LocalUsageParser[] = Object.freeze([
	{
		toolId: "claude-code",
		displayName: "Claude Code",
		roots: ({ home, env }) => {
			const override = nonEmpty(env.CLAUDE_CONFIG_DIR);
			return [override !== undefined ? join(override, "projects") : join(home, ".claude", "projects")];
		},
		parseChunk: (text) => parseClaudeChunk(text, Date.now()),
	},
	{
		toolId: "codex-cli",
		displayName: "Codex CLI",
		roots: ({ home, env }) => {
			const override = nonEmpty(env.CODEX_HOME);
			return [override !== undefined ? join(override, "sessions") : join(home, ".codex", "sessions")];
		},
		parseChunk: (text) => parseCodexChunk(text, Date.now()),
	},
	{
		toolId: "kimi-code",
		displayName: "Kimi Code",
		roots: ({ home, env }) => {
			const override = nonEmpty(env.KIMI_SHARE_DIR);
			const base = override ?? join(home, ".kimi");
			return [join(base, "sessions"), join(home, ".kimi-code", "sessions")];
		},
		parseChunk: (text) => parseGenericChunk(text, Date.now()),
	},
	{
		toolId: "opencode",
		displayName: "OpenCode",
		roots: ({ home, env }) => {
			const override = nonEmpty(env.XDG_DATA_HOME);
			const base = override ?? join(home, ".local", "share");
			return [join(base, "opencode", "storage")];
		},
		parseChunk: (text) => parseGenericChunk(text, Date.now()),
	},
]);

export function localUsageParser(toolId: string): LocalUsageParser | undefined {
	return LOCAL_USAGE_PARSERS.find((parser) => parser.toolId === toolId);
}
