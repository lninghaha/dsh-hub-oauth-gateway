import { createRequire } from "node:module";
import type { WebServer } from "@deepseek-ai/dsh-host-webserver";
import { resolveCodingOAuthScope } from "dsh-coding-oauth-core";
import { CODING_OAUTH_CORE_ABI, type DshCompatibility, type HostCapability } from "../../shared/compatibility.js";
import type { WritableCredentials } from "../api/credentials.js";
import type { OwnerRequestPolicy } from "../coding-oauth/web-origin.js";
import type { UsageStatsHostContext } from "../context.js";
import type { SettingsLike } from "./providers.js";
import type { LiveSessionsLike, SessionPersistenceLike } from "./session-inventory.js";

type ExactWebServer = Pick<WebServer, "register">;

interface LlmLike {
	registerAdapter(routes: readonly string[], adapter: unknown): { replace(routes: string[]): void };
	resolveModelInfo?(provider: string, model: string, signal?: AbortSignal): Promise<unknown>;
}

const require = createRequire(import.meta.url);

function dshVersion(): string | null {
	try {
		const manifest = require("@deepseek-ai/dsh/package.json") as { version?: unknown };
		return typeof manifest.version === "string" ? manifest.version : null;
	} catch {
		return null;
	}
}

function record(value: unknown): Record<string, unknown> | null {
	return value !== null && (typeof value === "object" || typeof value === "function")
		? (value as Record<string, unknown>)
		: null;
}

function hasFunctions(value: unknown, names: readonly string[]): boolean {
	const candidate = record(value);
	return candidate !== null && names.every((name) => typeof candidate[name] === "function");
}

function capability(value: unknown, contract: string, functions: readonly string[]): HostCapability {
	if (value === undefined || value === null) return { state: "missing", contract };
	if (!hasFunctions(value, functions)) {
		return { state: "incompatible", contract, reason: "service shape does not match the verified contract" };
	}
	return { state: "available", contract };
}

/** Centralizes every unstable DSH service lookup and shape check. */
export class DshHostAdapter {
	readonly #ctx: UsageStatsHostContext;

	constructor(ctx: UsageStatsHostContext) {
		this.#ctx = ctx;
	}

	/** Stable Cordis application scope shared by sibling plugin contexts. */
	scope(): object {
		return resolveCodingOAuthScope(this.#ctx);
	}

	#service<T>(name: string, direct: () => T | undefined): T | undefined {
		try {
			const value = this.#ctx.get?.(name) as T | undefined;
			if (value !== undefined && value !== null) return value;
		} catch {}
		try {
			return direct();
		} catch {
			return undefined;
		}
	}

	webServer(): ExactWebServer | undefined {
		const value = this.#service("webServer", () => this.#ctx.webServer);
		return hasFunctions(value, ["register"]) ? (value as ExactWebServer) : undefined;
	}

	credentials(): WritableCredentials | undefined {
		const value = this.#service("credentials", () => this.#ctx.credentials);
		return hasFunctions(value, ["resolve"]) ? (value as WritableCredentials) : undefined;
	}

	sessions(): LiveSessionsLike | undefined {
		const value = this.#service("sessions", () => this.#ctx.sessions);
		return hasFunctions(value, ["list"]) ? (value as LiveSessionsLike) : undefined;
	}

	persistence(): SessionPersistenceLike | undefined {
		const value = this.#service("sessionPersistence", () => this.#ctx.sessionPersistence);
		return hasFunctions(value, ["list", "readFrom"]) ? (value as SessionPersistenceLike) : undefined;
	}

	settings(): SettingsLike | undefined {
		const value = this.#service("settings", () => this.#ctx.settings);
		return hasFunctions(value, ["get"]) ? (value as SettingsLike) : undefined;
	}

	llm(): LlmLike | undefined {
		const value = this.#service("llm", () => this.#ctx.llm);
		return hasFunctions(value, ["registerAdapter"]) ? (value as LlmLike) : undefined;
	}

	ownerRequestPolicy(): OwnerRequestPolicy | undefined {
		const value = this.#service("ownerRequestPolicy", () => this.#ctx.ownerRequestPolicy);
		return hasFunctions(value, ["authorize", "diagnostics"]) ? (value as OwnerRequestPolicy) : undefined;
	}

	compatibility(
		options: {
			readonly uiOwner?: "hub" | "standalone" | null;
			readonly accessMode?: DshCompatibility["accessMode"];
		} = {},
	): DshCompatibility {
		const raw = {
			webServer: this.#service("webServer", () => this.#ctx.webServer),
			credentials: this.#service("credentials", () => this.#ctx.credentials),
			sessions: this.#service("sessions", () => this.#ctx.sessions),
			sessionPersistence: this.#service("sessionPersistence", () => this.#ctx.sessionPersistence),
			settings: this.#service("settings", () => this.#ctx.settings),
			llm: this.#service("llm", () => this.#ctx.llm),
			ownerRequestPolicy: this.#service("ownerRequestPolicy", () => this.#ctx.ownerRequestPolicy),
		};
		const capabilities: Record<string, HostCapability> = {
			webServer: capability(raw.webServer, "exact-route-v1", ["register"]),
			credentials: capability(raw.credentials, "credential-resolver-v1", ["resolve"]),
			sessions: capability(raw.sessions, "session-list-v1", ["list"]),
			sessionPersistence: capability(raw.sessionPersistence, "session-persistence-v1", ["list", "readFrom"]),
			settings: capability(raw.settings, "settings-get-v1", ["get"]),
			llm: capability(raw.llm, "llm-adapter-registry-v1", ["registerAdapter"]),
			ownerRequestPolicy: capability(raw.ownerRequestPolicy, "owner-request-policy-v1", ["authorize", "diagnostics"]),
		};
		const diagnostics = Object.entries(capabilities).flatMap(([name, value]) =>
			value.state === "available" ? [] : [`${name}: ${value.state}`],
		);
		const required = capabilities.webServer;
		const status =
			required?.state === "incompatible" || required?.state === "missing"
				? "incompatible"
				: diagnostics.length === 0
					? "healthy"
					: "degraded";
		return {
			coreAbi: CODING_OAUTH_CORE_ABI,
			dshVersion: dshVersion(),
			status,
			uiOwner: options.uiOwner === undefined ? "hub" : options.uiOwner,
			accessMode: options.accessMode ?? "loopback",
			capabilities,
			diagnostics,
		};
	}
}
