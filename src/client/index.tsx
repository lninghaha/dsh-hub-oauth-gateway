import type {} from "@deepseek-ai/dsh-client-locale/client";
import type { ClientContext } from "@deepseek-ai/dsh-client-runtime/client";
import type {} from "@deepseek-ai/dsh-client-ui-layout/client";
import type {} from "@deepseek-ai/dsh-client-ui-settings/client";
import type {} from "@deepseek-ai/dsh-client-ui-sidebar/client";
import type {} from "@deepseek-ai/dsh-client-ui-slots";
import uplotStyles from "uplot/dist/uPlot.min.css";
import { SettingsSection } from "./components/SettingsSection.js";
import { SidebarAction } from "./components/SidebarAction.js";
import { UsageOverlay } from "./components/UsageOverlay.js";
import { en, LOCALE_NAMESPACE, type UsageLocaleKey, zh } from "./locales.js";
import { installStyle } from "./style.js";
import styles from "./styles.css";

export const inject = ["slots", "locale"];

declare module "@deepseek-ai/dsh-client-ui-slots" {
	interface LocaleNamespaceMap {
		"usage-stats": UsageLocaleKey;
	}
}

export function apply(ctx: ClientContext): void {
	ctx.effect(() => installStyle(`${uplotStyles}\n${styles}`), "usage-stats: styles");
	ctx.effect(() => ctx.locale.register(LOCALE_NAMESPACE, { zh, en }), "usage-stats: dictionaries");

	ctx.slots.inject("sidebar.footer.action", () =>
		ctx.slots.register(
			{ name: "sidebar.footer.action", id: "usage-stats", locale: LOCALE_NAMESPACE, order: 10 },
			SidebarAction,
		),
	);
	ctx.slots.inject("shell.overlay", () =>
		ctx.slots.register(
			{ name: "shell.overlay", id: "usage-stats-overlay", locale: LOCALE_NAMESPACE, order: 30 },
			UsageOverlay,
		),
	);
	ctx.slots.inject("settings.section", () =>
		ctx.slots.register(
			{
				name: "settings.section",
				id: "usage-stats",
				order: 80,
				label: () => ctx.locale.bind(LOCALE_NAMESPACE)("settings.nav"),
				locale: LOCALE_NAMESPACE,
			},
			SettingsSection,
		),
	);
}

export { SettingsSection, SidebarAction, UsageOverlay };
