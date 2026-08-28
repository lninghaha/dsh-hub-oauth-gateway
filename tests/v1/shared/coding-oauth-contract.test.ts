import { describe, expect, it } from "vitest";
import {
	AccountSummarySchema,
	CodingOAuthWebStatusSchema,
	GatewayPublicStatusSchema,
	OAUTH_MAX_ACCOUNTS,
} from "../../../src/shared/coding-oauth.js";

const subscriptionStatus = {
	accessMode: "ssh-tunnel",
	uiOwner: "standalone",
	compatibility: {
		coreAbi: "dsh-coding-oauth-core/v1",
		dshVersion: "0.1.1-rc.2",
		status: "degraded",
		uiOwner: "standalone",
		accessMode: "ssh-tunnel",
		capabilities: {
			webServer: { state: "available", contract: "exact-route-v1" },
			llm: { state: "available", contract: "llm-adapter-registry-v1" },
			settings: { state: "missing", contract: "settings-register-v1" },
			credentials: { state: "missing", contract: "credential-resolver-v1" },
		},
		diagnostics: ["host.capability.settings: settings is missing"],
	},
	providers: {
		grok: { status: "signed-out", grokImportAvailable: false },
		codex: {
			provider: "codex",
			route: "codex",
			displayName: "OpenAI Codex",
			loginMethods: ["browser", "device"],
			recommendedLoginMethod: "device",
			models: [],
			available: [],
			selected: [],
			status: "signed-out",
		},
		kimi: {
			provider: "kimi",
			route: "kimi",
			displayName: "Kimi Code",
			loginMethods: ["browser", "device"],
			recommendedLoginMethod: "device",
			models: [],
			available: [],
			selected: [],
			status: "signed-out",
		},
		claude: {
			provider: "claude",
			route: "claude",
			displayName: "Claude Code",
			loginMethods: ["browser", "device"],
			recommendedLoginMethod: "device",
			models: [],
			available: [],
			selected: [],
			status: "signed-out",
		},
	},
	antigravity: { installed: false, route: "agy", management: "cli" },
} as const;

describe("cross-owner coding OAuth wire contracts", () => {
	it("lets the Hub client parse a standalone status response", () => {
		expect(CodingOAuthWebStatusSchema.parse(subscriptionStatus).uiOwner).toBe("standalone");
	});

	it("parses signed-in account summaries without tokens and keeps the hard cap constant", () => {
		expect(OAUTH_MAX_ACCOUNTS).toBe(8);
		const summary = AccountSummarySchema.parse({
			id: "acct-1",
			label: "Work",
			expires: Date.now() + 1_000,
			accountId: "provider-user",
		});
		expect(summary).not.toHaveProperty("access");
		expect(summary).not.toHaveProperty("refresh");
		expect(
			CodingOAuthWebStatusSchema.parse({
				...subscriptionStatus,
				providers: {
					...subscriptionStatus.providers,
					codex: {
						...subscriptionStatus.providers.codex,
						status: "signed-in",
						expiresAt: Date.now() + 1_000,
						accounts: [summary],
						activeAccountId: summary.id,
					},
				},
			}).providers.codex,
		).toMatchObject({ status: "signed-in", activeAccountId: "acct-1" });
	});

	it("keeps both gateway field names during the shared-core transition", () => {
		const parsed = GatewayPublicStatusSchema.parse({
			enabled: false,
			running: false,
			bind: "127.0.0.1",
			port: 18_080,
			model: "codex/gpt-5",
			models: ["codex/gpt-5"],
			keyAvailable: true,
			keyConfigured: true,
			keyHint: "dsh_…abcd",
			warning: "owner only",
		});
		expect(parsed.models).toEqual(["codex/gpt-5"]);
		expect(parsed.keyAvailable).toBe(parsed.keyConfigured);
	});
});
