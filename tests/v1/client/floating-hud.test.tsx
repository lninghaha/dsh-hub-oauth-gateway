/** @vitest-environment jsdom */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FloatingHud } from "../../../src/client/components/FloatingHud.js";
import { SidebarAction } from "../../../src/client/components/SidebarAction.js";
import { en } from "../../../src/client/locales.js";
import type { AccountSnapshot } from "../../../src/shared/domain.js";
import { defaultUserPreferences, type UserPreferences } from "../../../src/shared/preferences.js";

const openPeek = vi.fn();

vi.mock("../../../src/client/controller.js", () => ({
	usageUiController: {
		openPeek: (...args: unknown[]) => openPeek(...args),
		openDashboard: vi.fn(),
		close: vi.fn(),
	},
}));

let preferences: UserPreferences = defaultUserPreferences("UTC");

const account: AccountSnapshot = {
	providerId: "provider-a",
	profileId: "",
	displayName: "Grok",
	adapterId: "fixture",
	mode: "subscription",
	status: "ok",
	configured: true,
	fetchedAt: 1_000,
	stale: false,
	plan: "Pro",
	balance: null,
	windows: [
		{
			id: "rolling-five",
			kind: "rolling",
			label: "Five hour",
			unit: "percent",
			used: null,
			remaining: null,
			limit: null,
			usedRatio: 0.4,
			resetsAt: Date.now() + 3_600_000,
			rolling: true,
		},
	],
	missingCredentials: [],
	warningCode: null,
};

vi.mock("../../../src/client/queries.js", async () => {
	const actual = await vi.importActual<typeof import("../../../src/client/queries.js")>(
		"../../../src/client/queries.js",
	);
	return {
		...actual,
		usePreferencesQuery: () => ({
			data: { ok: true as const, data: preferences },
			isPending: false,
			error: null,
		}),
		useSavePreferencesMutation: () => ({
			mutate: vi.fn(),
			isPending: false,
			isSuccess: false,
		}),
		useOverviewQuery: () => ({
			data: {
				ok: true as const,
				data: {
					current: {
						inputTokens: 100,
						outputTokens: 20,
						cacheReadTokens: 0,
						cacheWriteTokens: 0,
					},
					cost: { amount: 1.25, currency: "USD", coverageRatio: 1, estimated: true },
					alertCount: 2,
					previous: null,
					delta: null,
				},
			},
			isPending: false,
			error: null,
		}),
		useAccountsQuery: () => ({
			data: { ok: true as const, data: { accounts: [account] } },
			isPending: false,
			error: null,
		}),
	};
});

function translate(key: string, params?: Readonly<Record<string, string | number>>): string {
	let value = (en as Record<string, string>)[key] ?? key;
	if (params !== undefined) {
		for (const [name, replacement] of Object.entries(params)) {
			value = value.replaceAll(`{${name}}`, String(replacement));
		}
	}
	return value;
}

function renderNode(node: ReactNode): void {
	const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
	render(<QueryClientProvider client={client}>{node}</QueryClientProvider>);
}

describe("entry surface modes", () => {
	afterEach(() => {
		cleanup();
	});

	beforeEach(() => {
		openPeek.mockClear();
		preferences = {
			...defaultUserPreferences("UTC"),
			display: {
				...defaultUserPreferences("UTC").display,
				entryMode: "floating",
				hudPosition: { left: 40, top: 50 },
			},
		};
	});

	it("renders the floating HUD with quota blocks and opens Peek on click", () => {
		renderNode(<FloatingHud t={translate as never} />);
		const hud = screen.getByRole("button", { name: en["hud.openPeek"] });
		expect(hud.className).toContain("dus-hud");
		expect(screen.getByText("Grok")).toBeTruthy();
		expect(screen.getByText("60%")).toBeTruthy();
		fireEvent.click(hud);
		expect(openPeek).toHaveBeenCalledTimes(1);
	});

	it("hides the floating HUD when entryMode is sidebar", () => {
		preferences = {
			...preferences,
			display: { ...preferences.display, entryMode: "sidebar" },
		};
		const { container } = render(
			<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
				<FloatingHud t={translate as never} />
			</QueryClientProvider>,
		);
		expect(container.querySelector(".dus-hud")).toBeNull();
	});

	it("only mounts the sidebar footer button in sidebar mode", () => {
		const { rerender, container } = render(
			<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
				<SidebarAction wide t={translate as never} />
			</QueryClientProvider>,
		);
		expect(container.querySelector(".dus-sidebar-button")).toBeNull();

		preferences = {
			...preferences,
			display: { ...preferences.display, entryMode: "sidebar" },
		};
		rerender(
			<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
				<SidebarAction wide t={translate as never} />
			</QueryClientProvider>,
		);
		expect(container.querySelector(".dus-sidebar-button")).toBeTruthy();
	});

	it("treats drag moves as position updates instead of opening Peek", () => {
		renderNode(<FloatingHud t={translate as never} />);
		const hud = screen.getByRole("button", { name: en["hud.openPeek"] });
		fireEvent.pointerDown(hud, { button: 0, clientX: 10, clientY: 10, pointerId: 2 });
		fireEvent.pointerMove(hud, { button: 0, clientX: 40, clientY: 50, pointerId: 2 });
		fireEvent.pointerUp(hud, { button: 0, clientX: 40, clientY: 50, pointerId: 2 });
		fireEvent.click(hud);
		expect(openPeek).not.toHaveBeenCalled();
	});
});
