/** @vitest-environment jsdom */

import type { ClientContext } from "@deepseek-ai/dsh-client-runtime/client";
import { act, cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DshClientAdapter } from "../../../src/client/DshClientAdapter.js";
import { en } from "../../../src/client/locales.js";

vi.mock("../../../src/client/components/FloatingHud.js", () => ({ FloatingHud: () => null }));
vi.mock("../../../src/client/components/SettingsSection.js", () => ({
	SettingsSection: () => <button type="button">settings-action</button>,
}));
vi.mock("../../../src/client/components/SidebarAction.js", () => ({ SidebarAction: () => null }));
vi.mock("../../../src/client/components/UsageOverlay.js", () => ({ UsageOverlay: () => null }));

function createContext() {
	let onSlots: ((context: unknown) => void) | undefined;
	let dispose: (() => void) | undefined;
	const context = {
		locale: { bind: () => (key: string) => (en as Record<string, string>)[key] ?? key, register: vi.fn() },
		effect: (callback: () => (() => void) | undefined) => {
			dispose = callback();
		},
		inject: (_deps: readonly string[], callback: (context: unknown) => void) => {
			onSlots = callback;
			return {};
		},
	};
	return {
		context: context as unknown as ClientContext,
		activateSlots: (slots: unknown) => onSlots?.(slots),
		shutdown: () => dispose?.(),
	};
}

describe("DshClientAdapter", () => {
	afterEach(() => cleanup());

	it("keeps an accessible standalone entry until the slots capability becomes usable", () => {
		const { context, activateSlots, shutdown } = createContext();
		act(() => new DshClientAdapter().install(context));
		expect(screen.getByRole("button", { name: en["recovery.open"] })).toBeTruthy();

		const register = vi.fn(() => vi.fn());
		act(() =>
			activateSlots({
				...context,
				slots: {
					inject: (_name: string, callback: () => (() => void) | undefined) => {
						callback();
						return vi.fn();
					},
					register,
				},
			}),
		);
		expect(register).toHaveBeenCalledTimes(4);
		expect(screen.queryByRole("button", { name: en["recovery.open"] })).toBeNull();
		shutdown();
	});

	it("does not need slots to present a focusable recovery action", () => {
		const { context, shutdown } = createContext();
		act(() => new DshClientAdapter().install(context));
		const trigger = screen.getByRole("button", { name: en["recovery.open"] });
		fireEvent.click(trigger);
		const dialog = screen.getByRole("dialog", { name: en["recovery.title"] });
		expect(dialog.getAttribute("aria-modal")).toBe("true");
		expect(screen.getByRole("button", { name: "settings-action" })).toBeTruthy();
		const close = screen.getByRole("button", { name: en["action.close"] });
		expect(document.activeElement).toBe(close);
		fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
		expect(document.activeElement).toBe(screen.getByRole("button", { name: "settings-action" }));
		fireEvent.click(close);
		expect(document.activeElement).toBe(trigger);
		shutdown();
	});

	it("registers a direct slots surface without requiring delayed injection", () => {
		let dispose: (() => void) | undefined;
		const register = vi.fn(() => vi.fn());
		const context = {
			locale: { bind: () => (key: string) => (en as Record<string, string>)[key] ?? key },
			effect: (callback: () => (() => void) | undefined) => {
				dispose = callback();
			},
			slots: {
				inject: (_name: string, callback: () => (() => void) | undefined) => {
					callback();
					return vi.fn();
				},
				register,
			},
		} as unknown as ClientContext;
		act(() => new DshClientAdapter().install(context));
		expect(register).toHaveBeenCalledTimes(4);
		expect(screen.queryByRole("button", { name: en["recovery.open"] })).toBeNull();
		dispose?.();
	});

	it("uses Cordis reflection without reading an uninjected slots property", () => {
		let dispose: (() => void) | undefined;
		const register = vi.fn(() => vi.fn());
		const slots = {
			inject: (_name: string, callback: () => (() => void) | undefined) => {
				callback();
				return vi.fn();
			},
			register,
		};
		const target = {
			locale: { bind: () => (key: string) => (en as Record<string, string>)[key] ?? key },
			effect: (callback: () => (() => void) | undefined) => {
				dispose = callback();
			},
			get: (name: string) => (name === "slots" ? slots : undefined),
			inject: vi.fn(),
		};
		const context = new Proxy(target, {
			get(object, property, receiver) {
				if (property === "slots") throw new Error('cannot get property "slots" without inject');
				return Reflect.get(object, property, receiver);
			},
		}) as unknown as ClientContext;

		act(() => new DshClientAdapter().install(context));

		expect(register).toHaveBeenCalledTimes(4);
		expect(target.inject).not.toHaveBeenCalled();
		dispose?.();
	});
});
