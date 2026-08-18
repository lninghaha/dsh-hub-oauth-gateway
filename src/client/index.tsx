import type {} from "@deepseek-ai/dsh-client-locale/client";
import type { ClientContext } from "@deepseek-ai/dsh-client-runtime/client";
import type {} from "@deepseek-ai/dsh-client-ui-layout/client";
import type {} from "@deepseek-ai/dsh-client-ui-settings/client";
import type {} from "@deepseek-ai/dsh-client-ui-sidebar/client";
import type {} from "@deepseek-ai/dsh-client-ui-slots";
import uplotStyles from "uplot/dist/uPlot.min.css";
import type { GrokBuildSettingsInjected } from "./coding-oauth/GrokBuildSettings.js";
import { GrokBuildSettings } from "./coding-oauth/GrokBuildSettings.js";
import { en as codingOAuthEn, zh as codingOAuthZh, type GrokBuildSettingsKey } from "./coding-oauth/locales.js";
import { SettingsSection } from "./components/SettingsSection.js";
import { SidebarAction } from "./components/SidebarAction.js";
import { UsageOverlay } from "./components/UsageOverlay.js";
import { en, LOCALE_NAMESPACE, type UsageLocaleKey, zh } from "./locales.js";
import { installStyle } from "./style.js";
import styles from "./styles.css";

export const inject = ["slots", "locale"];

const CODING_OAUTH_LOCALE_NAMESPACE = "settings.grok-build";

declare module "@deepseek-ai/dsh-client-ui-slots" {
	interface LocaleNamespaceMap {
		"usage-stats": UsageLocaleKey;
		"settings.grok-build": GrokBuildSettingsKey;
	}
}

export function apply(ctx: ClientContext): void {
	ctx.effect(() => installStyle(`${uplotStyles}\n${styles}`), "usage-stats: styles");
	ctx.effect(() => ctx.locale.register(LOCALE_NAMESPACE, { zh, en }), "usage-stats: dictionaries");
	ctx.effect(
		() => ctx.locale.register(CODING_OAUTH_LOCALE_NAMESPACE, { zh: codingOAuthZh, en: codingOAuthEn }),
		"usage-stats: coding-oauth dictionaries",
	);

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
	ctx.slots.inject("settings.section", () => {
		const t = ctx.locale.bind(CODING_OAUTH_LOCALE_NAMESPACE) as GrokBuildSettingsInjected["t"];
		return ctx.slots.register(
			{
				name: "settings.section",
				id: "grok-build",
				order: 17,
				label: () => t("nav"),
				inject: (): GrokBuildSettingsInjected => ({ t }),
			},
			GrokBuildSettings,
		);
	});
}

export { GrokBuildSettings, SettingsSection, SidebarAction, UsageOverlay };
