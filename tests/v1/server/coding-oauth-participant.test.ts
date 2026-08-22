import { acquireCodingOAuthRuntime, CODING_OAUTH_CORE_ABI } from "dsh-coding-oauth-core";
import { describe, expect, it, vi } from "vitest";
import {
	acquireHubCodingOAuthOwnership,
	type CodingOAuthRuntimeHolder,
} from "../../../src/server/coding-oauth/participant.js";

describe("Hub coding OAuth participant lifecycle", () => {
	it("activates the owner base fiber without requiring the optional llm service", async () => {
		const scope = {};
		const runtime = {
			ready: Promise.resolve(),
			grok: {},
			subscriptions: [],
			readCodexUsage: vi.fn(),
			currentCapabilities: vi.fn(),
			onCredentialChange: vi.fn(() => () => undefined),
		};
		let injectedDependencies: readonly string[] | undefined;
		let childCleanup: (() => void | Promise<void>) | undefined;
		const disposeFiber = vi.fn(async () => {
			await childCleanup?.();
		});
		const context = {
			root: scope,
			inject(
				dependencies: readonly string[],
				callback: (ctx: unknown) => void | (() => void | Promise<void>) | Promise<void | (() => void | Promise<void>)>,
			) {
				injectedDependencies = dependencies;
				let startupError: unknown;
				const startup = Promise.resolve()
					.then(async () => {
						const cleanup = await callback(context);
						if (typeof cleanup === "function") childCleanup = cleanup;
					})
					.catch((error) => {
						startupError = error;
					});
				return {
					dispose: disposeFiber,
					async await() {
						await startup;
						if (startupError !== undefined) throw startupError;
					},
				};
			},
		};
		const activate = vi.fn(() => runtime as never);
		const ownership = acquireHubCodingOAuthOwnership(
			context as never,
			{ scope: () => scope } as never,
			{},
			{ activate },
		);

		const settled = await ownership.lease.settled();
		expect(settled.status).toBe("active");
		expect(injectedDependencies).toEqual([]);
		expect(activate).toHaveBeenCalledOnce();
		expect((ownership.holder as CodingOAuthRuntimeHolder).current()).toBe(runtime);

		await ownership.lease.release();
		expect(disposeFiber).toHaveBeenCalledOnce();
		expect(ownership.holder.current()).toBeUndefined();
	});

	it("surfaces delayed required-route startup failures so standalone can resume", async () => {
		const scope = {};
		const standaloneDispose = vi.fn(async () => undefined);
		const standalone = acquireCodingOAuthRuntime(scope, {
			id: "standalone",
			role: "standalone",
			coreAbi: CODING_OAUTH_CORE_ABI,
			activate: async () => ({ runtime: "standalone", dispose: standaloneDispose }),
		});
		expect((await standalone.settled()).status).toBe("active");

		let childCleanup: (() => void | Promise<void>) | undefined;
		const context = {
			root: scope,
			inject(
				_dependencies: readonly string[],
				callback: (ctx: unknown) => void | (() => void | Promise<void>) | Promise<void | (() => void | Promise<void>)>,
			) {
				let startupError: unknown;
				const startup = Promise.resolve()
					.then(async () => {
						const cleanup = await callback(context);
						if (typeof cleanup === "function") childCleanup = cleanup;
					})
					.catch((error) => {
						startupError = error;
					});
				return {
					async await() {
						await startup;
						if (startupError !== undefined) throw startupError;
					},
					async dispose() {
						await startup;
						await childCleanup?.();
					},
				};
			},
		};
		const activate = vi.fn(() => ({
			ready: Promise.reject(new Error("duplicate exact route")),
			grok: {},
			subscriptions: [],
			readCodexUsage: vi.fn(),
			currentCapabilities: vi.fn(),
			onCredentialChange: vi.fn(() => () => undefined),
		}));
		const ownership = acquireHubCodingOAuthOwnership(
			context as never,
			{ scope: () => scope } as never,
			{},
			{ activate: activate as never },
		);

		const failedHub = await ownership.lease.settled();
		expect(failedHub.status).toBe("error");
		expect(failedHub.diagnostic).toContain("duplicate exact route");
		expect(ownership.holder.current()).toBeUndefined();
		expect(standalone.snapshot()).toMatchObject({ status: "active", uiOwner: "standalone" });
		expect(standaloneDispose).toHaveBeenCalledOnce();

		await ownership.lease.release();
		await standalone.release();
	});
});
