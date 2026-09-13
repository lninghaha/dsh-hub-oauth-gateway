import type { IncomingMessage, ServerResponse } from "node:http";
import {
	type CredentialInfo,
	type CredentialProvider,
	type CredentialRef,
	credentialRef,
} from "@deepseek-ai/dsh-credentials";
import { OPENCODE_GO_LEGACY_PROVIDER_ID, OPENCODE_GO_PROVIDER_ID } from "../../shared/opencode-go-ids.js";
import { type GoApi, goBaseURL, isGoApi, protocolMismatch } from "../../shared/opencode-go-protocol.js";
import { authorizeCodingOAuthRequest } from "./authorize-request.js";
import { readJsonRequest } from "./http-json.js";
import type { OpenCodeGoStatus } from "./opencode-go-header.js";
import { safeMessage } from "./redact.js";
import type { OwnerRequestPolicy } from "./web-origin.js";
import { registerWebRouteSetupAtomically } from "./web-routes.js";

export const OPENCODE_GO_CONNECTION_PATH = "/plugins/dsh-grok-build/opencode-go";
export const OPENCODE_GO_BASE_URL = "https://opencode.ai/zen/go/v1";
export const OPENCODE_GO_API = "openai-completions";
export { OPENCODE_GO_LEGACY_PROVIDER_ID, OPENCODE_GO_PROVIDER_ID } from "../../shared/opencode-go-ids.js";

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
	readonly providerId: string;
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
	readonly legacy: {
		readonly providerId: string;
		readonly present: boolean;
		readonly migratable: boolean;
		readonly targetProviderId: string;
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
		readonly api?: GoApi;
		readonly credentialRef: string;
		readonly model: OpenCodeGoModel;
		readonly expectedRevision: number;
		readonly confirmConflicts: boolean;
	}): Promise<OpenCodeGoConnectionStatus>;
	migrateLegacyConfiguration(input?: {
		readonly expectedRevision?: number;
		readonly confirmConflicts?: boolean;
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

function providersMap(settings: OpenCodeGoSettingsProvider): {
	readonly revision: number | null;
	readonly providers: JsonRecord;
} {
	const descriptor = settings.describe({ redactSecrets: true }).find((entry) => entry.ns === "llm-pi-ai");
	const section = recordOf(descriptor?.value);
	return {
		revision: typeof descriptor?.revision === "number" ? descriptor.revision : null,
		providers: recordOf(section?.providers) ?? {},
	};
}

function settingsSnapshot(settings: OpenCodeGoSettingsProvider): {
	readonly revision: number | null;
	readonly provider: JsonRecord;
	readonly legacy: JsonRecord;
} {
	const current = providersMap(settings);
	return {
		revision: current.revision,
		provider: recordOf(current.providers[OPENCODE_GO_PROVIDER_ID]) ?? {},
		legacy: recordOf(current.providers[OPENCODE_GO_LEGACY_PROVIDER_ID]) ?? {},
	};
}

/** Detect prior plugin takeover of the pi-ai builtin `opencode-go` slot. */
function isPluginShapedLegacy(provider: JsonRecord): boolean {
	if (Object.keys(provider).length === 0) return false;
	const api = stringOf(provider.api);
	const baseURL = stringOf(provider.baseURL)?.replace(/\/+$/u, "");
	const apiKeyEnv = stringOf(provider.apiKeyEnv);
	const hasModels = modelsOf(provider.models).length > 0;
	const matchesBase = baseURL === "https://opencode.ai/zen/go/v1" || baseURL === "https://opencode.ai/zen/go";
	const knownRef = apiKeyEnv !== undefined && (KNOWN_CREDENTIAL_REFS as readonly string[]).includes(apiKeyEnv);
	return (isGoApi(api) && (matchesBase || hasModels || knownRef)) || (matchesBase && hasModels);
}

function legacyMigrationState(legacy: JsonRecord, primary: JsonRecord) {
	const present = isPluginShapedLegacy(legacy);
	const primaryReady =
		stringOf(primary.apiKeyEnv) !== undefined ||
		modelsOf(primary.models).length > 0 ||
		stringOf(primary.api) !== undefined;
	return {
		providerId: OPENCODE_GO_LEGACY_PROVIDER_ID,
		present,
		migratable: present && !primaryReady,
		targetProviderId: OPENCODE_GO_PROVIDER_ID,
	};
}

function copyProviderOps(from: JsonRecord, expectedApi?: GoApi): SettingsPathOp[] {
	const api = (expectedApi ?? stringOf(from.api)) as GoApi | undefined;
	const ops: SettingsPathOp[] = [];
	const apiKeyEnv = stringOf(from.apiKeyEnv);
	if (apiKeyEnv !== undefined)
		ops.push({ op: "set", path: ["providers", OPENCODE_GO_PROVIDER_ID, "apiKeyEnv"], value: apiKeyEnv });
	if (isGoApi(api)) {
		ops.push({ op: "set", path: ["providers", OPENCODE_GO_PROVIDER_ID, "api"], value: api });
		ops.push({ op: "set", path: ["providers", OPENCODE_GO_PROVIDER_ID, "baseURL"], value: goBaseURL(api) });
	}
	const catalog = modelsOf(from.models);
	if (catalog.length > 0)
		ops.push({
			op: "set",
			path: ["providers", OPENCODE_GO_PROVIDER_ID, "models"],
			value: catalog,
		});
	return ops;
}

function conflictsOf(provider: JsonRecord, desired?: GoApi): ConfigurationConflict[] {
	const conflicts: ConfigurationConflict[] = [];
	const api = stringOf(provider.api);
	const baseURL = stringOf(provider.baseURL);
	if (api !== undefined && (!isGoApi(api) || (desired !== undefined && api !== desired))) conflicts.push("protocol");
	if (
		baseURL !== undefined &&
		baseURL.replace(/\/+$/u, "") !== goBaseURL(desired ?? (isGoApi(api) ? api : OPENCODE_GO_API))
	)
		conflicts.push("base-url");
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

function mergedModels(provider: JsonRecord, selected: OpenCodeGoModel): unknown[] {
	const existing = Array.isArray(provider.models) ? provider.models : [];
	// 列表 DTO 只用于展示，不能用它重建用户的完整宿主模型配置。
	return existing.some((entry) => recordOf(entry)?.id === selected.id)
		? structuredClone(existing)
		: [...structuredClone(existing), selected];
}

interface ControllerOptions {
	readonly credentials: CredentialProvider;
	readonly settings: OpenCodeGoSettingsProvider;
	readonly callStatus: () => OpenCodeGoStatus;
	onConfigurationChange?: () => void;
	readonly fetchImpl?: typeof fetch;
}

async function connectionSnapshot(
	options: ControllerOptions,
	preferredRef?: string,
): Promise<OpenCodeGoConnectionStatus> {
	const current = settingsSnapshot(options.settings);
	const credentialSource =
		Object.keys(current.provider).length > 0
			? current.provider
			: isPluginShapedLegacy(current.legacy)
				? current.legacy
				: current.provider;
	const candidates = await credentialCandidates(options.credentials, credentialSource);
	const configured = candidates.filter((candidate) => candidate.info.configured);
	const configuredRef = stringOf(current.provider.apiKeyEnv) ?? stringOf(credentialSource.apiKeyEnv);
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
	if (
		isGoApi(api) &&
		protocolMismatch(
			models.map((model) => model.id),
			api,
		) &&
		!conflicts.includes("protocol")
	)
		conflicts.push("protocol");
	return {
		providerId: OPENCODE_GO_PROVIDER_ID,
		credential: {
			selectedRef: selected.ref,
			configured: selected.info.configured,
			writable: selected.info.writable,
			source: selected.info.source ?? null,
			requiresChoice:
				stringOf(current.provider.apiKeyEnv) === undefined && configured.length > 1 && distinctValues.size > 1,
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
				selected.ref === stringOf(current.provider.apiKeyEnv) &&
				selected.info.configured &&
				isGoApi(api) &&
				baseURL?.replace(/\/+$/u, "") === goBaseURL(api) &&
				models.length > 0 &&
				conflicts.length === 0,
			conflicts,
		},
		legacy: legacyMigrationState(current.legacy, current.provider),
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
				if (!(await options.credentials.describe(ref)).writable)
					throw new OpenCodeGoConnectionError(
						"credential-readonly",
						"The selected credential source is read-only",
						403,
					);
				await options.credentials.set(ref, apiKey);
				options.onConfigurationChange?.();
			}
			return connectionSnapshot(options, input.credentialRef);
		},
		async migrateLegacyConfiguration(input) {
			const current = settingsSnapshot(options.settings);
			if (options.settings.writable === false)
				throw new OpenCodeGoConnectionError("settings-readonly", "DSH settings are read-only", 403);
			if (current.revision === null)
				throw new OpenCodeGoConnectionError("settings-unavailable", "DSH model settings are unavailable", 503);
			const migration = legacyMigrationState(current.legacy, current.provider);
			if (!migration.present)
				throw new OpenCodeGoConnectionError(
					"legacy-missing",
					"No plugin-shaped OpenCode Go configuration was found under the legacy provider id",
					404,
				);
			if (!migration.migratable)
				throw new OpenCodeGoConnectionError(
					"legacy-already-migrated",
					"Isolated OpenCode Go settings already exist; clear them before migrating the legacy provider",
					409,
				);
			const api = stringOf(current.legacy.api);
			if (api !== undefined && !isGoApi(api))
				throw new OpenCodeGoConnectionError("invalid-protocol", "Legacy OpenCode Go protocol is unsupported", 400);
			const conflicts = conflictsOf(current.legacy, isGoApi(api) ? api : undefined);
			if (conflicts.length > 0 && input?.confirmConflicts !== true)
				throw new OpenCodeGoConnectionError(
					"configuration-conflict",
					"Review legacy OpenCode Go settings before migrating",
					409,
				);
			const ops = copyProviderOps(current.legacy, isGoApi(api) ? api : undefined);
			if (ops.length === 0)
				throw new OpenCodeGoConnectionError(
					"legacy-empty",
					"Legacy OpenCode Go settings do not contain a migratable credential or model list",
					409,
				);
			if (conflicts.includes("static-session-header")) {
				const headers = recordOf(current.legacy.headers) ?? {};
				for (const key of Object.keys(headers))
					if (key.toLowerCase() === "x-opencode-session")
						ops.push({ op: "unset", path: ["providers", OPENCODE_GO_PROVIDER_ID, "headers", key] });
			}
			const revision =
				input?.expectedRevision !== undefined && Number.isSafeInteger(input.expectedRevision)
					? input.expectedRevision
					: current.revision;
			await options.settings.mutate("llm-pi-ai", ops, revision);
			options.onConfigurationChange?.();
			return connectionSnapshot(options, stringOf(current.legacy.apiKeyEnv));
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
			if (options.settings.writable === false)
				throw new OpenCodeGoConnectionError("settings-readonly", "DSH settings are read-only", 403);
			if (current.revision === null) {
				throw new OpenCodeGoConnectionError("settings-unavailable", "DSH model settings are unavailable", 503);
			}
			const api = input.api ?? OPENCODE_GO_API;
			if (!isGoApi(api)) throw new OpenCodeGoConnectionError("invalid-protocol", "Choose a supported Go protocol", 400);
			if (protocolMismatch([...modelsOf(current.provider.models).map((m) => m.id), model.id], api))
				throw new OpenCodeGoConnectionError(
					"model-protocol-mismatch",
					"Go uses one protocol per service. Remove models requiring another protocol in DSH model settings before applying this selection.",
					409,
				);
			const conflicts = conflictsOf(current.provider, api);
			if (conflicts.length > 0 && input.confirmConflicts !== true) {
				throw new OpenCodeGoConnectionError(
					"configuration-conflict",
					"Review the existing OpenCode Go protocol, endpoint, or static session header before applying",
					409,
				);
			}
			const ops: SettingsPathOp[] = [
				{ op: "set", path: ["providers", OPENCODE_GO_PROVIDER_ID, "apiKeyEnv"], value: input.credentialRef },
				{ op: "set", path: ["providers", OPENCODE_GO_PROVIDER_ID, "api"], value: api },
				{ op: "set", path: ["providers", OPENCODE_GO_PROVIDER_ID, "baseURL"], value: goBaseURL(api) },
				{
					op: "set",
					path: ["providers", OPENCODE_GO_PROVIDER_ID, "models"],
					value: mergedModels(current.provider, model),
				},
			];
			if (conflicts.includes("static-session-header")) {
				const headers = recordOf(current.provider.headers) ?? {};
				for (const key of Object.keys(headers))
					if (key.toLowerCase() === "x-opencode-session")
						ops.push({ op: "unset", path: ["providers", OPENCODE_GO_PROVIDER_ID, "headers", key] });
			}
			await options.settings.mutate("llm-pi-ai", ops, input.expectedRevision);
			options.onConfigurationChange?.();
			return connectionSnapshot(options, input.credentialRef);
		},
	};
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
		if (action === "migrate") {
			writeJson(
				res,
				200,
				await controller.migrateLegacyConfiguration({
					...(body.expectedRevision === undefined ? {} : { expectedRevision: Number(body.expectedRevision) }),
					confirmConflicts: body.confirmConflicts === true,
				}),
			);
			return;
		}
		if (action === "apply") {
			writeJson(
				res,
				200,
				await controller.applyConfiguration({
					...(body.api === undefined ? {} : { api: body.api as GoApi }),
					credentialRef: String(body.credentialRef ?? ""),
					model: modelOf(body.model) ?? { id: "" },
					expectedRevision: Number(body.expectedRevision),
					confirmConflicts: body.confirmConflicts === true,
				}),
			);
			return;
		}
		throw new OpenCodeGoConnectionError(
			"invalid-action",
			"OpenCode Go action must be credential, apply, or migrate",
			400,
		);
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
