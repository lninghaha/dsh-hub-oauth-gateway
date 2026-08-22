import type { ClientContext } from "@deepseek-ai/dsh-client-runtime/client";
import type { TranslateNS } from "@deepseek-ai/dsh-client-ui-slots";
import { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { FloatingHud } from "./components/FloatingHud.js";
import { SettingsSection } from "./components/SettingsSection.js";
import { SidebarAction } from "./components/SidebarAction.js";
import { UsageOverlay } from "./components/UsageOverlay.js";
import { LOCALE_NAMESPACE, type Translate } from "./locales.js";

function FallbackEntry({ t }: { readonly t: Translate }) {
	const [open, setOpen] = useState(false);
	const trigger = useRef<HTMLButtonElement>(null);
	const dialog = useRef<HTMLDivElement>(null);
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
				setOpen(false);
				return;
			}
			if (event.key !== "Tab") return;
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
		document.addEventListener("keydown", onKeyDown);
		return () => {
			document.removeEventListener("keydown", onKeyDown);
			for (const state of inertState) {
				if (!state.inert) state.element.removeAttribute("inert");
			}
			trigger.current?.focus();
		};
	}, [open]);
	return (
		<div className="dus-recovery-entry">
			<button
				ref={trigger}
				type="button"
				className="dus-button dus-recovery-button"
				aria-expanded={open}
				aria-controls="dus-recovery-dialog"
				onClick={() => setOpen(true)}
			>
				{t("recovery.open")}
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
								<h2 id="dus-recovery-title">{t("recovery.title")}</h2>
								<p>{t("recovery.message")}</p>
							</div>
							<button ref={closeButton} type="button" className="dus-button is-small" onClick={() => setOpen(false)}>
								{t("action.close")}
							</button>
						</div>
						<SettingsSection close={() => setOpen(false)} t={t as unknown as TranslateNS<"usage-stats">} />
					</div>
				</div>
			) : null}
		</div>
	);
}

type SlotsApi = ClientContext["slots"];

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
		let disposeFallback = this.mountFallback(ctx);
		let disposeSlots = (): void => undefined;
		let slotsInstalled = false;
		let stopped = false;
		const activateSlots = (slotCtx: unknown): (() => void) | undefined => {
			const slots = slotsOf(slotCtx);
			if (slots === undefined) return;
			if (slotsInstalled) return;
			disposeFallback();
			disposeFallback = () => undefined;
			disposeSlots = registerSlots(slotCtx as ClientContext, slots);
			slotsInstalled = true;
			let active = true;
			return () => {
				if (!active) return;
				active = false;
				disposeSlots();
				disposeSlots = () => undefined;
				slotsInstalled = false;
				if (!stopped) disposeFallback = this.mountFallback(ctx);
			};
		};
		ctx.effect(() => () => {
			stopped = true;
			disposeSlots();
			disposeFallback();
		});
		if (slotsOf(ctx) !== undefined) {
			activateSlots(ctx);
			return;
		}
		ctx.inject(["slots"], activateSlots);
	}

	private mountFallback(ctx: ClientContext): () => void {
		if (typeof document === "undefined") return () => undefined;
		const host = document.createElement("div");
		host.className = "dus-recovery-root";
		document.body.append(host);
		const root = createRoot(host);
		root.render(<FallbackEntry t={ctx.locale.bind(LOCALE_NAMESPACE)} />);
		return () => {
			root.unmount();
			host.remove();
		};
	}
}
