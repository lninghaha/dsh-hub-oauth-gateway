/**
 * Declarative adapter: user-configured monitors whose request path is a
 * relative URL and whose response fields are extracted with RFC 6901 JSON
 * Pointers — never executable JavaScript.
 */

import { ProviderError } from "../errors.js";
import { booleanOrNull, nonEmptyString, numberOrNull, round1, toIso } from "../normalize.js";
import { isPrivateHostname, jsonPointer, mapped, SENSITIVE_HEADERS } from "../security.js";
import { requestJson, resolveCredential } from "../transport.js";
import type { AccountAdapter, AccountSpec, DeclarativeExtract, RawAccountResult, RawQuotaWindow } from "../types.js";

function customURL(spec: AccountSpec): string {
	const base = new URL(spec.baseURL ?? "");
	const providerBase = nonEmptyString(spec.providerBaseURL) === null ? null : new URL(spec.providerBaseURL as string);
	if (base.protocol !== "https:" && spec.monitor.allowInsecure !== true) {
		throw new ProviderError("unsupported", "custom monitor requires HTTPS");
	}
	if (isPrivateHostname(base.hostname) && spec.monitor.allowPrivateNetwork !== true) {
		throw new ProviderError("unsupported", "custom monitor private-network access requires allowPrivateNetwork");
	}
	if (providerBase !== null && base.origin !== providerBase.origin && spec.monitor.allowCrossOrigin !== true) {
		throw new ProviderError("unsupported", "custom monitor cross-origin access requires allowCrossOrigin");
	}
	const path = spec.monitor.request?.path ?? "/";
	const url = new URL(path, base);
	if (url.origin !== base.origin) {
		throw new ProviderError("unsupported", "custom monitor request must stay on its configured origin");
	}
	return url.href;
}

function customHeaders(spec: AccountSpec, credential: string): Record<string, string> {
	const headers: Record<string, string> = { accept: "application/json" };
	for (const [name, value] of Object.entries(spec.monitor.request?.headers ?? {})) {
		if (!SENSITIVE_HEADERS.has(name.toLowerCase()) && typeof value === "string") headers[name] = value;
	}
	const type = spec.monitor.request?.auth?.type;
	if (credential !== "") {
		if (type === "bearer") headers.authorization = `Bearer ${credential}`;
		if (type === "raw") headers.authorization = credential;
		if (type === "x-api-key") headers["x-api-key"] = credential;
	}
	return headers;
}

function customBalance(spec: AccountSpec, body: unknown): RawAccountResult {
	const extract = spec.monitor.extract ?? {};
	const root = jsonPointer(body, extract.root ?? "");
	if (root === undefined) throw new ProviderError("invalid-response", "custom response root is missing");
	const valid = mapped(root, extract.valid);
	if (valid === false) {
		throw new ProviderError(
			"invalid-response",
			String(mapped(root, extract.invalidMessage) ?? "custom response is marked invalid"),
		);
	}
	const divisor = numberOrNull(extract.divisor) ?? 1;
	const remainingRaw = numberOrNull(mapped(root, extract.remaining) ?? mapped(root, extract.total));
	if (remainingRaw === null) {
		throw new ProviderError("invalid-response", "custom response is missing a numeric balance");
	}
	const usedRaw = numberOrNull(mapped(root, extract.used));
	const totalRaw = numberOrNull(mapped(root, extract.total));
	return {
		status: "ok",
		plan: nonEmptyString(mapped(root, extract.plan)) ?? undefined,
		balance: {
			remaining: remainingRaw / divisor,
			...(usedRaw === null ? {} : { used: usedRaw / divisor }),
			...(totalRaw === null ? {} : { total: totalRaw / divisor }),
			currency: nonEmptyString(mapped(root, extract.currency)) ?? nonEmptyString(extract.currencyValue) ?? "USD",
			unlimited: booleanOrNull(mapped(root, extract.unlimited)) === true,
			expiresAt: toIso(mapped(root, extract.expiresAt)),
		},
	};
}

function customSubscription(spec: AccountSpec, body: unknown): RawAccountResult {
	const extract: DeclarativeExtract = spec.monitor.extract ?? {};
	const root = jsonPointer(body, extract.root ?? "");
	const items = mapped(root, extract.items);
	if (!Array.isArray(items)) throw new ProviderError("invalid-response", "custom response items must be an array");
	const windows: RawQuotaWindow[] = [];
	for (const item of items) {
		const used = numberOrNull(mapped(item, extract.usedPercent));
		const remaining = numberOrNull(mapped(item, extract.remainingPercent));
		if (used === null && remaining === null) continue;
		const usedPercent = round1(Math.max(0, Math.min(100, used ?? 100 - (remaining ?? 0))));
		const remainingPercent = round1(Math.max(0, Math.min(100, remaining ?? 100 - (used ?? 0))));
		const resetsAt = toIso(mapped(item, extract.resetsAt));
		windows.push({
			kind: nonEmptyString(mapped(item, extract.kind)) ?? "quota",
			usedPercent,
			remainingPercent,
			...(resetsAt === null ? {} : { resetsAt }),
		});
	}
	if (windows.length === 0) throw new ProviderError("invalid-response", "custom response has no usable quota windows");
	return {
		status: "ok",
		plan: nonEmptyString(mapped(root, extract.plan)) ?? undefined,
		windows,
	};
}

/** Declarative (JSON Pointer) monitor: balance or subscription mode. */
export const declarativeAdapter: AccountAdapter = {
	id: "declarative",
	mode: "balance",
	async collect(ctx) {
		const ref = ctx.spec.monitor.request?.auth?.credentialRef ?? ctx.spec.apiKeyRef;
		const credential = await resolveCredential(ctx.credentials, ref);
		if (ctx.spec.monitor.request?.auth !== undefined && credential === "") {
			return {
				status: "not-configured",
				balance: null,
				windows: [],
				missingCredentials: ref === undefined ? [] : [ref],
			};
		}
		const body = await requestJson(
			customURL(ctx.spec),
			{ method: "GET", headers: customHeaders(ctx.spec, credential) },
			ctx.deps,
			{
				allowInsecure: ctx.spec.monitor.allowInsecure,
				allowPrivateNetwork: ctx.spec.monitor.allowPrivateNetwork,
				allowCrossOrigin: ctx.spec.monitor.allowCrossOrigin,
				enforceSameOrigin: true,
				providerBaseURL: ctx.spec.providerBaseURL,
			},
		);
		return ctx.spec.mode === "subscription" ? customSubscription(ctx.spec, body) : customBalance(ctx.spec, body);
	},
};
