import { randomUUID } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import { homedir } from "node:os";
import { join } from "node:path";
import { API_PATHS } from "../../shared/contracts.js";
import { deviceFlowCredentialRef, pollTokenOnce, requestDeviceCode } from "../accounts/adapters/oauth-device.js";
import type { AccountService } from "../accounts/service.js";
import type { AccountDeps, CredentialResolver } from "../accounts/types.js";
import type { OwnerRequestPolicy } from "../coding-oauth/web-origin.js";
import { authorizeHubApiRequest } from "./owner-request.js";
import type { ExactWebServer, UsageStatsLogger } from "./router.js";
import { readJsonBody, writeJson } from "./security.js";

export const LEGACY_CREDENTIAL_PATH = "/api/usage-stats/credential";
export const LEGACY_CREDENTIAL_IMPORT_PATH = "/api/usage-stats/credential/import";

const MAX_CREDENTIAL_BYTES = 8 * 1024;
const MAX_IMPORT_FILE_BYTES = 1024 * 1024;
const CREDENTIAL_REF = /^[A-Z_][A-Z0-9_]*$/;

export interface CredentialDescription {
	readonly configured?: boolean;
	readonly source?: string;
	readonly writable?: boolean;
}

export interface WritableCredentials extends CredentialResolver {
	describe?(ref: string): Promise<CredentialDescription | undefined>;
	unset?(ref: string): Promise<void>;
}

interface ImportSpec {
	readonly ref: string;
	readonly path: (home: string) => string;
	extract(value: unknown): string | null;
}

function recordOf(value: unknown): Record<string, unknown> | null {
	return value !== null && typeof value === "object" && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: null;
}

const LOCAL_IMPORTS: Readonly<Record<string, ImportSpec>> = Object.freeze({
	claude: {
		ref: "CLAUDE_OAUTH_TOKEN",
		path: (home) => join(home, ".claude", ".credentials.json"),
		extract(value) {
			const oauth = recordOf(recordOf(value)?.claudeAiOauth);
			return typeof oauth?.accessToken === "string" ? oauth.accessToken : null;
		},
	},
	codex: {
		ref: "CODEX_ACCESS_TOKEN",
		path: (home) => join(home, ".codex", "auth.json"),
		extract(value) {
			const token = recordOf(value)?.ACCESS_TOKEN;
			return typeof token === "string" ? token : null;
		},
	},
	gemini: {
		ref: "GEMINI_ACCESS_TOKEN",
		path: (home) => join(home, ".gemini", "oauth_creds.json"),
		extract(value) {
			const token = recordOf(value)?.access_token;
			return typeof token === "string" ? token : null;
		},
	},
	grok: {
		ref: "GROK_ACCESS_TOKEN",
		path: (home) => join(home, ".grok", "auth.json"),
		extract(value) {
			const token = recordOf(value)?.access_token;
			return typeof token === "string" ? token : null;
		},
	},
	amp: {
		ref: "AMP_API_KEY",
		path: (home) => join(home, ".local", "share", "amp", "secrets.json"),
		extract(value) {
			for (const [key, token] of Object.entries(recordOf(value) ?? {})) {
				if (key.includes("ampcode.com") && typeof token === "string") return token;
			}
			return null;
		},
	},
});

function validRef(value: unknown): value is string {
	return typeof value === "string" && CREDENTIAL_REF.test(value);
}

function guard(request: IncomingMessage, response: ServerResponse, policy?: OwnerRequestPolicy): boolean {
	const decision = authorizeHubApiRequest(request, policy);
	if (!decision.authorized) {
		const error =
			decision.reason === "csrf"
				? "csrf-rejected"
				: decision.reason === "origin" || decision.reason === "fetch-metadata"
					? "cross-site-rejected"
					: "forbidden";
		writeJson(response, 403, { ok: false, error });
		return false;
	}
	return true;
}

async function objectBody(
	request: IncomingMessage,
	response: ServerResponse,
	maxBytes?: number,
): Promise<Record<string, unknown> | undefined> {
	const raw = await readJsonBody(request, response, maxBytes);
	if (raw === undefined) return undefined;
	const body = recordOf(raw);
	if (body === null) {
		writeJson(response, 400, { ok: false, error: "invalid-body" });
		return undefined;
	}
	return body;
}

function v1<T>(data: T) {
	const now = Date.now();
	return {
		ok: true as const,
		data,
		meta: {
			schemaVersion: 1 as const,
			generatedAt: now,
			sourceUpdatedAt: now,
			usageUpdatedAt: null,
			accountsUpdatedAt: null,
			usageState: "not-collected" as const,
			partial: false,
			stale: false,
			warnings: [] as string[],
		},
	};
}

function description(ref: string, info: CredentialDescription | undefined) {
	return {
		ref,
		configured: info?.configured === true,
		source: typeof info?.source === "string" ? info.source : null,
		writable: info?.writable !== false,
	};
}

interface DeviceFlowState {
	readonly providerId: string;
	readonly deviceCode: string;
	readonly expiresAt: number;
	readonly intervalMs: number;
	nextPollAt: number;
}

export interface CredentialApiDependencies {
	readonly logger: UsageStatsLogger;
	readonly credentials: WritableCredentials | undefined | (() => WritableCredentials | undefined);
	readonly accounts: Pick<AccountService, "credentialRefs" | "refresh">;
	readonly accountDeps?: AccountDeps;
	readonly ownerRequestPolicy?: OwnerRequestPolicy | undefined;
}

export function registerCredentialRoutes(
	webServer: ExactWebServer,
	dependencies: CredentialApiDependencies,
): readonly (() => void)[] {
	const register = (
		path: string,
		handler: (request: IncomingMessage, response: ServerResponse) => Promise<void> | void,
	): (() => void) => webServer.register({ kind: "exact", path, handler });
	const deviceFlows = new Map<string, DeviceFlowState>();
	const credentials = (): WritableCredentials | undefined =>
		typeof dependencies.credentials === "function" ? dependencies.credentials() : dependencies.credentials;
	const allowedRef = async (ref: string): Promise<boolean> => (await dependencies.accounts.credentialRefs()).has(ref);
	const describe = async (ref: string): Promise<ReturnType<typeof description>> => {
		const provider = credentials();
		if (provider?.describe === undefined) throw new Error("credentials-unavailable");
		return description(ref, await provider.describe(ref));
	};
	const refresh = async (): Promise<void> => {
		try {
			await dependencies.accounts.refresh();
		} catch {
			// A credential write succeeds independently of an upstream refresh.
		}
	};
	const handleCredentials = async (
		request: IncomingMessage,
		response: ServerResponse,
		legacy: boolean,
	): Promise<void> => {
		if (!guard(request, response, dependencies.ownerRequestPolicy)) return;
		try {
			if (request.method === "GET") {
				const ref = new URL(request.url ?? "/", "http://localhost").searchParams.get("ref");
				if (!validRef(ref)) {
					writeJson(response, 400, { ok: false, error: "invalid-ref" });
					return;
				}
				if (!(await allowedRef(ref))) {
					writeJson(response, 403, { ok: false, error: "credential-ref-not-allowed" });
					return;
				}
				const data = await describe(ref);
				writeJson(response, 200, legacy ? { ok: true, ...data } : v1(data));
				return;
			}
			if (request.method === "DELETE") {
				const ref = new URL(request.url ?? "/", "http://localhost").searchParams.get("ref");
				if (!validRef(ref)) {
					writeJson(response, 400, { ok: false, error: "invalid-ref" });
					return;
				}
				if (!(await allowedRef(ref))) {
					writeJson(response, 403, { ok: false, error: "credential-ref-not-allowed" });
					return;
				}
				const provider = credentials();
				if (provider?.unset === undefined) throw new Error("credentials-unavailable");
				await provider.unset(ref);
				await refresh();
				const data = { ref, configured: false };
				writeJson(response, 200, legacy ? { ok: true, ...data } : v1(data));
				return;
			}
			if (request.method !== "POST" && request.method !== "PUT") {
				writeJson(response, 405, { ok: false, error: "method-not-allowed" });
				return;
			}
			const body = await objectBody(request, response, MAX_CREDENTIAL_BYTES);
			if (body === undefined) return;
			if (!validRef(body.ref)) {
				writeJson(response, 400, { ok: false, error: "invalid-ref" });
				return;
			}
			if (!(await allowedRef(body.ref))) {
				writeJson(response, 403, { ok: false, error: "credential-ref-not-allowed" });
				return;
			}
			if (typeof body.value !== "string" || Buffer.byteLength(body.value, "utf8") > MAX_CREDENTIAL_BYTES) {
				writeJson(response, 400, { ok: false, error: "invalid-value" });
				return;
			}
			const provider = credentials();
			if (provider?.set === undefined) throw new Error("credentials-unavailable");
			await provider.set(body.ref, body.value);
			await refresh();
			const data = await describe(body.ref);
			writeJson(response, 200, legacy ? { ok: true, ...data } : v1(data));
		} catch (error) {
			const unavailable = error instanceof Error && error.message === "credentials-unavailable";
			if (!unavailable) dependencies.logger.warn("usage-stats: credential operation failed (details redacted)");
			writeJson(response, unavailable ? 503 : 409, {
				ok: false,
				error: unavailable ? "credentials-unavailable" : "credential-failed",
			});
		}
	};
	const handleImport = async (request: IncomingMessage, response: ServerResponse, legacy: boolean): Promise<void> => {
		if (!guard(request, response, dependencies.ownerRequestPolicy)) return;
		if (request.method !== "POST") {
			writeJson(response, 405, { ok: false, error: "method-not-allowed" });
			return;
		}
		const body = await objectBody(request, response);
		if (body === undefined) return;
		const spec = typeof body.providerId === "string" ? LOCAL_IMPORTS[body.providerId] : undefined;
		if (spec === undefined) {
			writeJson(response, 400, { ok: false, error: "unknown-provider" });
			return;
		}
		const provider = credentials();
		if (provider?.set === undefined) {
			writeJson(response, 503, { ok: false, error: "credentials-unavailable" });
			return;
		}
		const path = spec.path(homedir());
		try {
			if ((await stat(path)).size > MAX_IMPORT_FILE_BYTES) {
				writeJson(response, 413, { ok: false, error: "credential-file-too-large" });
				return;
			}
			const value = spec.extract(JSON.parse(await readFile(path, "utf8")));
			if (value === null || value === "") {
				writeJson(response, 404, { ok: false, error: "no-token-in-file" });
				return;
			}
			if (Buffer.byteLength(value, "utf8") > MAX_CREDENTIAL_BYTES) {
				writeJson(response, 413, { ok: false, error: "credential-too-large" });
				return;
			}
			await provider.set(spec.ref, value);
			await refresh();
			const data = legacy ? { ref: spec.ref, importedFrom: body.providerId } : { ref: spec.ref };
			writeJson(response, 200, legacy ? { ok: true, ...data } : v1(data));
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code === "ENOENT") {
				writeJson(response, 404, { ok: false, error: "file-not-found" });
				return;
			}
			dependencies.logger.warn("usage-stats: credential import failed (details redacted)");
			writeJson(response, 500, { ok: false, error: "import-failed" });
		}
	};
	const handleDevice = async (request: IncomingMessage, response: ServerResponse, poll: boolean): Promise<void> => {
		if (!guard(request, response, dependencies.ownerRequestPolicy)) return;
		if (request.method !== "POST") {
			writeJson(response, 405, { ok: false, error: "method-not-allowed" });
			return;
		}
		const body = await objectBody(request, response);
		if (body === undefined) return;
		if (typeof body.providerId !== "string" || deviceFlowCredentialRef(body.providerId) === null) {
			writeJson(response, 400, { ok: false, error: "invalid-provider" });
			return;
		}
		if (!poll && dependencies.accountDeps?.oauthClientIds?.[body.providerId] === undefined) {
			writeJson(response, 503, { ok: false, error: "device-flow-not-configured" });
			return;
		}
		let activeFlowId: string | null = null;
		try {
			const currentTime = Date.now();
			for (const [id, flow] of deviceFlows) if (flow.expiresAt <= currentTime) deviceFlows.delete(id);
			if (!poll) {
				if (deviceFlows.size >= 32) {
					writeJson(response, 429, { ok: false, error: "too-many-device-flows" });
					return;
				}
				const code = await requestDeviceCode(body.providerId, dependencies.accountDeps);
				const flowId = randomUUID();
				const intervalMs = Math.max(1_000, code.interval * 1_000);
				deviceFlows.set(flowId, {
					providerId: body.providerId,
					deviceCode: code.deviceCode,
					expiresAt: currentTime + code.expiresIn * 1_000,
					intervalMs,
					nextPollAt: currentTime + intervalMs,
				});
				writeJson(
					response,
					200,
					v1({
						providerId: body.providerId,
						flowId,
						userCode: code.userCode,
						verificationUri: code.verificationUri,
						expiresIn: code.expiresIn,
						interval: code.interval,
					}),
				);
				return;
			}
			if (typeof body.flowId !== "string") {
				writeJson(response, 400, { ok: false, error: "invalid-device-flow" });
				return;
			}
			activeFlowId = body.flowId;
			const flow = deviceFlows.get(body.flowId);
			if (flow === undefined || flow.providerId !== body.providerId) {
				writeJson(response, 404, { ok: false, error: "device-flow-not-found" });
				return;
			}
			if (flow.expiresAt <= currentTime) {
				deviceFlows.delete(body.flowId);
				writeJson(response, 410, { ok: false, error: "device-flow-expired" });
				return;
			}
			if (currentTime < flow.nextPollAt) {
				writeJson(response, 202, v1({ pending: true }));
				return;
			}
			flow.nextPollAt = currentTime + flow.intervalMs;
			const token = await pollTokenOnce(body.providerId, flow.deviceCode, dependencies.accountDeps);
			if (token === null) {
				writeJson(response, 202, v1({ pending: true }));
				return;
			}
			const ref = deviceFlowCredentialRef(body.providerId);
			const provider = credentials();
			if (ref === null || provider?.set === undefined) throw new Error("credentials-unavailable");
			if (Buffer.byteLength(token, "utf8") > MAX_CREDENTIAL_BYTES) throw new Error("credential-too-large");
			await provider.set(ref, token);
			deviceFlows.delete(body.flowId);
			await refresh();
			writeJson(response, 200, v1({ pending: false, ref }));
		} catch {
			if (activeFlowId !== null) deviceFlows.delete(activeFlowId);
			dependencies.logger.warn("usage-stats: OAuth device flow failed (details redacted)");
			writeJson(response, 502, { ok: false, error: "device-flow-failed" });
		}
	};
	return [
		register(API_PATHS.credentials, (request, response) => handleCredentials(request, response, false)),
		register(LEGACY_CREDENTIAL_PATH, (request, response) => handleCredentials(request, response, true)),
		register(API_PATHS.credentialImport, (request, response) => handleImport(request, response, false)),
		register(LEGACY_CREDENTIAL_IMPORT_PATH, (request, response) => handleImport(request, response, true)),
		register(API_PATHS.oauthDevice, (request, response) => handleDevice(request, response, false)),
		register(API_PATHS.oauthDevicePoll, (request, response) => handleDevice(request, response, true)),
	];
}
