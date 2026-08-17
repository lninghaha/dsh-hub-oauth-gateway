/**
 * Centralized security seams for the account-monitor subsystem.
 *
 * Everything that decides *where* a monitor request may go lives here:
 * private/loopback IP classification (IPv4 + IPv6), hostname policy,
 * DNS-answer validation, cross-origin and scheme rules, declarative-config
 * path/pointer validation, and the sensitive-header denylist. Loopback and
 * private-network targets stay reachable only behind explicit opt-ins so the
 * local-privacy assumptions of the host are preserved by default.
 */

import { lookup as dnsLookup } from "node:dns/promises";
import { isIP } from "node:net";
import { ProviderError } from "./errors.js";
import { nonEmptyString, numberOrNull } from "./normalize.js";
import type { AccountDeps } from "./types.js";

/** Headers a declarative monitor config may never set literally. */
export const SENSITIVE_HEADERS: ReadonlySet<string> = new Set([
	"authorization",
	"api-key",
	"cookie",
	"host",
	"proxy-authorization",
	"proxy-authenticate",
	"set-cookie",
	"transfer-encoding",
	"connection",
	"upgrade",
	"x-api-key",
]);

function ipv4Private(octets: number[]): boolean {
	const [a, b, c] = octets;
	return (
		a === 0 ||
		a === 10 ||
		a === 127 ||
		(a === 169 && b === 254) ||
		(a === 172 && b !== undefined && b >= 16 && b <= 31) ||
		(a === 192 && b === 168) ||
		(a === 192 && b === 0 && (c === 0 || c === 2)) ||
		(a === 192 && b === 88 && c === 99) ||
		(a === 100 && b !== undefined && b >= 64 && b <= 127) ||
		(a === 198 && (b === 18 || b === 19)) ||
		(a === 198 && b === 51 && c === 100) ||
		(a === 203 && b === 0 && c === 113) ||
		(a !== undefined && a >= 224)
	);
}

function ipv6Bytes(address: string): number[] | null {
	let value = address.toLowerCase().split("%")[0] ?? "";
	let ipv4Tail: number[] | null = null;
	const lastColon = value.lastIndexOf(":");
	if (value.slice(lastColon + 1).includes(".")) {
		const octets = value
			.slice(lastColon + 1)
			.split(".")
			.map((part) => Number(part));
		if (octets.length !== 4 || octets.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return null;
		const [o0 = 0, o1 = 0, o2 = 0, o3 = 0] = octets;
		ipv4Tail = [(o0 << 8) | o1, (o2 << 8) | o3];
		value = `${value.slice(0, lastColon)}:${ipv4Tail[0]?.toString(16)}:${ipv4Tail[1]?.toString(16)}`;
	}
	const halves = value.split("::");
	if (halves.length > 2) return null;
	const leftHalf = halves[0] ?? "";
	const rightHalf = halves[1] ?? "";
	const left = leftHalf === "" ? [] : leftHalf.split(":");
	const right = halves.length === 1 || rightHalf === "" ? [] : rightHalf.split(":");
	const missing = 8 - left.length - right.length;
	if (missing < 0 || (halves.length === 1 && missing !== 0)) return null;
	const words = [...left, ...Array(missing).fill("0"), ...right].map((part) => Number.parseInt(part || "0", 16));
	if (words.length !== 8 || words.some((part) => !Number.isInteger(part) || part < 0 || part > 0xffff)) return null;
	const bytes: number[] = [];
	for (const word of words) bytes.push(word >> 8, word & 0xff);
	return bytes;
}

/** True for loopback, private, link-local, documentation, multicast, and other non-public IP space. */
export function isPrivateAddress(address: unknown): boolean {
	const value = String(address ?? "")
		.trim()
		.replace(/^\[|\]$/g, "");
	if (isIP(value) === 4) return ipv4Private(value.split(".").map((part) => Number(part)));
	if (isIP(value) !== 6) return false;
	const bytes = ipv6Bytes(value);
	if (bytes === null) return true;
	if (bytes.slice(0, 10).every((byte) => byte === 0) && bytes[10] === 0xff && bytes[11] === 0xff) {
		return ipv4Private(bytes.slice(12));
	}
	// Public provider endpoints should resolve to global unicast (2000::/3).
	// This conservative allow-range excludes loopback/unspecified, NAT64,
	// discard-only, ULA, link/site-local, multicast, and other special space.
	const first = bytes[0] ?? 0;
	const globalUnicast = (first & 0xe0) === 0x20;
	const word0 = (first << 8) | (bytes[1] ?? 0);
	const word1 = ((bytes[2] ?? 0) << 8) | (bytes[3] ?? 0);
	// IETF protocol assignments 2001:0000::/23 include benchmarking, ORCHID,
	// and tunnel mechanisms; 2002::/16 (6to4) embeds an unchecked IPv4 target.
	const ietfSpecial = word0 === 0x2001 && word1 <= 0x01ff;
	const sixToFour = word0 === 0x2002;
	const documentation = (word0 === 0x2001 && word1 === 0x0db8) || (word0 === 0x3fff && (word1 & 0xf000) === 0);
	return !globalUnicast || ietfSpecial || sixToFour || documentation;
}

/** True for localhost names and literal private addresses. */
export function isPrivateHostname(hostname: string): boolean {
	const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
	return host === "localhost" || host.endsWith(".localhost") || isPrivateAddress(host);
}

/** Declarative request paths must be origin-relative absolute paths. */
export function assertRelativePath(path: unknown, label: string): asserts path is string {
	if (typeof path !== "string" || !path.startsWith("/") || path.startsWith("//")) {
		throw new Error(`${label} must be an absolute-path relative path beginning with /`);
	}
	try {
		const parsed = new URL(path, "https://usage.invalid");
		if (parsed.origin !== "https://usage.invalid") throw new Error("origin changed");
	} catch {
		throw new Error(`${label} must be a relative path, not a URL`);
	}
}

function validatePointer(pointer: unknown, label: string): void {
	if (pointer === undefined || pointer === null) return;
	const value = typeof pointer === "object" ? (pointer as { pointer?: unknown }).pointer : pointer;
	if (typeof value !== "string" || (value !== "" && !value.startsWith("/"))) {
		throw new Error(`${label} must be a JSON Pointer`);
	}
}

/** Validate every pointer field of a declarative extract block. */
export function validateExtractPointers(extract: Record<string, unknown>, label: string): void {
	for (const field of [
		"root",
		"valid",
		"invalidMessage",
		"plan",
		"remaining",
		"used",
		"total",
		"currency",
		"unlimited",
		"expiresAt",
		"items",
		"kind",
		"usedPercent",
		"remainingPercent",
		"resetsAt",
	]) {
		validatePointer(extract[field], `${label}.extract.${field}`);
	}
}

function decodePointerToken(token: string): string {
	return token.replace(/~1/g, "/").replace(/~0/g, "~");
}

/** RFC 6901 JSON Pointer lookup; missing paths return undefined. */
export function jsonPointer(value: unknown, pointer: unknown): unknown {
	if (pointer === "" || pointer === undefined || pointer === null) return value;
	if (typeof pointer !== "string" || !pointer.startsWith("/")) return undefined;
	let current = value;
	for (const raw of pointer.slice(1).split("/")) {
		const key = decodePointerToken(raw);
		if (current === null || current === undefined || typeof current !== "object" || !Object.hasOwn(current, key)) {
			return undefined;
		}
		current = (current as Record<string, unknown>)[key];
	}
	return current;
}

/** Resolve a declarative field mapping (pointer with optional divisor). */
export function mapped(root: unknown, mapping: unknown): unknown {
	if (mapping === undefined || mapping === null) return undefined;
	if (typeof mapping === "string") return jsonPointer(root, mapping);
	if (typeof mapping === "object" && typeof (mapping as { pointer?: unknown }).pointer === "string") {
		const value = jsonPointer(root, (mapping as { pointer: string }).pointer);
		const divisor = numberOrNull((mapping as { divisor?: unknown }).divisor);
		if (divisor === null) return value;
		const numeric = numberOrNull(value);
		return numeric === null ? undefined : numeric / divisor;
	}
	return undefined;
}

/** Network-target policy knobs derived from a validated monitor config. */
/** Network-target policy derived from a validated account spec. */
export type TargetPolicy = NonNullable<AccountDeps["targetPolicy"]>;

export interface ResolvedTarget {
	readonly url: URL;
	readonly address: string;
	readonly family: number;
}

async function resolvePublicAddress(url: URL, policy: TargetPolicy, deps: AccountDeps): Promise<ResolvedTarget> {
	const hostname = url.hostname.replace(/^\[|\]$/g, "");
	if (isPrivateHostname(hostname) && policy.allowPrivateNetwork !== true) {
		throw new ProviderError("unsupported", "account monitor private-network access requires allowPrivateNetwork");
	}
	if (isIP(hostname) !== 0) return { url, address: hostname, family: isIP(hostname) };
	let addresses: Array<{ address: string; family?: number }>;
	try {
		const lookup = deps.lookup ?? (dnsLookup as unknown as NonNullable<AccountDeps["lookup"]>);
		const resolved = await lookup(hostname, { all: true, verbatim: true });
		addresses = Array.isArray(resolved) ? resolved : [resolved];
	} catch {
		throw new ProviderError("unavailable", "account monitor hostname could not be resolved");
	}
	if (addresses.length === 0)
		throw new ProviderError("unavailable", "account monitor hostname resolved to no addresses");
	if (policy.allowPrivateNetwork !== true && addresses.some((entry) => isPrivateAddress(entry?.address))) {
		throw new ProviderError("unsupported", "account monitor hostname resolves to a private network");
	}
	const selected = addresses[0];
	if (selected === undefined)
		throw new ProviderError("unavailable", "account monitor hostname resolved to no addresses");
	return { url, address: selected.address, family: selected.family ?? isIP(selected.address) };
}

/**
 * Validate a request target against scheme, credential, cross-origin, and
 * private-network policy, returning the DNS-pinned address to connect to.
 */
export async function assertTargetPolicy(
	rawUrl: string,
	policy: TargetPolicy,
	deps: AccountDeps,
): Promise<ResolvedTarget> {
	const url = new URL(rawUrl);
	if (url.username !== "" || url.password !== "") {
		throw new ProviderError("unsupported", "account monitor URL must not contain credentials");
	}
	if (url.protocol !== "https:" && policy.allowInsecure !== true) {
		throw new ProviderError("unsupported", "account monitor requires HTTPS");
	}
	if (url.protocol !== "https:" && url.protocol !== "http:") {
		throw new ProviderError("unsupported", "account monitor protocol is unsupported");
	}
	if (policy.enforceSameOrigin && nonEmptyString(policy.providerBaseURL) !== null) {
		const providerOrigin = new URL(policy.providerBaseURL as string).origin;
		if (url.origin !== providerOrigin && policy.allowCrossOrigin !== true) {
			throw new ProviderError("unsupported", "account monitor cross-origin access requires allowCrossOrigin");
		}
	}
	return resolvePublicAddress(url, policy, deps);
}
