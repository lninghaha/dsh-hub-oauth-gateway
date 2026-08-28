/**
 * Client helper for Codex Fast session UX. Documents that the session model
 * picker uses the existing `codex-oauth-fast` route when Fast is requested —
 * not a second Fast stack.
 */

/** Distinct Harness route published when Codex Fast is enabled and the live catalog lists priority models. */
export const CODEX_FAST_SESSION_ROUTE = "codex-oauth-fast" as const;

/** Ordinary Codex OAuth inference route (Standard). */
export const CODEX_STANDARD_SESSION_ROUTE = "codex-oauth" as const;

export type CodexSpeedHint = "hidden" | "standard-only" | "standard-and-fast";

/**
 * Derive which Speed hint to show. `hasPriorityModels` is true only when a
 * live (non-stale) catalog has listed at least one priority-eligible model.
 */
export function codexSpeedHint(codexFastEnabled: boolean, hasPriorityModels: boolean): CodexSpeedHint {
	if (!codexFastEnabled) return "hidden";
	return hasPriorityModels ? "standard-and-fast" : "standard-only";
}

/** Route id the session model picker should use for the requested speed. */
export function codexSessionRouteForSpeed(speed: "standard" | "fast"): string {
	return speed === "fast" ? CODEX_FAST_SESSION_ROUTE : CODEX_STANDARD_SESSION_ROUTE;
}
