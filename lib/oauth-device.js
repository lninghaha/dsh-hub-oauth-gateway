/**
 * OAuth Device Authorization Grant framework.
 *
 * Implements RFC 8628 device flow for providers that support it. The plugin
 * initiates a device code request, returns the user_code + verification_uri
 * to the UI for display, then polls the token endpoint until the user
 * completes authorization or the code expires.
 *
 * Currently implemented:
 *   - GitHub Copilot (github.com/login/device/code)
 *
 * @module dsh-usage-stats/oauth-device
 */

const DEFAULT_TIMEOUT_MS = 15000;
const DEFAULT_POLL_INTERVAL_MS = 5000;
const MAX_POLL_ATTEMPTS = 120; // 10 minutes at 5s intervals

/**
 * GitHub Copilot device flow.
 * Uses the same public client_id as VS Code Copilot Chat / CodexBar.
 */
const GITHUB_COPILOT = {
	id: "copilot",
	ref: "GITHUB_COPILOT_TOKEN",
	deviceCodeUrl: "https://github.com/login/device/code",
	tokenUrl: "https://github.com/login/oauth/access_token",
	clientId: "Ov23liQgpWkI7zFfFjGO",
	scope: "read:user"
};

const PROVIDERS = {
	copilot: GITHUB_COPILOT
};

function nonEmptyString(value) {
	return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

async function requestJson(url, init, deps = {}) {
	const response = await (deps.fetch ?? fetch)(url, {
		...init,
		signal: AbortSignal.timeout(deps.timeoutMs ?? DEFAULT_TIMEOUT_MS)
	});
	const contentType = response.headers?.get?.("content-type") ?? "";
	let body;
	if (contentType.includes("json")) {
		body = await response.json();
	} else {
		// GitHub returns application/x-www-form-urlencoded for some endpoints
		const text = await response.text();
		try {
			body = JSON.parse(text);
		} catch {
			// Parse form-encoded as fallback
			const params = new URLSearchParams(text);
			body = Object.fromEntries(params.entries());
		}
	}
	if (!response.ok) {
		const error = new Error(`HTTP ${response.status}`);
		error.httpStatus = response.status;
		error.body = body;
		throw error;
	}
	return body;
}

/**
 * Request a device code from the provider.
 * Returns { deviceCode, userCode, verificationUri, expiresIn, interval }.
 */
export async function requestDeviceCode(providerId, deps = {}) {
	const provider = PROVIDERS[providerId];
	if (provider === void 0) throw new Error(`unknown device-flow provider: ${providerId}`);

	const body = await requestJson(provider.deviceCodeUrl, {
		method: "POST",
		headers: { accept: "application/json", "content-type": "application/json" },
		body: JSON.stringify({ client_id: provider.clientId, scope: provider.scope })
	}, deps);

	const deviceCode = nonEmptyString(body?.device_code);
	const userCode = nonEmptyString(body?.user_code);
	const verificationUri = nonEmptyString(body?.verification_uri);
	if (deviceCode === null || userCode === null || verificationUri === null) {
		throw new Error("device code response missing required fields");
	}

	return {
		deviceCode,
		userCode,
		verificationUri,
		expiresIn: Number.isFinite(body?.expires_in) ? body.expires_in : 900,
		interval: Number.isFinite(body?.interval) ? body.interval : DEFAULT_POLL_INTERVAL_MS / 1000
	};
}

/**
 * Poll the token endpoint once. Returns the access token if authorized,
 * null if still pending, or throws on terminal errors.
 */
export async function pollTokenOnce(providerId, deviceCode, deps = {}) {
	const provider = PROVIDERS[providerId];
	if (provider === void 0) throw new Error(`unknown device-flow provider: ${providerId}`);

	try {
		const body = await requestJson(provider.tokenUrl, {
			method: "POST",
			headers: { accept: "application/json", "content-type": "application/json" },
			body: JSON.stringify({
				client_id: provider.clientId,
				device_code: deviceCode,
				grant_type: "urn:ietf:params:oauth:grant-type:device_code"
			})
		}, deps);

		const token = nonEmptyString(body?.access_token);
		if (token !== null) return token;

		const errorCode = nonEmptyString(body?.error);
		if (errorCode === "authorization_pending" || errorCode === "slow_down") return null;
		if (errorCode === "expired_token") throw new Error("device code expired");
		if (errorCode === "access_denied") throw new Error("user denied authorization");
		if (errorCode !== null) throw new Error(`oauth error: ${errorCode}`);
		return null;
	} catch (error) {
		// GitHub returns 400 with error field for pending state
		if (error?.httpStatus === 400) {
			const errorCode = nonEmptyString(error?.body?.error);
			if (errorCode === "authorization_pending" || errorCode === "slow_down") return null;
			if (errorCode === "expired_token") throw new Error("device code expired");
			if (errorCode === "access_denied") throw new Error("user denied authorization");
		}
		throw error;
	}
}

/**
 * Run the full device flow: request code → poll until complete or timeout.
 * Designed for server-side use where the UI drives polling via repeated calls.
 * For the plugin, the UI calls requestDeviceCode once, displays user_code,
 * then calls pollTokenOnce in a loop.
 */
export async function runDeviceFlow(providerId, credentials, deps = {}) {
	const code = await requestDeviceCode(providerId, deps);
	const intervalMs = Math.max(1000, (code.interval ?? 5) * 1000);
	const maxAttempts = Math.min(MAX_POLL_ATTEMPTS, Math.ceil((code.expiresIn * 1000) / intervalMs));

	for (let attempt = 0; attempt < maxAttempts; attempt++) {
		await new Promise((resolve) => setTimeout(resolve, intervalMs));
		try {
			const token = await pollTokenOnce(providerId, code.deviceCode, deps);
			if (token !== null) {
				const provider = PROVIDERS[providerId];
				if (credentials !== void 0 && typeof credentials.set === "function") {
					await credentials.set(provider.ref, token);
				}
				return { ok: true, ref: provider.ref, userCode: code.userCode, verificationUri: code.verificationUri };
			}
		} catch (error) {
			const msg = error instanceof Error ? error.message : String(error);
			if (msg.includes("expired") || msg.includes("denied")) {
				return { ok: false, error: msg, userCode: code.userCode, verificationUri: code.verificationUri };
			}
			// Transient errors: keep polling
		}
	}
	return { ok: false, error: "timeout", userCode: code.userCode, verificationUri: code.verificationUri };
}

/** List provider ids that support device flow. */
export function supportedDeviceFlowProviders() {
	return Object.keys(PROVIDERS);
}

/** Get the credential ref for a device-flow provider. */
export function deviceFlowCredentialRef(providerId) {
	return PROVIDERS[providerId]?.ref ?? null;
}
