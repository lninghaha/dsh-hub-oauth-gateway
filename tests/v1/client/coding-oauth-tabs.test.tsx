/** @vitest-environment jsdom */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AccountsTab } from "../../../src/client/components/oauth/AccountsTab.js";
import { CapabilitiesTab } from "../../../src/client/components/oauth/CapabilitiesTab.js";
import { GatewayTab } from "../../../src/client/components/oauth/GatewayTab.js";
import { en, translator } from "../../../src/client/locales.js";

let statusFixture = {
	providers: {
		grok: { status: "signed-out" as const, grokImportAvailable: false },
		codex: {
			provider: "codex" as const,
			route: "codex-oauth",
			displayName: "OpenAI Codex (ChatGPT Plus/Pro)",
			loginMethods: ["device", "browser"] as Array<"device" | "browser">,
			recommendedLoginMethod: "device" as const,
			models: [] as string[],
			available: [] as string[],
			selected: [] as string[],
			status: "signed-out" as string,
			expiresAt: undefined as number | undefined,
			accounts: undefined as Array<{ id: string; label?: string; expires: number }> | undefined,
			activeAccountId: undefined as string | undefined,
		},
		kimi: {
			provider: "kimi" as const,
			route: "kimi-code-oauth",
			displayName: "Kimi Code (subscription)",
			loginMethods: ["device"] as Array<"device" | "browser">,
			recommendedLoginMethod: "device" as const,
			models: [] as string[],
			available: [] as string[],
			selected: [] as string[],
			status: "signed-out" as string,
		},
		claude: {
			provider: "claude" as const,
			route: "claude-code-oauth",
			displayName: "Claude Code (Pro/Max)",
			loginMethods: ["browser"] as Array<"device" | "browser">,
			recommendedLoginMethod: "browser" as const,
			models: [] as string[],
			available: [] as string[],
			selected: [] as string[],
			status: "signed-out" as string,
		},
	},
	antigravity: { installed: false, route: "agy", management: "cli" as const },
};

function resetStatusFixture(): void {
	statusFixture = {
		providers: {
			grok: { status: "signed-out", grokImportAvailable: false },
			codex: {
				provider: "codex",
				route: "codex-oauth",
				displayName: "OpenAI Codex (ChatGPT Plus/Pro)",
				loginMethods: ["device", "browser"],
				recommendedLoginMethod: "device",
				models: [],
				available: [],
				selected: [],
				status: "signed-out",
				expiresAt: undefined,
				accounts: undefined,
				activeAccountId: undefined,
			},
			kimi: {
				provider: "kimi",
				route: "kimi-code-oauth",
				displayName: "Kimi Code (subscription)",
				loginMethods: ["device"],
				recommendedLoginMethod: "device",
				models: [],
				available: [],
				selected: [],
				status: "signed-out",
			},
			claude: {
				provider: "claude",
				route: "claude-code-oauth",
				displayName: "Claude Code (Pro/Max)",
				loginMethods: ["browser"],
				recommendedLoginMethod: "browser",
				models: [],
				available: [],
				selected: [],
				status: "signed-out",
			},
		},
		antigravity: { installed: false, route: "agy", management: "cli" },
	};
}

const capabilitiesFixture = {
	ns: "coding-subscription-oauth",
	value: {
		codexSearch: false,
		codexImages: false,
		codexImageEdits: false,
		codexUsage: false,
		codexFast: false,
		grokImagineImage: false,
		grokImagineVideo: false,
		searchResults: 5,
		imageCount: 1,
		videoArtifactTtlMs: 604_800_000,
	},
	revision: 3,
	writable: true,
	applies: "live",
	secrets: [],
};

const gatewayFixture = {
	enabled: false,
	running: false,
	bind: "127.0.0.1",
	port: 18_080,
	model: "grok-4",
	keyAvailable: true,
	keyHint: "****abcd",
	warning: "local API gateway warning",
};
let revealedGatewayKey: string | undefined;

vi.mock("../../../src/client/coding-oauth-api.js", async () => {
	const actual = await vi.importActual<typeof import("../../../src/client/coding-oauth-api.js")>(
		"../../../src/client/coding-oauth-api.js",
	);
	return {
		...actual,
		useCodingOAuthStatusQuery: () => ({ data: statusFixture, error: null, isPending: false }),
		useCodingOAuthLoginMutation: () => ({ mutate: vi.fn(), isPending: false, error: null }),
		useCodingOAuthCodeMutation: () => ({ mutate: vi.fn(), isPending: false, error: null }),
		useCodingOAuthCancelMutation: () => ({ mutate: vi.fn(), isPending: false, error: null }),
		useCodingOAuthLogoutMutation: () => ({ mutate: vi.fn(), isPending: false, error: null }),
		useCodingOAuthModelsMutation: () => ({ mutate: vi.fn(), isPending: false, isSuccess: false, error: null }),
		useCodingOAuthSetActiveAccountMutation: () => ({ mutate: vi.fn(), isPending: false, error: null }),
		useCodingOAuthRemoveAccountMutation: () => ({ mutate: vi.fn(), isPending: false, error: null }),
		useOAuthSourcesQuery: () => ({
			data: {
				sources: [
					{ kind: "claude", displayPath: "~/.claude/.credentials.json", available: true },
					{ kind: "grok", displayPath: "~/.grok/auth.json", available: false, reason: "missing" },
				],
			},
			error: null,
			isPending: false,
		}),
		useOAuthSourcePreviewMutation: () => ({
			mutate: vi.fn(),
			isPending: false,
			data: undefined,
			error: null,
			reset: vi.fn(),
		}),
		useOAuthSourceCommitMutation: () => ({ mutate: vi.fn(), isPending: false, data: undefined, error: null }),
		useOAuthSourceCancelMutation: () => ({ mutate: vi.fn(), isPending: false }),
		useGatewayStatusQuery: () => ({ data: gatewayFixture, error: null, isPending: false }),
		useGatewayPatchMutation: () => ({ mutate: vi.fn(), isPending: false, error: null }),
		useGatewayRevealMutation: () => ({
			mutate: vi.fn(),
			isPending: false,
			data: revealedGatewayKey === undefined ? undefined : { apiKey: revealedGatewayKey },
			error: null,
		}),
		useGatewayRotateMutation: () => ({ mutate: vi.fn(), isPending: false, data: undefined, error: null }),
		useCapabilitiesQuery: () => ({ data: capabilitiesFixture, error: null, isPending: false, refetch: vi.fn() }),
		useCapabilitiesPatchMutation: () => ({ mutate: vi.fn(), isPending: false, isSuccess: false, error: null }),
		useImagineCredentialQuery: () => ({
			data: { configured: false, source: "unknown", writable: true },
			error: null,
			isPending: false,
		}),
	};
});

vi.mock("../../../src/client/queries.js", () => ({
	useAccountsQuery: () => ({ data: { ok: true, data: { accounts: [] } }, error: null, isPending: false }),
}));

const t = translator(((key: string) => (en as Record<string, string>)[key] ?? key) as never);

function renderWithClient(node: ReactNode): void {
	const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
	render(<QueryClientProvider client={client}>{node}</QueryClientProvider>);
}

describe("coding OAuth settings tabs", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		revealedGatewayKey = undefined;
		resetStatusFixture();
	});

	afterEach(() => {
		cleanup();
	});

	it("renders the accounts tab with all four providers and per-card CLI pull", () => {
		renderWithClient(<AccountsTab t={t} />);
		expect(document.querySelector('[data-oauth-provider="grok"]')).toBeTruthy();
		expect(document.querySelector('[data-oauth-provider="codex"]')).toBeTruthy();
		expect(document.querySelector('[data-oauth-provider="kimi"]')).toBeTruthy();
		expect(document.querySelector('[data-oauth-provider="claude"]')).toBeTruthy();
		expect(document.querySelector('[data-oauth-provider="antigravity"]')).toBeTruthy();
		const claude = document.querySelector('[data-oauth-provider="claude"]');
		expect(claude).toBeTruthy();
		const toggle = claude?.querySelector(".dus-oauth-card-toggle");
		expect(toggle).toBeTruthy();
		fireEvent.click(toggle as Element);
		expect(document.querySelector('[data-oauth-source="claude"]')).toBeTruthy();
		expect(screen.getByRole("button", { name: en["oauth.importClaudeCode"] })).toBeTruthy();
		expect(screen.queryByText(en["oauth.importTitle"])).toBeNull();
	});

	it("expands a provider card and starts a login flow from its method buttons", () => {
		renderWithClient(<AccountsTab t={t} />);
		const card = document.querySelector('[data-oauth-provider="kimi"]');
		expect(card).toBeTruthy();
		const toggle = card?.querySelector(".dus-oauth-card-toggle");
		expect(toggle).toBeTruthy();
		fireEvent.click(toggle as Element);
		expect(screen.getByText(en["oauth.loginDevice"])).toBeTruthy();
	});

	it("shows both Grok login methods when the signed-out card is expanded", () => {
		renderWithClient(<AccountsTab t={t} />);
		const card = document.querySelector('[data-oauth-provider="grok"]');
		expect(card).toBeTruthy();
		const toggle = card?.querySelector(".dus-oauth-card-toggle");
		expect(toggle).toBeTruthy();
		fireEvent.click(toggle as Element);
		expect(screen.getByText(en["oauth.loginBrowser"])).toBeTruthy();
		expect(screen.getByText(en["oauth.loginDevice"])).toBeTruthy();
	});

	it("lists stored accounts with set-default and remove when signed in", () => {
		statusFixture.providers.codex.status = "signed-in";
		statusFixture.providers.codex.expiresAt = Date.now() + 3_600_000;
		statusFixture.providers.codex.accounts = [
			{ id: "acct-a", label: "Alpha", expires: Date.now() + 3_600_000 },
			{ id: "acct-b", label: "Beta", expires: Date.now() + 3_600_000 },
		];
		statusFixture.providers.codex.activeAccountId = "acct-a";
		renderWithClient(<AccountsTab t={t} />);
		const card = document.querySelector('[data-oauth-provider="codex"]');
		expect(card).toBeTruthy();
		fireEvent.click(card?.querySelector(".dus-oauth-card-toggle") as Element);
		expect(document.querySelector('[data-account-id="acct-a"]')).toBeTruthy();
		expect(document.querySelector('[data-account-id="acct-b"]')).toBeTruthy();
		expect(screen.getByText(en["oauth.accountSetDefault"])).toBeTruthy();
		expect(screen.getAllByText(en["oauth.accountRemove"]).length).toBeGreaterThan(0);
		expect(screen.getAllByText(new RegExp(en["oauth.accountAdd"])).length).toBeGreaterThan(0);
	});

	it("renders the gateway tab with status, port editor, and key lifecycle controls", () => {
		renderWithClient(<GatewayTab t={t} />);
		expect(screen.getByText(en["gateway.enabled"])).toBeTruthy();
		expect(screen.getByText(en["gateway.portApply"])).toBeTruthy();
		expect(screen.getByText(en["gateway.reveal"])).toBeTruthy();
		expect(screen.getByText(en["gateway.rotate"])).toBeTruthy();
		expect(screen.getByText("127.0.0.1")).toBeTruthy();
		expect(screen.getByText(en["gateway.snippetsKeyHidden"])).toBeTruthy();
		expect(document.querySelector("pre")).toBeNull();
		expect(document.body.textContent).not.toContain('"apiKey":"****abcd"');
	});

	it("renders executable Gateway snippets only with a revealed real key", () => {
		revealedGatewayKey = "dsh-live-test-key";
		renderWithClient(<GatewayTab t={t} />);
		expect(document.querySelector("pre")?.textContent).toContain('"grok-4"');
		expect(document.querySelector("pre")?.textContent).toContain("dsh-live-test-key");
		expect(document.querySelector("pre")?.textContent).not.toContain("****abcd");
	});

	it("reports copy failure when the Clipboard API is unavailable", async () => {
		Object.defineProperty(navigator, "clipboard", { configurable: true, value: undefined });
		renderWithClient(<GatewayTab t={t} />);
		fireEvent.click(screen.getAllByRole("button", { name: en["gateway.copy"] })[0] as HTMLButtonElement);
		expect(await screen.findByText(en["gateway.copyFailed"])).toBeTruthy();
		expect(screen.queryByText(en["gateway.copied"])).toBeNull();
	});

	it("renders the capabilities tab with all seven default-off switches", () => {
		renderWithClient(<CapabilitiesTab t={t} />);
		const switches = document.querySelectorAll('[role="switch"]');
		expect(switches.length).toBe(7);
		for (const element of switches) {
			expect(element.getAttribute("aria-checked")).toBe("false");
		}
		expect(screen.getByText(en["capabilities.codexSearch"])).toBeTruthy();
		expect(screen.getByText(en["capabilities.grokImagineVideo"])).toBeTruthy();
		expect(document.querySelector("[data-codex-speed]")).toBeNull();
	});

	it("shows Codex Speed Standard/Fast hint when codexFast is enabled", () => {
		capabilitiesFixture.value.codexFast = true;
		renderWithClient(<CapabilitiesTab t={t} />);
		expect(document.querySelector('[data-codex-speed="standard-and-fast"]')).toBeTruthy();
		expect(screen.getByText(en["capabilities.codexSpeedTitle"])).toBeTruthy();
		expect(screen.getByText(en["capabilities.codexSpeedPickerHint"])).toBeTruthy();
		capabilitiesFixture.value.codexFast = false;
	});
});
