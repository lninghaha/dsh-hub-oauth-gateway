/**
 * Shared error type carrying the raw provider-status classification.
 * Kept dependency-free so both the security and transport seams can use it.
 */

import type { ProviderStatus } from "./types.js";

export class ProviderError extends Error {
	readonly providerStatus: ProviderStatus;
	readonly httpStatus?: number;

	constructor(status: ProviderStatus, message: string, httpStatus?: number) {
		super(message);
		this.name = "ProviderError";
		this.providerStatus = status;
		if (httpStatus !== undefined) this.httpStatus = httpStatus;
	}
}

export function isProviderError(error: unknown): error is ProviderError {
	return error instanceof ProviderError;
}

/** Read the numeric HTTP status carried by a thrown error, if any. */
export function httpStatusOf(error: unknown): number | null {
	const carrier = error as { httpStatus?: unknown } | null;
	return typeof carrier?.httpStatus === "number" ? carrier.httpStatus : null;
}
