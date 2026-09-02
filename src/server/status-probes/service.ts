/**
 * Opt-in read-only vendor status probes. Never attaches credentials; honors
 * the shared outbound/SSRF policy; per-target failures stay local so Usage
 * Center primary paths are unaffected.
 */

import {
	type StatusProbeIndicator,
	StatusProbeIndicatorSchema,
	type StatusProbeResult,
	type StatusProbesData,
} from "../../shared/status-probes.js";
import { isProviderError } from "../accounts/errors.js";
import { requestJson } from "../accounts/transport.js";
import type { AccountDeps } from "../accounts/types.js";
import { STATUS_PROBE_TARGETS, type StatusProbeTarget } from "./catalog.js";

const STATUS_PROBE_TIMEOUT_MS = 8_000;
const STATUS_PROBE_MAX_BYTES = 64 * 1024;

export interface StatusProbeServiceOptions {
	readonly deps?: AccountDeps;
	readonly now?: () => number;
	readonly targets?: readonly StatusProbeTarget[];
}

function parseIndicator(value: unknown): StatusProbeIndicator {
	const parsed = StatusProbeIndicatorSchema.safeParse(value);
	return parsed.success ? parsed.data : "unknown";
}

function parseDescription(value: unknown): string | null {
	if (typeof value !== "string") return null;
	const trimmed = value.trim();
	if (trimmed === "") return null;
	return trimmed.slice(0, 256);
}

function errorResult(target: StatusProbeTarget, errorCode: string, observedAt: number): StatusProbeResult {
	return {
		id: target.id,
		label: target.label,
		pageUrl: target.pageUrl,
		indicator: "unknown",
		description: null,
		observedAt,
		ok: false,
		errorCode,
	};
}

async function probeOne(target: StatusProbeTarget, deps: AccountDeps, now: number): Promise<StatusProbeResult> {
	try {
		const policy = {
			enforceSameOrigin: true,
			providerBaseURL: target.pageUrl,
			allowInsecure: false,
			allowPrivateNetwork: false,
			allowCrossOrigin: false,
		};
		const payload = await requestJson(
			target.apiUrl,
			{
				method: "GET",
				headers: {
					accept: "application/json",
					// Explicitly omit Authorization / Cookie — public Statuspage only.
				},
			},
			{
				...deps,
				timeoutMs: deps.timeoutMs ?? STATUS_PROBE_TIMEOUT_MS,
				maxResponseBytes: deps.maxResponseBytes ?? STATUS_PROBE_MAX_BYTES,
				targetPolicy: policy,
			},
			policy,
		);
		if (payload === null || typeof payload !== "object" || Array.isArray(payload)) {
			return errorResult(target, "invalid-response", now);
		}
		const status = (payload as { status?: unknown }).status;
		if (status === null || typeof status !== "object" || Array.isArray(status)) {
			return errorResult(target, "invalid-response", now);
		}
		const record = status as { indicator?: unknown; description?: unknown };
		return {
			id: target.id,
			label: target.label,
			pageUrl: target.pageUrl,
			indicator: parseIndicator(record.indicator),
			description: parseDescription(record.description),
			observedAt: now,
			ok: true,
			errorCode: null,
		};
	} catch (error) {
		const code = isProviderError(error)
			? error.providerStatus
			: error instanceof Error && error.message.includes("private")
				? "unsupported"
				: "unavailable";
		return errorResult(target, code.slice(0, 64), now);
	}
}

export class StatusProbeService {
	readonly #deps: AccountDeps;
	readonly #now: () => number;
	readonly #targets: readonly StatusProbeTarget[];

	constructor(options: StatusProbeServiceOptions = {}) {
		this.#deps = options.deps ?? {};
		this.#now = options.now ?? Date.now;
		this.#targets = options.targets ?? STATUS_PROBE_TARGETS;
	}

	/** Probe every allowlisted target; never throws for upstream failures. */
	async snapshot(): Promise<StatusProbesData> {
		const generatedAt = this.#now();
		const probes = await Promise.all(this.#targets.map((target) => probeOne(target, this.#deps, generatedAt)));
		return { enabled: true, generatedAt, probes };
	}
}
