/** @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AccountsTab } from "../../../src/client/components/oauth/AccountsTab.js";
import { en, translator } from "../../../src/client/locales.js";

let previewData: Record<string, unknown> | undefined;
let commitData: Record<string, unknown> | undefined;
const previewMutate = vi.fn();
const previewReset = vi.fn();
const commitMutate = vi.fn();
const commitReset = vi.fn();
const cancelMutate = vi.fn();

vi.mock("../../../src/client/coding-oauth-api.js", () => ({
	useCodingOAuthStatusQuery: () => ({ data: statusFixture, error: null, isPending: false }),
	useCodingOAuthLoginMutation: () => ({ mutate: vi.fn(), isPending: false, error: null }),
	useCodingOAuthCodeMutation: () => ({ mutate: vi.fn(), isPending: false, error: null }),
	useCodingOAuthCancelMutation: () => ({ mutate: vi.fn(), isPending: false, error: null }),
	useCodingOAuthLogoutMutation: () => ({ mutate: vi.fn(), isPending: false, error: null }),
	useCodingOAuthModelsMutation: () => ({ mutate: vi.fn(), isPending: false, isSuccess: false, error: null }),
	useCodingOAuthSetActiveAccountMutation: () => ({ mutate: vi.fn(), isPending: false, error: null }),
	useCodingOAuthRemoveAccountMutation: () => ({ mutate: vi.fn(), isPending: false, error: null }),
	useOAuthSourcesQuery: () => ({
		data: { sources: [{ kind: "claude", displayPath: "~/.claude/.credentials.json", available: true }] },
		error: null,
		isPending: false,
	}),
	useOAuthSourcePreviewMutation: () => ({
		mutate: previewMutate,
		isPending: false,
		data: previewData,
		error: null,
		reset: previewReset,
	}),
	useOAuthSourceCommitMutation: () => ({
		mutate: commitMutate,
		isPending: false,
		data: commitData,
		error: null,
		reset: commitReset,
	}),
	useOAuthSourceCancelMutation: () => ({ mutate: cancelMutate, isPending: false }),
}));

const statusFixture = {
	providers: {
		grok: { status: "signed-out", grokImportAvailable: false },
		codex: {
			provider: "codex",
			route: "codex-oauth",
			displayName: "OpenAI Codex",
			loginMethods: ["device"],
			models: [],
			available: [],
			selected: [],
			status: "signed-out",
		},
		kimi: {
			provider: "kimi",
			route: "kimi-code-oauth",
			displayName: "Kimi Code",
			loginMethods: ["device"],
			models: [],
			available: [],
			selected: [],
			status: "signed-out",
		},
		claude: {
			provider: "claude",
			route: "claude-code-oauth",
			displayName: "Claude Code",
			loginMethods: ["browser"],
			models: [],
			available: [],
			selected: [],
			status: "signed-out",
		},
	},
	antigravity: { installed: false, route: "agy", management: "cli" },
};

const previewFixture = {
	previewId: "preview-1",
	kind: "claude",
	displayPath: "~/.claude/.credentials.json",
	expiresAt: 10,
	ticketExpiresAt: 10,
	conflict: "none",
	action: "import",
	warnings: [],
	confirmOverwriteRequired: false,
};

const t = translator(((key: string) => (en as Record<string, string>)[key] ?? key) as never);

describe("AccountsTab CLI pull state", () => {
	beforeEach(() => {
		previewData = previewFixture;
		commitData = { action: "imported", displayPath: previewFixture.displayPath, expiresAt: 10, warnings: [] };
		previewMutate.mockImplementation(() => {
			previewData = previewFixture;
		});
		previewReset.mockImplementation(() => {
			previewData = undefined;
		});
		commitReset.mockImplementation(() => {
			commitData = undefined;
		});
	});

	afterEach(() => {
		cleanup();
		vi.clearAllMocks();
	});

	it("resets a completed commit when closing or opening another preview", () => {
		const rendered = render(<AccountsTab t={t} />);
		const card = document.querySelector('[data-oauth-provider="claude"]');
		fireEvent.click(card?.querySelector(".dus-oauth-card-toggle") as Element);
		expect(screen.getByText(en["oauth.importDone.imported"])).toBeTruthy();

		fireEvent.click(screen.getByRole("button", { name: en["action.close"] }));
		expect(commitReset).toHaveBeenCalledTimes(1);
		expect(previewReset).toHaveBeenCalledTimes(1);
		expect(cancelMutate).toHaveBeenCalledWith(previewFixture.previewId);

		rendered.rerender(<AccountsTab t={t} />);
		fireEvent.click(screen.getByRole("button", { name: en["oauth.importPull"] }));
		expect(commitReset).toHaveBeenCalledTimes(2);
		expect(previewMutate).toHaveBeenCalledWith("claude");
		rendered.rerender(<AccountsTab t={t} />);
		expect(screen.getByRole("button", { name: en["oauth.importCommit"] })).toBeTruthy();
		fireEvent.click(screen.getByRole("button", { name: en["oauth.importCommit"] }));
		expect(commitMutate).toHaveBeenCalledWith({ kind: "claude", previewId: previewFixture.previewId });
	});
});
