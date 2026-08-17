import type { IncomingMessage, ServerResponse } from "node:http";

export const MAX_JSON_BODY_BYTES = 64 * 1024;

export function isLoopbackAddress(address: unknown): boolean {
	if (typeof address !== "string") return false;
	const normalized = address.toLowerCase();
	if (normalized === "::1") return true;
	const ipv4 = normalized.startsWith("::ffff:") ? normalized.slice(7) : normalized;
	const octets = ipv4.split(".");
	return (
		octets.length === 4 && octets[0] === "127" && octets.every((part) => /^\d{1,3}$/.test(part) && Number(part) <= 255)
	);
}

export function hostNameOf(value: unknown): string | null {
	if (typeof value !== "string") return null;
	const host = value.trim().toLowerCase();
	if (host.startsWith("[")) {
		const close = host.indexOf("]");
		if (close <= 1) return null;
		const suffix = host.slice(close + 1);
		if (suffix !== "" && !/^:\d+$/.test(suffix)) return null;
		return host.slice(1, close);
	}
	const firstColon = host.indexOf(":");
	const lastColon = host.lastIndexOf(":");
	if (firstColon !== lastColon) return host;
	if (lastColon === -1) return host.replace(/\.$/, "");
	if (!/^\d+$/.test(host.slice(lastColon + 1))) return null;
	return host.slice(0, lastColon).replace(/\.$/, "");
}

export function isLoopbackRequest(request: IncomingMessage): boolean {
	const host = hostNameOf(request.headers.host);
	return isLoopbackAddress(request.socket.remoteAddress) && (host === "localhost" || isLoopbackAddress(host));
}

type BrowserContextEvidenceKind = "absent" | "opaque" | "invalid" | "non-loopback" | "matching" | "mismatched";

type HttpProtocol = "http:" | "https:";

interface ParsedAuthority {
	readonly key: string;
	readonly loopback: boolean;
}

interface ForwardedBrowserContext {
	readonly authority: ParsedAuthority;
	readonly protocol: HttpProtocol;
}

interface BrowserContextEvidence {
	readonly kind: BrowserContextEvidenceKind;
	readonly present: boolean;
	readonly accepted: boolean;
	readonly matchesRequest: boolean;
	readonly matchesForwarded: boolean;
}

export type BrowserContextGuardReason =
	| "origin-opaque"
	| "origin-invalid"
	| "origin-non-loopback"
	| "origin-authority-mismatch"
	| "referer-opaque"
	| "referer-invalid"
	| "referer-non-loopback"
	| "referer-authority-mismatch"
	| "forwarded-authority-invalid"
	| "forwarded-proto-invalid"
	| "proxy-marker-missing"
	| "proxy-authority-missing"
	| "authority-invalid"
	| "authority-mismatch"
	| "cross-site-marker-missing"
	| "cross-site-corroboration-missing"
	| "browser-context-missing";

export interface BrowserContextGuardDecision {
	readonly accepted: boolean;
	readonly reason: BrowserContextGuardReason | null;
}

function normalizeHostname(value: string): string | null {
	const normalized = value.toLowerCase();
	const unwrapped = normalized.startsWith("[") && normalized.endsWith("]") ? normalized.slice(1, -1) : normalized;
	const hostname = unwrapped.replace(/\.$/u, "");
	return hostname === "" ? null : hostname;
}

function normalizeLoopbackHostname(value: string): string | null {
	const hostname = normalizeHostname(value);
	if (hostname === "localhost") return hostname;
	return hostname !== null && isLoopbackAddress(hostname) ? hostname : null;
}

function parseAuthority(value: unknown, protocol: HttpProtocol = "http:"): ParsedAuthority | null {
	if (typeof value !== "string" || value.trim() === "" || value.includes(",")) return null;
	try {
		const parsed = new URL(`${protocol}//${value.trim()}`);
		if (
			parsed.username !== "" ||
			parsed.password !== "" ||
			parsed.pathname !== "/" ||
			parsed.search !== "" ||
			parsed.hash !== ""
		)
			return null;
		const hostname = normalizeHostname(parsed.hostname);
		if (hostname === null) return null;
		return {
			key: `${hostname}\u0000${parsed.port}`,
			loopback: normalizeLoopbackHostname(hostname) !== null,
		};
	} catch {
		return null;
	}
}

function requestAuthority(value: unknown): string | null {
	const parsed = parseAuthority(value);
	return parsed?.loopback === true ? parsed.key : null;
}

function forwardedBrowserContext(request: IncomingMessage): {
	readonly context: ForwardedBrowserContext | null;
	readonly reason: BrowserContextGuardReason | null;
} {
	const forwardedHost = request.headers["x-forwarded-host"];
	const forwardedProto = request.headers["x-forwarded-proto"];
	if (forwardedHost === undefined) {
		return forwardedProto === undefined
			? { context: null, reason: null }
			: { context: null, reason: "forwarded-proto-invalid" };
	}
	if (typeof forwardedProto !== "string" || forwardedProto.includes(",")) {
		return { context: null, reason: "forwarded-proto-invalid" };
	}
	const normalized = forwardedProto.trim().toLowerCase();
	if (normalized !== "http" && normalized !== "https") {
		return { context: null, reason: "forwarded-proto-invalid" };
	}
	const protocol: HttpProtocol = `${normalized}:`;
	const authority = parseAuthority(forwardedHost, protocol);
	if (authority === null) return { context: null, reason: "forwarded-authority-invalid" };
	return { context: { authority, protocol }, reason: null };
}

function browserContextEvidence(
	value: unknown,
	authority: string | null,
	forwarded: ForwardedBrowserContext | null,
): BrowserContextEvidence {
	if (value === undefined || value === "") {
		return {
			kind: "absent",
			present: false,
			accepted: true,
			matchesRequest: false,
			matchesForwarded: false,
		};
	}
	if (value === "null") {
		return { kind: "opaque", present: true, accepted: false, matchesRequest: false, matchesForwarded: false };
	}
	if (typeof value !== "string") {
		return { kind: "invalid", present: true, accepted: false, matchesRequest: false, matchesForwarded: false };
	}
	try {
		const parsed = new URL(value);
		if (
			(parsed.protocol !== "http:" && parsed.protocol !== "https:") ||
			parsed.username !== "" ||
			parsed.password !== ""
		)
			return { kind: "invalid", present: true, accepted: false, matchesRequest: false, matchesForwarded: false };
		const parsedAuthority = parseAuthority(parsed.host, parsed.protocol);
		if (parsedAuthority === null) {
			return { kind: "invalid", present: true, accepted: false, matchesRequest: false, matchesForwarded: false };
		}
		const matchesRequest = authority !== null && authority === parsedAuthority.key;
		const matchesForwarded =
			forwarded !== null && forwarded.authority.key === parsedAuthority.key && forwarded.protocol === parsed.protocol;
		const accepted = matchesRequest || matchesForwarded;
		return {
			kind: accepted ? "matching" : parsedAuthority.loopback ? "mismatched" : "non-loopback",
			present: true,
			accepted,
			matchesRequest,
			matchesForwarded,
		};
	} catch {
		return { kind: "invalid", present: true, accepted: false, matchesRequest: false, matchesForwarded: false };
	}
}

function browserContextReason(
	name: "origin" | "referer",
	evidence: BrowserContextEvidence,
): BrowserContextGuardReason | null {
	if (evidence.kind === "opaque") return `${name}-opaque`;
	if (evidence.kind === "invalid") return `${name}-invalid`;
	if (evidence.kind === "non-loopback") return `${name}-non-loopback`;
	if (evidence.kind === "mismatched") return `${name}-authority-mismatch`;
	return null;
}

export function browserContextGuardDecision(request: IncomingMessage): BrowserContextGuardDecision {
	const authority = requestAuthority(request.headers.host);
	const forwardedResult = forwardedBrowserContext(request);
	if (forwardedResult.reason !== null) return { accepted: false, reason: forwardedResult.reason };
	const forwarded = forwardedResult.context;
	if (forwarded !== null && (authority === null || !isLoopbackAddress(request.socket.remoteAddress))) {
		return { accepted: false, reason: "forwarded-authority-invalid" };
	}
	const origin = browserContextEvidence(request.headers.origin, authority, forwarded);
	const referer = browserContextEvidence(request.headers.referer, authority, forwarded);
	const rejectedOrigin = browserContextReason("origin", origin);
	if (rejectedOrigin !== null) return { accepted: false, reason: rejectedOrigin };
	const rejectedReferer = browserContextReason("referer", referer);
	if (rejectedReferer !== null) return { accepted: false, reason: rejectedReferer };

	const site = request.headers["sec-fetch-site"];
	const pluginRequest = request.headers["x-dsh-hub-oauth-gateway"] === "1";
	if (forwarded !== null && !pluginRequest) return { accepted: false, reason: "proxy-marker-missing" };

	const authorityHeader = request.headers["x-dsh-hub-oauth-gateway-authority"];
	if (forwarded !== null && authorityHeader === undefined) {
		return { accepted: false, reason: "proxy-authority-missing" };
	}
	const directAuthority = parseAuthority(authorityHeader);
	const proxiedAuthority = parseAuthority(authorityHeader, forwarded?.protocol ?? "http:");
	if (authorityHeader !== undefined && directAuthority === null && proxiedAuthority === null) {
		return { accepted: false, reason: "authority-invalid" };
	}
	const matchesDirectAuthority = authority !== null && directAuthority?.key === authority;
	const matchesForwardedAuthority = forwarded !== null && proxiedAuthority?.key === forwarded.authority.key;
	if (authorityHeader !== undefined && !matchesDirectAuthority && !matchesForwardedAuthority) {
		return { accepted: false, reason: "authority-mismatch" };
	}

	const matchingContext =
		origin.matchesRequest || origin.matchesForwarded || referer.matchesRequest || referer.matchesForwarded;
	const missingBrowserContext = !origin.present && !referer.present;
	const matchingAuthority = matchesDirectAuthority || matchesForwardedAuthority;
	if (site === "cross-site") {
		if (!pluginRequest) return { accepted: false, reason: "cross-site-marker-missing" };
		// Embedded browsers may omit Origin/Referer; both custom headers still force a cross-origin CORS preflight.
		if (matchingContext || (missingBrowserContext && matchingAuthority)) return { accepted: true, reason: null };
		return { accepted: false, reason: "cross-site-corroboration-missing" };
	}
	if (pluginRequest) return { accepted: true, reason: null };
	if (site === "same-origin" || site === "same-site" || site === "none") return { accepted: true, reason: null };
	if (matchingContext) return { accepted: true, reason: null };
	return { accepted: false, reason: "browser-context-missing" };
}

export function passesBrowserContextGuard(request: IncomingMessage): boolean {
	return browserContextGuardDecision(request).accepted;
}

export function passesCsrfGuard(request: IncomingMessage): boolean {
	const contentType = String(request.headers["content-type"] ?? "").toLowerCase();
	if (!contentType.startsWith("application/json")) return false;
	if (request.headers["x-dsh-hub-oauth-gateway"] !== "1") return false;
	return passesBrowserContextGuard(request);
}

export function writeJson(response: ServerResponse, status: number, value: unknown): void {
	response.writeHead(status, {
		"content-type": "application/json; charset=utf-8",
		"cache-control": "no-store",
		"x-content-type-options": "nosniff",
	});
	response.end(JSON.stringify(value));
}

export async function readJsonBody(
	request: IncomingMessage,
	response: ServerResponse,
	maxBytes = MAX_JSON_BODY_BYTES,
): Promise<unknown | undefined> {
	return new Promise((resolve) => {
		const chunks: Buffer[] = [];
		let size = 0;
		let settled = false;
		const finish = (value: unknown | undefined): void => {
			if (settled) return;
			settled = true;
			resolve(value);
		};
		request.on("data", (chunk: Buffer | string) => {
			const bytes = typeof chunk === "string" ? Buffer.from(chunk) : chunk;
			size += bytes.length;
			if (size > maxBytes) {
				finish(undefined);
				writeJson(response, 413, {
					ok: false,
					error: { code: "body-too-large", message: "request body is too large" },
				});
				request.destroy();
				return;
			}
			chunks.push(bytes);
		});
		request.on("end", () => {
			if (settled) return;
			try {
				finish(JSON.parse(Buffer.concat(chunks).toString("utf8")));
			} catch {
				writeJson(response, 400, {
					ok: false,
					error: { code: "invalid-json", message: "request body is not valid JSON" },
				});
				finish(undefined);
			}
		});
		request.on("error", () => {
			if (settled) return;
			finish(undefined);
			writeJson(response, 400, {
				ok: false,
				error: { code: "read-failed", message: "request body could not be read" },
			});
		});
	});
}
