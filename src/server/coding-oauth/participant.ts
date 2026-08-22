import type { Context, Fiber } from "@deepseek-ai/cordis";
import {
	acquireCodingOAuthRuntime,
	CODING_OAUTH_CORE_ABI,
	type CodingOAuthRuntime as CodingOAuthOwnership,
} from "dsh-coding-oauth-core";
import type { UsageStatsHostContext } from "../context.js";
import type { DshHostAdapter } from "../host/adapter.js";
import { applyCodingOAuth, type CodingOAuthRuntime, type Config } from "./compose.js";

export class CodingOAuthRuntimeHolder {
	#current: CodingOAuthRuntime | undefined;
	readonly #listeners = new Set<(runtime: CodingOAuthRuntime | undefined) => void>();

	current(): CodingOAuthRuntime | undefined {
		return this.#current;
	}

	subscribe(listener: (runtime: CodingOAuthRuntime | undefined) => void): () => void {
		this.#listeners.add(listener);
		listener(this.#current);
		return () => this.#listeners.delete(listener);
	}

	set(runtime: CodingOAuthRuntime | undefined): void {
		if (this.#current === runtime) return;
		this.#current = runtime;
		for (const listener of this.#listeners) {
			try {
				listener(runtime);
			} catch {
				// Runtime observers are advisory and must not break host activation.
			}
		}
	}
}

export interface HubCodingOAuthOwnership {
	readonly holder: CodingOAuthRuntimeHolder;
	readonly lease: CodingOAuthOwnership<CodingOAuthRuntimeHolder>;
}

export interface HubCodingOAuthParticipantDependencies {
	readonly activate?: typeof applyCodingOAuth;
}

/**
 * Join the host-wide OAuth owner election without placing any OAuth effects on
 * the parent fiber. The child fiber can be atomically disposed during Hub /
 * standalone takeover. The base fiber does not depend on optional DSH
 * services; LLM-specific effects are attached by a nested inject inside the
 * composition runtime.
 */
export function acquireHubCodingOAuthOwnership(
	ctx: UsageStatsHostContext,
	host: DshHostAdapter,
	config: Config,
	dependencies: HubCodingOAuthParticipantDependencies = {},
): HubCodingOAuthOwnership {
	const cordis = ctx as unknown as Context;
	const holder = new CodingOAuthRuntimeHolder();
	const lease = acquireCodingOAuthRuntime(host.scope(), {
		id: "dsh-hub-oauth-gateway",
		role: "hub",
		coreAbi: CODING_OAUTH_CORE_ABI,
		async activate() {
			if (typeof cordis.inject !== "function") {
				throw new Error("Cordis optional-service lifecycle is unavailable");
			}
			const activate = dependencies.activate ?? applyCodingOAuth;
			let fiber: Fiber | undefined;
			fiber = cordis.inject([], async (injected) => {
				const runtime = activate(injected, config);
				await runtime.ready;
				holder.set(runtime);
				return () => {
					if (holder.current() === runtime) holder.set(undefined);
				};
			});
			try {
				await fiber.await();
				if (holder.current() === undefined) {
					throw new Error("Hub Coding OAuth owner fiber did not activate");
				}
			} catch (error) {
				try {
					await fiber.dispose();
				} catch {
					// Preserve the startup error; Cordis already logs cleanup failures.
				}
				holder.set(undefined);
				throw error;
			}
			return {
				runtime: holder,
				async dispose() {
					await fiber?.dispose();
					holder.set(undefined);
				},
			};
		},
	});
	return { holder, lease };
}
