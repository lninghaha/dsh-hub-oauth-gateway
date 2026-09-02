import type { ZodType } from "zod";
import type { ApiResponse } from "../shared/contracts.js";
import { ApiMetaSchema } from "../shared/contracts.js";
import { hubApiHeaders } from "./hub-headers.js";

export class UsageStatsApiError extends Error {
	readonly code: string;
	readonly status: number;

	constructor(code: string, message: string, status: number) {
		super(message);
		this.name = "UsageStatsApiError";
		this.code = code;
		this.status = status;
	}
}

function apiError(payload: unknown, status: number): UsageStatsApiError {
	if (payload !== null && typeof payload === "object" && "error" in payload) {
		const error = (payload as { error?: unknown }).error;
		if (typeof error === "string" && error !== "") return new UsageStatsApiError(error, error, status);
		if (error !== null && typeof error === "object") {
			const value = error as { code?: unknown; message?: unknown };
			const code = typeof value.code === "string" && value.code !== "" ? value.code : "http-error";
			const message = typeof value.message === "string" && value.message !== "" ? value.message : `HTTP ${status}`;
			return new UsageStatsApiError(code, message, status);
		}
	}
	return new UsageStatsApiError("http-error", `HTTP ${status}`, status);
}

export async function fetchApi<T>(
	url: string,
	schema: ZodType<T>,
	init: RequestInit = {},
	signal?: AbortSignal,
): Promise<ApiResponse<T>> {
	const write = init.method !== undefined && init.method !== "GET";
	const requestInit: RequestInit = { ...init, headers: hubApiHeaders(url, write, init.headers) };
	if (signal !== undefined) requestInit.signal = signal;
	const response = await fetch(url, requestInit);
	const payload: unknown = await response.json();
	if (!response.ok) throw apiError(payload, response.status);
	if (payload === null || typeof payload !== "object" || !("ok" in payload)) throw apiError(payload, response.status);
	if ((payload as { ok: unknown }).ok !== true) return payload as ApiResponse<T>;
	const success = payload as { ok: true; data: unknown; meta: unknown };
	return {
		ok: true,
		data: schema.parse(success.data),
		meta: ApiMetaSchema.parse(success.meta),
	};
}

export async function mutateApi<TBody, T>(
	url: string,
	method: "POST" | "PUT" | "DELETE",
	body: TBody,
	schema: ZodType<T>,
	signal?: AbortSignal,
): Promise<ApiResponse<T>> {
	return fetchApi(url, schema, { method, body: JSON.stringify(body) }, signal);
}
