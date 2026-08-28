/**
 * Client-safe wire contracts for the integrated coding-subscription OAuth
 * routes mounted under `/plugins/dsh-grok-build/*`. These endpoints answer
 * with bare JSON documents (not the usage-stats `{ok,data,meta}` envelope),
 * so the schemas below are the single source of truth shared by the client
 * and by contract tests.
 */

import {
	CAPABILITY_SETTINGS_PATH,
	CODEX_USAGE_PATH,
	CODING_OAUTH_LOGIN_CANCEL_PATH,
	CODING_OAUTH_LOGIN_CODE_PATH,
	CODING_OAUTH_LOGIN_PATH,
	CODING_OAUTH_LOGOUT_PATH,
	CODING_OAUTH_MODELS_PATH,
	CODING_OAUTH_STATUS_PATH,
	GATEWAY_REVEAL_PATH,
	GATEWAY_ROTATE_PATH,
	GATEWAY_SETTINGS_PATH,
	IMAGINE_CREDENTIAL_STATUS_PATH,
	OAUTH_IMPORT_CANCEL_PATH,
	OAUTH_IMPORT_COMMIT_PATH,
	OAUTH_IMPORT_PREVIEW_PATH,
	OAUTH_IMPORT_SOURCES_PATH,
} from "dsh-coding-oauth-core/contracts";
import { z } from "zod";
import { DshCompatibilitySchema } from "./compatibility.js";

export const CODING_OAUTH_API_BASE = "/plugins/dsh-grok-build";

/** Hub-local multi-account mutations (peer core contracts do not list these yet). */
export const CODING_OAUTH_ACCOUNTS_SET_ACTIVE_PATH = `${CODING_OAUTH_API_BASE}/oauth/accounts/set-active` as const;
export const CODING_OAUTH_ACCOUNTS_REMOVE_PATH = `${CODING_OAUTH_API_BASE}/oauth/accounts/remove` as const;

/** Operator-owned account hard cap mirrored for Settings copy and client guards. */
export const OAUTH_MAX_ACCOUNTS = 8;

export const CODING_OAUTH_PATHS = Object.freeze({
	status: CODING_OAUTH_STATUS_PATH,
	login: CODING_OAUTH_LOGIN_PATH,
	code: CODING_OAUTH_LOGIN_CODE_PATH,
	cancel: CODING_OAUTH_LOGIN_CANCEL_PATH,
	logout: CODING_OAUTH_LOGOUT_PATH,
	models: CODING_OAUTH_MODELS_PATH,
	accountsSetActive: CODING_OAUTH_ACCOUNTS_SET_ACTIVE_PATH,
	accountsRemove: CODING_OAUTH_ACCOUNTS_REMOVE_PATH,
	sources: OAUTH_IMPORT_SOURCES_PATH,
	sourcePreview: OAUTH_IMPORT_PREVIEW_PATH,
	sourceCommit: OAUTH_IMPORT_COMMIT_PATH,
	sourceCancel: OAUTH_IMPORT_CANCEL_PATH,
	gateway: GATEWAY_SETTINGS_PATH,
	gatewayReveal: GATEWAY_REVEAL_PATH,
	gatewayRotate: GATEWAY_ROTATE_PATH,
	capabilities: CAPABILITY_SETTINGS_PATH,
	codexUsage: CODEX_USAGE_PATH,
	imagineCredential: IMAGINE_CREDENTIAL_STATUS_PATH,
});

export const CodingOAuthProviderSlugSchema = z.enum(["grok", "codex", "kimi", "claude"]);
export type CodingOAuthProviderSlug = z.infer<typeof CodingOAuthProviderSlugSchema>;

export const LoginAccountModeSchema = z.enum(["add", "overwrite-active"]);
export type LoginAccountMode = z.infer<typeof LoginAccountModeSchema>;

/** Secret-free row for Settings account lists. Never includes tokens. */
export const AccountSummarySchema = z.object({
	id: z.string().min(1).max(128),
	label: z.string().min(1).optional(),
	expires: z.number().positive(),
	accountId: z.string().min(1).optional(),
});
export type AccountSummary = z.infer<typeof AccountSummarySchema>;

export const GrokBuildLoginMethodSchema = z.enum(["pkce", "device"]);
export type GrokBuildLoginMethod = z.infer<typeof GrokBuildLoginMethodSchema>;

export const SubscriptionLoginMethodSchema = z.enum(["browser", "device"]);
export type SubscriptionLoginMethod = z.infer<typeof SubscriptionLoginMethodSchema>;

export const CatalogSourceSchema = z.enum(["live", "cache", "fallback"]);
export type CatalogSource = z.infer<typeof CatalogSourceSchema>;

export const GrokBuildWebAuthStatusSchema = z.discriminatedUnion("status", [
	z.object({ status: z.literal("signed-out"), grokImportAvailable: z.boolean() }),
	z.object({
		status: z.literal("signing-in"),
		method: GrokBuildLoginMethodSchema,
		url: z.string().optional(),
		userCode: z.string().optional(),
		grokImportAvailable: z.boolean(),
	}),
	z.object({
		status: z.literal("signed-in"),
		models: z.array(z.string()),
		available: z.array(z.string()),
		selected: z.array(z.string()),
		catalogSource: CatalogSourceSchema,
		catalogError: z.string().optional(),
		grokImportAvailable: z.boolean(),
		accounts: z.array(AccountSummarySchema),
		activeAccountId: z.string().min(1).max(128),
	}),
	z.object({ status: z.literal("error"), message: z.string(), grokImportAvailable: z.boolean() }),
]);
export type GrokBuildWebAuthStatus = z.infer<typeof GrokBuildWebAuthStatusSchema>;

const SubscriptionStatusBase = z.object({
	provider: z.enum(["codex", "kimi", "claude"]),
	route: z.string(),
	displayName: z.string(),
	loginMethods: z.array(SubscriptionLoginMethodSchema),
	recommendedLoginMethod: SubscriptionLoginMethodSchema,
	models: z.array(z.string()),
	available: z.array(z.string()),
	selected: z.array(z.string()),
});

export const SubscriptionWebAuthStatusSchema = z.intersection(
	SubscriptionStatusBase,
	z.discriminatedUnion("status", [
		z.object({ status: z.literal("signed-out") }),
		z.object({
			status: z.literal("signing-in"),
			method: SubscriptionLoginMethodSchema,
			url: z.string().optional(),
			userCode: z.string().optional(),
		}),
		z.object({
			status: z.literal("signed-in"),
			expiresAt: z.number().optional(),
			accounts: z.array(AccountSummarySchema),
			activeAccountId: z.string().min(1).max(128),
		}),
		z.object({ status: z.literal("error"), message: z.string() }),
	]),
);
export type SubscriptionWebAuthStatus = z.infer<typeof SubscriptionWebAuthStatusSchema>;

export const CodingOAuthWebStatusSchema = z.object({
	accessMode: z.enum(["loopback", "ssh-tunnel", "trusted-https-proxy", "denied"]),
	compatibility: DshCompatibilitySchema,
	uiOwner: z.enum(["hub", "standalone"]),
	providers: z.object({
		grok: GrokBuildWebAuthStatusSchema,
		codex: SubscriptionWebAuthStatusSchema,
		kimi: SubscriptionWebAuthStatusSchema,
		claude: SubscriptionWebAuthStatusSchema,
	}),
	antigravity: z.object({
		installed: z.boolean(),
		route: z.string(),
		management: z.literal("cli"),
	}),
});
export type CodingOAuthWebStatus = z.infer<typeof CodingOAuthWebStatusSchema>;

export const LoginChallengeSchema = z.object({
	method: z.string(),
	url: z.string(),
	userCode: z.string().optional(),
});
export type LoginChallenge = z.infer<typeof LoginChallengeSchema>;

export const OAuthSourceKindSchema = CodingOAuthProviderSlugSchema;
export type OAuthSourceKind = CodingOAuthProviderSlug;

export const OAuthSourceUnavailableReasonSchema = z.enum(["missing", "unsafe", "invalid", "too_large"]);

export const OAuthSourceDiscoverySchema = z.object({
	kind: OAuthSourceKindSchema,
	displayPath: z.string(),
	available: z.boolean(),
	expiresAt: z.number().optional(),
	reason: OAuthSourceUnavailableReasonSchema.optional(),
});
export type OAuthSourceDiscovery = z.infer<typeof OAuthSourceDiscoverySchema>;

export const OAuthImportSourcesResponseSchema = z.object({
	sources: z.array(OAuthSourceDiscoverySchema),
});
export type OAuthImportSourcesResponse = z.infer<typeof OAuthImportSourcesResponseSchema>;

export const OAuthImportConflictSchema = z.enum([
	"none",
	"same_credential",
	"same_account",
	"different_account",
	"unknown_account",
	"unreadable_destination",
	"unsafe_destination",
]);
export type OAuthImportConflict = z.infer<typeof OAuthImportConflictSchema>;

export const OAuthImportPreviewSchema = z.object({
	previewId: z.string(),
	kind: OAuthSourceKindSchema,
	displayPath: z.string(),
	expiresAt: z.number(),
	ticketExpiresAt: z.number(),
	conflict: OAuthImportConflictSchema,
	action: z.enum(["import", "reuse", "overwrite", "blocked"]),
	warnings: z.array(z.string()),
	confirmOverwriteRequired: z.boolean(),
});
export type OAuthImportPreview = z.infer<typeof OAuthImportPreviewSchema>;

export const OAuthImportCommitResultSchema = z.object({
	action: z.enum(["imported", "unchanged", "overwritten"]),
	displayPath: z.string(),
	expiresAt: z.number(),
	warnings: z.array(z.string()),
});
export type OAuthImportCommitResult = z.infer<typeof OAuthImportCommitResultSchema>;

export const OAuthImportCancelResultSchema = z.object({ ok: z.literal(true), cancelled: z.boolean() });

export const GatewayPublicStatusSchema = z.object({
	enabled: z.boolean(),
	running: z.boolean(),
	bind: z.string(),
	port: z.number(),
	model: z.string().nullable(),
	models: z.array(z.string()),
	keyAvailable: z.boolean(),
	keyConfigured: z.boolean(),
	keyHint: z.string(),
	warning: z.string(),
});
export type GatewayPublicStatus = z.infer<typeof GatewayPublicStatusSchema>;

export const GatewayKeyRevealSchema = z.object({ apiKey: z.string(), keyHint: z.string() });
export type GatewayKeyReveal = z.infer<typeof GatewayKeyRevealSchema>;

export const CapabilitySettingsSchema = z.object({
	codexSearch: z.boolean(),
	codexImages: z.boolean(),
	codexImageEdits: z.boolean(),
	codexUsage: z.boolean(),
	codexFast: z.boolean(),
	grokImagineImage: z.boolean(),
	grokImagineVideo: z.boolean(),
	searchResults: z.number(),
	imageCount: z.number(),
	videoArtifactTtlMs: z.number(),
});
export type CapabilitySettings = z.infer<typeof CapabilitySettingsSchema>;

export const CapabilitySettingsPatchSchema = CapabilitySettingsSchema.partial();
export type CapabilitySettingsPatch = z.infer<typeof CapabilitySettingsPatchSchema>;

export const CapabilitySettingsSnapshotSchema = z.object({
	ns: z.string(),
	value: CapabilitySettingsSchema,
	base: CapabilitySettingsPatchSchema.optional(),
	user: CapabilitySettingsPatchSchema.optional(),
	revision: z.number(),
	writable: z.boolean(),
	applies: z.string(),
	secrets: z.array(z.unknown()),
});
export type CapabilitySettingsSnapshot = z.infer<typeof CapabilitySettingsSnapshotSchema>;

export const ImagineCredentialStatusSchema = z.object({
	configured: z.boolean(),
	source: z.string(),
	writable: z.boolean(),
});
export type ImagineCredentialStatus = z.infer<typeof ImagineCredentialStatusSchema>;

/** Capability flag metadata shared by the settings UI and tests. */
export const CAPABILITY_FLAG_DEFS = Object.freeze([
	{ key: "codexSearch", labelKey: "capabilities.codexSearch" },
	{ key: "codexImages", labelKey: "capabilities.codexImages" },
	{ key: "codexImageEdits", labelKey: "capabilities.codexImageEdits" },
	{ key: "codexUsage", labelKey: "capabilities.codexUsage" },
	{ key: "codexFast", labelKey: "capabilities.codexFast" },
	{ key: "grokImagineImage", labelKey: "capabilities.grokImagineImage" },
	{ key: "grokImagineVideo", labelKey: "capabilities.grokImagineVideo" },
] as const satisfies readonly { key: keyof CapabilitySettings; labelKey: string }[]);

export const CAPABILITY_LIMIT_BOUNDS = Object.freeze({
	searchResults: { min: 1, max: 20 },
	imageCount: { min: 1, max: 4 },
	videoArtifactTtlHours: { min: 1, max: 168 },
});
