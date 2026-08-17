import { nonEmptyString, numberOrNull } from "./normalize.js";
import type { AccountAdapterRegistry } from "./registry.js";
import { assertRelativePath, SENSITIVE_HEADERS, validateExtractPointers } from "./security.js";
import type {
	AccountConfig,
	DeclarativeExtract,
	DeclarativeRequest,
	ExtractField,
	MonitorConfig,
	WarningThresholds,
} from "./types.js";

const CREDENTIAL_REF = /^[A-Z_][A-Z0-9_]*$/;
const MAX_MONITORS = 128;

function recordOf(value: unknown, label: string): Record<string, unknown> {
	if (value === null || typeof value !== "object" || Array.isArray(value))
		throw new Error(`${label} must be an object`);
	return value as Record<string, unknown>;
}

function optionalString(value: unknown, label: string): string | undefined {
	if (value === undefined) return undefined;
	const normalized = nonEmptyString(value);
	if (normalized === null) throw new Error(`${label} must be a non-empty string`);
	return normalized;
}

function optionalBoolean(value: unknown, label: string): boolean | undefined {
	if (value === undefined) return undefined;
	if (typeof value !== "boolean") throw new Error(`${label} must be a boolean`);
	return value;
}

function credentialRef(value: unknown, label: string): string | undefined {
	const ref = optionalString(value, label);
	if (ref !== undefined && !CREDENTIAL_REF.test(ref))
		throw new Error(`${label} must be an uppercase credential reference`);
	return ref;
}

function usageUrl(value: unknown, allowInsecure: boolean, label: string): string | undefined {
	const raw = optionalString(value, label);
	if (raw === undefined) return undefined;
	let url: URL;
	try {
		url = new URL(raw);
	} catch {
		throw new Error(`${label} must be a valid URL`);
	}
	if (url.username !== "" || url.password !== "") throw new Error(`${label} must not contain credentials`);
	if (url.protocol !== "https:" && !(allowInsecure && url.protocol === "http:")) {
		throw new Error(`${label} must use HTTPS unless allowInsecure is true`);
	}
	return url.href;
}

function warningOf(value: unknown, label: string): WarningThresholds | undefined {
	if (value === undefined) return undefined;
	const input = recordOf(value, label);
	const warnBelow = input.warnBelow === undefined ? undefined : numberOrNull(input.warnBelow);
	const criticalBelow = input.criticalBelow === undefined ? undefined : numberOrNull(input.criticalBelow);
	if (input.warnBelow !== undefined && warnBelow === null) throw new Error(`${label}.warnBelow must be numeric`);
	if (input.criticalBelow !== undefined && criticalBelow === null)
		throw new Error(`${label}.criticalBelow must be numeric`);
	if (warnBelow !== undefined && warnBelow !== null && warnBelow < 0)
		throw new Error(`${label}.warnBelow must be nonnegative`);
	if (criticalBelow !== undefined && criticalBelow !== null && criticalBelow < 0) {
		throw new Error(`${label}.criticalBelow must be nonnegative`);
	}
	if (
		warnBelow !== undefined &&
		warnBelow !== null &&
		criticalBelow !== undefined &&
		criticalBelow !== null &&
		criticalBelow > warnBelow
	) {
		throw new Error(`${label}.criticalBelow must not exceed warnBelow`);
	}
	return {
		...(warnBelow === undefined || warnBelow === null ? {} : { warnBelow }),
		...(criticalBelow === undefined || criticalBelow === null ? {} : { criticalBelow }),
	};
}

function fieldOf(value: unknown, label: string): ExtractField | undefined {
	if (value === undefined) return undefined;
	if (typeof value === "string") return value;
	const input = recordOf(value, label);
	const pointer = optionalString(input.pointer, `${label}.pointer`);
	if (pointer === undefined) throw new Error(`${label}.pointer is required`);
	const divisor = input.divisor === undefined ? undefined : numberOrNull(input.divisor);
	if (input.divisor !== undefined && (divisor === null || divisor === 0))
		throw new Error(`${label}.divisor must be non-zero`);
	return { pointer, ...(divisor === undefined || divisor === null ? {} : { divisor }) };
}

function extractOf(value: unknown, label: string): DeclarativeExtract {
	const input = recordOf(value, label);
	validateExtractPointers(input, label.replace(/\.extract$/, ""));
	const output: Record<string, unknown> = {};
	for (const key of [
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
	] as const) {
		const field = fieldOf(input[key], `${label}.${key}`);
		if (field !== undefined) output[key] = field;
	}
	const currencyValue = optionalString(input.currencyValue, `${label}.currencyValue`);
	if (currencyValue !== undefined) output.currencyValue = currencyValue;
	if (input.divisor !== undefined) {
		const divisor = numberOrNull(input.divisor);
		if (divisor === null || divisor === 0) throw new Error(`${label}.divisor must be non-zero`);
		output.divisor = divisor;
	}
	return output as DeclarativeExtract;
}

function requestOf(value: unknown, label: string): DeclarativeRequest {
	const input = recordOf(value, label);
	assertRelativePath(input.path, `${label}.path`);
	if (input.method !== undefined && input.method !== "GET") throw new Error(`${label}.method must be GET`);
	let auth: DeclarativeRequest["auth"];
	if (input.auth !== undefined) {
		const raw = recordOf(input.auth, `${label}.auth`);
		if (raw.type !== "bearer" && raw.type !== "raw" && raw.type !== "x-api-key") {
			throw new Error(`${label}.auth.type is unsupported`);
		}
		auth = {
			type: raw.type,
			...(credentialRef(raw.credentialRef, `${label}.auth.credentialRef`) === undefined
				? {}
				: { credentialRef: credentialRef(raw.credentialRef, `${label}.auth.credentialRef`) }),
		};
	}
	const headers: Record<string, string> = {};
	if (input.headers !== undefined) {
		for (const [name, raw] of Object.entries(recordOf(input.headers, `${label}.headers`))) {
			if (SENSITIVE_HEADERS.has(name.toLowerCase())) throw new Error(`${label}.headers cannot override ${name}`);
			if (typeof raw !== "string") throw new Error(`${label}.headers.${name} must be a string`);
			headers[name] = raw;
		}
	}
	return {
		path: input.path as string,
		...(auth === undefined ? {} : { auth }),
		...(Object.keys(headers).length === 0 ? {} : { headers }),
	};
}

function monitorOf(key: string, value: unknown, registry: AccountAdapterRegistry): MonitorConfig {
	const label = `monitors.${key}`;
	const input = recordOf(value, label);
	const providerId = optionalString(input.providerId, `${label}.providerId`) ?? key;
	const adapter = optionalString(input.adapter, `${label}.adapter`);
	if (adapter === undefined || !registry.has(adapter)) throw new Error(`${label}.adapter is unsupported`);
	const allowInsecure = optionalBoolean(input.allowInsecure, `${label}.allowInsecure`) ?? false;
	const mode = input.mode;
	if (mode !== undefined && mode !== "balance" && mode !== "subscription") {
		throw new Error(`${label}.mode must be balance or subscription`);
	}
	const monitor: MonitorConfig = {
		providerId,
		adapter,
		...(mode === undefined ? {} : { mode }),
		...(credentialRef(input.credentialRef, `${label}.credentialRef`) === undefined
			? {}
			: { credentialRef: credentialRef(input.credentialRef, `${label}.credentialRef`) }),
		...(usageUrl(input.usageBaseURL, allowInsecure, `${label}.usageBaseURL`) === undefined
			? {}
			: { usageBaseURL: usageUrl(input.usageBaseURL, allowInsecure, `${label}.usageBaseURL`) }),
		...(allowInsecure ? { allowInsecure: true } : {}),
		...(optionalBoolean(input.allowCrossOrigin, `${label}.allowCrossOrigin`) === true
			? { allowCrossOrigin: true }
			: {}),
		...(optionalBoolean(input.allowPrivateNetwork, `${label}.allowPrivateNetwork`) === true
			? { allowPrivateNetwork: true }
			: {}),
		...(optionalString(input.region, `${label}.region`) === undefined
			? {}
			: { region: optionalString(input.region, `${label}.region`) }),
		...(warningOf(input.warning, `${label}.warning`) === undefined
			? {}
			: { warning: warningOf(input.warning, `${label}.warning`) }),
		...(credentialRef(input.fallbackCredentialRef, `${label}.fallbackCredentialRef`) === undefined
			? {}
			: { fallbackCredentialRef: credentialRef(input.fallbackCredentialRef, `${label}.fallbackCredentialRef`) }),
		...(credentialRef(input.fallbackUserIdRef, `${label}.fallbackUserIdRef`) === undefined
			? {}
			: { fallbackUserIdRef: credentialRef(input.fallbackUserIdRef, `${label}.fallbackUserIdRef`) }),
	};
	if (adapter === "declarative") {
		if (mode === undefined) throw new Error(`${label}.mode is required for declarative monitors`);
		const request = requestOf(input.request, `${label}.request`);
		const extract = extractOf(input.extract, `${label}.extract`);
		if (mode === "balance" && extract.remaining === undefined && extract.total === undefined) {
			throw new Error(`${label}.extract requires remaining or total`);
		}
		if (mode === "subscription" && extract.items === undefined) {
			throw new Error(`${label}.extract.items is required`);
		}
		return { ...monitor, request, extract };
	}
	return monitor;
}

export function validateAccountConfig(raw: unknown, registry: AccountAdapterRegistry): AccountConfig {
	const input = raw === undefined ? {} : recordOf(raw, "account config");
	const monitorsInput = input.monitors === undefined ? {} : recordOf(input.monitors, "monitors");
	const entries = Object.entries(monitorsInput);
	if (entries.length > MAX_MONITORS) throw new Error(`monitors must contain at most ${MAX_MONITORS} entries`);
	const monitors: Record<string, MonitorConfig> = {};
	for (const [key, value] of entries) {
		const id = nonEmptyString(key);
		if (id === null || id.length > 128) throw new Error("monitor ids must be non-empty and at most 128 characters");
		const monitor = monitorOf(id, value, registry);
		const providerId = monitor.providerId ?? id;
		if (monitors[providerId] !== undefined) throw new Error(`duplicate monitor providerId "${providerId}"`);
		monitors[providerId] = monitor;
	}
	return { monitors };
}
