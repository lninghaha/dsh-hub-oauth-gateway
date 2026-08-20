/** @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ProviderManagement } from "../../../src/client/components/ProviderManagement.js";
import { en } from "../../../src/client/locales.js";
import { defaultUserPreferences } from "../../../src/shared/preferences.js";
import type { ProviderRecord, ProvidersData } from "../../../src/shared/providers.js";

const mocks = vi.hoisted(() => ({
	providersData: undefined as ProvidersData | undefined,
	hidden: [] as string[],
	savePreferences: vi.fn(),
	setCredential: vi.fn(),
	unsetCredential: vi.fn(),
	refresh: vi.fn(),
	deviceCode: vi.fn(),
	devicePoll: vi.fn(),
}));

vi.mock("../../../src/client/queries.js", () => ({
	useProvidersQuery: () => ({
		data: mocks.providersData === undefined ? undefined : { ok: true as const, data: mocks.providersData },
		isError: false,
		error: null,
	}),
	usePreferencesQuery: () => {
		const preferences = defaultUserPreferences("UTC");
		preferences.providers.hidden = [...mocks.hidden];
		return { data: { ok: true as const, data: preferences } };
	},
	useSavePreferencesMutation: () => ({ mutate: mocks.savePreferences, isPending: false }),
	useSetCredentialMutation: () => ({ mutate: mocks.setCredential, isPending: false, error: null }),
	useUnsetCredentialMutation: () => ({ mutate: mocks.unsetCredential, isPending: false, error: null }),
	useRefreshMutation: () => ({ mutate: mocks.refresh, isPending: false }),
	useDeviceCodeMutation: () => ({ mutate: mocks.deviceCode, isPending: false, data: undefined, error: null }),
	useDevicePollMutation: () => ({ mutate: mocks.devicePoll, isPending: false, data: undefined, error: null }),
}));

function record(overrides: Partial<ProviderRecord> = {}): ProviderRecord {
	return {
		id: "zai",
		displayName: "Z.ai",
		route: "zai",
		connection: "unconfigured",
		authSource: "api-key",
		tokenLifecycle: "none",
		modelState: "unknown",
		quotaState: "unlinked",
		credentials: [],
		accountProviderId: "zai",
		capabilities: {
			canRefresh: true,
			canDisconnect: false,
			supportsOAuth: false,
			supportsModelSelection: false,
			supportsQuota: true,
		},
		lastSuccessfulAt: null,
		lastAttemptAt: null,
		warnings: [],
		...overrides,
	};
}

function providersData(providers: ProviderRecord[]): ProvidersData {
	return {
		schemaVersion: 1,
		summary: {
			total: providers.length,
			connected: providers.filter((provider) => provider.connection === "connected").length,
			needsAttention: 0,
			unconfigured: providers.filter((provider) => provider.connection === "unconfigured").length,
			withQuota: 0,
		},
		providers,
	};
}

function translate(key: string): string {
	return (en as Record<string, string>)[key] ?? key;
}

function renderPanel(providers: ProviderRecord[], onOpenAccounts = vi.fn()): ReturnType<typeof vi.fn> {
	mocks.providersData = providersData(providers);
	render(<ProviderManagement t={translate as never} onOpenAccounts={onOpenAccounts} />);
	return onOpenAccounts;
}

describe("provider management maintenance", () => {
	afterEach(() => {
		cleanup();
	});

	beforeEach(() => {
		vi.clearAllMocks();
		mocks.hidden = [];
	});

	it("keeps the Subscriptions CTA visible for signed-out OAuth providers", () => {
		const onOpenAccounts = renderPanel([
			record({
				id: "codex-oauth",
				displayName: "OpenAI Codex",
				route: "codex-oauth",
				authSource: "oauth",
				accountProviderId: "codex",
				capabilities: {
					canRefresh: true,
					canDisconnect: false,
					supportsOAuth: true,
					supportsModelSelection: true,
					supportsQuota: true,
				},
				credentials: [
					{ label: "Codex", ref: "CODEX_ACCESS_TOKEN", configured: false, source: "oauth", writable: true },
				],
			}),
		]);
		expect(screen.getByText(en["providers.next.oauth"])).toBeTruthy();
		const cta = screen.getByRole("button", { name: en["providers.openAccounts"] });
		fireEvent.click(cta);
		expect(onOpenAccounts).toHaveBeenCalledTimes(1);
		// OAuth-managed credentials render status only, never an inline editor.
		expect(screen.getByText("CODEX_ACCESS_TOKEN")).toBeTruthy();
		expect(screen.getByText(en["providers.credentialOAuthManaged"])).toBeTruthy();
		expect(document.querySelector('[data-credential-ref="CODEX_ACCESS_TOKEN"] input')).toBeNull();
	});

	it("saves and clears API keys inline from the provider card", () => {
		renderPanel([
			record({
				credentials: [{ label: "Z.ai", ref: "ZAI_API_KEY", configured: true, source: "api-key", writable: true }],
			}),
		]);
		const input = screen.getByLabelText(`ZAI_API_KEY · ${en["credential.value"]}`);
		fireEvent.change(input, { target: { value: " sk-test-123 " } });
		fireEvent.click(screen.getByRole("button", { name: en["credential.save"] }));
		expect(mocks.setCredential).toHaveBeenCalledWith({ ref: "ZAI_API_KEY", value: "sk-test-123" }, expect.anything());
		fireEvent.click(screen.getByRole("button", { name: en["credential.remove"] }));
		expect(mocks.unsetCredential).toHaveBeenCalledWith("ZAI_API_KEY");
	});

	it("targets the linked account when refreshing one provider", () => {
		renderPanel([
			record({
				id: "codex-oauth",
				authSource: "oauth",
				accountProviderId: "codex",
				capabilities: {
					canRefresh: true,
					canDisconnect: true,
					supportsOAuth: true,
					supportsModelSelection: true,
					supportsQuota: true,
				},
			}),
		]);
		fireEvent.click(screen.getByRole("button", { name: en["providers.refreshNow"] }));
		expect(mocks.refresh).toHaveBeenCalledWith({ scope: "accounts", providerIds: ["codex"] });
	});

	it("writes dashboard visibility with the account provider id and clears stale route ids", () => {
		mocks.hidden = ["codex-oauth"];
		renderPanel([
			record({
				id: "codex-oauth",
				displayName: "OpenAI Codex",
				authSource: "oauth",
				accountProviderId: "codex",
			}),
		]);
		const toggle = screen.getByRole("switch", { name: "Show {name} on the dashboard" });
		// A stale route-id entry still counts as hidden.
		expect(toggle.getAttribute("aria-checked")).toBe("false");
		fireEvent.click(toggle);
		expect(mocks.savePreferences).toHaveBeenCalledTimes(1);
		const saved = mocks.savePreferences.mock.calls[0]?.[0] as { providers: { hidden: string[] } };
		expect(saved.providers.hidden).toEqual([]);
	});

	it("hides a provider under its account id so the dashboard filter matches", () => {
		renderPanel([record({ id: "codex-oauth", authSource: "oauth", accountProviderId: "codex" })]);
		const toggle = screen.getByRole("switch", { name: "Show {name} on the dashboard" });
		expect(toggle.getAttribute("aria-checked")).toBe("true");
		fireEvent.click(toggle);
		const saved = mocks.savePreferences.mock.calls[0]?.[0] as { providers: { hidden: string[] } };
		expect(saved.providers.hidden).toEqual(["codex"]);
	});

	it("offers device authorization on the Copilot card", () => {
		renderPanel([
			record({
				id: "copilot",
				displayName: "GitHub Copilot",
				route: "copilot-device",
				accountProviderId: "copilot",
				credentials: [
					{ label: "Copilot", ref: "GITHUB_COPILOT_TOKEN", configured: false, source: "api-key", writable: true },
				],
			}),
		]);
		fireEvent.click(screen.getByRole("button", { name: en["credential.start"] }));
		expect(mocks.deviceCode).toHaveBeenCalledWith("copilot");
	});
});
