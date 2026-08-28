import { EventEmitter } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CODING_OAUTH_STATUS_PATH } from "../../../src/server/coding-oauth/auth-routes.js";
import { applyCodingOAuth } from "../../../src/server/coding-oauth/compose.js";
import { GITHUB_COPILOT_OAUTH_ROUTE, GITHUB_COPILOT_PI_PROVIDER } from "../../../src/server/coding-oauth/ids.js";
import {
	COPILOT_OAUTH_PROVIDER,
	CORE_OAUTH_PROVIDER_DEFINITIONS,
	enabledOAuthProviderDefinitions,
	OAUTH_PROVIDER_DEFINITIONS,
} from "../../../src/server/coding-oauth/oauth-providers.js";
import { CodingOAuthWebStatusSchema } from "../../../src/shared/coding-oauth.js";

describe("GitHub Copilot coding-oauth provider registration", () => {
	it("keeps Copilot out of the enabled set when copilotClientId is absent", () => {
		const enabled = enabledOAuthProviderDefinitions({});
		expect(enabled).toEqual([...CORE_OAUTH_PROVIDER_DEFINITIONS]);
		expect(enabled.some((provider) => provider.slug === "copilot")).toBe(false);
		expect(enabledOAuthProviderDefinitions({ copilotClientId: "   " }).some((p) => p.slug === "copilot")).toBe(false);
	});

	it("includes Copilot with hub-local route and native id when clientId is set", () => {
		const enabled = enabledOAuthProviderDefinitions({ copilotClientId: "Iv1.example-operator-client" });
		expect(enabled).toEqual([...OAUTH_PROVIDER_DEFINITIONS]);
		const copilot = enabled.find((provider) => provider.slug === "copilot");
		expect(copilot).toMatchObject({
			slug: "copilot",
			route: GITHUB_COPILOT_OAUTH_ROUTE,
			nativeProviderId: GITHUB_COPILOT_PI_PROVIDER,
			loginMethods: ["device"],
			recommendedLoginMethod: "device",
			authFilename: ".github-copilot-oauth-auth.json",
			modelsCacheFilename: ".github-copilot-oauth-models.json",
		});
		expect(COPILOT_OAUTH_PROVIDER.providerFactory().id).toBe(GITHUB_COPILOT_PI_PROVIDER);
		expect(GITHUB_COPILOT_OAUTH_ROUTE).toBe("github-copilot-oauth");
		expect(GITHUB_COPILOT_OAUTH_ROUTE).not.toBe(GITHUB_COPILOT_PI_PROVIDER);
	});
});

describe("applyCodingOAuth Copilot clientId gate", () => {
	afterEach(() => {
		delete process.env.DSH_HOME;
	});

	async function mount(config: { copilotClientId?: string }) {
		const home = await mkdtemp(join(tmpdir(), "hub-copilot-gate-"));
		process.env.DSH_HOME = home;
		const routes = new Map<string, (request: IncomingMessage, response: ServerResponse) => void | Promise<void>>();
		const disposers: Array<() => void | Promise<void>> = [];
		const registeredAdapterRoutes: string[][] = [];
		const services = {
			webServer: {
				register(route: {
					path: string;
					handler: (request: IncomingMessage, response: ServerResponse) => void | Promise<void>;
				}) {
					routes.set(route.path, route.handler);
					return () => routes.delete(route.path);
				},
			},
			llm: {
				registerAdapter(routeIds: readonly string[]) {
					registeredAdapterRoutes.push([...routeIds]);
					return {
						replace(next: readonly string[]) {
							registeredAdapterRoutes.push([...next]);
						},
					};
				},
			},
		};
		const context = {
			root: {},
			webServer: services.webServer,
			logger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
			get: (name: keyof typeof services) => services[name],
			emit: vi.fn(),
			effect(setup: () => void | (() => void | Promise<void>)) {
				const dispose = setup();
				if (typeof dispose === "function") disposers.push(dispose);
			},
			inject(dependencies: readonly string[], callback: (ctx: unknown) => void | Promise<void>) {
				if (dependencies.every((name) => name in services || name === "attachments")) void callback(context);
				return { await: vi.fn(async () => undefined), dispose: vi.fn(async () => undefined) };
			},
		};
		const runtime = applyCodingOAuth(context as never, config);
		await runtime.ready;
		return { home, routes, disposers, runtime, registeredAdapterRoutes };
	}

	it("registers github-copilot-oauth only when copilotClientId is configured", async () => {
		const without = await mount({});
		expect(without.runtime.subscriptions.some((s) => s.definition.slug === "copilot")).toBe(false);
		expect(without.registeredAdapterRoutes[0]?.includes(GITHUB_COPILOT_OAUTH_ROUTE)).toBe(false);
		const request = Object.assign(new EventEmitter(), {
			method: "GET",
			url: CODING_OAUTH_STATUS_PATH,
			headers: { host: "localhost:3080", "sec-fetch-site": "same-origin" },
			socket: { remoteAddress: "127.0.0.1" },
		});
		const response = {
			status: 0,
			body: "",
			setHeader() {},
			writeHead(s: number) {
				this.status = s;
				return this;
			},
			end(b = "") {
				this.body += String(b);
				return this;
			},
		};
		await without.routes.get(CODING_OAUTH_STATUS_PATH)?.(
			request as unknown as IncomingMessage,
			response as unknown as ServerResponse,
		);
		expect(JSON.parse(response.body).providers.copilot).toBeUndefined();
		for (const dispose of without.disposers.reverse()) await dispose();
		await rm(without.home, { recursive: true, force: true });

		const withId = await mount({ copilotClientId: "Iv1.example-operator-client" });
		expect(withId.runtime.subscriptions.some((s) => s.definition.slug === "copilot")).toBe(true);
		expect(withId.registeredAdapterRoutes[0]).toContain(GITHUB_COPILOT_OAUTH_ROUTE);
		const response2 = {
			status: 0,
			body: "",
			setHeader() {},
			writeHead(s: number) {
				this.status = s;
				return this;
			},
			end(b = "") {
				this.body += String(b);
				return this;
			},
		};
		await withId.routes.get(CODING_OAUTH_STATUS_PATH)?.(
			request as unknown as IncomingMessage,
			response2 as unknown as ServerResponse,
		);
		expect(JSON.parse(response2.body).providers.copilot).toMatchObject({
			provider: "copilot",
			route: GITHUB_COPILOT_OAUTH_ROUTE,
		});
		for (const dispose of withId.disposers.reverse()) await dispose();
		await rm(withId.home, { recursive: true, force: true });
	});
});

describe("Copilot optional status wire contract", () => {
	const base = {
		accessMode: "loopback" as const,
		uiOwner: "hub" as const,
		compatibility: {
			coreAbi: "dsh-coding-oauth-core/v1",
			dshVersion: "0.1.1-rc.2",
			status: "healthy" as const,
			uiOwner: "hub" as const,
			accessMode: "loopback" as const,
			capabilities: {
				webServer: { state: "available" as const, contract: "exact-route-v1" },
				llm: { state: "available" as const, contract: "llm-adapter-registry-v1" },
				settings: { state: "available" as const, contract: "settings-register-v1" },
				credentials: { state: "available" as const, contract: "credential-resolver-v1" },
			},
			diagnostics: [],
		},
		providers: {
			grok: { status: "signed-out" as const, grokImportAvailable: false },
			codex: {
				provider: "codex" as const,
				route: "codex-oauth",
				displayName: "OpenAI Codex",
				loginMethods: ["device" as const],
				recommendedLoginMethod: "device" as const,
				models: [],
				available: [],
				selected: [],
				status: "signed-out" as const,
			},
			kimi: {
				provider: "kimi" as const,
				route: "kimi-code-oauth",
				displayName: "Kimi Code",
				loginMethods: ["device" as const],
				recommendedLoginMethod: "device" as const,
				models: [],
				available: [],
				selected: [],
				status: "signed-out" as const,
			},
			claude: {
				provider: "claude" as const,
				route: "claude-code-oauth",
				displayName: "Claude Code",
				loginMethods: ["browser" as const],
				recommendedLoginMethod: "browser" as const,
				models: [],
				available: [],
				selected: [],
				status: "signed-out" as const,
			},
		},
		antigravity: { installed: false, route: "agy", management: "cli" as const },
	};

	it("accepts status without copilot when the operator did not opt in", () => {
		expect(CodingOAuthWebStatusSchema.parse(base).providers.copilot).toBeUndefined();
	});

	it("accepts status with an optional copilot subscription card", () => {
		const parsed = CodingOAuthWebStatusSchema.parse({
			...base,
			providers: {
				...base.providers,
				copilot: {
					provider: "copilot",
					route: GITHUB_COPILOT_OAUTH_ROUTE,
					displayName: "GitHub Copilot (subscription)",
					loginMethods: ["device"],
					recommendedLoginMethod: "device",
					models: [],
					available: [],
					selected: [],
					status: "signed-out",
				},
			},
		});
		expect(parsed.providers.copilot?.provider).toBe("copilot");
		expect(parsed.providers.copilot?.route).toBe(GITHUB_COPILOT_OAUTH_ROUTE);
	});
});
