/**
 * Cross-tool local usage parsers (token-monitor style). Each parser extracts
 * only timestamps, model ids, and token counters from a tool's local session
 * logs. Message text, prompts, tool payloads, and file paths are never read
 * into an event. A line that does not strictly match the known usage shape
 * is skipped, so vendor format drift degrades a parser to "no data" instead
 * of noisy errors.
 */
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
    roots(options: {
        home: string;
        env: NodeJS.Dict<string>;
    }): readonly string[];
    /** Parse one text chunk of newline-delimited JSON (or a single JSON doc). */
    parseChunk(text: string): readonly LocalUsageEvent[];
}
export declare const LOCAL_USAGE_PARSERS: readonly LocalUsageParser[];
export declare function localUsageParser(toolId: string): LocalUsageParser | undefined;
//# sourceMappingURL=parsers.d.ts.map