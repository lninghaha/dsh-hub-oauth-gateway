/** @vitest-environment jsdom */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SettingsSection } from "../../../src/client/components/SettingsSection.js";
import { en } from "../../../src/client/locales.js";
import { defaultUserPreferences } from "../../../src/shared/preferences.js";

vi.mock("../../../src/client/queries.js", async () => {
	const actual = await vi.importActual<typeof import("../../../src/client/queries.js")>(
		"../../../src/client/queries.js",
	);
	return {
		...actual,
		usePreferencesQuery: () => ({
			data: { ok: true as const, data: defaultUserPreferences("UTC") },
			isPending: false,
			error: null,
		}),
		useAccountsQuery: () => ({
			data: { ok: true as const, data: { accounts: [] } },
			isPending: false,
			error: null,
		}),
		useSavePreferencesMutation: () => ({
			mutate: vi.fn(),
			isPending: false,
			isSuccess: false,
		}),
		useCompatibilityQuery: () => ({
			data: {
				ok: true as const,
				data: {
					coreAbi: "dsh-coding-oauth-core/v1" as const,
					dshVersion: "0.1.0",
					status: "healthy" as const,
					uiOwner: "hub" as const,
					accessMode: "loopback" as const,
					capabilities: {},
					diagnostics: [],
				},
			},
			isPending: false,
			error: null,
			refetch: vi.fn(),
		}),
		useFeesQuery: () => ({
			data: { ok: true as const, data: { fees: [] } },
			isPending: false,
			error: null,
		}),
		useSaveFeesMutation: () => ({
			mutate: vi.fn(),
			isPending: false,
			isSuccess: false,
		}),
		useCredentialQuery: () => ({
			data: { ok: true as const, data: { credentials: [] } },
			isPending: false,
			error: null,
		}),
		useSetCredentialMutation: () => ({ mutate: vi.fn(), isPending: false }),
		useUnsetCredentialMutation: () => ({ mutate: vi.fn(), isPending: false }),
		useCredentialImportMutation: () => ({ mutate: vi.fn(), isPending: false }),
		useDeviceCodeMutation: () => ({ mutate: vi.fn(), isPending: false, data: undefined }),
		useDevicePollMutation: () => ({ mutate: vi.fn(), isPending: false }),
		usePricingQuery: () => ({
			data: { ok: true as const, data: { rules: [], catalogUpdatedAt: null } },
			isPending: false,
			error: null,
		}),
		useSavePricingMutation: () => ({ mutate: vi.fn(), isPending: false, isSuccess: false }),
	};
});

vi.mock("../../../src/client/coding-oauth-api.js", () => ({
	useCodingOAuthStatusQuery: () => ({ data: { providers: {} }, isPending: false, error: null }),
	useGatewayStatusQuery: () => ({
		data: { enabled: false, keyAvailable: false },
		isPending: false,
		error: null,
	}),
}));

vi.mock("../../../src/client/components/ProviderManagement.js", () => ({
	ProviderManagement: () => <div data-testid="provider-management">providers-panel</div>,
}));

function translate(key: string): string {
	return (en as Record<string, string>)[key] ?? key;
}

function renderSettings(): void {
	const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
	const wrap = ({ children }: { children: ReactNode }) => (
		<QueryClientProvider client={client}>{children}</QueryClientProvider>
	);
	render(<SettingsSection close={vi.fn()} t={translate as never} />, { wrapper: wrap });
}

describe("settings section tabs", () => {
	afterEach(() => {
		cleanup();
	});

	beforeEach(() => {
		vi.clearAllMocks();
		sessionStorage.clear();
	});

	it("defaults to the display panel and unmounts it when switching away", () => {
		renderSettings();
		expect(document.querySelector('[data-settings-tab="display"]')).toBeTruthy();
		expect(screen.getByText(en["settings.display"])).toBeTruthy();
		expect(document.querySelector('[data-settings-tab="providers"]')).toBeNull();

		fireEvent.click(screen.getByRole("button", { name: en["settings.tab.providers"] }));
		expect(document.querySelector('[data-settings-tab="display"]')).toBeNull();
		expect(document.querySelector('[data-settings-tab="providers"]')).toBeTruthy();
		expect(screen.getByTestId("provider-management")).toBeTruthy();
	});

	it("exposes entry-mode control and heading fallbacks for Peek and the dashboard", () => {
		renderSettings();
		expect(screen.getByText(en["settings.entryMode"])).toBeTruthy();
		expect(screen.getByRole("button", { name: en["settings.openPeek"] })).toBeTruthy();
		expect(screen.getByRole("button", { name: en["settings.preview"] })).toBeTruthy();
		expect(screen.getByText(en["compatibility.title"])).toBeTruthy();
	});

	it("lets users finish the optional Gateway onboarding step without enabling it", () => {
		renderSettings();
		expect(screen.getByText("0 of 3 complete")).toBeTruthy();
		fireEvent.click(screen.getByRole("button", { name: en["onboarding.gateway.skip"] }));
		expect(screen.getByText("1 of 3 complete")).toBeTruthy();
		expect(localStorage.getItem("dsh.usage-stats.onboarding.gateway-not-needed")).toBe("1");
	});
});
