/**
 * Hard allowlist of public Statuspage `/api/v2/status.json` endpoints.
 * Only these HTTPS origins may be probed; operators cannot add arbitrary URLs.
 */

export interface StatusProbeTarget {
	readonly id: string;
	readonly label: string;
	readonly pageUrl: string;
	readonly apiUrl: string;
}

/** Public vendor status pages with unauthenticated Statuspage JSON. */
export const STATUS_PROBE_TARGETS: readonly StatusProbeTarget[] = Object.freeze([
	Object.freeze({
		id: "openai",
		label: "OpenAI",
		pageUrl: "https://status.openai.com/",
		apiUrl: "https://status.openai.com/api/v2/status.json",
	}),
	Object.freeze({
		id: "claude",
		label: "Claude",
		pageUrl: "https://status.claude.com/",
		apiUrl: "https://status.claude.com/api/v2/status.json",
	}),
	Object.freeze({
		id: "cursor",
		label: "Cursor",
		pageUrl: "https://status.cursor.com/",
		apiUrl: "https://status.cursor.com/api/v2/status.json",
	}),
]);
