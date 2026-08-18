/**
 * Client-safe wire contracts for the integrated coding-subscription OAuth
 * routes mounted under `/plugins/dsh-grok-build/*`. These endpoints answer
 * with bare JSON documents (not the usage-stats `{ok,data,meta}` envelope),
 * so the schemas below are the single source of truth shared by the client
 * and by contract tests.
 */
import { z } from "zod";
export declare const CODING_OAUTH_API_BASE = "/plugins/dsh-grok-build";
export declare const CODING_OAUTH_PATHS: Readonly<{
    status: "/plugins/dsh-grok-build/oauth/status";
    login: "/plugins/dsh-grok-build/oauth/login";
    code: "/plugins/dsh-grok-build/oauth/code";
    cancel: "/plugins/dsh-grok-build/oauth/cancel";
    logout: "/plugins/dsh-grok-build/oauth/logout";
    models: "/plugins/dsh-grok-build/oauth/models";
    sources: "/plugins/dsh-grok-build/oauth/sources";
    sourcePreview: "/plugins/dsh-grok-build/oauth/sources/preview";
    sourceCommit: "/plugins/dsh-grok-build/oauth/sources/commit";
    sourceCancel: "/plugins/dsh-grok-build/oauth/sources/cancel";
    gateway: "/plugins/dsh-grok-build/gateway";
    gatewayReveal: "/plugins/dsh-grok-build/gateway/reveal";
    gatewayRotate: "/plugins/dsh-grok-build/gateway/rotate";
    capabilities: "/plugins/dsh-grok-build/capabilities";
    codexUsage: "/plugins/dsh-grok-build/codex/usage";
    imagineCredential: "/plugins/dsh-grok-build/imagine/credential-status";
}>;
export declare const CodingOAuthProviderSlugSchema: z.ZodEnum<{
    kimi: "kimi";
    claude: "claude";
    codex: "codex";
    grok: "grok";
}>;
export type CodingOAuthProviderSlug = z.infer<typeof CodingOAuthProviderSlugSchema>;
export declare const GrokBuildLoginMethodSchema: z.ZodEnum<{
    device: "device";
    pkce: "pkce";
}>;
export type GrokBuildLoginMethod = z.infer<typeof GrokBuildLoginMethodSchema>;
export declare const SubscriptionLoginMethodSchema: z.ZodEnum<{
    browser: "browser";
    device: "device";
}>;
export type SubscriptionLoginMethod = z.infer<typeof SubscriptionLoginMethodSchema>;
export declare const CatalogSourceSchema: z.ZodEnum<{
    fallback: "fallback";
    live: "live";
    cache: "cache";
}>;
export type CatalogSource = z.infer<typeof CatalogSourceSchema>;
export declare const GrokBuildWebAuthStatusSchema: z.ZodDiscriminatedUnion<[z.ZodObject<{
    status: z.ZodLiteral<"signed-out">;
    grokImportAvailable: z.ZodBoolean;
}, z.core.$strip>, z.ZodObject<{
    status: z.ZodLiteral<"signing-in">;
    method: z.ZodEnum<{
        device: "device";
        pkce: "pkce";
    }>;
    url: z.ZodOptional<z.ZodString>;
    userCode: z.ZodOptional<z.ZodString>;
    grokImportAvailable: z.ZodBoolean;
}, z.core.$strip>, z.ZodObject<{
    status: z.ZodLiteral<"signed-in">;
    models: z.ZodArray<z.ZodString>;
    available: z.ZodArray<z.ZodString>;
    selected: z.ZodArray<z.ZodString>;
    catalogSource: z.ZodEnum<{
        fallback: "fallback";
        live: "live";
        cache: "cache";
    }>;
    catalogError: z.ZodOptional<z.ZodString>;
    grokImportAvailable: z.ZodBoolean;
}, z.core.$strip>, z.ZodObject<{
    status: z.ZodLiteral<"error">;
    message: z.ZodString;
    grokImportAvailable: z.ZodBoolean;
}, z.core.$strip>], "status">;
export type GrokBuildWebAuthStatus = z.infer<typeof GrokBuildWebAuthStatusSchema>;
export declare const SubscriptionWebAuthStatusSchema: z.ZodIntersection<z.ZodObject<{
    provider: z.ZodEnum<{
        kimi: "kimi";
        claude: "claude";
        codex: "codex";
    }>;
    route: z.ZodString;
    displayName: z.ZodString;
    loginMethods: z.ZodArray<z.ZodEnum<{
        browser: "browser";
        device: "device";
    }>>;
    recommendedLoginMethod: z.ZodEnum<{
        browser: "browser";
        device: "device";
    }>;
    models: z.ZodArray<z.ZodString>;
    available: z.ZodArray<z.ZodString>;
    selected: z.ZodArray<z.ZodString>;
}, z.core.$strip>, z.ZodDiscriminatedUnion<[z.ZodObject<{
    status: z.ZodLiteral<"signed-out">;
}, z.core.$strip>, z.ZodObject<{
    status: z.ZodLiteral<"signing-in">;
    method: z.ZodEnum<{
        browser: "browser";
        device: "device";
    }>;
    url: z.ZodOptional<z.ZodString>;
    userCode: z.ZodOptional<z.ZodString>;
}, z.core.$strip>, z.ZodObject<{
    status: z.ZodLiteral<"signed-in">;
    expiresAt: z.ZodOptional<z.ZodNumber>;
}, z.core.$strip>, z.ZodObject<{
    status: z.ZodLiteral<"error">;
    message: z.ZodString;
}, z.core.$strip>], "status">>;
export type SubscriptionWebAuthStatus = z.infer<typeof SubscriptionWebAuthStatusSchema>;
export declare const CodingOAuthWebStatusSchema: z.ZodObject<{
    providers: z.ZodObject<{
        grok: z.ZodDiscriminatedUnion<[z.ZodObject<{
            status: z.ZodLiteral<"signed-out">;
            grokImportAvailable: z.ZodBoolean;
        }, z.core.$strip>, z.ZodObject<{
            status: z.ZodLiteral<"signing-in">;
            method: z.ZodEnum<{
                device: "device";
                pkce: "pkce";
            }>;
            url: z.ZodOptional<z.ZodString>;
            userCode: z.ZodOptional<z.ZodString>;
            grokImportAvailable: z.ZodBoolean;
        }, z.core.$strip>, z.ZodObject<{
            status: z.ZodLiteral<"signed-in">;
            models: z.ZodArray<z.ZodString>;
            available: z.ZodArray<z.ZodString>;
            selected: z.ZodArray<z.ZodString>;
            catalogSource: z.ZodEnum<{
                fallback: "fallback";
                live: "live";
                cache: "cache";
            }>;
            catalogError: z.ZodOptional<z.ZodString>;
            grokImportAvailable: z.ZodBoolean;
        }, z.core.$strip>, z.ZodObject<{
            status: z.ZodLiteral<"error">;
            message: z.ZodString;
            grokImportAvailable: z.ZodBoolean;
        }, z.core.$strip>], "status">;
        codex: z.ZodIntersection<z.ZodObject<{
            provider: z.ZodEnum<{
                kimi: "kimi";
                claude: "claude";
                codex: "codex";
            }>;
            route: z.ZodString;
            displayName: z.ZodString;
            loginMethods: z.ZodArray<z.ZodEnum<{
                browser: "browser";
                device: "device";
            }>>;
            recommendedLoginMethod: z.ZodEnum<{
                browser: "browser";
                device: "device";
            }>;
            models: z.ZodArray<z.ZodString>;
            available: z.ZodArray<z.ZodString>;
            selected: z.ZodArray<z.ZodString>;
        }, z.core.$strip>, z.ZodDiscriminatedUnion<[z.ZodObject<{
            status: z.ZodLiteral<"signed-out">;
        }, z.core.$strip>, z.ZodObject<{
            status: z.ZodLiteral<"signing-in">;
            method: z.ZodEnum<{
                browser: "browser";
                device: "device";
            }>;
            url: z.ZodOptional<z.ZodString>;
            userCode: z.ZodOptional<z.ZodString>;
        }, z.core.$strip>, z.ZodObject<{
            status: z.ZodLiteral<"signed-in">;
            expiresAt: z.ZodOptional<z.ZodNumber>;
        }, z.core.$strip>, z.ZodObject<{
            status: z.ZodLiteral<"error">;
            message: z.ZodString;
        }, z.core.$strip>], "status">>;
        kimi: z.ZodIntersection<z.ZodObject<{
            provider: z.ZodEnum<{
                kimi: "kimi";
                claude: "claude";
                codex: "codex";
            }>;
            route: z.ZodString;
            displayName: z.ZodString;
            loginMethods: z.ZodArray<z.ZodEnum<{
                browser: "browser";
                device: "device";
            }>>;
            recommendedLoginMethod: z.ZodEnum<{
                browser: "browser";
                device: "device";
            }>;
            models: z.ZodArray<z.ZodString>;
            available: z.ZodArray<z.ZodString>;
            selected: z.ZodArray<z.ZodString>;
        }, z.core.$strip>, z.ZodDiscriminatedUnion<[z.ZodObject<{
            status: z.ZodLiteral<"signed-out">;
        }, z.core.$strip>, z.ZodObject<{
            status: z.ZodLiteral<"signing-in">;
            method: z.ZodEnum<{
                browser: "browser";
                device: "device";
            }>;
            url: z.ZodOptional<z.ZodString>;
            userCode: z.ZodOptional<z.ZodString>;
        }, z.core.$strip>, z.ZodObject<{
            status: z.ZodLiteral<"signed-in">;
            expiresAt: z.ZodOptional<z.ZodNumber>;
        }, z.core.$strip>, z.ZodObject<{
            status: z.ZodLiteral<"error">;
            message: z.ZodString;
        }, z.core.$strip>], "status">>;
        claude: z.ZodIntersection<z.ZodObject<{
            provider: z.ZodEnum<{
                kimi: "kimi";
                claude: "claude";
                codex: "codex";
            }>;
            route: z.ZodString;
            displayName: z.ZodString;
            loginMethods: z.ZodArray<z.ZodEnum<{
                browser: "browser";
                device: "device";
            }>>;
            recommendedLoginMethod: z.ZodEnum<{
                browser: "browser";
                device: "device";
            }>;
            models: z.ZodArray<z.ZodString>;
            available: z.ZodArray<z.ZodString>;
            selected: z.ZodArray<z.ZodString>;
        }, z.core.$strip>, z.ZodDiscriminatedUnion<[z.ZodObject<{
            status: z.ZodLiteral<"signed-out">;
        }, z.core.$strip>, z.ZodObject<{
            status: z.ZodLiteral<"signing-in">;
            method: z.ZodEnum<{
                browser: "browser";
                device: "device";
            }>;
            url: z.ZodOptional<z.ZodString>;
            userCode: z.ZodOptional<z.ZodString>;
        }, z.core.$strip>, z.ZodObject<{
            status: z.ZodLiteral<"signed-in">;
            expiresAt: z.ZodOptional<z.ZodNumber>;
        }, z.core.$strip>, z.ZodObject<{
            status: z.ZodLiteral<"error">;
            message: z.ZodString;
        }, z.core.$strip>], "status">>;
    }, z.core.$strip>;
    antigravity: z.ZodObject<{
        installed: z.ZodBoolean;
        route: z.ZodString;
        management: z.ZodLiteral<"cli">;
    }, z.core.$strip>;
}, z.core.$strip>;
export type CodingOAuthWebStatus = z.infer<typeof CodingOAuthWebStatusSchema>;
export declare const LoginChallengeSchema: z.ZodObject<{
    method: z.ZodString;
    url: z.ZodString;
    userCode: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export type LoginChallenge = z.infer<typeof LoginChallengeSchema>;
export declare const OAuthSourceKindSchema: z.ZodEnum<{
    kimi: "kimi";
    claude: "claude";
    codex: "codex";
    grok: "grok";
}>;
export type OAuthSourceKind = CodingOAuthProviderSlug;
export declare const OAuthSourceUnavailableReasonSchema: z.ZodEnum<{
    too_large: "too_large";
    missing: "missing";
    unsafe: "unsafe";
    invalid: "invalid";
}>;
export declare const OAuthSourceDiscoverySchema: z.ZodObject<{
    kind: z.ZodEnum<{
        kimi: "kimi";
        claude: "claude";
        codex: "codex";
        grok: "grok";
    }>;
    displayPath: z.ZodString;
    available: z.ZodBoolean;
    expiresAt: z.ZodOptional<z.ZodNumber>;
    reason: z.ZodOptional<z.ZodEnum<{
        too_large: "too_large";
        missing: "missing";
        unsafe: "unsafe";
        invalid: "invalid";
    }>>;
}, z.core.$strip>;
export type OAuthSourceDiscovery = z.infer<typeof OAuthSourceDiscoverySchema>;
export declare const OAuthImportSourcesResponseSchema: z.ZodObject<{
    sources: z.ZodArray<z.ZodObject<{
        kind: z.ZodEnum<{
            kimi: "kimi";
            claude: "claude";
            codex: "codex";
            grok: "grok";
        }>;
        displayPath: z.ZodString;
        available: z.ZodBoolean;
        expiresAt: z.ZodOptional<z.ZodNumber>;
        reason: z.ZodOptional<z.ZodEnum<{
            too_large: "too_large";
            missing: "missing";
            unsafe: "unsafe";
            invalid: "invalid";
        }>>;
    }, z.core.$strip>>;
}, z.core.$strip>;
export type OAuthImportSourcesResponse = z.infer<typeof OAuthImportSourcesResponseSchema>;
export declare const OAuthImportConflictSchema: z.ZodEnum<{
    none: "none";
    same_credential: "same_credential";
    same_account: "same_account";
    different_account: "different_account";
    unknown_account: "unknown_account";
    unreadable_destination: "unreadable_destination";
    unsafe_destination: "unsafe_destination";
}>;
export type OAuthImportConflict = z.infer<typeof OAuthImportConflictSchema>;
export declare const OAuthImportPreviewSchema: z.ZodObject<{
    previewId: z.ZodString;
    kind: z.ZodEnum<{
        kimi: "kimi";
        claude: "claude";
        codex: "codex";
        grok: "grok";
    }>;
    displayPath: z.ZodString;
    expiresAt: z.ZodNumber;
    ticketExpiresAt: z.ZodNumber;
    conflict: z.ZodEnum<{
        none: "none";
        same_credential: "same_credential";
        same_account: "same_account";
        different_account: "different_account";
        unknown_account: "unknown_account";
        unreadable_destination: "unreadable_destination";
        unsafe_destination: "unsafe_destination";
    }>;
    action: z.ZodEnum<{
        import: "import";
        reuse: "reuse";
        overwrite: "overwrite";
        blocked: "blocked";
    }>;
    warnings: z.ZodArray<z.ZodString>;
    confirmOverwriteRequired: z.ZodBoolean;
}, z.core.$strip>;
export type OAuthImportPreview = z.infer<typeof OAuthImportPreviewSchema>;
export declare const OAuthImportCommitResultSchema: z.ZodObject<{
    action: z.ZodEnum<{
        imported: "imported";
        unchanged: "unchanged";
        overwritten: "overwritten";
    }>;
    displayPath: z.ZodString;
    expiresAt: z.ZodNumber;
    warnings: z.ZodArray<z.ZodString>;
}, z.core.$strip>;
export type OAuthImportCommitResult = z.infer<typeof OAuthImportCommitResultSchema>;
export declare const OAuthImportCancelResultSchema: z.ZodObject<{
    ok: z.ZodLiteral<true>;
    cancelled: z.ZodBoolean;
}, z.core.$strip>;
export declare const GatewayPublicStatusSchema: z.ZodObject<{
    enabled: z.ZodBoolean;
    running: z.ZodBoolean;
    bind: z.ZodString;
    port: z.ZodNumber;
    keyHint: z.ZodString;
    warning: z.ZodString;
}, z.core.$strip>;
export type GatewayPublicStatus = z.infer<typeof GatewayPublicStatusSchema>;
export declare const GatewayKeyRevealSchema: z.ZodObject<{
    apiKey: z.ZodString;
    keyHint: z.ZodString;
}, z.core.$strip>;
export type GatewayKeyReveal = z.infer<typeof GatewayKeyRevealSchema>;
export declare const CapabilitySettingsSchema: z.ZodObject<{
    codexSearch: z.ZodBoolean;
    codexImages: z.ZodBoolean;
    codexImageEdits: z.ZodBoolean;
    codexUsage: z.ZodBoolean;
    codexFast: z.ZodBoolean;
    grokImagineImage: z.ZodBoolean;
    grokImagineVideo: z.ZodBoolean;
    searchResults: z.ZodNumber;
    imageCount: z.ZodNumber;
    videoArtifactTtlMs: z.ZodNumber;
}, z.core.$strip>;
export type CapabilitySettings = z.infer<typeof CapabilitySettingsSchema>;
export declare const CapabilitySettingsPatchSchema: z.ZodObject<{
    codexSearch: z.ZodOptional<z.ZodBoolean>;
    codexImages: z.ZodOptional<z.ZodBoolean>;
    codexImageEdits: z.ZodOptional<z.ZodBoolean>;
    codexUsage: z.ZodOptional<z.ZodBoolean>;
    codexFast: z.ZodOptional<z.ZodBoolean>;
    grokImagineImage: z.ZodOptional<z.ZodBoolean>;
    grokImagineVideo: z.ZodOptional<z.ZodBoolean>;
    searchResults: z.ZodOptional<z.ZodNumber>;
    imageCount: z.ZodOptional<z.ZodNumber>;
    videoArtifactTtlMs: z.ZodOptional<z.ZodNumber>;
}, z.core.$strip>;
export type CapabilitySettingsPatch = z.infer<typeof CapabilitySettingsPatchSchema>;
export declare const CapabilitySettingsSnapshotSchema: z.ZodObject<{
    ns: z.ZodString;
    value: z.ZodObject<{
        codexSearch: z.ZodBoolean;
        codexImages: z.ZodBoolean;
        codexImageEdits: z.ZodBoolean;
        codexUsage: z.ZodBoolean;
        codexFast: z.ZodBoolean;
        grokImagineImage: z.ZodBoolean;
        grokImagineVideo: z.ZodBoolean;
        searchResults: z.ZodNumber;
        imageCount: z.ZodNumber;
        videoArtifactTtlMs: z.ZodNumber;
    }, z.core.$strip>;
    base: z.ZodOptional<z.ZodObject<{
        codexSearch: z.ZodOptional<z.ZodBoolean>;
        codexImages: z.ZodOptional<z.ZodBoolean>;
        codexImageEdits: z.ZodOptional<z.ZodBoolean>;
        codexUsage: z.ZodOptional<z.ZodBoolean>;
        codexFast: z.ZodOptional<z.ZodBoolean>;
        grokImagineImage: z.ZodOptional<z.ZodBoolean>;
        grokImagineVideo: z.ZodOptional<z.ZodBoolean>;
        searchResults: z.ZodOptional<z.ZodNumber>;
        imageCount: z.ZodOptional<z.ZodNumber>;
        videoArtifactTtlMs: z.ZodOptional<z.ZodNumber>;
    }, z.core.$strip>>;
    user: z.ZodOptional<z.ZodObject<{
        codexSearch: z.ZodOptional<z.ZodBoolean>;
        codexImages: z.ZodOptional<z.ZodBoolean>;
        codexImageEdits: z.ZodOptional<z.ZodBoolean>;
        codexUsage: z.ZodOptional<z.ZodBoolean>;
        codexFast: z.ZodOptional<z.ZodBoolean>;
        grokImagineImage: z.ZodOptional<z.ZodBoolean>;
        grokImagineVideo: z.ZodOptional<z.ZodBoolean>;
        searchResults: z.ZodOptional<z.ZodNumber>;
        imageCount: z.ZodOptional<z.ZodNumber>;
        videoArtifactTtlMs: z.ZodOptional<z.ZodNumber>;
    }, z.core.$strip>>;
    revision: z.ZodNumber;
    writable: z.ZodBoolean;
    applies: z.ZodString;
    secrets: z.ZodArray<z.ZodUnknown>;
}, z.core.$strip>;
export type CapabilitySettingsSnapshot = z.infer<typeof CapabilitySettingsSnapshotSchema>;
export declare const ImagineCredentialStatusSchema: z.ZodObject<{
    configured: z.ZodBoolean;
    source: z.ZodString;
    writable: z.ZodBoolean;
}, z.core.$strip>;
export type ImagineCredentialStatus = z.infer<typeof ImagineCredentialStatusSchema>;
/** Capability flag metadata shared by the settings UI and tests. */
export declare const CAPABILITY_FLAG_DEFS: readonly [{
    readonly key: "codexSearch";
    readonly labelKey: "capabilities.codexSearch";
}, {
    readonly key: "codexImages";
    readonly labelKey: "capabilities.codexImages";
}, {
    readonly key: "codexImageEdits";
    readonly labelKey: "capabilities.codexImageEdits";
}, {
    readonly key: "codexUsage";
    readonly labelKey: "capabilities.codexUsage";
}, {
    readonly key: "codexFast";
    readonly labelKey: "capabilities.codexFast";
}, {
    readonly key: "grokImagineImage";
    readonly labelKey: "capabilities.grokImagineImage";
}, {
    readonly key: "grokImagineVideo";
    readonly labelKey: "capabilities.grokImagineVideo";
}];
export declare const CAPABILITY_LIMIT_BOUNDS: Readonly<{
    searchResults: {
        min: number;
        max: number;
    };
    imageCount: {
        min: number;
        max: number;
    };
    videoArtifactTtlHours: {
        min: number;
        max: number;
    };
}>;
//# sourceMappingURL=coding-oauth.d.ts.map