import type { IncomingMessage, ServerResponse } from "node:http";
import {
	type CredentialInfo,
	type CredentialProvider,
	type CredentialRef,
	credentialRef,
} from "@deepseek-ai/dsh-credentials";
import { authorizeCodingOAuthRequest } from "./authorize-request.js";
import { readJsonRequest } from "./http-json.js";
import type { OpenCodeGoStatus } from "./opencode-go-header.js";
import { safeMessage } from "./redact.js";
import type { OwnerRequestPolicy } from "./web-origin.js";
import { registerWebRouteSetupAtomically } from "./web-routes.js";

export const OPENCODE_GO_CONNECTION_PATH = "/plugins/dsh-grok-build/opencode-go";
export const OPENCODE_GO_BASE_URL = "https://opencode.ai/zen/go/v1";
export const OPENCODE_GO_API = "openai-completions";

const KNOWN_CREDENTIAL_REFS = ["OPENCODE_GO_API_KEY", "OPENCODE_API_KEY"] as const;

type JsonRecord = Record<string, unknown>;
type SettingsPathOp =
	| { readonly op: "set"; readonly path: readonly string[]; readonly value: unknown }
	| { readonly op: "unset"; readonly path: readonly string[] };

interface SettingsDescriptor {
	readonly ns: string;
	readonly value?: unknown;
	readonly revision?: number;
}

export interface OpenCodeGoSettingsProvider {
	readonly writable?: boolean;
	describe(options?: { readonly redactSecrets?: boolean }): readonly SettingsDescriptor[];
	mutate(ns: string, ops: readonly SettingsPathOp[], expectedRevision?: number): Promise<void>;
}

export interface OpenCodeGoModel {
	readonly id: string;
	readonly name?: string;
	readonly contextWindow?: number;
	readonly maxTokens?: number;
}

type ConfigurationConflict = "protocol" | "base-url" | "static-session-header";

export interface OpenCodeGoConnectionStatus {
	readonly credential: {
		readonly selectedRef: string;
		readonly configured: boolean;
		readonly writable: boolean;
		readonly source: string | null;
		readonly requiresChoice: boolean;
		readonly candidates: readonly {
			readonly ref: string;
			readonly configured: boolean;
			readonly writable: boolean;
			readonly source: string | null;
		}[];
	};
	readonly configuration: {
		readonly revision: number | null;
		readonly writable: boolean;
		readonly api: string | null;
		readonly baseURL: string | null;
		readonly models: readonly OpenCodeGoModel[];
		readonly ready: boolean;
		readonly conflicts: readonly ConfigurationConflict[];
	};
	readonly call: OpenCodeGoStatus;
}

export interface OpenCodeGoConnectionController {
	status(preferredRef?: string): Promise<OpenCodeGoConnectionStatus>;
	models(preferredRef?: string): Promise<readonly OpenCodeGoModel[]>;
	saveCredential(input: {
		readonly credentialRef: string;
		readonly apiKey?: string;
	}): Promise<OpenCodeGoConnectionStatus>;
	applyConfiguration(input: {
		readonly credentialRef: string;
		readonly model: OpenCodeGoModel;
		readonly expectedRevision: number;
		readonly confirmConflicts: boolean;
	}): Promise<OpenCodeGoConnectionStatus>;
}

class OpenCodeGoConnectionError extends Error {
	readonly code: string;
	readonly status: number;

	constructor(code: string, message: string, status: number) {
		super(message);
		this.name = "OpenCodeGoConnectionError";
		this.code = code;
		this.status = status;
	}
}

function recordOf(value: unknown): JsonRecord | undefined {
	return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as JsonRecord) : undefined;
}

function stringOf(value: unknown): string | undefined {
	return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function positiveInteger(value: unknown): number | undefined {
	return typeof value === "number" && Number.isSafeInteger(value) && value > 0 ? value : undefined;
}

function modelOf(value: unknown): OpenCodeGoModel | undefined {
	const record = recordOf(value);
	const id = stringOf(record?.id);
	if (id === undefined) return undefined;
	const name = stringOf(record?.name);
	const contextWindow = positiveInteger(record?.contextWindow ?? record?.context_window ?? record?.max_input_tokens);
	const maxTokens = positiveInteger(record?.maxTokens ?? record?.max_tokens ?? record?.max_output_tokens);
	return {
		id,
		...(name === undefined ? {} : { name }),
		...(contextWindow === undefined ? {} : { contextWindow }),
		...(maxTokens === undefined ? {} : { maxTokens }),
	};
}

function modelsOf(value: unknown): OpenCodeGoModel[] {
	if (Array.isArray(value)) return value.map(modelOf).filter((model): model is OpenCodeGoModel => model !== undefined);
	const record = recordOf(value);
	if (record === undefined) return [];
	if (Array.isArray(record.data)) return modelsOf(record.data);
	const models = recordOf(record.models);
	if (models === undefined) return [];
	return Object.entries(models)
		.map(([id, entry]) => modelOf({ id, ...recordOf(entry) }))
		.filter((model): model is OpenCodeGoModel => model !== undefined);
}

function credentialName(value: unknown): CredentialRef {
	const name = stringOf(value);
	if (name === undefined || !/^[A-Za-z_][A-Za-z0-9_]*$/u.test(name)) {
		throw new OpenCodeGoConnectionError("invalid-credential-ref", "OpenCode Go credential reference is invalid", 400);
	}
	return credentialRef(name);
}

function apiKeyOf(value: unknown): string | undefined {
	if (value === undefined) return undefined;
	const key = stringOf(value);
	if (key === undefined || !/^[\x21-\x7e]+$/u.test(key)) {
		throw new OpenCodeGoConnectionError(
			"invalid-api-key",
			"OpenCode Go API key must contain printable ASCII characters",
			400,
		);
	}
	return key;
}

function settingsSnapshot(settings: OpenCodeGoSettingsProvider): {
	readonly revision: number | null;
	readonly provider: JsonRecord;
} {
	const descriptor = settings.describe({ redactSecrets: true }).find((entry) => entry.ns === "llm-pi-ai");
	const section = recordOf(descriptor?.value);
	const providers = recordOf(section?.providers);
	return {
		revision: typeof descriptor?.revision === "number" ? descriptor.revision : null,
		provider: recordOf(providers?.["opencode-go"]) ?? {},
	};
}

function conflictsOf(provider: JsonRecord): ConfigurationConflict[] {
	const conflicts: ConfigurationConflict[] = [];
	const api = stringOf(provider.api);
	const baseURL = stringOf(provider.baseURL);
	if (api !== undefined && api !== OPENCODE_GO_API) conflicts.push("protocol");
	if (baseURL !== undefined && baseURL.replace(/\/+$/u, "") !== OPENCODE_GO_BASE_URL) conflicts.push("base-url");
	const headers = recordOf(provider.headers);
	if (headers !== undefined && Object.keys(headers).some((name) => name.toLowerCase() === "x-opencode-session")) {
		conflicts.push("static-session-header");
	}
	return conflicts;
}

async function credentialCandidates(
	credentials: CredentialProvider,
	provider: JsonRecord,
): Promise<Array<{ ref: string; info: CredentialInfo; value?: string }>> {
	const configuredRef = stringOf(provider.apiKeyEnv);
	const names = [...new Set([...(configuredRef === undefined ? [] : [configuredRef]), ...KNOWN_CREDENTIAL_REFS])];
	return Promise.all(
		names.map(async (name) => {
			const ref = credentialName(name);
			const [info, resolved] = await Promise.all([credentials.describe(ref), credentials.resolve(ref)]);
			return { ref: name, info, ...(resolved === undefined ? {} : { value: resolved.value }) };
		}),
	);
}

function mergedModels(provider: JsonRecord, selected: OpenCodeGoModel): OpenCodeGoModel[] {
	return [...modelsOf(provider.models).filter((model) => model.id !== selected.id), selected];
}

function filteredHeaders(provider: JsonRecord): JsonRecord | undefined {
	const headers = recordOf(provider.headers);
	if (headers === undefined) return undefined;
	return Object.fromEntries(Object.entries(headers).filter(([name]) => name.toLowerCase() !== "x-opencode-session"));
}

interface ControllerOptions {
	readonly credentials: CredentialProvider;
	readonly settings: OpenCodeGoSettingsProvider;
	readonly callStatus: () => OpenCodeGoStatus;
	readonly fetchImpl?: typeof fetch;
}

async function connectionSnapshot(
	options: ControllerOptions,
	preferredRef?: string,
): Promise<OpenCodeGoConnectionStatus> {
	const current = settingsSnapshot(options.settings);
	const candidates = await credentialCandidates(options.credentials, current.provider);
	const configured = candidates.filter((candidate) => candidate.info.configured);
	const configuredRef = stringOf(current.provider.apiKeyEnv);
	const requestedRef = stringOf(preferredRef);
	const selected =
		candidates.find((candidate) => candidate.ref === requestedRef) ??
		candidates.find((candidate) => candidate.ref === configuredRef) ??
		configured[0] ??
		candidates[0];
	if (selected === undefined) {
		throw new OpenCodeGoConnectionError("credential-unavailable", "Credential service is unavailable", 503);
	}
	const distinctValues = new Set(
		configured.map((candidate) => candidate.value).filter((value): value is string => value !== undefined),
	);
	const models = modelsOf(current.provider.models);
	const api = stringOf(current.provider.api) ?? null;
	const baseURL = stringOf(current.provider.baseURL) ?? null;
	const conflicts = conflictsOf(current.provider);
	return {
		credential: {
			selectedRef: selected.ref,
			configured: selected.info.configured,
			writable: selected.info.writable,
			source: selected.info.source ?? null,
			requiresChoice: configuredRef === undefined && configured.length > 1 && distinctValues.size > 1,
			candidates: candidates.map((candidate) => ({
				ref: candidate.ref,
				configured: candidate.info.configured,
				writable: candidate.info.writable,
				source: candidate.info.source ?? null,
			})),
		},
		configuration: {
			revision: current.revision,
			writable: options.settings.writable !== false && current.revision !== null,
			api,
			baseURL,
			models,
			ready:
				selected.info.configured &&
				api === OPENCODE_GO_API &&
				baseURL?.replace(/\/+$/u, "") === OPENCODE_GO_BASE_URL &&
				models.length > 0 &&
				conflicts.length === 0,
			conflicts,
		},
		call: options.callStatus(),
	};
}

export function createOpenCodeGoConnectionController(options: ControllerOptions): OpenCodeGoConnectionController {
	return {
		status: (preferredRef) => connectionSnapshot(options, preferredRef),
		async models(preferredRef) {
			const status = await connectionSnapshot(options, preferredRef);
			if (!status.credential.configured) {
				throw new OpenCodeGoConnectionError("credential-missing", "Configure an OpenCode Go API key first", 409);
			}
			const resolved = await options.credentials.resolve(credentialName(status.credential.selectedRef));
			if (resolved === undefined) {
				throw new OpenCodeGoConnectionError("credential-missing", "OpenCode Go API key is unavailable", 409);
			}
			const response = await (options.fetchImpl ?? fetch)(`${OPENCODE_GO_BASE_URL}/models`, {
				headers: { authorization: `Bearer ${resolved.value}`, accept: "application/json" },
				redirect: "error",
			});
			if (!response.ok) {
				const code =
					response.status === 401 || response.status === 403 ? "credential-rejected" : "model-directory-failed";
				throw new OpenCodeGoConnectionError(
					code,
					`OpenCode Go model directory returned HTTP ${response.status}`,
					response.status,
				);
			}
			const models = modelsOf(await response.json());
			if (models.length === 0) {
				throw new OpenCodeGoConnectionError(
					"model-directory-empty",
					"OpenCode Go model directory returned no usable models",
					502,
				);
			}
			return models;
		},
		async saveCredential(input) {
			const ref = credentialName(input.credentialRef);
			const apiKey = apiKeyOf(input.apiKey);
			if (apiKey === undefined) {
				const info = await options.credentials.describe(ref);
				if (!info.configured) {
					throw new OpenCodeGoConnectionError(
						"credential-missing",
						"The selected OpenCode Go credential is not configured",
						409,
					);
				}
			} else {
				await options.credentials.set(ref, apiKey);
			}
			return connectionSnapshot(options, input.credentialRef);
		},
		async applyConfiguration(input) {
			const ref = credentialName(input.credentialRef);
			const info = await options.credentials.describe(ref);
			if (!info.configured) {
				throw new OpenCodeGoConnectionError("credential-missing", "Configure an OpenCode Go API key first", 409);
			}
			if (!Number.isSafeInteger(input.expectedRevision) || input.expectedRevision < 0) {
				throw new OpenCodeGoConnectionError("invalid-revision", "OpenCode Go settings revision is invalid", 400);
			}
			const model = modelOf(input.model);
			if (model === undefined) {
				throw new OpenCodeGoConnectionError("invalid-model", "Choose or enter an OpenCode Go model", 400);
			}
			const current = settingsSnapshot(options.settings);
			if (current.revision === null) {
				throw new OpenCodeGoConnectionError("settings-unavailable", "DSH model settings are unavailable", 503);
			}
			const conflicts = conflictsOf(current.provider);
			if (conflicts.length > 0 && input.confirmConflicts !== true) {
				throw new OpenCodeGoConnectionError(
					"configuration-conflict",
					"Review the existing OpenCode Go protocol, endpoint, or static session header before applying",
					409,
				);
			}
			const ops: SettingsPathOp[] = [
				{ op: "set", path: ["providers", "opencode-go", "apiKeyEnv"], value: input.credentialRef },
				{ op: "set", path: ["providers", "opencode-go", "api"], value: OPENCODE_GO_API },
				{ op: "set", path: ["providers", "opencode-go", "baseURL"], value: OPENCODE_GO_BASE_URL },
				{ op: "set", path: ["providers", "opencode-go", "models"], value: mergedModels(current.provider, model) },
			];
			if (conflicts.includes("static-session-header")) {
				const headers = filteredHeaders(current.provider) ?? {};
				ops.push(
					Object.keys(headers).length === 0
						? { op: "unset", path: ["providers", "opencode-go", "headers"] }
						: { op: "set", path: ["providers", "opencode-go", "headers"], value: headers },
				);
			}
			await options.settings.mutate("llm-pi-ai", ops, input.expectedRevision);
			return connectionSnapshot(options, input.credentialRef);
		},
	} as OpenCodeGoConnectionController;
}

export interface OpenCodeGoConnectionRouteContext {
	readonly webServer: {
		register(route: {
			readonly kind: "exact" | "prefix";
			readonly path: string;
			readonly handler: (req: IncomingMessage, res: ServerResponse) => void | Promise<void>;
		}): () => void;
	};
	effect(callback: () => () => void | Promise<void>, label?: string): unknown;
}

function writeJson(res: ServerResponse, status: number, value: unknown): void {
	const body = Buffer.from(`${JSON.stringify(value)}\n`);
	res.writeHead(status, {
		"content-type": "application/json; charset=utf-8",
		"content-length": body.byteLength,
		"cache-control": "no-store",
	});
	res.end(body);
}

function errorResponse(res: ServerResponse, error: unknown): void {
	if (error instanceof OpenCodeGoConnectionError) {
		writeJson(res, error.status, { error: error.message, code: error.code });
		return;
	}
	if (typeof error === "object" && error !== null && "code" in error && error.code === "SETTINGS_CONFLICT") {
		writeJson(res, 409, { error: "DSH model settings changed; reload and retry", code: "settings-conflict" });
		return;
	}
	writeJson(res, 500, { error: safeMessage(error), code: "opencode-go-failed" });
}

async function handleConnectionRoute(
	req: IncomingMessage,
	res: ServerResponse,
	controller: OpenCodeGoConnectionController,
	ownerRequestPolicy: OwnerRequestPolicy,
): Promise<void> {
	if (!authorizeCodingOAuthRequest(req, ownerRequestPolicy).authorized) {
		writeJson(res, 403, { error: "forbidden", code: "forbidden" });
		return;
	}
	try {
		const url = new URL(req.url ?? OPENCODE_GO_CONNECTION_PATH, "http://owner.invalid");
		if (req.method === "GET") {
			const preferredRef = url.searchParams.get("credentialRef") ?? undefined;
			const status = await controller.status(preferredRef);
			if (url.searchParams.get("models") === "1") {
				writeJson(res, 200, { status, models: await controller.models(preferredRef) });
			} else {
				writeJson(res, 200, status);
			}
			return;
		}
		if (req.method !== "POST") {
			writeJson(res, 405, { error: "method not allowed", code: "method-not-allowed" });
			return;
		}
		const body = recordOf(await readJsonRequest(req)) ?? {};
		const action = stringOf(body.action);
		if (action === "credential") {
			const apiKey = apiKeyOf(body.apiKey);
			writeJson(
				res,
				200,
				await controller.saveCredential({
					credentialRef: String(body.credentialRef ?? ""),
					...(apiKey === undefined ? {} : { apiKey }),
				}),
			);
			return;
		}
		if (action === "apply") {
			writeJson(
				res,
				200,
				await controller.applyConfiguration({
					credentialRef: String(body.credentialRef ?? ""),
					model: modelOf(body.model) ?? { id: "" },
					expectedRevision: Number(body.expectedRevision),
					confirmConflicts: body.confirmConflicts === true,
				}),
			);
			return;
		}
		throw new OpenCodeGoConnectionError("invalid-action", "OpenCode Go action must be credential or apply", 400);
	} catch (error) {
		errorResponse(res, error);
	}
}

export function registerOpenCodeGoConnectionRoute(
	ctx: OpenCodeGoConnectionRouteContext,
	controller: OpenCodeGoConnectionController,
	ownerRequestPolicy: OwnerRequestPolicy,
): () => void {
	let dispose = (): void => undefined;
	ctx.effect(() => {
		dispose = registerWebRouteSetupAtomically(ctx.webServer, (webServer) => {
			webServer.register({
				kind: "exact",
				path: OPENCODE_GO_CONNECTION_PATH,
				handler: (req, res) => handleConnectionRoute(req, res, controller, ownerRequestPolicy),
			});
		});
		return dispose;
	}, "dsh-coding-oauth: OpenCode Go connection route");
	return () => dispose();
}
