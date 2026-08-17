/**
 * OAuth Device Authorization Grant framework (RFC 8628) for providers that
 * support it; currently GitHub Copilot.
 * The token is stored through the Harness credential seam and never logged.
 */

import { nonEmptyString } from "../normalize.js";
import { DEFAULT_TIMEOUT_MS, fetchWithPolicy, MAX_RESPONSE_BYTES, parseTextResponse } from "../transport.js";
import type { AccountDeps, CredentialResolver, FetchInitLike } from "../types.js";

const DEFAULT_POLL_INTERVAL_MS = 5000;
const MAX_POLL_ATTEMPTS = 120; // 10 minutes at 5s intervals

export interface DeviceFlowProvider {
	readonly id: string;
	readonly ref: string;
	readonly deviceCodeUrl: string;
	readonly tokenUrl: string;
	readonly clientId: string;
	readonly scope: string;
}

export interface DeviceCode {
	readonly deviceCode: string;
	readonly userCode: string;
	readonly verificationUri: string;
	readonly expiresIn: number;
	readonly interval: number;
}

export interface DeviceFlowResult {
	readonly ok: boolean;
	readonly ref?: string;
	readonly error?: string;
	readonly userCode: string;
	readonly verificationUri: string;
}

/** GitHub Copilot device-flow endpoints; the OAuth client ID must be configured by the operator. */
const GITHUB_COPILOT: DeviceFlowProvider = {
	id: "copilot",
	ref: "GITHUB_COPILOT_TOKEN",
	deviceCodeUrl: "https://github.com/login/device/code",
	tokenUrl: "https://github.com/login/oauth/access_token",
	clientId: "",
	scope: "read:user",
};

const PROVIDERS: Record<string, DeviceFlowProvider> = {
	copilot: GITHUB_COPILOT,
};

interface DeviceFlowError extends Error {
	httpStatus?: number;
	body?: unknown;
}

async function requestDeviceJson(url: string, init: FetchInitLike, deps: AccountDeps): Promise<unknown> {
	const fetchImpl = fetchWithPolicy({ enforceSameOrigin: false }, deps);
	const response = await fetchImpl(url, {
		...init,
		redirect: "manual",
		signal: AbortSignal.timeout(deps.timeoutMs ?? DEFAULT_TIMEOUT_MS),
	});
	const text = await parseTextResponse(response, deps.maxResponseBytes ?? MAX_RESPONSE_BYTES);
	let body: unknown;
	try {
		body = JSON.parse(text);
	} catch {
		// GitHub may return application/x-www-form-urlencoded.
		body = Object.fromEntries(new URLSearchParams(text).entries());
	}
	if (!response.ok) {
		const error = new Error(`HTTP ${response.status}`) as DeviceFlowError;
		error.httpStatus = response.status;
		error.body = body;
		throw error;
	}
	return body;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
	return value !== null && typeof value === "object" && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: undefined;
}

function deviceFlowProvider(providerId: string, deps: AccountDeps): DeviceFlowProvider {
	const provider = PROVIDERS[providerId];
	if (provider === undefined) throw new Error(`unknown device-flow provider: ${providerId}`);
	const clientId = nonEmptyString(deps.oauthClientIds?.[providerId]);
	if (clientId === null) throw new Error(`device-flow provider is not configured: ${providerId}`);
	return { ...provider, clientId };
}

/** Request a device code from the provider. */
export async function requestDeviceCode(providerId: string, deps: AccountDeps = {}): Promise<DeviceCode> {
	const provider = deviceFlowProvider(providerId, deps);
	const body = await requestDeviceJson(
		provider.deviceCodeUrl,
		{
			method: "POST",
			headers: { accept: "application/json", "content-type": "application/json" },
			body: JSON.stringify({ client_id: provider.clientId, scope: provider.scope }),
		},
		deps,
	);
	const root = asRecord(body);
	const deviceCode = nonEmptyString(root?.device_code);
	const userCode = nonEmptyString(root?.user_code);
	const verificationUri = nonEmptyString(root?.verification_uri);
	if (deviceCode === null || userCode === null || verificationUri === null) {
		throw new Error("device code response missing required fields");
	}
	return {
		deviceCode,
		userCode,
		verificationUri,
		expiresIn: Number.isFinite(root?.expires_in) ? Number(root?.expires_in) : 900,
		interval: Number.isFinite(root?.interval) ? Number(root?.interval) : DEFAULT_POLL_INTERVAL_MS / 1000,
	};
}

/**
 * Poll the token endpoint once. Returns the access token if authorized,
 * null if still pending, or throws on terminal errors.
 */
export async function pollTokenOnce(
	providerId: string,
	deviceCode: string,
	deps: AccountDeps = {},
): Promise<string | null> {
	const provider = deviceFlowProvider(providerId, deps);
	try {
		const body = await requestDeviceJson(
			provider.tokenUrl,
			{
				method: "POST",
				headers: { accept: "application/json", "content-type": "application/json" },
				body: JSON.stringify({
					client_id: provider.clientId,
					device_code: deviceCode,
					grant_type: "urn:ietf:params:oauth:grant-type:device_code",
				}),
			},
			deps,
		);
		const root = asRecord(body);
		const token = nonEmptyString(root?.access_token);
		if (token !== null) return token;
		const errorCode = nonEmptyString(root?.error);
		if (errorCode === "authorization_pending" || errorCode === "slow_down") return null;
		if (errorCode === "expired_token") throw new Error("device code expired");
		if (errorCode === "access_denied") throw new Error("user denied authorization");
		if (errorCode !== null) throw new Error(`oauth error: ${errorCode}`);
		return null;
	} catch (error) {
		// GitHub returns 400 with an error field for the pending state.
		const failure = error as DeviceFlowError;
		if (failure?.httpStatus === 400) {
			const errorCode = nonEmptyString(asRecord(failure.body)?.error);
			if (errorCode === "authorization_pending" || errorCode === "slow_down") return null;
			if (errorCode === "expired_token") throw new Error("device code expired");
			if (errorCode === "access_denied") throw new Error("user denied authorization");
		}
		throw error;
	}
}

/**
 * Run the full device flow: request code → poll until complete or timeout.
 * For the plugin, the UI may instead call `requestDeviceCode` once and drive
 * `pollTokenOnce` in a loop.
 */
export async function runDeviceFlow(
	providerId: string,
	credentials: CredentialResolver | undefined,
	deps: AccountDeps = {},
): Promise<DeviceFlowResult> {
	const code = await requestDeviceCode(providerId, deps);
	const intervalMs = Math.max(1000, (code.interval ?? 5) * 1000);
	const maxAttempts = Math.min(MAX_POLL_ATTEMPTS, Math.ceil((code.expiresIn * 1000) / intervalMs));

	for (let attempt = 0; attempt < maxAttempts; attempt++) {
		await new Promise((resolve) => setTimeout(resolve, intervalMs));
		try {
			const token = await pollTokenOnce(providerId, code.deviceCode, deps);
			if (token !== null) {
				const provider = deviceFlowProvider(providerId, deps);
				if (credentials !== undefined && typeof credentials.set === "function") {
					await credentials.set(provider.ref, token);
				}
				return { ok: true, ref: provider.ref, userCode: code.userCode, verificationUri: code.verificationUri };
			}
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			if (message.includes("expired") || message.includes("denied")) {
				return { ok: false, error: message, userCode: code.userCode, verificationUri: code.verificationUri };
			}
			// Transient errors: keep polling.
		}
	}
	return { ok: false, error: "timeout", userCode: code.userCode, verificationUri: code.verificationUri };
}

/** List provider ids that support the device flow. */
export function supportedDeviceFlowProviders(): string[] {
	return Object.keys(PROVIDERS);
}

/** Get the credential ref for a device-flow provider. */
export function deviceFlowCredentialRef(providerId: string): string | null {
	return PROVIDERS[providerId]?.ref ?? null;
}
