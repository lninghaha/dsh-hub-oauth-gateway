/**
 * Optional xAI Grok Build bundle with OAuth, account model catalog,
 * and an account section inside dsh Settings.
 *
 * Ported from the grok-build `src/index.ts` into the usage-stats plugin.
 * The public plugin entry point here is `applyCodingOAuth` (not the Cordis
 * `apply`), and the plugin identity string is kept compatible under
 * `CODING_OAUTH_PLUGIN_NAME` so logs/settings remain compatible.
 * @module dsh-coding-subscription-oauth
 */

import { dirname, join } from "node:path";
import type { Context } from "@deepseek-ai/cordis";
import type { AttachmentStore } from "@deepseek-ai/dsh-attachment";
import type { CredentialInfo, CredentialProvider, CredentialRef } from "@deepseek-ai/dsh-credentials";
import type {} from "@deepseek-ai/dsh-host-webserver";
import { assertUsableApiKey, type RetryPolicyConfig, RetryPolicySchema } from "@deepseek-ai/dsh-llm";
import z from "@deepseek-ai/schemastery";
import type { Credential, OAuthCredential } from "@earendil-works/pi-ai";
import { DshHostAdapter } from "../host/adapter.js";
import { createCodingOAuthAdapter } from "./adapter.js";
import { registerCodingOAuthRoutes } from "./auth-routes.js";
import { registerCapabilityRoutes } from "./capability-routes.js";
import {
	bindCapabilitySearch,
	bindCapabilityTools,
	bindCodexFastRoute,
	CapabilityRuntimeState,
	type CapabilitySearchRegistry,
	type CapabilityToolRegistry,
} from "./capability-runtime.js";
import {
	type CapabilitySettingsPatch,
	CapabilitySettingsSchema,
	type CapabilitySettingsService,
	createCapabilitySettingsController,
	resolveCapabilitySettings,
} from "./capability-settings.js";
import {
	CODEX_IMAGE_EDIT_TOOL,
	CODEX_IMAGE_GENERATE_TOOL,
	createCapabilityTools,
	type ResolveCodexImageRoute,
	resolveCodexImageRouteFromLlm,
} from "./capability-tools.js";
import { codexAuthFromSession } from "./codex-http.js";
import { createCodexModelCapabilities } from "./codex-model-capabilities.js";
import { createCodexSearchProvider } from "./codex-search.js";
import { createCodexUsageReader } from "./codex-usage.js";
import { createCodingOAuthGatewayController } from "./gateway.js";
import { type GatewayConfig, GatewayConfigSchema } from "./gateway-config.js";
import { registerGatewayRoutes } from "./gateway-routes.js";
import {
	createGrokImagineClient,
	GROK_IMAGINE_IMAGE_TOOL,
	GROK_IMAGINE_VIDEO_STATUS_TOOL,
	GROK_IMAGINE_VIDEO_TOOL,
	GrokImagineError,
	type ImagineOperation,
} from "./grok-imagine.js";
import {
	CLAUDE_PI_PROVIDER,
	CODEX_PI_PROVIDER,
	CODING_OAUTH_ROUTES,
	IMAGINE_MEDIA_STORE_DIRNAME,
	KIMI_PI_PROVIDER,
	XAI_PI_PROVIDER,
} from "./ids.js";
import { registerImagineRoutes } from "./imagine-routes.js";
import { MediaStore } from "./media-store.js";
import {
	type OAuthImportDestinationStore,
	type OAuthImportDestinations,
	registerOAuthImportRoutes,
} from "./oauth-import-routes.js";
import { OAUTH_PROVIDER_DEFINITIONS } from "./oauth-providers.js";
import { OAuthProviderSession } from "./oauth-session.js";
import type { OAuthSourceCredential } from "./oauth-sources.js";
import { acquireCodingOAuthProxy } from "./proxy.js";
import { GrokBuildSession } from "./session.js";
import { GrokBuildCredentialStore, type OAuthCredentialFileStore } from "./store.js";
import { createOwnerRequestPolicy, type OwnerRequestPolicyConfig } from "./web-origin.js";

export { createCodingOAuthAdapter, createGrokBuildAdapter, preferredGrokBuildModel } from "./adapter.js";
export type { AliasLlmRoutePolicy } from "./alias-adapter.js";
export { AliasLlmAdapter } from "./alias-adapter.js";
export type { GrokBuildAuthStatus } from "./auth.js";
export {
	grokBuildAuthStatus,
	importGrokBuildFromGrok,
	importGrokBuildSession,
	loginGrokBuild,
	loginGrokBuildSession,
	logoutGrokBuild,
} from "./auth.js";
export type {
	CodingOAuthWebStatus,
	GrokBuildLoginMethod,
	GrokBuildWebAuthStatus,
	LoginChallenge,
	SubscriptionLoginChallenge,
	SubscriptionWebAuthStatus,
} from "./auth-routes.js";
export {
	CODING_OAUTH_LOGIN_CANCEL_PATH,
	CODING_OAUTH_LOGIN_CODE_PATH,
	CODING_OAUTH_LOGIN_PATH,
	CODING_OAUTH_LOGOUT_PATH,
	CODING_OAUTH_MODELS_PATH,
	CODING_OAUTH_STATUS_PATH,
	GROK_BUILD_AUTH_IMPORT_PATH,
	GROK_BUILD_AUTH_LOGIN_CANCEL_PATH,
	GROK_BUILD_AUTH_LOGIN_CODE_PATH,
	GROK_BUILD_AUTH_LOGIN_PATH,
	GROK_BUILD_AUTH_LOGOUT_PATH,
	GROK_BUILD_AUTH_MODELS_PATH,
	GROK_BUILD_AUTH_STATUS_PATH,
	GrokBuildWebAuth,
	registerCodingOAuthRoutes,
	registerGrokBuildAuthRoutes,
	SubscriptionWebAuth,
} from "./auth-routes.js";
export type { CatalogSource, LiveModelDescriptor } from "./catalog.js";
export {
	extractLiveModels,
	extractModelIds,
	fetchLiveModelIds,
	fetchLiveModels,
	materializeLiveModel,
	mergeLiveCatalog,
	preferredGrokBuildModelFrom,
	thinkingLevelMapFromLiveEfforts,
} from "./catalog.js";
export type { GrokImportProbe } from "./grok-import.js";
export { grokAuthPath, importGrokAuth, parseGrokAuthDocument, probeGrokAuth } from "./grok-import.js";
export type { CodingOAuthProviderSlug, CodingOAuthRoute } from "./ids.js";
export {
	ANTIGRAVITY_ROUTE,
	CLAUDE_CODE_OAUTH_AUTH_FILENAME,
	CLAUDE_CODE_OAUTH_MODELS_CACHE_FILENAME,
	CLAUDE_CODE_OAUTH_ROUTE,
	CLAUDE_PI_PROVIDER,
	CODEX_OAUTH_AUTH_FILENAME,
	CODEX_OAUTH_MODELS_CACHE_FILENAME,
	CODEX_OAUTH_ROUTE,
	CODEX_PI_PROVIDER,
	CODING_OAUTH_ROUTES,
	DEFAULT_GROK_BUILD_MODEL,
	GROK_BUILD_AUTH_FILENAME,
	GROK_BUILD_MODELS_CACHE_FILENAME,
	GROK_BUILD_ROUTE,
	GROK_BUILD_STREAM_IDLE_TIMEOUT_MS,
	KIMI_CODE_OAUTH_AUTH_FILENAME,
	KIMI_CODE_OAUTH_MODELS_CACHE_FILENAME,
	KIMI_CODE_OAUTH_ROUTE,
	KIMI_PI_PROVIDER,
	XAI_PI_PROVIDER,
} from "./ids.js";
export type { GrokBuildOAuthErrorCode, GrokBuildOAuthParams, PkceLoginCallbacks } from "./oauth.js";
export {
	buildAuthorizeUrl,
	discoverOAuthEndpoints,
	extractCode,
	GROK_BUILD_OAUTH_CLIENT_ID,
	GROK_BUILD_OAUTH_DEFAULT_PORT,
	GROK_BUILD_OAUTH_ISSUER,
	GROK_BUILD_OAUTH_SCOPE,
	GrokBuildOAuthError,
	generatePkce,
	loginGrokBuildPkce,
	refreshGrokBuildToken,
	resolveOAuthParams,
} from "./oauth.js";
export type { OAuthProviderDefinition, SubscriptionLoginMethod, SubscriptionProviderSlug } from "./oauth-providers.js";
export {
	CLAUDE_CODE_OAUTH_PROVIDER,
	CODEX_OAUTH_PROVIDER,
	KIMI_CODE_OAUTH_PROVIDER,
	OAUTH_PROVIDER_DEFINITIONS,
	oauthProviderDefinition,
} from "./oauth-providers.js";
export type { OAuthProviderStatus } from "./oauth-session.js";
export { OAuthProviderSession, oauthModelsCachePath } from "./oauth-session.js";
export {
	GROK_BUILD_BASE_URL,
	GROK_BUILD_MODELS_URL,
	GROK_CLIENT_VERSION,
	grokBuildBaselineModels,
	grokBuildFingerprintHeaders,
	grokBuildProvider,
	grokBuildReasoningMap,
} from "./provider.js";
export type { CodingOAuthProxyOptions } from "./proxy.js";
export {
	codingOAuthProxyInEffect,
	codingOAuthProxyUnreachableHint,
	ensureCodingOAuthProxy,
	ensureGrokBuildProxy,
	grokBuildProxyInEffect,
} from "./proxy.js";
export { redactProxyUrl, safeMessage } from "./redact.js";
export { GrokBuildSession } from "./session.js";
export {
	GrokBuildCredentialStore,
	grokBuildAuthPath,
	OAuthCredentialFileStore,
	oauthCredentialPath,
} from "./store.js";

/** Stable identity string for the coding OAuth plugin (compat with grok-build logs/settings). */
export const CODING_OAUTH_PLUGIN_NAME = "llm-grok-build-oauth";

/** Separate API-key credential used only by official xAI Imagine REST calls. */
export const XAI_API_KEY_CREDENTIAL = "XAI_API_KEY";
/** Validate locally because `credentialRef()` is a value export of the optional credentials peer. */
const XAI_API_KEY_REF = fixedCredentialRef(XAI_API_KEY_CREDENTIAL);

function fixedCredentialRef(value: string): CredentialRef {
	if (!/^[A-Za-z_][A-Za-z0-9_]*$/u.test(value)) {
		throw new TypeError(`invalid credential reference ${JSON.stringify(value)}`);
	}
	return value as CredentialRef;
}

/** Owner-private artifact directory below the resolved DSH home. */
export { IMAGINE_MEDIA_STORE_DIRNAME } from "./ids.js";

/** Plugin configuration; every field is optional. */
export interface Config {
	/** HTTP(S) proxy URL for the audited coding-subscription host allowlist. */
	proxy?: string;
	/** Kimi China traffic stays direct unless explicitly opted into the proxy. */
	proxyKimi?: boolean;
	/**
	 * Optional provider retry policy override for the four OAuth routes. When
	 * omitted, the plugin retries transient failures (rate limit, server,
	 * timeout, transport, empty response) plus AUTH — the latter is safe because
	 * the stored credential is invalidated on every AUTH finish, so the retried
	 * step refreshes before reuse. Quota exhaustion is never retried.
	 */
	retryPolicy?: RetryPolicyConfig;
	/** Secret-free composition/YAML defaults below live user settings. */
	capabilities?: CapabilitySettingsPatch;
	/** Opt-in isolated local OpenAI-compatible gateway. Default off. */
	gateway?: Partial<GatewayConfig>;
	/** Owner-only Settings access over loopback, SSH forwarding, or a trusted HTTPS proxy. */
	ownerRequest?: OwnerRequestPolicyConfig;
}

export const Config: z<Config> = z.object({
	proxy: z.string(),
	proxyKimi: z.boolean().default(false),
	retryPolicy: RetryPolicySchema,
	capabilities: CapabilitySettingsSchema,
	gateway: GatewayConfigSchema,
	ownerRequest: z.object({
		loopbackAccessMode: z.union([z.const("loopback"), z.const("ssh-tunnel")]),
		trustedProxy: z.object({
			peers: z.array(z.string()),
			origins: z.array(z.string()),
			ownerProof: z.string(),
			csrfToken: z.string(),
		}),
	}),
});

const CODEX_TOOL_NAMES = new Set<string>([CODEX_IMAGE_GENERATE_TOOL, CODEX_IMAGE_EDIT_TOOL]);
const IMAGINE_TOOL_NAMES = new Set<string>([
	GROK_IMAGINE_IMAGE_TOOL,
	GROK_IMAGINE_VIDEO_TOOL,
	GROK_IMAGINE_VIDEO_STATUS_TOOL,
]);

function requireSubscription(
	subscriptions: readonly OAuthProviderSession[],
	nativeProviderId: string,
): OAuthProviderSession {
	const session = subscriptions.find((candidate) => candidate.definition.nativeProviderId === nativeProviderId);
	if (session === undefined) throw new Error(`missing built-in OAuth provider ${nativeProviderId}`);
	return session;
}

function asSourceCredential(credential: Credential | undefined): OAuthSourceCredential | undefined {
	if (credential === undefined) return undefined;
	if (credential.type !== "oauth") throw new Error("OAuth import destination contains a non-OAuth credential");
	const accountId =
		typeof credential.accountId === "string" && credential.accountId.length > 0 ? credential.accountId : undefined;
	return {
		type: "oauth",
		access: credential.access,
		refresh: credential.refresh,
		expires: credential.expires,
		...(accountId === undefined ? {} : { accountId }),
	};
}

function asStoredCredential(credential: OAuthSourceCredential): OAuthCredential {
	return {
		type: "oauth",
		access: credential.access,
		refresh: credential.refresh,
		expires: credential.expires,
		...(credential.accountId === undefined ? {} : { accountId: credential.accountId }),
	};
}

function oauthImportStore(store: OAuthCredentialFileStore): OAuthImportDestinationStore {
	return {
		filename: store.filename,
		async modify(providerId, fn) {
			const result = await store.modify(providerId, async (current) => {
				const next = await fn(asSourceCredential(current));
				return next === undefined ? current : asStoredCredential(next);
			});
			return asSourceCredential(result);
		},
	};
}

function oauthImportDestinations(
	grok: GrokBuildSession,
	subscriptions: readonly OAuthProviderSession[],
): OAuthImportDestinations {
	const codex = requireSubscription(subscriptions, CODEX_PI_PROVIDER);
	const kimi = requireSubscription(subscriptions, KIMI_PI_PROVIDER);
	const claude = requireSubscription(subscriptions, CLAUDE_PI_PROVIDER);
	return {
		grok: { providerId: XAI_PI_PROVIDER, store: oauthImportStore(grok.store) },
		codex: { providerId: codex.definition.nativeProviderId, store: oauthImportStore(codex.store) },
		kimi: { providerId: kimi.definition.nativeProviderId, store: oauthImportStore(kimi.store) },
		claude: { providerId: claude.definition.nativeProviderId, store: oauthImportStore(claude.store) },
	};
}

async function describeImagineCredential(credentials: CredentialProvider | undefined): Promise<CredentialInfo> {
	if (credentials === undefined) return { configured: false, writable: false };
	return credentials.describe(XAI_API_KEY_REF);
}

async function resolveImagineApiKey(credentials: CredentialProvider, operation: ImagineOperation): Promise<string> {
	const resolved = await credentials.resolve(XAI_API_KEY_REF);
	if (resolved === undefined) {
		throw new GrokImagineError(
			"MISSING_CREDENTIAL",
			`${XAI_API_KEY_CREDENTIAL} is not configured for ${operation}. Grok Imagine does not use OAuth.`,
		);
	}
	return assertUsableApiKey(resolved.value, CODING_OAUTH_PLUGIN_NAME, XAI_API_KEY_CREDENTIAL);
}

function unavailableImagineClient(): {
	generateImage(): Promise<never>;
	startVideo(): Promise<never>;
	videoStatus(): Promise<never>;
} {
	const unavailable = async (): Promise<never> => {
		throw new GrokImagineError("MISSING_CREDENTIAL", "Grok Imagine services are not composed");
	};
	return { generateImage: unavailable, startVideo: unavailable, videoStatus: unavailable };
}

export interface CodingOAuthRuntime {
	/** Settles only after the required web route surface is actually mounted. */
	readonly ready: Promise<void>;
	readonly grok: GrokBuildSession;
	readonly subscriptions: readonly OAuthProviderSession[];
	readCodexUsage(options?: { force?: boolean; signal?: AbortSignal }): Promise<unknown>;
	currentCapabilities(): ReturnType<CapabilityRuntimeState["current"]>;
	/** Register a listener for OAuth login / logout / CLI import (quota refresh). */
	onCredentialChange(listener: () => void): () => void;
}

/**
 * Register the `grok-build` LLM route with a provider-native OAuth store.
 * @param ctx - plugin context carrying the LLM registry plus optional web server.
 */
export function applyCodingOAuth(ctx: Context, config: Config): CodingOAuthRuntime {
	const proxyLease = acquireCodingOAuthProxy(
		config.proxy,
		config.proxyKimi === undefined ? {} : { proxyKimi: config.proxyKimi },
	);
	ctx.effect(() => () => proxyLease.release(), "dsh-coding-oauth: scoped proxy policy");
	const logger = ctx.logger(CODING_OAUTH_PLUGIN_NAME);
	const ownerRequestPolicy = createOwnerRequestPolicy(config.ownerRequest);
	const dshHost = new DshHostAdapter(ctx as never);
	const baseCapabilities = resolveCapabilitySettings(config.capabilities);
	const runtime = new CapabilityRuntimeState(baseCapabilities, () => {
		logger.warn("an optional capability listener failed");
	});
	let active = true;
	ctx.effect(
		() => () => {
			active = false;
		},
		"dsh-coding-subscription-oauth: startup lifetime",
	);
	const credentialChangeListeners = new Set<() => void>();
	const emitCredentialChange = (): void => {
		if (!active) return;
		for (const listener of credentialChangeListeners) {
			try {
				listener();
			} catch {
				logger.warn("an OAuth credential-change listener failed");
			}
		}
	};
	let invalidateOptionalAuthState = (): void => undefined;
	const notifyCatalogChange = (): void => {
		if (!active) return;
		try {
			ctx.emit("llm/adapters-updated");
		} catch (error) {
			// Catalog observers are advisory; a broken listener must not turn an
			// already-persisted OAuth login/logout into an apparent auth failure.
			logger.warn("an llm/adapters-updated listener failed");
			logger.warn(error);
		}
	};
	const grok = new GrokBuildSession(new GrokBuildCredentialStore(), notifyCatalogChange, emitCredentialChange);
	const subscriptions = OAUTH_PROVIDER_DEFINITIONS.map(
		(definition) =>
			new OAuthProviderSession(
				definition,
				() => {
					if (definition.nativeProviderId === CODEX_PI_PROVIDER) invalidateOptionalAuthState();
					notifyCatalogChange();
				},
				undefined,
				undefined,
				emitCredentialChange,
			),
	);
	const codex = requireSubscription(subscriptions, CODEX_PI_PROVIDER);
	const codexAuth = codexAuthFromSession(codex);
	const usage = createCodexUsageReader({ auth: codexAuth });
	const codexModels = createCodexModelCapabilities({ auth: codexAuth });
	const resolveCodexImageRoute: ResolveCodexImageRoute = (exec) =>
		resolveCodexImageRouteFromLlm(exec, async (provider, model, signal) => {
			const resolveModelInfo = dshHost.llm()?.resolveModelInfo;
			if (resolveModelInfo === undefined) throw new Error("DSH LLM model metadata is unavailable");
			return (await resolveModelInfo(provider, model, signal)) as { inputModalities?: readonly string[] };
		});
	invalidateOptionalAuthState = () => {
		usage.clear();
		codexModels.clear();
		runtime.refresh();
	};
	ctx.inject(["llm"], (llmCtx) => {
		const llm = new DshHostAdapter(llmCtx as never).llm();
		if (llm === undefined) throw new Error("DSH LLM adapter registry is incompatible");
		const adapterRegistration = llm.registerAdapter(
			[...CODING_OAUTH_ROUTES],
			createCodingOAuthAdapter(grok, subscriptions, () => llmCtx.get("attachments"), config.retryPolicy, {
				codexFast: {
					isEligible: (modelId) => runtime.current().codexFast && codexModels.isPriorityEligible(modelId),
				},
			}),
		);
		llmCtx.effect(
			() =>
				bindCodexFastRoute(runtime, codexModels, adapterRegistration, {
					onError: () => logger.warn("Codex Fast eligibility refresh failed closed"),
				}),
			"dsh-coding-subscription-oauth: Codex Fast route",
		);
	});

	void Promise.allSettled([grok.loadCachedCatalog(), ...subscriptions.map((session) => session.loadCachedModels())])
		.then(async (results) => {
			if (!active) return;
			if (results.some((result) => result.status === "rejected")) {
				logger.warn("one or more OAuth model caches could not be loaded; using in-memory fallbacks");
			}
			await grok.refreshLiveCatalog();
		})
		.catch(() => {
			// Contain every startup refresh failure so plugin activation cannot leave
			// an unhandled rejection. The static provider catalogs remain usable.
			if (active) logger.warn("background OAuth model catalog initialization failed; using static fallbacks");
		});

	let settingsOwner = 0;
	let releaseActiveSettings = (): void => undefined;
	ctx.effect(() => () => releaseActiveSettings(), "dsh-coding-subscription-oauth: capability settings bridge");
	ctx.inject(["settings"], (settingsCtx) => {
		// Re-injection may happen before Cordis runs the previous child effect's
		// disposer. Release it synchronously so an obsolete watcher cannot race a
		// newly attached settings service.
		releaseActiveSettings();
		const owner = ++settingsOwner;
		const controller = createCapabilitySettingsController({
			settings: settingsCtx.get("settings") as CapabilitySettingsService,
			...(config.capabilities === undefined ? {} : { base: config.capabilities }),
			onListenerError: () => logger.warn("a capability settings listener failed"),
		});
		runtime.set(controller.current());
		const unsubscribe = controller.subscribe((snapshot) => {
			runtime.set(snapshot.value);
		});
		let released = false;
		const release = (): void => {
			if (released) return;
			released = true;
			unsubscribe();
			controller.dispose();
			if (owner === settingsOwner) {
				releaseActiveSettings = (): void => undefined;
				runtime.set(baseCapabilities);
			}
		};
		releaseActiveSettings = release;
		settingsCtx.effect(() => release, "dsh-coding-subscription-oauth: capability settings");
		settingsCtx.inject(["webServer"], (webCtx) => {
			registerCapabilityRoutes(webCtx, {
				controller,
				usage: () => usage.read(),
				credentialInfo: () => describeImagineCredential(webCtx.get("credentials") as CredentialProvider | undefined),
				ownerRequestPolicy,
			});
		});
	});

	const gateway = createCodingOAuthGatewayController({
		...(config.gateway === undefined ? {} : { config: config.gateway }),
		grok,
		subscriptions,
		onError: (error) => {
			logger.warn("local API gateway failed to start; LLM routes are unchanged");
			logger.warn(error);
		},
	});
	ctx.effect(() => {
		void gateway.startIfEnabled().then((started) => {
			if (started !== undefined) {
				logger.warn("local API gateway is enabled; exposing a subscription as a local API can violate provider ToS");
			}
		});
		return () => gateway.stop();
	}, "dsh-coding-subscription-oauth: local API gateway");

	let webRoutesMounted = false;
	const webRoutesFiber = ctx.inject(["webServer"], (webCtx) => {
		registerGatewayRoutes(webCtx, gateway, ownerRequestPolicy);
		registerCodingOAuthRoutes(webCtx, grok, subscriptions, ownerRequestPolicy, {
			uiOwner: "hub",
			compatibility: (accessMode) => {
				const host = dshHost.compatibility({ uiOwner: "hub", accessMode });
				const policyDiagnostics = ownerRequestPolicy.diagnostics();
				return {
					...host,
					status: policyDiagnostics.some((diagnostic) => diagnostic.level === "error") ? "incompatible" : host.status,
					diagnostics: [...host.diagnostics, ...policyDiagnostics.map((diagnostic) => diagnostic.id)],
				};
			},
		});
		registerOAuthImportRoutes(webCtx, oauthImportDestinations(grok, subscriptions), {
			ownerRequestPolicy,
			onImported: (event) => {
				if (event.kind === "codex") invalidateOptionalAuthState();
				notifyCatalogChange();
				emitCredentialChange();
			},
		});
		webRoutesMounted = true;
		webCtx.effect(
			() => () => {
				webRoutesMounted = false;
			},
			"dsh-coding-oauth: required web route readiness",
		);
	});
	const ready = (async (): Promise<void> => {
		await webRoutesFiber.await();
		if (!webRoutesMounted) {
			throw new Error("required DSH webServer routes did not activate");
		}
	})();

	const search = createCodexSearchProvider({
		auth: codexAuth,
		// Login, import, model selection, and catalog refreshes can all change the
		// first visible Codex model after plugin startup.
		model: () => codex.visibleModels()[0]?.id ?? "",
	});
	ctx.inject(["web"], (webCtx) => {
		const web = webCtx.get("web") as CapabilitySearchRegistry;
		webCtx.effect(() => bindCapabilitySearch(runtime, web, search), "dsh-coding-subscription-oauth: Codex search");
	});

	ctx.inject(["llm", "tools", "attachments"], async (toolCtx) => {
		const tools = toolCtx.get("tools") as CapabilityToolRegistry;
		const attachments = toolCtx.get("attachments") as AttachmentStore;
		const definitions = (
			await createCapabilityTools({
				current: () => runtime.current(),
				auth: codexAuth,
				attachments,
				imagine: unavailableImagineClient(),
				resolveCodexImageRoute,
			})
		).filter((definition) => CODEX_TOOL_NAMES.has(definition.name));
		toolCtx.effect(
			() => bindCapabilityTools(runtime, tools, definitions),
			"dsh-coding-subscription-oauth: Codex image tools",
		);
	});

	ctx.inject(["tools", "attachments", "credentials", "webServer"], async (toolCtx) => {
		const tools = toolCtx.get("tools") as CapabilityToolRegistry;
		const attachments = toolCtx.get("attachments") as AttachmentStore;
		const credentials = toolCtx.get("credentials") as CredentialProvider;
		const media = new MediaStore(join(dirname(grok.store.filename), IMAGINE_MEDIA_STORE_DIRNAME), {
			retentionMs: runtime.current().videoArtifactTtlMs,
		});
		const routeRegistry = registerImagineRoutes(toolCtx, {
			attachments,
			media: { readForDownload: (artifactId, authz) => media.openDownload(artifactId, authz) },
			ownerRequestPolicy,
		});
		const imagine = createGrokImagineClient({
			resolveApiKey: (operation) => resolveImagineApiKey(credentials, operation),
			attachments,
			media,
		});
		const routedImagine = {
			async generateImage(input: Parameters<typeof imagine.generateImage>[0], signal?: AbortSignal) {
				const result = await imagine.generateImage(input, signal);
				if (runtime.current().grokImagineImage) {
					routeRegistry.rememberImages(result.images.map((image) => image.attachment));
				}
				return result;
			},
			startVideo: (input: Parameters<typeof imagine.startVideo>[0], signal?: AbortSignal) =>
				imagine.startVideo(input, signal),
			async videoStatus(requestId: string, options?: Parameters<typeof imagine.videoStatus>[1]) {
				const result = await imagine.videoStatus(requestId, options);
				if (result.artifact !== undefined && runtime.current().grokImagineVideo) {
					routeRegistry.rememberArtifact(result.artifact);
				}
				return result;
			},
		};
		const definitions = (
			await createCapabilityTools({
				current: () => runtime.current(),
				auth: codexAuth,
				attachments,
				imagine: routedImagine,
				resolveCodexImageRoute,
			})
		).filter((definition) => IMAGINE_TOOL_NAMES.has(definition.name));
		let previousSettings = runtime.current();
		const releaseRetention = runtime.subscribe((settings) => {
			const previous = previousSettings;
			previousSettings = settings;
			if (previous.grokImagineImage && !settings.grokImagineImage) routeRegistry.revokeImages();
			if (previous.grokImagineVideo && !settings.grokImagineVideo) routeRegistry.revokeArtifacts();
			return media
				.applyRetentionMs(settings.videoArtifactTtlMs)
				.then(() => undefined)
				.catch(() => logger.warn("Imagine media retention cleanup failed"));
		});
		toolCtx.effect(
			() => bindCapabilityTools(runtime, tools, definitions),
			"dsh-coding-subscription-oauth: Grok Imagine tools",
		);
		toolCtx.effect(
			() => async () => {
				// Abort new/in-flight work before cleanup regardless of Cordis disposer
				// ordering. GrokImagineClient.dispose() is intentionally idempotent.
				imagine.dispose();
				releaseRetention();
				try {
					await media.cleanup();
				} catch {
					logger.warn("Imagine media cleanup failed");
				}
			},
			"dsh-coding-subscription-oauth: Imagine client and media lifetime",
		);
	});

	return {
		ready,
		grok,
		subscriptions,
		readCodexUsage: (options) => usage.read(options),
		currentCapabilities: () => runtime.current(),
		onCredentialChange(listener) {
			credentialChangeListeners.add(listener);
			return () => {
				credentialChangeListeners.delete(listener);
			};
		},
	};
}
