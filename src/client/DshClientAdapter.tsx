import type { Context as ClientContext } from "@deepseek-ai/cordis";
import type {} from "@deepseek-ai/dsh-client-locale/client";
import type { TranslateNS } from "@deepseek-ai/dsh-client-ui-slots";
import { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { CODING_OAUTH_PATHS, CodingOAuthWebStatusSchema } from "../shared/coding-oauth.js";
import { registerAccountEntry } from "./account-entry-owner.js";
import { callCodingOAuth } from "./coding-oauth-api.js";
import { FloatingHud } from "./components/FloatingHud.js";
import { AccountSettingsSection, SettingsSection } from "./components/SettingsSection.js";
import { SidebarAction } from "./components/SidebarAction.js";
import { UsageOverlay } from "./components/UsageOverlay.js";
import { SETTINGS_OPEN_EVENT, usageUiController } from "./controller.js";
import { LOCALE_NAMESPACE, type Translate } from "./locales.js";
import type { SettingsTabId } from "./settings-tabs.js";

function FallbackEntry({
	t,
	accountsOnly = false,
	hideTrigger = false,
}: {
	readonly t: Translate;
	readonly accountsOnly?: boolean;
	readonly hideTrigger?: boolean;
}) {
	const [targetTab, setTargetTab] = useState<SettingsTabId>(accountsOnly ? "accounts" : "overview");
	const previousSurface = useRef<"closed" | "peek" | "dashboard">("closed");
	const [open, setOpen] = useState(false);
	const trigger = useRef<HTMLButtonElement>(null);
	const dialog = useRef<HTMLDivElement>(null);
	useEffect(() => {
		const openTarget = (event: Event) => {
			const tab = (event as CustomEvent<{ tab?: SettingsTabId }>).detail?.tab;
			if (!tab || ["accounts", "providers", "capabilities", "gateway"].includes(tab) !== accountsOnly) return;
			if (document.querySelector(`.dus-settings[data-surface="${accountsOnly ? "accounts" : "usage"}"]`)) return;
			previousSurface.current = usageUiController.getSnapshot().surface;
			usageUiController.close();
			setTargetTab(tab);
			setOpen(true);
		};
		window.addEventListener(SETTINGS_OPEN_EVENT, openTarget);
		return () => window.removeEventListener(SETTINGS_OPEN_EVENT, openTarget);
	}, [accountsOnly]);
	const closeButton = useRef<HTMLButtonElement>(null);
	useEffect(() => {
		if (!open) return;
		const root = dialog.current;
		if (root === null) return;
		const recoveryRoot = root.closest(".dus-recovery-root");
		const background = [...document.body.children].filter(
			(element): element is HTMLElement => element instanceof HTMLElement && element !== recoveryRoot,
		);
		const inertState = background.map((element) => ({ element, inert: element.hasAttribute("inert") }));
		for (const { element } of inertState) element.setAttribute("inert", "");
		closeButton.current?.focus();
		const onKeyDown = (event: KeyboardEvent): void => {
			if (event.key === "Escape") {
				event.preventDefault();
				event.stopImmediatePropagation();
				setOpen(false);
				return;
			}
			if (event.key !== "Tab") return;
			event.stopImmediatePropagation();
			const focusable = [
				...root.querySelectorAll<HTMLElement>(
					'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
				),
			].filter((element) => !element.hasAttribute("hidden"));
			if (focusable.length === 0) {
				event.preventDefault();
				return;
			}
			const first = focusable[0];
			const last = focusable.at(-1);
			if (event.shiftKey && document.activeElement === first) {
				event.preventDefault();
				last?.focus();
			} else if (!event.shiftKey && document.activeElement === last) {
				event.preventDefault();
				first?.focus();
			}
		};
		document.addEventListener("keydown", onKeyDown, true);
		return () => {
			document.removeEventListener("keydown", onKeyDown, true);
			for (const state of inertState) {
				if (!state.inert) state.element.removeAttribute("inert");
			}
			trigger.current?.focus();
			if (previousSurface.current === "peek") usageUiController.openPeek();
			if (previousSurface.current === "dashboard") usageUiController.openDashboard();
			previousSurface.current = "closed";
		};
	}, [open]);
	return (
		<div className="dus-recovery-entry">
			<button
				ref={trigger}
				hidden={hideTrigger}
				style={{ display: hideTrigger ? "none" : undefined }}
				type="button"
				className="dus-button dus-recovery-button"
				aria-expanded={open}
				aria-controls="dus-recovery-dialog"
				onClick={() => setOpen(true)}
			>
				{t(accountsOnly ? "settings.accountsTitle" : "recovery.open")}
			</button>
			{open ? (
				<div
					ref={dialog}
					id="dus-recovery-dialog"
					className="dus-recovery-dialog"
					role="dialog"
					aria-modal="true"
					aria-labelledby="dus-recovery-title"
				>
					<div className="dus-recovery-shell">
						<div className="dus-settings-heading">
							<div>
								<h2
									id="dus-recovery-title"
									style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clipPath: "inset(50%)" }}
								>
									{t(accountsOnly ? "settings.accountsTitle" : "settings.title")}
								</h2>
								{hideTrigger ? null : <p>{t("recovery.message")}</p>}
							</div>
							<button ref={closeButton} type="button" className="dus-button is-small" onClick={() => setOpen(false)}>
								{t("action.close")}
							</button>
						</div>
						<SettingsSection
							surface={accountsOnly ? "accounts" : "usage"}
							initialTab={targetTab}
							close={() => {
								previousSurface.current = "closed";
								setOpen(false);
							}}
							t={t as unknown as TranslateNS<"usage-stats">}
						/>
					</div>
				</div>
			) : null}
		</div>
	);
}

/** Minimal slots surface used by this plugin (host may or may not expose it). */
type SlotsApi = {
	inject(name: string, factory: () => (() => void) | undefined): () => void;
	register(entry: Record<string, unknown>, component: unknown): () => void;
};

function slotsOf(context: unknown): SlotsApi | undefined {
	if (typeof context !== "object" || context === null) return undefined;
	let slots: unknown;
	try {
		const get = (context as { get?: unknown }).get;
		if (typeof get === "function") slots = get.call(context, "slots");
	} catch {
		// An older client may not expose the Cordis reflection helper.
	}
	if (slots === undefined) {
		try {
			slots = (context as { slots?: unknown }).slots;
		} catch {
			// Strict Cordis rejects optional service reads outside an inject scope.
		}
	}
	if (
		typeof slots === "object" &&
		slots !== null &&
		typeof (slots as { inject?: unknown }).inject === "function" &&
		typeof (slots as { register?: unknown }).register === "function"
	)
		return slots as SlotsApi;
	return undefined;
}

function registerSlots(ctx: ClientContext, slots: SlotsApi): () => void {
	const disposers = [
		slots.inject("sidebar.footer.action", () =>
			slots.register(
				{ name: "sidebar.footer.action", id: "usage-stats", locale: LOCALE_NAMESPACE, order: 10 },
				SidebarAction,
			),
		),
		slots.inject("shell.overlay", () =>
			slots.register(
				{ name: "shell.overlay", id: "usage-stats-overlay", locale: LOCALE_NAMESPACE, order: 30 },
				UsageOverlay,
			),
		),
		slots.inject("shell.overlay", () =>
			slots.register(
				{ name: "shell.overlay", id: "usage-stats-hud", locale: LOCALE_NAMESPACE, order: 25 },
				FloatingHud,
			),
		),
		slots.inject("settings.section", () =>
			slots.register(
				{
					name: "settings.section",
					id: "usage-stats",
					order: 80,
					label: () => ctx.locale.bind(LOCALE_NAMESPACE)("settings.nav"),
					locale: LOCALE_NAMESPACE,
				},
				SettingsSection,
			),
		),
	];
	return () => {
		for (const dispose of disposers.reverse()) dispose();
	};
}

/**
 * Keeps the plugin loadable when an older DSH client has locale but not the
 * optional slots service. Once slots become available, its normal entries
 * replace the standalone recovery control.
 */
export class DshClientAdapter {
	install(ctx: ClientContext): void {
		const bridge = this.mountBridge(ctx);
		let disposeSlots = (): void => undefined;
		let slotsInstalled = false;
		let stopped = false;
		const activateSlots = (slotCtx: unknown): (() => void) | undefined => {
			const slots = slotsOf(slotCtx);
			if (slots === undefined) return;
			if (slotsInstalled) return;
			bridge.setVisible(false);
			disposeSlots = registerSlots(slotCtx as ClientContext, slots);
			slotsInstalled = true;
			let active = true;
			return () => {
				if (!active) return;
				active = false;
				disposeSlots();
				disposeSlots = () => undefined;
				slotsInstalled = false;
				if (!stopped) bridge.setVisible(true);
			};
		};
		ctx.effect(() => () => {
			stopped = true;
			disposeSlots();
			bridge.dispose();
		});
		if (slotsOf(ctx) !== undefined) {
			activateSlots(ctx);
			return;
		}
		ctx.inject(["slots"], activateSlots);
	}

	installAccountEntry(ctx: ClientContext): void {
		const stop = registerAccountEntry(ctx, {
			role: "hub",
			readOwner: async () => (await callCodingOAuth(CODING_OAUTH_PATHS.status, CodingOAuthWebStatusSchema)).uiOwner,
			mount: (failed) => {
				const bridge = this.mountBridge(ctx, true);
				let disposed = false;
				const child = ctx.inject(["slots"], (scope) => {
					const slots = slotsOf(scope);
					if (!slots) return;
					scope.effect(() =>
						slots.inject("settings.section", () => {
							try {
								const release = slots.register(
									{
										name: "settings.section",
										id: "coding-accounts",
										order: 17,
										label: () => ctx.locale.bind(LOCALE_NAMESPACE)("settings.accountsTitle"),
										locale: LOCALE_NAMESPACE,
									},
									AccountSettingsSection,
								);
								bridge.setVisible(false);
								return () => {
									release();
									if (!disposed) bridge.setVisible(true);
								};
							} catch {
								queueMicrotask(failed);
								return undefined;
							}
						}),
					);
				});
				void Promise.resolve(child).catch(failed);
				return () => {
					disposed = true;
					child.dispose();
					bridge.dispose();
				};
			},
		});
		ctx.effect(() => stop, "usage-stats: accounts entry lifecycle");
	}
	private mountBridge(
		ctx: ClientContext,
		accountsOnly = false,
	): { setVisible: (visible: boolean) => void; dispose: () => void } {
		if (typeof document === "undefined") return { setVisible: () => undefined, dispose: () => undefined };
		const host = document.createElement("div");
		host.className = "dus-recovery-root";
		document.body.append(host);
		const root = createRoot(host);
		const setVisible = (visible: boolean) =>
			root.render(
				<FallbackEntry t={ctx.locale.bind(LOCALE_NAMESPACE)} accountsOnly={accountsOnly} hideTrigger={!visible} />,
			);
		setVisible(true);
		return {
			setVisible,
			dispose: () => {
				root.unmount();
				host.remove();
			},
		};
	}
}
