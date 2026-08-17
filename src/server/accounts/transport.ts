/**
 * Centralized transport seam for the account-monitor subsystem.
 *
 * All upstream HTTP goes through `requestJson`/`requestText`, which apply
 * timeouts, manual redirects, HTTP-status classification, content-type and
 * response-size guards. When the caller does not inject `deps.fetch`, the
 * DNS-pinned transport connects to the exact address the security policy
 * layer validated, closing DNS-rebinding gaps between check and connect.
 */

import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { isIP } from "node:net";
import { ProviderError } from "./errors.js";
import { nonEmptyString, numberOrNull } from "./normalize.js";
import { assertTargetPolicy, type TargetPolicy } from "./security.js";
import type { AccountDeps, CredentialResolver, FetchInitLike, FetchLike, FetchResponseLike } from "./types.js";

export const DEFAULT_TIMEOUT_MS = 15000;
export const MAX_RESPONSE_BYTES = 1024 * 1024;

/** HTTP status → raw provider-status classification (accounts vocabulary). */
export function responseStatus(
	status: number,
): "unauthorized" | "rate-limited" | "unsupported" | "unavailable" | "invalid-response" {
	if (status === 401 || status === 403) return "unauthorized";
	if (status === 429) return "rate-limited";
	if (status === 404 || status === 405) return "unsupported";
	return status >= 500 ? "unavailable" : "invalid-response";
}

/** Resolve a credential ref through the Harness seam; "" when absent. */
export async function resolveCredential(credentials: CredentialResolver | undefined, ref: unknown): Promise<string> {
	if (nonEmptyString(ref) === null || credentials === null || credentials === undefined) return "";
	if (typeof credentials.resolve !== "function") return "";
	try {
		const hit = await credentials.resolve(ref as string);
		return nonEmptyString(hit?.value) ?? "";
	} catch {
		return "";
	}
}

/** Parse a JSON response body with content-type and size guards. */
export async function parseJsonResponse(response: FetchResponseLike, maxBytes = MAX_RESPONSE_BYTES): Promise<unknown> {
	const declared = numberOrNull(response.headers?.get?.("content-length"));
	if (declared !== null && declared > maxBytes) {
		throw new ProviderError("invalid-response", "upstream response exceeds the size limit");
	}
	const contentType = response.headers?.get?.("content-type");
	if (typeof contentType === "string" && contentType !== "" && !/\bjson\b/i.test(contentType)) {
		throw new ProviderError("invalid-response", "upstream did not return JSON");
	}
	if (typeof response.arrayBuffer === "function") {
		const bytes = new Uint8Array(await response.arrayBuffer());
		if (bytes.byteLength > maxBytes) {
			throw new ProviderError("invalid-response", "upstream response exceeds the size limit");
		}
		try {
			return JSON.parse(new TextDecoder().decode(bytes));
		} catch {
			throw new ProviderError("invalid-response", "upstream returned invalid JSON");
		}
	}
	if (typeof response.json === "function") {
		try {
			const value = await response.json();
			if (Buffer.byteLength(JSON.stringify(value), "utf8") > maxBytes) {
				throw new ProviderError("invalid-response", "upstream response exceeds the size limit");
			}
			return value;
		} catch (error) {
			if (error instanceof ProviderError) throw error;
			throw new ProviderError("invalid-response", "upstream returned invalid JSON");
		}
	}
	throw new ProviderError("invalid-response", "upstream returned invalid JSON");
}

const DEFAULT_TARGET_POLICY: TargetPolicy = Object.freeze({ enforceSameOrigin: false });

export function fetchWithPolicy(policy: TargetPolicy, deps: AccountDeps): FetchLike {
	const injected = deps.fetch;
	if (injected === undefined) return (url, init) => pinnedFetch(url, init, policy, deps);
	return async (url, init) => {
		await assertTargetPolicy(String(url), policy, deps);
		return injected(url, init);
	};
}

/** GET/POST a JSON document with timeout, redirect, status, and size guards. */
export async function requestJson(
	url: string,
	init: FetchInitLike,
	deps: AccountDeps = {},
	policy?: TargetPolicy,
): Promise<unknown> {
	const effectivePolicy = policy ?? deps.targetPolicy ?? DEFAULT_TARGET_POLICY;
	const fetchImpl = fetchWithPolicy(effectivePolicy, deps);
	const response = await fetchImpl(url, {
		...init,
		redirect: "manual",
		signal: AbortSignal.timeout(deps.timeoutMs ?? DEFAULT_TIMEOUT_MS),
	});
	if (!response.ok) {
		throw new ProviderError(
			responseStatus(response.status),
			`upstream returned HTTP ${response.status}`,
			response.status,
		);
	}
	return parseJsonResponse(response, deps.maxResponseBytes ?? MAX_RESPONSE_BYTES);
}

export async function parseTextResponse(response: FetchResponseLike, maxBytes = MAX_RESPONSE_BYTES): Promise<string> {
	const declared = numberOrNull(response.headers?.get?.("content-length"));
	if (declared !== null && declared > maxBytes) {
		throw new ProviderError("invalid-response", "upstream response exceeds the size limit");
	}
	if (typeof response.arrayBuffer === "function") {
		const bytes = new Uint8Array(await response.arrayBuffer());
		if (bytes.byteLength > maxBytes) {
			throw new ProviderError("invalid-response", "upstream response exceeds the size limit");
		}
		return new TextDecoder().decode(bytes);
	}
	if (typeof response.text === "function") {
		const text = await response.text();
		if (Buffer.byteLength(text, "utf8") > maxBytes) {
			throw new ProviderError("invalid-response", "upstream response exceeds the size limit");
		}
		return text;
	}
	throw new ProviderError("invalid-response", "upstream returned no readable body");
}

/** GET a text document (dashboard HTML/JS) with timeout and status guards. */
export async function requestText(
	url: string,
	init: FetchInitLike,
	deps: AccountDeps = {},
	policy?: TargetPolicy,
): Promise<string> {
	const effectivePolicy = policy ?? deps.targetPolicy ?? DEFAULT_TARGET_POLICY;
	const fetchImpl = fetchWithPolicy(effectivePolicy, deps);
	const response = await fetchImpl(url, {
		...init,
		redirect: "manual",
		signal: AbortSignal.timeout(deps.timeoutMs ?? DEFAULT_TIMEOUT_MS),
	});
	if (!response.ok) {
		throw new ProviderError(
			responseStatus(response.status),
			`upstream returned HTTP ${response.status}`,
			response.status,
		);
	}
	return parseTextResponse(response, deps.maxResponseBytes ?? MAX_RESPONSE_BYTES);
}

function responseHeaders(headers: Record<string, string | string[] | undefined>): { get(name: string): string | null } {
	return {
		get: (name: string) => {
			const value = headers[String(name).toLowerCase()];
			return Array.isArray(value) ? value.join(", ") : value === undefined ? null : String(value);
		},
	};
}

/**
 * HTTPS/HTTP transport that pins the DNS answer checked by the policy layer.
 * Returns a Fetch-compatible response so adapters cannot tell the difference.
 */
export async function pinnedFetch(
	rawUrl: string | URL,
	init: FetchInitLike | undefined,
	policy: TargetPolicy,
	deps: AccountDeps,
): Promise<FetchResponseLike> {
	const target = await assertTargetPolicy(String(rawUrl), policy, deps);
	const signal = init?.signal ?? AbortSignal.timeout(deps.timeoutMs ?? DEFAULT_TIMEOUT_MS);
	return new Promise<FetchResponseLike>((resolve, reject) => {
		const transport = target.url.protocol === "https:" ? httpsRequest : httpRequest;
		const request = transport(
			target.url,
			{
				method: init?.method ?? "GET",
				headers: init?.headers,
				signal,
				servername: isIP(target.url.hostname.replace(/^\[|\]$/g, "")) === 0 ? target.url.hostname : undefined,
				lookup: (_hostname, options, callback) => {
					if (options?.all) callback(null, [{ address: target.address, family: target.family }]);
					else callback(null, target.address, target.family);
				},
			},
			(response) => {
				const chunks: Buffer[] = [];
				let size = 0;
				response.on("data", (chunk: Buffer) => {
					size += chunk.length;
					if (size > (deps.maxResponseBytes ?? MAX_RESPONSE_BYTES)) {
						request.destroy(new ProviderError("invalid-response", "upstream response exceeds the size limit"));
					} else {
						chunks.push(chunk);
					}
				});
				response.on("end", () => {
					const body = Buffer.concat(chunks);
					const status = response.statusCode ?? 0;
					resolve({
						ok: status >= 200 && status < 300,
						status,
						headers: responseHeaders(response.headers),
						arrayBuffer: () => {
							const sliced = body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength);
							return Promise.resolve(sliced as ArrayBuffer);
						},
						json: () => Promise.resolve(JSON.parse(body.toString("utf8"))),
						text: () => Promise.resolve(body.toString("utf8")),
					});
				});
			},
		);
		request.on("error", reject);
		if (init?.body !== undefined) request.write(init.body);
		request.end();
	});
}
