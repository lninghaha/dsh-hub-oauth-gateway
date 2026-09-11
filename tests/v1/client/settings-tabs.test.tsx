/** @vitest-environment jsdom */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { preferencePatch, SettingsSection } from "../../../src/client/components/SettingsSection.js";
import { en } from "../../../src/client/locales.js";
import { defaultUserPreferences } from "../../../src/shared/preferences.js";

const mocks = vi.hoisted(() => ({
	preferences: {} as ReturnType<typeof defaultUserPreferences>,
	revision: 0,
	patchError: null as Error | null,
	latestPreferences: {} as ReturnType<typeof defaultUserPreferences>,
	latestRevision: 1,
	patch: vi.fn(),
	refetch: vi.fn(),
}));

vi.mock("../../../src/client/queries.js", async () => {
	const actual = await vi.importActual<typeof import("../../../src/client/queries.js")>(
		"../../../src/client/queries.js",
	);
	return {
		...actual,
		usePreferencesStateQuery: () => ({
			data: { ok: true as const, data: { preferences: mocks.preferences, revision: mocks.revision } },
			isPending: false,
			error: null,
			refetch: mocks.refetch,
		}),
		useAccountsQuery: () => ({
			data: { ok: true as const, data: { accounts: [] } },
			isPending: false,
			error: null,
		}),
		usePatchPreferencesMutation: () => ({
			mutate: (
				input: unknown,
				options?: {
					onError?: (error: Error) => void;
					onSuccess?: (value: {
						ok: true;
						data: { preferences: ReturnType<typeof defaultUserPreferences>; revision: number };
					}) => void;
				},
			) => {
				mocks.patch(input);
				if (mocks.patchError !== null) options?.onError?.(mocks.patchError);
				else {
					options?.onSuccess?.({
						ok: true,
						data: { preferences: mocks.latestPreferences, revision: mocks.latestRevision },
					});
				}
			},
			isPending: false,
			isSuccess: mocks.patchError === null && mocks.patch.mock.calls.length > 0,
			error: mocks.patchError,
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

vi.mock("../../../src/client/components/oauth/AccountsTab.js", () => ({
	AccountsTab: () => <div data-settings-tab="accounts">accounts-panel</div>,
}));

vi.mock("../../../src/client/components/oauth/CapabilitiesTab.js", () => ({
	CapabilitiesTab: () => <div data-testid="oauth-capabilities">capabilities-panel</div>,
}));

function translate(key: string): string {
	return (en as Record<string, string>)[key] ?? key;
}

function renderSettings(): ReturnType<typeof render> {
	const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
	const wrap = ({ children }: { children: ReactNode }) => (
		<QueryClientProvider client={client}>{children}</QueryClientProvider>
	);
	return render(<SettingsSection close={vi.fn()} t={translate as never} />, { wrapper: wrap });
}

describe("settings section tabs", () => {
	afterEach(() => {
		cleanup();
	});

	beforeEach(() => {
		vi.clearAllMocks();
		sessionStorage.clear();
		mocks.preferences = defaultUserPreferences("UTC");
		mocks.revision = 0;
		mocks.latestPreferences = defaultUserPreferences("UTC");
		mocks.latestRevision = 1;
		mocks.patchError = null;
		mocks.refetch.mockImplementation(() =>
			Promise.resolve({
				data: {
					ok: true as const,
					data: { preferences: mocks.latestPreferences, revision: mocks.latestRevision },
				},
			}),
		);
	});

	it("builds a patch for every edited preference section", () => {
		const baseline = defaultUserPreferences("UTC");
		const draft = {
			...baseline,
			display: { ...baseline.display, density: "compact" as const },
			providers: { ...baseline.providers, hidden: ["codex"] },
			privacy: { ...baseline.privacy, redactExports: false },
			alerts: { ...baseline.alerts, enabled: false },
		};
		expect(preferencePatch(baseline, draft)).toEqual({
			display: draft.display,
			providers: draft.providers,
			privacy: draft.privacy,
			alerts: draft.alerts,
		});
	});

	it("defaults to accounts and keeps diagnostics out of the first view", () => {
		renderSettings();
		expect(document.querySelector('[data-settings-tab="accounts"]')).toBeTruthy();
		expect(document.querySelector('[data-settings-tab="display"]')).toBeNull();
		expect(screen.queryByText(en["compatibility.title"])).toBeNull();
		expect(document.querySelector('[data-settings-tab="providers"]')).toBeNull();

		fireEvent.click(screen.getByRole("button", { name: en["settings.tab.providers"] }));
		expect(document.querySelector('[data-settings-tab="accounts"]')).toBeNull();
		expect(document.querySelector('[data-settings-tab="providers"]')).toBeTruthy();
		expect(screen.getByTestId("provider-management")).toBeTruthy();
	});

	it("loads diagnostics only from the advanced capabilities tab", () => {
		renderSettings();
		fireEvent.click(screen.getByRole("button", { name: en["settings.tab.capabilities"] }));
		expect(screen.getByText(en["compatibility.title"])).toBeTruthy();
	});

	it("keeps the draft revision across background refresh and resolves a settings conflict explicitly", async () => {
		mocks.patchError = Object.assign(new Error("settings changed; reload and retry"), {
			code: "settings-conflict",
		});
		mocks.latestPreferences = {
			...mocks.preferences,
			privacy: { ...mocks.preferences.privacy, redactExports: false },
		};
		mocks.latestRevision = 4;
		const view = renderSettings();
		fireEvent.click(screen.getByRole("button", { name: en["settings.tab.display"] }));
		fireEvent.change(screen.getByLabelText(en["settings.density"]), { target: { value: "compact" } });
		mocks.revision = 3;
		mocks.preferences = mocks.latestPreferences;
		view.rerender(<SettingsSection close={vi.fn()} t={translate as never} />);
		fireEvent.click(screen.getByRole("button", { name: en["settings.save"] }));

		expect(mocks.patch).toHaveBeenCalledWith(
			expect.objectContaining({
				expectedRevision: 0,
				patch: { display: expect.objectContaining({ density: "compact" }) },
			}),
		);
		await waitFor(() => expect(screen.getByRole("alert").textContent).toContain(en["settings.conflictNoOverlap"]));
		expect((screen.getByLabelText(en["settings.density"]) as HTMLSelectElement).value).toBe("compact");
		mocks.patchError = null;
		fireEvent.click(screen.getByRole("button", { name: en["settings.keepLocal"] }));
		expect(mocks.refetch).toHaveBeenCalledTimes(1);
		expect(mocks.patch).toHaveBeenLastCalledWith(
			expect.objectContaining({
				expectedRevision: 4,
				patch: { display: expect.objectContaining({ density: "compact" }) },
			}),
		);
	});
});
