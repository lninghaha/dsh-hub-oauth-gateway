import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CODING_OAUTH_STATUS_PATH } from "../../../../src/server/coding-oauth/auth-routes.js";
import { CAPABILITY_SETTINGS_NAMESPACE } from "../../../../src/server/coding-oauth/capability-settings.js";
import { apply as applyInvariant } from "../../../../src/server/coding-oauth/invariant.js";
import { OAuthProviderSession } from "../../../../src/server/coding-oauth/oauth-session.js";
import { GrokBuildSession } from "../../../../src/server/coding-oauth/session.js";
import { RuntimeConfigSchema } from "../../../../src/server/config.js";
import type { UsageStatsHostContext } from "../../../../src/server/context.js";
import { apply } from "../../../../src/server/index.js";

afterEach(() => {
	vi.restoreAllMocks();
});

function dualLogger() {
	const methods = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };
	return Object.assign((_namespace: string) => methods, methods);
}

describe("coding OAuth identity and composition", () => {
	it("registers invariants under the current package name", async () => {
		const register = vi.fn(() => () => undefined);
		await applyInvariant({ invariants: { register } } as never);
		expect(register).toHaveBeenCalledWith("dsh-hub-oauth-gateway", expect.any(Function));
	});

	it("owns the coding-oauth settings namespace", () => {
		expect(CAPABILITY_SETTINGS_NAMESPACE).toBe("coding-oauth");
	});

	it("rejects an invalid codingOAuth.retryPolicy", () => {
		expect(() =>
			RuntimeConfigSchema.parse({
				codingOAuth: { retryPolicy: { mode: "not-a-policy" } },
			}),
		).toThrow();
	});

	it("fails closed when coding OAuth is enabled without llm", async () => {
		const logger = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };
		const ctx: UsageStatsHostContext = {
			logger,
			webServer: {
				register() {
					return () => undefined;
				},
			} as never,
			get: (name) => (name === "webServer" ? ctx.webServer : undefined),
			effect() {},
		};
		await expect(
			apply(ctx, { codingOAuth: { enabled: true } }, { databasePath: ":memory:", disableBackgroundRefresh: true }),
		).rejects.toThrow("usage-stats: coding OAuth requires the llm service");
	});

	it("registers oauth status on the real context when llm is present", async () => {
		vi.spyOn(GrokBuildSession.prototype, "loadCachedCatalog").mockResolvedValue(undefined);
		vi.spyOn(OAuthProviderSession.prototype, "loadCachedModels").mockResolvedValue(undefined);
		vi.spyOn(GrokBuildSession.prototype, "refreshLiveCatalog").mockResolvedValue(undefined);

		const home = await mkdtemp(join(tmpdir(), "dsh-hub-oauth-gateway-"));
		const previousHome = process.env.DSH_HOME;
		process.env.DSH_HOME = home;
		const routes = new Map<string, unknown>();
		const cleanups: Array<() => void | Promise<void>> = [];
		const logger = dualLogger();
		const llm = {
			registerAdapter: vi.fn(() => Object.assign(vi.fn(), { replace: vi.fn() })),
			resolveModelInfo: vi.fn(async () => undefined),
		};
		const webServer = {
			register(route: { path: string; handler: unknown }) {
				routes.set(route.path, route.handler);
				return () => routes.delete(route.path);
			},
		};
		const ctx: UsageStatsHostContext & { llm: typeof llm } = {
			logger: logger as never,
			llm,
			webServer: webServer as never,
			get(name: string) {
				if (name === "llm") return llm;
				if (name === "webServer") return webServer;
				return undefined;
			},
			emit: vi.fn(),
			inject(services, callback) {
				if (services.length === 1 && services[0] === "webServer") callback(ctx);
			},
			effect(setup) {
				const cleanup = setup();
				if (typeof cleanup === "function") cleanups.push(cleanup);
			},
		};

		try {
			await apply(
				ctx,
				{ codingOAuth: { enabled: true } },
				{
					databasePath: ":memory:",
					disableBackgroundRefresh: true,
				},
			);
			expect(llm.registerAdapter).toHaveBeenCalled();
			expect(routes.has(CODING_OAUTH_STATUS_PATH)).toBe(true);
		} finally {
			if (previousHome === undefined) delete process.env.DSH_HOME;
			else process.env.DSH_HOME = previousHome;
			for (const cleanup of cleanups.reverse()) await cleanup();
			await rm(home, { recursive: true, force: true });
		}
	});
});
